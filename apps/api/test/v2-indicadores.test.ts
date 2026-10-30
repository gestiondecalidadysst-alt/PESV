import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

const anio = new Date().getFullYear() - 1;

interface Periodo { id: string; valor: number | null; estado: string | null; origen: string | null; analisis: string | null; accionId: string | null; numerador: number | null; denominador: number | null }
interface Indicador { id: string; calculo: string | null; nombre: string; periodos: Periodo[]; ultimo: { valor: number; estado: string } | null; sinAnalizar: string[] }

describe.skipIf(!hayBaseDeDatos)('V2 · indicadores y metas', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  const consultar = async () => (await c.agente.get(`/api/org/indicadores?anio=${anio}`).set(h()).expect(200)).body as { indicadores: Indicador[]; resumen: Record<string, number>; plantillasDisponibles: { calculo: string }[] };
  const por = (lista: Indicador[], calculo: string) => lista.find((i) => i.calculo === calculo)!;
  let manual = '';

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
    const v = await c.agente.post('/api/org/vehiculos').set(h()).send({ placa: 'IND001', tipo: 'camion', propiedad: 'propio', odometroKm: 1000, soatVence: `${anio + 2}-01-01`, rtmVence: `${anio + 2}-01-01` }).expect(201);
    const d = await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1067222333', nombre: 'Pedro Paz', licenciaVence: `${anio + 3}-01-01`, consentimientoDatos: true }).expect(201);
    await c.agente
      .post('/api/org/siniestros')
      .set(h())
      .send({ ocurridoEn: `${anio}-02-10T15:00:00-05:00`, lugar: 'Vía al mar km 3', vehiculoId: v.body.id, placa: 'IND001', conductorId: d.body.id, conductorNombre: 'Pedro Paz', conductorDocumento: '1067222333', fallecidos: 1, heridosLeves: 2, descripcion: 'Salida de la vía' })
      .expect(201);
    const a = await c.agente.post('/api/org/plan-trabajo').set(h()).send({ anio, titulo: 'Inspecciones', responsable: 'Jefe de flota', meses: [1, 2, 3, 4] }).expect(201);
    for (const mes of [1, 2, 4]) await c.agente.post(`/api/org/plan-trabajo/${a.body.id}/seguimiento`).set(h()).send({ mes, ejecutado: true, fecha: `${anio}-0${mes}-20` }).expect(201);
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('carga las plantillas sugeridas y mide los automáticos por periodo', async () => {
    const inicial = await consultar();
    expect(inicial.indicadores).toEqual([]);
    expect(inicial.plantillasDisponibles.length).toBe(18);
    await c.agente.post('/api/org/indicadores/plantillas').set(h()).send({ calculos: [] }).expect(400);
    await c.agente.post('/api/org/indicadores/plantillas').set(h()).send({ calculos: ['siniestros_viales', 'victimas_fatales', 'lesionados', 'cumplimiento_plan_trabajo', 'tasa_siniestralidad'] }).expect(201);
    const repetido = await c.agente.post('/api/org/indicadores/plantillas').set(h()).send({ calculos: ['siniestros_viales'] }).expect(201);
    expect(repetido.body.agregados).toBe(0);

    const { indicadores, plantillasDisponibles } = await consultar();
    expect(indicadores).toHaveLength(5);
    expect(plantillasDisponibles).toHaveLength(13);
    const siniestros = por(indicadores, 'siniestros_viales');
    expect(siniestros.periodos).toHaveLength(12);
    expect(siniestros.periodos[1]).toMatchObject({ id: `${anio}-02`, valor: 1, estado: 'en_riesgo', origen: 'calculado' });
    expect(siniestros.periodos[0]).toMatchObject({ valor: 0, estado: 'cumple' });
    expect(por(indicadores, 'victimas_fatales').periodos[1]).toMatchObject({ valor: 1, estado: 'no_cumple' });
    expect(por(indicadores, 'lesionados').periodos[1]).toMatchObject({ valor: 2, estado: 'en_riesgo' });
    // Trimestral: T1 tiene 3 meses programados y 2 ejecutados; T2, 1 de 1.
    const plan = por(indicadores, 'cumplimiento_plan_trabajo');
    expect(plan.periodos.map((p) => p.valor)).toEqual([66.67, 100, null, null]);
    expect(plan.periodos[0]).toMatchObject({ numerador: 2, denominador: 3, estado: 'no_cumple' });
    // Sin kilómetros recorridos no hay tasa.
    expect(por(indicadores, 'tasa_siniestralidad').periodos[0]!.valor).toBeNull();
    expect(por(indicadores, 'victimas_fatales').sinAnalizar).toEqual([`${anio}-02`]);
  });

  it('registra el análisis del periodo y crea la acción de mejora ante el incumplimiento', async () => {
    const victimas = por((await consultar()).indicadores, 'victimas_fatales');
    await c.agente.put(`/api/org/indicadores/${victimas.id}/resultados/${anio}-T1`).set(h()).send({ analisis: 'x' }).expect(400);
    const r = await c.agente.put(`/api/org/indicadores/${victimas.id}/resultados/${anio}-02`).set(h()).send({ analisis: 'Siniestro por exceso de velocidad en curva; el conductor no había recibido formación.' }).expect(200);
    expect(r.body).toMatchObject({ valor: 1, estado: 'no_cumple' });
    await c.agente.post(`/api/org/indicadores/${victimas.id}/resultados/${anio}-02/accion`).set(h()).send({ descripcion: 'Curso de manejo defensivo', responsable: 'Líder PESV', fechaLimite: `${anio}-03-01` }).expect(400);
    const a = await c.agente
      .post(`/api/org/indicadores/${victimas.id}/resultados/${anio}-02/accion`)
      .set(h())
      .send({ descripcion: 'Curso de manejo defensivo para todos los conductores', responsable: 'Líder PESV', fechaLimite: `${anio + 1}-12-31` })
      .expect(201);
    await c.agente.post(`/api/org/indicadores/${victimas.id}/resultados/${anio}-02/accion`).set(h()).send({ descripcion: 'Otra acción', responsable: 'Líder PESV', fechaLimite: `${anio + 1}-12-31` }).expect(400);
    const acciones = await c.agente.get('/api/org/acciones').set(h()).expect(200);
    const lista = Array.isArray(acciones.body) ? acciones.body : acciones.body.acciones;
    expect(lista.some((x: { id: string }) => x.id === a.body.accionId)).toBe(true);
    const v = por((await consultar()).indicadores, 'victimas_fatales');
    expect(v.periodos[1]).toMatchObject({ origen: 'registrado', accionId: a.body.accionId, analisis: expect.stringContaining('exceso de velocidad') });
    expect(v.sinAnalizar).toEqual([]);
  });

  it('crea indicadores manuales con ficha y valida los resultados digitados', async () => {
    const base = { nombre: 'Personas que usan el cinturón', tipo: 'resultado', formula: 'Personas observadas con cinturón ÷ personas observadas × 100', unidad: 'porcentaje', frecuencia: 'semestral', sentido: 'mayor_o_igual', meta: 95, pasoNumero: 11 };
    await c.agente.post('/api/org/indicadores').set(h()).send({ ...base, alerta: 98 }).expect(400);
    const i = await c.agente.post('/api/org/indicadores').set(h()).send({ ...base, alerta: 90, responsable: 'Coordinador SST' }).expect(201);
    manual = i.body.id;
    await c.agente.put(`/api/org/indicadores/${manual}/resultados/${anio}-S1`).set(h()).send({}).expect(400);
    await c.agente.put(`/api/org/indicadores/${manual}/resultados/${anio}-S1`).set(h()).send({ numerador: 4, denominador: 0 }).expect(400);
    const r = await c.agente.put(`/api/org/indicadores/${manual}/resultados/${anio}-S1`).set(h()).send({ numerador: 46, denominador: 50 }).expect(200);
    expect(r.body).toMatchObject({ valor: 92, estado: 'en_riesgo' });
    await c.agente.put(`/api/org/indicadores/${manual}/resultados/${anio}-S2`).set(h()).send({ valor: 97 }).expect(200);
    const m = (await consultar()).indicadores.find((x) => x.id === manual)!;
    expect(m.periodos.map((p) => [p.valor, p.origen, p.estado])).toEqual([[92, 'manual', 'en_riesgo'], [97, 'manual', 'cumple']]);
    expect(m.ultimo).toMatchObject({ valor: 97, estado: 'cumple' });

    const ficha = await c.agente.get(`/api/org/indicadores/${manual}/ficha?anio=${anio}`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(ficha.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('FICHA TÉCNICA DEL INDICADOR');
      expect(texto).toContain('Personas que usan el cinturón');
      expect(texto).toContain('Coordinador SST');
    }
  });

  it('conecta las metas del PESV con un indicador para su seguimiento', async () => {
    const lista = (await consultar()).indicadores;
    const siniestros = por(lista, 'siniestros_viales');
    await c.agente.post('/api/org/metas').set(h()).send({ anio, objetivo: 'Sin indicador', meta: 1 }).expect(400);
    await c.agente.post('/api/org/metas').set(h()).send({ anio, objetivo: 'Reducir los siniestros viales', indicadorId: siniestros.id, meta: 2 }).expect(201);
    await c.agente.post('/api/org/metas').set(h()).send({ anio, objetivo: 'Uso del cinturón', indicadorId: manual, meta: 95 }).expect(201);
    await c.agente.post('/api/org/metas').set(h()).send({ anio, objetivo: 'Meta manual', indicador: 'Simulacros realizados', meta: 2, valorActual: 1, sentido: 'mayor_o_igual' }).expect(201);
    const metas = await c.agente.get(`/api/org/metas?anio=${anio}`).set(h()).expect(200);
    expect(metas.body.map((m: { objetivo: string; valorActual: number; estado: string; automatica: boolean }) => [m.objetivo, m.valorActual, m.estado, m.automatica])).toEqual([
      ['Reducir los siniestros viales', 1, 'cumple', true],
      ['Uso del cinturón', 97, 'cumple', true],
      ['Meta manual', 1, 'no_cumple', false],
    ]);
  });

  it('exporta el tablero en PDF y Excel y lo guarda como evidencia del paso 20', async () => {
    const pdf = await c.agente.get(`/api/org/indicadores/exportar?anio=${anio}`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain(`INDICADORES Y METAS DEL PESV ${anio}`);
      expect(texto).toContain('Reducir los siniestros viales');
      expect(texto).toContain('Análisis de resultados');
    }
    const xlsx = await c.agente.get(`/api/org/indicadores/exportar?anio=${anio}&formato=xlsx`).set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    expect(libro.worksheets.map((w) => w.name)).toEqual(['Fichas', 'Resultados', 'Metas']);
    const ev = await c.agente.post(`/api/org/indicadores/evidencia?anio=${anio}`).set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=20').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
  });
});
