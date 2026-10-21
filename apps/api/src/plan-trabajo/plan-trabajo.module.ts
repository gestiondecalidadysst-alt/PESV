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
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  actividadTrabajoSchema,
  cumplimientoPlan,
  ESTADOS_ACTIVIDAD,
  FASES_PHVA,
  MESES,
  MESES_LARGOS,
  mesDeCorte,
  mesesAtrasados,
  ORIGENES_ACTIVIDAD,
  seguimientoActividadSchema,
  type ActividadTrabajoInput,
  type EstadoActividad,
  type FasePhva,
  type OrigenActividad,
  type SeguimientoActividadInput,
} from '@pesv/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { config } from '../config.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { goals, planActivities, planFollowups, riskMeasures } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { fechasDeMeses, sincronizarActividad } from './sincronizar.js';

type FilaActividad = typeof planActivities.$inferSelect;
type FilaSeguimiento = typeof planFollowups.$inferSelect;

const hoy = () => new Date().toISOString().slice(0, 10);
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? '—';
const pesos = (v: number | null | undefined) => (v == null ? '—' : new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v));

/** Colores del cronograma: programado, ejecutado y atrasado. */
const CELDA = {
  programado: { fondo: '#DCE8F7', color: '#1C4F8F' },
  ejecutado: { fondo: '#CDEBD9', color: '#1F6B43' },
  atrasado: { fondo: '#F8C9C4', color: '#9E2A1C' },
  noEjecutado: { fondo: '#FDE2C3', color: '#8A4A00' },
} as const;

function aActividad(a: FilaActividad, seguimiento: FilaSeguimiento[], metas: Map<string, { objetivo: string; indicador: string }>, corte: number) {
  const propio = seguimiento.filter((s) => s.activityId === a.id).sort((x, y) => x.month - y.month);
  const seg = propio.map((s) => ({ mes: s.month, ejecutado: s.executed }));
  const ejecutados = propio.filter((s) => s.executed && a.plannedMonths.includes(s.month)).length;
  const atrasados = a.status === 'cancelada' ? [] : mesesAtrasados(a.plannedMonths, seg, corte);
  return {
    id: a.id,
    anio: a.year,
    titulo: a.title,
    descripcion: a.description,
    pasoNumero: a.stepNumber,
    metaId: a.goalId,
    meta: a.goalId ? (metas.get(a.goalId) ?? null) : null,
    fase: a.phase as FasePhva,
    responsable: a.responsibleName,
    recursos: a.resources,
    entregable: a.deliverable,
    presupuesto: a.budget,
    presupuestoEjecutado: a.executedBudget,
    meses: a.plannedMonths,
    estado: a.status as EstadoActividad,
    ejecutadaEl: a.executedOn,
    origen: a.source as OrigenActividad,
    origenId: a.sourceId,
    avance: a.plannedMonths.length ? Math.round((ejecutados / a.plannedMonths.length) * 100) : 0,
    atrasados,
    seguimiento: propio.map((s) => ({ mes: s.month, ejecutado: s.executed, fecha: s.executedOn, nota: s.note, evidenciaId: s.evidenceId })),
  };
}
export type ActividadPlan = ReturnType<typeof aActividad>;

/** Estado de un mes en el cronograma de una actividad. */
function estadoMes(a: ActividadPlan, mes: number): keyof typeof CELDA | null {
  if (!a.meses.includes(mes)) return null;
  const s = a.seguimiento.find((x) => x.mes === mes);
  if (s?.ejecutado) return 'ejecutado';
  if (a.atrasados.includes(mes)) return s ? 'noEjecutado' : 'atrasado';
  return 'programado';
}
const LETRA = { programado: 'P', ejecutado: 'E', atrasado: 'P!', noEjecutado: 'NE' } as const;

/**
 * Plan anual de trabajo del PESV (paso 9): actividades programadas por mes, con su seguimiento,
 * el cumplimiento del plan y la conexión con las metas (paso 7) y las medidas de la matriz (paso 8).
 */
