import { describe, expect, it } from 'vitest';
import { indicadoresFormacion } from './formacion';

describe('indicadores del plan de formación', () => {
  it('calcula cumplimiento, cobertura, eficacia, asistencia y horas', () => {
    const r = indicadoresFormacion(
      [
        {
          estado: 'ejecutada',
          programadaEl: '2026-02-10',
          horas: 2,
          notaMinima: 70,
          asistentes: [
            { conductorId: 'a', asistio: true, nota: 90 },
            { conductorId: 'b', asistio: true, nota: 60 },
            { conductorId: 'c', asistio: false, nota: null },
            { conductorId: null, asistio: true, nota: null },
          ],
        },
        { estado: 'ejecutada', programadaEl: '2026-05-10', horas: 4, notaMinima: 80, asistentes: [{ conductorId: 'a', asistio: true, nota: 85 }, { conductorId: 'x', asistio: true, nota: 70 }] },
        { estado: 'programada', programadaEl: '2026-06-10', horas: 2, notaMinima: 70, asistentes: [] },
        { estado: 'programada', programadaEl: '2026-11-10', horas: 2, notaMinima: 70, asistentes: [] },
        { estado: 'cancelada', programadaEl: '2026-03-10', horas: 2, notaMinima: 70, asistentes: [] },
      ],
      ['a', 'b', 'c', 'd'],
      '2026-10-21',
    );
    expect(r).toMatchObject({
      programadas: 4,
      programadasALaFecha: 3,
      ejecutadas: 2,
      cumplimiento: 66.7,
      conductoresActivos: 4,
      conductoresFormados: 2, // 'x' ya no está activo
      cobertura: 50,
      evaluados: 4,
      aprobados: 2,
      eficacia: 50,
      convocados: 6,
      asistentes: 5,
      asistencia: 83.3,
      horasPersona: 14,
    });
    expect(r.porMes[1]).toEqual({ programadas: 1, ejecutadas: 1 });
    expect(r.porMes[2]).toEqual({ programadas: 0, ejecutadas: 0 });
  });

  it('no inventa porcentajes sin datos', () => {
    const r = indicadoresFormacion([], [], '2026-01-01');
    expect(r.cumplimiento).toBeNull();
    expect(r.cobertura).toBeNull();
    expect(r.eficacia).toBeNull();
  });
});
