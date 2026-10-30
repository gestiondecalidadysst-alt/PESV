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
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ACTORES_VIALES,
  FACTORES_RIESGO_VIAL,
  JERARQUIA_CONTROLES,
  METODOLOGIAS_RIESGO,
  NIVELES_CONSECUENCIA,
  NIVELES_DEFICIENCIA,
  NIVELES_EXPOSICION,
  NIVELES_RIESGO_5X5,
  NIVELES_RIESGO_GTC45,
  PROBABILIDADES_5X5,
  SEVERIDADES_5X5,
  TIPOS_DESPLAZAMIENTO,
  medidaSchema,
  metodologiaSchema,
  riesgoViaSchema,
  type EvaluacionRiesgo,
  type MedidaInput,
  type MetodologiaRiesgo,
  type RiesgoViaInput,
} from '@pesv/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { organizations, planActivities, riskMeasures, roadRisks } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { ejecutarMesesPendientes, fechasDeMeses, revertirMedidaImplementada, sincronizarActividad } from '../plan-trabajo/sincronizar.js';
import { evaluacionInherente, evaluacionResidual } from './evaluacion.js';
import { hoyColombia } from '../common/fechas.js';

type FilaRiesgo = typeof roadRisks.$inferSelect;
type FilaMedida = typeof riskMeasures.$inferSelect;

const nombre = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const hoy = hoyColombia;

const aMedida = (m: FilaMedida) => ({
  id: m.id,
  riesgoId: m.riskId,
  jerarquia: m.hierarchy,
  descripcion: m.description,
  responsable: m.responsibleName,
  fechaLimite: m.dueOn,
  estado: m.status,
  actividadPlanId: m.planActivityId,
});

const aRiesgo = (r: FilaRiesgo, medidas: FilaMedida[] = []) => ({
  id: r.id,
  metodologia: r.methodology as MetodologiaRiesgo,
  proceso: r.process,
  actividad: r.activity,
  cargo: r.jobRole,
  rutinaria: r.routine,
  tipoDesplazamiento: r.tripType,
  actorVial: r.roadActor,
  factor: r.riskFactor,
  peligro: r.hazard,
  descripcion: r.description,
  efectos: r.effects,
  expuestos: r.exposedCount,
  controlFuente: r.controlSource,
  controlMedio: r.controlMedium,
  controlIndividuo: r.controlIndividual,
  inherenteDatos: { deficiencia: r.deficiency, exposicion: r.exposure, consecuencia: r.consequence, probabilidad: r.probability, severidad: r.severity },
  residualDatos: {
    deficiencia: r.residualDeficiency,
    exposicion: r.residualExposure,
    consecuencia: r.residualConsequence,
    probabilidad: r.residualProbability,
    severidad: r.residualSeverity,
  },
  inherente: evaluacionInherente(r),
  residual: evaluacionResidual(r),
  peorConsecuencia: r.worstConsequence,
  requisitoLegal: r.legalRequirement,
  referenciaLegal: r.legalReference,
  responsable: r.ownerName,
  estado: r.status,
  identificadoEl: r.identifiedOn,
  medidas: medidas.filter((m) => m.riskId === r.id).map(aMedida),
});
export type RiesgoMatriz = ReturnType<typeof aRiesgo>;

const valoresRiesgo = (i: RiesgoViaInput) => {
  const gtc = i.metodologia === 'gtc45';
  const r = i.residual ?? {};
  return {
    methodology: i.metodologia,
    process: i.proceso,
    activity: i.actividad ?? null,
    jobRole: i.cargo ?? null,
    routine: i.rutinaria,
    tripType: i.tipoDesplazamiento,
    roadActor: i.actorVial,
    riskFactor: i.factor,
    hazard: i.peligro,
    description: i.descripcion ?? null,
    effects: i.efectos ?? null,
    exposedCount: i.expuestos ?? null,
    controlSource: i.controlFuente ?? null,
    controlMedium: i.controlMedio ?? null,
    controlIndividual: i.controlIndividuo ?? null,
    // Se guardan solo los datos de la metodología elegida.
    deficiency: gtc ? (i.inherente.deficiencia ?? null) : null,
    exposure: gtc ? (i.inherente.exposicion ?? null) : null,
    consequence: gtc ? (i.inherente.consecuencia ?? null) : null,
    probability: gtc ? null : (i.inherente.probabilidad ?? null),
    severity: gtc ? null : (i.inherente.severidad ?? null),
    residualDeficiency: gtc ? (r.deficiencia ?? null) : null,
    residualExposure: gtc ? (r.exposicion ?? null) : null,
    residualConsequence: gtc ? (r.consecuencia ?? null) : null,
    residualProbability: gtc ? null : (r.probabilidad ?? null),
    residualSeverity: gtc ? null : (r.severidad ?? null),
    worstConsequence: i.peorConsecuencia ?? null,
    legalRequirement: i.requisitoLegal,
    legalReference: i.referenciaLegal ?? null,
    ownerName: i.responsable ?? null,
    status: i.estado,
    updatedAt: new Date(),
  };
};

