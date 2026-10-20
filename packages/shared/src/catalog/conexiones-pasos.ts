/**
 * Cómo se conectan los 24 pasos: qué pasos deben estar hechos antes de cerrar otro y en qué
 * herramienta de la plataforma se trabaja cada uno. Es una decisión de producto basada en la
 * lógica PHVA de la Resolución 40595 (no un requisito literal); se puede ajustar aquí.
 */

/** Prerrequisitos: un paso solo se marca «Hecho» si los que aplican de esta lista ya lo están. */
export const PRERREQUISITOS_PASO: Readonly<Record<number, readonly number[]>> = {
  1: [],
  2: [1],
  3: [1],
  4: [3],
  5: [1],
  6: [5],
  7: [5, 6],
  8: [6],
  9: [7, 8],
  10: [5, 6],
  11: [10],
  12: [6],
  13: [12],
  14: [6],
  15: [6],
  16: [6],
  17: [16],
  18: [6],
  19: [3],
  20: [7],
  21: [13],
  22: [9, 20],
  23: [22],
  24: [3],
};

/** Pasos que dependen de uno dado (para mostrar «este paso habilita…»). */
export function pasosQueDependenDe(paso: number): number[] {
  return Object.entries(PRERREQUISITOS_PASO)
    .filter(([, prev]) => prev.includes(paso))
    .map(([n]) => Number(n));
}

/**
 * Prerrequisitos pendientes de un paso según el estado de los demás. Los pasos que no aplican al
 * nivel de la organización no bloquean.
 */
export function prerrequisitosPendientes(paso: number, estados: Readonly<Record<number, string>>): number[] {
  return (PRERREQUISITOS_PASO[paso] ?? []).filter((p) => estados[p] !== undefined && estados[p] !== 'no_aplica' && estados[p] !== 'hecho');
}

export interface HerramientaPaso {
  ruta: string;
  nombre: string;
  descripcion: string;
}

/** Dónde se trabaja cada paso dentro de la plataforma (además de las evidencias). */
export const HERRAMIENTAS_PASO: Readonly<Record<number, readonly HerramientaPaso[]>> = {
  1: [
    { ruta: '/configuracion/miembros', nombre: 'Miembros y roles', descripcion: 'Asigna el rol de líder PESV.' },
    { ruta: '/documentos', nombre: 'Documentos', descripcion: 'Redacta y aprueba el acta de designación del líder.' },
  ],
  2: [{ ruta: '/comite', nombre: 'Comité de seguridad vial', descripcion: 'Integrantes, reuniones, actas y firmas.' }],
  3: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Redacta, aprueba y publica la política de seguridad vial.' }],
  4: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Compromiso de la dirección, recursos y responsabilidades.' }],
  5: [
    { ruta: '/perfil-conductores', nombre: 'Perfil de conductores', descripcion: 'Encuesta sociodemográfica y de hábitos de desplazamiento.' },
    { ruta: '/flota', nombre: 'Flota y conductores', descripcion: 'Caracterización de vehículos y conductores.' },
  ],
  6: [{ ruta: '/matriz-riesgos', nombre: 'Matriz de riesgos', descripcion: 'Identificación de peligros, evaluación y controles.' }],
  7: [{ ruta: '/indicadores', nombre: 'Objetivos, metas e indicadores', descripcion: 'Metas con su indicador y seguimiento.' }],
  8: [{ ruta: '/plan-trabajo', nombre: 'Plan de trabajo', descripcion: 'Programas de gestión para los riesgos críticos.' }],
  9: [{ ruta: '/plan-trabajo', nombre: 'Plan de trabajo', descripcion: 'Actividades, cronograma y ejecución del año.' }],
  10: [{ ruta: '/capacitacion', nombre: 'Plan de capacitación', descripcion: 'Programa anual, asistencia y eficacia.' }],
  11: [{ ruta: '/capacitacion', nombre: 'Plan de capacitación', descripcion: 'Formación en comportamiento seguro.' }],
  12: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Plan de preparación y respuesta ante emergencias viales.' }],
  13: [{ ruta: '/siniestros', nombre: 'Siniestros', descripcion: 'Registro e investigación interna.' }],
  14: [{ ruta: '/desplazamientos', nombre: 'Desplazamientos', descripcion: 'Rutas y vías con su análisis de riesgo.' }],
  15: [{ ruta: '/desplazamientos', nombre: 'Desplazamientos', descripcion: 'Planificación de desplazamientos laborales.' }],
  16: [{ ruta: '/preoperacional', nombre: 'Preoperacional', descripcion: 'Inspección diaria de vehículos.' }],
  17: [{ ruta: '/mantenimiento', nombre: 'Mantenimiento', descripcion: 'Planes preventivos y órdenes de trabajo.' }],
  18: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Procedimientos de gestión del cambio y de contratistas.' }],
  19: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Listado maestro, versiones y retención.' }],
  20: [
    { ruta: '/indicadores', nombre: 'Indicadores', descripcion: 'Fichas técnicas, mediciones y gráficas.' },
    { ruta: '/vigia', nombre: 'Reporte VIGIA 2', descripcion: 'Reporte de autogestión a Supertransporte.' },
  ],
  21: [{ ruta: '/siniestros', nombre: 'Siniestros', descripcion: 'Estadística de siniestralidad.' }],
  22: [{ ruta: '/auditorias', nombre: 'Auditorías', descripcion: 'Auditoría anual y preauditoría con IA.' }],
  23: [{ ruta: '/plan-accion', nombre: 'Plan de acción', descripcion: 'Acciones correctivas, preventivas y de mejora.' }],
  24: [{ ruta: '/documentos', nombre: 'Documentos', descripcion: 'Mecanismos de comunicación y participación.' }],
};
