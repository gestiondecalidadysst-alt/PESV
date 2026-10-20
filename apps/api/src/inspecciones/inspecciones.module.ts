import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { inspeccionSchema, plantillaParaTipo, type InspeccionInput } from '@pesv/shared';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import {
  Miembro,
  OrgActual,
  Permiso,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { drivers, inspectionItems, inspections, vehicles } from '../db/schema.js';
import { EventosService } from '../eventos/eventos.service.js';

export type ResultadoInspeccion = 'apto' | 'falla_menor' | 'falla_critica';

/** Ganchos que otros módulos registran para reaccionar a un preoperacional (p. ej. mantenimiento). */
export type ReaccionInspeccion = (
  tx: TenantTx,
  datos: { orgId: string; inspeccionId: string; vehiculoId: string; fallas: { codigo: string; nombre: string; critico: boolean; nota?: string }[]; actorId: string },
) => Promise<void>;

@Injectable()
export class InspeccionesService {
  private readonly reacciones: ReaccionInspeccion[] = [];

  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
  ) {}

  alInspeccionar(reaccion: ReaccionInspeccion) {
    this.reacciones.push(reaccion);
  }

  async plantilla(orgId: string, vehiculoId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehiculoId));
      if (!v) throw new NotFoundException('Vehículo no encontrado');
      return { vehiculo: { id: v.id, placa: v.plate, tipo: v.vehicleType, estado: v.status }, plantilla: plantillaParaTipo(v.vehicleType) };
    });
  }

  /**
   * Registra un preoperacional. Es idempotente por `clientId` (reenvíos desde el celular sin
   * conexión). Una falla en un ítem crítico deja el vehículo "no apto" (RN-14).
   */
  async registrar(orgId: string, input: InspeccionInput, usuarioId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [previa] = await tx
        .select()
        .from(inspections)
        .where(and(eq(inspections.organizationId, orgId), eq(inspections.clientId, input.clientId)));
      if (previa) return { inspeccion: previa, duplicada: true };

      const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, input.vehiculoId));
      if (!v) throw new NotFoundException('Vehículo no encontrado');
      if (v.status === 'inactivo') throw new BadRequestException('El vehículo está inactivo');
      const plantilla = plantillaParaTipo(v.vehicleType);
      const porCodigo = new Map(plantilla.items.map((i) => [i.codigo, i]));
      const desconocidos = input.items.filter((i) => !porCodigo.has(i.codigo));
      if (desconocidos.length) {
        throw new BadRequestException(`Ítems que no son de esta plantilla: ${desconocidos.map((d) => d.codigo).join(', ')}`);
      }
      const faltantes = plantilla.items.filter((i) => !input.items.some((r) => r.codigo === i.codigo));
      if (faltantes.length) {
        throw new BadRequestException(`Falta revisar: ${faltantes.map((f) => f.nombre).join(', ')}`);
      }

      const fallas = input.items
        .filter((i) => !i.ok)
        .map((i) => ({ ...porCodigo.get(i.codigo)!, nota: i.nota }));
      const resultado: ResultadoInspeccion = fallas.some((f) => f.critico)
        ? 'falla_critica'
        : fallas.length
          ? 'falla_menor'
          : 'apto';

      let conductorId = input.conductorId ?? null;
      if (!conductorId) {
        const [propio] = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, usuarioId));
        conductorId = propio?.id ?? null;
      }

      const [inspeccion] = await tx
        .insert(inspections)
        .values({
          organizationId: orgId,
          vehicleId: v.id,
          driverId: conductorId,
          inspectedBy: usuarioId,
          templateId: plantilla.id,
          odometerKm: input.odometroKm ?? null,
          result: resultado,
          notes: input.notas ?? null,
          clientId: input.clientId,
          performedAt: new Date(input.realizadaEn),
        })
        .returning();
      await tx.insert(inspectionItems).values(
        input.items.map((i) => ({
          inspectionId: inspeccion!.id,
          organizationId: orgId,
          itemCode: i.codigo,
          ok: i.ok,
          critical: porCodigo.get(i.codigo)!.critico,
          note: i.nota ?? null,
        })),
      );
      await tx
        .update(vehicles)
        .set({
          ...(resultado === 'falla_critica' ? { status: 'no_apto' } : {}),
          ...(input.odometroKm && (v.odometerKm ?? 0) < input.odometroKm ? { odometerKm: input.odometroKm } : {}),
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, v.id));
      await auditar(tx, {
        organizacionId: orgId,
        actorId: usuarioId,
        accion: 'inspeccion.registrada',
        entidad: 'inspection',
        entidadId: inspeccion!.id,
        datos: { placa: v.plate, resultado },
      });
      for (const reaccion of this.reacciones) {
        await reaccion(tx, { orgId, inspeccionId: inspeccion!.id, vehiculoId: v.id, fallas, actorId: usuarioId });
      }
      if (resultado === 'falla_critica') {
        await this.eventos.emitir(tx, orgId, 'preoperacional.falla', {
          placa: v.plate,
          fallas: fallas.filter((f) => f.critico).map((f) => f.nombre),
          inspeccionId: inspeccion!.id,
        });
      }
      return { inspeccion: inspeccion!, duplicada: false };
    });
  }

  async listar(orgId: string, dia?: string) {
    const fecha = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : new Date().toISOString().slice(0, 10);
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx
        .select({
          id: inspections.id,
          resultado: inspections.result,
          realizadaEn: inspections.performedAt,
          odometroKm: inspections.odometerKm,
          notas: inspections.notes,
          placa: vehicles.plate,
          conductor: drivers.fullName,
          fallas: sql<string[]>`coalesce((select array_agg(ii.item_code) from inspection_items ii where ii.inspection_id = ${inspections.id} and not ii.ok), '{}')`,
        })
        .from(inspections)
        .innerJoin(vehicles, eq(vehicles.id, inspections.vehicleId))
        .leftJoin(drivers, eq(drivers.id, inspections.driverId))
        .where(
          and(
            gte(inspections.performedAt, new Date(`${fecha}T00:00:00-05:00`)),
            lt(inspections.performedAt, new Date(new Date(`${fecha}T00:00:00-05:00`).getTime() + 86_400_000)),
          ),
        )
        .orderBy(desc(inspections.performedAt));
      return { fecha, inspecciones: filas };
    });
  }
}

@Controller('org/inspecciones')
export class InspeccionesController {
  constructor(private readonly service: InspeccionesService) {}

  @Get('plantilla/:vehiculoId')
  @Miembro()
  plantilla(@Param('vehiculoId', ParseUUIDPipe) vehiculoId: string, @OrgActual() org: OrgSesion) {
    return this.service.plantilla(org.id, vehiculoId);
  }

  @Post()
  @Permiso('inspeccionar')
  registrar(
    @Body(new ZodValidationPipe(inspeccionSchema)) body: InspeccionInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.registrar(org.id, body, u.id);
  }

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion, @Query('dia') dia?: string) {
    return this.service.listar(org.id, dia);
  }
}

@Module({ controllers: [InspeccionesController], providers: [InspeccionesService], exports: [InspeccionesService] })
export class InspeccionesModule {}
