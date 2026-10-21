import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

const anio = new Date().getFullYear() - 1;
const base = { temaId: 'manejo_defensivo', publico: ['conductores'], horas: 2, facilitador: 'Instructor ARL', tipoFacilitador: 'arl' };

describe.skipIf(!hayBaseDeDatos)('V2 · plan anual de formación', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  const conductores: { id: string; nombre: string; documento: string }[] = [];
  let defensivo = '';
  let fatiga = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
    for (const [documento, nombre] of [['1067000001', 'Ana Ruiz'], ['1067000002', 'Luis Mora'], ['1067000003', 'Rosa Díaz'], ['1067000004', 'Iván Gil']] as const) {
      const r = await c.agente.post('/api/org/conductores').set(h()).send({ documento, nombre, licenciaVence: `${anio + 3}-01-01`, consentimientoDatos: true }).expect(201);
      conductores.push({ id: r.body.id, nombre, documento });
    }
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('programa capacitaciones por tema y público y las lleva al plan de trabajo', async () => {
    await c.agente.post('/api/org/capacitacion').set(h()).send({ ...base, titulo: 'Sin público', publico: [], programadaEl: `${anio}-03-10` }).expect(400);
    const d = await c.agente.post('/api/org/capacitacion').set(h()).send({ ...base, titulo: 'Manejo defensivo', programadaEl: `${anio}-03-10`, notaMinima: 80 }).expect(201);
    defensivo = d.body.id;
    const f = await c.agente.post('/api/org/capacitacion').set(h()).send({ ...base, titulo: 'Prevención de la fatiga', temaId: 'fatiga', programadaEl: `${anio}-06-15`, enPlanDeTrabajo: false }).expect(201);
    fatiga = f.body.id;
    await c.agente.post('/api/org/capacitacion').set(h()).send({ ...base, titulo: 'Primeros auxilios', temaId: 'emergencias', programadaEl: `${anio}-09-01` }).expect(201);

    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    const actividades = plan.body.actividades.filter((a: { origen: string }) => a.origen === 'capacitacion');
    expect(actividades.map((a: { titulo: string; meses: number[]; pasoNumero: number }) => [a.titulo, a.meses, a.pasoNumero])).toEqual([
      ['Capacitación: Manejo defensivo', [3], 10],
      ['Capacitación: Primeros auxilios', [9], 10],
    ]);
    // El seguimiento de estas actividades se hace desde el plan de formación.
    await c.agente.post(`/api/org/plan-trabajo/${actividades[0].id}/seguimiento`).set(h()).send({ mes: 3, ejecutado: true, fecha: `${anio}-03-10` }).expect(400);
  });

  it('exige asistencia para ejecutar y calcula los resultados de la evaluación', async () => {
    await c.agente.post(`/api/org/capacitacion/${defensivo}/ejecutar`).set(h()).send({ fecha: `${anio}-03-12` }).expect(400);
    const [ana, luis, rosa] = conductores;
    await c.agente
      .put(`/api/org/capacitacion/${defensivo}/asistencia`)
      .set(h())
      .send({ asistentes: [{ conductorId: ana!.id, nombre: ana!.nombre, documento: ana!.documento }, { conductorId: ana!.id, nombre: 'Repetida', documento: ana!.documento }] })
      .expect(400);
    await c.agente
      .put(`/api/org/capacitacion/${defensivo}/asistencia`)
      .set(h())
      .send({
        asistentes: [
          { conductorId: ana!.id, nombre: ana!.nombre, documento: ana!.documento, cargo: 'Conductora', nota: 95 },
          { conductorId: luis!.id, nombre: luis!.nombre, documento: luis!.documento, nota: 70 },
          { conductorId: rosa!.id, nombre: rosa!.nombre, documento: rosa!.documento, asistio: false },
        ],
      })
      .expect(200);
    await c.agente.post(`/api/org/capacitacion/${defensivo}/ejecutar`).set(h()).send({ fecha: `${anio + 1}-01-02` }).expect(400);
    await c.agente.post(`/api/org/capacitacion/${defensivo}/ejecutar`).set(h()).send({ fecha: `${anio}-03-12` }).expect(201);
    await c.agente.delete(`/api/org/capacitacion/${defensivo}`).set(h()).expect(400);

    const r = await c.agente.get(`/api/org/capacitacion?anio=${anio}`).set(h()).expect(200);
    const d = r.body.capacitaciones.find((x: { id: string }) => x.id === defensivo);
    expect(d).toMatchObject({ estado: 'ejecutada', ejecutadaEl: `${anio}-03-12`, resultado: { convocados: 3, asistentes: 2, evaluados: 2, aprobados: 1, promedio: 82.5 } });
    expect(d.asistentes.find((a: { nombre: string }) => a.nombre === 'Luis Mora').aprobo).toBe(false);

    // El plan de trabajo refleja la ejecución.
    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    expect(plan.body.actividades.find((a: { titulo: string }) => a.titulo === 'Capacitación: Manejo defensivo')).toMatchObject({ estado: 'ejecutada', avance: 100 });
  });

  it('calcula cumplimiento, cobertura, eficacia y el historial por conductor', async () => {
    const [ana, , , ivan] = conductores;
    await c.agente.put(`/api/org/capacitacion/${fatiga}/asistencia`).set(h()).send({ asistentes: [{ conductorId: ana!.id, nombre: ana!.nombre, documento: ana!.documento, nota: 88 }, { conductorId: ivan!.id, nombre: ivan!.nombre, documento: ivan!.documento, nota: 90 }] }).expect(200);
    await c.agente.post(`/api/org/capacitacion/${fatiga}/ejecutar`).set(h()).send({ fecha: `${anio}-06-15`, horas: 3 }).expect(201);
    await c.agente.put(`/api/org/capacitacion/${fatiga}/eficacia`).set(h()).send({ efectiva: true, fecha: `${anio}-06-01`, nota: 'Antes de la capacitación' }).expect(400);
    await c.agente.put(`/api/org/capacitacion/${fatiga}/eficacia`).set(h()).send({ efectiva: true, fecha: `${anio}-08-01`, nota: 'Sin alertas de fatiga en la telemetría durante 6 semanas' }).expect(200);

    const r = await c.agente.get(`/api/org/capacitacion?anio=${anio}`).set(h()).expect(200);
    expect(r.body.indicadores).toMatchObject({
      programadas: 3,
      ejecutadas: 2,
      cumplimiento: 66.7,
      conductoresActivos: 4,
      conductoresFormados: 3,
      cobertura: 75,
      evaluados: 4,
      aprobados: 3,
      eficacia: 75,
      horasPersona: 10,
    });
    expect(r.body.pendientesEficacia).toBe(1);

    const hist = await c.agente.get(`/api/org/capacitacion/conductores?anio=${anio}`).set(h()).expect(200);
    expect(hist.body.find((d: { nombre: string }) => d.nombre === 'Ana Ruiz')).toMatchObject({ capacitacionesAnio: 2, horasAnio: 5, temasAnio: ['fatiga', 'manejo_defensivo'] });
    expect(hist.body.find((d: { nombre: string }) => d.nombre === 'Rosa Díaz')).toMatchObject({ capacitacionesAnio: 0, ultima: null });
  });

  it('genera el programa, la lista de asistencia y las evidencias del paso 10', async () => {
    const lista = await c.agente.get(`/api/org/capacitacion/${defensivo}/lista-asistencia`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(lista.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-FR-01');
      expect(texto).toContain('Ana Ruiz');
      expect(texto).toContain('2 de 3 convocados');
    }
    const programa = await c.agente.get(`/api/org/capacitacion/exportar?anio=${anio}`).set(h()).buffer(true).parse(binario).expect(200);
    const tp = textoPdf(programa.body as Buffer);
    if (tp !== null) expect(tp).toContain(`PLAN ANUAL DE FORMACIÓN EN SEGURIDAD VIAL ${anio}`);

    const xlsx = await c.agente.get(`/api/org/capacitacion/exportar?anio=${anio}&formato=xlsx`).set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Programa', 'Asistencia', 'Conductores']);

    const primeros = await c.agente.get(`/api/org/capacitacion?anio=${anio}`).set(h()).expect(200);
    const pendiente = primeros.body.capacitaciones.find((x: { titulo: string }) => x.titulo === 'Primeros auxilios');
    await c.agente.post(`/api/org/capacitacion/${pendiente.id}/evidencia`).set(h()).expect(400);
    const ev1 = await c.agente.post(`/api/org/capacitacion/${defensivo}/evidencia`).set(h()).expect(201);
    const ev2 = await c.agente.post(`/api/org/capacitacion/evidencia?anio=${anio}`).set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=10').set(h()).expect(200);
    const ids = evidencias.body.map((e: { id: string }) => e.id);
    expect(ids).toEqual(expect.arrayContaining([ev1.body.evidenciaId, ev2.body.evidenciaId]));

    // Cancelar la pendiente también cancela su actividad del plan.
    await c.agente.put(`/api/org/capacitacion/${pendiente.id}`).set(h()).send({ ...base, titulo: 'Primeros auxilios', temaId: 'emergencias', programadaEl: `${anio}-09-01`, cancelada: true }).expect(200);
    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    expect(plan.body.actividades.find((a: { titulo: string }) => a.titulo === 'Capacitación: Primeros auxilios').estado).toBe('cancelada');
  });
});
