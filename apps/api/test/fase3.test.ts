import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { consultarComoAdmin, crearApp, hayBaseDeDatos, limpiar, registrar, servidorDePrueba, unico, type Cuenta, type ServidorDePrueba } from './helpers.js';

const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!hayBaseDeDatos)('Fase 3', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  let ia: ServidorDePrueba;
  const cuentas: Cuenta[] = [];
  const codigoPlan = `prueba-${unico()}`;
  const h = () => ({ 'x-organization-id': c.orgId });

  beforeAll(async () => {
    app = await crearApp();
    ia = await servidorDePrueba();
    c = await registrar(app, { misionalidad: 2, vehiculos: 64, conductores: 30 });
    cuentas.push(c);
  });

  afterAll(async () => {
    await limpiar(cuentas);
    await consultarComoAdmin('delete from plans where code like $1', [`${codigoPlan}%`]);
    await ia?.cerrar();
    await app?.close();
  });

  describe('adopción voluntaria (RN-01)', () => {
    it('una organización no obligada solo se registra si adopta el PESV voluntariamente', async () => {
      const id = unico();
      const datos = { nombre: 'Tienda Pequeña', email: `voluntaria${id}@ejemplo.co`, password: 'ClaveSegura123' };
      const org = { nombre: `Tienda ${id}`, nit: `7${id}`.slice(0, 10), clasificacion: { misionalidad: 2, vehiculos: 3, conductores: 1 } };
      await request(app.getHttpServer()).post('/api/auth/registro').send({ ...datos, organizacion: org }).expect(422);

      const agente = request.agent(app.getHttpServer());
      const res = await agente.post('/api/auth/registro').send({ ...datos, organizacion: { ...org, adopcionVoluntaria: true } }).expect(201);
      const v: Cuenta = { agente, orgId: res.body.organizacionId, email: datos.email, nit: org.nit };
      cuentas.push(v);
      const detalle = await agente.get('/api/org').set({ 'x-organization-id': v.orgId }).expect(200);
      expect(detalle.body.clasificacion).toMatchObject({ obligated: false, voluntary: true, level: 'basico', reportsToSupertransporte: false });
      expect(detalle.body.resumen.aplicables).toBe(18);
      const vigia = await agente.get('/api/org/vigia/calendario').set({ 'x-organization-id': v.orgId }).expect(200);
      expect(vigia.body.reportaASupertransporte).toBe(false);
    });
  });

  describe('auditorías y hallazgos (pasos 22 y 23)', () => {
    let auditoriaId: string;

    it('una no conformidad no se cierra sin acciones correctivas cerradas (RN-33)', async () => {
      const a = await c.agente
        .post('/api/org/auditorias')
        .set(h())
        .send({ tipo: 'interna', alcance: 'Pasos 1 a 24 del PESV', auditor: 'Marta Auditora', programadaEl: hoyMas(0), incluyeIso: true })
        .expect(201);
      auditoriaId = a.body.id;
      expect(a.body.estado).toBe('planeada');

      const hz = await c.agente
        .post(`/api/org/auditorias/${auditoriaId}/hallazgos`)
        .set(h())
        .send({ tipo: 'no_conformidad_menor', pasoNumero: 11, clausulaIso: '7.4', descripcion: 'No hay registro de capacitación de los conductores nuevos.' })
        .expect(201);
      const eventos = await consultarComoAdmin<{ event_type: string }>("select event_type from event_outbox where organization_id = $1 and event_type = 'auditoria.hallazgo'", [c.orgId]);
      expect(eventos).toHaveLength(1);

      const cerrarHallazgo = () =>
        c.agente.post(`/api/org/auditorias/hallazgos/${hz.body.id}/cerrar`).set(h()).send({ verificacion: 'Se revisaron las listas de asistencia de octubre.' });
      expect((await cerrarHallazgo().expect(400)).body.message).toMatch(/al menos una acción correctiva/);

      const accion = await c.agente
        .post(`/api/org/auditorias/hallazgos/${hz.body.id}/acciones`)
        .set(h())
        .send({ descripcion: 'Programar inducción vial para conductores nuevos', responsable: 'Líder PESV', venceEl: hoyMas(30), tipo: 'mejora' })
        .expect(201);
      expect(accion.body).toMatchObject({ tipo: 'correctiva', origen: 'hallazgo' });
      expect((await cerrarHallazgo().expect(400)).body.message).toMatch(/Faltan 1 acciones/);

      await c.agente.post(`/api/org/acciones/${accion.body.id}/cerrar`).set(h()).send({ nota: 'Inducción realizada el 15 de octubre' }).expect(201);
      expect((await cerrarHallazgo().expect(201)).body).toMatchObject({ estado: 'cerrado' });

      const detalle = await c.agente.get(`/api/org/auditorias/${auditoriaId}`).set(h()).expect(200);
      expect(detalle.body.estado).toBe('en_curso');
      expect(detalle.body.hallazgos[0].acciones).toHaveLength(1);
    });

    it('el auditor simulado propone hallazgos válidos y solo se registran los que la persona elige', async () => {
      ia.responder(200, () => ({
        model: 'modelo-prueba',
        choices: [
          {
            message: {
              content: JSON.stringify({
                resumen: 'El PESV está en etapa inicial.',
                hallazgos: [
                  { tipo: 'no_conformidad_mayor', pasoNumero: 2, clausulaIso: '5.3', descripcion: 'El comité de seguridad vial no tiene actas de reunión.', evidencia: 'Paso 2 sin evidencias' },
                  { tipo: 'oportunidad_mejora', pasoNumero: 20, clausulaIso: null, descripcion: 'Definir indicadores de resultado para el plan anual.', evidencia: 'actividades plan: 0' },
                  { tipo: 'inventado', descripcion: 'x' },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 2000, completion_tokens: 800 },
      }));
      await c.agente
        .put('/api/org/ia/config')
        .set(h())
        .send({ proveedor: 'compatible', modelo: 'modelo-prueba', urlBase: ia.url, claveApi: 'sk-prueba-0000', precioEntradaPorMillon: 1, precioSalidaPorMillon: 1, agentes: ['auditor'] })
        .expect(200);
      const s = await c.agente.post('/api/org/auditorias/simulacro').set(h()).expect(201);
      expect(s.body.hallazgos).toHaveLength(2);
      expect(ia.peticiones.at(-1)!.cuerpo).toContain('Paso 2');

      const imp = await c.agente.post(`/api/org/auditorias/${auditoriaId}/hallazgos/importar`).set(h()).send({ hallazgos: [s.body.hallazgos[0]] }).expect(201);
      expect(imp.body[0]).toMatchObject({ generadoPorIa: true, tipo: 'no_conformidad_mayor' });

      await c.agente.post(`/api/org/auditorias/${auditoriaId}/cerrar`).set(h()).send({ conclusiones: 'El sistema requiere fortalecer el comité y la formación.' }).expect(201);
      await c.agente.post(`/api/org/auditorias/${auditoriaId}/hallazgos`).set(h()).send({ tipo: 'observacion', descripcion: 'Hallazgo tardío después del cierre.' }).expect(400);
      const lista = await c.agente.get('/api/org/auditorias').set(h()).expect(200);
      expect(lista.body[0]).toMatchObject({ estado: 'cerrada', hallazgosAbiertos: 1, hallazgosCerrados: 1 });
    });
  });

  describe('puntaje de riesgo, telemática e ISO 39001', () => {
    let vehiculoId: string;

    it('recibe viajes del GPS con token, sin duplicar y con advertencias de impedimentos', async () => {
      const v = await c.agente.post('/api/org/vehiculos').set(h()).send({ placa: 'GPS123', tipo: 'camioneta', propiedad: 'propio', odometroKm: 1000, soatVence: hoyMas(100), rtmVence: hoyMas(-1), modelo: 2009 }).expect(201);
      vehiculoId = v.body.id;
      await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1098765432', nombre: 'Luis Gómez', licenciaVence: hoyMas(-3), consentimientoDatos: true }).expect(201);
      await c.agente.post('/api/org/rutas').set(h()).send({ nombre: 'Planta - Puerto', origen: 'Planta', destino: 'Puerto', distanciaKm: 80, limiteVelocidad: 60 }).expect(201);

      const lectura = await c.agente.post('/api/org/integraciones/tokens').set(h()).send({ nombre: 'solo lectura', alcances: ['leer'] }).expect(201);
      const gps = await c.agente.post('/api/org/integraciones/tokens').set(h()).send({ nombre: 'GPS', alcances: ['telematica'] }).expect(201);
      const lote = {
        viajes: [
          { idExterno: 'gps-1', placa: 'gps123', documentoConductor: '1098765432', salida: new Date(Date.now() - 7200_000).toISOString(), llegada: new Date().toISOString(), velocidadMaxima: 92, ruta: 'planta - puerto', odometroKm: 1080 },
          { idExterno: 'gps-2', placa: 'ZZZ999', documentoConductor: '1098765432', salida: new Date().toISOString() },
        ],
      };
      const enviar = (token: string) => request(app.getHttpServer()).post('/api/telematica/viajes').set('authorization', `Bearer ${token}`).send(lote);
      await enviar(lectura.body.token).expect(403);
      // El token de telemática no sirve para otras acciones de flota.
      await request(app.getHttpServer()).get('/api/org/vehiculos').set('authorization', `Bearer ${gps.body.token}`).expect(403);

      const r1 = await enviar(gps.body.token).expect(200);
      expect(r1.body).toMatchObject({ recibidos: 2, registrados: 1, duplicados: 0 });
      expect(r1.body.rechazados[0]).toMatchObject({ idExterno: 'gps-2' });
      expect(r1.body.advertencias[0].problemas.join(' ')).toMatch(/licencia|revisión/i);
      const r2 = await enviar(gps.body.token).expect(200);
      expect(r2.body).toMatchObject({ registrados: 0, duplicados: 1 });

      const viajes = await c.agente.get('/api/org/viajes').set(h()).expect(200);
      const delGps = viajes.body.filter((x: { origen: string }) => x.origen === 'telematica');
      expect(delGps).toHaveLength(1);
      expect(delGps[0]).toMatchObject({ excesoVelocidad: true, ruta: 'Planta - Puerto', distanciaKm: 80 });
      const vehiculos = await c.agente.get('/api/org/vehiculos').set(h()).expect(200);
      expect(vehiculos.body.find((x: { id: string }) => x.id === vehiculoId).odometroKm).toBe(1080);
    });

    it('calcula el puntaje de riesgo con factores explicados', async () => {
      const conductores = await c.agente.get('/api/org/riesgo/conductores').set(h()).expect(200);
      const luis = conductores.body.find((x: { nombre: string }) => x.nombre === 'Luis Gómez');
      expect(luis.factores.map((f: { factor: string }) => f.factor)).toEqual(expect.arrayContaining(['Licencia de conducción', 'Excesos de velocidad (90 días)', 'Capacitación']));
      expect(luis.puntaje).toBeGreaterThanOrEqual(15 + 20 + 7);
      const vehiculos = await c.agente.get('/api/org/riesgo/vehiculos').set(h()).expect(200);
      const gps = vehiculos.body.find((x: { placa: string }) => x.placa === 'GPS123');
      expect(gps.factores.map((f: { factor: string }) => f.factor)).toEqual(expect.arrayContaining(['Revisión técnico-mecánica', 'Antigüedad', 'Preoperacional al día']));
    });

    it('deriva el cumplimiento de ISO 39001 de los pasos', async () => {
      const iso = await c.agente.get('/api/org/tablero/iso').set(h()).expect(200);
      expect(iso.body.clausulas.length).toBeGreaterThan(20);
      expect(iso.body.porcentaje).toBe(0);
      const tablero = await c.agente.get('/api/org/tablero').set(h()).expect(200);
      expect(tablero.body.iso).toMatchObject({ porcentaje: 0, cubiertas: 0 });
    });
  });

  describe('planes y suscripciones (RN-26 y RN-27)', () => {
    let planId: string;

    it('solo los administradores de la plataforma gestionan planes', async () => {
      await c.agente.get('/api/plataforma/planes').expect(403);
      await consultarComoAdmin('update users set is_platform_admin = true where email = $1', [c.email]);
      const p = await c.agente
        .post('/api/plataforma/planes')
        .send({ codigo: codigoPlan, nombre: 'Plan de prueba', niveles: ['estandar'], maxVehiculos: 1, funciones: ['iso39001'], precioMensual: null })
        .expect(201);
      planId = p.body.id;
      expect(p.body).toMatchObject({ maxVehiculos: 1, precioMensual: null, moneda: 'COP' });
      await c.agente.post('/api/plataforma/planes').send({ codigo: codigoPlan, nombre: 'Repetido' }).expect(409);
    });

    it('aplica límites y funciones del plan asignado', async () => {
      await c.agente.put(`/api/plataforma/organizaciones/${c.orgId}/suscripcion`).send({ planId, estado: 'activa', vencePeriodoEl: hoyMas(30) }).expect(200);
      const orgs = await c.agente.get('/api/plataforma/organizaciones').expect(200);
      expect(orgs.body.find((o: { id: string }) => o.id === c.orgId)).toMatchObject({ plan: 'Plan de prueba', estado: 'activa' });

      const lim = await c.agente.post('/api/org/vehiculos').set(h()).send({ placa: 'LIM001', tipo: 'automovil', propiedad: 'propio' }).expect(403);
      expect(lim.body.message).toMatch(/permite hasta 1 vehículos/);
      const estadoIa = await c.agente.get('/api/org/ia/estado').set(h()).expect(200);
      expect(estadoIa.body).toMatchObject({ activa: false, incluidaEnPlan: false });
      await c.agente.post('/api/org/ia/copiloto').set(h()).send({ pregunta: '¿Qué me falta?' }).expect(403);
      await c.agente.get('/api/org/integraciones/webhooks').set(h()).expect(403);
      await c.agente.get('/api/org/tablero/iso').set(h()).expect(200);
      const s = await c.agente.get('/api/org/suscripcion').set(h()).expect(200);
      expect(s.body).toMatchObject({ estado: 'activa', soloLectura: false, funciones: ['iso39001'], uso: { vehiculos: 1 } });
    });

    it('con mora la cuenta queda en solo lectura pero se puede consultar', async () => {
      await c.agente.put(`/api/plataforma/organizaciones/${c.orgId}/suscripcion`).send({ planId, estado: 'mora' }).expect(200);
      const res = await c.agente.post('/api/org/rutas').set(h()).send({ nombre: 'Otra', origen: 'A', destino: 'B', distanciaKm: 5 }).expect(402);
      expect(res.body.message).toMatch(/solo lectura/);
      await c.agente.get('/api/org/rutas').set(h()).expect(200);
      await c.agente.get('/api/org/auditorias').set(h()).expect(200);
      expect((await c.agente.get('/api/org/suscripcion').set(h()).expect(200)).body.soloLectura).toBe(true);
      const auditoria = await consultarComoAdmin<{ action: string }>("select action from audit_log where organization_id = $1 and action = 'suscripcion.actualizada'", [c.orgId]);
      expect(auditoria).toHaveLength(2);
    });

    it('las organizaciones nuevas reciben el plan por defecto en periodo de prueba', async () => {
      const p = await c.agente
        .post('/api/plataforma/planes')
        .send({ codigo: `${codigoPlan}-base`, nombre: 'Base de prueba', funciones: ['ia', 'n8n', 'telematica', 'iso39001', 'auditor_ia'], diasPrueba: 15, porDefecto: true })
        .expect(201);
      const nueva = await registrar(app);
      cuentas.push(nueva);
      // Se desmarca enseguida para no afectar otras pruebas que registran organizaciones.
      await c.agente.patch(`/api/plataforma/planes/${p.body.id}`).send({ codigo: `${codigoPlan}-base`, nombre: 'Base de prueba', funciones: ['ia', 'n8n', 'telematica', 'iso39001', 'auditor_ia'], diasPrueba: 15, porDefecto: false }).expect(200);
      const [s] = await consultarComoAdmin<{ plan_id: string; status: string; trial_ends_on: Date }>('select plan_id, status, trial_ends_on from subscriptions where organization_id = $1', [nueva.orgId]);
      expect(s).toMatchObject({ plan_id: p.body.id, status: 'prueba' });
      expect(s!.trial_ends_on).not.toBeNull();
    });

    it('un administrador no puede quitarse a sí mismo el acceso', async () => {
      await c.agente.post('/api/plataforma/administradores').send({ email: c.email, activo: false }).expect(409);
      const admins = await c.agente.get('/api/plataforma/administradores').expect(200);
      expect(admins.body.map((a: { email: string }) => a.email)).toContain(c.email);
    });
  });
});