@Injectable()
export class PlanTrabajoService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async actividad(tx: TenantTx, id: string) {
    const [a] = await tx.select().from(planActivities).where(eq(planActivities.id, id));
    if (!a) throw new NotFoundException('Actividad no encontrada');
    return a;
  }

  async consultar(orgId: string, anio: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(planActivities).where(eq(planActivities.year, anio)).orderBy(asc(planActivities.plannedStart), asc(planActivities.createdAt));
      const seguimiento = filas.length ? await tx.select().from(planFollowups).where(inArray(planFollowups.activityId, filas.map((f) => f.id))) : [];
      const listaMetas = await tx.select({ id: goals.id, objetivo: goals.objective, indicador: goals.indicator }).from(goals).where(eq(goals.year, anio)).orderBy(asc(goals.createdAt));
      const metas = new Map(listaMetas.map((m) => [m.id, { objetivo: m.objetivo, indicador: m.indicador }]));
      const corte = mesDeCorte(anio);
      const actividades = filas.map((f) => aActividad(f, seguimiento, metas, corte));
      const vigentes = actividades.filter((a) => a.estado !== 'cancelada');
      const cumplimiento = cumplimientoPlan(actividades.map((a) => ({ meses: a.meses, seguimiento: a.seguimiento, estado: a.estado })), corte);
      const porFase = FASES_PHVA.map((f) => {
        const c = cumplimientoPlan(vigentes.filter((a) => a.fase === f.id).map((a) => ({ meses: a.meses, seguimiento: a.seguimiento, estado: a.estado })), corte);
        return { fase: f.id, actividades: vigentes.filter((a) => a.fase === f.id).length, cumplimiento: c.cumplimiento, ejecucion: c.ejecucion };
      });
      return {
        anio,
        corte,
        metas: listaMetas,
        actividades,
        resumen: {
          ...cumplimiento,
          actividades: vigentes.length,
          ejecutadas: vigentes.filter((a) => a.estado === 'ejecutada').length,
          atrasadas: vigentes.filter((a) => a.atrasados.length > 0).length,
          canceladas: actividades.length - vigentes.length,
          presupuesto: vigentes.reduce((s, a) => s + (a.presupuesto ?? 0), 0),
          presupuestoEjecutado: vigentes.reduce((s, a) => s + (a.presupuestoEjecutado ?? 0), 0),
          porFase,
        },
      };
    });
  }

  guardar(orgId: string, input: ActividadTrabajoInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      if (input.metaId) {
        const [m] = await tx.select({ id: goals.id, year: goals.year }).from(goals).where(eq(goals.id, input.metaId));
        if (!m) throw new BadRequestException('La meta no existe');
        if (m.year !== input.anio) throw new BadRequestException('La meta pertenece a otro año');
      }
      const anterior = id ? await this.actividad(tx, id) : null;
      const valores = {
        year: input.anio,
        title: input.titulo,
        description: input.descripcion ?? null,
        stepNumber: input.pasoNumero ?? null,
        goalId: input.metaId ?? null,
        phase: input.fase,
        responsibleName: input.responsable,
        resources: input.recursos ?? null,
        deliverable: input.entregable ?? null,
        budget: input.presupuesto ?? null,
        executedBudget: input.presupuestoEjecutado ?? null,
        plannedMonths: input.meses,
        ...fechasDeMeses(input.anio, input.meses),
        // El estado sale del seguimiento; aquí solo se decide si se cancela o se reactiva.
        status: input.cancelada ? 'cancelada' : anterior && anterior.status !== 'cancelada' ? anterior.status : 'planeada',
        updatedAt: new Date(),
      };
      const [a] = anterior
        ? await tx.update(planActivities).set(valores).where(eq(planActivities.id, anterior.id)).returning()
        : await tx.insert(planActivities).values({ organizationId: orgId, ...valores }).returning();
      if (anterior) {
        // Si se quitan meses del cronograma, su seguimiento ya no aplica.
        const quitados = anterior.plannedMonths.filter((m) => !input.meses.includes(m));
        if (quitados.length) await tx.delete(planFollowups).where(and(eq(planFollowups.activityId, a!.id), inArray(planFollowups.month, quitados)));
        if (anterior.year !== input.anio) await tx.delete(planFollowups).where(eq(planFollowups.activityId, a!.id));
      }
      await sincronizarActividad(tx, a!.id);
      await auditar(tx, { organizacionId: orgId, actorId, accion: anterior ? 'plan.actividad_actualizada' : 'plan.actividad_creada', entidad: 'plan_activity', entidadId: a!.id, datos: { cancelada: input.cancelada } });
      return { id: a!.id };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const a = await this.actividad(tx, id);
      if (a.source === 'riesgo' && a.sourceId) await tx.update(riskMeasures).set({ planActivityId: null }).where(eq(riskMeasures.id, a.sourceId));
      await tx.delete(planActivities).where(eq(planActivities.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'plan.actividad_eliminada', entidad: 'plan_activity', entidadId: id, datos: { titulo: a.title } });
    });
  }

  /**
   * Registra el seguimiento de un mes programado. Si trae un archivo, se guarda como evidencia del
   * paso de la actividad (queda en revisión del líder PESV).
   */
  async seguimiento(orgId: string, id: string, input: SeguimientoActividadInput, archivo: { nombre: string; tipo: string; datos: Buffer } | null, actorId: string) {
    const a = await this.database.withTenant(orgId, (tx) => this.actividad(tx, id));
    if (a.status === 'cancelada') throw new BadRequestException('La actividad está cancelada');
    if (!a.plannedMonths.includes(input.mes)) throw new BadRequestException(`La actividad no está programada en ${MESES_LARGOS[input.mes - 1]}`);
    const fechaEjecucion = input.ejecutado ? input.fecha! : null;
    if (fechaEjecucion && fechaEjecucion > hoy()) throw new BadRequestException('La fecha de ejecución no puede ser futura');
    let evidenciaId: string | null = null;
    if (archivo) {
      if (!a.stepNumber) throw new BadRequestException('Asigna un paso del PESV a la actividad para guardar la evidencia');
      const ev = await this.evidencias.crear(
        orgId,
        { titulo: `${a.title} · ${MESES_LARGOS[input.mes - 1]} de ${a.year}`, pasoNumero: a.stepNumber, descripcion: input.nota ?? 'Evidencia del seguimiento al plan anual de trabajo.' },
        archivo,
        actorId,
      );
      evidenciaId = ev.id;
    }
    return this.database.withTenant(orgId, async (tx) => {
      const [previo] = await tx.select().from(planFollowups).where(and(eq(planFollowups.activityId, id), eq(planFollowups.month, input.mes)));
      const valores = { executed: input.ejecutado, executedOn: fechaEjecucion, note: input.nota ?? null, evidenceId: evidenciaId ?? previo?.evidenceId ?? null, updatedAt: new Date() };
      if (previo) await tx.update(planFollowups).set(valores).where(eq(planFollowups.id, previo.id));
      else await tx.insert(planFollowups).values({ organizationId: orgId, activityId: id, month: input.mes, createdBy: actorId, ...valores });
      const estado = await sincronizarActividad(tx, id);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'plan.seguimiento', entidad: 'plan_activity', entidadId: id, datos: { mes: input.mes, ejecutado: input.ejecutado, evidenciaId } });
      return { estado, evidenciaId };
    });
  }

  quitarSeguimiento(orgId: string, id: string, mes: number, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.actividad(tx, id);
      await tx.delete(planFollowups).where(and(eq(planFollowups.activityId, id), eq(planFollowups.month, mes)));
      const estado = await sincronizarActividad(tx, id);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'plan.seguimiento_eliminado', entidad: 'plan_activity', entidadId: id, datos: { mes } });
      return { estado };
    });
  }

  // Documentos ------------------------------------------------------------------------

  async pdf(orgId: string, anio: number) {
    const [plan, ctx] = await Promise.all([this.consultar(orgId, anio), this.formato.contexto(orgId, 'plan_trabajo', `PLAN ANUAL DE TRABAJO DEL PESV ${anio}`)]);
    const r = plan.resumen;
    const doc = new DocumentoPdf(ctx, true);
    doc.datos(
      [
        ['Año', String(anio)],
        ['Actividades', `${r.actividades}${r.canceladas ? ` (+${r.canceladas} canceladas)` : ''}`],
        ['Cumplimiento a la fecha', r.cumplimiento == null ? 'Sin actividades vencidas' : `${r.cumplimiento} % (${r.ejecutadosALaFecha} de ${r.programadosALaFecha})`],
        ['Ejecución del año', r.ejecucion == null ? '—' : `${r.ejecucion} % (${r.ejecutados} de ${r.programados})`],
        ['Presupuesto', pesos(r.presupuesto)],
        ['Presupuesto ejecutado', pesos(r.presupuestoEjecutado)],
        ['Actividades atrasadas', String(r.atrasadas)],
        ['Fecha de corte', hoy()],
      ],
      4,
    );
    doc.titulo('Cronograma');
    doc.parrafo('P: programado · E: ejecutado · P!: programado y vencido sin seguimiento · NE: no ejecutado (con justificación).', { tamano: 7.5, color: '#5b6576' });
    const celdaMes = (a: ActividadPlan, mes: number): CeldaPdf => {
      const e = estadoMes(a, mes);
      return e ? { texto: LETRA[e], fondo: CELDA[e].fondo, color: CELDA[e].color, negrita: true, alinear: 'center' } : { texto: '', alinear: 'center' };
    };
    doc.tabla(
      [
        { titulo: '#', ancho: 1.6, alinear: 'center' },
        { titulo: 'Actividad', ancho: 12 },
        { titulo: 'Paso · fase', ancho: 3.6 },
        { titulo: 'Objetivo / meta', ancho: 7 },
        { titulo: 'Responsable', ancho: 5 },
        { titulo: 'Recursos · presupuesto', ancho: 6 },
        ...MESES.map((m) => ({ titulo: m, ancho: 1.9, alinear: 'center' as const })),
        { titulo: 'Avance', ancho: 2.6, alinear: 'center' },
      ],
      plan.actividades.map((a, i) => [
        { texto: String(i + 1), alinear: 'center' },
        [a.titulo, a.descripcion, a.entregable ? `Entregable: ${a.entregable}` : null, a.origen !== 'manual' ? `Origen: ${nombreDe(ORIGENES_ACTIVIDAD, a.origen)}` : null, a.estado === 'cancelada' ? 'CANCELADA' : null].filter(Boolean).join('\n'),
        [a.pasoNumero ? `Paso ${a.pasoNumero}` : 'Sin paso', nombreDe(FASES_PHVA, a.fase)].join('\n'),
        a.meta ? `${a.meta.objetivo}\n${a.meta.indicador}` : '—',
        a.responsable,
        [a.recursos, a.presupuesto != null ? `Ppto.: ${pesos(a.presupuesto)}` : null, a.presupuestoEjecutado != null ? `Ejec.: ${pesos(a.presupuestoEjecutado)}` : null].filter(Boolean).join('\n') || '—',
        ...MESES.map((_, m) => celdaMes(a, m + 1)),
        { texto: a.estado === 'cancelada' ? '—' : `${a.avance} %`, negrita: true, alinear: 'center' },
      ]),
      { tamano: 6.8 },
    );
    doc.titulo('Cumplimiento por mes');
    let acumP = 0;
    let acumE = 0;
    doc.tabla(
      [{ titulo: 'Concepto', ancho: 6 }, ...MESES.map((m) => ({ titulo: m, ancho: 2, alinear: 'center' as const })), { titulo: 'Total', ancho: 2.4, alinear: 'center' }],
      [
        ['Programadas', ...r.porMes.map((m) => String(m.programados)), String(r.programados)],
        ['Ejecutadas', ...r.porMes.map((m) => String(m.ejecutados)), String(r.ejecutados)],
        [
          'Cumplimiento acumulado',
          ...r.porMes.map((m) => {
            acumP += m.programados;
            acumE += m.ejecutados;
            return acumP ? `${Math.round((acumE / acumP) * 100)} %` : '—';
          }),
          r.ejecucion == null ? '—' : `${r.ejecucion} %`,
        ],
      ],
      { tamano: 7.5 },
    );
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-plan-anual-de-trabajo-${anio}.pdf` };
  }

  async excel(orgId: string, anio: number) {
    const [plan, ctx] = await Promise.all([this.consultar(orgId, anio), this.formato.contexto(orgId, 'plan_trabajo', `PLAN ANUAL DE TRABAJO DEL PESV ${anio}`)]);
    const r = plan.resumen;
    const celda = (a: ActividadPlan, mes: number): ValorExcel => {
      const e = estadoMes(a, mes);
      return e ? { valor: LETRA[e], fondo: CELDA[e].fondo, negrita: true } : null;
    };
    let acumP = 0;
    let acumE = 0;
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Plan de trabajo',
        horizontal: true,
        notas: [
          `Año ${anio}. Cumplimiento a la fecha: ${r.cumplimiento == null ? '—' : `${r.cumplimiento} %`}. Ejecución del año: ${r.ejecucion == null ? '—' : `${r.ejecucion} %`}. Generado el ${hoy()}.`,
          'P: programado · E: ejecutado · P!: vencido sin seguimiento · NE: no ejecutado.',
        ],
        columnas: [
          { titulo: '#', ancho: 5 },
          { titulo: 'Fase PHVA', ancho: 10 },
          { titulo: 'Paso PESV', ancho: 9 },
          { titulo: 'Actividad', ancho: 34 },
          { titulo: 'Descripción', ancho: 30 },
          { titulo: 'Objetivo / meta', ancho: 28 },
          { titulo: 'Origen', ancho: 18 },
          { titulo: 'Responsable', ancho: 18 },
          { titulo: 'Recursos', ancho: 22 },
          { titulo: 'Entregable', ancho: 22 },
          { titulo: 'Presupuesto', ancho: 14, formato: '"$"#,##0' },
          { titulo: 'Ejecutado', ancho: 14, formato: '"$"#,##0' },
          ...MESES.map((m) => ({ titulo: m, ancho: 5 })),
          { titulo: 'Avance %', ancho: 9 },
          { titulo: 'Estado', ancho: 12 },
        ],
        filas: plan.actividades.map((a, i) => [
          i + 1,
          nombreDe(FASES_PHVA, a.fase),
          a.pasoNumero,
          a.titulo,
          a.descripcion,
          a.meta ? `${a.meta.objetivo} — ${a.meta.indicador}` : null,
          nombreDe(ORIGENES_ACTIVIDAD, a.origen),
          a.responsable,
          a.recursos,
          a.entregable,
          a.presupuesto,
          a.presupuestoEjecutado,
          ...MESES.map((_, m) => celda(a, m + 1)),
          a.estado === 'cancelada' ? null : a.avance,
          nombreDe(ESTADOS_ACTIVIDAD, a.estado),
        ]),
      },
      {
        nombre: 'Seguimiento',
        columnas: [
          { titulo: 'Actividad', ancho: 40 },
          { titulo: 'Mes', ancho: 12 },
          { titulo: 'Ejecutada', ancho: 10 },
          { titulo: 'Fecha', ancho: 12 },
          { titulo: 'Observación', ancho: 60 },
          { titulo: 'Con evidencia', ancho: 12 },
        ],
        filas: plan.actividades.flatMap((a) =>
          a.seguimiento.map((s): ValorExcel[] => [a.titulo, MESES_LARGOS[s.mes - 1]!, s.ejecutado ? 'Sí' : 'No', s.fecha, s.nota, s.evidenciaId ? 'Sí' : 'No']),
        ),
      },
      {
        nombre: 'Cumplimiento',
        columnas: [
          { titulo: 'Mes', ancho: 14 },
          { titulo: 'Programadas', ancho: 13 },
          { titulo: 'Ejecutadas', ancho: 13 },
          { titulo: 'Cumplimiento del mes %', ancho: 22 },
          { titulo: 'Cumplimiento acumulado %', ancho: 24 },
        ],
        filas: r.porMes.map((m, i) => {
          acumP += m.programados;
          acumE += m.ejecutados;
          return [MESES_LARGOS[i]!, m.programados, m.ejecutados, m.programados ? Math.round((m.ejecutados / m.programados) * 100) : null, acumP ? Math.round((acumE / acumP) * 100) : null];
        }),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-plan-anual-de-trabajo-${anio}.xlsx` };
  }

  /** Guarda el plan en PDF como evidencia del paso 9 (queda en revisión del líder PESV). */
  async evidencia(orgId: string, anio: number, actorId: string) {
    const { datos, nombre } = await this.pdf(orgId, anio);
    const ev = await this.evidencias.crear(
      orgId,
      { titulo: `Plan anual de trabajo ${anio} · corte ${hoy()}`, pasoNumero: 9, descripcion: 'Generado desde el plan de trabajo de la plataforma.' },
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

@Controller('org/plan-trabajo')
export class PlanTrabajoController {
  constructor(private readonly s: PlanTrabajoService) {}

  @Get()
  @Permiso('ver')
  consultar(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) {
    return this.s.consultar(o.id, anioDe(anio));
  }

  @Post()
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(actividadTrabajoSchema)) b: ActividadTrabajoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id);
  }

  @Put(':id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(actividadTrabajoSchema)) b: ActividadTrabajoInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Post(':id/seguimiento')
  @Permiso('gestionar_pesv')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: config.maxUploadBytes } }))
  seguimiento(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(seguimientoActividadSchema)) b: SeguimientoActividadInput,
    @OrgActual() o: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    const adjunto = archivo ? { nombre: Buffer.from(archivo.originalname, 'latin1').toString('utf8'), tipo: archivo.mimetype, datos: archivo.buffer } : null;
    return this.s.seguimiento(o.id, id, b, adjunto, u.id);
  }

  @Delete(':id/seguimiento/:mes')
  @Permiso('gestionar_pesv')
  quitarSeguimiento(@Param('id', ParseUUIDPipe) id: string, @Param('mes', ParseIntPipe) mes: number, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.quitarSeguimiento(o.id, id, mes, u.id);
  }

  @Get('exportar')
  @Permiso('ver')
  async exportar(@Query('anio') anio: string | undefined, @Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.excel(o.id, anioDe(anio)) : await this.s.pdf(o.id, anioDe(anio));
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@Query('anio') anio: string | undefined, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidencia(o.id, anioDe(anio), u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [PlanTrabajoController], providers: [PlanTrabajoService], exports: [PlanTrabajoService] })
export class PlanTrabajoModule {}
