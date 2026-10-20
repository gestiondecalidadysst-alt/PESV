import { describe, expect, it } from 'vitest';
import { PASOS_PESV } from './catalog/pesv-40595';
import { cumplimientoIso } from './iso';
import type { EstadoPaso } from './types';

const todos = (estado: EstadoPaso): Record<number, EstadoPaso> => Object.fromEntries(PASOS_PESV.map((p) => [p.numero, estado]));

describe('cumplimiento ISO 39001 derivado del PESV', () => {
  it('sin avance no hay cláusulas cubiertas', () => {
    const r = cumplimientoIso(todos('pendiente'));
    expect(r.cubiertas).toBe(0);
    expect(r.porcentaje).toBe(0);
  });

  it('una cláusula se cubre solo cuando todos sus pasos aplicables están hechos', () => {
    // 5.3 se apoya en los pasos 1 y 2.
    const estados: Record<number, EstadoPaso> = { ...todos('pendiente'), 1: 'hecho' };
    expect(cumplimientoIso(estados).clausulas.find((c) => c.codigo === '5.3')!.estado).toBe('en_progreso');
    estados[2] = 'hecho';
    expect(cumplimientoIso(estados).clausulas.find((c) => c.codigo === '5.3')!.estado).toBe('cubierta');
  });

  it('los pasos que no aplican no bloquean la cláusula y una cláusula sin pasos aplicables sale del cálculo', () => {
    const estados: Record<number, EstadoPaso> = { ...todos('hecho'), 2: 'no_aplica', 22: 'no_aplica' };
    const r = cumplimientoIso(estados);
    expect(r.clausulas.find((c) => c.codigo === '5.3')!.estado).toBe('cubierta');
    expect(r.clausulas.find((c) => c.codigo === '9.3')!.estado).toBe('fuera_de_alcance');
    expect(r.evaluables).toBeLessThan(r.clausulas.length);
  });

  it('las cláusulas sin correspondencia con el PESV quedan sin cubrir', () => {
    const r = cumplimientoIso(todos('hecho'));
    const sinPasos = r.clausulas.filter((c) => c.pasos.length === 0);
    expect(sinPasos.length).toBeGreaterThan(0);
    expect(sinPasos.every((c) => c.estado === 'sin_cubrir')).toBe(true);
    expect(r.porcentaje).toBeLessThan(100);
  });
});
