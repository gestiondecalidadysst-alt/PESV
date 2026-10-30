/**
 * Programas de gestión de riesgos críticos y factores de desempeño (paso 8 de la Res. 40595 de
 * 2022). Los cinco tipos obligatorios, sus elementos según la norma y el contenido mínimo que debe
 * tener cada programa. Es dato normativo: si cambia la metodología se agrega una versión nueva.
 */

export interface ElementoPrograma {
  id: string;
  texto: string;
}

export interface TipoPrograma {
  id: 'velocidad' | 'fatiga' | 'distraccion' | 'alcohol_spa' | 'vulnerables' | 'otro';
  nombre: string;
  obligatorio: boolean;
  /** Lo que la norma pide que el programa contemple; se confirma uno por uno en la ficha. */
  elementos: readonly ElementoPrograma[];
  /** Factores de desempeño que la norma propone para el programa. */
  factoresSugeridos: readonly string[];
  /** Calculos de indicador que miden el programa (catálogo de indicadores). */
  indicadoresSugeridos: readonly string[];
  /** Tema del plan de formación asociado. */
  temaFormacion: string | null;
}

export const TIPOS_PROGRAMA: readonly TipoPrograma[] = [
  {
    id: 'velocidad',
    nombre: 'Programa de gestión de la velocidad segura',
    obligatorio: true,
    elementos: [
      { id: 'control', texto: 'Control de la velocidad de los vehículos automotores puestos al servicio de la organización.' },
      { id: 'equipos', texto: 'Equipos o mecanismos de medición de la velocidad, con su calibración.' },
      { id: 'evaluacion', texto: 'Evaluación periódica del cumplimiento de los límites de velocidad.' },
      { id: 'excesos', texto: 'Procedimiento para atender los excesos de velocidad reiterados.' },
    ],
    factoresSugeridos: [
      'Cumplimiento de los límites de velocidad',
      'Sustituir incentivos de pago que presionen la velocidad',
      'Uso de tecnología: tacógrafo, GPS u OBC',
    ],
    indicadoresSugeridos: ['excesos_velocidad', 'cobertura_programa_velocidad'],
    temaFormacion: 'velocidad',
  },
  {
    id: 'fatiga',
    nombre: 'Programa de prevención de la fatiga',
    obligatorio: true,
    elementos: [
      { id: 'jornadas', texto: 'Control de jornadas, horas de conducción y descansos.' },
      { id: 'planificacion', texto: 'Planificación de los viajes para prevenir la fatiga.' },
      { id: 'excesos', texto: 'Procedimiento para atender los excesos de jornada.' },
    ],
    factoresSugeridos: [
      'Cumplimiento de las jornadas de conducción',
      'Sustituir incentivos ligados a los kilómetros recorridos',
      'Control del descanso entre turnos',
      'Control de los sitios de descanso',
    ],
    indicadoresSugeridos: ['excesos_jornada'],
    temaFormacion: 'fatiga',
  },
  {
    id: 'distraccion',
    nombre: 'Programa de prevención de la distracción',
    obligatorio: true,
    elementos: [
      { id: 'identificacion', texto: 'Identificación de las principales distracciones al conducir.' },
      { id: 'control', texto: 'Control y monitoreo de la distracción durante la conducción.' },
    ],
    factoresSugeridos: ['Control del uso del celular al conducir', 'Control de elementos distractores dentro del vehículo'],
    indicadoresSugeridos: [],
    temaFormacion: 'distractores',
  },
  {
    id: 'alcohol_spa',
    nombre: 'Programa de cero tolerancia al alcohol y las sustancias psicoactivas',
    obligatorio: true,
    elementos: [
      { id: 'deteccion', texto: 'Estrategias para detectar casos de consumo.' },
      { id: 'correctivas', texto: 'Acciones correctivas ante un caso detectado.' },
      { id: 'reiterados', texto: 'Procedimiento para los casos reiterados.' },
    ],
    factoresSugeridos: ['Pruebas aleatorias a los conductores', 'Controles anuales en sangre (alcohol) y orina (sustancias)'],
    indicadoresSugeridos: [],
    temaFormacion: 'alcohol_sustancias',
  },
  {
    id: 'vulnerables',
    nombre: 'Programa de protección de actores viales vulnerables',
    obligatorio: true,
    elementos: [
      { id: 'directrices', texto: 'Directrices para proteger a peatones, pasajeros, ciclistas y motociclistas.' },
      { id: 'seguimiento', texto: 'Seguimiento al cumplimiento de las directrices.' },
      { id: 'incumplimientos', texto: 'Procedimiento ante los incumplimientos.' },
    ],
    factoresSugeridos: [
      'Uso del casco y de los elementos de protección',
      'Control de los desplazamientos laborales para reducir la exposición',
    ],
    indicadoresSugeridos: [],
    temaFormacion: 'actores_vulnerables',
  },
  {
    id: 'otro',
    nombre: 'Otro programa',
    obligatorio: false,
    elementos: [],
    factoresSugeridos: [],
    indicadoresSugeridos: [],
    temaFormacion: null,
  },
];
export type TipoProgramaId = TipoPrograma['id'];
export const IDS_TIPO_PROGRAMA = TIPOS_PROGRAMA.map((t) => t.id) as [TipoProgramaId, ...TipoProgramaId[]];
export const PROGRAMAS_OBLIGATORIOS = TIPOS_PROGRAMA.filter((t) => t.obligatorio).map((t) => t.id);

