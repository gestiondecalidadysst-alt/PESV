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
  accionIndicadorSchema,
  ESTADOS_INDICADOR,
  evaluarIndicador,
  formatoIndicador,
  FRECUENCIAS,
  indicadorSchema,
  metaPesvSchema,
  periodoDesdeIdIndicador,
  periodosDelAnio,
  PLANTILLAS_INDICADOR,
  plantillasIndicadorSchema,
  resultadoIndicadorSchema,
  TIPOS_INDICADOR,
  UNIDADES_INDICADOR,
  valorIndicador,
  type AccionIndicadorInput,
  type CalculoIndicador,
  type EstadoIndicador,
  type Frecuencia,
  type IndicadorInput,
  type MetaPesvInput,
  type PeriodoIndicador,
  type ResultadoIndicadorInput,
  type Sentido,
  type TipoIndicador,
  type UnidadIndicador,
} from '@pesv/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { actions, goals, indicatorResults, indicators } from '../db/schema.js';
import { enviarArchivo, FormatoService, MIME_PDF, MIME_XLSX } from '../documentos/documentos.module.js';
import { generarExcel, type ValorExcel } from '../documentos/excel.js';
import { DocumentoPdf, type CeldaPdf } from '../documentos/pdf.js';
import { EvidenciasModule, EvidenciasService } from '../evidencias/evidencias.module.js';
import { medir } from './calculos.js';
import { hoyColombia } from '../common/fechas.js';

type FilaIndicador = typeof indicators.$inferSelect;
type FilaResultado = typeof indicatorResults.$inferSelect;

const hoy = hoyColombia;
const nombreDe = <T extends { id: string; nombre: string }>(lista: readonly T[], id: string | null | undefined) => lista.find((x) => x.id === id)?.nombre ?? id ?? '—';
const redondear = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

export interface ResultadoPeriodo extends PeriodoIndicador {
  futuro: boolean;
  /** El periodo aún no termina: su resultado es parcial. */
  enCurso: boolean;
  valor: number | null;
  numerador: number | null;
  denominador: number | null;
  detalle: string | null;
  /** calculado: medido en vivo; registrado: valor guardado con su análisis; manual: digitado. */
  origen: 'calculado' | 'registrado' | 'manual' | null;
  estado: EstadoIndicador | null;
  analisis: string | null;
  accionId: string | null;
}

/**
 * Indicadores del PESV (paso 20) con ficha técnica, resultados por periodo, análisis y acciones
 * ante incumplimiento; y metas del PESV (paso 7) conectadas a un indicador.
 */
@Injectable()
export class IndicadoresService {
  constructor(
    private readonly database: DatabaseService,
    private readonly formato: FormatoService,
    private readonly evidencias: EvidenciasService,
  ) {}

  private async indicador(tx: TenantTx, id: string) {
    const [i] = await tx.select().from(indicators).where(eq(indicators.id, id));
    if (!i) throw new NotFoundException('Indicador no encontrado');
    return i;
  }

  /** Resultados de un indicador en los periodos del año: lo registrado manda; si no, se calcula. */
  private async resultados(tx: TenantTx, i: FilaIndicador, anio: number, guardados: FilaResultado[]): Promise<ResultadoPeriodo[]> {
    const hoyStr = hoy();
    const unidad = i.unit as UnidadIndicador;
    const salida: ResultadoPeriodo[] = [];
    for (const p of periodosDelAnio(anio, i.frequency as Frecuencia)) {
      const g = guardados.find((r) => r.indicatorId === i.id && r.period === p.id);
      const futuro = p.desde > hoyStr;
      let valor: number | null = null;
      let numerador: number | null = null;
      let denominador: number | null = null;
      let detalle: string | null = null;
      let origen: ResultadoPeriodo['origen'] = null;
      if (g) {
        valor = g.value;
        numerador = g.numerator;
        denominador = g.denominator;
        origen = g.origin === 'manual' ? 'manual' : 'registrado';
      } else if (i.calculation && !futuro) {
        // Un periodo en curso se mide hasta hoy (lo programado más adelante aún no cuenta).
        const m = await medir(tx, i.calculation as CalculoIndicador, { ...p, hasta: p.hasta < hoyStr ? p.hasta : hoyStr }, hoyStr);
        if (m) {
          numerador = m.numerador;
          denominador = m.denominador;
          valor = valorIndicador(unidad, m.numerador, m.denominador);
          detalle = m.detalle;
          origen = 'calculado';
        }
      }
      salida.push({
        ...p,
        futuro,
        enCurso: !futuro && p.hasta >= hoyStr,
        valor: redondear(valor),
        numerador,
        denominador,
        detalle,
        origen,
        estado: evaluarIndicador(valor, i.target, i.direction as Sentido, i.warning),
        analisis: g?.analysis ?? null,
        accionId: g?.actionId ?? null,
      });
    }
    return salida;
  }

