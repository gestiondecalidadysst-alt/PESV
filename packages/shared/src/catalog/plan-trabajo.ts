/**
 * Plan anual de trabajo del PESV (paso 9). Cada actividad se programa en uno o varios meses y en
 * cada mes programado se registra si se ejecutó. De ahí salen el cronograma P/E y los indicadores
 * de cumplimiento.
 */

export const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

export const FASES_PHVA = [
  { id: 'planear', nombre: 'Planear' },
  { id: 'hacer', nombre: 'Hacer' },
  { id: 'verificar', nombre: 'Verificar' },
  { id: 'actuar', nombre: 'Actuar' },
] as const;
export type FasePhva = (typeof FASES_PHVA)[number]['id'];
export const IDS_FASE_PHVA = FASES_PHVA.map((f) => f.id) as [FasePhva, ...FasePhva[]];

/** De dónde viene una actividad del plan: así se conectan la matriz, los hallazgos y los indicadores. */
export const ORIGENES_ACTIVIDAD = [
  { id: 'manual', nombre: 'Programada' },
  { id: 'riesgo', nombre: 'Medida de la matriz de riesgos' },
  { id: 'hallazgo', nombre: 'Hallazgo o acción de mejora' },
  { id: 'indicador', nombre: 'Indicador por debajo de la meta' },
  { id: 'paso', nombre: 'Requisito de un paso del PESV' },
  { id: 'capacitacion', nombre: 'Plan de formación' },
] as const;
export type OrigenActividad = (typeof ORIGENES_ACTIVIDAD)[number]['id'];

export const ESTADOS_ACTIVIDAD = [
  { id: 'planeada', nombre: 'Programada' },
  { id: 'en_curso', nombre: 'En ejecución' },
  { id: 'ejecutada', nombre: 'Ejecutada' },
  { id: 'cancelada', nombre: 'Cancelada' },
] as const;
export type EstadoActividad = (typeof ESTADOS_ACTIVIDAD)[number]['id'];

export interface MesSeguimiento {
  mes: number;
  ejecutado: boolean;
}

/**
 * Mes de corte para medir el cumplimiento "a la fecha": todos los meses si el año ya pasó,
 * ninguno si aún no empieza y, en el año en curso, los meses ya terminados más el actual.
 */
export function mesDeCorte(anio: number, hoy = new Date()) {
  const actual = hoy.getFullYear();
  if (anio < actual) return 12;
  if (anio > actual) return 0;
  return hoy.getMonth() + 1;
}

/** Estado que se deriva del cronograma (una actividad cancelada sigue cancelada). */
export function estadoDerivado(meses: number[], seguimiento: MesSeguimiento[], actual: EstadoActividad): EstadoActividad {
  if (actual === 'cancelada') return 'cancelada';
  const ejecutados = new Set(seguimiento.filter((s) => s.ejecutado).map((s) => s.mes));
  const hechos = meses.filter((m) => ejecutados.has(m)).length;
  if (meses.length > 0 && hechos === meses.length) return 'ejecutada';
  return hechos > 0 ? 'en_curso' : 'planeada';
}

export interface CumplimientoPlan {
  /** Meses-actividad programados en el año. */
  programados: number;
  ejecutados: number;
  /** Programados hasta el mes de corte. */
  programadosALaFecha: number;
  ejecutadosALaFecha: number;
  /** Porcentaje de cumplimiento a la fecha (null si aún no había nada programado). */
  cumplimiento: number | null;
  /** Porcentaje de ejecución del año completo. */
  ejecucion: number | null;
  /** Por mes (índice 0 = enero). */
  porMes: { programados: number; ejecutados: number }[];
}

/** Cumplimiento del plan: ejecutados sobre programados, en total y a la fecha de corte. */
export function cumplimientoPlan(actividades: { meses: number[]; seguimiento: MesSeguimiento[]; estado: EstadoActividad }[], corte: number): CumplimientoPlan {
  const porMes = Array.from({ length: 12 }, () => ({ programados: 0, ejecutados: 0 }));
  for (const a of actividades) {
    if (a.estado === 'cancelada') continue;
    const ejecutados = new Set(a.seguimiento.filter((s) => s.ejecutado).map((s) => s.mes));
    for (const m of a.meses) {
      porMes[m - 1]!.programados++;
      if (ejecutados.has(m)) porMes[m - 1]!.ejecutados++;
    }
  }
  const suma = (hasta: number, k: 'programados' | 'ejecutados') => porMes.slice(0, hasta).reduce((s, m) => s + m[k], 0);
  const programados = suma(12, 'programados');
  const ejecutados = suma(12, 'ejecutados');
  const programadosALaFecha = suma(corte, 'programados');
  const ejecutadosALaFecha = suma(corte, 'ejecutados');
  const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);
  return {
    programados,
    ejecutados,
    programadosALaFecha,
    ejecutadosALaFecha,
    cumplimiento: pct(ejecutadosALaFecha, programadosALaFecha),
    ejecucion: pct(ejecutados, programados),
    porMes,
  };
}

/** Meses programados ya vencidos (antes del mes de corte) que no se ejecutaron. */
export function mesesAtrasados(meses: number[], seguimiento: MesSeguimiento[], corte: number) {
  const ejecutados = new Set(seguimiento.filter((s) => s.ejecutado).map((s) => s.mes));
  return meses.filter((m) => m < corte && !ejecutados.has(m));
}