/** Orden de la matriz: primero los más críticos, luego los de mayor valor. */
const porCriticidad = (a: RiesgoMatriz, b: RiesgoMatriz) =>
  (a.inherente?.prioridad ?? 9) - (b.inherente?.prioridad ?? 9) || (b.inherente?.valor ?? 0) - (a.inherente?.valor ?? 0);

/**
 * Matriz de identificación de peligros, evaluación y control de riesgos viales (paso 6). Las
 * medidas de intervención se pueden enviar al plan de trabajo (pasos 8 y 9).
 */
@Injectable()
export class MatrizService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async riesgo(tx: TenantTx, id: string) {
    const [r] = await tx.select().from(roadRisks).where(eq(roadRisks.id, id));
    if (!r) throw new NotFoundException('Riesgo no encontrado');
    return r;
  }

  async consultar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [org] = await tx.select({ m: organizations.riskMethodology }).from(organizations).where(eq(organizations.id, orgId));
      const filas = await tx.select().from(roadRisks).orderBy(asc(roadRisks.createdAt));
      const medidas = filas.length ? await tx.select().from(riskMeasures).where(inArray(riskMeasures.riskId, filas.map((f) => f.id))).orderBy(asc(riskMeasures.createdAt)) : [];
      const metodologia = (org?.m ?? 'gtc45') as MetodologiaRiesgo;
      const riesgos = filas.map((f) => aRiesgo(f, medidas)).sort(porCriticidad);
      const activos = riesgos.filter((r) => r.estado !== 'cerrado');
      const niveles = metodologia === 'gtc45' ? NIVELES_RIESGO_GTC45.map((n) => n.nivel) : NIVELES_RIESGO_5X5.map((n) => n.nivel);
      return {
        metodologia,
        riesgos,
        resumen: {
          total: activos.length,
          criticos: activos.filter((r) => r.inherente?.critico).length,
          otraMetodologia: activos.filter((r) => r.metodologia !== metodologia).length,
          porNivel: niveles.map((n) => ({ nivel: n, inherente: activos.filter((r) => r.metodologia === metodologia && r.inherente?.nivel === n).length, residual: activos.filter((r) => r.metodologia === metodologia && r.residual?.nivel === n).length })),
          medidasPendientes: activos.flatMap((r) => r.medidas).filter((m) => m.estado !== 'implementada').length,
        },
      };
    });
  }

  cambiarMetodologia(orgId: string, metodologia: MetodologiaRiesgo, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await tx.update(organizations).set({ riskMethodology: metodologia }).where(eq(organizations.id, orgId));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'matriz.metodologia', entidad: 'organization', entidadId: orgId, datos: { metodologia } });
      return { metodologia };
    });
  }

  guardar(orgId: string, input: RiesgoViaInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      if (id) await this.riesgo(tx, id);
      const [r] = id
        ? await tx.update(roadRisks).set(valoresRiesgo(input)).where(eq(roadRisks.id, id)).returning()
        : await tx.insert(roadRisks).values({ organizationId: orgId, ...valoresRiesgo(input) }).returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'riesgo.actualizado' : 'riesgo.identificado', entidad: 'road_risk', entidadId: r!.id });
      const medidas = await tx.select().from(riskMeasures).where(eq(riskMeasures.riskId, r!.id));
      return aRiesgo(r!, medidas);
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.riesgo(tx, id);
      await tx.delete(roadRisks).where(eq(roadRisks.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'riesgo.eliminado', entidad: 'road_risk', entidadId: id, datos: { peligro: r.hazard } });
    });
  }

  // Medidas de intervención -----------------------------------------------------

  agregarMedida(orgId: string, riesgoId: string, input: MedidaInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.riesgo(tx, riesgoId);
      const [m] = await tx
        .insert(riskMeasures)
        .values({
          organizationId: orgId,
          riskId: riesgoId,
          hierarchy: input.jerarquia,
          description: input.descripcion,
          responsibleName: input.responsable ?? null,
          dueOn: input.fechaLimite ?? null,
          status: input.estado,
          createdBy: actorId,
        })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'riesgo.medida', entidad: 'risk_measure', entidadId: m!.id });
      return aMedida(m!);
    });
  }

  editarMedida(orgId: string, id: string, input: MedidaInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [m] = await tx
        .update(riskMeasures)
        .set({ hierarchy: input.jerarquia, description: input.descripcion, responsibleName: input.responsable ?? null, dueOn: input.fechaLimite ?? null, status: input.estado, updatedAt: new Date() })
        .where(eq(riskMeasures.id, id))
        .returning();
      if (!m) throw new NotFoundException('Medida no encontrada');
      // Si la medida está en el plan de trabajo, el cronograma refleja su avance.
      if (m.planActivityId) {
        if (input.estado === 'implementada') {
          await ejecutarMesesPendientes(tx, m.planActivityId, hoy(), actorId);
        } else {
          await revertirMedidaImplementada(tx, m.planActivityId);
        }
        await sincronizarActividad(tx, m.planActivityId, false);
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'riesgo.medida_actualizada', entidad: 'risk_measure', entidadId: id, datos: { estado: input.estado } });
      return aMedida(m);
    });
  }

  eliminarMedida(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [m] = await tx.delete(riskMeasures).where(eq(riskMeasures.id, id)).returning();
      if (!m) throw new NotFoundException('Medida no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'riesgo.medida_eliminada', entidad: 'risk_measure', entidadId: id });
    });
  }

  /** Crea en el plan de trabajo la actividad que implementa la medida (programas del paso 8). */
  enviarAlPlan(orgId: string, medidaId: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [m] = await tx.select().from(riskMeasures).where(eq(riskMeasures.id, medidaId));
      if (!m) throw new NotFoundException('Medida no encontrada');
      if (m.planActivityId) throw new BadRequestException('Esta medida ya está en el plan de trabajo');
      const r = await this.riesgo(tx, m.riskId);
      // Se programa en el mes de la fecha límite (o en el mes actual si no tiene).
      const fin = m.dueOn ?? hoy();
      const anio = Number(fin.slice(0, 4));
      const meses = [Number(fin.slice(5, 7))];
      const jerarquia = nombre(JERARQUIA_CONTROLES.map((j) => ({ id: j.id, nombre: j.nombre })), m.hierarchy);
      const [a] = await tx
        .insert(planActivities)
        .values({
          organizationId: orgId,
          year: anio,
          title: m.description,
          description: `Medida de intervención (${jerarquia}) para el riesgo «${r.hazard}».`,
          stepNumber: 8,
          phase: 'hacer',
          responsibleName: m.responsibleName ?? r.ownerName ?? 'Por asignar',
          ...fechasDeMeses(anio, meses),
          plannedMonths: meses,
          status: 'planeada',
          source: 'riesgo',
          sourceId: m.id,
        })
        .returning();
      await tx.update(riskMeasures).set({ planActivityId: a!.id, updatedAt: new Date() }).where(eq(riskMeasures.id, m.id));
      if (m.status === 'implementada') {
        await ejecutarMesesPendientes(tx, a!.id, hoy(), actorId);
        await sincronizarActividad(tx, a!.id, false);
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'riesgo.medida_al_plan', entidad: 'plan_activity', entidadId: a!.id, datos: { riesgo: r.hazard, jerarquia } });
      return { actividadId: a!.id };
    });
  }

  // Documentos ------------------------------------------------------------------------

  private textoEvaluacion = (e: EvaluacionRiesgo | null) => (e ? `${e.nivel} · ${e.aceptabilidad}` : '—');

  private medidasTexto(r: RiesgoMatriz) {
    if (!r.medidas.length) return '—';
    return r.medidas
      .map((m) => `${nombre(JERARQUIA_CONTROLES.map((j) => ({ id: j.id, nombre: j.nombre })), m.jerarquia)}: ${m.descripcion}${m.responsable ? ` (${m.responsable}` : ''}${m.fechaLimite ? `${m.responsable ? ', ' : ' ('}${m.fechaLimite}` : ''}${m.responsable || m.fechaLimite ? ')' : ''}`)
      .join('\n');
  }

  async pdf(orgId: string) {
    const [{ metodologia, riesgos, resumen }, ctx] = await Promise.all([this.consultar(orgId), this.formato.contexto(orgId, 'matriz_riesgos')]);
    const doc = new DocumentoPdf(ctx, true);
    const nombreMetodologia = METODOLOGIAS_RIESGO.find((m) => m.id === metodologia)!.nombre;
    doc.datos(
      [
        ['Metodología', nombreMetodologia],
        ['Fecha de generación', hoy()],
        ['Riesgos identificados', String(resumen.total)],
        ['Riesgos críticos (programas del paso 8)', String(resumen.criticos)],
      ],
      4,
    );
    doc.titulo('Matriz de peligros y riesgos viales');
    const celdaNivel = (e: EvaluacionRiesgo | null): CeldaPdf => (e ? { texto: `${e.nivel}\n${e.valor}`, fondo: e.fondo, color: e.color, negrita: true, alinear: 'center' } : { texto: '—', alinear: 'center' });
    doc.tabla(
      [
        { titulo: '#', ancho: 2, alinear: 'center' },
        { titulo: 'Proceso / actividad / cargo', ancho: 9 },
        { titulo: 'Actor vial · desplazamiento · factor', ancho: 8 },
        { titulo: 'Peligro · descripción · efectos', ancho: 13 },
        { titulo: 'Controles existentes (fuente · medio · individuo)', ancho: 12 },
        { titulo: 'Evaluación', ancho: 9 },
        { titulo: 'Nivel', ancho: 4, alinear: 'center' },
        { titulo: 'Aceptabilidad', ancho: 6 },
        { titulo: 'Medidas de intervención', ancho: 15 },
        { titulo: 'Residual', ancho: 4, alinear: 'center' },
      ],
      riesgos.map((r, i) => [
        { texto: String(i + 1), alinear: 'center' },
        [r.proceso, r.actividad, r.cargo, r.rutinaria ? 'Rutinaria' : 'No rutinaria'].filter(Boolean).join('\n'),
        [nombre(ACTORES_VIALES, r.actorVial), nombre(TIPOS_DESPLAZAMIENTO, r.tipoDesplazamiento), nombre(FACTORES_RIESGO_VIAL, r.factor)].join('\n'),
        [r.peligro, r.descripcion, r.efectos ? `Efectos: ${r.efectos}` : null, r.expuestos != null ? `Expuestos: ${r.expuestos}` : null].filter(Boolean).join('\n'),
        [r.controlFuente && `Fuente: ${r.controlFuente}`, r.controlMedio && `Medio: ${r.controlMedio}`, r.controlIndividuo && `Individuo: ${r.controlIndividuo}`].filter(Boolean).join('\n') || 'Sin controles',
        r.inherente?.detalle ?? (r.metodologia !== metodologia ? 'Evaluado con otra metodología' : '—'),
        celdaNivel(r.inherente),
        r.inherente ? `${r.inherente.aceptabilidad}${r.requisitoLegal ? '\nRequisito legal' : ''}` : '—',
        this.medidasTexto(r),
        celdaNivel(r.residual),
      ]),
      { tamano: 6.8 },
    );

    doc.titulo('Criterios de evaluación');
    if (metodologia === 'gtc45') {
      doc.tabla(
        [{ titulo: 'Escala', ancho: 3 }, { titulo: 'Valor', ancho: 2, alinear: 'center' }, { titulo: 'Nombre', ancho: 3 }, { titulo: 'Significado', ancho: 12 }],
        [
          ...NIVELES_DEFICIENCIA.map((n) => ['Deficiencia (ND)', String(n.valor), n.nombre, n.descripcion]),
          ...NIVELES_EXPOSICION.map((n) => ['Exposición (NE)', String(n.valor), n.nombre, n.descripcion]),
          ...NIVELES_CONSECUENCIA.map((n) => ['Consecuencia (NC)', String(n.valor), n.nombre, n.descripcion]),
          ...NIVELES_RIESGO_GTC45.map((n): (string | CeldaPdf)[] => ['Nivel de riesgo (NR)', { texto: n.nivel, fondo: n.fondo, color: n.color, negrita: true, alinear: 'center' }, n.aceptabilidad, n.significado]),
        ],
        { tamano: 7.5 },
      );
    } else {
      doc.tabla(
        [{ titulo: 'Escala', ancho: 3 }, { titulo: 'Valor', ancho: 2, alinear: 'center' }, { titulo: 'Nombre', ancho: 3 }, { titulo: 'Significado', ancho: 12 }],
        [
          ...PROBABILIDADES_5X5.map((n) => ['Probabilidad', String(n.valor), n.nombre, n.descripcion]),
          ...SEVERIDADES_5X5.map((n) => ['Severidad', String(n.valor), n.nombre, n.descripcion]),
          ...NIVELES_RIESGO_5X5.map((n): (string | CeldaPdf)[] => ['Nivel de riesgo', { texto: n.nivel, fondo: n.fondo, color: n.color, negrita: true, alinear: 'center' }, n.aceptabilidad, n.significado]),
        ],
        { tamano: 7.5 },
      );
    }
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-matriz-riesgos-viales.pdf` };
  }

  async excel(orgId: string) {
    const [{ metodologia, riesgos }, ctx] = await Promise.all([this.consultar(orgId), this.formato.contexto(orgId, 'matriz_riesgos')]);
    const gtc = metodologia === 'gtc45';
    const nivel = (e: EvaluacionRiesgo | null): ValorExcel => (e ? { valor: e.nivel, fondo: e.fondo, negrita: true } : null);
    const medidasDe = (r: RiesgoMatriz, j: string) =>
      r.medidas
        .filter((m) => m.jerarquia === j)
        .map((m) => `${m.descripcion}${m.responsable ? ` · ${m.responsable}` : ''}${m.fechaLimite ? ` · ${m.fechaLimite}` : ''} [${m.estado}]`)
        .join('\n') || null;
    const columnasEval = gtc
      ? [{ titulo: 'ND', ancho: 6 }, { titulo: 'NE', ancho: 6 }, { titulo: 'NP', ancho: 6 }, { titulo: 'Interpretación NP', ancho: 12 }, { titulo: 'NC', ancho: 6 }, { titulo: 'NR', ancho: 8 }]
      : [{ titulo: 'Probabilidad', ancho: 11 }, { titulo: 'Severidad', ancho: 11 }, { titulo: 'Valor', ancho: 8 }];
    const valoresEval = (r: RiesgoMatriz): ValorExcel[] => {
      const d = r.inherenteDatos;
      if (!gtc) return [d.probabilidad, d.severidad, r.inherente?.valor ?? null];
      const np = d.deficiencia != null && d.exposicion != null ? d.deficiencia * d.exposicion : null;
      return [d.deficiencia, d.exposicion, np, r.inherente?.detalle.match(/\(([^)]+)\)/)?.[1] ?? null, d.consecuencia, r.inherente?.valor ?? null];
    };
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Matriz',
        horizontal: true,
        notas: [`Metodología: ${METODOLOGIAS_RIESGO.find((m) => m.id === metodologia)!.nombre}. Generado el ${hoy()}.`],
        columnas: [
          { titulo: '#', ancho: 5 },
          { titulo: 'Proceso', ancho: 18 },
          { titulo: 'Actividad', ancho: 20 },
          { titulo: 'Cargo', ancho: 16 },
          { titulo: 'Rutinaria', ancho: 9 },
          { titulo: 'Tipo de desplazamiento', ancho: 14 },
          { titulo: 'Actor vial', ancho: 14 },
          { titulo: 'Factor de riesgo', ancho: 16 },
          { titulo: 'Peligro', ancho: 28 },
          { titulo: 'Descripción', ancho: 30 },
          { titulo: 'Efectos posibles', ancho: 24 },
          { titulo: 'Expuestos', ancho: 9 },
          { titulo: 'Control en la fuente', ancho: 22 },
          { titulo: 'Control en el medio', ancho: 22 },
          { titulo: 'Control en el individuo', ancho: 22 },
          ...columnasEval,
          { titulo: 'Nivel de riesgo', ancho: 10 },
          { titulo: 'Aceptabilidad', ancho: 20 },
          { titulo: 'Peor consecuencia', ancho: 20 },
          { titulo: 'Requisito legal', ancho: 10 },
          { titulo: 'Referencia legal', ancho: 20 },
          ...JERARQUIA_CONTROLES.map((j) => ({ titulo: j.nombre, ancho: 26 })),
          { titulo: 'Nivel residual', ancho: 10 },
          { titulo: 'Responsable', ancho: 18 },
          { titulo: 'Estado', ancho: 11 },
        ],
        filas: riesgos.map((r, i) => [
          i + 1,
          r.proceso,
          r.actividad,
          r.cargo,
          r.rutinaria ? 'Sí' : 'No',
          nombre(TIPOS_DESPLAZAMIENTO, r.tipoDesplazamiento),
          nombre(ACTORES_VIALES, r.actorVial),
          nombre(FACTORES_RIESGO_VIAL, r.factor),
          r.peligro,
          r.descripcion,
          r.efectos,
          r.expuestos,
          r.controlFuente,
          r.controlMedio,
          r.controlIndividuo,
          ...(r.metodologia === metodologia ? valoresEval(r) : columnasEval.map(() => null)),
          nivel(r.inherente),
          r.inherente?.aceptabilidad ?? null,
          r.peorConsecuencia,
          r.requisitoLegal ? 'Sí' : 'No',
          r.referenciaLegal,
          ...JERARQUIA_CONTROLES.map((j) => medidasDe(r, j.id)),
          nivel(r.residual),
          r.responsable,
          r.estado,
        ]),
      },
      {
        nombre: 'Criterios',
        columnas: [{ titulo: 'Escala', ancho: 22 }, { titulo: 'Valor', ancho: 8 }, { titulo: 'Nombre', ancho: 22 }, { titulo: 'Significado', ancho: 80 }],
        filas: gtc
          ? [
              ...NIVELES_DEFICIENCIA.map((n) => ['Deficiencia (ND)', n.valor, n.nombre, n.descripcion]),
              ...NIVELES_EXPOSICION.map((n) => ['Exposición (NE)', n.valor, n.nombre, n.descripcion]),
              ...NIVELES_CONSECUENCIA.map((n) => ['Consecuencia (NC)', n.valor, n.nombre, n.descripcion]),
              ...NIVELES_RIESGO_GTC45.map((n): ValorExcel[] => ['Nivel de riesgo (NR)', { valor: n.nivel, fondo: n.fondo, negrita: true }, n.aceptabilidad, n.significado]),
            ]
          : [
              ...PROBABILIDADES_5X5.map((n) => ['Probabilidad', n.valor, n.nombre, n.descripcion]),
              ...SEVERIDADES_5X5.map((n) => ['Severidad', n.valor, n.nombre, n.descripcion]),
              ...NIVELES_RIESGO_5X5.map((n): ValorExcel[] => ['Nivel de riesgo', { valor: n.nivel, fondo: n.fondo, negrita: true }, n.aceptabilidad, n.significado]),
            ],
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-matriz-riesgos-viales.xlsx` };
  }

  /** Guarda la matriz en PDF como evidencia del paso 6 (queda en revisión del líder PESV). */
  async evidencia(orgId: string, actorId: string) {
    const { datos, nombre: archivo } = await this.pdf(orgId);
    const ev = await this.evidencias.crear(
      orgId,
      { titulo: `Matriz de riesgos viales · ${hoy()}`, pasoNumero: 6, descripcion: 'Generada desde la matriz de riesgos de la plataforma.' },
      { nombre: archivo, tipo: MIME_PDF, datos },
      actorId,
    );
    return { evidenciaId: ev.id };
  }
}