/** Contenido mínimo de cada programa según el paso 8. */
export const CAMPOS_PROGRAMA = [
  { id: 'nombre', nombre: 'Nombre' },
  { id: 'lineamientos', nombre: 'Lineamientos' },
  { id: 'alcance', nombre: 'Límites o alcance' },
  { id: 'inicio', nombre: 'Fecha de inicio' },
  { id: 'duracion', nombre: 'Duración' },
  { id: 'lineaBase', nombre: 'Línea base' },
  { id: 'objetivos', nombre: 'Objetivos y metas' },
  { id: 'indicadores', nombre: 'Indicadores y forma de medición' },
  { id: 'factores', nombre: 'Factores de desempeño relacionados' },
  { id: 'actividades', nombre: 'Actividades' },
  { id: 'responsables', nombre: 'Responsables' },
  { id: 'presupuesto', nombre: 'Presupuesto' },
  { id: 'cronograma', nombre: 'Cronograma' },
  { id: 'seguimiento', nombre: 'Mecanismos de seguimiento' },
] as const;
export type CampoPrograma = (typeof CAMPOS_PROGRAMA)[number]['id'];

export interface DatosCompletitudPrograma {
  tipo: TipoProgramaId;
  nombre: string | null;
  lineamientos: string | null;
  alcance: string | null;
  inicio: string | null;
  duracionMeses: number | null;
  lineaBase: string | null;
  objetivos: string | null;
  indicadores: number;
  factores: string | null;
  actividades: number;
  /** Actividades con meses programados (cronograma). */
  actividadesConCronograma: number;
  responsable: string | null;
  presupuesto: number | null;
  seguimiento: string | null;
  elementos: readonly string[];
}

const lleno = (v: string | null | undefined) => !!v && v.trim().length >= 3;

/** Campos del contenido mínimo que faltan y elementos de la norma sin confirmar. */
export function completitudPrograma(d: DatosCompletitudPrograma) {
  const presente: Record<CampoPrograma, boolean> = {
    nombre: lleno(d.nombre),
    lineamientos: lleno(d.lineamientos),
    alcance: lleno(d.alcance),
    inicio: !!d.inicio,
    duracion: d.duracionMeses != null && d.duracionMeses > 0,
    lineaBase: lleno(d.lineaBase),
    objetivos: lleno(d.objetivos),
    indicadores: d.indicadores > 0,
    factores: lleno(d.factores),
    actividades: d.actividades > 0,
    responsables: lleno(d.responsable),
    presupuesto: d.presupuesto != null && d.presupuesto >= 0,
    cronograma: d.actividades > 0 && d.actividadesConCronograma === d.actividades,
    seguimiento: lleno(d.seguimiento),
  };
  const camposFaltantes = CAMPOS_PROGRAMA.filter((c) => !presente[c.id]).map((c) => c.id);
  const tipo = TIPOS_PROGRAMA.find((t) => t.id === d.tipo);
  const elementosFaltantes = (tipo?.elementos ?? []).filter((e) => !d.elementos.includes(e.id)).map((e) => e.id);
  return {
    camposFaltantes,
    elementosFaltantes,
    completo: camposFaltantes.length === 0 && elementosFaltantes.length === 0,
    avance: Math.round(((CAMPOS_PROGRAMA.length - camposFaltantes.length + (tipo?.elementos.length ?? 0) - elementosFaltantes.length) / (CAMPOS_PROGRAMA.length + (tipo?.elementos.length ?? 0))) * 100),
  };
}

