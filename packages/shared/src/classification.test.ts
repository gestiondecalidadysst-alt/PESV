import { describe, expect, it } from 'vitest';
import { adopcionVoluntaria, clasificar, nivelMasExigente, pasosParaNivel } from './classification';
import { entradaClasificacionSchema, crearOrganizacionSchema } from './schemas';

describe('obligatoriedad', () => {
  it('no obliga con 10 vehículos y 1 conductor', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 10, conductores: 1 });
    expect(r.obligada).toBe(false);
    expect(r.nivel).toBeNull();
    expect(r.pasosAplicables).toEqual([]);
    expect(r.reportaSupertransporte).toBe(false);
  });

  it('obliga con 11 vehículos aunque no tenga conductores propios', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 11, conductores: 0 });
    expect(r.obligada).toBe(true);
    expect(r.nivel).toBe('basico');
    expect(r.criterioDeterminante).toBe('vehiculos');
  });

  it('obliga con 2 conductores aunque no tenga vehículos', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 0, conductores: 2 });
    expect(r.obligada).toBe(true);
    expect(r.nivel).toBe('basico');
    expect(r.criterioDeterminante).toBe('conductores');
  });
});

describe('niveles · misionalidad 1 (transporte)', () => {
  it.each([
    [11, 0, 'basico'],
    [19, 19, 'basico'],
    [20, 0, 'estandar'],
    [50, 50, 'estandar'],
    [51, 0, 'avanzado'],
    [5, 51, 'avanzado'],
  ] as const)('%i vehículos y %i conductores → %s', (vehiculos, conductores, esperado) => {
    expect(clasificar({ misionalidad: 1, vehiculos, conductores }).nivel).toBe(esperado);
  });
});

describe('niveles · misionalidad 2 (otros sectores)', () => {
  it.each([
    [11, 0, 'basico'],
    [49, 49, 'basico'],
    [50, 0, 'estandar'],
    [100, 100, 'estandar'],
    [101, 0, 'avanzado'],
    [12, 101, 'avanzado'],
  ] as const)('%i vehículos y %i conductores → %s', (vehiculos, conductores, esperado) => {
    expect(clasificar({ misionalidad: 2, vehiculos, conductores }).nivel).toBe(esperado);
  });

  it('toma el criterio más exigente: 64 vehículos (estándar) y 30 conductores (básico)', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 64, conductores: 30 });
    expect(r.nivelPorVehiculos).toBe('estandar');
    expect(r.nivelPorConductores).toBe('basico');
    expect(r.nivel).toBe('estandar');
    expect(r.criterioDeterminante).toBe('vehiculos');
  });

  it('la misma flota es estándar en transporte y básico en otros sectores', () => {
    expect(clasificar({ misionalidad: 1, vehiculos: 30, conductores: 0 }).nivel).toBe('estandar');
    expect(clasificar({ misionalidad: 2, vehiculos: 30, conductores: 0 }).nivel).toBe('basico');
  });
});

describe('pasos aplicables', () => {
  it('básico = 18, estándar = 22, avanzado = 24', () => {
    expect(pasosParaNivel('basico')).toHaveLength(18);
    expect(pasosParaNivel('estandar')).toHaveLength(22);
    expect(pasosParaNivel('avanzado')).toHaveLength(24);
  });

  it('estándar excluye solo los pasos 11 y 21', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 64, conductores: 71 });
    expect(r.pasosNoAplicables).toEqual([11, 21]);
  });

  it('básico excluye los pasos 2, 11, 13, 18, 19 y 21', () => {
    const r = clasificar({ misionalidad: 2, vehiculos: 15, conductores: 3 });
    expect(r.pasosNoAplicables).toEqual([2, 11, 13, 18, 19, 21]);
  });
});

describe('reporte a Supertransporte', () => {
  it('el transporte masivo no reporta en VIGIA 2', () => {
    const r = clasificar({
      misionalidad: 1,
      vehiculos: 300,
      conductores: 400,
      modalidadId: 'masivo',
    });
    expect(r.nivel).toBe('avanzado');
    expect(r.reportaSupertransporte).toBe(false);
  });

  it('el transporte de carga sí reporta', () => {
    expect(
      clasificar({ misionalidad: 1, vehiculos: 30, conductores: 30, modalidadId: 'carga' })
        .reportaSupertransporte,
    ).toBe(true);
  });
});

describe('utilidades y validación', () => {
  it('nivelMasExigente ordena básico < estándar < avanzado', () => {
    expect(nivelMasExigente('basico', 'avanzado')).toBe('avanzado');
    expect(nivelMasExigente(null, 'basico')).toBe('basico');
    expect(nivelMasExigente(null, null)).toBeNull();
  });

  it('rechaza cantidades negativas o decimales', () => {
    expect(() => clasificar({ misionalidad: 1, vehiculos: -1, conductores: 0 })).toThrow(
      RangeError,
    );
    expect(
      entradaClasificacionSchema.safeParse({ misionalidad: 1, vehiculos: 1.5, conductores: 0 })
        .success,
    ).toBe(false);
  });

  it('rechaza una modalidad que no corresponde a la misionalidad', () => {
    const r = entradaClasificacionSchema.safeParse({
      misionalidad: 2,
      vehiculos: 20,
      conductores: 5,
      modalidadId: 'carga',
    });
    expect(r.success).toBe(false);
  });

  it('valida el NIT sin dígito de verificación', () => {
    const base = {
      nombre: 'Empresa Demo',
      clasificacion: { misionalidad: 2, vehiculos: 20, conductores: 5 },
    };
    expect(crearOrganizacionSchema.safeParse({ ...base, nit: '900123456' }).success).toBe(true);
    expect(crearOrganizacionSchema.safeParse({ ...base, nit: '900.123.456-7' }).success).toBe(
      false,
    );
  });
});

describe('adopción voluntaria (RN-01)', () => {
  it('una organización no obligada adopta el nivel básico y no reporta a Supertransporte', () => {
    const r = adopcionVoluntaria(clasificar({ misionalidad: 2, vehiculos: 3, conductores: 1 }));
    expect(r.obligada).toBe(false);
    expect(r.voluntaria).toBe(true);
    expect(r.nivel).toBe('basico');
    expect(r.pasosAplicables).toHaveLength(18);
    expect(r.reportaSupertransporte).toBe(false);
  });

  it('no cambia la clasificación de una organización obligada', () => {
    const base = clasificar({ misionalidad: 2, vehiculos: 64, conductores: 30 });
    expect(adopcionVoluntaria(base)).toBe(base);
  });
});
