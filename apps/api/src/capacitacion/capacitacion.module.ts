import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  asistenciaCapacitacionSchema,
  capacitacionPlanSchema,
  eficaciaSchema,
  ejecutarCapacitacionSchema,
  FACILITADORES,
  indicadoresFormacion,
  MESES,
  METODOS_EVALUACION,
  MODALIDADES_FORMACION,
  PUBLICOS_FORMACION,
  TEMAS_FORMACION,
  TIPOS_FORMACION,
  type AsistenciaCapacitacionInput,
  type CapacitacionPlanInput,
  type EficaciaInput,
  type EjecutarCapacitacionInput,
} from '@pesv/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { drivers, planActivities, planFollowups, roadRisks, trainingAttendance, trainings } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { fechasDeMeses, sincronizarActividad } from '../plan-trabajo/sincronizar.js';
import { hoyColombia } from '../common/fechas.js';

type FilaCapacitacion = typeof trainings.$inferSelect;
type FilaAsistencia = typeof trainingAttendance.$inferSelect;

const hoy = hoyColombia;
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const mesDe = (fecha: string) => Number(fecha.slice(5, 7));
const NOTA_PLAN = 'Capacitación ejecutada (registrado desde el plan de formación)';

function aCapacitacion(t: FilaCapacitacion, asistencia: FilaAsistencia[], riesgos: Map<string, string>) {
  const lista = asistencia.filter((a) => a.trainingId === t.id).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  const asistieron = lista.filter((a) => a.attended);
  const evaluados = asistieron.filter((a) => a.score != null);
  const aprobados = evaluados.filter((a) => a.score! >= t.passingScore);
  return {
    id: t.id,
    anio: t.year,
    titulo: t.title,
    tipo: t.kind,
    temaId: t.topicId,
    tema: t.topic,
    objetivo: t.objective,
    publico: t.audience,
    modalidad: t.modality,
    programadaEl: t.plannedOn,
    ejecutadaEl: t.executedOn,
    horas: t.hours,
    facilitador: t.instructor,
    tipoFacilitador: t.providerType,
    lugar: t.location,
    evaluacion: t.evaluation,
    notaMinima: t.passingScore,
    estado: t.status as 'programada' | 'ejecutada' | 'cancelada',
    riesgoId: t.riskId,
    riesgo: t.riskId ? (riesgos.get(t.riskId) ?? null) : null,
    actividadPlanId: t.planActivityId,
    eficacia: t.effective == null ? null : { efectiva: t.effective, fecha: t.effectivenessOn, nota: t.effectivenessNote },
    vencida: t.status === 'programada' && t.plannedOn < hoy(),
    resultado: {
      convocados: lista.length,
      asistentes: asistieron.length,
      evaluados: evaluados.length,
      aprobados: aprobados.length,
      promedio: evaluados.length ? Math.round((evaluados.reduce((s, a) => s + a.score!, 0) / evaluados.length) * 10) / 10 : null,
    },
    asistentes: lista.map((a) => ({
      id: a.id,
      conductorId: a.driverId,
      nombre: a.fullName,
      documento: a.documentNumber,
      cargo: a.jobRole,
      asistio: a.attended,
      nota: a.score,
      aprobo: a.score == null ? null : a.score >= t.passingScore,
    })),
  };
}
export type Capacitacion = ReturnType<typeof aCapacitacion>;

/**
 * Plan anual de formación del PESV (paso 10): capacitaciones por tema y público, convocatoria y
 * asistencia, evaluación y eficacia, indicadores e historial de formación por conductor.
 */
