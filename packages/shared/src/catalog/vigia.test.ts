import { describe, expect, it } from 'vitest';
import { nivelRiesgo, nivelSiniestro, periodoAnterior, periodoDesdeId } from './vigia';

describe('periodos de VIGIA 2', () => {
  it('interpreta periodos mensuales y trimestrales con su plazo de referencia', () => {
    expect(periodoDesdeId('2026-09')).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30', plazo: '2026-10-31' });
    expect(periodoDesdeId('2026-T4')).toMatchObject({ desde: '2026-10-01', hasta: '2026-12-31', plazo: '2027-01-31' });
    expect(periodoDesdeId('2026-13')).toBeNull();
  });
  it('calcula el último periodo cerrado', () => {
    expect(periodoAnterior('vehiculos', new Date(2026, 0, 15)).id).toBe('2025-12');
    expect(periodoAnterior('siniestros', new Date(2026, 9, 20)).id).toBe('2026-T3');
    expect(periodoAnterior('siniestros', new Date(2026, 1, 1)).id).toBe('2025-T4');
  });
});

describe('clasificaciones', () => {
  it('nivel del siniestro según la víctima más grave', () => {
    expect(nivelSiniestro({ fallecidos: 0, heridosGraves: 1, heridosLeves: 3 })).toBe('con_lesionados_graves');
    expect(nivelSiniestro({ fallecidos: 0, heridosGraves: 0, heridosLeves: 0 })).toBe('solo_danos');
  });
  it('nivel de riesgo en matriz 5 × 5', () => {
    expect(nivelRiesgo(1, 4).banda).toBe('bajo');
    expect(nivelRiesgo(3, 3).banda).toBe('moderado');
    expect(nivelRiesgo(2, 5).banda).toBe('alto');
    expect(nivelRiesgo(4, 4)).toEqual({ valor: 16, banda: 'extremo' });
  });
});
