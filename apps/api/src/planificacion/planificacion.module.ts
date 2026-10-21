import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { metaSchema, type MetaInput } from '@pesv/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService } from '../db/database.service.js';
import { goals } from '../db/schema.js';

type FilaMeta = typeof goals.$inferSelect;

/** Una meta se cumple si el valor actual está del lado correcto de la meta. */
export const metaCumplida = (m: FilaMeta) =>
  m.currentValue === null ? null : m.direction === 'menor_o_igual' ? m.currentValue <= m.target : m.currentValue >= m.target;

const aMeta = (m: FilaMeta) => ({
  id: m.id,
  anio: m.year,
  objetivo: m.objective,
  indicador: m.indicator,
  meta: m.target,
  valorActual: m.currentValue,
  sentido: m.direction,
  cumplida: metaCumplida(m),
});

@Injectable()
export class PlanificacionService {
  constructor(private readonly database: DatabaseService) {}

  metas(orgId: string, anio?: number) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(goals).where(anio ? eq(goals.year, anio) : undefined).orderBy(desc(goals.year), asc(goals.createdAt))).map(aMeta),
    );
  }

  guardarMeta(orgId: string, input: MetaInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        year: input.anio,
        objective: input.objetivo,
        indicator: input.indicador,
        target: input.meta,
        currentValue: input.valorActual ?? null,
        direction: input.sentido,
      };
      const [m] = id
        ? await tx.update(goals).set(valores).where(eq(goals.id, id)).returning()
        : await tx.insert(goals).values({ organizationId: orgId, ...valores }).returning();
      if (!m) throw new NotFoundException('Meta no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'meta.actualizada' : 'meta.creada', entidad: 'goal', entidadId: m.id });
      return aMeta(m);
    });
  }
}

@Controller('org')
export class PlanificacionController {
  constructor(private readonly s: PlanificacionService) {}

  @Get('metas') @Permiso('ver')
  metas(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) { return this.s.metas(o.id, anio ? Number(anio) : undefined); }

  @Post('metas') @Permiso('gestionar_pesv')
  crearMeta(@Body(new ZodValidationPipe(metaSchema)) b: MetaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarMeta(o.id, b, u.id); }

  @Patch('metas/:id') @Permiso('gestionar_pesv')
  editarMeta(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(metaSchema)) b: MetaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarMeta(o.id, b, u.id, id); }
}

@Module({ controllers: [PlanificacionController], providers: [PlanificacionService], exports: [PlanificacionService] })
export class PlanificacionModule {}
