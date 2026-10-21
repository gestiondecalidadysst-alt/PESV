import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

const base = { proceso: 'Distribución urbana', actividad: 'Entrega de mercancía', cargo: 'Conductor', actorVial: 'conductor', factor: 'humano' };

describe.skipIf(!hayBaseDeDatos)('V2 · matriz de riesgos viales', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  let fatigaId = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('evalúa con GTC 45 por defecto y exige la evaluación completa', async () => {
    const m = await c.agente.get('/api/org/matriz').set(h()).expect(200);
    expect(m.body).toMatchObject({ metodologia: 'gtc45', riesgos: [], resumen: { total: 0 } });

    const incompleto = await c.agente.post('/api/org/matriz/riesgos').set(h()).send({ ...base, metodologia: 'gtc45', peligro: 'Fatiga', inherente: { deficiencia: 6 } }).expect(400);
    expect(JSON.stringify(incompleto.body)).toMatch(/Completa la evaluación/);
    await c.agente.post('/api/org/matriz/riesgos').set(h()).send({ ...base, metodologia: 'gtc45', peligro: 'Fatiga', inherente: { deficiencia: 5, exposicion: 3, consecuencia: 60 } }).expect(400);

    // ND 6 × NE 3 = NP 18 (muy alto); × NC 60 = NR 1080 → nivel I.
    const r = await c.agente
      .post('/api/org/matriz/riesgos')
      .set(h())
      .send({ ...base, metodologia: 'gtc45', peligro: 'Fatiga por jornadas extendidas', controlMedio: 'Pausas activas', inherente: { deficiencia: 6, exposicion: 3, consecuencia: 60 }, residual: { deficiencia: 2, exposicion: 3, consecuencia: 60 }, requisitoLegal: true })
      .expect(201);
    fatigaId = r.body.id;
    expect(r.body.inherente).toMatchObject({ valor: 1080, nivel: 'I', aceptabilidad: 'No aceptable', critico: true });
    expect(r.body.residual).toMatchObject({ valor: 360, nivel: 'II' });

    // ND 2 × NE 2 × NC 10 = 40 → nivel III.
    await c.agente.post('/api/org/matriz/riesgos').set(h()).send({ ...base, factor: 'via', metodologia: 'gtc45', peligro: 'Huecos en la vía', inherente: { deficiencia: 2, exposicion: 2, consecuencia: 10 } }).expect(201);
    const lista = await c.agente.get('/api/org/matriz').set(h()).expect(200);
    expect(lista.body.riesgos.map((x: { peligro: string }) => x.peligro)).toEqual(['Fatiga por jornadas extendidas', 'Huecos en la vía']);
    expect(lista.body.resumen).toMatchObject({ total: 2, criticos: 1 });
    expect(lista.body.resumen.porNivel.find((n: { nivel: string }) => n.nivel === 'III').inherente).toBe(1);
  });

  it('registra medidas por jerarquía y las envía al plan de trabajo', async () => {
    const m = await c.agente.post(`/api/org/matriz/riesgos/${fatigaId}/medidas`).set(h()).send({ jerarquia: 'administrativos', descripcion: 'Programa de gestión de la fatiga', responsable: 'Líder PESV', fechaLimite: `${new Date().getFullYear()}-12-15` }).expect(201);
    await c.agente.post(`/api/org/matriz/riesgos/${fatigaId}/medidas`).set(h()).send({ jerarquia: 'magia', descripcion: 'x' }).expect(400);

    const enviado = await c.agente.post(`/api/org/matriz/medidas/${m.body.id}/plan`).set(h()).expect(201);
    await c.agente.post(`/api/org/matriz/medidas/${m.body.id}/plan`).set(h()).expect(400);
    const plan = await c.agente.get('/api/org/plan-trabajo').set(h()).expect(200);
    const actividad = plan.body.actividades.find((a: { id: string }) => a.id === enviado.body.actividadId);
    expect(actividad).toMatchObject({ titulo: 'Programa de gestión de la fatiga', pasoNumero: 8, origen: 'riesgo', estado: 'planeada', meses: [12] });

    // Al implementar la medida, la actividad del plan queda ejecutada.
    await c.agente.patch(`/api/org/matriz/medidas/${m.body.id}`).set(h()).send({ jerarquia: 'administrativos', descripcion: 'Programa de gestión de la fatiga', estado: 'implementada' }).expect(200);
    const despues = await c.agente.get('/api/org/plan-trabajo').set(h()).expect(200);
    expect(despues.body.actividades.find((a: { id: string }) => a.id === enviado.body.actividadId)).toMatchObject({ estado: 'ejecutada', avance: 100 });
    // Si se reabre la medida, el mes vuelve a quedar pendiente en el cronograma.
    await c.agente.patch(`/api/org/matriz/medidas/${m.body.id}`).set(h()).send({ jerarquia: 'administrativos', descripcion: 'Programa de gestión de la fatiga', estado: 'en_curso' }).expect(200);
    const reabierta = await c.agente.get('/api/org/plan-trabajo').set(h()).expect(200);
    expect(reabierta.body.actividades.find((a: { id: string }) => a.id === enviado.body.actividadId)).toMatchObject({ estado: 'planeada', avance: 0 });
  });

  it('cambia a matriz 5×5 y conserva los riesgos evaluados con GTC 45', async () => {
    await c.agente.put('/api/org/matriz/metodologia').set(h()).send({ metodologia: 'otra' }).expect(400);
    await c.agente.put('/api/org/matriz/metodologia').set(h()).send({ metodologia: 'matriz5x5' }).expect(200);
    const r = await c.agente.post('/api/org/matriz/riesgos').set(h()).send({ ...base, metodologia: 'matriz5x5', peligro: 'Uso del celular', inherente: { probabilidad: 3, severidad: 4 } }).expect(201);
    expect(r.body.inherente).toMatchObject({ valor: 12, nivel: 'Alto' });
    const m = await c.agente.get('/api/org/matriz').set(h()).expect(200);
    expect(m.body.metodologia).toBe('matriz5x5');
    expect(m.body.resumen).toMatchObject({ total: 3, otraMetodologia: 2 });
    // Los riesgos anteriores siguen con su evaluación original.
    expect(m.body.riesgos.find((x: { id: string }) => x.id === fatigaId).inherente.nivel).toBe('I');
    await c.agente.put('/api/org/matriz/metodologia').set(h()).send({ metodologia: 'gtc45' }).expect(200);
  });

  it('exporta la matriz en PDF y Excel con el formato de la organización', async () => {
    const pdf = await c.agente.get('/api/org/matriz/exportar?formato=pdf').set(h()).buffer(true).parse(binario).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-MT-01');
      expect(texto).toContain('Fatiga por jornadas extendidas');
      expect(texto).toContain('Programa de gestión de la fatiga');
      expect(texto).toMatch(/Criterios de evaluación/);
    }

    const xlsx = await c.agente.get('/api/org/matriz/exportar?formato=xlsx').set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Matriz', 'Criterios']);
    const textos: string[] = [];
    libro.worksheets[0]!.eachRow((fila) => fila.eachCell((celda) => textos.push(String(celda.value))));
    const todo = textos.join(' | ');
    expect(todo).toContain('Fatiga por jornadas extendidas');
    expect(todo).toContain('1080');
    expect(todo).toContain('Uso del celular');
  });

  it('guarda la matriz como evidencia del paso 6 y permite eliminar riesgos', async () => {
    const ev = await c.agente.post('/api/org/matriz/evidencia').set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=6').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string; estado: string }) => e.id === ev.body.evidenciaId)).toBe(true);

    await c.agente.delete(`/api/org/matriz/riesgos/${fatigaId}`).set(h()).expect(204);
    await c.agente.delete(`/api/org/matriz/riesgos/${fatigaId}`).set(h()).expect(404);
    const m = await c.agente.get('/api/org/matriz').set(h()).expect(200);
    expect(m.body.resumen.total).toBe(2);
  });
});
