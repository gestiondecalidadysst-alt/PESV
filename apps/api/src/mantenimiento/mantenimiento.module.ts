import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  type OnModuleInit,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  cerrarOrdenSchema,
  diasHasta,
  ordenTrabajoSchema,
  planMantenimientoSchema,
  type CerrarOrdenInput,
  type OrdenTrabajoInput,
  type PlanMantenimientoInput,
} from '@pesv/shared';
import { and, desc, eq } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { maintenancePlans, vehicles, workOrders } from '../db/schema.js';
import { InspeccionesModule, InspeccionesService } from '../inspecciones/inspecciones.module.js';

export type EstadoPlan = 'vigente' | 'por_vencer' | 'vencido' | 'sin_historial';

/** Próximo mantenimiento por tiempo o por kilometraje, lo que ocurra primero (RN-17). */
export function vencimientoPlan(
  plan: { intervalKm: number | null; intervalDays: number | null; lastDoneOn: string | null; lastDoneKm: number | null },
  odometroActual: number | null,
  hoy = new Date(),
) {
  let proximaFecha: string | null = null;
  let proximoKm: number | null = null;
  if (plan.intervalDays && plan.lastDoneOn) {
    const d = new Date(`${plan.lastDoneOn}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + plan.intervalDays);
    proximaFecha = d.toISOString().slice(0, 10);
  }
  if (plan.intervalKm && plan.lastDoneKm !== null) proximoKm = plan.lastDoneKm + plan.intervalKm;
  if (!proximaFecha && proximoKm === null) return { proximaFecha, proximoKm, estado: 'sin_historial' as EstadoPlan };
  const dias = proximaFecha ? diasHasta(proximaFecha, hoy) : null;
  const kmRestantes = proximoKm !== null && odometroActual !== null ? proximoKm - odometroActual : null;
  const estado: EstadoPlan =
    (dias !== null && dias < 0) || (kmRestantes !== null && kmRestantes <= 0)
      ? 'vencido'
      : (dias !== null && dias <= 15) || (kmRestantes !== null && kmRestantes <= 500)
        ? 'por_vencer'
        : 'vigente';
  return { proximaFecha, proximoKm, dias, kmRestantes, estado };
}

@Injectable()
export class MantenimientoService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly inspecciones: InspeccionesService,
  ) {}

  /** Cada ítem con falla en un preoperacional abre una orden correctiva (RN-16). */
  onModuleInit() {
    this.inspecciones.alInspeccionar(async (tx, d) => {
      if (!d.fallas.length) return;
      await tx.insert(workOrders).values(
        d.fallas.map((f) => ({
          organizationId: d.orgId,
          vehicleId: d.vehiculoId,
          kind: 'correctivo',
          source: 'inspeccion',
          inspectionId: d.inspeccionId,
          itemCode: f.codigo,
          description: `${f.nombre}${f.nota ? `: ${f.nota}` : ''}`,
          priority: f.critico ? 'critica' : 'normal',
        })),
      );
    });
  }

  async planes(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx
        .select({ plan: maintenancePlans, placa: vehicles.plate, odometro: vehicles.odometerKm })
        .from(maintenancePlans)
        .innerJoin(vehicles, eq(vehicles.id, maintenancePlans.vehicleId))
        .where(eq(maintenancePlans.active, true))
        .orderBy(vehicles.plate);
      return filas.map(({ plan, placa, odometro }) => ({
        id: plan.id,
        vehiculoId: plan.vehicleId,
        placa,
        nombre: plan.name,
        intervaloKm: plan.intervalKm,
        intervaloDias: plan.intervalDays,
        ultimoEn: plan.lastDoneOn,
        ultimoKm: plan.lastDoneKm,
        odometroActual: odometro,
        ...vencimientoPlan(plan, odometro),
      }));
    });
  }

  async crearPlan(orgId: string, input: PlanMantenimientoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [v] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, input.vehiculoId));
      if (!v) throw new NotFoundException('Vehículo no encontrado');
      const [p] = await tx
        .insert(maintenancePlans)
        .values({
          organizationId: orgId,
          vehicleId: input.vehiculoId,
          name: input.nombre,
          intervalKm: input.intervaloKm ?? null,
          intervalDays: input.intervaloDias ?? null,
          lastDoneOn: input.ultimoEn ?? null,
          lastDoneKm: input.ultimoKm ?? null,
        })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'mantenimiento.plan_creado', entidad: 'maintenance_plan', entidadId: p!.id });
      return p!;
    });
  }

  async ordenes(orgId: string, estado?: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          id: workOrders.id,
          vehiculoId: workOrders.vehicleId,
          placa: vehicles.plate,
          tipo: workOrders.kind,
          origen: workOrders.source,
          descripcion: workOrders.description,
          prioridad: workOrders.priority,
          estado: workOrders.status,
          proveedor: workOrders.providerName,
          tecnico: workOrders.technicianName,
          costo: workOrders.cost,
          abiertaEn: workOrders.openedAt,
          cerradaEn: workOrders.closedAt,
        })
        .from(workOrders)
        .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
        .where(estado ? eq(workOrders.status, estado) : undefined)
        .orderBy(desc(workOrders.openedAt))
        .limit(300),
    );
  }

  async crearOrden(orgId: string, input: OrdenTrabajoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [o] = await tx
        .insert(workOrders)
        .values({
          organizationId: orgId,
          vehicleId: input.vehiculoId,
          kind: input.tipo,
          source: input.planId ? 'plan' : 'manual',
          planId: input.planId ?? null,
          description: input.descripcion,
          priority: input.prioridad,
        })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'mantenimiento.orden_creada', entidad: 'work_order', entidadId: o!.id });
      return o!;
    });
  }

  async iniciar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [o] = await tx
        .update(workOrders)
        .set({ status: 'en_proceso' })
        .where(and(eq(workOrders.id, id), eq(workOrders.status, 'abierta')))
        .returning();
      if (!o) throw new BadRequestException('La orden no existe o ya está en proceso o cerrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'mantenimiento.orden_iniciada', entidad: 'work_order', entidadId: id });
      return o;
    });
  }

  /**
   * Cierra la orden con los datos que exige el reporte de mantenimiento de VIGIA 2 (fecha,
   * proveedor, NIT, técnico). Si ya no quedan órdenes críticas abiertas, el vehículo vuelve a
   * estar apto.
   */
  async cerrar(orgId: string, id: string, input: CerrarOrdenInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [actual] = await tx.select().from(workOrders).where(eq(workOrders.id, id));
      if (!actual) throw new NotFoundException('Orden no encontrada');
      if (actual.status === 'cerrada') throw new BadRequestException('La orden ya está cerrada');
      const ahora = new Date();
      const [o] = await tx
        .update(workOrders)
        .set({
          status: 'cerrada',
          providerName: input.proveedor,
          providerNit: input.nitProveedor ?? null,
          technicianName: input.tecnico,
          technicianDocument: input.documentoTecnico ?? null,
          technicianRole: input.cargoTecnico ?? null,
          cost: input.costo ?? null,
          odometerKm: input.odometroKm ?? null,
          notes: input.notas ?? null,
          closedAt: ahora,
          closedBy: actorId,
        })
        .where(eq(workOrders.id, id))
        .returning();
      if (actual.planId) {
        await tx
          .update(maintenancePlans)
          .set({ lastDoneOn: ahora.toISOString().slice(0, 10), ...(input.odometroKm ? { lastDoneKm: input.odometroKm } : {}) })
          .where(eq(maintenancePlans.id, actual.planId));
      }
      await this.revisarAptitud(tx, actual.vehicleId, input.odometroKm ?? null);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'mantenimiento.orden_cerrada', entidad: 'work_order', entidadId: id, datos: { proveedor: input.proveedor } });
      return o!;
    });
  }

  private async revisarAptitud(tx: TenantTx, vehiculoId: string, odometro: number | null) {
    const criticasAbiertas = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(and(eq(workOrders.vehicleId, vehiculoId), eq(workOrders.priority, 'critica'), eq(workOrders.status, 'abierta')));
    const enProceso = await tx
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(and(eq(workOrders.vehicleId, vehiculoId), eq(workOrders.priority, 'critica'), eq(workOrders.status, 'en_proceso')));
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehiculoId));
    if (!v) return;
    await tx
      .update(vehicles)
      .set({
        ...(v.status === 'no_apto' && criticasAbiertas.length + enProceso.length === 0 ? { status: 'apto' } : {}),
        ...(odometro && (v.odometerKm ?? 0) < odometro ? { odometerKm: odometro } : {}),
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, vehiculoId));
  }
}

@Controller('org/mantenimiento')
export class MantenimientoController {
  constructor(private readonly service: MantenimientoService) {}

  @Get('planes')
  @Permiso('ver')
  planes(@OrgActual() org: OrgSesion) {
    return this.service.planes(org.id);
  }

  @Post('planes')
  @Permiso('gestionar_mantenimiento')
  crearPlan(@Body(new ZodValidationPipe(planMantenimientoSchema)) body: PlanMantenimientoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crearPlan(org.id, body, u.id);
  }

  @Get('ordenes')
  @Permiso('ver')
  ordenes(@OrgActual() org: OrgSesion, @Query('estado') estado?: string) {
    return this.service.ordenes(org.id, estado);
  }

  @Post('ordenes')
  @Permiso('gestionar_mantenimiento')
  crearOrden(@Body(new ZodValidationPipe(ordenTrabajoSchema)) body: OrdenTrabajoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crearOrden(org.id, body, u.id);
  }

  @Patch('ordenes/:id/iniciar')
  @Permiso('gestionar_mantenimiento')
  iniciar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.iniciar(org.id, id, u.id);
  }

  @Post('ordenes/:id/cerrar')
  @Permiso('gestionar_mantenimiento')
  cerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cerrarOrdenSchema)) body: CerrarOrdenInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cerrar(org.id, id, body, u.id);
  }
}

@Module({ imports: [InspeccionesModule], controllers: [MantenimientoController], providers: [MantenimientoService], exports: [MantenimientoService] })
export class MantenimientoModule {}
