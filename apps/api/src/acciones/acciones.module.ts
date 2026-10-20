import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { accionSchema, cerrarAccionSchema, diasHasta, type AccionInput } from '@pesv/shared';
import { and, asc, eq } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { actions } from '../db/schema.js';

type FilaAccion = typeof actions.$inferSelect;

export const aAccion = (a: FilaAccion) => ({
  id: a.id,
  origen: a.source,
  origenId: a.sourceId,
  tipo: a.kind,
  descripcion: a.description,
  responsable: a.responsibleName,
  responsableUsuarioId: a.responsibleUserId,
  venceEl: a.dueOn,
  estado: a.status,
  vencida: a.status === 'abierta' && diasHasta(a.dueOn) < 0,
  notaCierre: a.closureNote,
  cerradaEn: a.closedAt,
  creadaEn: a.createdAt,
});

/** Inserta una acción dentro de una transacción existente (comité, siniestros, auditorías). */
export async function crearAccion(tx: TenantTx, orgId: string, input: AccionInput, actorId: string) {
  const [a] = await tx
    .insert(actions)
    .values({
      organizationId: orgId,
      source: input.origen,
      sourceId: input.origenId ?? null,
      kind: input.tipo,
      description: input.descripcion,
      responsibleName: input.responsable,
      responsibleUserId: input.responsableUsuarioId ?? null,
      dueOn: input.venceEl,
      createdBy: actorId,
    })
    .returning();
  await auditar(tx, { organizacionId: orgId, actorId, accion: 'accion.creada', entidad: 'action', entidadId: a!.id, datos: { origen: input.origen } });
  return a!;
}

@Injectable()
export class AccionesService {
  constructor(private readonly database: DatabaseService) {}

  listar(orgId: string, filtros: { estado?: string; origen?: string; origenId?: string }) {
    return this.database.withTenant(orgId, async (tx) =>
      (
        await tx
          .select()
          .from(actions)
          .where(
            and(
              filtros.estado ? eq(actions.status, filtros.estado) : undefined,
              filtros.origen ? eq(actions.source, filtros.origen) : undefined,
              filtros.origenId ? eq(actions.sourceId, filtros.origenId) : undefined,
            ),
          )
          .orderBy(asc(actions.status), asc(actions.dueOn))
      ).map(aAccion),
    );
  }

  crear(orgId: string, input: AccionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => aAccion(await crearAccion(tx, orgId, input, actorId)));
  }

  cerrar(orgId: string, id: string, nota: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [a] = await tx
        .update(actions)
        .set({ status: 'cerrada', closureNote: nota, closedAt: new Date(), closedBy: actorId })
        .where(and(eq(actions.id, id), eq(actions.status, 'abierta')))
        .returning();
      if (!a) throw new BadRequestException('La acción no existe o ya está cerrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'accion.cerrada', entidad: 'action', entidadId: id });
      return aAccion(a);
    });
  }
}

@Controller('org/acciones')
export class AccionesController {
  constructor(private readonly service: AccionesService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion, @Query('estado') estado?: string, @Query('origen') origen?: string, @Query('origenId') origenId?: string) {
    return this.service.listar(org.id, { estado, origen, origenId });
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(accionSchema)) body: AccionInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crear(org.id, body, u.id);
  }

  @Post(':id/cerrar')
  @Permiso('comite')
  cerrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cerrarAccionSchema)) body: { nota: string },
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cerrar(org.id, id, body.nota, u.id);
  }
}

@Module({ controllers: [AccionesController], providers: [AccionesService], exports: [AccionesService] })
export class AccionesModule {}
