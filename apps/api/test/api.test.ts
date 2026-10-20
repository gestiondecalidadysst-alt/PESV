import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp, hayBaseDeDatos, limpiar, registrar, type Cuenta } from './helpers.js';

describe.skipIf(!hayBaseDeDatos)('Fase 0 · catálogo, clasificación y registro', () => {
  let app: NestExpressApplication;
  const cuentas: Cuenta[] = [];

  beforeAll(async () => {
    app = await crearApp();
  });
  afterAll(async () => {
    await limpiar(cuentas);
    await app?.close();
  });

  it('reporta salud con base de datos conectada', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'conectada' });
  });

  it('expone el catálogo PESV filtrado por nivel sin sesión', async () => {
    const res = await request(app.getHttpServer()).get('/api/catalog/pesv?nivel=basico').expect(200);
    expect(res.body.pasos.filter((p: { aplica: boolean }) => p.aplica)).toHaveLength(18);
  });

  it('calcula la vista previa de clasificación', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/classification/preview')
      .send({ misionalidad: 1, vehiculos: 30, conductores: 4 })
      .expect(200);
    expect(res.body.nivel).toBe('estandar');
  });

  it('rechaza datos inválidos con mensajes en español', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/classification/preview')
      .send({ misionalidad: 3, vehiculos: -1, conductores: 0 })
      .expect(400);
    expect(res.body.errores.map((e: { campo: string }) => e.campo)).toEqual(expect.arrayContaining(['misionalidad', 'vehiculos']));
  });

  it('registra la cuenta y la organización con sus 24 pasos', async () => {
    const c = await registrar(app, { misionalidad: 1, vehiculos: 15, conductores: 18, modalidadId: 'carga' });
    cuentas.push(c);
    const yo = await c.agente.get('/api/auth/yo').expect(200);
    expect(yo.body.organizaciones[0].roles).toEqual(['admin', 'lider_pesv']);
    const pasos = await c.agente.get('/api/org/pasos').set('x-organization-id', c.orgId).expect(200);
    expect(pasos.body.filter((p: { estado: string }) => p.estado === 'no_aplica').map((p: { numero: number }) => p.numero)).toEqual([2, 11, 13, 18, 19, 21]);
  });

  it('no permite registrar dos veces el mismo NIT ni el mismo correo', async () => {
    const c = cuentas[0]!;
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ nombre: 'Otro', email: 'otro-unico@ejemplo.co', password: 'ClaveSegura123', organizacion: { nombre: 'Dup', nit: c.nit, clasificacion: { misionalidad: 2, vehiculos: 20, conductores: 5 } } })
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ nombre: 'Otro', email: c.email, password: 'ClaveSegura123', organizacion: { nombre: 'Dup', nit: '811111111', clasificacion: { misionalidad: 2, vehiculos: 20, conductores: 5 } } })
      .expect(409);
  });

  it('no registra organizaciones que no están obligadas', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/registro')
      .send({ nombre: 'Pequeña', email: 'pequena-unica@ejemplo.co', password: 'ClaveSegura123', organizacion: { nombre: 'Pequeña', nit: '800000001', clasificacion: { misionalidad: 2, vehiculos: 3, conductores: 1 } } })
      .expect(422);
  });
});