@Injectable()
export class CapacitacionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async capacitacion(tx: TenantTx, id: string) {
    const [t] = await tx.select().from(trainings).where(eq(trainings.id, id));
    if (!t) throw new NotFoundException('Capacitación no encontrada');
    return t;
  }

  async consultar(orgId: string, anio: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(trainings).where(eq(trainings.year, anio)).orderBy(asc(trainings.plannedOn), asc(trainings.createdAt));
      const asistencia = filas.length ? await tx.select().from(trainingAttendance).where(inArray(trainingAttendance.trainingId, filas.map((f) => f.id))) : [];
      const riesgos = new Map((await tx.select({ id: roadRisks.id, peligro: roadRisks.hazard }).from(roadRisks)).map((r) => [r.id, r.peligro]));
      const activos = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.active, true));
      const capacitaciones = filas.map((f) => aCapacitacion(f, asistencia, riesgos));
      const corte = anio < new Date().getFullYear() ? `${anio}-12-31` : hoy();
      const indicadores = indicadoresFormacion(
        capacitaciones.map((c) => ({ estado: c.estado, programadaEl: c.programadaEl, horas: c.horas, notaMinima: c.notaMinima, asistentes: c.asistentes })),
        activos.map((a) => a.id),
        corte,
      );
      const porTema = TEMAS_FORMACION.map((t) => ({
        tema: t.id,
        programadas: capacitaciones.filter((c) => c.temaId === t.id && c.estado !== 'cancelada').length,
        ejecutadas: capacitaciones.filter((c) => c.temaId === t.id && c.estado === 'ejecutada').length,
      })).filter((t) => t.programadas > 0);
      return {
        anio,
        capacitaciones,
        indicadores,
        porTema,
        pendientesEficacia: capacitaciones.filter((c) => c.estado === 'ejecutada' && !c.eficacia).length,
        riesgos: [...riesgos].map(([id, peligro]) => ({ id, peligro })),
      };
    });
  }

  /** Crea, actualiza o quita la actividad del plan de trabajo que corresponde a la capacitación. */
  private async sincronizarPlan(tx: TenantTx, t: FilaCapacitacion, enPlan: boolean, actorId: string) {
    if (!enPlan) {
      if (t.planActivityId) {
        await tx.update(trainings).set({ planActivityId: null }).where(eq(trainings.id, t.id));
        await tx.delete(planActivities).where(eq(planActivities.id, t.planActivityId));
      }
      return;
    }
    const meses = [mesDe(t.plannedOn)];
    const valores = {
      year: t.year,
      title: `Capacitación: ${t.title}`,
      description: [nombreDe(TEMAS_FORMACION, t.topicId), t.objective].filter(Boolean).join('. '),
      stepNumber: 10,
      phase: 'hacer',
      responsibleName: t.instructor ?? 'Líder PESV',
      plannedMonths: meses,
      ...fechasDeMeses(t.year, meses),
      status: t.status === 'cancelada' ? 'cancelada' : 'planeada',
      updatedAt: new Date(),
    };
    let actividadId = t.planActivityId;
    if (actividadId) {
      await tx.update(planActivities).set(valores).where(eq(planActivities.id, actividadId));
      await tx.delete(planFollowups).where(eq(planFollowups.activityId, actividadId));
    } else {
      const [a] = await tx.insert(planActivities).values({ organizationId: t.organizationId, source: 'capacitacion', sourceId: t.id, ...valores }).returning({ id: planActivities.id });
      actividadId = a!.id;
      await tx.update(trainings).set({ planActivityId: actividadId }).where(eq(trainings.id, t.id));
    }
    if (t.status === 'ejecutada' && t.executedOn) {
      await tx.insert(planFollowups).values({ organizationId: t.organizationId, activityId: actividadId, month: meses[0]!, executed: true, executedOn: t.executedOn, note: NOTA_PLAN, createdBy: actorId });
    }
    await sincronizarActividad(tx, actividadId);
  }

  guardar(orgId: string, input: CapacitacionPlanInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const anterior = id ? await this.capacitacion(tx, id) : null;
      if (anterior?.status === 'ejecutada' && input.cancelada) throw new BadRequestException('Una capacitación ejecutada no se puede cancelar');
      if (anterior?.status === 'ejecutada' && anterior.plannedOn !== input.programadaEl && input.programadaEl.slice(0, 4) !== anterior.plannedOn.slice(0, 4)) {
        throw new BadRequestException('No cambies de año una capacitación ya ejecutada');
      }
      if (input.riesgoId) {
        const [r] = await tx.select({ id: roadRisks.id }).from(roadRisks).where(eq(roadRisks.id, input.riesgoId));
        if (!r) throw new BadRequestException('El riesgo no existe');
      }
      const valores = {
        year: Number(input.programadaEl.slice(0, 4)),
        title: input.titulo,
        kind: input.tipo,
        topicId: input.temaId,
        topic: input.tema ?? nombreDe(TEMAS_FORMACION, input.temaId),
        objective: input.objetivo ?? null,
        audience: input.publico,
        modality: input.modalidad,
        plannedOn: input.programadaEl,
        hours: input.horas ?? null,
        instructor: input.facilitador ?? null,
        providerType: input.tipoFacilitador,
        location: input.lugar ?? null,
        evaluation: input.evaluacion,
        passingScore: input.notaMinima,
        riskId: input.riesgoId ?? null,
        status: input.cancelada ? 'cancelada' : anterior?.status === 'ejecutada' ? 'ejecutada' : 'programada',
        updatedAt: new Date(),
      };
      const [t] = anterior
        ? await tx.update(trainings).set(valores).where(eq(trainings.id, anterior.id)).returning()
        : await tx.insert(trainings).values({ organizationId: orgId, ...valores }).returning();
      await this.sincronizarPlan(tx, t!, input.enPlanDeTrabajo, actorId);
      await auditar(tx, { organizacionId: orgId, actorId, accion: anterior ? 'capacitacion.actualizada' : 'capacitacion.programada', entidad: 'training', entidadId: t!.id });
      return { id: t!.id };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const t = await this.capacitacion(tx, id);
      if (t.status === 'ejecutada') throw new BadRequestException('Una capacitación ejecutada es un registro del PESV y no se puede eliminar');
      if (t.planActivityId) await tx.delete(planActivities).where(eq(planActivities.id, t.planActivityId));
      await tx.delete(trainings).where(eq(trainings.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'capacitacion.eliminada', entidad: 'training', entidadId: id, datos: { titulo: t.title } });
    });
  }

  /**
   * Convocatoria y asistencia (nombre, cédula, cargo, si asistió y su nota). Es el soporte del
   * formulario administrativo de VIGIA 2 y del indicador de cobertura.
   */
  asistencia(orgId: string, id: string, input: AsistenciaCapacitacionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const t = await this.capacitacion(tx, id);
      if (t.status === 'cancelada') throw new BadRequestException('La capacitación está cancelada');
      if (t.status === 'ejecutada' && !input.asistentes.some((a) => a.asistio)) throw new BadRequestException('Una capacitación ejecutada debe tener al menos un asistente');
      await tx.delete(trainingAttendance).where(eq(trainingAttendance.trainingId, id));
      await tx.insert(trainingAttendance).values(
        input.asistentes.map((a) => ({
          trainingId: id,
          organizationId: orgId,
          driverId: a.conductorId ?? null,
          fullName: a.nombre,
          documentNumber: a.documento,
          jobRole: a.cargo ?? null,
          attended: a.asistio,
          score: a.asistio ? (a.nota ?? null) : null,
        })),
      );
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'capacitacion.asistencia', entidad: 'training', entidadId: id, datos: { convocados: input.asistentes.length, asistentes: input.asistentes.filter((a) => a.asistio).length } });
      return { convocados: input.asistentes.length };
    });
  }

  ejecutar(orgId: string, id: string, input: EjecutarCapacitacionInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const t = await this.capacitacion(tx, id);
      if (t.status === 'cancelada') throw new BadRequestException('La capacitación está cancelada');
      if (input.fecha > hoy()) throw new BadRequestException('La fecha de ejecución no puede ser futura');
      if (input.fecha.slice(0, 4) !== String(t.year)) throw new BadRequestException(`La fecha debe ser del año ${t.year}`);
      const asistentes = await tx.select({ id: trainingAttendance.id }).from(trainingAttendance).where(and(eq(trainingAttendance.trainingId, id), eq(trainingAttendance.attended, true)));
      if (!asistentes.length) throw new BadRequestException('Registra la asistencia antes de marcar la capacitación como ejecutada');
      const horas = input.horas ?? t.hours;
      if (!horas) throw new BadRequestException('Indica la duración en horas');
      const [act] = await tx.update(trainings).set({ status: 'ejecutada', executedOn: input.fecha, hours: horas, updatedAt: new Date() }).where(eq(trainings.id, id)).returning();
      if (act!.planActivityId) await this.sincronizarPlan(tx, act!, true, actorId);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'capacitacion.ejecutada', entidad: 'training', entidadId: id, datos: { fecha: input.fecha, asistentes: asistentes.length } });
      return { estado: 'ejecutada' };
    });
  }

  /** Verificación de la eficacia (por ejemplo, observación del comportamiento semanas después). */
  eficacia(orgId: string, id: string, input: EficaciaInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const t = await this.capacitacion(tx, id);
      if (t.status !== 'ejecutada') throw new BadRequestException('La eficacia se evalúa después de ejecutar la capacitación');
      if (input.fecha < t.executedOn!) throw new BadRequestException('La evaluación de eficacia no puede ser anterior a la capacitación');
      if (input.fecha > hoy()) throw new BadRequestException('La fecha no puede ser futura');
      await tx.update(trainings).set({ effective: input.efectiva, effectivenessOn: input.fecha, effectivenessNote: input.nota, updatedAt: new Date() }).where(eq(trainings.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'capacitacion.eficacia', entidad: 'training', entidadId: id, datos: { efectiva: input.efectiva } });
      return { efectiva: input.efectiva };
    });
  }

  /** Historial de formación de los conductores activos en el año (y quiénes no se han formado). */
  conductores(orgId: string, anio: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const lista = await tx.select().from(drivers).where(eq(drivers.active, true)).orderBy(asc(drivers.fullName));
      const registros = await tx
        .select({ a: trainingAttendance, t: trainings })
        .from(trainingAttendance)
        .innerJoin(trainings, eq(trainings.id, trainingAttendance.trainingId))
        .where(and(eq(trainings.status, 'ejecutada'), eq(trainingAttendance.attended, true)))
        .orderBy(desc(trainings.executedOn));
      return lista.map((d) => {
        const propios = registros.filter((r) => r.a.driverId === d.id || (!r.a.driverId && r.a.documentNumber === d.documentNumber));
        const delAnio = propios.filter((r) => r.t.year === anio);
        return {
          id: d.id,
          nombre: d.fullName,
          documento: d.documentNumber,
          rol: d.roadRole,
          capacitacionesAnio: delAnio.length,
          horasAnio: Math.round(delAnio.reduce((s, r) => s + (r.t.hours ?? 0), 0) * 10) / 10,
          temasAnio: [...new Set(delAnio.map((r) => r.t.topicId))],
          ultima: propios[0]?.t.executedOn ?? null,
          historial: propios.map((r) => ({
            capacitacionId: r.t.id,
            titulo: r.t.title,
            temaId: r.t.topicId,
            fecha: r.t.executedOn,
            horas: r.t.hours,
            nota: r.a.score,
            aprobo: r.a.score == null ? null : r.a.score >= r.t.passingScore,
          })),
        };
      });
    });
  }

  // Documentos ------------------------------------------------------------------------

  async pdfPrograma(orgId: string, anio: number) {
    const [plan, ctx] = await Promise.all([this.consultar(orgId, anio), this.formato.contexto(orgId, 'plan_capacitacion', `PLAN ANUAL DE FORMACIÓN EN SEGURIDAD VIAL ${anio}`)]);
    const i = plan.indicadores;
    const doc = new DocumentoPdf(ctx, true);
    const p = (v: number | null) => (v == null ? '—' : `${v} %`);
    doc.datos(
      [
        ['Año', String(anio)],
        ['Capacitaciones programadas', String(i.programadas)],
        ['Cumplimiento a la fecha', `${p(i.cumplimiento)} (${i.ejecutadasALaFecha} de ${i.programadasALaFecha})`],
        ['Cobertura de conductores', `${p(i.cobertura)} (${i.conductoresFormados} de ${i.conductoresActivos})`],
        ['Eficacia (aprobados)', `${p(i.eficacia)} (${i.aprobados} de ${i.evaluados})`],
        ['Asistencia', `${p(i.asistencia)} (${i.asistentes} de ${i.convocados})`],
        ['Horas-persona de formación', String(i.horasPersona)],
        ['Fecha de corte', hoy()],
      ],
      4,
    );
    doc.titulo('Programa de formación');
    doc.parrafo('P: programada · E: ejecutada · P!: programada y vencida sin ejecutar.', { tamano: 7.5, color: '#5b6576' });
    const celda = (c: Capacitacion, mes: number): CeldaPdf => {
      if (c.estado === 'cancelada' || mesDe(c.programadaEl) !== mes) return { texto: '' };
      if (c.estado === 'ejecutada') return { texto: 'E', fondo: '#CDEBD9', color: '#1F6B43', negrita: true, alinear: 'center' };
      return c.vencida ? { texto: 'P!', fondo: '#F8C9C4', color: '#9E2A1C', negrita: true, alinear: 'center' } : { texto: 'P', fondo: '#DCE8F7', color: '#1C4F8F', negrita: true, alinear: 'center' };
    };
    doc.tabla(
      [
        { titulo: '#', ancho: 1.6, alinear: 'center' },
        { titulo: 'Capacitación · tema', ancho: 12 },
        { titulo: 'Tipo · modalidad', ancho: 4.4 },
        { titulo: 'Público', ancho: 5.5 },
        { titulo: 'Facilitador', ancho: 5 },
        { titulo: 'Horas', ancho: 2.2, alinear: 'center' },
        ...MESES.map((m) => ({ titulo: m, ancho: 1.8, alinear: 'center' as const })),
        { titulo: 'Asist.', ancho: 3, alinear: 'center' },
        { titulo: 'Aprob.', ancho: 3, alinear: 'center' },
        { titulo: 'Eficacia', ancho: 4, alinear: 'center' },
      ],
      plan.capacitaciones.map((c, n) => [
        { texto: String(n + 1), alinear: 'center' },
        [c.titulo, nombreDe(TEMAS_FORMACION, c.temaId), c.riesgo ? `Riesgo: ${c.riesgo}` : null, c.estado === 'cancelada' ? 'CANCELADA' : null].filter(Boolean).join('\n'),
        `${nombreDe(TIPOS_FORMACION, c.tipo)}\n${nombreDe(MODALIDADES_FORMACION, c.modalidad)}`,
        c.publico.map((x) => nombreDe(PUBLICOS_FORMACION, x)).join(', '),
        [c.facilitador, nombreDe(FACILITADORES, c.tipoFacilitador)].filter(Boolean).join('\n'),
        { texto: c.horas != null ? String(c.horas) : '—', alinear: 'center' },
        ...MESES.map((_, m) => celda(c, m + 1)),
        { texto: c.estado === 'ejecutada' ? `${c.resultado.asistentes}/${c.resultado.convocados}` : c.resultado.convocados ? `${c.resultado.convocados} conv.` : '—', alinear: 'center' },
        { texto: c.resultado.evaluados ? `${c.resultado.aprobados}/${c.resultado.evaluados}` : '—', alinear: 'center' },
        { texto: c.eficacia ? (c.eficacia.efectiva ? 'Eficaz' : 'No eficaz') : c.estado === 'ejecutada' ? 'Pendiente' : '—', alinear: 'center' },
      ]),
      { tamano: 6.8 },
    );
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-plan-de-formacion-${anio}.pdf` };
  }

  /** Lista de asistencia: en blanco para firmar si aún no se ejecuta; con resultados si ya se ejecutó. */
  async pdfAsistencia(orgId: string, id: string) {
    const c = await this.database.withTenant(orgId, async (tx) => {
      const t = await this.capacitacion(tx, id);
      const asistencia = await tx.select().from(trainingAttendance).where(eq(trainingAttendance.trainingId, id));
      const riesgos = new Map<string, string>();
      if (t.riskId) {
        const [r] = await tx.select({ id: roadRisks.id, peligro: roadRisks.hazard }).from(roadRisks).where(eq(roadRisks.id, t.riskId));
        if (r) riesgos.set(r.id, r.peligro);
      }
      return aCapacitacion(t, asistencia, riesgos);
    });
    const ctx = await this.formato.contexto(orgId, 'lista_asistencia');
    const doc = new DocumentoPdf(ctx);
    const ejecutada = c.estado === 'ejecutada';
    const calificable = METODOS_EVALUACION.find((m) => m.id === c.evaluacion)?.calificable ?? false;
    doc.datos(
      [
        ['Capacitación', c.titulo],
        ['Tema', nombreDe(TEMAS_FORMACION, c.temaId) + (c.tema && c.tema !== nombreDe(TEMAS_FORMACION, c.temaId) ? ` · ${c.tema}` : '')],
        ['Fecha', ejecutada ? c.ejecutadaEl! : c.programadaEl],
        ['Duración', c.horas != null ? `${c.horas} horas` : '—'],
        ['Facilitador', [c.facilitador, nombreDe(FACILITADORES, c.tipoFacilitador)].filter(Boolean).join(' · ')],
        ['Modalidad y lugar', [nombreDe(MODALIDADES_FORMACION, c.modalidad), c.lugar].filter(Boolean).join(' · ')],
        ['Público', c.publico.map((x) => nombreDe(PUBLICOS_FORMACION, x)).join(', ')],
        ['Evaluación', `${nombreDe(METODOS_EVALUACION, c.evaluacion)}${calificable ? ` (aprueba con ${c.notaMinima})` : ''}`],
      ],
      2,
    );
    if (c.objetivo) doc.parrafo(`Objetivo: ${c.objetivo}`, { tamano: 9 });
    doc.titulo('Registro de asistencia');
    const filas = c.asistentes.length ? c.asistentes : [];
    const vacias = ejecutada ? 0 : Math.max(0, 12 - filas.length);
    doc.tabla(
      [
        { titulo: '#', ancho: 1.2, alinear: 'center' },
        { titulo: 'Nombre completo', ancho: 9 },
        { titulo: 'Cédula', ancho: 4.2 },
        { titulo: 'Cargo', ancho: 5 },
        ...(ejecutada ? [{ titulo: 'Asistió', ancho: 2.6, alinear: 'center' as const }, ...(calificable ? [{ titulo: 'Nota', ancho: 2.4, alinear: 'center' as const }] : [])] : []),
        { titulo: 'Firma', ancho: 6.5 },
      ],
      [
        ...filas.map((a, n) => [
          { texto: String(n + 1), alinear: 'center' as const },
          a.nombre,
          a.documento,
          a.cargo ?? '',
          ...(ejecutada ? [{ texto: a.asistio ? 'Sí' : 'No', alinear: 'center' as const }, ...(calificable ? [{ texto: a.nota != null ? String(a.nota) : '—', alinear: 'center' as const }] : [])] : []),
          '\n ',
        ]),
        ...Array.from({ length: vacias }, (_, n) => [{ texto: String(filas.length + n + 1), alinear: 'center' as const }, '', '', '', '\n ']),
      ],
      { tamano: 8.5 },
    );
    if (ejecutada) {
      doc.datos(
        [
          ['Asistentes', `${c.resultado.asistentes} de ${c.resultado.convocados} convocados`],
          ['Aprobados', c.resultado.evaluados ? `${c.resultado.aprobados} de ${c.resultado.evaluados} evaluados` : 'Sin evaluación calificada'],
          ['Promedio', c.resultado.promedio != null ? String(c.resultado.promedio) : '—'],
          ['Eficacia', c.eficacia ? `${c.eficacia.efectiva ? 'Eficaz' : 'No eficaz'} (${c.eficacia.fecha}): ${c.eficacia.nota}` : 'Pendiente de verificar'],
        ],
        2,
      );
    }
    const nombre = `${ctx.codigo}-asistencia-${c.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').slice(0, 40)}.pdf`;
    return { datos: await doc.terminar(), nombre, capacitacion: c };
  }

  async excel(orgId: string, anio: number) {
    const [plan, conductores, ctx] = await Promise.all([this.consultar(orgId, anio), this.conductores(orgId, anio), this.formato.contexto(orgId, 'plan_capacitacion', `PLAN ANUAL DE FORMACIÓN EN SEGURIDAD VIAL ${anio}`)]);
    const i = plan.indicadores;
    const celda = (c: Capacitacion, mes: number): ValorExcel => {
      if (c.estado === 'cancelada' || mesDe(c.programadaEl) !== mes) return null;
      if (c.estado === 'ejecutada') return { valor: 'E', fondo: '#CDEBD9', negrita: true };
      return c.vencida ? { valor: 'P!', fondo: '#F8C9C4', negrita: true } : { valor: 'P', fondo: '#DCE8F7', negrita: true };
    };
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Programa',
        horizontal: true,
        notas: [
          `Año ${anio}. Cumplimiento ${i.cumplimiento ?? '—'} % · cobertura ${i.cobertura ?? '—'} % · eficacia ${i.eficacia ?? '—'} % · ${i.horasPersona} horas-persona. Generado el ${hoy()}.`,
        ],
        columnas: [
          { titulo: '#', ancho: 5 },
          { titulo: 'Capacitación', ancho: 32 },
          { titulo: 'Tema', ancho: 26 },
          { titulo: 'Tipo', ancho: 14 },
          { titulo: 'Público', ancho: 24 },
          { titulo: 'Modalidad', ancho: 12 },
          { titulo: 'Facilitador', ancho: 20 },
          { titulo: 'Horas', ancho: 7 },
          { titulo: 'Programada', ancho: 12 },
          ...MESES.map((m) => ({ titulo: m, ancho: 5 })),
          { titulo: 'Ejecutada', ancho: 12 },
          { titulo: 'Convocados', ancho: 11 },
          { titulo: 'Asistentes', ancho: 11 },
          { titulo: 'Aprobados', ancho: 11 },
          { titulo: 'Eficacia', ancho: 12 },
          { titulo: 'Riesgo que atiende', ancho: 26 },
        ],
        filas: plan.capacitaciones.map((c, n) => [
          n + 1,
          c.titulo,
          nombreDe(TEMAS_FORMACION, c.temaId),
          nombreDe(TIPOS_FORMACION, c.tipo),
          c.publico.map((x) => nombreDe(PUBLICOS_FORMACION, x)).join(', '),
          nombreDe(MODALIDADES_FORMACION, c.modalidad),
          c.facilitador,
          c.horas,
          c.programadaEl,
          ...MESES.map((_, m) => celda(c, m + 1)),
          c.ejecutadaEl,
          c.resultado.convocados,
          c.resultado.asistentes,
          c.resultado.evaluados ? c.resultado.aprobados : null,
          c.eficacia ? (c.eficacia.efectiva ? 'Eficaz' : 'No eficaz') : c.estado === 'ejecutada' ? 'Pendiente' : c.estado === 'cancelada' ? 'Cancelada' : null,
          c.riesgo,
        ]),
      },
      {
        nombre: 'Asistencia',
        columnas: [
          { titulo: 'Capacitación', ancho: 32 },
          { titulo: 'Fecha', ancho: 12 },
          { titulo: 'Nombre', ancho: 30 },
          { titulo: 'Cédula', ancho: 14 },
          { titulo: 'Cargo', ancho: 20 },
          { titulo: 'Asistió', ancho: 9 },
          { titulo: 'Nota', ancho: 8 },
          { titulo: 'Aprobó', ancho: 9 },
        ],
        filas: plan.capacitaciones.flatMap((c) =>
          c.asistentes.map((a): ValorExcel[] => [c.titulo, c.ejecutadaEl ?? c.programadaEl, a.nombre, a.documento, a.cargo, a.asistio ? 'Sí' : 'No', a.nota, a.aprobo == null ? null : a.aprobo ? 'Sí' : 'No']),
        ),
      },
      {
        nombre: 'Conductores',
        notas: ['Conductores activos y su formación del año. Sirve para identificar a quién falta formar.'],
        columnas: [
          { titulo: 'Conductor', ancho: 30 },
          { titulo: 'Cédula', ancho: 14 },
          { titulo: 'Capacitaciones del año', ancho: 20 },
          { titulo: 'Horas del año', ancho: 13 },
          { titulo: 'Temas', ancho: 50 },
          { titulo: 'Última capacitación', ancho: 18 },
        ],
        filas: conductores.map((d): ValorExcel[] => [
          d.nombre,
          d.documento,
          d.capacitacionesAnio ? d.capacitacionesAnio : { valor: 0, fondo: '#F8C9C4', negrita: true },
          d.horasAnio,
          d.temasAnio.map((t) => nombreDe(TEMAS_FORMACION, t)).join(', ') || null,
          d.ultima,
        ]),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-plan-de-formacion-${anio}.xlsx` };
  }

  async evidenciaPrograma(orgId: string, anio: number, actorId: string) {
    const { datos, nombre } = await this.pdfPrograma(orgId, anio);
    const ev = await this.evidencias.crear(orgId, { titulo: `Plan anual de formación ${anio} · corte ${hoy()}`, pasoNumero: 10, descripcion: 'Generado desde el plan de formación de la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }

  async evidenciaAsistencia(orgId: string, id: string, actorId: string) {
    const { datos, nombre, capacitacion } = await this.pdfAsistencia(orgId, id);
    if (capacitacion.estado !== 'ejecutada') throw new BadRequestException('Guarda la lista como evidencia cuando la capacitación esté ejecutada');
    const ev = await this.evidencias.crear(
      orgId,
      { titulo: `Asistencia: ${capacitacion.titulo} (${capacitacion.ejecutadaEl})`, pasoNumero: 10, descripcion: `${capacitacion.resultado.asistentes} asistentes de ${capacitacion.resultado.convocados} convocados.` },
      { nombre, tipo: MIME_PDF, datos },
      actorId,
    );
    return { evidenciaId: ev.id };
  }
}

const anioDe = (v: string | undefined) => {
  const n = v ? Number(v) : new Date().getFullYear();
  if (!Number.isInteger(n) || n < 2020 || n > 2100) throw new BadRequestException('Año no válido');
  return n;
};

@Controller('org/capacitacion')
export class CapacitacionController {
  constructor(private readonly s: CapacitacionService) {}

  @Get()
  @Permiso('ver')
  consultar(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) {
    return this.s.consultar(o.id, anioDe(anio));
  }

  @Get('conductores')
  @Permiso('ver')
  conductores(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) {
    return this.s.conductores(o.id, anioDe(anio));
  }

  @Get('exportar')
  @Permiso('ver')
  async exportar(@Query('anio') anio: string | undefined, @Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.excel(o.id, anioDe(anio)) : await this.s.pdfPrograma(o.id, anioDe(anio));
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@Query('anio') anio: string | undefined, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidenciaPrograma(o.id, anioDe(anio), u.id);
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(capacitacionPlanSchema)) b: CapacitacionPlanInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id);
  }

  @Put(':id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(capacitacionPlanSchema)) b: CapacitacionPlanInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Put(':id/asistencia')
  @Permiso('gestionar_pesv')
  asistencia(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(asistenciaCapacitacionSchema)) b: AsistenciaCapacitacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.asistencia(o.id, id, b, u.id);
  }

  @Post(':id/ejecutar')
  @Permiso('gestionar_pesv')
  ejecutar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(ejecutarCapacitacionSchema)) b: EjecutarCapacitacionInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.ejecutar(o.id, id, b, u.id);
  }

  @Put(':id/eficacia')
  @Permiso('gestionar_pesv')
  eficacia(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(eficaciaSchema)) b: EficaciaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.eficacia(o.id, id, b, u.id);
  }

  @Get(':id/lista-asistencia')
  @Permiso('ver')
  async listaAsistencia(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = await this.s.pdfAsistencia(o.id, id);
    return enviarArchivo(res, r.datos, r.nombre, MIME_PDF);
  }

  @Post(':id/evidencia')
  @Permiso('gestionar_pesv')
  evidenciaAsistencia(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidenciaAsistencia(o.id, id, u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [CapacitacionController], providers: [CapacitacionService], exports: [CapacitacionService] })
export class CapacitacionModule {}

