import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, cumplirPaso1, cumplirPaso2, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

// Fechas de calendario en Colombia (UTC−5), como las calcula la API.
const enDias = (d: number) => new Date(Date.now() - 5 * 3600_000 + d * 86_400_000).toISOString().slice(0, 10);
const hoy = () => enDias(0);

describe.skipIf(!hayBaseDeDatos)('V2 · pasos conectados y plan de acción', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  let hallazgo = '';
  let accion = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app, { misionalidad: 2, vehiculos: 64, conductores: 30 });
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('no deja cerrar un paso sin sus prerrequisitos', async () => {
    await cumplirPaso2(c);
    const r = await c.agente.patch('/api/org/pasos/2').set(h()).send({ estado: 'hecho' }).expect(422);
    expect(r.body.message).toMatch(/deben estar hechos: 1\. /);
    const pasos = await c.agente.get('/api/org/pasos').set(h()).expect(200);
    const dos = pasos.body.find((p: { numero: number }) => p.numero === 2);
    expect(dos).toMatchObject({ prerrequisitos: [{ numero: 1, estado: 'pendiente' }], prerrequisitosPendientes: [1] });
    expect(pasos.body.find((p: { numero: number }) => p.numero === 1).habilita).toEqual(expect.arrayContaining([2, 3, 5]));

    await cumplirPaso1(c);
    await c.agente.patch('/api/org/pasos/1').set(h()).send({ estado: 'hecho' }).expect(200);
    await c.agente.patch('/api/org/pasos/2').set(h()).send({ estado: 'hecho' }).expect(200);
  });

  it('un hallazgo de un paso se trata en el plan de acción y bloquea el cierre mientras esté abierto', async () => {
    await c.agente.post('/api/org/pasos/2/hallazgos').set(h()).send({ tipo: 'no_conformidad', descripcion: 'x', detectadoEl: hoy() }).expect(400);
    const r = await c.agente
      .post('/api/org/pasos/2/hallazgos')
      .set(h())
      .send({ tipo: 'no_conformidad', fuente: 'revision_direccion', descripcion: 'El comité no se reunió en el último trimestre', causa: 'No hay calendario de reuniones', detectadoEl: hoy() })
      .expect(201);
    hallazgo = r.body.id;
    // La no conformidad reabre el paso.
    let pasos = await c.agente.get('/api/org/pasos').set(h()).expect(200);
    expect(pasos.body.find((p: { numero: number }) => p.numero === 2)).toMatchObject({ estado: 'en_curso', hallazgosAbiertos: 1, noConformidadesAbiertas: 1 });
    const bloqueo = await c.agente.patch('/api/org/pasos/2').set(h()).send({ estado: 'hecho' }).expect(422);
    expect(bloqueo.body.message).toMatch(/no conformidades abiertas/);

    await c.agente.post(`/api/org/hallazgos/${hallazgo}/cerrar`).set(h()).send({ nota: 'Se verificó el calendario' }).expect(400);
    const a = await c.agente.post(`/api/org/hallazgos/${hallazgo}/acciones`).set(h()).send({ descripcion: 'Aprobar el calendario anual de reuniones del comité', tipo: 'mejora', responsable: 'Líder PESV', venceEl: enDias(20) }).expect(201);
    accion = a.body.id;
    expect(a.body).toMatchObject({ origen: 'paso', tipo: 'correctiva', pasoNumero: 2 });
    pasos = await c.agente.get('/api/org/pasos').set(h()).expect(200);
    expect(pasos.body.find((p: { numero: number }) => p.numero === 2)).toMatchObject({ accionesAbiertas: 1, accionesVencidas: 0 });

    await c.agente.post(`/api/org/hallazgos/${hallazgo}/cerrar`).set(h()).send({ nota: 'Se verificó el calendario' }).expect(400);
    await c.agente.post(`/api/org/acciones/${accion}/cerrar`).set(h()).send({ nota: 'Calendario aprobado en el acta 3' }).expect(201);
    const hs = await c.agente.get('/api/org/pasos/2/hallazgos').set(h()).expect(200);
    expect(hs.body[0]).toMatchObject({ listoParaCerrar: true });
    await c.agente.post(`/api/org/hallazgos/${hallazgo}/cerrar`).set(h()).send({ nota: 'El comité sesionó según el calendario' }).expect(201);
    await c.agente.patch('/api/org/pasos/2').set(h()).send({ estado: 'hecho' }).expect(200);
  });

  it('el plan de acción unifica las acciones de todos los orígenes con su paso', async () => {
    await c.agente.post('/api/org/acciones').set(h()).send({ descripcion: 'Actualizar la matriz de riesgos', tipo: 'mejora', responsable: 'Líder PESV', venceEl: enDias(-3), origen: 'manual', pasoNumero: 6 }).expect(201);
    const p = await c.agente.get('/api/org/acciones/plan').set(h()).expect(200);
    expect(p.body.resumen).toMatchObject({ total: 2, abiertas: 1, vencidas: 1, cerradas: 1 });
    expect(p.body.resumen.porOrigen).toEqual(expect.arrayContaining([{ origen: 'paso', abiertas: 0, cerradas: 1 }, { origen: 'manual', abiertas: 1, cerradas: 0 }]));
    expect(p.body.resumen.porPaso).toEqual([{ paso: 2, abiertas: 0, vencidas: 0 }, { paso: 6, abiertas: 1, vencidas: 1 }]);
    const porPaso = await c.agente.get('/api/org/acciones?paso=6').set(h()).expect(200);
    expect(porPaso.body).toHaveLength(1);

    const pdf = await c.agente.get('/api/org/acciones/exportar').set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-PL-04');
      expect(texto).toContain('Actualizar la matriz de riesgos');
      expect(texto).toContain('Vencida');
    }
    const xlsx = await c.agente.get('/api/org/acciones/exportar?formato=xlsx').set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Plan de acción', 'Hallazgos de pasos']);
    const ev = await c.agente.post('/api/org/acciones/evidencia').set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=23').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
  });

  it('el tablero de gestión muestra el avance por fase y los pasos que siguen', async () => {
    const g = await c.agente.get('/api/org/tablero/gestion').set(h()).expect(200);
    expect(g.body.porFase.find((f: { fase: string }) => f.fase === 'planear')).toMatchObject({ hechos: 2 });
    // Con 1 y 2 hechos, el 3 y el 5 quedan habilitados; el 6 aún espera al 5.
    const siguientes = g.body.siguientes.map((s: { numero: number }) => s.numero);
    expect(siguientes).toEqual(expect.arrayContaining([3, 5]));
    expect(siguientes).not.toContain(6);
    expect(g.body.acciones).toMatchObject({ abiertas: 1, vencidas: 1, hallazgosAbiertos: 0 });
    expect(g.body).toHaveProperty('planTrabajo.porMes');
    expect(g.body.documentos.tienePolitica).toBe(false);
  });
});
