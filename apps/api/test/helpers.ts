import 'reflect-metadata';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/main.js';

export const hayBaseDeDatos = !!process.env.DATABASE_URL && !!process.env.DATABASE_ADMIN_URL;

export async function crearApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configurarApp(app);
  await app.init();
  return app;
}

let contador = 0;
export const unico = () => `${Date.now().toString().slice(-6)}${(contador++).toString().padStart(3, '0')}`;

export interface Cuenta {
  agente: ReturnType<typeof request.agent>;
  orgId: string;
  email: string;
  nit: string;
}

/** Registra una cuenta con su organización y devuelve un agente con la sesión iniciada. */
export async function registrar(
  app: NestExpressApplication,
  clasificacion: Record<string, unknown> = { misionalidad: 2, vehiculos: 20, conductores: 12 },
): Promise<Cuenta> {
  const id = unico();
  const email = `prueba${id}@ejemplo.co`;
  const nit = `8${id}`.slice(0, 10);
  const agente = request.agent(app.getHttpServer());
  const res = await agente
    .post('/api/auth/registro')
    .send({ nombre: 'Laura Prueba', email, password: 'ClaveSegura123', organizacion: { nombre: `Empresa ${id}`, nit, clasificacion } })
    .expect(201);
  return { agente, orgId: res.body.organizacionId, email, nit };
}

export async function limpiar(cuentas: Cuenta[], emailsExtra: string[] = []) {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  await admin.query('delete from organizations where id = any($1)', [cuentas.map((c) => c.orgId)]);
  await admin.query('delete from users where email = any($1)', [[...cuentas.map((c) => c.email), ...emailsExtra]]);
  await admin.end();
}

export async function consultarComoAdmin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const admin = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await admin.connect();
  try {
    return (await admin.query(sql, params)).rows as T[];
  } finally {
    await admin.end();
  }
}

export interface ServidorDePrueba {
  url: string;
  peticiones: { url: string; headers: IncomingMessage['headers']; cuerpo: string }[];
  responder: (estado: number, cuerpo: unknown) => void;
  cerrar: () => Promise<void>;
}

/** Servidor HTTP local que registra lo que recibe (simula n8n o un proveedor de IA). */
export async function servidorDePrueba(): Promise<ServidorDePrueba> {
  const peticiones: ServidorDePrueba['peticiones'] = [];
  let estado = 200;
  let respuesta: unknown = { ok: true };
  const server: Server = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => (cuerpo += c));
    req.on('end', () => {
      peticiones.push({ url: req.url ?? '', headers: req.headers, cuerpo });
      res.writeHead(estado, { 'content-type': 'application/json' });
      res.end(typeof respuesta === 'function' ? JSON.stringify((respuesta as (b: string) => unknown)(cuerpo)) : JSON.stringify(respuesta));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    peticiones,
    responder: (e, c) => {
      estado = e;
      respuesta = c;
    },
    cerrar: () => new Promise((r) => server.close(() => r())),
  };
}
