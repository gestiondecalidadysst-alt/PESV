import { describe, expect, it } from 'vitest';
import { cumplimientoPlan, estadoDerivado, mesDeCorte, mesesAtrasados } from './plan-trabajo';

describe('plan anual de trabajo', () => {
  it('deriva el estado del cronograma', () => {
    expect(estadoDerivado([3, 6], [], 'planeada')).toBe('planeada');
    expect(estadoDerivado([3, 6], [{ mes: 3, ejecutado: true }], 'planeada')).toBe('en_curso');
    expect(estadoDerivado([3, 6], [{ mes: 3, ejecutado: true }, { mes: 6, ejecutado: true }], 'en_curso')).toBe('ejecutada');
    expect(estadoDerivado([3], [{ mes: 3, ejecutado: false }], 'planeada')).toBe('planeada');
    expect(estadoDerivado([3], [{ mes: 3, ejecutado: true }], 'cancelada')).toBe('cancelada');
  });

  it('corta en el mes actual solo para el año en curso', () => {
    const hoy = new Date(2026, 9, 21);
    expect(mesDeCorte(2026, hoy)).toBe(10);
    expect(mesDeCorte(2025, hoy)).toBe(12);
    expect(mesDeCorte(2027, hoy)).toBe(0);
  });

  it('calcula cumplimiento a la fecha y ejecución anual sin contar canceladas', () => {
    const c = cumplimientoPlan(
      [
        { meses: [1, 4, 7, 10], seguimiento: [{ mes: 1, ejecutado: true }, { mes: 4, ejecutado: true }, { mes: 7, ejecutado: false }], estado: 'en_curso' },
        { meses: [2], seguimiento: [{ mes: 2, ejecutado: true }], estado: 'ejecutada' },
        { meses: [11, 12], seguimiento: [], estado: 'planeada' },
        { meses: [5], seguimiento: [], estado: 'cancelada' },
      ],
      8,
    );
    expect(c).toMatchObject({ programados: 7, ejecutados: 3, programadosALaFecha: 4, ejecutadosALaFecha: 3, cumplimiento: 75, ejecucion: 42.9 });
    expect(c.porMes[0]).toEqual({ programados: 1, ejecutados: 1 });
    expect(c.porMes[4]).toEqual({ programados: 0, ejecutados: 0 });
    expect(cumplimientoPlan([], 5).cumplimiento).toBeNull();
  });

  it('marca como atrasados los meses vencidos sin ejecutar', () => {
    expect(mesesAtrasados([1, 4, 7, 10], [{ mes: 1, ejecutado: true }], 10)).toEqual([4, 7]);
  });
});
