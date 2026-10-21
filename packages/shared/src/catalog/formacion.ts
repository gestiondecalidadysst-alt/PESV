/**
 * Plan anual de formación del PESV (paso 10). Los temas son una guía editable: cada organización
 * los ajusta a su matriz de riesgos y a sus actores viales.
 */

export const TEMAS_FORMACION = [
  { id: 'politica_pesv', nombre: 'Política y objetivos del PESV', descripcion: 'Compromisos de la organización, roles y responsabilidades en seguridad vial.' },
  { id: 'normativa', nombre: 'Normas de tránsito', descripcion: 'Código Nacional de Tránsito, señalización y obligaciones de cada actor vial.' },
  { id: 'riesgos_viales', nombre: 'Riesgos viales de la organización', descripcion: 'Peligros y controles de la matriz de riesgos, rutas y puntos críticos.' },
  { id: 'manejo_defensivo', nombre: 'Conducción preventiva y manejo defensivo', descripcion: 'Distancia de seguimiento, anticipación, maniobras seguras.' },
  { id: 'velocidad', nombre: 'Gestión de la velocidad', descripcion: 'Límites, velocidad segura según la vía y el clima, consecuencias del exceso.' },
  { id: 'fatiga', nombre: 'Fatiga, somnolencia y pausas activas', descripcion: 'Jornadas, descansos y señales de alerta.' },
  { id: 'alcohol_sustancias', nombre: 'Alcohol y sustancias psicoactivas', descripcion: 'Efectos en la conducción, política de cero consumo y controles.' },
  { id: 'distractores', nombre: 'Distractores al conducir', descripcion: 'Uso del celular y otras distracciones.' },
  { id: 'actores_vulnerables', nombre: 'Actores viales vulnerables', descripcion: 'Peatones, ciclistas y motociclistas: convivencia y protección.' },
  { id: 'motociclistas', nombre: 'Conducción segura de motocicleta', descripcion: 'Elementos de protección, maniobras y riesgos propios de la moto.' },
  { id: 'inspeccion_vehiculo', nombre: 'Inspección preoperacional y mantenimiento', descripcion: 'Revisión diaria del vehículo y reporte de fallas.' },
  { id: 'emergencias', nombre: 'Atención de emergencias y primeros auxilios', descripcion: 'Qué hacer ante un siniestro vial, plan de emergencias.' },
  { id: 'reporte_siniestros', nombre: 'Reporte e investigación de siniestros', descripcion: 'Cómo reportar siniestros e incidentes y para qué se investigan.' },
  { id: 'otro', nombre: 'Otro tema', descripcion: 'Tema definido por la organización.' },
] as const;
export type TemaFormacion = (typeof TEMAS_FORMACION)[number]['id'];
export const IDS_TEMA_FORMACION = TEMAS_FORMACION.map((t) => t.id) as [TemaFormacion, ...TemaFormacion[]];

export const PUBLICOS_FORMACION = [
  { id: 'conductores', nombre: 'Conductores' },
  { id: 'motociclistas', nombre: 'Motociclistas' },
  { id: 'peatones', nombre: 'Peatones y personal en general' },
  { id: 'ciclistas', nombre: 'Ciclistas' },
  { id: 'directivos', nombre: 'Alta dirección' },
  { id: 'comite', nombre: 'Comité de seguridad vial' },
  { id: 'lider', nombre: 'Líder del PESV' },
  { id: 'contratistas', nombre: 'Contratistas' },
] as const;
export type PublicoFormacion = (typeof PUBLICOS_FORMACION)[number]['id'];
export const IDS_PUBLICO_FORMACION = PUBLICOS_FORMACION.map((p) => p.id) as [PublicoFormacion, ...PublicoFormacion[]];

export const TIPOS_FORMACION = [
  { id: 'induccion', nombre: 'Inducción' },
  { id: 'reinduccion', nombre: 'Reinducción' },
  { id: 'formacion', nombre: 'Capacitación' },
  { id: 'entrenamiento', nombre: 'Entrenamiento práctico' },
  { id: 'sensibilizacion', nombre: 'Sensibilización' },
] as const;
export type TipoFormacion = (typeof TIPOS_FORMACION)[number]['id'];
export const IDS_TIPO_FORMACION = TIPOS_FORMACION.map((t) => t.id) as [TipoFormacion, ...TipoFormacion[]];

