import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

describe.skipIf(!hayBaseDeDatos)('V2 · documentos controlados', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  let politica = '';

  beforeAll(async () => {
    app = await crearApp();
    // Nivel estándar: aplican los pasos 3 y 19.
    c = await registrar(app, { misionalidad: 2, vehiculos: 64, conductores: 30 });
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('crea la política desde la plantilla con los datos de la organización y código sugerido', async () => {
    await c.agente.post('/api/org/documentos').set(h()).send({ clase: 'politica', titulo: 'Política', plantilla: 'no-existe' }).expect(400);
    const r = await c.agente
      .post('/api/org/documentos')
      .set(h())
      .send({ clase: 'politica', titulo: 'Política de seguridad vial', plantilla: 'politica_seguridad_vial', datosPlantilla: { representante: 'Marta Gerente', municipio: 'Montería' }, responsable: 'Líder PESV', retencion: '5 años' })
      .expect(201);
    politica = r.body.id;
    expect(r.body.codigo).toBe('PESV-PO-01');
    const d = await c.agente.get(`/api/org/documentos/${politica}`).set(h()).expect(200);
    expect(d.body).toMatchObject({ pasoNumero: 3, vigente: null, enCurso: { version: 1, estado: 'borrador' } });
    const contenido: string = d.body.historial[0].contenido;
    expect(contenido).toContain('Marta Gerente');
    expect(contenido).toContain('Montería');
    expect(contenido).not.toContain('{{');
    // El siguiente de la misma clase toma el consecutivo; un código repetido se rechaza.
    const otra = await c.agente.post('/api/org/documentos').set(h()).send({ clase: 'politica', titulo: 'Política de alcohol y drogas', contenido: '# Política\n\nTexto.' }).expect(201);
    expect(otra.body.codigo).toBe('PESV-PO-02');
    await c.agente.post('/api/org/documentos').set(h()).send({ clase: 'procedimiento', titulo: 'Repetido', codigo: 'pesv-po-01' }).expect(409);
  });

  it('pasa por revisión, devolución y aprobación con firma', async () => {
    await c.agente.post(`/api/org/documentos/${politica}/aprobar`).set(h()).send({ password: 'ClaveSegura123' }).expect(400);
    await c.agente.post(`/api/org/documentos/${politica}/enviar`).set(h()).expect(201);
    await c.agente.put(`/api/org/documentos/${politica}/borrador`).set(h()).send({ contenido: 'x' }).expect(400);
    await c.agente.post(`/api/org/documentos/${politica}/devolver`).set(h()).send({ nota: 'Incluir el compromiso con los contratistas' }).expect(201);
    const devuelto = await c.agente.get(`/api/org/documentos/${politica}`).set(h()).expect(200);
    expect(devuelto.body.enCurso).toMatchObject({ estado: 'borrador', notaDevolucion: 'Incluir el compromiso con los contratistas' });
    const contenido = `${devuelto.body.historial[0].contenido}\n\n- Exigir a los contratistas el cumplimiento de esta política.`;
    await c.agente.put(`/api/org/documentos/${politica}/borrador`).set(h()).send({ contenido }).expect(200);
    await c.agente.post(`/api/org/documentos/${politica}/enviar`).set(h()).expect(201);
    await c.agente.post(`/api/org/documentos/${politica}/revisar`).set(h()).expect(201);
    await c.agente.post(`/api/org/documentos/${politica}/aprobar`).set(h()).send({ password: 'otra' }).expect(401);
    const a = await c.agente.post(`/api/org/documentos/${politica}/aprobar`).set(h()).send({ password: 'ClaveSegura123' }).expect(201);
    expect(a.body.version).toBe(1);

    // La evidencia del paso 3 queda aprobada directamente.
    const evidencias = await c.agente.get('/api/org/evidencias?paso=3').set(h()).expect(200);
    expect(evidencias.body.find((e: { id: string }) => e.id === a.body.evidenciaId)).toMatchObject({ estado: 'aprobada' });
    const d = await c.agente.get(`/api/org/documentos/${politica}`).set(h()).expect(200);
    expect(d.body).toMatchObject({ enCurso: null, sinDivulgar: true, vigente: { version: 1, estado: 'aprobado', aprobo: 'Laura Prueba', reviso: 'Laura Prueba' } });

    const pdf = await c.agente.get(`/api/org/documentos/${politica}/versiones/1/pdf`).set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-PO-01');
      expect(texto).toContain('POLÍTICA DE SEGURIDAD VIAL');
      expect(texto).toContain('Firmado electrónicamente');
      expect(texto).toContain('contratistas el cumplimiento');
      expect(texto).not.toContain('BORRADOR');
    }
  });

  it('registra la divulgación y una nueva versión deja la anterior obsoleta', async () => {
    await c.agente.post(`/api/org/documentos/${politica}/divulgacion`).set(h()).send({ fecha: '2020-01-01', medio: 'Correo' }).expect(400);
    await c.agente.post(`/api/org/documentos/${politica}/divulgacion`).set(h()).send({ fecha: new Date().toISOString().slice(0, 10), medio: 'Correo a todos y cartelera' }).expect(201);
    await c.agente.post(`/api/org/documentos/${politica}/nueva-version`).set(h()).expect(201);
    await c.agente.post(`/api/org/documentos/${politica}/nueva-version`).set(h()).expect(400);
    // La versión 2 necesita la descripción del cambio.
    await c.agente.post(`/api/org/documentos/${politica}/enviar`).set(h()).expect(400);
    await c.agente.put(`/api/org/documentos/${politica}/borrador`).set(h()).send({ resumenCambios: 'Se agrega el compromiso con la movilidad sostenible' }).expect(200);
    await c.agente.post(`/api/org/documentos/${politica}/enviar`).set(h()).expect(201);
    const borrador = await c.agente.get(`/api/org/documentos/${politica}/versiones/2/pdf`).set(h()).buffer(true).parse(binario).expect(200);
    const tb = textoPdf(borrador.body as Buffer);
    if (tb !== null) expect(tb).toContain('EN REVISIÓN');
    await c.agente.post(`/api/org/documentos/${politica}/aprobar`).set(h()).send({ password: 'ClaveSegura123' }).expect(201);
    const d = await c.agente.get(`/api/org/documentos/${politica}`).set(h()).expect(200);
    expect(d.body.historial.map((v: { version: number; estado: string }) => [v.version, v.estado])).toEqual([[2, 'aprobado'], [1, 'obsoleto']]);
    expect(d.body.sinDivulgar).toBe(true);
    await c.agente.delete(`/api/org/documentos/${politica}`).set(h()).expect(400);
  });

  it('admite documentos con archivo adjunto en lugar de texto', async () => {
    const r = await c.agente.post('/api/org/documentos').set(h()).send({ clase: 'procedimiento', titulo: 'Procedimiento de inspección', pasoNumero: 16 }).expect(201);
    await c.agente.post(`/api/org/documentos/${r.body.id}/enviar`).set(h()).expect(400);
    await c.agente.post(`/api/org/documentos/${r.body.id}/borrador/archivo`).set(h()).attach('archivo', Buffer.from('%PDF-1.4 prueba'), { filename: 'procedimiento.pdf', contentType: 'application/pdf' }).expect(201);
    await c.agente.post(`/api/org/documentos/${r.body.id}/enviar`).set(h()).expect(201);
    await c.agente.post(`/api/org/documentos/${r.body.id}/aprobar`).set(h()).send({ password: 'ClaveSegura123' }).expect(201);
    const archivo = await c.agente.get(`/api/org/documentos/${r.body.id}/versiones/1/archivo`).set(h()).buffer(true).parse(binario).expect(200);
    expect((archivo.body as Buffer).toString()).toContain('prueba');
    await c.agente.get(`/api/org/documentos/${r.body.id}/versiones/1/pdf`).set(h()).expect(400);
    const sinUsar = await c.agente.post('/api/org/documentos').set(h()).send({ clase: 'formato', titulo: 'Formato de prueba' }).expect(201);
    await c.agente.delete(`/api/org/documentos/${sinUsar.body.id}`).set(h()).expect(204);
  });

  it('genera la lista maestra en PDF y Excel y la guarda como evidencia del paso 19', async () => {
    const l = await c.agente.get('/api/org/documentos').set(h()).expect(200);
    expect(l.body.resumen).toMatchObject({ total: 3, vigentes: 2, borradores: 1 });
    expect(l.body.tienePolitica).toBe(true);
    const pdf = await c.agente.get('/api/org/documentos/lista-maestra').set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-LM-01');
      expect(texto).toContain('PESV-PO-01');
      expect(texto).toContain('PESV-PR-01');
    }
    const xlsx = await c.agente.get('/api/org/documentos/lista-maestra?formato=xlsx').set(h()).buffer(true).parse(binario).expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(xlsx.body as Buffer);
    const textos: string[] = [];
    libro.worksheets[0]!.eachRow((f) => f.eachCell((celda) => textos.push(String(celda.value))));
    expect(textos.join(' | ')).toContain('Política de seguridad vial');
    const ev = await c.agente.post('/api/org/documentos/lista-maestra/evidencia').set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=19').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
  });
});
