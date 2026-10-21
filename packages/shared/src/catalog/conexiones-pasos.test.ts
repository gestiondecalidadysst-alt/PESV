import { describe, expect, it } from 'vitest';
import { HERRAMIENTAS_PASO, PRERREQUISITOS_PASO, pasosQueDependenDe, prerrequisitosPendientes } from './conexiones-pasos';
import { PASOS_PESV } from './pesv-40595';

describe('conexiones entre pasos', () => {
  it('cubre los 24 pasos con herramienta y prerrequisitos que existen', () => {
    for (const p of PASOS_PESV) {
      expect(PRERREQUISITOS_PASO[p.numero], `paso ${p.numero}`).toBeDefined();
      expect(HERRAMIENTAS_PASO[p.numero]?.length, `paso ${p.numero}`).toBeGreaterThan(0);
      for (const prev of PRERREQUISITOS_PASO[p.numero]!) expect(prev).toBeLessThan(25);
    }
  });

  it('no tiene ciclos: siempre hay un orden posible para cerrar los pasos', () => {
    const hechos = new Set<number>();
    for (let vuelta = 0; vuelta < 24 && hechos.size < 24; vuelta++) {
      for (const p of PASOS_PESV) if ((PRERREQUISITOS_PASO[p.numero] ?? []).every((x) => hechos.has(x))) hechos.add(p.numero);
    }
    expect(hechos.size).toBe(24);
  });

  it('los pasos que no aplican al nivel no bloquean', () => {
    // El paso 13 depende del 12; el 2 (comité) no aplica en nivel básico y no bloquea a nadie.
    expect(prerrequisitosPendientes(13, { 12: 'pendiente', 13: 'en_curso' })).toEqual([12]);
    expect(prerrequisitosPendientes(2, { 1: 'hecho', 2: 'en_curso' })).toEqual([]);
    expect(prerrequisitosPendientes(22, { 9: 'hecho', 20: 'no_aplica' })).toEqual([]);
    expect(pasosQueDependenDe(6)).toEqual(expect.arrayContaining([7, 8, 10, 12]));
  });
});

describe('siguientes pasos', () => {
  it('propone los pasos con prerrequisitos cerrados, primero los que más habilitan', async () => {
    const { siguientesPasos } = await import('./plan-accion');
    const { pasosQueDependenDe } = await import('./conexiones-pasos');
    const estados: Record<number, string> = { 1: 'hecho', 2: 'pendiente', 3: 'en_curso', 4: 'pendiente', 5: 'pendiente', 6: 'pendiente', 19: 'no_aplica' };
    const s = siguientesPasos(estados, pasosQueDependenDe);
    expect(s).toEqual([3, 5, 2]);
    expect(s).not.toContain(4);
    expect(s).not.toContain(6);
  });
});
