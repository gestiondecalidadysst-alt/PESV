import { describe, expect, it } from 'vitest';
import { CLAUSULAS_ISO_39001, CORRESPONDENCIA_PESV_ISO } from './iso-39001';
import { MODALIDADES, PASOS_PESV, REGLAS_NIVEL } from './pesv-40595';

describe('catálogo PESV', () => {
  it('tiene los 24 pasos numerados del 1 al 24', () => {
    expect(PASOS_PESV.map((p) => p.numero)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('agrupa los pasos por fase PHVA: 1-8, 9-19, 20-22, 23-24', () => {
    const rango = (fase: string) => PASOS_PESV.filter((p) => p.fase === fase).map((p) => p.numero);
    expect(rango('planear')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rango('hacer')).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(rango('verificar')).toEqual([20, 21, 22]);
    expect(rango('actuar')).toEqual([23, 24]);
  });

  it('las reglas de nivel no se traslapan ni dejan huecos desde 11 vehículos', () => {
    for (const m of [1, 2] as const) {
      const reglas = REGLAS_NIVEL.filter((r) => r.misionalidad === m);
      expect(reglas.map((r) => r.nivel)).toEqual(['basico', 'estandar', 'avanzado']);
      for (let i = 1; i < reglas.length; i++) {
        expect(reglas[i]!.vehiculos.min).toBe(reglas[i - 1]!.vehiculos.max! + 1);
        expect(reglas[i]!.conductores.min).toBe(reglas[i - 1]!.conductores.max! + 1);
      }
      expect(reglas[0]!.vehiculos.min).toBe(11);
      expect(reglas.at(-1)!.vehiculos.max).toBeNull();
    }
  });

  it('cada modalidad tiene id único', () => {
    const ids = MODALIDADES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('catálogo ISO 39001 y correspondencia', () => {
  it('cubre las cláusulas 4 a 10', () => {
    const principales = CLAUSULAS_ISO_39001.filter((c) => c.padre === null).map((c) => c.codigo);
    expect(principales).toEqual(['4', '5', '6', '7', '8', '9', '10']);
  });

  it('cada paso PESV apunta a cláusulas existentes', () => {
    const codigos = new Set(CLAUSULAS_ISO_39001.map((c) => c.codigo));
    for (const paso of PASOS_PESV) {
      const destino = CORRESPONDENCIA_PESV_ISO[paso.numero];
      expect(destino, `paso ${paso.numero}`).toBeDefined();
      for (const c of destino!) expect(codigos.has(c), `cláusula ${c}`).toBe(true);
    }
  });
});
