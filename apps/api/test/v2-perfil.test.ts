import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

const respuestas = {
  edad: '26-35',
  genero: 'femenino',
  escolaridad: 'tecnico',
  personas_cargo: '1-2',
  vinculacion: 'directo',
  antiguedad: '1-3',
  jornada: 'diurna',
  rol_vial: 'motociclista',
  medio_itinere: 'motocicleta',
  tiempo_itinere: '31-60',
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
  sugerencias: 'Más capacitación en manejo de moto',
};

describe.skipIf(!hayBaseDeDatos)('V2 · perfil sociodemográfico de los colaboradores', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  let campana = '';
  let token = '';
  let conductorId = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
    const d1 = await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1067333001', nombre: 'Sara León', licenciaVence: '2030-01-01', consentimientoDatos: true }).expect(201);
    conductorId = d1.body.id;
    await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1067333002', nombre: 'Tomás Ríos', licenciaVence: '2030-01-01', consentimientoDatos: true }).expect(201);
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('crea la encuesta con un enlace público', async () => {
    await c.agente.post('/api/org/perfil-conductores').set(h()).send({ titulo: 'x' }).expect(400);
    const r = await c.agente.post('/api/org/perfil-conductores').set(h()).send({ titulo: 'Caracterización 2026' }).expect(201);
    campana = r.body.id;
    token = r.body.enlace.split('/encuesta/')[1];
    expect(r.body).toMatchObject({ abierta: true, anonima: false, respuestas: 0, cuestionario: 'perfil-v1' });
    const lista = await c.agente.get('/api/org/perfil-conductores').set(h()).expect(200);
    expect(lista.body).toHaveLength(1);
  });

  it('recibe respuestas por el enlace sin sesión y las asocia al conductor', async () => {
    const anonimo = request(app.getHttpServer());
    await anonimo.get('/api/encuesta/no-existe-este-token-1234').expect(404);
    const ver = await anonimo.get(`/api/encuesta/${token}`).expect(200);
    expect(ver.body).toMatchObject({ titulo: 'Caracterización 2026', cuestionario: 'perfil-v1', abierta: true, anonima: false });
    expect(ver.body.organizacion).toMatch(/^Empresa /);

    await anonimo.post(`/api/encuesta/${token}`).send({ documento: '1067333001', nombre: 'Sara León', respuestas }).expect(400);
    const mal = await anonimo.post(`/api/encuesta/${token}`).send({ documento: '1067333001', nombre: 'Sara León', consentimiento: true, respuestas: { ...respuestas, edad: '200', riesgos: [] } }).expect(400);
    expect(mal.body.errores.map((e: { campo: string }) => e.campo).sort()).toEqual(['respuestas.edad', 'respuestas.riesgos']);
    await anonimo.post(`/api/encuesta/${token}`).send({ consentimiento: true, respuestas }).expect(400);
    await anonimo.post(`/api/encuesta/${token}`).send({ documento: '1067333001', nombre: 'Sara León', consentimiento: true, respuestas }).expect(201);
    await anonimo.post(`/api/encuesta/${token}`).send({ documento: '1067333001', nombre: 'Sara León', consentimiento: true, respuestas }).expect(409);
    // Una persona externa también puede responder.
    await anonimo
      .post(`/api/encuesta/${token}`)
      .send({ documento: '52000111', nombre: 'Lucía Paz', consentimiento: true, respuestas: { ...respuestas, medio_itinere: 'transporte_publico', mision: 'no', siniestros: '0', licencia: 'no', celular: 'no_aplica', tiempo_itinere: '<15' } })
      .expect(201);
  });

  it('muestra los resultados, la cobertura y quién falta por responder', async () => {
    const r = await c.agente.get(`/api/org/perfil-conductores/${campana}`).set(h()).expect(200);
    expect(r.body).toMatchObject({ total: 2, conductoresActivos: 2, conductoresQueRespondieron: 1, cobertura: 50 });
    expect(r.body.pendientes.map((p: { nombre: string }) => p.nombre)).toEqual(['Tomás Ríos']);
    expect(r.body.respuestas.find((x: { nombre: string }) => x.nombre === 'Sara León')).toMatchObject({ conductorId, canal: 'enlace' });
    expect(r.body.hallazgos.find((x: { id: string }) => x.id === 'moto_itinere').valor).toBe(50);
    const medio = r.body.resumen.find((p: { pregunta: string }) => p.pregunta === 'medio_itinere');
    expect(medio.opciones.find((o: { id: string }) => o.id === 'motocicleta')).toMatchObject({ cantidad: 1, porcentaje: 50 });
    // La pregunta de categorías solo aplicaba a quien tiene licencia.
    expect(r.body.resumen.find((p: { pregunta: string }) => p.pregunta === 'categorias')).toMatchObject({ base: 1, respondieron: 1 });
  });

  it('registra respuestas desde la plataforma y respeta el cierre', async () => {
    const tomas = (await c.agente.get('/api/org/conductores').set(h()).expect(200)).body.find((d: { nombre: string }) => d.nombre === 'Tomás Ríos');
    await c.agente.post(`/api/org/perfil-conductores/${campana}/respuestas`).set(h()).send({ conductorId: tomas.id, consentimiento: true, respuestas }).expect(201);
    const r = await c.agente.get(`/api/org/perfil-conductores/${campana}`).set(h()).expect(200);
    expect(r.body).toMatchObject({ total: 3, cobertura: 100, pendientes: [] });

    await c.agente.post(`/api/org/perfil-conductores/${campana}/cerrar`).set(h()).expect(201);
    await request(app.getHttpServer()).post(`/api/encuesta/${token}`).send({ documento: '52000999', nombre: 'Otra Persona', consentimiento: true, respuestas }).expect(400);
    expect((await request(app.getHttpServer()).get(`/api/encuesta/${token}`).expect(200)).body.abierta).toBe(false);
    await c.agente.delete(`/api/org/perfil-conductores/${campana}`).set(h()).expect(400);
  });

  it('una encuesta anónima no guarda nombre ni cédula', async () => {
    const r = await c.agente.post('/api/org/perfil-conductores').set(h()).send({ titulo: 'Anónima', anonima: true }).expect(201);
    const t = r.body.enlace.split('/encuesta/')[1];
    await request(app.getHttpServer()).post(`/api/encuesta/${t}`).send({ documento: '1067333001', nombre: 'Sara León', consentimiento: true, respuestas }).expect(201);
    await request(app.getHttpServer()).post(`/api/encuesta/${t}`).send({ consentimiento: true, respuestas }).expect(201);
    const res = await c.agente.get(`/api/org/perfil-conductores/${r.body.id}`).set(h()).expect(200);
    expect(res.body).toMatchObject({ total: 2, cobertura: null, pendientes: [] });
    expect(res.body.respuestas.every((x: { nombre: string | null; documento: string | null }) => x.nombre === null && x.documento === null)).toBe(true);
  });

  it('genera el informe en PDF y Excel y lo guarda como evidencia del paso 5', async () => {
    const pdf = await c.agente.get(`/api/org/perfil-conductores/${campana}/exportar`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-IN-01');
      expect(texto).toContain('Hallazgos para el diagnóstico');
      expect(texto).toContain('¿Cómo se desplaza normalmente de la casa al trabajo?');
    }
    const xlsx = await c.agente.get(`/api/org/perfil-conductores/${campana}/exportar?formato=xlsx`).set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Respuestas']);
    const textos: string[] = [];
    libro.worksheets[1]!.eachRow((f) => f.eachCell((celda) => textos.push(String(celda.value))));
    expect(textos.join(' | ')).toContain('Más capacitación en manejo de moto');
    const ev = await c.agente.post(`/api/org/perfil-conductores/${campana}/evidencia`).set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=5').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
  });
});
