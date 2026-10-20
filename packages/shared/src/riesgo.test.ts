import { describe, expect, it } from 'vitest';
import { bandaPuntaje, puntajeConductor, puntajeVehiculo, type FactoresConductor, type FactoresVehiculo } from './riesgo';

const conductorLimpio: FactoresConductor = {
  siniestros: { conFallecidos: 0, conLesionadosGraves: 0, conLesionadosLeves: 0, soloDanos: 0 },
  viajes: 40,
  excesosVelocidad: 0,
  excesosJornada: 0,
  licencia: 'vigente',
  examenMedico: 'vigente',
  capacitaciones: 2,
};

const vehiculoLimpio: FactoresVehiculo = {
  motorizado: true,
  modelo: 2023,
  fallasCriticas: 0,
  fallasMenores: 0,
  diasSinPreoperacional: 0,
  mantenimientosVencidos: 0,
  soat: 'vigente',
  revisionTecnicoMecanica: 'vigente',
  siniestros: 0,
};

describe('puntaje de riesgo', () => {
  it('asigna las bandas por umbral', () => {
    expect([0, 24, 25, 49, 50, 74, 75, 100].map(bandaPuntaje)).toEqual(['bajo', 'bajo', 'medio', 'medio', 'alto', 'alto', 'critico', 'critico']);
  });

  it('un conductor sin novedades queda en 0 y sin factores', () => {
    expect(puntajeConductor(conductorLimpio)).toEqual({ puntaje: 0, banda: 'bajo', factores: [] });
  });

  it('explica cada punto y ordena los factores de mayor a menor', () => {
    const r = puntajeConductor({
      ...conductorLimpio,
      siniestros: { conFallecidos: 0, conLesionadosGraves: 1, conLesionadosLeves: 0, soloDanos: 0 },
      excesosVelocidad: 4,
      licencia: 'vencido',
      capacitaciones: 0,
    });
    // 30 (siniestro grave) + 10 (4 de 40 viajes = 10 %, la mitad del máximo de 20) + 15 (licencia) + 7 (capacitación)
    expect(r.puntaje).toBe(62);
    expect(r.banda).toBe('alto');
    expect(r.factores.map((f) => f.factor)).toEqual(['Siniestros (12 meses)', 'Licencia de conducción', 'Excesos de velocidad (90 días)', 'Capacitación']);
  });

  it('limita el puntaje a 100 y el aporte de siniestros a 45', () => {
    const r = puntajeConductor({
      ...conductorLimpio,
      siniestros: { conFallecidos: 3, conLesionadosGraves: 0, conLesionadosLeves: 0, soloDanos: 0 },
      viajes: 10,
      excesosVelocidad: 10,
      excesosJornada: 10,
      licencia: 'vencido',
      examenMedico: 'vencido',
      capacitaciones: 0,
    });
    expect(r.factores.find((f) => f.factor.startsWith('Siniestros'))!.puntos).toBe(45);
    expect(r.puntaje).toBe(100);
    expect(r.banda).toBe('critico');
  });

  it('cuenta excesos aunque no haya viajes registrados', () => {
    expect(puntajeConductor({ ...conductorLimpio, viajes: 0, excesosVelocidad: 1 }).puntaje).toBe(10);
  });

  it('el vehículo suma fallas, mantenimiento vencido, documentos y antigüedad', () => {
    const r = puntajeVehiculo(
      { ...vehiculoLimpio, modelo: 2008, fallasCriticas: 1, fallasMenores: 2, mantenimientosVencidos: 1, soat: 'por_vencer', diasSinPreoperacional: null },
      new Date(2026, 9, 20),
    );
    // 10 + 6 (fallas) + 12 (mantenimiento) + 12 (18 años) + 3.75→4 (SOAT por vencer) + 5 (sin preoperacional)
    expect(r.puntaje).toBe(49);
    expect(r.banda).toBe('medio');
  });

  it('no evalúa SOAT ni preoperacional en vehículos no motorizados', () => {
    const r = puntajeVehiculo({ ...vehiculoLimpio, motorizado: false, soat: 'sin_dato', revisionTecnicoMecanica: 'sin_dato', diasSinPreoperacional: null });
    expect(r.puntaje).toBe(0);
  });
});
