import { describe, expect, it } from 'vitest';
import { riesgoViaSchema } from '../schemas-v2';
import { evaluarRiesgo, interpretarProbabilidad } from './matriz-riesgos';

describe('evaluación de riesgos viales', () => {
  it('GTC 45: NR = ND × NE × NC con los cortes de los niveles I a IV', () => {
    const casos: [number, number, number, string][] = [
      [10, 4, 100, 'I'], // 4000
      [6, 4, 25, 'I'], // 600 (borde inferior de I)
      [10, 2, 25, 'II'], // 500
      [6, 1, 25, 'II'], // 150 (borde inferior de II)
      [6, 2, 10, 'III'], // 120
      [2, 2, 10, 'III'], // 40 (borde inferior de III)
      [2, 1, 10, 'IV'], // 20
      [0, 4, 100, 'IV'], // deficiencia baja: no se valora
    ];
    for (const [nd, ne, nc, nivel] of casos) expect(evaluarRiesgo('gtc45', { deficiencia: nd, exposicion: ne, consecuencia: nc })?.nivel, `${nd}×${ne}×${nc}`).toBe(nivel);
    const r = evaluarRiesgo('gtc45', { deficiencia: 6, exposicion: 3, consecuencia: 60 })!;
    expect(r).toMatchObject({ valor: 1080, nivel: 'I', aceptabilidad: 'No aceptable', critico: true, prioridad: 1 });
    expect(r.detalle).toBe('NP 18 (Alto) × NC 60 = NR 1080');
    expect(interpretarProbabilidad(24)).toBe('Muy alto');
  });

  it('5×5: probabilidad × severidad con bandas', () => {
    expect(evaluarRiesgo('matriz5x5', { probabilidad: 4, severidad: 4 })).toMatchObject({ valor: 16, nivel: 'Extremo', critico: true });
    expect(evaluarRiesgo('matriz5x5', { probabilidad: 3, severidad: 4 })).toMatchObject({ nivel: 'Alto', critico: true, prioridad: 2 });
    expect(evaluarRiesgo('matriz5x5', { probabilidad: 2, severidad: 3 })).toMatchObject({ nivel: 'Moderado', critico: false });
    expect(evaluarRiesgo('matriz5x5', { probabilidad: 1, severidad: 4 })).toMatchObject({ nivel: 'Bajo', aceptabilidad: 'Aceptable' });
  });

  it('devuelve null si faltan datos de la metodología', () => {
    expect(evaluarRiesgo('gtc45', { deficiencia: 6, exposicion: 3 })).toBeNull();
    expect(evaluarRiesgo('matriz5x5', { deficiencia: 6, exposicion: 3, consecuencia: 25 })).toBeNull();
  });

  it('valida que la evaluación esté completa y que los valores existan en la escala', () => {
    const base = { metodologia: 'gtc45', proceso: 'Distribución', actorVial: 'conductor', factor: 'humano', peligro: 'Exceso de velocidad' };
    expect(riesgoViaSchema.safeParse({ ...base, inherente: { deficiencia: 6, exposicion: 3, consecuencia: 60 } }).success).toBe(true);
    expect(riesgoViaSchema.safeParse({ ...base, inherente: { deficiencia: 6, exposicion: 3 } }).success).toBe(false);
    expect(riesgoViaSchema.safeParse({ ...base, inherente: { deficiencia: 7, exposicion: 3, consecuencia: 60 } }).success).toBe(false);
    expect(riesgoViaSchema.safeParse({ ...base, inherente: { deficiencia: 6, exposicion: 3, consecuencia: 60 }, residual: { deficiencia: 2 } }).success).toBe(false);
    expect(riesgoViaSchema.safeParse({ ...base, metodologia: 'matriz5x5', inherente: { probabilidad: 3, severidad: 4 }, residual: { probabilidad: 2, severidad: 4 } }).success).toBe(true);
  });
});
