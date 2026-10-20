import type { EstadoVencimiento } from './vencimientos';

/**
 * Puntaje de riesgo de conductores y vehículos (0 a 100; más alto = más riesgo).
 *
 * Es una regla fija y explicable, no un modelo de IA (RN-32): cada punto viene de un factor
 * que se muestra al usuario. Los pesos son una decisión de producto y viven aquí para poder
 * ajustarlos con pruebas.
 */

export type BandaPuntaje = 'bajo' | 'medio' | 'alto' | 'critico';

export interface FactorPuntaje {
  factor: string;
  puntos: number;
  detalle: string;
}

export interface PuntajeRiesgo {
  puntaje: number;
  banda: BandaPuntaje;
  factores: FactorPuntaje[];
}

export const BANDAS_PUNTAJE: Record<BandaPuntaje, { nombre: string; desde: number }> = {
  bajo: { nombre: 'Bajo', desde: 0 },
  medio: { nombre: 'Medio', desde: 25 },
  alto: { nombre: 'Alto', desde: 50 },
  critico: { nombre: 'Crítico', desde: 75 },
};

export function bandaPuntaje(puntaje: number): BandaPuntaje {
  if (puntaje >= BANDAS_PUNTAJE.critico.desde) return 'critico';
  if (puntaje >= BANDAS_PUNTAJE.alto.desde) return 'alto';
  if (puntaje >= BANDAS_PUNTAJE.medio.desde) return 'medio';
  return 'bajo';
}

function cerrar(factores: FactorPuntaje[]): PuntajeRiesgo {
  const visibles = factores.filter((f) => f.puntos > 0).sort((a, b) => b.puntos - a.puntos);
  const puntaje = Math.min(100, Math.round(visibles.reduce((t, f) => t + f.puntos, 0)));
  return { puntaje, banda: bandaPuntaje(puntaje), factores: visibles.map((f) => ({ ...f, puntos: Math.round(f.puntos) })) };
}

const PUNTOS_DOCUMENTO: Record<EstadoVencimiento, number> = { vencido: 1, por_vencer: 0.25, sin_dato: 0.5, vigente: 0 };
const TEXTO_DOCUMENTO: Record<EstadoVencimiento, string> = { vencido: 'vencido', por_vencer: 'por vencer', sin_dato: 'sin fecha registrada', vigente: 'vigente' };

/** Proporción de viajes con la novedad, llevada a puntos: el máximo se alcanza con el 20 % de los viajes. */
function porProporcion(eventos: number, viajes: number, maximo: number) {
  if (eventos <= 0) return 0;
  if (viajes <= 0) return maximo / 2;
  return maximo * Math.min(1, eventos / viajes / 0.2);
}

export interface FactoresConductor {
  /** Siniestros de los últimos 12 meses por nivel. */
  siniestros: { conFallecidos: number; conLesionadosGraves: number; conLesionadosLeves: number; soloDanos: number };
  /** Desplazamientos de los últimos 90 días. */
  viajes: number;
  excesosVelocidad: number;
  excesosJornada: number;
  licencia: EstadoVencimiento;
  examenMedico: EstadoVencimiento;
  /** Capacitaciones a las que asistió en los últimos 12 meses. */
  capacitaciones: number;
}

export function puntajeConductor(f: FactoresConductor): PuntajeRiesgo {
  const s = f.siniestros;
  const totalSiniestros = s.conFallecidos + s.conLesionadosGraves + s.conLesionadosLeves + s.soloDanos;
  return cerrar([
    {
      factor: 'Siniestros (12 meses)',
      puntos: Math.min(45, s.conFallecidos * 40 + s.conLesionadosGraves * 30 + s.conLesionadosLeves * 15 + s.soloDanos * 8),
      detalle: `${totalSiniestros} siniestro${totalSiniestros === 1 ? '' : 's'}${s.conFallecidos + s.conLesionadosGraves ? ', con víctimas graves o fatales' : ''}`,
    },
    {
      factor: 'Excesos de velocidad (90 días)',
      puntos: porProporcion(f.excesosVelocidad, f.viajes, 20),
      detalle: `${f.excesosVelocidad} de ${f.viajes} viajes`,
    },
    {
      factor: 'Excesos de jornada (90 días)',
      puntos: porProporcion(f.excesosJornada, f.viajes, 10),
      detalle: `${f.excesosJornada} de ${f.viajes} viajes`,
    },
    { factor: 'Licencia de conducción', puntos: 15 * PUNTOS_DOCUMENTO[f.licencia], detalle: TEXTO_DOCUMENTO[f.licencia] },
    { factor: 'Examen médico', puntos: 8 * PUNTOS_DOCUMENTO[f.examenMedico], detalle: TEXTO_DOCUMENTO[f.examenMedico] },
    { factor: 'Capacitación', puntos: f.capacitaciones === 0 ? 7 : 0, detalle: 'Sin capacitaciones en los últimos 12 meses' },
  ]);
}

export interface FactoresVehiculo {
  motorizado: boolean;
  /** Año del modelo, si se conoce. */
  modelo: number | null;
  /** Preoperacionales de los últimos 90 días con falla crítica y con falla menor. */
  fallasCriticas: number;
  fallasMenores: number;
  /** Días desde el último preoperacional (null si nunca se ha hecho). */
  diasSinPreoperacional: number | null;
  mantenimientosVencidos: number;
  soat: EstadoVencimiento;
  revisionTecnicoMecanica: EstadoVencimiento;
  /** Siniestros de los últimos 12 meses. */
  siniestros: number;
}

export function puntajeVehiculo(f: FactoresVehiculo, hoy: Date = new Date()): PuntajeRiesgo {
  const edad = f.modelo ? hoy.getFullYear() - f.modelo : null;
  const factores: FactorPuntaje[] = [
    {
      factor: 'Fallas en preoperacionales (90 días)',
      puntos: Math.min(25, f.fallasCriticas * 10) + Math.min(10, f.fallasMenores * 3),
      detalle: `${f.fallasCriticas} críticas y ${f.fallasMenores} menores`,
    },
    { factor: 'Mantenimientos vencidos', puntos: Math.min(20, f.mantenimientosVencidos * 12), detalle: `${f.mantenimientosVencidos} plan${f.mantenimientosVencidos === 1 ? '' : 'es'} vencido${f.mantenimientosVencidos === 1 ? '' : 's'}` },
    { factor: 'Siniestros (12 meses)', puntos: Math.min(25, f.siniestros * 10), detalle: `${f.siniestros} siniestro${f.siniestros === 1 ? '' : 's'}` },
    {
      factor: 'Antigüedad',
      puntos: edad === null ? 0 : edad > 15 ? 12 : edad > 10 ? 8 : edad > 5 ? 3 : 0,
      detalle: edad === null ? '' : `${edad} años`,
    },
  ];
  if (f.motorizado) {
    factores.push(
      { factor: 'SOAT', puntos: 15 * PUNTOS_DOCUMENTO[f.soat], detalle: TEXTO_DOCUMENTO[f.soat] },
      { factor: 'Revisión técnico-mecánica', puntos: 15 * PUNTOS_DOCUMENTO[f.revisionTecnicoMecanica], detalle: TEXTO_DOCUMENTO[f.revisionTecnicoMecanica] },
      {
        factor: 'Preoperacional al día',
        puntos: f.diasSinPreoperacional === null || f.diasSinPreoperacional > 7 ? 5 : 0,
        detalle: f.diasSinPreoperacional === null ? 'Nunca se ha hecho' : `Último hace ${f.diasSinPreoperacional} días`,
      },
    );
  }
  return cerrar(factores);
}
