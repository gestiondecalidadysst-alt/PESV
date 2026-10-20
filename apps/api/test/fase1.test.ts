import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { firmar } from '../src/eventos/eventos.service.js';
import { EventosService } from '../src/eventos/eventos.service.js';
import {
  consultarComoAdmin,
  crearApp,
  hayBaseDeDatos,
  limpiar,
  registrar,
  servidorDePrueba,
  unico,
  type Cuenta,
  type ServidorDePrueba,
} from './helpers.js';

const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hayBaseDeDatos)('Fase 1', () => {
  let app: NestExpressApplication;
  let lider: Cuenta;
  let otra: Cuenta;
  const emailConductor = `conductor${unico()}@ejemplo.co`;
  let ia: ServidorDePrueba;
  let n8n: ServidorDePrueba;
  const org = () => ({ 'x-organization-id': lider.orgId });

  beforeAll(async () => {
    app = await crearApp();
    lider = await registrar(app, { misionalidad: 2, vehiculos: 20, conductores: 12 });
    otra = await registrar(app);
    ia = await servidorDePrueba();
    n8n = await servidorDePrueba();
  });

  afterAll(async () => {
    await limpiar([lider, otra], [emailConductor]);
    await ia?.cerrar();
    await n8n?.cerrar();
    await app?.close();
  });

  describe('autenticación y roles', () => {
    it('rechaza contraseñas incorrectas y acepta la correcta', async () => {
      await request(app.getHttpServer()).post('/api/auth/ingresar').send({ email: lider.email, password: 'NoEsLaClave99' }).expect(401);
      const res = await request(app.getHttpServer()).post('/api/auth/ingresar').send({ email: lider.email, password: 'ClaveSegura123' }).expect(200);
      expect(res.headers['set-cookie']?.[0]).toMatch(/pesv_sesion=.*HttpOnly/);
    });

    it('exige sesión y membresía en la organización', async () => {
      await request(app.getHttpServer()).get('/api/org').set(org()).expect(401);
      await otra.agente.get('/api/org').set(org()).expect(403);
      await lider.agente.get('/api/org').expect(400);
      await lider.agente.get('/api/org').set(org()).expect(200);
    });

    it('invita a un conductor que solo puede hacer preoperacionales', async () => {
      await lider.agente
        .post('/api/org/miembros')
        .set(org())
        .send({ email: emailConductor, nombre: 'Juan Conductor', roles: ['conductor'], passwordTemporal: 'Temporal12345' })
        .expect(201);
      const conductor = request.agent(app.getHttpServer());
      await conductor.post('/api/auth/ingresar').send({ email: emailConductor, password: 'Temporal12345' }).expect(200);
      await conductor.get('/api/org/pasos').set(org()).expect(403);
      await conductor.get('/api/org/vehiculos').set(org()).expect(200);
      const miembros = await lider.agente.get('/api/org/miembros').set(org()).expect(200);
      expect(miembros.body).toHaveLength(2);
    });

    it('no deja quitar al único administrador', async () => {
      const yo = await lider.agente.get('/api/auth/yo').expect(200);
      await lider.agente.delete(`/api/org/miembros/${yo.body.usuario.id}`).set(org()).expect(400);
    });
  });

  describe('flota, preoperacional y alertas', () => {
    let vehiculoId: string;

    it('registra vehículos y conductores, y no repite placas', async () => {
      const v = await lider.agente
        .post('/api/org/vehiculos')
        .set(org())
        .send({ placa: 'abc123', tipo: 'camioneta', propiedad: 'propio', soatVence: hoyMas(-3), rtmVence: hoyMas(10) })
        .expect(201);
      vehiculoId = v.body.id;
      expect(v.body.placa).toBe('ABC123');
      expect(v.body.documentos).toEqual({ soat: 'vencido', rtm: 'por_vencer' });
      await lider.agente.post('/api/org/vehiculos').set(org()).send({ placa: 'ABC123', tipo: 'automovil', propiedad: 'propio' }).expect(409);
      await lider.agente
        .post('/api/org/conductores')
        .set(org())
        .send({ documento: '1067000111', nombre: 'Carlos Pérez', licenciaVence: hoyMas(12), consentimientoDatos: true })
        .expect(201);
      await lider.agente.post('/api/org/conductores').set(org()).send({ documento: '1067000222', nombre: 'Sin Consentimiento' }).expect(400);
    });

    it('lista alertas de vencimiento ordenadas por urgencia', async () => {
      const res = await lider.agente.get('/api/org/alertas').set(org()).expect(200);
      expect(res.body[0]).toMatchObject({ titulo: 'SOAT vencido', severidad: 'critica' });
      expect(res.body.map((a: { titulo: string }) => a.titulo)).toEqual(
        expect.arrayContaining(['Revisión técnico-mecánica por vencer', 'Licencia de conducción por vencer']),
      );
    });

    it('una falla crítica deja el vehículo no apto y el reenvío no duplica', async () => {
      const { body } = await lider.agente.get(`/api/org/inspecciones/plantilla/${vehiculoId}`).set(org()).expect(200);
      const items = body.plantilla.items.map((i: { codigo: string }) => ({ codigo: i.codigo, ok: i.codigo !== 'frenos', nota: i.codigo === 'frenos' ? 'Pedal esponjoso' : undefined }));
      const envio = { vehiculoId, odometroKm: 45000, items, clientId: `cel-${unico()}`, realizadaEn: new Date().toISOString() };
      const primera = await lider.agente.post('/api/org/inspecciones').set(org()).send(envio).expect(201);
      expect(primera.body).toMatchObject({ duplicada: false, inspeccion: { result: 'falla_critica' } });
      const segunda = await lider.agente.post('/api/org/inspecciones').set(org()).send(envio).expect(201);
      expect(segunda.body.duplicada).toBe(true);
      const vehiculos = await lider.agente.get('/api/org/vehiculos').set(org()).expect(200);
      expect(vehiculos.body[0]).toMatchObject({ estado: 'no_apto', odometroKm: 45000 });
      await lider.agente.post('/api/org/inspecciones').set(org()).send({ ...envio, clientId: `cel-${unico()}`, items: items.slice(1) }).expect(400);
    });

    it('el tablero resume cumplimiento, flota y preoperacionales del día', async () => {
      const res = await lider.agente.get('/api/org/tablero').set(org()).expect(200);
      expect(res.body.flota).toMatchObject({ vehiculos: 1, noAptos: 1, conductoresActivos: 1 });
      expect(res.body.preoperacionalesHoy).toMatchObject({ esperados: 1, realizados: 1, fallasCriticas: 1 });
    });
  });

  describe('evidencias y cumplimiento', () => {
    let evidenciaId: string;

    it('sube una evidencia, la vincula a ISO 39001 y pasa el paso a "en curso"', async () => {
      const res = await lider.agente
        .post('/api/org/evidencias')
        .set(org())
        .field('titulo', 'Acta de designación del líder')
        .field('pasoNumero', '1')
        .attach('archivo', Buffer.from('%PDF-1.4 prueba'), { filename: 'Designación líder (firmada).pdf', contentType: 'application/pdf' })
        .expect(201);
      evidenciaId = res.body.id;
      expect(res.body.originalFilename).toBe('Designacion_lider_firmada.pdf');
      const lista = await lider.agente.get('/api/org/evidencias?paso=1').set(org()).expect(200);
      expect(lista.body[0]).toMatchObject({ estado: 'borrador', clausulasIso: ['5.3'] });
      const pasos = await lider.agente.get('/api/org/pasos').set(org()).expect(200);
      expect(pasos.body[0]).toMatchObject({ estado: 'en_curso', evidencias: { enRevision: 1 } });
    });

    it('solo deja marcar el paso como hecho con evidencia aprobada', async () => {
      await lider.agente.patch('/api/org/pasos/1').set(org()).send({ estado: 'hecho' }).expect(422);
      await lider.agente.post(`/api/org/evidencias/${evidenciaId}/decision`).set(org()).send({ decision: 'rechazar' }).expect(400);
      await lider.agente.post(`/api/org/evidencias/${evidenciaId}/decision`).set(org()).send({ decision: 'aprobar' }).expect(201);
      await lider.agente.patch('/api/org/pasos/1').set(org()).send({ estado: 'hecho' }).expect(200);
      const detalle = await lider.agente.get('/api/org').set(org()).expect(200);
      expect(detalle.body.resumen).toMatchObject({ hechos: 1, aplicables: 18, porcentajeCumplimiento: 6 });
    });

    it('descarga el archivo y no deja subir evidencias a pasos que no aplican', async () => {
      const archivo = await lider.agente.get(`/api/org/evidencias/${evidenciaId}/archivo?org=${lider.orgId}`).expect(200);
      expect(archivo.headers['content-type']).toBe('application/pdf');
      await lider.agente
        .post('/api/org/evidencias')
        .set(org())
        .field('titulo', 'No aplica')
        .field('pasoNumero', '11')
        .attach('archivo', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
        .expect(400);
    });
  });

  describe('reclasificación', () => {
    it('propone y aplica un cambio de nivel cuando cambian los registros', async () => {
      for (let i = 0; i < 50; i++) {
        await lider.agente.post('/api/org/vehiculos').set(org()).send({ placa: `FLT${String(i).padStart(3, '0')}`, tipo: 'automovil', propiedad: 'propio' }).expect(201);
      }
      const propuesta = await lider.agente.get('/api/org/reclasificacion').set(org()).expect(200);
      expect(propuesta.body).toMatchObject({ registrados: { vehiculos: 51 }, cambiaNivel: true, propuesta: { nivel: 'estandar' } });
      await lider.agente.post('/api/org/reclasificacion').set(org()).expect(201);
      const pasos = await lider.agente.get('/api/org/pasos').set(org()).expect(200);
      expect(pasos.body.filter((p: { estado: string }) => p.estado === 'no_aplica').map((p: { numero: number }) => p.numero)).toEqual([11, 21]);
      expect(pasos.body[0].estado).toBe('hecho');
    });
  });

  describe('IA del cliente', () => {
    it('guarda la clave cifrada y nunca la devuelve', async () => {
      ia.responder(200, (cuerpo: string) => {
        const pregunta = JSON.parse(cuerpo).messages.at(-1).content;
        const texto = typeof pregunta === 'string' && pregunta.includes('Documento')
          ? '# Política de seguridad vial\n\n[Nombre del representante legal] se compromete...'
          : 'Te falta aprobar la investigación del paso 13 [Paso 13] y renovar el SOAT [Alertas].';
        return { model: 'modelo-prueba', choices: [{ message: { content: texto } }], usage: { prompt_tokens: 1000, completion_tokens: 500 } };
      });
      const res = await lider.agente
        .put('/api/org/ia/config')
        .set(org())
        .send({ proveedor: 'compatible', modelo: 'modelo-prueba', urlBase: ia.url, claveApi: 'sk-prueba-secreta-1234', precioEntradaPorMillon: 3, precioSalidaPorMillon: 15, presupuestoMensualUsd: 0.03, agentes: ['copiloto', 'redactor'] })
        .expect(200);
      expect(res.body).toMatchObject({ configurado: true, tieneClave: true, claveTermina: '1234' });
      expect(JSON.stringify(res.body)).not.toContain('sk-prueba');
      const [fila] = await consultarComoAdmin<{ api_key_encrypted: string }>('select api_key_encrypted from ai_settings where organization_id = $1', [lider.orgId]);
      expect(fila!.api_key_encrypted).toMatch(/^v1:/);
      expect(fila!.api_key_encrypted).not.toContain('sk-prueba');
    });

    it('prueba la conexión enviando la clave al proveedor', async () => {
      const res = await lider.agente.post('/api/org/ia/probar').set(org()).expect(201);
      expect(res.body).toMatchObject({ ok: true, modelo: 'modelo-prueba' });
      expect(ia.peticiones.at(-1)!.headers.authorization).toBe('Bearer sk-prueba-secreta-1234');
    });

    it('el copiloto responde con fuentes de la organización y registra el costo', async () => {
      const res = await lider.agente.post('/api/org/ia/copiloto').set(org()).send({ pregunta: '¿Qué me falta?' }).expect(201);
      expect(res.body.fuentes.map((f: { id: string }) => f.id)).toEqual(['Alertas', 'Paso 13']);
      const sistema = JSON.parse(ia.peticiones.at(-1)!.cuerpo).messages[0].content as string;
      expect(sistema).toContain('[Paso 13] Investigación interna de siniestros viales');
      const historial = await lider.agente.get('/api/org/ia/copiloto').set(org()).expect(200);
      expect(historial.body).toHaveLength(2);
    });

    it('el borrador del redactor queda como evidencia en revisión', async () => {
      const res = await lider.agente.post('/api/org/ia/redactar').set(org()).send({ pasoNumero: 3, documento: 'Política de seguridad vial' }).expect(201);
      const lista = await lider.agente.get('/api/org/evidencias?paso=3').set(org()).expect(200);
      expect(lista.body[0]).toMatchObject({ id: res.body.evidenciaId, estado: 'borrador', generadaPorIa: true });
    });

    it('rechaza agentes desactivados y corta al llegar al tope de gasto', async () => {
      await lider.agente.post('/api/org/ia/diagnostico').set(org()).expect(400);
      await lider.agente.post('/api/org/ia/copiloto').set(org()).send({ pregunta: 'Otra pregunta' }).expect(402);
      const eventos = await consultarComoAdmin('select * from event_outbox where organization_id = $1 and event_type = $2', [lider.orgId, 'ia.presupuesto']);
      expect(eventos).toHaveLength(1);
    });
  });

  describe('integración con n8n y tokens de API', () => {
    it('envía eventos firmados y reintenta cuando el destino falla', async () => {
      const creado = await lider.agente
        .post('/api/org/integraciones/webhooks')
        .set(org())
        .send({ nombre: 'n8n alertas', url: `${n8n.url}/webhook/pesv`, eventos: ['preoperacional.falla'] })
        .expect(201);
      const secreto: string = creado.body.secreto;
      await lider.agente.post('/api/org/integraciones/prueba').set(org()).expect(201);
      const recibido = n8n.peticiones.at(-1)!;
      expect(recibido.headers['x-pesv-evento']).toBe('prueba');
      const esperado = firmar(secreto, String(recibido.headers['x-pesv-timestamp']), recibido.cuerpo);
      expect(recibido.headers['x-pesv-firma']).toBe(`sha256=${esperado}`);

      n8n.responder(500, { error: 'caído' });
      await app.get(EventosService).emitirAhora(lider.orgId, 'preoperacional.falla', { placa: 'XYZ789' });
      await app.get(EventosService).despachar();
      const entregas = await lider.agente.get('/api/org/integraciones/entregas').set(org()).expect(200);
      expect(entregas.body[0]).toMatchObject({ evento: 'preoperacional.falla', estado: 'reintentando', intentos: 1, codigo: 500 });
      expect(entregas.body[1]).toMatchObject({ evento: 'prueba', estado: 'entregado' });
    });

    it('un token de solo lectura consulta el tablero pero no crea vehículos', async () => {
      const { body } = await lider.agente.post('/api/org/integraciones/tokens').set(org()).send({ nombre: 'n8n lectura', alcances: ['leer'] }).expect(201);
      expect(body.token).toMatch(/^pesv_/);
      await request(app.getHttpServer()).get('/api/org/tablero').set('authorization', `Bearer ${body.token}`).expect(200);
      await request(app.getHttpServer())
        .post('/api/org/vehiculos')
        .set('authorization', `Bearer ${body.token}`)
        .send({ placa: 'TOK001', tipo: 'automovil', propiedad: 'propio' })
        .expect(403);
      await lider.agente.delete(`/api/org/integraciones/tokens/${body.id}`).set(org()).expect(204);
      await request(app.getHttpServer()).get('/api/org/tablero').set('authorization', `Bearer ${body.token}`).expect(401);
    });
  });
});
