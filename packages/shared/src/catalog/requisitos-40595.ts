import type { Nivel } from '../types';
import type { ClaseDocumento } from './documentos';

/**
 * Requisitos de cada paso de la Resolución 40595 de 2022 y cómo se verifican en la plataforma.
 *
 * Cada requisito resume lo que exige el anexo de la resolución (la cita indica el paso y el literal)
 * y declara su verificación:
 *  - «dato»: la plataforma lo calcula con los registros de la organización (regla fija, RN-07);
 *  - «documento»: un documento controlado del paso, aprobado y vigente;
 *  - «registro»: el líder lo verifica y lo soporta con una evidencia aprobada del paso.
 *
 * Lo que la norma no exige no se marca como obligatorio («obligatorio: false» = recomendado).
 * «porValidar» señala lo que aún debe cotejarse con el texto del Diario Oficial o confirmar el
 * experto; no cambia la exigencia, solo se muestra.
 */

export type ReglaRequisito =
  | 'comite_integrantes'
  | 'comite_trimestral'
  | 'perfil_colaboradores'
  | 'flota_registrada'
  | 'rutas_registradas'
  | 'matriz_riesgos'
  | 'matriz_exposicion'
  | 'riesgos_criticos_con_medida'
  | 'matriz_actualizada'
  | 'matriz_tras_siniestro'
  | 'metas_anio'
  | 'programas_completos'
  | 'equipos_velocidad'
  | 'pruebas_sustancias'
  | 'programas_actualizados'
  | 'programas_revision_trimestral'
  | 'plan_trabajo_anio'
  | 'plan_formacion_anio'
  | 'formacion_por_riesgo'
  | 'formacion_emergencias'
  | 'siniestros_investigados'
  | 'siniestros_con_acciones'
  | 'preoperacional_al_dia'
  | 'mantenimiento_planes'
  | 'indicadores_tabla10'
  | 'indicadores_medidos'
  | 'auditoria_anual'
  | 'auditor_independiente'
  | 'nc_auditoria_tratadas';

export type VerificacionRequisito =
  | { tipo: 'dato'; regla: ReglaRequisito; criterio: string }
  | { tipo: 'documento'; clases: readonly ClaseDocumento[]; divulgado?: boolean; maxMeses?: number }
  | { tipo: 'registro'; vigenciaMeses?: number };

export interface RequisitoPaso {
  id: string;
  paso: number;
  texto: string;
  cita: string;
  obligatorio: boolean;
  /** Niveles a los que aplica cuando son menos que los del paso. */
  niveles?: readonly Nivel[];
  verificacion: VerificacionRequisito;
  /** Dónde se trabaja en la plataforma. */
  ruta?: string;
  porValidar?: string;
}

export const FUENTE_REQUISITOS = {
  version: 'RES-40595-2022',
  oficial: 'Resolución 20223040040595 de 2022, anexo (Normograma de la Cancillería), pasos 1 a 16',
  noOficial: 'Pasos 17 a 23 tomados de una copia no oficial del anexo; se cotejan con el Diario Oficial 52.102',
} as const;

const COPIA = 'Tomado de una copia no oficial del anexo; cotejar con el Diario Oficial 52.102.';
const ESTANDAR_Y_AVANZADO = ['estandar', 'avanzado'] as const;

