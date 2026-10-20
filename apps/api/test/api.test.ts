import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

// Requiere una base migrada y sembrada: DATABASE_URL (rol pesv_app) y DATABASE_ADMIN_URL (dueño,
// solo para limpiar). Ver README → "Pruebas".
const adminUrl = process.env.DATABASE_ADMIN_URL;

describe.skipIf(!process.env.DATABASE_URL || !adminUrl)('API PESV', () => {
  let app: INestApplication;
  const nit = `9${Date.now().toString().slice(-8)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query('delete from organizations where nit = $1', [nit]);
    await admin.end();
  });

  it('reporta salud con base de datos conectada', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ estado: 'ok', baseDeDatos: 'conectada' });
  });

  it('expone el catálogo PESV filtrado por nivel', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/catalog/pesv?nivel=basico')
      .expect(200);
    expect(res.body.pasos).toHaveLength(24);
    expect(res.body.pasos.filter((p: { aplica: boolean }) => p.aplica)).toHaveLength(18);
  });

  it('calcula la vista previa de clasificación', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/classification/preview')
      .send({ misionalidad: 1, vehiculos: 30, conductores: 4 })
      .expect(200);
    expect(res.body.nivel).toBe('estandar');
    expect(res.body.pasosAplicables).toHaveLength(22);
  });

  it('rechaza datos inválidos con mensajes en español', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/classification/preview')
      .send({ misionalidad: 3, vehiculos: -1, conductores: 0 })
      .expect(400);
    const campos = res.body.errores.map((e: { campo: string }) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['misionalidad', 'vehiculos']));
  });

  it('crea la organización, inicializa los 24 pasos y aísla sus datos', async () => {
    const creada = await request(app.getHttpServer())
      .post('/api/organizations')
      .send({
        nombre: 'Transportes Prueba SAS',
        nit,
        clasificacion: { misionalidad: 1, vehiculos: 15, conductores: 18, modalidadId: 'carga' },
      })
      .expect(201);
    const id: string = creada.body.organizacion.id;
    expect(creada.body.clasificacion.level).toBe('basico');

    const detalle = await request(app.getHttpServer())
      .get(`/api/organizations/${id}`)
      .set('x-organization-id', id)
      .expect(200);
    expect(detalle.body.resumen).toMatchObject({ aplicables: 18, pendientes: 18, hechos: 0 });

    const pasos = await request(app.getHttpServer())
      .get(`/api/organizations/${id}/steps`)
      .set('x-organization-id', id)
      .expect(200);
    expect(
      pasos.body
        .filter((p: { estado: string }) => p.estado === 'no_aplica')
        .map((p: { numero: number }) => p.numero),
    ).toEqual([2, 11, 13, 18, 19, 21]);

    await request(app.getHttpServer())
      .get(`/api/organizations/${id}`)
      .set('x-organization-id', '00000000-0000-4000-8000-000000000000')
      .expect(403);
  });

  it('no permite dos organizaciones con el mismo NIT', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .send({
        nombre: 'Duplicada',
        nit,
        clasificacion: { misionalidad: 2, vehiculos: 20, conductores: 5 },
      })
      .expect(409);
  });

  it('no registra organizaciones que no están obligadas', async () => {
    await request(app.getHttpServer())
      .post('/api/organizations')
      .send({
        nombre: 'Pequeña',
        nit: '800000001',
        clasificacion: { misionalidad: 2, vehiculos: 3, conductores: 1 },
      })
      .expect(422);
  });
});
