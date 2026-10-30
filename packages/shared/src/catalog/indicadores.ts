/**
 * Indicadores del PESV (paso 20) con ficha técnica. Las plantillas son una propuesta inicial: la
 * organización elige cuáles usar y ajusta su meta, frecuencia y responsable. Las que tienen
 * `calculo` se miden solas con los datos de la plataforma; las demás se registran a mano.
 */

export const TIPOS_INDICADOR = [
  { id: 'resultado', nombre: 'Resultado', descripcion: 'Mide el efecto final: siniestros, víctimas, lesionados.' },
  { id: 'gestion', nombre: 'Gestión', descripcion: 'Mide el cumplimiento de lo planeado: plan de trabajo, formación, acciones.' },
  { id: 'actividad', nombre: 'Actividad', descripcion: 'Mide la ejecución de controles operativos: inspecciones, mantenimiento.' },
] as const;
export type TipoIndicador = (typeof TIPOS_INDICADOR)[number]['id'];
export const IDS_TIPO_INDICADOR = TIPOS_INDICADOR.map((t) => t.id) as [TipoIndicador, ...TipoIndicador[]];

export const UNIDADES_INDICADOR = [
  { id: 'porcentaje', nombre: 'Porcentaje (%)', sufijo: ' %' },
  { id: 'numero', nombre: 'Número', sufijo: '' },
  { id: 'tasa', nombre: 'Tasa', sufijo: '' },
] as const;
export type UnidadIndicador = (typeof UNIDADES_INDICADOR)[number]['id'];
export const IDS_UNIDAD_INDICADOR = UNIDADES_INDICADOR.map((u) => u.id) as [UnidadIndicador, ...UnidadIndicador[]];

export const FRECUENCIAS = [
  { id: 'mensual', nombre: 'Mensual', periodos: 12 },
  { id: 'trimestral', nombre: 'Trimestral', periodos: 4 },
  { id: 'semestral', nombre: 'Semestral', periodos: 2 },
  { id: 'anual', nombre: 'Anual', periodos: 1 },
] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number]['id'];
export const IDS_FRECUENCIA = FRECUENCIAS.map((f) => f.id) as [Frecuencia, ...Frecuencia[]];

export type Sentido = 'mayor_o_igual' | 'menor_o_igual';

export const CALCULOS_INDICADOR = [
  'cumplimiento_plan_trabajo',
  'cumplimiento_formacion',
  'cobertura_formacion',
  'eficacia_formacion',
  'inspecciones_preoperacionales',
  'mantenimiento_preventivo',
  'siniestros_viales',
  'victimas_fatales',
  'lesionados',
  'tasa_siniestralidad',
  'riesgos_criticos_intervenidos',
  'acciones_a_tiempo',
  'costos_siniestros',
  'cumplimiento_metas',
  'excesos_jornada',
  'excesos_velocidad',
  'cobertura_programa_velocidad',
  'nc_auditoria_cerradas',
] as const;
export type CalculoIndicador = (typeof CALCULOS_INDICADOR)[number];

export interface PlantillaIndicador {
  calculo: CalculoIndicador;
  nombre: string;
  objetivo: string;
  tipo: TipoIndicador;
  formula: string;
  unidad: UnidadIndicador;
  frecuencia: Frecuencia;
  sentido: Sentido;
  meta: number;
  alerta: number | null;
  fuente: string;
  paso: number;
}