  private aIndicador(i: FilaIndicador, periodos: ResultadoPeriodo[]) {
    // El último resultado es el del último periodo cerrado; el periodo en curso solo si no hay otro.
    const conValor = periodos.filter((p) => p.valor != null);
    const cerrados = conValor.filter((p) => !p.enCurso);
    const ultimo = cerrados[cerrados.length - 1] ?? conValor[conValor.length - 1] ?? null;
    return {
      id: i.id,
      calculo: i.calculation as CalculoIndicador | null,
      automatico: !!i.calculation,
      nombre: i.name,
      objetivo: i.objective,
      tipo: i.kind as TipoIndicador,
      formula: i.formula,
      unidad: i.unit as UnidadIndicador,
      frecuencia: i.frequency as Frecuencia,
      sentido: i.direction as Sentido,
      meta: i.target,
      alerta: i.warning,
      fuente: i.dataSource,
      responsable: i.responsibleName,
      pasoNumero: i.stepNumber,
      activo: i.active,
      periodos,
      ultimo: ultimo ? { periodo: ultimo.id, etiqueta: ultimo.etiqueta, valor: ultimo.valor, estado: ultimo.estado, enCurso: ultimo.enCurso } : null,
      /** Periodos ya cerrados que no cumplen y aún no tienen análisis ni acción. */
      sinAnalizar: periodos.filter((p) => p.hasta < hoy() && p.estado === 'no_cumple' && !p.analisis && !p.accionId).map((p) => p.id),
    };
  }
  async consultar(orgId: string, anio: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(indicators).orderBy(asc(indicators.stepNumber), asc(indicators.createdAt));
      const guardados = filas.length
        ? await tx.select().from(indicatorResults).where(and(inArray(indicatorResults.indicatorId, filas.map((f) => f.id))))
        : [];
      const lista = [];
      for (const f of filas) lista.push(this.aIndicador(f, await this.resultados(tx, f, anio, guardados.filter((g) => g.period.startsWith(String(anio))))));
      const activos = lista.filter((i) => i.activo);
      const usados = new Set(filas.map((f) => f.calculation).filter(Boolean));
      return {
        anio,
        indicadores: lista,
        resumen: {
          total: activos.length,
          cumplen: activos.filter((i) => i.ultimo?.estado === 'cumple').length,
          enRiesgo: activos.filter((i) => i.ultimo?.estado === 'en_riesgo').length,
          noCumplen: activos.filter((i) => i.ultimo?.estado === 'no_cumple').length,
          sinDato: activos.filter((i) => !i.ultimo).length,
          porAnalizar: activos.reduce((s, i) => s + i.sinAnalizar.length, 0),
        },
        plantillasDisponibles: PLANTILLAS_INDICADOR.filter((p) => !usados.has(p.calculo)).map((p) => ({ calculo: p.calculo, nombre: p.nombre, tipo: p.tipo, paso: p.paso, frecuencia: p.frecuencia })),
      };
    });
  }

  agregarPlantillas(orgId: string, calculos: CalculoIndicador[], actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const existentes = new Set((await tx.select({ c: indicators.calculation }).from(indicators)).map((x) => x.c));
      const nuevas = PLANTILLAS_INDICADOR.filter((p) => calculos.includes(p.calculo) && !existentes.has(p.calculo));
      if (nuevas.length) {
        await tx.insert(indicators).values(
          nuevas.map((p) => ({
            organizationId: orgId,
            calculation: p.calculo,
            name: p.nombre,
            objective: p.objetivo,
            kind: p.tipo,
            formula: p.formula,
            unit: p.unidad,
            frequency: p.frecuencia,
            direction: p.sentido,
            target: p.meta,
            warning: p.alerta,
            dataSource: p.fuente,
            stepNumber: p.paso,
            createdBy: actorId,
          })),
        );
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'indicador.plantillas', entidad: 'indicator', datos: { calculos: nuevas.map((n) => n.calculo) } });
      return { agregados: nuevas.length };
    });
  }

  guardar(orgId: string, input: IndicadorInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const anterior = id ? await this.indicador(tx, id) : null;
      if (anterior?.calculation) {
        // La fórmula y la unidad de un indicador automático vienen del cálculo de la plataforma.
        const plantilla = PLANTILLAS_INDICADOR.find((p) => p.calculo === anterior.calculation)!;
        if (input.unidad !== plantilla.unidad) throw new BadRequestException('La unidad de un indicador automático no se puede cambiar');
      }
      const valores = {
        name: input.nombre,
        objective: input.objetivo ?? null,
        kind: input.tipo,
        formula: anterior?.calculation ? anterior.formula : input.formula,
        unit: input.unidad,
        frequency: input.frecuencia,
        direction: input.sentido,
        target: input.meta,
        warning: input.alerta ?? null,
        dataSource: input.fuente ?? null,
        responsibleName: input.responsable ?? null,
        stepNumber: input.pasoNumero ?? null,
        active: input.activo,
        updatedAt: new Date(),
      };
      const [i] = anterior
        ? await tx.update(indicators).set(valores).where(eq(indicators.id, anterior.id)).returning()
        : await tx.insert(indicators).values({ organizationId: orgId, createdBy: actorId, ...valores }).returning();
      if (anterior && anterior.frequency !== input.frecuencia) {
        // Con otra frecuencia cambian los periodos: los resultados guardados ya no corresponden.
        await tx.delete(indicatorResults).where(eq(indicatorResults.indicatorId, anterior.id));
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: anterior ? 'indicador.actualizado' : 'indicador.creado', entidad: 'indicator', entidadId: i!.id });
      return { id: i!.id };
    });
  }

  eliminar(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const i = await this.indicador(tx, id);
      await tx.delete(indicators).where(eq(indicators.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'indicador.eliminado', entidad: 'indicator', entidadId: id, datos: { nombre: i.name } });
    });
  }

  /**
   * Registra el resultado de un periodo con su análisis. En un indicador automático se guarda el
   * valor calculado en ese momento (queda fijo); en uno manual, el valor digitado.
   */
  registrar(orgId: string, id: string, periodo: string, input: ResultadoIndicadorInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const i = await this.indicador(tx, id);
      const p = periodoDesdeIdIndicador(periodo);
      if (!p || p.frecuencia !== i.frequency) throw new BadRequestException('El periodo no corresponde a la frecuencia del indicador');
      if (p.desde > hoy()) throw new BadRequestException('El periodo aún no empieza');
      const unidad = i.unit as UnidadIndicador;
      let valor: number | null;
      let numerador: number | null = null;
      let denominador: number | null = null;
      if (i.calculation) {
        const m = await medir(tx, i.calculation as CalculoIndicador, { ...p, hasta: p.hasta < hoy() ? p.hasta : hoy() }, hoy());
        numerador = m?.numerador ?? null;
        denominador = m?.denominador ?? null;
        valor = m ? valorIndicador(unidad, m.numerador, m.denominador) : null;
      } else if (input.numerador != null && (unidad === 'numero' || input.denominador != null)) {
        numerador = input.numerador;
        denominador = input.denominador ?? null;
        valor = valorIndicador(unidad, input.numerador, input.denominador ?? null);
        if (valor == null) throw new BadRequestException('El denominador no puede ser cero');
      } else if (input.valor != null) {
        valor = input.valor;
      } else {
        throw new BadRequestException('Indica el resultado del periodo');
      }
      const valores = { value: redondear(valor), numerator: numerador, denominator: denominador, origin: i.calculation ? 'automatico' : 'manual', analysis: input.analisis ?? null, recordedBy: actorId, recordedAt: new Date() };
      await tx
        .insert(indicatorResults)
        .values({ organizationId: orgId, indicatorId: id, period: periodo, ...valores })
        .onConflictDoUpdate({ target: [indicatorResults.indicatorId, indicatorResults.period], set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'indicador.resultado', entidad: 'indicator', entidadId: id, datos: { periodo, valor } });
      return { valor: redondear(valor), estado: evaluarIndicador(valor, i.target, i.direction as Sentido, i.warning) };
    });
  }

  quitarResultado(orgId: string, id: string, periodo: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      await this.indicador(tx, id);
      await tx.delete(indicatorResults).where(and(eq(indicatorResults.indicatorId, id), eq(indicatorResults.period, periodo)));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'indicador.resultado_eliminado', entidad: 'indicator', entidadId: id, datos: { periodo } });
    });
  }

  /** Acción de mejora ante un resultado que no cumple; queda en el plan de acción (paso 23). */
  accion(orgId: string, id: string, periodo: string, input: AccionIndicadorInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const i = await this.indicador(tx, id);
      const p = periodoDesdeIdIndicador(periodo);
      if (!p || p.frecuencia !== i.frequency) throw new BadRequestException('El periodo no corresponde a la frecuencia del indicador');
      if (input.fechaLimite < hoy()) throw new BadRequestException('La fecha límite no puede estar en el pasado');
      const [r] = await tx.select().from(indicatorResults).where(and(eq(indicatorResults.indicatorId, id), eq(indicatorResults.period, periodo)));
      if (r?.actionId) throw new BadRequestException('Este resultado ya tiene una acción');
      const [a] = await tx
        .insert(actions)
        .values({
          organizationId: orgId,
          source: 'indicador',
          sourceId: id,
          kind: input.tipo,
          description: `${input.descripcion} (Indicador «${i.name}», periodo ${p.etiqueta} ${periodo.slice(0, 4)})`,
          responsibleName: input.responsable,
          dueOn: input.fechaLimite,
          stepNumber: i.stepNumber,
          createdBy: actorId,
        })
        .returning({ id: actions.id });
      if (r) {
        await tx.update(indicatorResults).set({ actionId: a!.id }).where(eq(indicatorResults.id, r.id));
      } else {
        // Se congela el resultado del periodo para que la acción quede ligada a un valor concreto.
        const unidad = i.unit as UnidadIndicador;
        const m = i.calculation ? await medir(tx, i.calculation as CalculoIndicador, { ...p, hasta: p.hasta < hoy() ? p.hasta : hoy() }, hoy()) : null;
        await tx.insert(indicatorResults).values({
          organizationId: orgId,
          indicatorId: id,
          period: periodo,
          value: m ? redondear(valorIndicador(unidad, m.numerador, m.denominador)) : null,
          numerator: m?.numerador ?? null,
          denominator: m?.denominador ?? null,
          origin: i.calculation ? 'automatico' : 'manual',
          actionId: a!.id,
          recordedBy: actorId,
        });
      }
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'indicador.accion', entidad: 'action', entidadId: a!.id, datos: { indicador: i.name, periodo } });
      return { accionId: a!.id };
    });
  }

  // Metas del PESV (paso 7) --------------------------------------------------------

  async metas(orgId: string, anio?: number) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx.select().from(goals).where(anio ? eq(goals.year, anio) : undefined).orderBy(desc(goals.year), asc(goals.createdAt));
      const ids = [...new Set(filas.map((f) => f.indicatorId).filter((x): x is string => !!x))];
      const lista = ids.length ? await tx.select().from(indicators).where(inArray(indicators.id, ids)) : [];
      const guardados = ids.length ? await tx.select().from(indicatorResults).where(inArray(indicatorResults.indicatorId, ids)) : [];
      const salida = [];
      for (const m of filas) {
        const i = lista.find((x) => x.id === m.indicatorId);
        let valorActual = m.currentValue;
        let detalle: string | null = null;
        if (i) {
          // Valor del año: medición anual si es automático; si no, suma (números) o último valor.
          const unidad = i.unit as UnidadIndicador;
          if (i.calculation) {
            const anual = periodosDelAnio(m.year, 'anual')[0]!;
            const hasta = anual.hasta < hoy() ? anual.hasta : hoy();
            const r = await medir(tx, i.calculation as CalculoIndicador, { ...anual, hasta }, hoy());
            valorActual = r ? redondear(valorIndicador(unidad, r.numerador, r.denominador)) : null;
            detalle = r ? `${r.detalle} (acumulado del año)` : null;
          } else {
            const delAnio = (await this.resultados(tx, i, m.year, guardados.filter((g) => g.period.startsWith(String(m.year))))).filter((p) => p.valor != null);
            valorActual = !delAnio.length ? null : unidad === 'numero' ? delAnio.reduce((s, p) => s + p.valor!, 0) : delAnio[delAnio.length - 1]!.valor;
            detalle = delAnio.length ? (unidad === 'numero' ? `Suma de ${delAnio.length} periodos` : `Último periodo: ${delAnio[delAnio.length - 1]!.etiqueta}`) : null;
          }
        }
        const estado = evaluarIndicador(valorActual, m.target, m.direction as Sentido, null);
        salida.push({
          id: m.id,
          anio: m.year,
          objetivo: m.objective,
          indicadorId: m.indicatorId,
          indicador: i?.name ?? m.indicator,
          unidad: (i?.unit ?? 'numero') as UnidadIndicador,
          meta: m.target,
          sentido: m.direction as Sentido,
          valorActual,
          detalle,
          automatica: !!i,
          cumplida: estado == null ? null : estado === 'cumple',
          estado,
        });
      }
      return salida;
    });
  }

  guardarMeta(orgId: string, input: MetaPesvInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      let nombreIndicador = input.indicador ?? null;
      let sentido = input.sentido;
      if (input.indicadorId) {
        const i = await this.indicador(tx, input.indicadorId);
        nombreIndicador = i.name;
        sentido = i.direction as Sentido;
      }
      const valores = {
        year: input.anio,
        objective: input.objetivo,
        indicator: nombreIndicador,
        indicatorId: input.indicadorId ?? null,
        target: input.meta,
        currentValue: input.indicadorId ? null : (input.valorActual ?? null),
        direction: sentido,
      };
      const [m] = id
        ? await tx.update(goals).set(valores).where(eq(goals.id, id)).returning()
        : await tx.insert(goals).values({ organizationId: orgId, ...valores }).returning();
      if (!m) throw new NotFoundException('Meta no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'meta.actualizada' : 'meta.creada', entidad: 'goal', entidadId: m.id });
      return { id: m.id };
    });
  }

  eliminarMeta(orgId: string, id: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [m] = await tx.delete(goals).where(eq(goals.id, id)).returning();
      if (!m) throw new NotFoundException('Meta no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'meta.eliminada', entidad: 'goal', entidadId: id, datos: { objetivo: m.objective } });
    });
  }

  // Documentos ------------------------------------------------------------------------

  private celdaEstado(p: ResultadoPeriodo, unidad: UnidadIndicador): CeldaPdf {
    if (p.valor == null) return { texto: p.futuro ? '' : '—', alinear: 'center' };
    const e = p.estado ? ESTADOS_INDICADOR[p.estado] : null;
    return { texto: formatoIndicador(p.valor, unidad), fondo: e?.fondo, color: e?.color, negrita: true, alinear: 'center' };
  }

  async pdf(orgId: string, anio: number) {
    const [{ indicadores: lista, resumen }, metas, ctx] = await Promise.all([this.consultar(orgId, anio), this.metas(orgId, anio), this.formato.contexto(orgId, 'indicadores', `INDICADORES Y METAS DEL PESV ${anio}`)]);
    const activos = lista.filter((i) => i.activo);
    const doc = new DocumentoPdf(ctx, true);
    doc.datos(
      [
        ['Año', String(anio)],
        ['Indicadores activos', String(resumen.total)],
        ['Cumplen (último periodo)', String(resumen.cumplen)],
        ['En riesgo / no cumplen', `${resumen.enRiesgo} / ${resumen.noCumplen}`],
      ],
      4,
    );
    if (metas.length) {
      doc.titulo('Objetivos y metas (paso 7)');
      doc.tabla(
        [{ titulo: 'Objetivo', ancho: 10 }, { titulo: 'Indicador', ancho: 8 }, { titulo: 'Meta', ancho: 3, alinear: 'center' }, { titulo: 'Resultado', ancho: 3, alinear: 'center' }, { titulo: 'Estado', ancho: 3, alinear: 'center' }],
        metas.map((m) => {
          const e = m.estado ? ESTADOS_INDICADOR[m.estado] : null;
          return [m.objetivo, m.indicador ?? '—', { texto: `${m.sentido === 'menor_o_igual' ? '≤' : '≥'} ${formatoIndicador(m.meta, m.unidad)}`, alinear: 'center' }, { texto: formatoIndicador(m.valorActual, m.unidad), alinear: 'center' }, { texto: e?.nombre ?? 'Sin dato', fondo: e?.fondo, color: e?.color, negrita: true, alinear: 'center' }];
        }),
        { tamano: 8 },
      );
    }
    // Una tabla por frecuencia, porque cada una tiene sus propios periodos.
    for (const f of FRECUENCIAS) {
      const deEsta = activos.filter((i) => i.frecuencia === f.id);
      if (!deEsta.length) continue;
      const periodos = periodosDelAnio(anio, f.id);
      doc.titulo(`Indicadores de frecuencia ${f.nombre.toLowerCase()}`);
      doc.tabla(
        [
          { titulo: 'Indicador', ancho: 10 },
          { titulo: 'Tipo · paso', ancho: 3.4 },
          { titulo: 'Meta', ancho: 3, alinear: 'center' },
          ...periodos.map((p) => ({ titulo: p.etiqueta, ancho: f.id === 'mensual' ? 2.2 : 4, alinear: 'center' as const })),
        ],
        deEsta.map((i) => [
          `${i.nombre}${i.automatico ? '' : ' (manual)'}`,
          `${nombreDe(TIPOS_INDICADOR, i.tipo)}${i.pasoNumero ? `\nPaso ${i.pasoNumero}` : ''}`,
          { texto: `${i.sentido === 'menor_o_igual' ? '≤' : '≥'} ${formatoIndicador(i.meta, i.unidad)}`, alinear: 'center' },
          ...i.periodos.map((p) => this.celdaEstado(p, i.unidad)),
        ]),
        { tamano: 7 },
      );
    }
    const analisis = activos.flatMap((i) => i.periodos.filter((p) => p.analisis).map((p) => [i.nombre, `${p.etiqueta} ${anio}`, formatoIndicador(p.valor, i.unidad), p.analisis!]));
    if (analisis.length) {
      doc.titulo('Análisis de resultados');
      doc.tabla([{ titulo: 'Indicador', ancho: 7 }, { titulo: 'Periodo', ancho: 2.5 }, { titulo: 'Resultado', ancho: 2.5, alinear: 'center' }, { titulo: 'Análisis', ancho: 16 }], analisis, { tamano: 7.5 });
    }
    doc.parrafo('Convenciones: verde cumple la meta, amarillo en riesgo (entre la meta y el umbral de alerta), rojo no cumple.', { tamano: 7.5, color: '#5b6576' });
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-indicadores-${anio}.pdf` };
  }

  /** Ficha técnica de un indicador, con sus resultados del año. */
  async ficha(orgId: string, id: string, anio: number) {
    const { indicadores: lista } = await this.consultar(orgId, anio);
    const i = lista.find((x) => x.id === id);
    if (!i) throw new NotFoundException('Indicador no encontrado');
    const ctx = await this.formato.contexto(orgId, 'indicadores', `FICHA TÉCNICA DEL INDICADOR`);
    const doc = new DocumentoPdf(ctx);
    doc.titulo(i.nombre, 13);
    doc.tabla(
      [{ titulo: 'Elemento', ancho: 4 }, { titulo: 'Descripción', ancho: 12 }],
      [
        ['Objetivo', i.objetivo ?? '—'],
        ['Tipo de indicador', `${nombreDe(TIPOS_INDICADOR, i.tipo)}: ${TIPOS_INDICADOR.find((t) => t.id === i.tipo)!.descripcion}`],
        ['Fórmula', i.formula],
        ['Unidad de medida', nombreDe(UNIDADES_INDICADOR, i.unidad)],
        ['Frecuencia de medición', nombreDe(FRECUENCIAS, i.frecuencia)],
        ['Meta', `${i.sentido === 'menor_o_igual' ? 'Menor o igual a' : 'Mayor o igual a'} ${formatoIndicador(i.meta, i.unidad)}`],
        ['Umbral de alerta', i.alerta != null ? formatoIndicador(i.alerta, i.unidad) : 'No definido'],
        ['Fuente de información', `${i.fuente ?? '—'}${i.automatico ? ' (cálculo automático de la plataforma)' : ' (registro manual)'}`],
        ['Responsable de la medición', i.responsable ?? '—'],
        ['Paso del PESV', i.pasoNumero ? String(i.pasoNumero) : '—'],
      ],
      { tamano: 9 },
    );
    doc.titulo(`Resultados ${anio}`);
    doc.tabla(
      [{ titulo: 'Periodo', ancho: 3 }, { titulo: 'Numerador', ancho: 3, alinear: 'center' }, { titulo: 'Denominador', ancho: 3, alinear: 'center' }, { titulo: 'Resultado', ancho: 3, alinear: 'center' }, { titulo: 'Análisis', ancho: 10 }],
      i.periodos.map((p) => [
        p.etiqueta,
        { texto: p.numerador != null ? String(p.numerador) : '—', alinear: 'center' },
        { texto: p.denominador != null ? String(p.denominador) : '—', alinear: 'center' },
        this.celdaEstado(p, i.unidad),
        p.analisis ?? (p.futuro ? '' : p.detalle ?? ''),
      ]),
      { tamano: 8.5 },
    );
    return { datos: await doc.terminar(), nombre: `${ctx.codigo}-ficha-${i.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '-').slice(0, 40)}.pdf` };
  }

  async excel(orgId: string, anio: number) {
    const [{ indicadores: lista }, metas, ctx] = await Promise.all([this.consultar(orgId, anio), this.metas(orgId, anio), this.formato.contexto(orgId, 'indicadores', `INDICADORES Y METAS DEL PESV ${anio}`)]);
    const celda = (p: ResultadoPeriodo): ValorExcel => (p.valor == null ? null : { valor: p.valor, fondo: p.estado ? ESTADOS_INDICADOR[p.estado].fondo : undefined, negrita: true });
    const datos = await generarExcel(ctx, [
      {
        nombre: 'Fichas',
        horizontal: true,
        columnas: [
          { titulo: 'Indicador', ancho: 34 },
          { titulo: 'Objetivo', ancho: 36 },
          { titulo: 'Tipo', ancho: 12 },
          { titulo: 'Fórmula', ancho: 50 },
          { titulo: 'Unidad', ancho: 14 },
          { titulo: 'Frecuencia', ancho: 12 },
          { titulo: 'Sentido', ancho: 14 },
          { titulo: 'Meta', ancho: 9 },
          { titulo: 'Alerta', ancho: 9 },
          { titulo: 'Fuente', ancho: 30 },
          { titulo: 'Responsable', ancho: 20 },
          { titulo: 'Paso', ancho: 7 },
          { titulo: 'Medición', ancho: 12 },
          { titulo: 'Activo', ancho: 8 },
        ],
        filas: lista.map((i) => [
          i.nombre,
          i.objetivo,
          nombreDe(TIPOS_INDICADOR, i.tipo),
          i.formula,
          nombreDe(UNIDADES_INDICADOR, i.unidad),
          nombreDe(FRECUENCIAS, i.frecuencia),
          i.sentido === 'menor_o_igual' ? 'Menor o igual' : 'Mayor o igual',
          i.meta,
          i.alerta,
          i.fuente,
          i.responsable,
          i.pasoNumero,
          i.automatico ? 'Automática' : 'Manual',
          i.activo ? 'Sí' : 'No',
        ]),
      },
      {
        nombre: 'Resultados',
        horizontal: true,
        notas: [`Año ${anio}. Verde: cumple · amarillo: en riesgo · rojo: no cumple.`],
        columnas: [{ titulo: 'Indicador', ancho: 34 }, { titulo: 'Periodo', ancho: 10 }, { titulo: 'Numerador', ancho: 11 }, { titulo: 'Denominador', ancho: 12 }, { titulo: 'Resultado', ancho: 11 }, { titulo: 'Meta', ancho: 9 }, { titulo: 'Estado', ancho: 11 }, { titulo: 'Origen', ancho: 11 }, { titulo: 'Análisis', ancho: 60 }],
        filas: lista.flatMap((i) =>
          i.periodos.filter((p) => !p.futuro).map((p): ValorExcel[] => [i.nombre, p.etiqueta, p.numerador, p.denominador, celda(p), i.meta, p.estado ? ESTADOS_INDICADOR[p.estado].nombre : 'Sin dato', p.origen, p.analisis]),
        ),
      },
      {
        nombre: 'Metas',
        columnas: [{ titulo: 'Objetivo', ancho: 40 }, { titulo: 'Indicador', ancho: 34 }, { titulo: 'Meta', ancho: 10 }, { titulo: 'Sentido', ancho: 14 }, { titulo: 'Resultado', ancho: 11 }, { titulo: 'Estado', ancho: 12 }],
        filas: metas.map((m): ValorExcel[] => [m.objetivo, m.indicador, m.meta, m.sentido === 'menor_o_igual' ? 'Menor o igual' : 'Mayor o igual', m.valorActual, m.estado ? { valor: ESTADOS_INDICADOR[m.estado].nombre, fondo: ESTADOS_INDICADOR[m.estado].fondo } : 'Sin dato']),
      },
    ]);
    return { datos, nombre: `${ctx.codigo}-indicadores-${anio}.xlsx` };
  }

  async evidencia(orgId: string, anio: number, actorId: string) {
    const { datos, nombre } = await this.pdf(orgId, anio);
    const ev = await this.evidencias.crear(orgId, { titulo: `Indicadores y metas ${anio} · corte ${hoy()}`, pasoNumero: 20, descripcion: 'Generado desde los indicadores de la plataforma.' }, { nombre, tipo: MIME_PDF, datos }, actorId);
    return { evidenciaId: ev.id };
  }
}

const anioDe = (v: string | undefined) => {
  const n = v ? Number(v) : new Date().getFullYear();
  if (!Number.isInteger(n) || n < 2020 || n > 2100) throw new BadRequestException('Año no válido');
  return n;
};

@Controller('org')
export class IndicadoresController {
  constructor(private readonly s: IndicadoresService) {}

  @Get('indicadores')
  @Permiso('ver')
  consultar(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) {
    return this.s.consultar(o.id, anioDe(anio));
  }

  @Get('indicadores/exportar')
  @Permiso('ver')
  async exportar(@Query('anio') anio: string | undefined, @Query('formato') formato: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = formato === 'xlsx' ? await this.s.excel(o.id, anioDe(anio)) : await this.s.pdf(o.id, anioDe(anio));
    return enviarArchivo(res, r.datos, r.nombre, formato === 'xlsx' ? MIME_XLSX : MIME_PDF);
  }

  @Post('indicadores/evidencia')
  @Permiso('gestionar_pesv')
  evidencia(@Query('anio') anio: string | undefined, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.evidencia(o.id, anioDe(anio), u.id);
  }

  @Post('indicadores/plantillas')
  @Permiso('gestionar_pesv')
  plantillas(@Body(new ZodValidationPipe(plantillasIndicadorSchema)) b: { calculos: CalculoIndicador[] }, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.agregarPlantillas(o.id, b.calculos, u.id);
  }

  @Post('indicadores')
  @Permiso('gestionar_pesv')
  crear(@Body(new ZodValidationPipe(indicadorSchema)) b: IndicadorInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id);
  }

  @Put('indicadores/:id')
  @Permiso('gestionar_pesv')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(indicadorSchema)) b: IndicadorInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardar(o.id, b, u.id, id);
  }

  @Delete('indicadores/:id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminar(o.id, id, u.id);
  }

  @Get('indicadores/:id/ficha')
  @Permiso('ver')
  async ficha(@Param('id', ParseUUIDPipe) id: string, @Query('anio') anio: string | undefined, @OrgActual() o: OrgSesion, @Res({ passthrough: true }) res: Response) {
    const r = await this.s.ficha(o.id, id, anioDe(anio));
    return enviarArchivo(res, r.datos, r.nombre, MIME_PDF);
  }

  @Put('indicadores/:id/resultados/:periodo')
  @Permiso('gestionar_pesv')
  registrar(@Param('id', ParseUUIDPipe) id: string, @Param('periodo') periodo: string, @Body(new ZodValidationPipe(resultadoIndicadorSchema)) b: ResultadoIndicadorInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.registrar(o.id, id, periodo, b, u.id);
  }

  @Delete('indicadores/:id/resultados/:periodo')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async quitar(@Param('id', ParseUUIDPipe) id: string, @Param('periodo') periodo: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.quitarResultado(o.id, id, periodo, u.id);
  }

  @Post('indicadores/:id/resultados/:periodo/accion')
  @Permiso('gestionar_pesv')
  accion(@Param('id', ParseUUIDPipe) id: string, @Param('periodo') periodo: string, @Body(new ZodValidationPipe(accionIndicadorSchema)) b: AccionIndicadorInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.accion(o.id, id, periodo, b, u.id);
  }

  @Get('metas')
  @Permiso('ver')
  metas(@OrgActual() o: OrgSesion, @Query('anio') anio?: string) {
    return this.s.metas(o.id, anio ? anioDe(anio) : undefined);
  }

  @Post('metas')
  @Permiso('gestionar_pesv')
  crearMeta(@Body(new ZodValidationPipe(metaPesvSchema)) b: MetaPesvInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardarMeta(o.id, b, u.id);
  }

  @Patch('metas/:id')
  @Permiso('gestionar_pesv')
  editarMeta(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(metaPesvSchema)) b: MetaPesvInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.s.guardarMeta(o.id, b, u.id, id);
  }

  @Delete('metas/:id')
  @HttpCode(204)
  @Permiso('gestionar_pesv')
  async eliminarMeta(@Param('id', ParseUUIDPipe) id: string, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    await this.s.eliminarMeta(o.id, id, u.id);
  }
}

@Module({ imports: [EvidenciasModule], controllers: [IndicadoresController], providers: [IndicadoresService], exports: [IndicadoresService] })
export class IndicadoresModule {}
