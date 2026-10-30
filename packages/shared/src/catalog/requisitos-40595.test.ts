import { describe, expect, it } from 'vitest';
import { PERMISOS_POR_ROL } from '../roles';
import { PASOS_PESV } from './pesv-40595';
import { CAMPOS_PROGRAMA, completitudPrograma, finDeTrimestre, PROGRAMAS_OBLIGATORIOS, trimestreAnterior, trimestreDe } from './programas';
import { estadoVerificacionManual, REQUISITOS_40595, requisitosDelPaso, resumenRequisitos } from './requisitos-40595';
import { TABLA_10_INDICADORES } from './indicadores';

describe('requisitos de la Res. 40595', () => {
  it('cada requisito tiene un id único, pertenece a un paso y cita la norma', () => {
    const ids = REQUISITOS_40595.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REQUISITOS_40595) {
      expect(PASOS_PESV.some((p) => p.numero === r.paso)).toBe(true);
      expect(r.id.startsWith(`P${r.paso}.`)).toBe(true);
      expect(r.cita).toMatch(/Paso \d+/);
      if (r.verificacion.tipo === 'documento') expect(r.verificacion.clases.length).toBeGreaterThan(0);
    }
  });

  it('cubre los pasos 1 a 23 y deja el 24 pendiente del texto oficial', () => {
    const conRequisitos = new Set(REQUISITOS_40595.map((r) => r.paso));
    for (let p = 1; p <= 23; p++) expect(conRequisitos.has(p)).toBe(true);
    expect(conRequisitos.has(24)).toBe(false);
  });

  it('filtra los requisitos por nivel', () => {
    expect(requisitosDelPaso(20, 'basico').map((r) => r.id)).not.toContain('P20.3');
    expect(requisitosDelPaso(20, 'estandar').map((r) => r.id)).toContain('P20.3');
  });

  it('una verificación manual vence según su vigencia y solo los obligatorios cierran el paso', () => {
    expect(estadoVerificacionManual(null, 12, '2026-10-29')).toBe('sin_verificar');
    expect(estadoVerificacionManual({ estado: 'cumple', fecha: '2025-11-01' }, 12, '2026-10-29')).toBe('cumple');
    expect(estadoVerificacionManual({ estado: 'cumple', fecha: '2025-10-01' }, 12, '2026-10-29')).toBe('vencido');
    expect(estadoVerificacionManual({ estado: 'cumple', fecha: '2020-01-01' }, undefined, '2026-10-29')).toBe('cumple');
    expect(estadoVerificacionManual({ estado: 'no_cumple', fecha: '2026-10-01' }, 12, '2026-10-29')).toBe('no_cumple');
    expect(resumenRequisitos([{ obligatorio: true, estado: 'cumple' }, { obligatorio: false, estado: 'no_cumple' }])).toMatchObject({ total: 1, cumplen: 1, completo: true });
    expect(resumenRequisitos([])).toMatchObject({ total: 0, completo: false });
  });

  it('la tabla 10 tiene los 13 indicadores mínimos', () => {
    expect(TABLA_10_INDICADORES).toHaveLength(13);
    expect(TABLA_10_INDICADORES.filter((t) => t.niveles.includes('basico'))).toHaveLength(10);
  });
});

describe('programas del paso 8', () => {
  const base = {
    tipo: 'fatiga' as const,
    nombre: 'Programa de prevención de la fatiga',
    lineamientos: 'Máximo 10 horas de conducción al día.',
    alcance: 'Conductores de carga',
    inicio: '2026-01-01',
    duracionMeses: 12,
    lineaBase: '12 % de excesos de jornada',
    objetivos: 'Menos de 3 %',
    indicadores: 1,
    factores: 'Cumplimiento de jornadas',
    actividades: 2,
    actividadesConCronograma: 2,
    responsable: 'Jefe de flota',
    presupuesto: 0,
    seguimiento: 'Revisión mensual',
    elementos: ['jornadas', 'planificacion', 'excesos'],
  };

  it('son cinco obligatorios con 14 campos de contenido mínimo', () => {
    expect(PROGRAMAS_OBLIGATORIOS).toEqual(['velocidad', 'fatiga', 'distraccion', 'alcohol_spa', 'vulnerables']);
    expect(CAMPOS_PROGRAMA).toHaveLength(14);
  });

  it('un programa está completo solo con todos sus campos y elementos', () => {
    expect(completitudPrograma(base)).toMatchObject({ completo: true, avance: 100 });
    const sin = completitudPrograma({ ...base, lineaBase: ' ', actividades: 0, actividadesConCronograma: 0, elementos: ['jornadas'] });
    expect(sin.completo).toBe(false);
    expect(sin.camposFaltantes).toEqual(['lineaBase', 'actividades', 'cronograma']);
    expect(sin.elementosFaltantes).toEqual(['planificacion', 'excesos']);
  });

  it('calcula los trimestres de la revisión', () => {
    expect(trimestreDe('2026-10-29')).toBe('2026-T4');
    expect(trimestreAnterior('2026-10-29')).toBe('2026-T3');
    expect(trimestreAnterior('2027-02-01')).toBe('2026-T4');
    expect(finDeTrimestre('2026-T1')).toBe('2026-03-31');
    expect(finDeTrimestre('2026-T4')).toBe('2026-12-31');
  });

  it('solo el administrador y el líder ven los datos sensibles de las pruebas', () => {
    const conPermiso = Object.entries(PERMISOS_POR_ROL).filter(([, p]) => p.includes('datos_sensibles')).map(([r]) => r);
    expect(conPermiso.sort()).toEqual(['admin', 'lider_pesv']);
  });
});
