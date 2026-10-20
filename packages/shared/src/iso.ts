import { CLAUSULAS_ISO_39001, CORRESPONDENCIA_PESV_ISO } from './catalog/iso-39001';
import type { EstadoPaso } from './types';

export type EstadoClausula = 'cubierta' | 'en_progreso' | 'sin_cubrir' | 'fuera_de_alcance';

export interface CumplimientoClausula {
  codigo: string;
  titulo: string;
  pasos: number[];
  estado: EstadoClausula;
}

/**
 * Cumplimiento de ISO 39001 derivado de los pasos del PESV (RN-07): una cláusula está cubierta
 * cuando todos los pasos aplicables que la soportan están hechos. Regla fija, nunca la decide la IA.
 * Las cláusulas sin pasos relacionados quedan "sin cubrir" hasta que se gestionen aparte.
 */
export function cumplimientoIso(estados: Readonly<Record<number, EstadoPaso>>) {
  const pasosPorClausula = new Map<string, number[]>();
  for (const [paso, clausulas] of Object.entries(CORRESPONDENCIA_PESV_ISO)) {
    for (const c of clausulas) pasosPorClausula.set(c, [...(pasosPorClausula.get(c) ?? []), Number(paso)]);
  }
  const clausulas: CumplimientoClausula[] = CLAUSULAS_ISO_39001.filter((c) => c.padre !== null).map((c) => {
    const pasos = pasosPorClausula.get(c.codigo) ?? [];
    const aplicables = pasos.filter((p) => estados[p] && estados[p] !== 'no_aplica');
    let estado: EstadoClausula;
    if (pasos.length > 0 && aplicables.length === 0) estado = 'fuera_de_alcance';
    else if (aplicables.length === 0) estado = 'sin_cubrir';
    else if (aplicables.every((p) => estados[p] === 'hecho')) estado = 'cubierta';
    else if (aplicables.some((p) => estados[p] !== 'pendiente')) estado = 'en_progreso';
    else estado = 'sin_cubrir';
    return { codigo: c.codigo, titulo: c.titulo, pasos, estado };
  });
  const evaluables = clausulas.filter((c) => c.estado !== 'fuera_de_alcance');
  const cubiertas = evaluables.filter((c) => c.estado === 'cubierta').length;
  return {
    clausulas,
    cubiertas,
    evaluables: evaluables.length,
    porcentaje: evaluables.length ? Math.round((cubiertas / evaluables.length) * 100) : 0,
  };
}
