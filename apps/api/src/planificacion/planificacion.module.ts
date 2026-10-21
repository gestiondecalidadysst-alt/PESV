import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  actividadPlanSchema,
  asistentesCapacitacionSchema,
  capacitacionSchema,
  metaSchema,
  type ActividadPlanInput,
  type AsistentesCapacitacionInput,
  type CapacitacionInput,
  type MetaInput,
} from '@pesv/shared';
import { asc, desc, eq } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService } from '../db/database.service.js';
import { goals, planActivities, trainingAttendance, trainings } from '../db/schema.js';

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

  plan(orgId: string, anio: number) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(planActivities).where(eq(planActivities.year, anio)).orderBy(asc(planActivities.plannedStart))).map((a) => ({
        id: a.id,
        anio: a.year,
        titulo: a.title,
        pasoNumero: a.stepNumber,
        responsable: a.responsibleName,
        inicio: a.plannedStart,
        fin: a.plannedEnd,
        estado: a.status,
        ejecutadaEl: a.executedOn,
        presupuesto: a.budget,
        origen: a.source,
        origenId: a.sourceId,
        atrasada: a.status !== 'ejecutada' && a.status !== 'cancelada' && a.plannedEnd < new Date().toISOString().slice(0, 10),
      })),
    );
  }

  guardarActividad(orgId: string, input: ActividadPlanInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        year: input.anio,
        title: input.titulo,
        stepNumber: input.pasoNumero ?? null,
        responsibleName: input.responsable,
        plannedStart: input.inicio,
        plannedEnd: input.fin,
        status: input.estado,
        executedOn: input.estado === 'ejecutada' ? (input.ejecutadaEl ?? new Date().toISOString().slice(0, 10)) : null,
        budget: input.presupuesto ?? null,
      };
      const [a] = id
        ? await tx.update(planActivities).set(valores).where(eq(planActivities.id, id)).returning()
        : await tx.insert(planActivities).values({ organizationId: orgId, ...valores }).returning();
      if (!a) throw new NotFoundException('Actividad no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'plan.actividad_actualizada' : 'plan.actividad_creada', entidad: 'plan_activity', entidadId: a.id });
      return a;
    });
  }

  capacitaciones(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(trainings).orderBy(desc(trainings.plannedOn));
      const asistentes = await tx.select().from(trainingAttendance);
      return filas.map((t) => ({
        id: t.id,
        titulo: t.title,
        tema: t.topic,
        programadaEl: t.plannedOn,
        ejecutadaEl: t.executedOn,
        horas: t.hours,
        instructor: t.instructor,
        estado: t.status,
        asistentes: asistentes
          .filter((a) => a.trainingId === t.id)
          .map((a) => ({ id: a.id, conductorId: a.driverId, nombre: a.fullName, documento: a.documentNumber, asistio: a.attended })),
      }));
    });
  }

  guardarCapacitacion(orgId: string, input: CapacitacionInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        title: input.titulo,
        topic: input.tema,
        plannedOn: input.programadaEl,
        executedOn: input.estado === 'ejecutada' ? (input.ejecutadaEl ?? input.programadaEl) : null,
        hours: input.horas ?? null,
        instructor: input.instructor ?? null,
        status: input.estado,
      };
      const [t] = id
        ? await tx.update(trainings).set(valores).where(eq(trainings.id, id)).returning()
        : await tx.insert(trainings).values({ organizationId: orgId, ...valores }).returning();
      if (!t) throw new NotFoundException('Capacitación no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'capacitacion.actualizada' : 'capacitacion.programada', entidad: 'training', entidadId: t.id });
      return t;
    });
  }

  /** Lista de asistencia (nombre, cédula, fecha y tema): soporte del formulario administrativo de VIGIA 2. */
  asistentes(orgId: string, id: string, input: AsistentesCapacitacionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [t] = await tx.select({ id: trainings.id }).from(trainings).where(eq(trainings.id, id));
      if (!t) throw new NotFoundException('Capacitación no encontrada');
      await tx.delete(trainingAttendance).where(eq(trainingAttendance.trainingId, id));
      await tx.insert(trainingAttendance).values(
        input.asistentes.map((a) => ({
          trainingId: id,
          organizationId: orgId,
          driverId: a.conductorId ?? null,
          fullName: a.nombre,
          documentNumber: a.documento,
          attended: a.asistio,
        })),
      );
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'capacitacion.asistencia', entidad: 'training', entidadId: id, datos: { asistentes: input.asistentes.length } });
      return { id, asistentes: input.asistentes.length };
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

  @Get('plan') @Permiso('ver')
  plan(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) { return this.s.plan(o.id, anio ? Number(anio) : new Date().getFullYear()); }

  @Post('plan') @Permiso('gestionar_pesv')
  crearActividad(@Body(new ZodValidationPipe(actividadPlanSchema)) b: ActividadPlanInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarActividad(o.id, b, u.id); }

  @Patch('plan/:id') @Permiso('gestionar_pesv')
  editarActividad(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(actividadPlanSchema)) b: ActividadPlanInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarActividad(o.id, b, u.id, id); }

  @Get('capacitaciones') @Permiso('ver')
  capacitaciones(@OrgActual() o: OrgSesion) { return this.s.capacitaciones(o.id); }

  @Post('capacitaciones') @Permiso('gestionar_pesv')
  crearCapacitacion(@Body(new ZodValidationPipe(capacitacionSchema)) b: CapacitacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarCapacitacion(o.id, b, u.id); }

  @Patch('capacitaciones/:id') @Permiso('gestionar_pesv')
  editarCapacitacion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(capacitacionSchema)) b: CapacitacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarCapacitacion(o.id, b, u.id, id); }

  @Put('capacitaciones/:id/asistentes') @Permiso('gestionar_pesv')
  asistentes(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(asistentesCapacitacionSchema)) b: AsistentesCapacitacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.asistentes(o.id, id, b, u.id); }
}

@Module({ controllers: [PlanificacionController], providers: [PlanificacionService], exports: [PlanificacionService] })
export class PlanificacionModule {}
