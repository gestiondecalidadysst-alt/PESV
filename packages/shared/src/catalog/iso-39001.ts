import type { ClausulaIso } from '../types';

/**
 * Estructura de ISO 39001 (sistemas de gestión de la seguridad vial), solo con números y
 * títulos de cláusula. El texto de la norma está protegido por derechos de autor: los
 * requisitos completos se cargan desde la copia licenciada del cliente. Validar los títulos
 * contra la edición vigente que tenga la organización.
 */
export const ISO_39001_VERSION = {
  id: 'ISO-39001',
  nombre: 'ISO 39001 · Sistemas de gestión de la seguridad vial',
} as const;

export const CLAUSULAS_ISO_39001: readonly ClausulaIso[] = [
  { codigo: '4', titulo: 'Contexto de la organización', padre: null },
  { codigo: '4.1', titulo: 'Comprensión de la organización y de su contexto', padre: '4' },
  { codigo: '4.2', titulo: 'Necesidades y expectativas de las partes interesadas', padre: '4' },
  { codigo: '4.3', titulo: 'Alcance del sistema de gestión de la seguridad vial', padre: '4' },
  { codigo: '4.4', titulo: 'Sistema de gestión de la seguridad vial', padre: '4' },
  { codigo: '5', titulo: 'Liderazgo', padre: null },
  { codigo: '5.1', titulo: 'Liderazgo y compromiso', padre: '5' },
  { codigo: '5.2', titulo: 'Política', padre: '5' },
  { codigo: '5.3', titulo: 'Roles, responsabilidades y autoridades', padre: '5' },
  { codigo: '6', titulo: 'Planificación', padre: null },
  { codigo: '6.1', titulo: 'Generalidades', padre: '6' },
  { codigo: '6.2', titulo: 'Acciones para abordar riesgos y oportunidades', padre: '6' },
  { codigo: '6.3', titulo: 'Factores de desempeño de la seguridad vial', padre: '6' },
  {
    codigo: '6.4',
    titulo: 'Objetivos de seguridad vial y planificación para lograrlos',
    padre: '6',
  },
  { codigo: '7', titulo: 'Apoyo', padre: null },
  { codigo: '7.1', titulo: 'Coordinación', padre: '7' },
  { codigo: '7.2', titulo: 'Recursos', padre: '7' },
  { codigo: '7.3', titulo: 'Competencia', padre: '7' },
  { codigo: '7.4', titulo: 'Toma de conciencia', padre: '7' },
  { codigo: '7.5', titulo: 'Comunicación', padre: '7' },
  { codigo: '7.6', titulo: 'Información documentada', padre: '7' },
  { codigo: '8', titulo: 'Operación', padre: null },
  { codigo: '8.1', titulo: 'Planificación y control operacional', padre: '8' },
  { codigo: '8.2', titulo: 'Preparación y respuesta ante emergencias', padre: '8' },
  { codigo: '9', titulo: 'Evaluación del desempeño', padre: null },
  { codigo: '9.1', titulo: 'Seguimiento, medición, análisis y evaluación', padre: '9' },
  { codigo: '9.2', titulo: 'Investigación de accidentes e incidentes de tránsito', padre: '9' },
  { codigo: '9.3', titulo: 'Auditoría interna', padre: '9' },
  { codigo: '9.4', titulo: 'Revisión por la dirección', padre: '9' },
  { codigo: '10', titulo: 'Mejora', padre: null },
  { codigo: '10.1', titulo: 'No conformidad y acción correctiva', padre: '10' },
  { codigo: '10.2', titulo: 'Mejora continua', padre: '10' },
];

/**
 * Correspondencia propuesta entre pasos del PESV y cláusulas de ISO 39001, para que una misma
 * evidencia sirva a ambas. Es una propuesta de trabajo: debe validarla un auditor.
 */
export const CORRESPONDENCIA_PESV_ISO: Readonly<Record<number, readonly string[]>> = {
  1: ['5.3'],
  2: ['5.3', '7.1'],
  3: ['5.2'],
  4: ['5.1'],
  5: ['4.1', '4.2', '6.1'],
  6: ['6.2'],
  7: ['6.4'],
  8: ['6.3', '8.1'],
  9: ['6.4'],
  10: ['7.3', '7.4'],
  11: ['7.4'],
  12: ['8.2'],
  13: ['9.2'],
  14: ['8.1'],
  15: ['8.1'],
  16: ['8.1'],
  17: ['8.1'],
  18: ['6.1', '8.1'],
  19: ['7.6'],
  20: ['9.1'],
  21: ['9.2'],
  22: ['9.3'],
  23: ['10.1', '10.2'],
  24: ['7.5'],
};
