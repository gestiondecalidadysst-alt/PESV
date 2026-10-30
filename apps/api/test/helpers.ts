import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

/** PNG de 1×1 píxel. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Texto de un PDF (con pdftotext si está instalado; si no, null y se omite la comprobación). */
export function textoPdf(datos: Buffer): string | null {
  try {
    const dir = mkdtempSync(path.join(tmpdir(), 'pesv-pdf-'));
    const archivo = path.join(dir, 'doc.pdf');
    writeFileSync(archivo, datos);
    return execFileSync('pdftotext', ['-layout', archivo, '-'], { encoding: 'utf8' });
  } catch {
    return null;
  }
}

export const binario = (res: { on: (e: string, f: (c?: Buffer) => void) => void; setEncoding: (e: string) => void }, cb: (err: Error | null, body: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c?: Buffer) => partes.push(c!));
  res.on('end', () => cb(null, Buffer.concat(partes)));
};

/** Sube una evidencia del paso y la aprueba; devuelve su id. */
export async function evidenciaAprobada(c: Cuenta, paso: number, titulo = `Evidencia del paso ${paso}`) {
  const h = { 'x-organization-id': c.orgId };
  const e = await c.agente.post('/api/org/evidencias').set(h).field('titulo', titulo).field('pasoNumero', String(paso)).attach('archivo', Buffer.from('%PDF-1.4 x'), { filename: 'e.pdf', contentType: 'application/pdf' }).expect(201);
  await c.agente.post(`/api/org/evidencias/${e.body.id}/decision`).set(h).send({ decision: 'aprobar' }).expect(201);
  return e.body.id as string;
}

/** Crea un documento controlado del paso, lo envía y lo aprueba con la firma del líder. */
export async function documentoAprobado(c: Cuenta, paso: number, clase: string, titulo: string) {
  const h = { 'x-organization-id': c.orgId };
  const d = await c.agente.post('/api/org/documentos').set(h).send({ clase, titulo, pasoNumero: paso, contenido: `# ${titulo}\n\nContenido del documento.` }).expect(201);
  await c.agente.post(`/api/org/documentos/${d.body.id}/enviar`).set(h).expect(201);
  await c.agente.post(`/api/org/documentos/${d.body.id}/aprobar`).set(h).send({ password: 'ClaveSegura123' }).expect(201);
  return d.body.id as string;
}

/** Verifica como líder un requisito de registro con una evidencia aprobada del paso. */
export async function verificarRequisito(c: Cuenta, paso: number, requisito: string, evidenciaId: string) {
  await c.agente
    .post(`/api/org/pasos/${paso}/requisitos/${requisito}`)
    .set({ 'x-organization-id': c.orgId })
    .send({ estado: 'cumple', nota: 'Verificado en la revisión del líder', evidenciaId })
    .expect(201);
}

/** Deja el paso 1 con todos sus requisitos: acta de designación y competencia del líder. */
export async function cumplirPaso1(c: Cuenta) {
  await documentoAprobado(c, 1, 'acta', 'Acta de designación del líder del PESV');
  await verificarRequisito(c, 1, 'P1.2', await evidenciaAprobada(c, 1, 'Perfil de competencia del líder'));
}

/** Deja el paso 2 con todos sus requisitos: comité de tres con el líder y acta de conformación. */
export async function cumplirPaso2(c: Cuenta) {
  const h = { 'x-organization-id': c.orgId };
  const yo = await c.agente.get('/api/auth/yo').expect(200);
  await c.agente.post('/api/org/comite/miembros').set(h).send({ usuarioId: yo.body.usuario.id, nombre: 'Laura Prueba', rolComite: 'presidente' }).expect(201);
  await c.agente.post('/api/org/comite/miembros').set(h).send({ nombre: 'Carlos Secretario', rolComite: 'secretario' }).expect(201);
  await c.agente.post('/api/org/comite/miembros').set(h).send({ nombre: 'María Integrante' }).expect(201);
  await documentoAprobado(c, 2, 'acta', 'Acta de conformación del comité de seguridad vial');
}
