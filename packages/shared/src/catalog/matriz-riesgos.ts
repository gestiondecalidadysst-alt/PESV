/**
 * Metodologías de evaluación de riesgos viales (paso 6 de la Resolución 40595). Cada organización
 * elige una: GTC 45 adaptada a riesgo vial (la más usada en Colombia) o matriz 5×5 de
 * probabilidad y severidad. Los criterios son datos para poder ajustarlos sin tocar el código.
 */

export const METODOLOGIAS_RIESGO = [
  { id: 'gtc45', nombre: 'GTC 45 adaptada', descripcion: 'Nivel de riesgo = nivel de deficiencia × nivel de exposición × nivel de consecuencia. Niveles I a IV.' },
  { id: 'matriz5x5', nombre: 'Matriz 5×5', descripcion: 'Probabilidad × severidad, de 1 a 5 cada una. Bandas bajo, moderado, alto y extremo.' },
] as const;
export type MetodologiaRiesgo = (typeof METODOLOGIAS_RIESGO)[number]['id'];
export const IDS_METODOLOGIA_RIESGO = METODOLOGIAS_RIESGO.map((m) => m.id) as [MetodologiaRiesgo, ...MetodologiaRiesgo[]];

// GTC 45 ----------------------------------------------------------------------------

export const NIVELES_DEFICIENCIA = [
  { valor: 10, sigla: 'MA', nombre: 'Muy alto', descripcion: 'Peligros que hacen posible un siniestro grave, o los controles existentes son nulos o no existen.' },
  { valor: 6, sigla: 'A', nombre: 'Alto', descripcion: 'Peligros que pueden causar siniestros significativos, o los controles existentes son de baja eficacia.' },
  { valor: 2, sigla: 'M', nombre: 'Medio', descripcion: 'Peligros que pueden causar siniestros poco significativos, o los controles tienen eficacia moderada.' },
  { valor: 0, sigla: 'B', nombre: 'Bajo', descripcion: 'No se detectan anomalías destacables, o los controles son eficaces. El riesgo está controlado.' },
] as const;

export const NIVELES_EXPOSICION = [
  { valor: 4, sigla: 'EC', nombre: 'Continua', descripcion: 'Varias veces en la jornada por tiempo prolongado (por ejemplo, conducción la mayor parte del turno).' },
  { valor: 3, sigla: 'EF', nombre: 'Frecuente', descripcion: 'Varias veces en la jornada por tiempos cortos.' },
  { valor: 2, sigla: 'EO', nombre: 'Ocasional', descripcion: 'Alguna vez en la jornada y por un periodo corto.' },
  { valor: 1, sigla: 'EE', nombre: 'Esporádica', descripcion: 'Eventualmente.' },
] as const;

export const NIVELES_CONSECUENCIA = [
  { valor: 100, sigla: 'M', nombre: 'Mortal o catastrófico', descripcion: 'Muerte de una o más personas.' },
  { valor: 60, sigla: 'MG', nombre: 'Muy grave', descripcion: 'Lesiones graves irreparables: incapacidad permanente parcial o invalidez.' },
  { valor: 25, sigla: 'G', nombre: 'Grave', descripcion: 'Lesiones con incapacidad laboral temporal.' },
  { valor: 10, sigla: 'L', nombre: 'Leve', descripcion: 'Lesiones que no requieren incapacidad o solo daños materiales.' },
] as const;

export const NIVELES_RIESGO_GTC45 = [
  { nivel: 'I', desde: 600, color: '#B42318', fondo: '#F8C9C4', aceptabilidad: 'No aceptable', significado: 'Situación crítica. Suspender la actividad hasta controlar el riesgo; intervención urgente.' },
  { nivel: 'II', desde: 150, color: '#B54708', fondo: '#FDE2C3', aceptabilidad: 'No aceptable o aceptable con control específico', significado: 'Corregir y adoptar medidas de control de inmediato.' },
  { nivel: 'III', desde: 40, color: '#8A6100', fondo: '#FDF0B8', aceptabilidad: 'Mejorable', significado: 'Mejorar si es posible; justificar la intervención y su rentabilidad.' },
  { nivel: 'IV', desde: 0, color: '#1F7A4D', fondo: '#D8F0E1', aceptabilidad: 'Aceptable', significado: 'Mantener los controles existentes y revisar periódicamente.' },
] as const;

/** Interpretación del nivel de probabilidad (ND × NE). */
export function interpretarProbabilidad(np: number) {
  if (np >= 24) return 'Muy alto';
  if (np >= 10) return 'Alto';
  if (np >= 6) return 'Medio';
  return 'Bajo';
}

// Matriz 5×5 ------------------------------------------------------------------------

