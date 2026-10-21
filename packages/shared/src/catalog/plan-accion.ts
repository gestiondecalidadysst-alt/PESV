import { prerrequisitosPendientes } from './conexiones-pasos';

/**
 * Plan de acción unificado (paso 23): todas las acciones correctivas, preventivas, de mejora y
 * compromisos, vengan de donde vengan, con su paso del PESV.
 */
export const ORIGENES_ACCION = [
  { id: 'comite', nombre: 'Comité de seguridad vial', ruta: '/comite', paso: 2 },
  { id: 'siniestro', nombre: 'Siniestro', ruta: '/siniestros', paso: 13 },
  { id: 'auditoria', nombre: 'Auditoría', ruta: '/auditorias', paso: 22 },
  { id: 'hallazgo', nombre: 'Hallazgo de auditoría', ruta: '/auditorias', paso: 22 },
  { id: 'indicador', nombre: 'Indicador', ruta: '/indicadores', paso: 20 },
  { id: 'riesgo', nombre: 'Matriz de riesgos', ruta: '/matriz-riesgos', paso: 6 },
  { id: 'capacitacion', nombre: 'Formación', ruta: '/capacitacion', paso: 10 },
  { id: 'paso', nombre: 'Hallazgo de un paso', ruta: '/pasos', paso: null },
  { id: 'manual', nombre: 'Plan de mejora', ruta: '/acciones', paso: 23 },
] as const;
export type OrigenAccion = (typeof ORIGENES_ACCION)[number]['id'];
export const IDS_ORIGEN_ACCION = ORIGENES_ACCION.map((o) => o.id) as [OrigenAccion, ...OrigenAccion[]];

export const TIPOS_ACCION = [
  { id: 'correctiva', nombre: 'Correctiva', descripcion: 'Elimina la causa de un problema que ya ocurrió.' },
  { id: 'preventiva', nombre: 'Preventiva', descripcion: 'Evita que ocurra un problema potencial.' },
  { id: 'mejora', nombre: 'De mejora', descripcion: 'Mejora el desempeño aunque no haya un problema.' },
  { id: 'compromiso', nombre: 'Compromiso', descripcion: 'Tarea acordada (por ejemplo, en el comité).' },
] as const;

export const TIPOS_HALLAZGO_PASO = [
  { id: 'no_conformidad', nombre: 'No conformidad', descripcion: 'Un requisito del paso no se cumple. Impide cerrar el paso hasta que se trate.' },
  { id: 'observacion', nombre: 'Observación', descripcion: 'Un riesgo de incumplir si no se atiende.' },
  { id: 'oportunidad_mejora', nombre: 'Oportunidad de mejora', descripcion: 'Algo que se cumple pero puede hacerse mejor.' },
] as const;
export type TipoHallazgoPaso = (typeof TIPOS_HALLAZGO_PASO)[number]['id'];
export const IDS_TIPO_HALLAZGO_PASO = TIPOS_HALLAZGO_PASO.map((t) => t.id) as [TipoHallazgoPaso, ...TipoHallazgoPaso[]];

export const FUENTES_HALLAZGO = [
  { id: 'autoevaluacion', nombre: 'Autoevaluación del paso' },
  { id: 'comite', nombre: 'Comité de seguridad vial' },
  { id: 'revision_direccion', nombre: 'Revisión por la dirección' },
  { id: 'auditoria', nombre: 'Auditoría' },
  { id: 'autoridad', nombre: 'Visita de la autoridad' },
] as const;
export type FuenteHallazgo = (typeof FUENTES_HALLAZGO)[number]['id'];
export const IDS_FUENTE_HALLAZGO = FUENTES_HALLAZGO.map((f) => f.id) as [FuenteHallazgo, ...FuenteHallazgo[]];

/**
 * Pasos en los que conviene trabajar ahora: aplican, no están hechos y ya tienen sus
 * prerrequisitos cerrados. Primero los que más pasos habilitan.
 */
export function siguientesPasos(estados: Readonly<Record<number, string>>, habilita: (n: number) => number[]) {
  return Object.entries(estados)
    .map(([n, e]) => ({ numero: Number(n), estado: e }))
    .filter((p) => p.estado !== 'no_aplica' && p.estado !== 'hecho' && prerrequisitosPendientes(p.numero, estados).length === 0)
    .sort((a, b) => habilita(b.numero).length - habilita(a.numero).length || a.numero - b.numero)
    .map((p) => p.numero);
}