export const REQUISITOS_40595: readonly RequisitoPaso[] = [
  // Paso 1 -------------------------------------------------------------------------------
  { id: 'P1.1', paso: 1, cita: 'Paso 1', obligatorio: true, ruta: '/documentos', texto: 'El nivel directivo designa al líder del diseño e implementación del PESV, con poder de decisión.', verificacion: { tipo: 'documento', clases: ['acta'] } },
  { id: 'P1.2', paso: 1, cita: 'Paso 1 y paso 10', obligatorio: true, texto: 'El líder conoce la metodología y los requisitos legales de seguridad vial; su competencia está definida según el paso 10.', verificacion: { tipo: 'registro' } },

  // Paso 2 -------------------------------------------------------------------------------
  { id: 'P2.1', paso: 2, cita: 'Paso 2', obligatorio: true, ruta: '/comite', texto: 'El comité tiene al menos tres integrantes con poder de decisión, incluido el líder del PESV.', verificacion: { tipo: 'dato', regla: 'comite_integrantes', criterio: 'Tres o más integrantes activos en el comité.' } },
  { id: 'P2.2', paso: 2, cita: 'Paso 2, literales a) a f)', obligatorio: true, ruta: '/documentos', texto: 'Acta de conformación del comité designado por el nivel directivo, con sus funciones y los procesos o áreas que acompaña cada miembro.', verificacion: { tipo: 'documento', clases: ['acta'] } },
  { id: 'P2.3', paso: 2, cita: 'Paso 2, literal f)', obligatorio: true, ruta: '/comite', texto: 'El comité revisa el PESV al menos una vez por trimestre y documenta el análisis de siniestralidad, indicadores, plan anual, auditorías e implementación.', verificacion: { tipo: 'dato', regla: 'comite_trimestral', criterio: 'Una reunión cerrada con acta en cada trimestre terminado de los últimos doce meses.' } },

  // Paso 3 -------------------------------------------------------------------------------
  { id: 'P3.1', paso: 3, cita: 'Paso 3, literales a) a g)', obligatorio: true, ruta: '/documentos', texto: 'Política de seguridad vial aprobada que incluye los compromisos de la dirección, es adecuada a los riesgos, da marco a los objetivos, cumple los requisitos legales, se compromete con la mejora continua y cubre los desplazamientos laborales e in itinere. Revisada al menos cada tres años.', verificacion: { tipo: 'documento', clases: ['politica'], maxMeses: 36 } },
  { id: 'P3.2', paso: 3, cita: 'Paso 3, literal f)', obligatorio: true, texto: 'La política está fechada y firmada por el representante legal.', verificacion: { tipo: 'registro' }, porValidar: 'Confirmar si puede firmar un apoderado.' },
  { id: 'P3.3', paso: 3, cita: 'Paso 3, literal g)', obligatorio: true, ruta: '/documentos', texto: 'La política está socializada y es accesible en todos los niveles de la organización.', verificacion: { tipo: 'documento', clases: ['politica'], divulgado: true } },

  // Paso 4 -------------------------------------------------------------------------------
  { id: 'P4.1', paso: 4, cita: 'Paso 4, literal c)', obligatorio: true, ruta: '/plan-trabajo', texto: 'El nivel directivo suministra los recursos financieros, técnicos y humanos para el PESV.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P4.2', paso: 4, cita: 'Paso 4, literal d)', obligatorio: true, texto: 'Los vehículos, equipos, repuestos y servicios se adquieren o contratan con especificaciones de seguridad.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P4.3', paso: 4, cita: 'Paso 4, literal e)', obligatorio: true, texto: 'La dirección hace seguimiento a que contratistas, terceros y la comunidad cumplan los requisitos de seguridad vial.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P4.4', paso: 4, cita: 'Paso 4, literal g)', obligatorio: true, texto: 'La dirección atiende a las entidades verificadoras, participa en las reuniones de apertura y cierre y gestiona los hallazgos de sus visitas (si no hubo visitas, se deja constancia).', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P4.5', paso: 4, cita: 'Paso 4, literal h)', obligatorio: true, ruta: '/comite', texto: 'La dirección participa al menos una vez al año en una reunión del comité para revisar los resultados del PESV.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: 'En nivel básico no hay comité obligatorio: definir la instancia equivalente.' },

  // Paso 5 -------------------------------------------------------------------------------
  { id: 'P5.1', paso: 5, cita: 'Paso 5', obligatorio: true, texto: 'Diagnóstico (línea base) documentado y actualizado al menos una vez al año.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P5.2', paso: 5, cita: 'Paso 5, literal c)', obligatorio: true, ruta: '/perfil-conductores', texto: 'Caracterización de los colaboradores (datos personales, licencia, formación, siniestros, infracciones y medio de transporte).', verificacion: { tipo: 'dato', regla: 'perfil_colaboradores', criterio: 'Conductores registrados y al menos una encuesta de perfil con respuestas en los últimos doce meses.' } },
  { id: 'P5.3', paso: 5, cita: 'Paso 5, literal d)', obligatorio: true, ruta: '/flota', texto: 'Inventario de vehículos automotores y no automotores con sus datos técnicos, SOAT y revisión técnico-mecánica.', verificacion: { tipo: 'dato', regla: 'flota_registrada', criterio: 'Vehículos registrados y todos los automotores con fecha de vencimiento del SOAT.' } },
  { id: 'P5.4', paso: 5, cita: 'Paso 5, literal e)', obligatorio: true, ruta: '/desplazamientos', texto: 'Rutas frecuentes con sus kilómetros y frecuencia de uso.', verificacion: { tipo: 'dato', regla: 'rutas_registradas', criterio: 'Al menos una ruta activa con distancia y frecuencia.' } },
  { id: 'P5.5', paso: 5, cita: 'Paso 5, literales a), b) y f)', obligatorio: true, texto: 'Sedes y servicios, contratistas que hacen desplazamientos laborales, y datos de emergencias viales (capacitados, equipos de primeros auxilios y simulacros).', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 6 -------------------------------------------------------------------------------
  { id: 'P6.1', paso: 6, cita: 'Paso 6', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento de evaluación y control de riesgos viales que cubre desplazamientos laborales, vías de la organización, entorno, trayectos in itinere y comunidad.', verificacion: { tipo: 'documento', clases: ['procedimiento'] } },
  { id: 'P6.2', paso: 6, cita: 'Paso 6, numeral 1', obligatorio: true, ruta: '/matriz-riesgos', texto: 'Riesgos identificados y valorados para todos los colaboradores (peatones, pasajeros y conductores).', verificacion: { tipo: 'dato', regla: 'matriz_riesgos', criterio: 'Matriz con riesgos y todos valorados.' } },
  { id: 'P6.3', paso: 6, cita: 'Paso 6, numerales 2 y 3', obligatorio: true, ruta: '/matriz-riesgos', texto: 'El análisis considera como mínimo la exposición y la probabilidad, con un mapa de calor.', verificacion: { tipo: 'dato', regla: 'matriz_exposicion', criterio: 'Todos los riesgos valorados con una metodología que incluye la exposición.' }, porValidar: 'Decidir si se retira la matriz 5×5 (no incluye exposición).' },
  { id: 'P6.4', paso: 6, cita: 'Paso 6, numeral 4', obligatorio: true, ruta: '/matriz-riesgos', texto: 'Los riesgos críticos tienen controles seleccionados.', verificacion: { tipo: 'dato', regla: 'riesgos_criticos_con_medida', criterio: 'Cada riesgo crítico tiene al menos una medida de intervención.' } },
  { id: 'P6.5', paso: 6, cita: 'Paso 6', obligatorio: true, ruta: '/matriz-riesgos', texto: 'La matriz se revisa y actualiza al menos una vez al año.', verificacion: { tipo: 'dato', regla: 'matriz_actualizada', criterio: 'Algún riesgo creado o actualizado en los últimos doce meses.' } },
  { id: 'P6.6', paso: 6, cita: 'Paso 6', obligatorio: true, ruta: '/matriz-riesgos', texto: 'La matriz se actualiza después de un siniestro con muertos o lesionados.', verificacion: { tipo: 'dato', regla: 'matriz_tras_siniestro', criterio: 'Después de cada siniestro con víctimas de los últimos doce meses hay una actualización de la matriz.' } },

  // Paso 7 -------------------------------------------------------------------------------
  { id: 'P7.1', paso: 7, cita: 'Paso 7', obligatorio: true, ruta: '/indicadores?vista=metas', texto: 'Objetivos y metas claros, medibles y cuantificables para el año, coherentes con la política, los riesgos y el plan.', verificacion: { tipo: 'dato', regla: 'metas_anio', criterio: 'Al menos una meta del año en curso ligada a un indicador.' } },
  { id: 'P7.2', paso: 7, cita: 'Paso 7', obligatorio: true, texto: 'Los objetivos y metas están documentados, comunicados a todos los colaboradores y revisados al menos una vez al año.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 8 -------------------------------------------------------------------------------
  { id: 'P8.1', paso: 8, cita: 'Paso 8', obligatorio: true, ruta: '/programas', texto: 'Los cinco programas obligatorios (velocidad segura, fatiga, distracción, cero alcohol y sustancias, actores viales vulnerables) con todo su contenido mínimo.', verificacion: { tipo: 'dato', regla: 'programas_completos', criterio: 'Los cinco programas creados, con los 14 campos del contenido mínimo y los elementos de la norma confirmados.' } },
  { id: 'P8.2', paso: 8, cita: 'Paso 8, programa de velocidad', obligatorio: true, ruta: '/programas', texto: 'Equipos de medición de la velocidad con calibración vigente.', verificacion: { tipo: 'dato', regla: 'equipos_velocidad', criterio: 'Al menos un equipo activo; todos con calibración registrada y vigente.' } },
  { id: 'P8.3', paso: 8, cita: 'Paso 8, programa de alcohol y sustancias', obligatorio: true, ruta: '/programas', texto: 'Pruebas aleatorias a los conductores y controles anuales en sangre (alcohol) y orina (sustancias).', verificacion: { tipo: 'dato', regla: 'pruebas_sustancias', criterio: 'Pruebas aleatorias en los últimos doce meses y controles anuales vigentes para todos los conductores activos.' }, porValidar: 'La norma los presenta como factores de desempeño del programa; confirmar si se exigen a todos los conductores.' },
  { id: 'P8.4', paso: 8, cita: 'Paso 8', obligatorio: true, ruta: '/programas', texto: 'Los programas y sus factores de desempeño se actualizan al menos una vez al año y se divulgan a todos los colaboradores.', verificacion: { tipo: 'dato', regla: 'programas_actualizados', criterio: 'Cada programa obligatorio actualizado y divulgado en los últimos doce meses.' } },
  { id: 'P8.5', paso: 8, cita: 'Paso 8', obligatorio: true, ruta: '/programas', texto: 'Los resultados de los programas se analizan cada trimestre en el comité de seguridad vial.', verificacion: { tipo: 'dato', regla: 'programas_revision_trimestral', criterio: 'Revisión registrada del último trimestre terminado.' }, porValidar: 'En nivel básico la revisión la hace el líder con la dirección.' },

  // Paso 9 -------------------------------------------------------------------------------
  { id: 'P9.1', paso: 9, cita: 'Paso 9', obligatorio: true, ruta: '/plan-trabajo', texto: 'Plan anual de trabajo documentado con objetivos, metas, responsables, recursos y cronograma.', verificacion: { tipo: 'dato', regla: 'plan_trabajo_anio', criterio: 'Actividades del año en curso, todas con responsable y meses programados, y al menos una ligada a una meta.' } },
  { id: 'P9.2', paso: 9, cita: 'Paso 9', obligatorio: true, ruta: '/plan-trabajo', texto: 'El plan se elabora con la política, el diagnóstico, los riesgos, los objetivos y metas y los programas de riesgos críticos.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 10 ------------------------------------------------------------------------------
  { id: 'P10.1', paso: 10, cita: 'Paso 10, A', obligatorio: true, texto: 'Competencia (educación, formación y experiencia) documentada para los roles que aplican: líder, comité, capacitadores, planificadores de rutas, mantenimiento, auditores, brigadistas, investigadores y conductores.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P10.2', paso: 10, cita: 'Paso 10, B', obligatorio: true, ruta: '/capacitacion', texto: 'Plan anual de formación con temas por actor vial, intensidad horaria, modalidad, frecuencia, responsables y recursos.', verificacion: { tipo: 'dato', regla: 'plan_formacion_anio', criterio: 'Capacitaciones del año en curso, todas con horas, modalidad y facilitador.' } },
  { id: 'P10.3', paso: 10, cita: 'Paso 10, B', obligatorio: true, ruta: '/capacitacion', texto: 'La formación se prioriza con los riesgos (paso 6) y el plan de trabajo (paso 9).', verificacion: { tipo: 'dato', regla: 'formacion_por_riesgo', criterio: 'Al menos una capacitación del año ligada a un riesgo de la matriz.' } },

  // Paso 11 (avanzado) -------------------------------------------------------------------
  { id: 'P11.1', paso: 11, cita: 'Paso 11, numeral 1', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento de contratación de conductores con requisitos de seguridad vial.', verificacion: { tipo: 'documento', clases: ['procedimiento'] } },
  { id: 'P11.2', paso: 11, cita: 'Paso 11, numeral 2', obligatorio: true, texto: 'Responsabilidades documentadas y comunicadas a todos: reportar siniestros, capacitarse, cumplir las normas y reportar las condiciones de salud.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P11.3', paso: 11, cita: 'Paso 11, numeral 3', obligatorio: true, ruta: '/riesgo', texto: 'Evaluación anual del comportamiento (siniestros, infracciones, quejas y capacitaciones) y procedimiento para identificar quién necesita refuerzo de formación.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P11.4', paso: 11, cita: 'Paso 11, numeral 4', obligatorio: true, ruta: '/documentos', texto: 'Estrategia documentada para promover hábitos y conductas seguras y la corresponsabilidad.', verificacion: { tipo: 'documento', clases: ['programa', 'plan', 'procedimiento'] } },

  // Paso 12 ------------------------------------------------------------------------------
  { id: 'P12.1', paso: 12, cita: 'Paso 12', obligatorio: true, ruta: '/documentos', texto: 'Plan de preparación y respuesta ante emergencias viales con: cadena de llamadas y número único de emergencias, riesgos de las rutas, centros de atención médica, protocolo del brigadista, capacitación y equipos.', verificacion: { tipo: 'documento', clases: ['plan', 'procedimiento'] } },
  { id: 'P12.2', paso: 12, cita: 'Paso 12', obligatorio: true, ruta: '/capacitacion', texto: 'Capacitación en protocolos de atención a víctimas, incluido el protocolo PAS (proteger, avisar, socorrer).', verificacion: { tipo: 'dato', regla: 'formacion_emergencias', criterio: 'Una capacitación ejecutada en los últimos doce meses con el tema de emergencias y primeros auxilios.' } },
  { id: 'P12.3', paso: 12, cita: 'Paso 12', obligatorio: true, texto: 'Simulacro de emergencia vial al menos una vez al año.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 13 (estándar y avanzado) --------------------------------------------------------
  { id: 'P13.1', paso: 13, cita: 'Paso 13', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento para reportar, registrar, investigar, analizar y divulgar los siniestros viales.', verificacion: { tipo: 'documento', clases: ['procedimiento'] } },
  { id: 'P13.2', paso: 13, cita: 'Paso 13', obligatorio: true, ruta: '/siniestros', texto: 'Los siniestros con muertos o lesionados se investigan: factores humano, infraestructura y vehículo; causas inmediatas, raíz y fallas de control.', verificacion: { tipo: 'dato', regla: 'siniestros_investigados', criterio: 'Cada siniestro con víctimas de los últimos doce meses tiene la investigación cerrada con causas inmediatas y raíz.' } },
  { id: 'P13.3', paso: 13, cita: 'Paso 13', obligatorio: true, ruta: '/siniestros', texto: 'Planes de acción con actividades, responsable, fecha, recursos y seguimiento para evitar nuevos casos.', verificacion: { tipo: 'dato', regla: 'siniestros_con_acciones', criterio: 'Cada siniestro con víctimas investigado tiene al menos una acción.' } },
  { id: 'P13.4', paso: 13, cita: 'Paso 13', obligatorio: true, texto: 'Se divulgan las lecciones aprendidas y se evalúa la eficacia de las acciones correctivas.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 14 ------------------------------------------------------------------------------
  { id: 'P14.1', paso: 14, cita: 'Paso 14', obligatorio: true, ruta: '/documentos', texto: 'Protocolo de operación y mantenimiento de las vías que la organización tiene a cargo, administra o controla, con el registro de los siniestros en ellas.', verificacion: { tipo: 'documento', clases: ['procedimiento', 'manual', 'instructivo'] }, porValidar: 'Si la organización no administra vías, confirmar que basta la justificación de no aplicabilidad.' },
  { id: 'P14.2', paso: 14, cita: 'Paso 14', obligatorio: true, texto: 'Zonas de conflicto de tránsito identificadas, con planes de acción.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },
  { id: 'P14.3', paso: 14, cita: 'Paso 14', obligatorio: true, texto: 'Inspección anual de las vías y plan de mantenimiento preventivo de la infraestructura, incluida la señalización, con su ejecución.', verificacion: { tipo: 'registro', vigenciaMeses: 12 } },

  // Paso 15 ------------------------------------------------------------------------------
  { id: 'P15.1', paso: 15, cita: 'Paso 15', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento de planificación de desplazamientos (incluidas salidas extramurales e ingreso y salida de instalaciones) con antelación, requisitos de inicio y fin, horarios y tiempos de conducción, velocidades, requisitos de conductores y vehículos, documentos, paradas seguras, controles en ruta, prevención de fatiga, velocidad y distracción, y capacitación.', verificacion: { tipo: 'documento', clases: ['procedimiento'] } },

  // Paso 16 ------------------------------------------------------------------------------
  { id: 'P16.1', paso: 16, cita: 'Paso 16', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento de inspección preoperacional con los responsables de inspeccionar y de controlar, y los criterios para conservar los registros del último año.', verificacion: { tipo: 'documento', clases: ['procedimiento', 'instructivo'] } },
  { id: 'P16.2', paso: 16, cita: 'Paso 16', obligatorio: true, ruta: '/preoperacional', texto: 'Inspección preoperacional diaria de los vehículos usados en desplazamientos laborales.', verificacion: { tipo: 'dato', regla: 'preoperacional_al_dia', criterio: 'Todos los vehículos automotores activos con inspección en los últimos siete días.' } },
  { id: 'P16.3', paso: 16, cita: 'Paso 16', obligatorio: true, ruta: '/preoperacional', texto: 'La lista de chequeo verifica documentos del vehículo y del conductor, luces, llantas con repuesto, fluidos, cinturones, limpiabrisas, espejos, equipo de prevención y seguridad, y casco en motocicletas.', verificacion: { tipo: 'registro' } },

  // Paso 17 ------------------------------------------------------------------------------
  { id: 'P17.1', paso: 17, cita: 'Paso 17', obligatorio: true, ruta: '/mantenimiento', texto: 'Plan de mantenimiento preventivo de los vehículos, basado en inspecciones, condiciones inseguras, riesgos y recomendaciones del fabricante.', verificacion: { tipo: 'dato', regla: 'mantenimiento_planes', criterio: 'Cada vehículo automotor activo tiene un plan preventivo activo.' }, porValidar: COPIA },
  { id: 'P17.2', paso: 17, cita: 'Paso 17', obligatorio: true, ruta: '/mantenimiento', texto: 'Hoja de vida de cada vehículo con su historial de intervenciones, responsables y repuestos, incluidos los vehículos de colaboradores al servicio de la organización.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },

  // Paso 18 (estándar y avanzado) --------------------------------------------------------
  { id: 'P18.1', paso: 18, cita: 'Paso 18', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento para evaluar el impacto de los cambios internos y externos antes de implementarlos.', verificacion: { tipo: 'documento', clases: ['procedimiento'] }, porValidar: COPIA },
  { id: 'P18.2', paso: 18, cita: 'Paso 18', obligatorio: true, texto: 'Protocolo de contratistas: verificar su PESV, requisitos de vehículos y conductores, documentación vigente, preoperacional, capacitación y reporte de siniestros y de salud.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },
  { id: 'P18.3', paso: 18, cita: 'Paso 18', obligatorio: true, texto: 'Mecanismo de evaluación del cumplimiento de los contratistas y responsables de supervisarlo.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },

  // Paso 19 (estándar y avanzado) --------------------------------------------------------
  { id: 'P19.1', paso: 19, cita: 'Paso 19', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento para controlar, actualizar y proteger la documentación y los registros del PESV.', verificacion: { tipo: 'documento', clases: ['procedimiento'] }, porValidar: COPIA },
  { id: 'P19.2', paso: 19, cita: 'Paso 19', obligatorio: true, texto: 'Los registros se conservan al menos cinco años (los preoperacionales, un año) y los datos personales se tratan conforme a la Ley 1581 de 2012.', verificacion: { tipo: 'registro' }, porValidar: COPIA },

  // Paso 20 ------------------------------------------------------------------------------
  { id: 'P20.1', paso: 20, cita: 'Paso 20, tabla 10', obligatorio: true, ruta: '/indicadores', texto: 'Los indicadores mínimos de la tabla 10, con ficha, línea base y meta.', verificacion: { tipo: 'dato', regla: 'indicadores_tabla10', criterio: 'Un indicador activo por cada cálculo de la tabla 10 que aplica al nivel.' }, porValidar: COPIA },
  { id: 'P20.2', paso: 20, cita: 'Paso 20', obligatorio: true, ruta: '/indicadores', texto: 'Los indicadores se miden en cada corte trimestral (31 de marzo, 30 de junio, 30 de septiembre y 31 de diciembre).', verificacion: { tipo: 'dato', regla: 'indicadores_medidos', criterio: 'Los indicadores activos tienen el resultado registrado del último periodo terminado.' }, porValidar: COPIA },
  { id: 'P20.3', paso: 20, cita: 'Paso 20', obligatorio: true, niveles: ESTANDAR_Y_AVANZADO, ruta: '/comite', texto: 'El comité analiza y evalúa los indicadores.', verificacion: { tipo: 'registro', vigenciaMeses: 3 }, porValidar: COPIA },
  { id: 'P20.4', paso: 20, cita: 'Paso 20', obligatorio: true, ruta: '/vigia', texto: 'Reporte anual de autogestión con corte al 31 de diciembre, enviado a más tardar el 31 de enero a la entidad verificadora.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },

  // Paso 21 (avanzado) -------------------------------------------------------------------
  { id: 'P21.1', paso: 21, cita: 'Paso 21', obligatorio: true, ruta: '/siniestros', texto: 'Nivel de pérdida definido con la pirámide de la seguridad vial y matriz de nivel de pérdida; registro estadístico por gravedad que separa los desplazamientos laborales de los no laborales.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },
  { id: 'P21.2', paso: 21, cita: 'Paso 21', obligatorio: true, ruta: '/siniestros', texto: 'Análisis con tendencia, límite máximo tolerable, proyección hacia cero siniestros, correlación espacial y temporal y causas, con conclusiones para los pasos 9 y 10.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },

  // Paso 22 ------------------------------------------------------------------------------
  { id: 'P22.1', paso: 22, cita: 'Paso 22', obligatorio: true, ruta: '/documentos', texto: 'Procedimiento de auditoría con planificación, pautas, responsables, contenido del informe y seguimiento de no conformidades.', verificacion: { tipo: 'documento', clases: ['procedimiento'] }, porValidar: COPIA },
  { id: 'P22.2', paso: 22, cita: 'Paso 22', obligatorio: true, ruta: '/auditorias', texto: 'Auditoría interna al menos una vez al año que evalúa los pasos, los requisitos legales y la no aplicabilidad.', verificacion: { tipo: 'dato', regla: 'auditoria_anual', criterio: 'Una auditoría ejecutada en los últimos doce meses.' }, porValidar: COPIA },
  { id: 'P22.3', paso: 22, cita: 'Paso 22', obligatorio: true, ruta: '/auditorias', texto: 'La auditoría la hace un auditor distinto del líder del PESV, con competencia según el paso 10.', verificacion: { tipo: 'dato', regla: 'auditor_independiente', criterio: 'La última auditoría ejecutada tiene un auditor independiente del líder.' }, porValidar: COPIA },
  { id: 'P22.4', paso: 22, cita: 'Paso 22', obligatorio: true, niveles: ESTANDAR_Y_AVANZADO, texto: 'La auditoría se planifica con el comité de seguridad vial.', verificacion: { tipo: 'registro', vigenciaMeses: 12 }, porValidar: COPIA },

  // Paso 23 ------------------------------------------------------------------------------
  { id: 'P23.1', paso: 23, cita: 'Paso 23', obligatorio: true, ruta: '/acciones', texto: 'Acciones preventivas o correctivas a partir de los resultados de indicadores, auditorías y visitas de verificación.', verificacion: { tipo: 'dato', regla: 'nc_auditoria_tratadas', criterio: 'Cada no conformidad de auditoría abierta tiene al menos una acción.' }, porValidar: 'Texto del paso 23 incompleto en las copias consultadas.' },
  // Paso 24: el texto no se pudo consultar; mientras se carga, el paso se cierra con evidencia aprobada.
];

export type EstadoRequisito = 'cumple' | 'no_cumple' | 'sin_verificar' | 'vencido';

export const ESTADOS_REQUISITO: Record<EstadoRequisito, { nombre: string; tono: 'exito' | 'peligro' | 'aviso' | 'neutro' }> = {
  cumple: { nombre: 'Cumple', tono: 'exito' },
  no_cumple: { nombre: 'No cumple', tono: 'peligro' },
  sin_verificar: { nombre: 'Sin verificar', tono: 'neutro' },
  vencido: { nombre: 'Verificación vencida', tono: 'aviso' },
};

/** Requisitos de un paso que aplican al nivel de la organización. */
export function requisitosDelPaso(paso: number, nivel: Nivel): RequisitoPaso[] {
  return REQUISITOS_40595.filter((r) => r.paso === paso && (!r.niveles || r.niveles.includes(nivel)));
}

export function requisitoPorId(id: string) {
  return REQUISITOS_40595.find((r) => r.id === id) ?? null;
}

/** Estado de una verificación manual según su vigencia (meses desde que se verificó). */
export function estadoVerificacionManual(
  verificacion: { estado: 'cumple' | 'no_cumple'; fecha: string } | null,
  vigenciaMeses: number | undefined,
  hoy: string,
): EstadoRequisito {
  if (!verificacion) return 'sin_verificar';
  if (verificacion.estado === 'no_cumple') return 'no_cumple';
  if (vigenciaMeses) {
    const limite = new Date(`${verificacion.fecha.slice(0, 10)}T00:00:00Z`);
    limite.setUTCMonth(limite.getUTCMonth() + vigenciaMeses);
    if (limite.toISOString().slice(0, 10) < hoy) return 'vencido';
  }
  return 'cumple';
}

/** Resumen de cumplimiento: solo los obligatorios cuentan para cerrar el paso. */
export function resumenRequisitos(lista: readonly { obligatorio: boolean; estado: EstadoRequisito }[]) {
  const obligatorios = lista.filter((r) => r.obligatorio);
  const cumplen = obligatorios.filter((r) => r.estado === 'cumple').length;
  return {
    total: obligatorios.length,
    cumplen,
    pendientes: obligatorios.length - cumplen,
    porcentaje: obligatorios.length ? Math.round((cumplen / obligatorios.length) * 100) : null,
    completo: obligatorios.length > 0 && cumplen === obligatorios.length,
  };
}