export const TIPOS_EQUIPO_VELOCIDAD = [
  { id: 'gps', nombre: 'GPS con control de velocidad' },
  { id: 'tacografo', nombre: 'Tacógrafo' },
  { id: 'obc', nombre: 'Computador de a bordo (OBC)' },
  { id: 'limitador', nombre: 'Limitador de velocidad' },
  { id: 'radar', nombre: 'Radar o pistola de velocidad' },
  { id: 'otro', nombre: 'Otro' },
] as const;
export type TipoEquipoVelocidad = (typeof TIPOS_EQUIPO_VELOCIDAD)[number]['id'];
export const IDS_EQUIPO_VELOCIDAD = TIPOS_EQUIPO_VELOCIDAD.map((t) => t.id) as [TipoEquipoVelocidad, ...TipoEquipoVelocidad[]];

export const TIPOS_PRUEBA_SUSTANCIAS = [
  { id: 'alcohol_aleatoria', nombre: 'Alcohol · prueba aleatoria', anual: false },
  { id: 'sustancias_aleatoria', nombre: 'Sustancias psicoactivas · prueba aleatoria', anual: false },
  { id: 'alcohol_sangre_anual', nombre: 'Alcohol · control anual en sangre', anual: true },
  { id: 'sustancias_orina_anual', nombre: 'Sustancias psicoactivas · control anual en orina', anual: true },
] as const;
export type TipoPruebaSustancias = (typeof TIPOS_PRUEBA_SUSTANCIAS)[number]['id'];
export const IDS_PRUEBA_SUSTANCIAS = TIPOS_PRUEBA_SUSTANCIAS.map((t) => t.id) as [TipoPruebaSustancias, ...TipoPruebaSustancias[]];

export const RESULTADOS_PRUEBA = [
  { id: 'negativo', nombre: 'Negativo' },
  { id: 'positivo', nombre: 'Positivo' },
  { id: 'no_realizada', nombre: 'No se realizó (negativa o ausencia)' },
] as const;
export type ResultadoPrueba = (typeof RESULTADOS_PRUEBA)[number]['id'];

export const INSTANCIAS_REVISION = [
  { id: 'comite', nombre: 'Comité de seguridad vial' },
  { id: 'lider_direccion', nombre: 'Líder del PESV con la dirección' },
] as const;
export type InstanciaRevision = (typeof INSTANCIAS_REVISION)[number]['id'];

/** Trimestre (2026-T3) de una fecha AAAA-MM-DD. */
export function trimestreDe(fecha: string) {
  return `${fecha.slice(0, 4)}-T${Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1}`;
}

/** Último trimestre ya terminado antes de la fecha (en enero de 2027 → 2026-T4). */
export function trimestreAnterior(fecha: string) {
  const anio = Number(fecha.slice(0, 4));
  const t = Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
  return t === 1 ? `${anio - 1}-T4` : `${anio}-T${t - 1}`;
}

/** Último día de un trimestre (2026-T1 → 2026-03-31). */
export function finDeTrimestre(periodo: string) {
  const anio = Number(periodo.slice(0, 4));
  const t = Number(periodo.slice(6));
  return new Date(Date.UTC(anio, t * 3, 0)).toISOString().slice(0, 10);
}
