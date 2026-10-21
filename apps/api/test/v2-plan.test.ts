import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, PNG, registrar, textoPdf, type Cuenta } from './helpers.js';

const anio = new Date().getFullYear() - 1; // Un año cerrado: todo lo programado ya venció.
const base = { anio, responsable: 'Líder PESV', fase: 'hacer' };

describe.skipIf(!hayBaseDeDatos)('V2 · plan anual de trabajo', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  let simulacro = '';
  let inspecciones = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('programa actividades por mes y las relaciona con una meta del mismo año', async () => {
    const meta = await c.agente.post('/api/org/metas').set(h()).send({ anio, objetivo: 'Reducir la siniestralidad', indicador: 'Siniestros por cada 100 vehículos', meta: 2, valorActual: 3 }).expect(201);
    const otra = await c.agente.post('/api/org/metas').set(h()).send({ anio: anio + 1, objetivo: 'Otra', indicador: 'Otro', meta: 1 }).expect(201);
    await c.agente.post('/api/org/plan-trabajo').set(h()).send({ ...base, titulo: 'Sin meses', meses: [] }).expect(400);
    await c.agente.post('/api/org/plan-trabajo').set(h()).send({ ...base, titulo: 'Meta de otro año', meses: [3], metaId: otra.body.id }).expect(400);

    const s = await c.agente
      .post('/api/org/plan-trabajo')
      .set(h())
      .send({ ...base, titulo: 'Simulacro de emergencia vial', pasoNumero: 12, metaId: meta.body.id, recursos: 'Brigada, botiquín', presupuesto: 1_500_000, meses: [9, 3, 3] })
      .expect(201);
    simulacro = s.body.id;
    const i = await c.agente.post('/api/org/plan-trabajo').set(h()).send({ ...base, titulo: 'Inspecciones de vehículos', pasoNumero: 16, meses: [1, 2, 3, 4], presupuesto: 400_000 }).expect(201);
    inspecciones = i.body.id;
    await c.agente.post('/api/org/plan-trabajo').set(h()).send({ ...base, titulo: 'Actividad cancelada', meses: [5], cancelada: true }).expect(201);

    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    const a = plan.body.actividades.find((x: { id: string }) => x.id === simulacro);
    expect(a).toMatchObject({ meses: [3, 9], estado: 'planeada', meta: { objetivo: 'Reducir la siniestralidad' }, atrasados: [3, 9] });
    expect(plan.body.resumen).toMatchObject({ actividades: 2, canceladas: 1, programados: 6, ejecutados: 0, cumplimiento: 0, atrasadas: 2, presupuesto: 1_900_000 });
  });

  it('registra el seguimiento mensual y deriva el estado y el cumplimiento', async () => {
    const seguir = (id: string, d: Record<string, unknown>) => c.agente.post(`/api/org/plan-trabajo/${id}/seguimiento`).set(h()).send(d);
    await seguir(simulacro, { mes: 5, ejecutado: true, fecha: `${anio}-05-10` }).expect(400);
    await seguir(simulacro, { mes: 3, ejecutado: true }).expect(400);
    await seguir(simulacro, { mes: 3, ejecutado: false }).expect(400);
    const r = await seguir(simulacro, { mes: 3, ejecutado: true, fecha: `${anio}-03-20`, nota: 'Simulacro con 25 conductores' }).expect(201);
    expect(r.body.estado).toBe('en_curso');
    await seguir(simulacro, { mes: 9, ejecutado: false, nota: 'Se aplazó por la temporada de lluvias' }).expect(201);
    for (const mes of [1, 2, 3, 4]) await seguir(inspecciones, { mes, ejecutado: true, fecha: `${anio}-0${mes}-15` }).expect(201);

    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    expect(plan.body.actividades.find((x: { id: string }) => x.id === inspecciones)).toMatchObject({ estado: 'ejecutada', avance: 100, ejecutadaEl: `${anio}-04-15` });
    const s = plan.body.actividades.find((x: { id: string }) => x.id === simulacro);
    expect(s).toMatchObject({ estado: 'en_curso', avance: 50, atrasados: [9] });
    // 5 de 6 meses-actividad ejecutados.
    expect(plan.body.resumen).toMatchObject({ programados: 6, ejecutados: 5, cumplimiento: 83.3, ejecutadas: 1, atrasadas: 1 });
    expect(plan.body.resumen.porMes[2]).toEqual({ programados: 2, ejecutados: 2 });
    expect(plan.body.resumen.porFase.find((f: { fase: string }) => f.fase === 'hacer')).toMatchObject({ actividades: 2, cumplimiento: 83.3 });

    await c.agente.delete(`/api/org/plan-trabajo/${inspecciones}/seguimiento/4`).set(h()).expect(200);
    const tras = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    expect(tras.body.actividades.find((x: { id: string }) => x.id === inspecciones).estado).toBe('en_curso');
  });

  it('guarda el soporte del seguimiento como evidencia del paso de la actividad', async () => {
    const r = await c.agente
      .post(`/api/org/plan-trabajo/${inspecciones}/seguimiento`)
      .set(h())
      .field('mes', '4')
      .field('ejecutado', 'true')
      .field('fecha', `${anio}-04-28`)
      .attach('archivo', PNG, { filename: 'inspeccion.png', contentType: 'image/png' })
      .expect(201);
    expect(r.body).toMatchObject({ estado: 'ejecutada' });
    const evidencias = await c.agente.get('/api/org/evidencias?paso=16').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === r.body.evidenciaId)).toBe(true);
  });

  it('al quitar meses del cronograma se descarta su seguimiento', async () => {
    await c.agente.put(`/api/org/plan-trabajo/${simulacro}`).set(h()).send({ ...base, titulo: 'Simulacro de emergencia vial', pasoNumero: 12, meses: [3] }).expect(200);
    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    const s = plan.body.actividades.find((x: { id: string }) => x.id === simulacro);
    expect(s).toMatchObject({ meses: [3], estado: 'ejecutada', atrasados: [] });
    expect(s.seguimiento.map((x: { mes: number }) => x.mes)).toEqual([3]);
  });

  it('exporta el cronograma en PDF y Excel y lo guarda como evidencia del paso 9', async () => {
    const pdf = await c.agente.get(`/api/org/plan-trabajo/exportar?anio=${anio}`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain(`PLAN ANUAL DE TRABAJO DEL PESV ${anio}`);
      expect(texto).toContain('Simulacro de emergencia vial');
      expect(texto).toContain('Cumplimiento por mes');
    }
    const xlsx = await c.agente.get(`/api/org/plan-trabajo/exportar?anio=${anio}&formato=xlsx`).set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Plan de trabajo', 'Seguimiento', 'Cumplimiento']);
    const textos: string[] = [];
    libro.worksheets[1]!.eachRow((f) => f.eachCell((celda) => textos.push(String(celda.value))));
    expect(textos.join(' | ')).toContain('Simulacro con 25 conductores');

    const ev = await c.agente.post(`/api/org/plan-trabajo/evidencia?anio=${anio}`).set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=9').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
    await c.agente.get('/api/org/plan-trabajo?anio=1999').set(h()).expect(400);
  });
});
