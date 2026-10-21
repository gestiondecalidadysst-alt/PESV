import { describe, expect, it } from 'vitest';
import { evaluarIndicador, periodoDesdeIdIndicador, periodosDelAnio, PLANTILLAS_INDICADOR, CALCULOS_INDICADOR, valorIndicador } from './indicadores';

describe('indicadores del PESV', () => {
  it('cada cálculo automático tiene su plantilla y la meta queda del lado correcto de la alerta', () => {
    expect(new Set(PLANTILLAS_INDICADOR.map((p) => p.calculo))).toEqual(new Set(CALCULOS_INDICADOR));
    for (const p of PLANTILLAS_INDICADOR) {
      if (p.alerta != null) expect(p.sentido === 'mayor_o_igual' ? p.alerta < p.meta : p.alerta > p.meta).toBe(true);
    }
  });

  it('arma los periodos del año según la frecuencia', () => {
    expect(periodosDelAnio(2026, 'mensual')[1]).toEqual({ id: '2026-02', etiqueta: 'Feb', desde: '2026-02-01', hasta: '2026-02-28' });
    expect(periodosDelAnio(2026, 'trimestral').map((p) => [p.id, p.desde, p.hasta])).toEqual([
      ['2026-T1', '2026-01-01', '2026-03-31'],
      ['2026-T2', '2026-04-01', '2026-06-30'],
      ['2026-T3', '2026-07-01', '2026-09-30'],
      ['2026-T4', '2026-10-01', '2026-12-31'],
    ]);
    expect(periodosDelAnio(2028, 'semestral')[0]!.hasta).toBe('2028-06-30');
    expect(periodosDelAnio(2026, 'anual')).toEqual([{ id: '2026', etiqueta: '2026', desde: '2026-01-01', hasta: '2026-12-31' }]);
    expect(periodoDesdeIdIndicador('2026-T3')).toMatchObject({ frecuencia: 'trimestral', desde: '2026-07-01' });
    expect(periodoDesdeIdIndicador('2026-13')).toBeNull();
    expect(periodoDesdeIdIndicador('2026-T5')).toBeNull();
  });

  it('evalúa frente a la meta y el umbral de alerta', () => {
    expect(evaluarIndicador(92, 90, 'mayor_o_igual', 80)).toBe('cumple');
    expect(evaluarIndicador(85, 90, 'mayor_o_igual', 80)).toBe('en_riesgo');
    expect(evaluarIndicador(70, 90, 'mayor_o_igual', 80)).toBe('no_cumple');
    expect(evaluarIndicador(0, 0, 'menor_o_igual', 1)).toBe('cumple');
    expect(evaluarIndicador(1, 0, 'menor_o_igual', 1)).toBe('en_riesgo');
    expect(evaluarIndicador(3, 0, 'menor_o_igual', null)).toBe('no_cumple');
    expect(evaluarIndicador(null, 0, 'menor_o_igual', null)).toBeNull();
  });

  it('calcula el valor según la unidad', () => {
    expect(valorIndicador('porcentaje', 2, 3)).toBe(66.67);
    expect(valorIndicador('porcentaje', 0, 0)).toBeNull();
    expect(valorIndicador('numero', 4, null)).toBe(4);
    expect(valorIndicador('tasa', 2, 500_000)).toBe(4);
  });
});
