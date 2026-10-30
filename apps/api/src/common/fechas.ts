/**
 * Fechas de calendario en la hora de Colombia (UTC−5). «Hoy» no puede salir de toISOString(): eso
 * da la fecha UTC, que después de las 7 p. m. ya es el día siguiente.
 */
export const ZONA_HORARIA = 'America/Bogota';

/** Fecha de hoy en Colombia (AAAA-MM-DD). */
export const hoyColombia = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

/** Fecha en Colombia de un instante (AAAA-MM-DD). */
export const fechaColombia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });

/** Resta meses a una fecha AAAA-MM-DD. */
export function restarMeses(fecha: string, meses: number) {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}