export const PLANTILLAS_INDICADOR: readonly PlantillaIndicador[] = [
  {
    calculo: 'cumplimiento_plan_trabajo',
    nombre: 'Cumplimiento del plan anual de trabajo',
    objetivo: 'Verificar que las actividades del PESV se ejecutan como se programaron.',
    tipo: 'gestion',
    formula: '(Meses-actividad ejecutados en el periodo ÷ meses-actividad programados en el periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 90,
    alerta: 80,
    fuente: 'Plan de trabajo y su seguimiento mensual',
    paso: 9,
  },
  {
    calculo: 'cumplimiento_formacion',
    nombre: 'Cumplimiento del plan de formación',
    objetivo: 'Verificar que las capacitaciones programadas se realizan.',
    tipo: 'gestion',
    formula: '(Capacitaciones ejecutadas ÷ capacitaciones programadas en el periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 90,
    alerta: 80,
    fuente: 'Plan de formación',
    paso: 10,
  },
  {
    calculo: 'cobertura_formacion',
    nombre: 'Cobertura de formación de conductores',
    objetivo: 'Asegurar que todos los conductores reciben formación en seguridad vial durante el año.',
    tipo: 'gestion',
    formula: '(Conductores activos con al menos una capacitación en el año, al cierre del periodo ÷ conductores activos) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 80,
    fuente: 'Asistencia a capacitaciones y conductores activos',
    paso: 10,
  },
  {
    calculo: 'eficacia_formacion',
    nombre: 'Eficacia de la formación',
    objetivo: 'Medir si los participantes alcanzan el aprendizaje esperado.',
    tipo: 'gestion',
    formula: '(Asistentes que alcanzan la nota mínima ÷ asistentes evaluados en el periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'semestral',
    sentido: 'mayor_o_igual',
    meta: 85,
    alerta: 70,
    fuente: 'Notas registradas en la asistencia',
    paso: 10,
  },
  {
    calculo: 'inspecciones_preoperacionales',
    nombre: 'Cobertura de inspección preoperacional',
    objetivo: 'Verificar que los vehículos se inspeccionan antes de operar.',
    tipo: 'actividad',
    formula: '(Vehículos activos con al menos una inspección en el periodo ÷ vehículos activos) × 100',
    unidad: 'porcentaje',
    frecuencia: 'mensual',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 90,
    fuente: 'Inspecciones preoperacionales',
    paso: 16,
  },
  {
    calculo: 'mantenimiento_preventivo',
    nombre: 'Cumplimiento del mantenimiento preventivo',
    objetivo: 'Verificar que las órdenes de mantenimiento preventivo se cierran.',
    tipo: 'actividad',
    formula: '(Órdenes preventivas abiertas en el periodo y ya cerradas ÷ órdenes preventivas abiertas en el periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'mensual',
    sentido: 'mayor_o_igual',
    meta: 95,
    alerta: 85,
    fuente: 'Órdenes de trabajo de mantenimiento',
    paso: 17,
  },
  {
    calculo: 'siniestros_viales',
    nombre: 'Siniestros viales',
    objetivo: 'Reducir el número de siniestros viales de la organización.',
    tipo: 'resultado',
    formula: 'Número de siniestros viales ocurridos en el periodo',
    unidad: 'numero',
    frecuencia: 'mensual',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: 1,
    fuente: 'Registro de siniestros',
    paso: 21,
  },
  {
    calculo: 'victimas_fatales',
    nombre: 'Víctimas fatales en siniestros viales',
    objetivo: 'Cero muertes en siniestros viales.',
    tipo: 'resultado',
    formula: 'Número de personas fallecidas en siniestros viales del periodo',
    unidad: 'numero',
    frecuencia: 'mensual',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: null,
    fuente: 'Registro de siniestros',
    paso: 21,
  },
  {
    calculo: 'lesionados',
    nombre: 'Lesionados en siniestros viales',
    objetivo: 'Reducir las personas lesionadas en siniestros viales.',
    tipo: 'resultado',
    formula: 'Número de heridos graves y leves en siniestros viales del periodo',
    unidad: 'numero',
    frecuencia: 'mensual',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: 2,
    fuente: 'Registro de siniestros',
    paso: 21,
  },
  {
    calculo: 'tasa_siniestralidad',
    nombre: 'Tasa de siniestralidad por kilómetros recorridos',
    objetivo: 'Comparar la siniestralidad con la exposición (kilómetros recorridos).',
    tipo: 'resultado',
    formula: '(Siniestros del periodo ÷ kilómetros recorridos en el periodo) × 1.000.000',
    unidad: 'tasa',
    frecuencia: 'trimestral',
    sentido: 'menor_o_igual',
    meta: 1,
    alerta: 2,
    fuente: 'Registro de siniestros y desplazamientos',
    paso: 21,
  },
  {
    calculo: 'riesgos_criticos_intervenidos',
    nombre: 'Riesgos críticos intervenidos',
    objetivo: 'Asegurar que cada riesgo crítico de la matriz tiene al menos una medida implementada.',
    tipo: 'gestion',
    formula: '(Riesgos críticos con al menos una medida implementada al cierre del periodo ÷ riesgos críticos identificados) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 80,
    fuente: 'Matriz de riesgos y medidas de intervención',
    paso: 8,
  },
  {
    calculo: 'acciones_a_tiempo',
    nombre: 'Acciones de mejora cerradas a tiempo',
    objetivo: 'Verificar que las acciones correctivas, preventivas y de mejora se cierran en el plazo.',
    tipo: 'gestion',
    formula: '(Acciones con vencimiento en el periodo cerradas a tiempo ÷ acciones con vencimiento en el periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 90,
    alerta: 75,
    fuente: 'Plan de acción',
    paso: 23,
  },
  {
    calculo: 'costos_siniestros',
    nombre: 'Costos de los siniestros viales',
    objetivo: 'Conocer el costo directo e indirecto de la siniestralidad para la organización.',
    tipo: 'resultado',
    formula: 'Suma de los costos directos e indirectos de los siniestros ocurridos en el periodo (COP)',
    unidad: 'numero',
    frecuencia: 'trimestral',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: null,
    fuente: 'Registro de siniestros (costos directos e indirectos)',
    paso: 20,
  },
  {
    calculo: 'cumplimiento_metas',
    nombre: 'Cumplimiento de las metas del PESV',
    objetivo: 'Verificar que las metas del año se están cumpliendo.',
    tipo: 'gestion',
    formula: '(Metas del año que cumplen al cierre del periodo ÷ metas del año con medición) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 80,
    fuente: 'Objetivos y metas del PESV y sus indicadores',
    paso: 7,
  },
  {
    calculo: 'excesos_jornada',
    nombre: 'Excesos en las jornadas de conducción',
    objetivo: 'Controlar la fatiga: desplazamientos que superan la jornada de conducción definida.',
    tipo: 'actividad',
    formula: '(Desplazamientos con exceso de jornada en el periodo ÷ desplazamientos del periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'mensual',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: 5,
    fuente: 'Desplazamientos y telemática',
    paso: 8,
  },
  {
    calculo: 'excesos_velocidad',
    nombre: 'Excesos del límite de velocidad',
    objetivo: 'Medir los desplazamientos laborales con exceso de velocidad.',
    tipo: 'actividad',
    formula: '(Desplazamientos con exceso de velocidad en el periodo ÷ desplazamientos del periodo) × 100',
    unidad: 'porcentaje',
    frecuencia: 'mensual',
    sentido: 'menor_o_igual',
    meta: 0,
    alerta: 5,
    fuente: 'Desplazamientos y telemática',
    paso: 8,
  },
  {
    calculo: 'cobertura_programa_velocidad',
    nombre: 'Cobertura del programa de gestión de la velocidad',
    objetivo: 'Que todos los vehículos automotores estén dentro del programa de gestión de la velocidad.',
    tipo: 'gestion',
    formula: '(Vehículos automotores activos con un equipo de control de velocidad activo ÷ vehículos automotores activos) × 100',
    unidad: 'porcentaje',
    frecuencia: 'trimestral',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 90,
    fuente: 'Programa de velocidad: equipos de medición por vehículo',
    paso: 8,
  },
  {
    calculo: 'nc_auditoria_cerradas',
    nombre: 'No conformidades de auditoría cerradas',
    objetivo: 'Verificar que las no conformidades de las auditorías se cierran.',
    tipo: 'gestion',
    formula: '(No conformidades de auditoría del año cerradas ÷ no conformidades de auditoría del año) × 100',
    unidad: 'porcentaje',
    frecuencia: 'anual',
    sentido: 'mayor_o_igual',
    meta: 100,
    alerta: 80,
    fuente: 'Auditorías y sus hallazgos',
    paso: 22,
  },
];