export const MODALIDADES_FORMACION = [
  { id: 'presencial', nombre: 'Presencial' },
  { id: 'virtual', nombre: 'Virtual' },
  { id: 'mixta', nombre: 'Mixta' },
  { id: 'practica', nombre: 'Práctica en pista o vía' },
] as const;
export type ModalidadFormacion = (typeof MODALIDADES_FORMACION)[number]['id'];
export const IDS_MODALIDAD_FORMACION = MODALIDADES_FORMACION.map((m) => m.id) as [ModalidadFormacion, ...ModalidadFormacion[]];

export const FACILITADORES = [
  { id: 'interno', nombre: 'Interno' },
  { id: 'externo', nombre: 'Proveedor externo' },
  { id: 'arl', nombre: 'ARL' },
] as const;
export type TipoFacilitador = (typeof FACILITADORES)[number]['id'];
export const IDS_FACILITADOR = FACILITADORES.map((f) => f.id) as [TipoFacilitador, ...TipoFacilitador[]];

export const METODOS_EVALUACION = [
  { id: 'evaluacion_escrita', nombre: 'Evaluación escrita', calificable: true },
  { id: 'practica', nombre: 'Prueba práctica', calificable: true },
  { id: 'observacion', nombre: 'Observación del comportamiento', calificable: false },
  { id: 'sin_evaluacion', nombre: 'Sin evaluación', calificable: false },
] as const;
export type MetodoEvaluacion = (typeof METODOS_EVALUACION)[number]['id'];
export const IDS_METODO_EVALUACION = METODOS_EVALUACION.map((m) => m.id) as [MetodoEvaluacion, ...MetodoEvaluacion[]];

// Indicadores ------------------------------------------------------------------------

export interface CapacitacionParaIndicadores {
  estado: 'programada' | 'ejecutada' | 'cancelada';
  /** AAAA-MM-DD */
  programadaEl: string;
  horas: number | null;
  notaMinima: number;
  asistentes: { conductorId: string | null; asistio: boolean; nota: number | null }[];
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);

/**
 * Indicadores del plan de formación de un año:
 * - cumplimiento: ejecutadas ÷ programadas con fecha hasta el corte (sin canceladas);
 * - cobertura: conductores activos formados en el año ÷ conductores activos;
 * - eficacia: asistentes que aprobaron ÷ asistentes evaluados;
 * - asistencia: asistentes ÷ convocados de las ejecutadas;
 * - horas-persona de formación.
 */
export function indicadoresFormacion(capacitaciones: CapacitacionParaIndicadores[], conductoresActivos: string[], corte: string) {
  const vigentes = capacitaciones.filter((c) => c.estado !== 'cancelada');
  const vencidas = vigentes.filter((c) => c.programadaEl <= corte);
  const ejecutadas = vigentes.filter((c) => c.estado === 'ejecutada');
  const formados = new Set(ejecutadas.flatMap((c) => c.asistentes.filter((a) => a.asistio && a.conductorId).map((a) => a.conductorId!)));
  const activos = new Set(conductoresActivos);
  const formadosActivos = [...formados].filter((id) => activos.has(id)).length;
  const asistentes = ejecutadas.flatMap((c) => c.asistentes.filter((a) => a.asistio).map((a) => ({ ...a, notaMinima: c.notaMinima })));
  const evaluados = asistentes.filter((a) => a.nota != null);
  const aprobados = evaluados.filter((a) => a.nota! >= a.notaMinima);
  const convocados = ejecutadas.reduce((s, c) => s + c.asistentes.length, 0);
  const porMes = Array.from({ length: 12 }, (_, i) => {
    const mes = vigentes.filter((c) => Number(c.programadaEl.slice(5, 7)) === i + 1);
    return { programadas: mes.length, ejecutadas: mes.filter((c) => c.estado === 'ejecutada').length };
  });
  return {
    programadas: vigentes.length,
    programadasALaFecha: vencidas.length,
    ejecutadas: ejecutadas.length,
    ejecutadasALaFecha: vencidas.filter((c) => c.estado === 'ejecutada').length,
    cumplimiento: pct(vencidas.filter((c) => c.estado === 'ejecutada').length, vencidas.length),
    conductoresActivos: activos.size,
    conductoresFormados: formadosActivos,
    cobertura: pct(formadosActivos, activos.size),
    evaluados: evaluados.length,
    aprobados: aprobados.length,
    eficacia: pct(aprobados.length, evaluados.length),
    convocados,
    asistentes: asistentes.length,
    asistencia: pct(asistentes.length, convocados),
    horasPersona: Math.round(ejecutadas.reduce((s, c) => s + (c.horas ?? 0) * c.asistentes.filter((a) => a.asistio).length, 0) * 10) / 10,
    porMes,
  };
}
export type IndicadoresFormacion = ReturnType<typeof indicadoresFormacion>;
