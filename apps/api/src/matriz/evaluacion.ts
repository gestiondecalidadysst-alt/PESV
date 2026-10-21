import { evaluarRiesgo, type MetodologiaRiesgo } from '@pesv/shared';
import type { roadRisks } from '../db/schema.js';

type FilaRiesgo = typeof roadRisks.$inferSelect;

/** Evaluación inherente de un riesgo guardado, con la metodología con que se evaluó. */
export const evaluacionInherente = (r: FilaRiesgo) =>
  evaluarRiesgo(r.methodology as MetodologiaRiesgo, {
    deficiencia: r.deficiency,
    exposicion: r.exposure,
    consecuencia: r.consequence,
    probabilidad: r.probability,
    severidad: r.severity,
  });

/** Evaluación residual (después de los controles propuestos), si se registró. */
export const evaluacionResidual = (r: FilaRiesgo) =>
  evaluarRiesgo(r.methodology as MetodologiaRiesgo, {
    deficiencia: r.residualDeficiency,
    exposicion: r.residualExposure,
    consecuencia: r.residualConsequence,
    probabilidad: r.residualProbability,
    severidad: r.residualSeverity,
  });