/**
 * Indicadores mínimos de la tabla 10 del paso 20 (Res. 40595) y el cálculo que los mide en la
 * plataforma. Algunos solo aplican a los niveles estándar y avanzado.
 */
export const TABLA_10_INDICADORES: readonly { calculo: CalculoIndicador; nombre: string; niveles: readonly ('basico' | 'estandar' | 'avanzado')[] }[] = [
  { calculo: 'tasa_siniestralidad', nombre: 'Tasa de siniestros viales', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'costos_siniestros', nombre: 'Costos de siniestros viales', niveles: ['estandar', 'avanzado'] },
  { calculo: 'riesgos_criticos_intervenidos', nombre: 'Riesgos viales identificados y gestionados', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'cumplimiento_metas', nombre: 'Cumplimiento de metas del PESV', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'cumplimiento_plan_trabajo', nombre: 'Cumplimiento del plan anual de trabajo', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'excesos_jornada', nombre: 'Excesos en jornadas de conductores', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'cobertura_programa_velocidad', nombre: 'Cobertura del programa de gestión de velocidad', niveles: ['estandar', 'avanzado'] },
  { calculo: 'excesos_velocidad', nombre: 'Excesos de límite de velocidad', niveles: ['estandar', 'avanzado'] },
  { calculo: 'inspecciones_preoperacionales', nombre: 'Inspecciones diarias preoperacionales', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'mantenimiento_preventivo', nombre: 'Cumplimiento del plan de mantenimiento preventivo', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'cumplimiento_formacion', nombre: 'Cumplimiento del plan de formación', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'cobertura_formacion', nombre: 'Cobertura del plan de formación', niveles: ['basico', 'estandar', 'avanzado'] },
  { calculo: 'nc_auditoria_cerradas', nombre: 'No conformidades de auditoría cerradas', niveles: ['basico', 'estandar', 'avanzado'] },
];

