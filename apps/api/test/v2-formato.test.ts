import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, PNG, registrar, textoPdf, type Cuenta } from './helpers.js';

describe.skipIf(!hayBaseDeDatos)('V2 · formato documental', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app);
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('acepta solo logos PNG o JPG reales', async () => {
    await c.agente.get('/api/org/logo').set(h()).expect(404);
    const falso = await c.agente.post('/api/org/logo').set(h()).attach('logo', Buffer.from('<svg></svg>'), { filename: 'logo.png', contentType: 'image/png' }).expect(400);
    expect(falso.body.message).toMatch(/PNG o JPG/);
    await c.agente.post('/api/org/logo').set(h()).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' }).expect(201);
    const logo = await c.agente.get('/api/org/logo').set(h()).buffer(true).parse(binario).expect(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(logo.body as Buffer, PNG)).toBe(0);
  });

  it('configura el formato general y el de cada documento', async () => {
    const inicial = await c.agente.get('/api/org/formato').set(h()).expect(200);
    expect(inicial.body.tieneLogo).toBe(true);
    expect(inicial.body.documentos.find((d: { tipo: string }) => d.tipo === 'matriz_riesgos')).toMatchObject({ codigo: 'PESV-MT-01', version: 1, personalizado: false });

    await c.agente
      .put('/api/org/formato')
      .set(h())
      .send({ prefijo: 'sst', pieTexto: 'Copia controlada', colorPrimario: '#1d4e89', elaboro: { nombre: 'Laura Prueba', cargo: 'Líder PESV' }, reviso: { nombre: 'Jorge Díaz', cargo: 'Coordinador SST' }, aprobo: { nombre: 'Marta Gerente', cargo: 'Gerente general' } })
      .expect(200);
    await c.agente.put('/api/org/formato').set(h()).send({ prefijo: 'MAL PREFIJO', colorPrimario: 'azul', elaboro: {}, reviso: {}, aprobo: {} }).expect(400);
    await c.agente
      .put('/api/org/formato/documentos')
      .set(h())
      .send({ tipo: 'matriz_riesgos', codigo: 'sst-mt-07', version: 3, fechaVersion: '2026-10-01', elaboro: {}, reviso: {}, aprobo: { nombre: 'Gerente de operaciones', cargo: 'Operaciones' } })
      .expect(200);
    const f = await c.agente.get('/api/org/formato').set(h()).expect(200);
    expect(f.body.general).toMatchObject({ prefijo: 'SST', colorPrimario: '#1D4E89' });
    expect(f.body.documentos.find((d: { tipo: string }) => d.tipo === 'plan_trabajo').codigo).toBe('SST-PL-01');
    expect(f.body.documentos.find((d: { tipo: string }) => d.tipo === 'matriz_riesgos')).toMatchObject({ codigo: 'SST-MT-07', version: 3, personalizado: true });
  });

  it('genera el PDF con encabezado y pie en cada página', async () => {
    const res = await c.agente.get('/api/org/formato/vista-previa?tipo=matriz_riesgos').set(h()).buffer(true).parse(binario).expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const texto = textoPdf(pdf);
    if (texto !== null) {
      expect(texto).toContain('SST-MT-07');
      expect(texto).toMatch(/Versión:\s+3/);
      expect(texto).toMatch(/Página 1 de 1/);
      // Responsable del documento si se definió, y si no el general.
      expect(texto).toContain('Gerente de operaciones');
      expect(texto).toContain('Laura Prueba');
      expect(texto).toContain('Copia controlada');
    }
  });

  it('genera el Excel con el mismo encabezado, logo y firmas', async () => {
    const res = await c.agente.get('/api/org/formato/vista-previa?tipo=plan_trabajo&formato=xlsx').set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body as Buffer);
    const ws = libro.worksheets[0]!;
    expect(String(ws.getCell(1, 2).value)).toContain('NIT');
    expect(String(ws.getCell(3, 2).value)).toBe('PLAN ANUAL DE TRABAJO DEL PESV');
    expect(String(ws.getCell(1, 4).value)).toBe('Código: SST-PL-01');
    expect(ws.getImages()).toHaveLength(1);
    const textos: string[] = [];
    ws.eachRow((r) => r.eachCell((cell) => textos.push(String(cell.value))));
    expect(textos.join(' ')).toContain('Marta Gerente · Gerente general');
  });
});
