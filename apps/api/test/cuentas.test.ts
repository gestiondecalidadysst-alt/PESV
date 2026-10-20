import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CorreoService } from '../src/correo/correo.module.js';
import { ErroresService } from '../src/errores/errores.module.js';
import { TableroService } from '../src/tablero/tablero.module.js';
import { consultarComoAdmin, crearApp, hayBaseDeDatos, limpiar, registrar, unico, type Cuenta } from './helpers.js';

const CLAVE = 'ClaveSegura123';
/** Texto único sin dígitos: los números se normalizan al agrupar errores. */
const sinDigitos = () => unico().replace(/\d/g, (d) => 'abcdefghij'[Number(d)]!);

describe.skipIf(!hayBaseDeDatos)('Cuentas, correo y errores', () => {
  let app: NestExpressApplication;
  let correo: CorreoService;
  let c: Cuenta;
  const cuentas: Cuenta[] = [];
  const emailsExtra: string[] = [];
  const h = () => ({ 'x-organization-id': c.orgId });

  /** Espera el correo (se envía en segundo plano) y lo devuelve. */
  async function esperarCorreo(para: string, asunto: RegExp) {
    for (let i = 0; i < 50; i++) {
      const m = [...correo.ultimosRegistrados()].reverse().find((x) => x.para === para && asunto.test(x.asunto));
      if (m) return m;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`No llegó el correo «${asunto}» a ${para}`);
  }
  const tokenDe = (texto: string) => /token=([A-Za-z0-9_-]+)/.exec(texto)![1]!;
  const ingresar = (email: string, password: string) => {
    const agente = request.agent(app.getHttpServer());
    return agente
      .post('/api/auth/ingresar')
      .send({ email, password })
      .then((r) => ({ agente, r }));
  };

  beforeAll(async () => {
    app = await crearApp();
    correo = app.get(CorreoService);
    c = await registrar(app);
    cuentas.push(c);
  });

  afterAll(async () => {
    await limpiar(cuentas, emailsExtra);
    await app?.close();
  });

  describe('recuperación de contraseña', () => {
    it('responde igual exista o no la cuenta y solo envía correo a cuentas reales', async () => {
      const antes = correo.ultimosRegistrados().length;
      const r1 = await request(app.getHttpServer()).post('/api/auth/recuperar').send({ email: `nadie${unico()}@ejemplo.co` }).expect(200);
      const r2 = await request(app.getHttpServer()).post('/api/auth/recuperar').send({ email: c.email }).expect(200);
      expect(r1.body).toEqual(r2.body);
      const m = await esperarCorreo(c.email, /Restablece tu contraseña/);
      expect(correo.ultimosRegistrados().length).toBe(antes + 1);
      expect(m.html).toContain('/restablecer?token=');
      const [fila] = await consultarComoAdmin<{ token_hash: string }>(
        'select t.token_hash from password_tokens t join users u on u.id = t.user_id where u.email = $1 and t.used_at is null',
        [c.email],
      );
      // En la base solo queda el hash, nunca el token del enlace.
      expect(m.texto).not.toContain(fila!.token_hash);
    });

    it('restablece la contraseña con el enlace una sola vez y cierra las sesiones anteriores', async () => {
      const m = await esperarCorreo(c.email, /Restablece tu contraseña/);
      const token = tokenDe(m.texto);
      const enlace = await request(app.getHttpServer()).get(`/api/auth/enlace?token=${token}`).expect(200);
      expect(enlace.body).toMatchObject({ email: c.email, proposito: 'recuperacion' });

      await c.agente.get('/api/auth/yo').expect(200);
      await request(app.getHttpServer()).post('/api/auth/restablecer').send({ token, password: 'NuevaClave456', confirmacion: 'OtraClave456' }).expect(400);
      const nuevo = request.agent(app.getHttpServer());
      const r = await nuevo.post('/api/auth/restablecer').send({ token, password: 'NuevaClave456', confirmacion: 'NuevaClave456' }).expect(200);
      expect(r.body.organizaciones[0].id).toBe(c.orgId);
      await nuevo.get('/api/auth/yo').expect(200);
      // La sesión que estaba abierta con la contraseña anterior deja de valer.
      await c.agente.get('/api/auth/yo').expect(401);
      await request(app.getHttpServer()).post('/api/auth/restablecer').send({ token, password: 'OtraMas789x', confirmacion: 'OtraMas789x' }).expect(400);
      await request(app.getHttpServer()).get(`/api/auth/enlace?token=${token}`).expect(404);
      expect((await ingresar(c.email, CLAVE)).r.status).toBe(401);
      const ok = await ingresar(c.email, 'NuevaClave456');
      expect(ok.r.status).toBe(200);
      c.agente = ok.agente;
      await esperarCorreo(c.email, /Tu contraseña cambió/);
    });

    it('cambia la contraseña con sesión iniciada y cierra las demás sesiones', async () => {
      const otro = await ingresar(c.email, 'NuevaClave456');
      await c.agente.post('/api/auth/cambiar-clave').send({ actual: 'equivocada1', password: 'Cambiada789', confirmacion: 'Cambiada789' }).expect(400);
      await c.agente.post('/api/auth/cambiar-clave').send({ actual: 'NuevaClave456', password: 'Cambiada789', confirmacion: 'Cambiada789' }).expect(200);
      await c.agente.get('/api/auth/yo').expect(200);
      await otro.agente.get('/api/auth/yo').expect(401);

      const tercero = await ingresar(c.email, 'Cambiada789');
      await c.agente.post('/api/auth/cerrar-sesiones').expect(200);
      await c.agente.get('/api/auth/yo').expect(200);
      await tercero.agente.get('/api/auth/yo').expect(401);
    });
  });

  describe('invitaciones', () => {
    it('invita a una persona sin cuenta con un enlace para crear su contraseña', async () => {
      const email = `invitada${unico()}@ejemplo.co`;
      emailsExtra.push(email);
      const res = await c.agente.post('/api/org/miembros').set(h()).send({ email, nombre: 'Rosa Invitada', roles: ['comite'] }).expect(201);
      // Sin SMTP configurado se devuelve el enlace para compartirlo por otro medio.
      expect(res.body).toMatchObject({ cuentaNueva: true, correoEnviado: false });
      expect(res.body.enlaceInvitacion).toMatch(/\/restablecer\?token=/);
      const m = await esperarCorreo(email, /Te invitaron/);
      expect(m.texto).toContain('Laura Prueba');
      await ingresar(email, 'cualquiera1').then(({ r }) => expect(r.status).toBe(401));

      const token = tokenDe(m.texto);
      expect((await request(app.getHttpServer()).get(`/api/auth/enlace?token=${token}`).expect(200)).body.proposito).toBe('invitacion');
      const agente = request.agent(app.getHttpServer());
      const r = await agente.post('/api/auth/restablecer').send({ token, password: 'MiClave2026', confirmacion: 'MiClave2026' }).expect(200);
      expect(r.body.organizaciones[0]).toMatchObject({ id: c.orgId, roles: ['comite'] });
    });

    it('avisa a una persona con cuenta que ahora tiene acceso a otra organización', async () => {
      const otra = await registrar(app);
      cuentas.push(otra);
      await c.agente.post('/api/org/miembros').set(h()).send({ email: otra.email, nombre: 'Laura Prueba', roles: ['auditor'] }).expect(201);
      await esperarCorreo(otra.email, /Ahora tienes acceso/);
    });
  });

  describe('notificaciones por correo', () => {
    it('crea reglas por defecto y encola el correo del evento para los roles indicados', async () => {
      const n = await c.agente.get('/api/org/notificaciones').set(h()).expect(200);
      expect(n.body.configurado).toBe(false);
      expect(n.body.reglas.find((r: { evento: string }) => r.evento === 'siniestro.creado')).toMatchObject({ activa: true, roles: ['admin', 'lider_pesv', 'comite'] });

      const siniestro = { ocurridoEn: new Date().toISOString(), lugar: 'Calle 10 # 4-20', placa: 'NOT123', conductorNombre: 'Pedro Pérez', conductorDocumento: '1012345678', descripcion: 'Golpe leve al parquear el vehículo.' };
      await c.agente.post('/api/org/siniestros').set(h()).send(siniestro).expect(201);
      const encolados = await consultarComoAdmin<{ recipient: string; subject: string }>(
        "select recipient, subject from email_outbox where organization_id = $1 and status = 'pendiente' order by recipient",
        [c.orgId],
      );
      // Administradora/líder y la integrante del comité invitada.
      expect(encolados.map((e) => e.recipient)).toContain(c.email);
      expect(encolados.length).toBe(2);
      expect(encolados[0]!.subject).toMatch(/Siniestro registrado: NOT123/);

      expect(await correo.despachar()).toBeGreaterThanOrEqual(2);
      const historial = await c.agente.get('/api/org/notificaciones/historial').set(h()).expect(200);
      expect(historial.body.filter((e: { estado: string }) => e.estado === 'enviado').length).toBe(2);

      await c.agente.put('/api/org/notificaciones').set(h()).send({ evento: 'siniestro.creado', roles: ['admin'], correos: ['seguridad@ejemplo.co'], activa: false }).expect(200);
      await c.agente.post('/api/org/siniestros').set(h()).send({ ...siniestro, placa: 'NOT124' }).expect(201);
      const [{ n: pendientes }] = await consultarComoAdmin<{ n: number }>("select count(*)::int as n from email_outbox where organization_id = $1 and status = 'pendiente'", [c.orgId]);
      expect(pendientes).toBe(0);
    });
  });

  describe('registro de errores', () => {
    it('un error inesperado responde 500 con código de solicitud y queda registrado con alerta', async () => {
      await consultarComoAdmin('update users set is_platform_admin = true where email = $1', [c.email]);
      const tablero = app.get(TableroService);
      const mensaje = `Falla simulada ${sinDigitos()}`;
      const espia = vi.spyOn(tablero, 'resumen').mockRejectedValueOnce(new Error(mensaje));
      const res = await c.agente.get('/api/org/tablero').set(h()).expect(500);
      espia.mockRestore();
      expect(res.headers['x-request-id']).toBeTruthy();
      expect(res.body.message).toContain(res.headers['x-request-id']);
      expect(JSON.stringify(res.body)).not.toContain('Falla simulada');

      const grupos = await c.agente.get('/api/plataforma/errores').expect(200);
      const g = grupos.body.find((x: { mensaje: string }) => x.mensaje === mensaje);
      expect(g).toMatchObject({ fuente: 'api', estado: 'abierto', ocurrencias: 1 });
      const ocurrencias = await c.agente.get(`/api/plataforma/errores/${g.huella}`).expect(200);
      expect(ocurrencias.body[0]).toMatchObject({ metodo: 'GET', ruta: '/api/org/tablero', estado: 500, idSolicitud: res.headers['x-request-id'], organizacionId: c.orgId });
      expect(ocurrencias.body[0].pila).toContain('Error');
      await esperarCorreo(c.email, /Error nuevo en API/);

      await c.agente.patch(`/api/plataforma/errores/${g.huella}`).send({ estado: 'resuelto' }).expect(200);
      await app.get(ErroresService).registrar({ fuente: 'api', mensaje, pila: ocurrencias.body[0].pila });
      const otra = await c.agente.get('/api/plataforma/errores?estado=abierto').expect(200);
      // Volvió a aparecer: se reabre (el aviso se limita a uno por hora).
      expect(otra.body.find((x: { huella: string }) => x.huella === g.huella)).toMatchObject({ estado: 'abierto', ocurrencias: 2, ultimas24h: 2 });
    });

    it('los errores esperados no se registran como fallas', async () => {
      const mal = await request(app.getHttpServer()).post('/api/auth/ingresar').set('content-type', 'application/json').send('{"email": ').expect(400);
      expect(mal.body.message).toBe('El contenido enviado no es un JSON válido');
      await c.agente.get('/api/org/siniestros/00000000-0000-4000-8000-000000000000').set(h()).expect(404);
      const [{ n }] = await consultarComoAdmin<{ n: number }>("select count(*)::int as n from error_events where created_at > now() - interval '1 minute' and status < 500");
      expect(n).toBe(0);
    });

    it('recibe errores del navegador sin sesión y solo los administradores de la plataforma los consultan', async () => {
      const mensaje = `TypeError: x is undefined ${sinDigitos()}`;
      await request(app.getHttpServer()).post('/api/errores/web').send({ mensaje, url: 'https://pesv.ejemplo.co/flota?org=1', pila: 'at Flota (Flota.tsx:10:5)' }).expect(204);
      const [g] = await consultarComoAdmin<{ source: string; path: string }>(
        'select g.source, e.path from error_groups g join error_events e on e.fingerprint = g.fingerprint where g.message = $1',
        [mensaje],
      );
      expect(g).toMatchObject({ source: 'web', path: '/flota' });
      const otra = await registrar(app);
      cuentas.push(otra);
      await otra.agente.get('/api/plataforma/errores').expect(403);
    });
  });
});