// Periodos -------------------------------------------------------------------------

export interface PeriodoIndicador {
  /** 2026-03 (mensual), 2026-T1, 2026-S1 o 2026 (anual). */
  id: string;
  etiqueta: string;
  desde: string;
  hasta: string;
}

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const dos = (n: number) => String(n).padStart(2, '0');
const finDeMes = (anio: number, mes: number) => `${anio}-${dos(mes)}-${dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;

export function periodosDelAnio(anio: number, frecuencia: Frecuencia): PeriodoIndicador[] {
  const tramo = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[frecuencia];
  return Array.from({ length: 12 / tramo }, (_, i) => {
    const primero = i * tramo + 1;
    const ultimo = primero + tramo - 1;
    const id = frecuencia === 'mensual' ? `${anio}-${dos(primero)}` : frecuencia === 'trimestral' ? `${anio}-T${i + 1}` : frecuencia === 'semestral' ? `${anio}-S${i + 1}` : `${anio}`;
    const etiqueta = frecuencia === 'mensual' ? MESES_CORTOS[i]! : frecuencia === 'trimestral' ? `T${i + 1}` : frecuencia === 'semestral' ? `S${i + 1}` : String(anio);
    return { id, etiqueta, desde: `${anio}-${dos(primero)}-01`, hasta: finDeMes(anio, ultimo) };
  });
}

/** Periodo a partir de su identificador (valida el formato). */
export function periodoDesdeIdIndicador(id: string): (PeriodoIndicador & { frecuencia: Frecuencia }) | null {
  const m = /^(\d{4})(?:-(\d{2})|-T([1-4])|-S([12]))?$/.exec(id);
  if (!m) return null;
  const anio = Number(m[1]);
  const frecuencia: Frecuencia = m[2] ? 'mensual' : m[3] ? 'trimestral' : m[4] ? 'semestral' : 'anual';
  if (m[2] && (Number(m[2]) < 1 || Number(m[2]) > 12)) return null;
  const p = periodosDelAnio(anio, frecuencia).find((x) => x.id === id);
  return p ? { ...p, frecuencia } : null;
}

// Evaluación -----------------------------------------------------------------------

export type EstadoIndicador = 'cumple' | 'en_riesgo' | 'no_cumple';

export const ESTADOS_INDICADOR: Record<EstadoIndicador, { nombre: string; color: string; fondo: string }> = {
  cumple: { nombre: 'Cumple', color: '#1F6B43', fondo: '#CDEBD9' },
  en_riesgo: { nombre: 'En riesgo', color: '#8A5A00', fondo: '#FDE9B8' },
  no_cumple: { nombre: 'No cumple', color: '#9E2A1C', fondo: '#F8C9C4' },
};

/**
 * Compara un resultado con la meta. Con sentido "mayor o igual" se cumple al alcanzar la meta y se
 * está en riesgo entre el umbral de alerta y la meta; con "menor o igual", al revés.
 */
export function evaluarIndicador(valor: number | null, meta: number, sentido: Sentido, alerta: number | null): EstadoIndicador | null {
  if (valor == null) return null;
  if (sentido === 'mayor_o_igual') {
    if (valor >= meta) return 'cumple';
    return alerta != null && valor >= alerta ? 'en_riesgo' : 'no_cumple';
  }
  if (valor <= meta) return 'cumple';
  return alerta != null && valor <= alerta ? 'en_riesgo' : 'no_cumple';
}

/** Valor del indicador a partir de numerador y denominador según su unidad. */
export function valorIndicador(unidad: UnidadIndicador, numerador: number, denominador: number | null, factor = 1_000_000) {
  if (unidad === 'numero') return numerador;
  if (!denominador) return null;
  const v = unidad === 'porcentaje' ? (numerador / denominador) * 100 : (numerador / denominador) * factor;
  return Math.round(v * 100) / 100;
}

export const formatoIndicador = (valor: number | null, unidad: UnidadIndicador) =>
  valor == null ? '—' : `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor)}${UNIDADES_INDICADOR.find((u) => u.id === unidad)!.sufijo}`;