export const PROBABILIDADES_5X5 = [
  { valor: 1, nombre: 'Raro', descripcion: 'Puede ocurrir solo en circunstancias excepcionales.' },
  { valor: 2, nombre: 'Improbable', descripcion: 'Podría ocurrir alguna vez.' },
  { valor: 3, nombre: 'Posible', descripcion: 'Puede ocurrir en algún momento.' },
  { valor: 4, nombre: 'Probable', descripcion: 'Probablemente ocurrirá en la mayoría de las circunstancias.' },
  { valor: 5, nombre: 'Casi seguro', descripcion: 'Se espera que ocurra en la mayoría de las circunstancias.' },
] as const;

export const SEVERIDADES_5X5 = [
  { valor: 1, nombre: 'Insignificante', descripcion: 'Sin lesiones; daños materiales mínimos.' },
  { valor: 2, nombre: 'Menor', descripcion: 'Lesiones leves sin incapacidad.' },
  { valor: 3, nombre: 'Moderada', descripcion: 'Lesiones con incapacidad temporal.' },
  { valor: 4, nombre: 'Mayor', descripcion: 'Lesiones graves o incapacidad permanente.' },
  { valor: 5, nombre: 'Catastrófica', descripcion: 'Una o más muertes.' },
] as const;

export const NIVELES_RIESGO_5X5 = [
  { nivel: 'Extremo', desde: 16, color: '#B42318', fondo: '#F8C9C4', aceptabilidad: 'No aceptable', significado: 'Intervención inmediata; no continuar sin controles.' },
  { nivel: 'Alto', desde: 10, color: '#B54708', fondo: '#FDE2C3', aceptabilidad: 'No aceptable', significado: 'Requiere controles prioritarios con responsable y fecha.' },
  { nivel: 'Moderado', desde: 5, color: '#8A6100', fondo: '#FDF0B8', aceptabilidad: 'Tolerable con controles', significado: 'Mantener y mejorar los controles.' },
  { nivel: 'Bajo', desde: 0, color: '#1F7A4D', fondo: '#D8F0E1', aceptabilidad: 'Aceptable', significado: 'Gestionar con los procedimientos de rutina.' },
] as const;

// Evaluación común ----------------------------------------------------------------

export interface EvaluacionRiesgo {
  metodologia: MetodologiaRiesgo;
  /** NR en GTC 45; probabilidad × severidad en 5×5. */
  valor: number;
  nivel: string;
  aceptabilidad: string;
  significado: string;
  color: string;
  fondo: string;
  /** 1 = el más crítico. Sirve para ordenar y comparar entre metodologías. */
  prioridad: 1 | 2 | 3 | 4;
  /** Nivel I o II en GTC 45; alto o extremo en 5×5. Son los riesgos críticos del paso 8. */
  critico: boolean;
  detalle: string;
}

export interface DatosEvaluacion {
  deficiencia?: number | null;
  exposicion?: number | null;
  consecuencia?: number | null;
  probabilidad?: number | null;
  severidad?: number | null;
}

/** Evalúa con la metodología indicada. Devuelve null si faltan datos. */
export function evaluarRiesgo(metodologia: MetodologiaRiesgo, d: DatosEvaluacion): EvaluacionRiesgo | null {
  if (metodologia === 'gtc45') {
    if (d.deficiencia == null || d.exposicion == null || d.consecuencia == null) return null;
    const np = d.deficiencia * d.exposicion;
    const nr = np * d.consecuencia;
    const i = NIVELES_RIESGO_GTC45.findIndex((n) => nr >= n.desde);
    const n = NIVELES_RIESGO_GTC45[i]!;
    return {
      metodologia,
      valor: nr,
      nivel: n.nivel,
      aceptabilidad: n.aceptabilidad,
      significado: n.significado,
      color: n.color,
      fondo: n.fondo,
      prioridad: (i + 1) as 1 | 2 | 3 | 4,
      critico: i <= 1,
      detalle: `NP ${np} (${interpretarProbabilidad(np)}) × NC ${d.consecuencia} = NR ${nr}`,
    };
  }
  if (d.probabilidad == null || d.severidad == null) return null;
  const v = d.probabilidad * d.severidad;
  const i = NIVELES_RIESGO_5X5.findIndex((n) => v >= n.desde);
  const n = NIVELES_RIESGO_5X5[i]!;
  return {
    metodologia,
    valor: v,
    nivel: n.nivel,
    aceptabilidad: n.aceptabilidad,
    significado: n.significado,
    color: n.color,
    fondo: n.fondo,
    prioridad: (i + 1) as 1 | 2 | 3 | 4,
    critico: i <= 1,
    detalle: `Probabilidad ${d.probabilidad} × severidad ${d.severidad} = ${v}`,
  };
}

// Identificación --------------------------------------------------------------------

