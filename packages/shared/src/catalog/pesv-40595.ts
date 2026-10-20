import type { Modalidad, PasoPesv, ReglaNivel, VersionNormativa } from '../types';

/**
 * Catálogo de la metodología PESV vigente.
 *
 * Fuente: Resolución 40595 del 12 de julio de 2022 (Ministerio de Transporte), que derogó
 * la Resolución 1565 de 2014. Este archivo es la única fuente de verdad del catálogo: la base
 * de datos se siembra desde aquí. Si el Ministerio cambia la metodología, se agrega una nueva
 * versión en lugar de modificar esta.
 */
export const RES_40595_2022: VersionNormativa = {
  id: 'RES-40595-2022',
  nombre:
    'Resolución 40595 de 2022 · Metodología para el diseño, implementación y verificación del PESV',
  fechaExpedicion: '2022-07-12',
  autoridad: 'Ministerio de Transporte',
};

const TODOS = ['basico', 'estandar', 'avanzado'] as const;
const ESTANDAR_Y_AVANZADO = ['estandar', 'avanzado'] as const;
const SOLO_AVANZADO = ['avanzado'] as const;

export const PASOS_PESV: readonly PasoPesv[] = [
  {
    numero: 1,
    fase: 'planear',
    nombre: 'Líder del diseño e implementación del PESV',
    niveles: TODOS,
  },
  { numero: 2, fase: 'planear', nombre: 'Comité de seguridad vial', niveles: ESTANDAR_Y_AVANZADO },
  {
    numero: 3,
    fase: 'planear',
    nombre: 'Política de seguridad vial de la organización',
    niveles: TODOS,
  },
  {
    numero: 4,
    fase: 'planear',
    nombre: 'Liderazgo, compromiso y corresponsabilidad del nivel directivo',
    niveles: TODOS,
  },
  { numero: 5, fase: 'planear', nombre: 'Diagnóstico', niveles: TODOS },
  {
    numero: 6,
    fase: 'planear',
    nombre: 'Caracterización, evaluación y control de riesgos',
    niveles: TODOS,
  },
  { numero: 7, fase: 'planear', nombre: 'Objetivos y metas del PESV', niveles: TODOS },
  {
    numero: 8,
    fase: 'planear',
    nombre: 'Programas de gestión de riesgos críticos y factores de desempeño',
    niveles: TODOS,
  },
  { numero: 9, fase: 'hacer', nombre: 'Plan anual de trabajo', niveles: TODOS },
  { numero: 10, fase: 'hacer', nombre: 'Competencia y plan anual de formación', niveles: TODOS },
  {
    numero: 11,
    fase: 'hacer',
    nombre: 'Responsabilidad y comportamiento seguro',
    niveles: SOLO_AVANZADO,
  },
  {
    numero: 12,
    fase: 'hacer',
    nombre: 'Plan de preparación y respuesta ante emergencias viales',
    niveles: TODOS,
  },
  {
    numero: 13,
    fase: 'hacer',
    nombre: 'Investigación interna de siniestros viales',
    niveles: ESTANDAR_Y_AVANZADO,
  },
  {
    numero: 14,
    fase: 'hacer',
    nombre: 'Vías seguras administradas por la organización',
    niveles: TODOS,
  },
  {
    numero: 15,
    fase: 'hacer',
    nombre: 'Planificación de desplazamientos laborales',
    niveles: TODOS,
  },
  { numero: 16, fase: 'hacer', nombre: 'Inspección de vehículos y equipos', niveles: TODOS },
  {
    numero: 17,
    fase: 'hacer',
    nombre: 'Mantenimiento y control de vehículos seguros y equipos',
    niveles: TODOS,
  },
  {
    numero: 18,
    fase: 'hacer',
    nombre: 'Gestión del cambio y gestión de contratistas',
    niveles: ESTANDAR_Y_AVANZADO,
  },
  {
    numero: 19,
    fase: 'hacer',
    nombre: 'Archivo y retención documental',
    niveles: ESTANDAR_Y_AVANZADO,
  },
  {
    numero: 20,
    fase: 'verificar',
    nombre: 'Indicadores y reporte de autogestión PESV',
    niveles: TODOS,
  },
  {
    numero: 21,
    fase: 'verificar',
    nombre: 'Registro y análisis estadístico de siniestros viales',
    niveles: SOLO_AVANZADO,
  },
  { numero: 22, fase: 'verificar', nombre: 'Auditoría anual', niveles: TODOS },
  {
    numero: 23,
    fase: 'actuar',
    nombre: 'Mejora continua, acciones preventivas y correctivas',
    niveles: TODOS,
  },
  {
    numero: 24,
    fase: 'actuar',
    nombre: 'Mecanismos de comunicación y participación',
    niveles: TODOS,
  },
];

