import { DIAS_ALERTA_VENCIMIENTO } from './catalog/flota';

export type EstadoVencimiento = 'vencido' | 'por_vencer' | 'vigente' | 'sin_dato';

/** Días entre hoy y la fecha (negativo si ya pasó). Usa fechas de calendario, sin hora. */
export function diasHasta(fecha: string, hoy: Date = new Date()): number {
  const [a, m, d] = fecha.split('-').map(Number) as [number, number, number];
  const objetivo = Date.UTC(a, m - 1, d);
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((objetivo - base) / 86_400_000);
}

/** Estado de un documento con vencimiento: alerta desde 30 días antes (RN-15). */
export function estadoVencimiento(fecha: string | null | undefined, hoy: Date = new Date()): EstadoVencimiento {
  if (!fecha) return 'sin_dato';
  const dias = diasHasta(fecha, hoy);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_ALERTA_VENCIMIENTO[0]) return 'por_vencer';
  return 'vigente';
}
