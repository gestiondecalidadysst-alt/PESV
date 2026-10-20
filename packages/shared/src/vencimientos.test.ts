import { describe, expect, it } from 'vitest';
import { diasHasta, estadoVencimiento } from './vencimientos';
import { plantillaParaTipo } from './catalog/flota';
import { tienePermiso } from './roles';

const hoy = new Date(2026, 9, 20);

describe('vencimientos', () => {
  it('cuenta días de calendario', () => {
    expect(diasHasta('2026-10-21', hoy)).toBe(1);
    expect(diasHasta('2026-10-19', hoy)).toBe(-1);
  });
  it('clasifica vencido, por vencer y vigente', () => {
    expect(estadoVencimiento('2026-10-19', hoy)).toBe('vencido');
    expect(estadoVencimiento('2026-11-19', hoy)).toBe('por_vencer');
    expect(estadoVencimiento('2026-11-20', hoy)).toBe('vigente');
    expect(estadoVencimiento(null, hoy)).toBe('sin_dato');
  });
});

describe('plantillas y permisos', () => {
  it('asigna la plantilla según el tipo de vehículo', () => {
    expect(plantillaParaTipo('motocicleta').id).toBe('moto');
    expect(plantillaParaTipo('bus').items.some((i) => i.codigo === 'salidas')).toBe(true);
  });
  it('el conductor solo inspecciona; el auditor solo ve y audita', () => {
    expect(tienePermiso(['conductor'], 'inspeccionar')).toBe(true);
    expect(tienePermiso(['conductor'], 'ver')).toBe(false);
    expect(tienePermiso(['auditor'], 'aprobar_evidencias')).toBe(false);
    expect(tienePermiso(['auditor', 'mantenimiento'], 'gestionar_flota')).toBe(true);
  });
});