/**
 * Umbrales de nivel por misionalidad. El nivel final es el más exigente entre el que resulta
 * por vehículos y el que resulta por conductores.
 */
export const REGLAS_NIVEL: readonly ReglaNivel[] = [
  {
    misionalidad: 1,
    nivel: 'basico',
    vehiculos: { min: 11, max: 19 },
    conductores: { min: 2, max: 19 },
  },
  {
    misionalidad: 1,
    nivel: 'estandar',
    vehiculos: { min: 20, max: 50 },
    conductores: { min: 20, max: 50 },
  },
  {
    misionalidad: 1,
    nivel: 'avanzado',
    vehiculos: { min: 51, max: null },
    conductores: { min: 51, max: null },
  },
  {
    misionalidad: 2,
    nivel: 'basico',
    vehiculos: { min: 11, max: 49 },
    conductores: { min: 2, max: 49 },
  },
  {
    misionalidad: 2,
    nivel: 'estandar',
    vehiculos: { min: 50, max: 100 },
    conductores: { min: 50, max: 100 },
  },
  {
    misionalidad: 2,
    nivel: 'avanzado',
    vehiculos: { min: 101, max: null },
    conductores: { min: 101, max: null },
  },
];

/** Umbrales de obligatoriedad: más de 10 vehículos, o 2 o más conductores. */
export const OBLIGACION = {
  vehiculosMayorA: 10,
  conductoresDesde: 2,
} as const;

/**
 * Modalidades. Catálogo editable: las que no reportan a Supertransporte siguen el manual del
 * módulo PESV de SINST-VIGIA 2 (transporte urbano, masivo y colectivo). Validar con la
 * Superintendencia antes de producción.
 */
export const MODALIDADES: readonly Modalidad[] = [
  {
    id: 'no_transporte',
    nombre: 'Actividad diferente al transporte',
    misionalidad: 2,
    reportaSupertransporte: true,
  },
  { id: 'carga', nombre: 'Transporte de carga', misionalidad: 1, reportaSupertransporte: true },
  {
    id: 'pasajeros_carretera',
    nombre: 'Pasajeros por carretera',
    misionalidad: 1,
    reportaSupertransporte: true,
  },
  { id: 'especial', nombre: 'Transporte especial', misionalidad: 1, reportaSupertransporte: true },
  { id: 'mixto', nombre: 'Transporte mixto', misionalidad: 1, reportaSupertransporte: true },
  {
    id: 'individual',
    nombre: 'Transporte individual (taxi)',
    misionalidad: 1,
    reportaSupertransporte: true,
  },
  {
    id: 'urbano_colectivo',
    nombre: 'Transporte urbano o colectivo',
    misionalidad: 1,
    reportaSupertransporte: false,
  },
  { id: 'masivo', nombre: 'Transporte masivo', misionalidad: 1, reportaSupertransporte: false },
];

export const RADIOS_ACCION = ['municipal', 'departamental', 'nacional', 'internacional'] as const;
export type RadioAccion = (typeof RADIOS_ACCION)[number];
