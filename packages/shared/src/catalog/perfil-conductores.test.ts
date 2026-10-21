import { describe, expect, it } from 'vitest';
import { ENCUESTA_PERFIL_V1, hallazgosPerfil, resumirRespuestas, validarRespuestas, type Respuestas } from './perfil-conductores';

const base: Respuestas = {
  edad: '26-35',
  genero: 'masculino',
  escolaridad: 'tecnico',
  personas_cargo: '1-2',
  vinculacion: 'directo',
  antiguedad: '1-3',
  jornada: 'diurna',
  rol_vial: 'motociclista',
  medio_itinere: 'motocicleta',
  tiempo_itinere: '15-30',
  vehiculo_propio: 'si',
  mision: 'diario',
  medio_mision: ['motocicleta'],
  km_mision: '20-100',
  licencia: 'si',
  categorias: ['A2'],
  experiencia: '6-10',
  siniestros: '1',
  siniestro_tipo: ['mision'],
  comparendos: '0',
  celular: 'a_veces',
  riesgos: ['velocidad', 'vias'],
};

describe('encuesta de perfil de los colaboradores', () => {
  it('los identificadores de preguntas y opciones son únicos y las condiciones apuntan a preguntas anteriores', () => {
    const ids = ENCUESTA_PERFIL_V1.preguntas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    ENCUESTA_PERFIL_V1.preguntas.forEach((p, i) => {
      if (p.si) expect(ids.slice(0, i)).toContain(p.si.pregunta);
      if (p.opciones) expect(new Set(p.opciones.map((o) => o.id)).size).toBe(p.opciones.length);
      expect(ENCUESTA_PERFIL_V1.secciones).toContain(p.seccion);
    });
  });

  it('valida obligatorias, opciones y descarta lo que no aplica', () => {
    const ok = validarRespuestas(ENCUESTA_PERFIL_V1, base);
    expect(ok.ok).toBe(true);
    const sinLicencia = validarRespuestas(ENCUESTA_PERFIL_V1, { ...base, licencia: 'no' });
    expect(sinLicencia.ok && sinLicencia.respuestas.categorias).toBeUndefined();
    const mal = validarRespuestas(ENCUESTA_PERFIL_V1, { ...base, edad: '99', riesgos: [], categorias: ['Z9'] });
    expect(mal.ok).toBe(false);
    if (!mal.ok) expect(Object.keys(mal.errores).sort()).toEqual(['categorias', 'edad', 'riesgos']);
  });

  it('resume la distribución y los hallazgos', () => {
    const otra: Respuestas = { ...base, medio_itinere: 'transporte_publico', mision: 'no', siniestros: '0', celular: 'nunca', tiempo_itinere: '>60' };
    delete otra.vehiculo_propio;
    const r = resumirRespuestas(ENCUESTA_PERFIL_V1, [base, otra]);
    const medio = r.find((p) => p.pregunta === 'medio_itinere')!;
    expect(medio.opciones.find((o) => o.id === 'motocicleta')).toMatchObject({ cantidad: 1, porcentaje: 50 });
    expect(r.find((p) => p.pregunta === 'vehiculo_propio')).toMatchObject({ base: 1, respondieron: 1 });
    const h = hallazgosPerfil([base, otra]);
    expect(h.find((x) => x.id === 'moto_itinere')!.valor).toBe(50);
    expect(h.find((x) => x.id === 'trayecto_largo')!.valor).toBe(50);
    expect(hallazgosPerfil([])[0]!.valor).toBeNull();
  });
});
