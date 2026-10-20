/**
 * Documentos que la plataforma genera (PDF y Excel) con el encabezado y pie del sistema de
 * gestión de cada organización. El código final es «prefijo-código», por ejemplo PESV-MT-01;
 * cada organización puede cambiarlo, junto con la versión y los responsables.
 */
export const TIPOS_DOCUMENTO = [
  { id: 'matriz_riesgos', nombre: 'Matriz de identificación de peligros, evaluación y control de riesgos viales', paso: 6, codigo: 'MT-01' },
  { id: 'plan_trabajo', nombre: 'Plan anual de trabajo del PESV', paso: 9, codigo: 'PL-01' },
  { id: 'plan_capacitacion', nombre: 'Plan anual de formación en seguridad vial', paso: 10, codigo: 'PL-02' },
  { id: 'lista_asistencia', nombre: 'Registro de asistencia a formación', paso: 10, codigo: 'FR-01' },
  { id: 'indicadores', nombre: 'Fichas técnicas y medición de indicadores del PESV', paso: 20, codigo: 'FT-01' },
  { id: 'metas', nombre: 'Objetivos y metas del PESV', paso: 7, codigo: 'PL-03' },
  { id: 'perfil_conductores', nombre: 'Caracterización sociodemográfica de los colaboradores', paso: 5, codigo: 'IN-01' },
  { id: 'acta_comite', nombre: 'Acta de reunión del comité de seguridad vial', paso: 2, codigo: 'FR-02' },
  { id: 'plan_accion', nombre: 'Plan de acción y mejora continua', paso: 23, codigo: 'PL-04' },
  { id: 'lista_maestra', nombre: 'Listado maestro de documentos', paso: 19, codigo: 'LM-01' },
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]['id'];
export const IDS_TIPO_DOCUMENTO = TIPOS_DOCUMENTO.map((t) => t.id) as [TipoDocumento, ...TipoDocumento[]];

/** Tipos de documento controlado que se redactan en la plataforma (política, procedimientos…). */
export const CLASES_DOCUMENTO = [
  { id: 'politica', nombre: 'Política', sigla: 'PO' },
  { id: 'procedimiento', nombre: 'Procedimiento', sigla: 'PR' },
  { id: 'programa', nombre: 'Programa', sigla: 'PG' },
  { id: 'plan', nombre: 'Plan', sigla: 'PL' },
  { id: 'manual', nombre: 'Manual', sigla: 'MA' },
  { id: 'instructivo', nombre: 'Instructivo', sigla: 'IN' },
  { id: 'formato', nombre: 'Formato', sigla: 'FR' },
  { id: 'acta', nombre: 'Acta o designación', sigla: 'AC' },
  { id: 'otro', nombre: 'Otro', sigla: 'DO' },
] as const;
export type ClaseDocumento = (typeof CLASES_DOCUMENTO)[number]['id'];
export const IDS_CLASE_DOCUMENTO = CLASES_DOCUMENTO.map((c) => c.id) as [ClaseDocumento, ...ClaseDocumento[]];

export const ESTADOS_DOCUMENTO = ['borrador', 'en_revision', 'aprobado', 'obsoleto'] as const;
export type EstadoDocumento = (typeof ESTADOS_DOCUMENTO)[number];