export const FACTORES_RIESGO_VIAL = [
  { id: 'humano', nombre: 'Factor humano', descripcion: 'Comportamiento, competencias, salud y fatiga de quien se desplaza.' },
  { id: 'vehiculo', nombre: 'Vehículo', descripcion: 'Estado mecánico, elementos de seguridad y equipos.' },
  { id: 'via', nombre: 'Vía e infraestructura', descripcion: 'Estado de la vía, señalización, puntos críticos.' },
  { id: 'entorno', nombre: 'Entorno', descripcion: 'Clima, iluminación, tráfico, orden público.' },
  { id: 'organizacion', nombre: 'Organización y gestión', descripcion: 'Jornadas, programación de viajes, presión de tiempos.' },
] as const;
export type FactorRiesgoVial = (typeof FACTORES_RIESGO_VIAL)[number]['id'];
export const IDS_FACTOR_RIESGO_VIAL = FACTORES_RIESGO_VIAL.map((f) => f.id) as [FactorRiesgoVial, ...FactorRiesgoVial[]];

/** Peligros frecuentes por factor, para elegir rápido al identificar. */
export const PELIGROS_SUGERIDOS: Readonly<Record<FactorRiesgoVial, readonly string[]>> = {
  humano: [
    'Exceso de velocidad o velocidad inadecuada',
    'Distracción por uso del celular al conducir',
    'Fatiga y somnolencia',
    'Conducción bajo efectos del alcohol o sustancias psicoactivas',
    'No uso del cinturón de seguridad',
    'No uso o uso inadecuado del casco y elementos de protección (motociclistas)',
    'Maniobras imprudentes o adelantamientos indebidos',
    'Desconocimiento de normas de tránsito',
    'Condiciones de salud que afectan la conducción',
    'Peatón que cruza por sitios no autorizados',
  ],
  vehiculo: [
    'Falla en el sistema de frenos',
    'Llantas en mal estado',
    'Falla en luces y señales',
    'Falta de elementos de seguridad (equipo de carretera, botiquín, extintor)',
    'Carga mal asegurada o sobrepeso',
    'Vehículo sin mantenimiento preventivo al día',
  ],
  via: [
    'Vías en mal estado (huecos, derrumbes)',
    'Señalización deficiente o inexistente',
    'Puntos críticos de accidentalidad en la ruta',
    'Vías sin berma o sin andén para peatones',
    'Pasos a nivel o intersecciones peligrosas',
  ],
  entorno: [
    'Lluvia, neblina o baja visibilidad',
    'Conducción nocturna',
    'Alto flujo vehicular y congestión',
    'Presencia de motociclistas y ciclistas en la vía',
    'Situaciones de orden público',
    'Animales en la vía',
  ],
  organizacion: [
    'Jornadas de conducción extensas sin pausas activas',
    'Presión por tiempos de entrega',
    'Desplazamientos in itinere en motocicleta',
    'Programación de viajes sin análisis de ruta',
    'Uso de vehículos de terceros o contratistas sin control',
  ],
};

export const TIPOS_DESPLAZAMIENTO = [
  { id: 'en_mision', nombre: 'En misión (laboral)' },
  { id: 'in_itinere', nombre: 'In itinere (casa–trabajo)' },
  { id: 'ambos', nombre: 'Ambos' },
] as const;
export type TipoDesplazamiento = (typeof TIPOS_DESPLAZAMIENTO)[number]['id'];
export const IDS_TIPO_DESPLAZAMIENTO = TIPOS_DESPLAZAMIENTO.map((t) => t.id) as [TipoDesplazamiento, ...TipoDesplazamiento[]];

export const ACTORES_VIALES = [
  { id: 'conductor', nombre: 'Conductor de vehículo' },
  { id: 'motociclista', nombre: 'Motociclista' },
  { id: 'ciclista', nombre: 'Ciclista' },
  { id: 'peaton', nombre: 'Peatón' },
  { id: 'pasajero', nombre: 'Pasajero' },
  { id: 'todos', nombre: 'Todos los actores' },
] as const;
export type ActorVial = (typeof ACTORES_VIALES)[number]['id'];
export const IDS_ACTOR_VIAL = ACTORES_VIALES.map((a) => a.id) as [ActorVial, ...ActorVial[]];

/** Jerarquía de controles (de la más eficaz a la menos eficaz). */
export const JERARQUIA_CONTROLES = [
  { id: 'eliminacion', nombre: 'Eliminación', ejemplo: 'Suprimir el desplazamiento (reunión virtual, cambio de ruta).' },
  { id: 'sustitucion', nombre: 'Sustitución', ejemplo: 'Cambiar motocicleta por vehículo de cuatro ruedas o transporte contratado.' },
  { id: 'ingenieria', nombre: 'Controles de ingeniería', ejemplo: 'Limitador de velocidad, GPS con alertas, sensores de fatiga, ABS.' },
  { id: 'administrativos', nombre: 'Controles administrativos y señalización', ejemplo: 'Procedimientos, capacitación, pausas activas, planificación de rutas.' },
  { id: 'epp', nombre: 'Elementos de protección personal', ejemplo: 'Casco certificado, chaleco reflectivo, guantes, protecciones.' },
] as const;
export type JerarquiaControl = (typeof JERARQUIA_CONTROLES)[number]['id'];
export const IDS_JERARQUIA_CONTROL = JERARQUIA_CONTROLES.map((j) => j.id) as [JerarquiaControl, ...JerarquiaControl[]];