@Controller('org/matriz')
export class MatrizController {
  constructor(private readonly s: MatrizService) {}

  @Get()
  @Permiso('ver')
  consultar(@OrgActual() o: OrgSesion) {
    return this.s.consultar(o.id);
  }

  @Put('metodologia')
  @Permiso('gestionar_pesv')
  metodologia(@Body(new ZodValidationPipe(metodologiaSchema)) b: { metodologia: MetodologiaRiesgo }, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.cambiarMetodologia(o.id, b.metodologia, u.id);
  }

  @Post('riesgos')
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(riesgoViaSchema)) b: RiesgoViaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id);
  }

  @Patch('riesgos/:id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(riesgoViaSchema)) b: RiesgoViaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id, id);
  }

  @Delete('riesgos/:id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Post('riesgos/:id/medidas')
  @Permiso('gestionar_pesv')
  agregarMedida(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(medidaSchema)) b: MedidaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.agregarMedida(o.id, id, b, u.id);
  }

  @Patch('medidas/:id')
  @Permiso('gestionar_pesv')
  editarMedida(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(medidaSchema)) b: MedidaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.editarMedida(o.id, id, b, u.id);
  }

  @Delete('medidas/:id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminarMedida(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminarMedida(o.id, id, u.id);
  }

  @Post('medidas/:id/plan')
  @Permiso('gestionar_pesv')
  alPlan(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.enviarAlPlan(o.id, id, u.id);
  }

  @Get('exportar')
  @Permiso('ver')
  async exportar(@Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.excel(o.id) : await this.s.pdf(o.id);
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidencia(o.id, u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [MatrizController], providers: [MatrizService], exports: [MatrizService] })
export class MatrizModule {}

