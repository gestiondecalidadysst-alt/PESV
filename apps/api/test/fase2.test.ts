import type { NestExpressApplication } from '@nestjs/platform-express';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TareasService } from '../src/tareas/tareas.module.js';
import { consultarComoAdmin, crearApp, hayBaseDeDatos, limpiar, registrar, unico, type Cuenta } from './helpers.js';

const hoyMas = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);
const ahora = new Date();
const trimestre = `${ahora.getFullYear()}-T${Math.ceil((ahora.getMonth() + 1) / 3)}`;
const mes = ahora.toISOString().slice(0, 7);

describe.skipIf(!hayBaseDeDatos)('Fase 2', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  let vehiculoId: string;
  let conductorId: string;
  let siniestroId: string;
  const h = () => ({ 'x-organization-id': c.orgId });

  beforeAll(async () => {
    app = await crearApp();
    c = await registrar(app, { misionalidad: 2, vehiculos: 64, conductores: 30 });
    const v = await c.agente.post('/api/org/vehiculos').set(h()).send({ placa: 'MNT001', tipo: 'camion', propiedad: 'propio', odometroKm: 120000, soatVence: hoyMas(200), rtmVence: hoyMas(-2) }).expect(201);
    vehiculoId = v.body.id;
    const d = await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1067111222', nombre: 'Ana Ruiz', licenciaVence: hoyMas(300), consentimientoDatos: true }).expect(201);
    conductorId = d.body.id;
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  describe('mantenimiento', () => {
    it('cada falla del preoperacional abre una orden y cerrar las críticas devuelve el vehículo a apto', async () => {
      const { body } = await c.agente.get(`/api/org/inspecciones/plantilla/${vehiculoId}`).set(h()).expect(200);
      const fallan = new Set(['frenos', 'espejos']);
      const items = body.plantilla.items.map((i: { codigo: string }) => ({ codigo: i.codigo, ok: !fallan.has(i.codigo) }));
      await c.agente.post('/api/org/inspecciones').set(h()).send({ vehiculoId, items, clientId: `m-${unico()}`, realizadaEn: new Date().toISOString() }).expect(201);
      const ordenes = await c.agente.get('/api/org/mantenimiento/ordenes?estado=abierta').set(h()).expect(200);
      expect(ordenes.body).toHaveLength(2);
      const critica = ordenes.body.find((o: { prioridad: string }) => o.prioridad === 'critica');
      await c.agente.post(`/api/org/mantenimiento/ordenes/${critica.id}/cerrar`).set(h()).send({ proveedor: 'Taller El Sinú', nitProveedor: '900555111', tecnico: 'Pedro Gómez', odometroKm: 120050 }).expect(201);
      const v = await c.agente.get('/api/org/vehiculos').set(h()).expect(200);
      expect(v.body[0]).toMatchObject({ estado: 'apto', odometroKm: 120050 });
      await c.agente.post(`/api/org/mantenimiento/ordenes/${critica.id}/cerrar`).set(h()).send({ proveedor: 'X', tecnico: 'Pedro Gómez' }).expect(400);
    });

    it('marca vencido el plan preventivo por tiempo o kilometraje', async () => {
      await c.agente.post('/api/org/mantenimiento/planes').set(h()).send({ vehiculoId, nombre: 'Cambio de aceite', intervaloKm: 10000, intervaloDias: 180, ultimoEn: hoyMas(-200), ultimoKm: 115000 }).expect(201);
      await c.agente.post('/api/org/mantenimiento/planes').set(h()).send({ vehiculoId, nombre: 'Sin intervalo' }).expect(400);
      const planes = await c.agente.get('/api/org/mantenimiento/planes').set(h()).expect(200);
      expect(planes.body[0]).toMatchObject({ estado: 'vencido', proximoKm: 125000 });
    });
  });

  describe('siniestros', () => {
    it('registra el siniestro y abre investigación obligatoria en nivel estándar', async () => {
      const res = await c.agente
        .post('/api/org/siniestros')
        .set(h())
        .send({ ocurridoEn: new Date().toISOString(), lugar: 'Vía Montería - Cereté km 5', vehiculoId, placa: 'MNT001', conductorId, conductorNombre: 'Ana Ruiz', conductorDocumento: '1067111222', heridosLeves: 1, descripcion: 'Colisión por alcance en semáforo', costoDirecto: 2500000 })
        .expect(201);
      siniestroId = res.body.id;
      expect(res.body).toMatchObject({ nivel: 'con_lesionados_leves', conductorNombre: 'Ana Ruiz', investigacion: { obligatoria: true, estado: 'pendiente' } });
      const eventos = await consultarComoAdmin('select * from event_outbox where organization_id = $1 and event_type = $2', [c.orgId, 'siniestro.creado']);
      expect(eventos).toHaveLength(1);
    });

    it('no cierra la investigación sin causas raíz ni lecciones aprendidas', async () => {
      await c.agente.patch(`/api/org/siniestros/${siniestroId}/investigacion`).set(h()).send({ estado: 'cerrada' }).expect(400);
      await c.agente.post(`/api/org/siniestros/${siniestroId}/acciones`).set(h()).send({ descripcion: 'Capacitar en distancia de seguimiento', responsable: 'Líder PESV', venceEl: hoyMas(30), tipo: 'correctiva' }).expect(201);
      const res = await c.agente
        .patch(`/api/org/siniestros/${siniestroId}/investigacion`)
        .set(h())
        .send({ estado: 'en_curso', hechos: 'El conductor no mantuvo la distancia', causasInmediatas: 'Distancia insuficiente' })
        .expect(200);
      expect(res.body.estado).toBe('en_investigacion');
      const detalle = await c.agente.get(`/api/org/siniestros/${siniestroId}`).set(h()).expect(200);
      expect(detalle.body.acciones).toHaveLength(1);
    });

    it('el borrador con IA exige proveedor configurado', async () => {
      await c.agente.post(`/api/org/siniestros/${siniestroId}/borrador-ia`).set(h()).expect(400);
    });
  });

  describe('desplazamientos', () => {
    it('no asigna viajes con documentos vencidos y detecta exceso de velocidad', async () => {
      const ruta = await c.agente.post('/api/org/rutas').set(h()).send({ nombre: 'Planta - Puerto', origen: 'Montería', destino: 'Coveñas', distanciaKm: 120, limiteVelocidad: 80 }).expect(201);
      const viaje = { rutaId: ruta.body.id, vehiculoId, conductorId, salida: new Date().toISOString(), velocidadMaxima: 95 };
      const bloqueado = await c.agente.post('/api/org/viajes').set(h()).send(viaje).expect(422);
      expect(bloqueado.body.errores[0].mensaje).toMatch(/revisión técnico-mecánica de MNT001 está vencida/);
      await c.agente.patch(`/api/org/vehiculos/${vehiculoId}`).set(h()).send({ placa: 'MNT001', tipo: 'camion', propiedad: 'propio', soatVence: hoyMas(200), rtmVence: hoyMas(200), odometroKm: 120050 }).expect(200);
      const ok = await c.agente.post('/api/org/viajes').set(h()).send(viaje).expect(201);
      expect(ok.body.viaje).toMatchObject({ speeding: true, distanceKm: 120 });
    });
  });

  describe('comité de seguridad vial', () => {
    let reunionId: string;

    it('programa la reunión con agenda sugerida y quórum de mayoría', async () => {
      const yo = await c.agente.get('/api/auth/yo').expect(200);
      await c.agente.post('/api/org/comite/miembros').set(h()).send({ usuarioId: yo.body.usuario.id, nombre: 'Laura Prueba', rolComite: 'presidente' }).expect(201);
      await c.agente.post('/api/org/comite/miembros').set(h()).send({ nombre: 'Carlos Secretario', rolComite: 'secretario' }).expect(201);
      await c.agente.post('/api/org/comite/miembros').set(h()).send({ nombre: 'María Integrante' }).expect(201);
      const r = await c.agente.post('/api/org/comite/reuniones').set(h()).send({ fecha: new Date().toISOString(), lugar: 'Sala de juntas' }).expect(201);
      reunionId = r.body.id;
      expect(r.body.quorumRequired).toBe(2);
      expect(r.body.agenda.map((p: { titulo: string }) => p.titulo)).toEqual(
        expect.arrayContaining([expect.stringMatching(/Revisión del siniestro .* placa MNT001/), expect.stringMatching(/Investigaciones internas/)]),
      );
    });

    it('no decide sin quórum y registra notas, decisiones y compromisos', async () => {
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/iniciar`).set(h()).expect(201);
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/llegada`).set(h()).expect(201);
      const decision = { texto: 'Aprobar la investigación del siniestro', votosAFavor: 1, votosEnContra: 0 };
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/decisiones`).set(h()).send(decision).expect(400);
      const d = await c.agente.get(`/api/org/comite/reuniones/${reunionId}`).set(h()).expect(200);
      const secretario = d.body.asistencia.find((a: { nombre: string }) => a.nombre === 'Carlos Secretario');
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/asistencia`).set(h()).send({ miembroId: secretario.miembroId, presente: true }).expect(201);
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/decisiones`).set(h()).send({ ...decision, votosAFavor: 3 }).expect(400);
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/decisiones`).set(h()).send({ ...decision, votosAFavor: 2 }).expect(201);
      await c.agente.patch(`/api/org/comite/reuniones/${reunionId}/puntos/${d.body.agenda[0].id}`).set(h()).send({ notas: 'Hay quórum con 2 de 3 integrantes.' }).expect(200);
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/compromisos`).set(h()).send({ descripcion: 'Renovar la revisión técnico-mecánica', responsable: 'Jefe de flota', venceEl: hoyMas(15) }).expect(201);
      const despues = await c.agente.get(`/api/org/comite/reuniones/${reunionId}`).set(h()).expect(200);
      expect(despues.body).toMatchObject({ hayQuorum: true, presentes: 2 });
      expect(despues.body.agenda[0].notas).toBe('Hay quórum con 2 de 3 integrantes.');
      expect(despues.body.compromisos).toHaveLength(1);
    });

    it('al cerrar genera el acta como evidencia del paso 2 y marca el siniestro como revisado', async () => {
      const r = await c.agente.post(`/api/org/comite/reuniones/${reunionId}/cerrar`).set(h()).send({}).expect(201);
      expect(r.body.evidenciaId).toBeTruthy();
      const acta = await c.agente.get(`/api/org/comite/reuniones/${reunionId}/acta?org=${c.orgId}`).buffer(true).parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (x: Buffer) => partes.push(x));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      }).expect(200);
      expect((acta.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const s = await c.agente.get(`/api/org/siniestros/${siniestroId}`).set(h()).expect(200);
      expect(s.body.revisadoPorComiteEl).toBe(new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10));
      await c.agente.patch(`/api/org/comite/reuniones/${reunionId}/puntos/x`).set(h()).send({ notas: 'tarde' }).expect(400);
    });

    it('firma con contraseña y queda firmada cuando firman los asistentes con cuenta', async () => {
      await c.agente.post(`/api/org/comite/reuniones/${reunionId}/firmar`).set(h()).send({ password: 'otra' }).expect(401);
      const f = await c.agente.post(`/api/org/comite/reuniones/${reunionId}/firmar`).set(h()).send({ password: 'ClaveSegura123' }).expect(201);
      expect(f.body.pendientes).toBe(0);
      const d = await c.agente.get(`/api/org/comite/reuniones/${reunionId}`).set(h()).expect(200);
      expect(d.body.estado).toBe('firmada');
    });
  });

  describe('planificación', () => {
    it('valora riesgos, metas, plan anual y capacitaciones', async () => {
      const r = await c.agente
        .post('/api/org/matriz/riesgos')
        .set(h())
        .send({ metodologia: 'matriz5x5', proceso: 'Distribución', actorVial: 'conductor', factor: 'humano', peligro: 'Fatiga', descripcion: 'Jornadas nocturnas largas', inherente: { probabilidad: 4, severidad: 4 } })
        .expect(201);
      expect(r.body.inherente).toMatchObject({ valor: 16, nivel: 'Extremo', critico: true });
      await c.agente.post('/api/org/metas').set(h()).send({ anio: ahora.getFullYear(), objetivo: 'Cero fallecidos', indicador: 'Fallecidos en siniestros', meta: 0, valorActual: 0 }).expect(201);
      const act = await c.agente.post('/api/org/plan-trabajo').set(h()).send({ anio: ahora.getFullYear(), titulo: 'Simulacro de emergencia vial', pasoNumero: 12, responsable: 'Líder PESV', meses: [ahora.getMonth() + 1] }).expect(201);
      await c.agente.post(`/api/org/plan-trabajo/${act.body.id}/seguimiento`).set(h()).send({ mes: ahora.getMonth() + 1, ejecutado: true, fecha: hoyMas(0) }).expect(201);
      const cap = await c.agente.post('/api/org/capacitaciones').set(h()).send({ titulo: 'Manejo defensivo', tema: 'Distancia de seguimiento', programadaEl: hoyMas(0), estado: 'ejecutada', horas: 2 }).expect(201);
      await c.agente.put(`/api/org/capacitaciones/${cap.body.id}/asistentes`).set(h()).send({ asistentes: [{ conductorId, nombre: 'Ana Ruiz', documento: '1067111222' }] }).expect(200);
      const metas = await c.agente.get('/api/org/metas').set(h()).expect(200);
      expect(metas.body[0].cumplida).toBe(true);
    });
  });

  describe('VIGIA 2', () => {
    it('calcula el formulario de siniestros y avisa los datos faltantes', async () => {
      const res = await c.agente.get(`/api/org/vigia/siniestros/${trimestre}`).set(h()).expect(200);
      const valor = (k: string) => res.body.indicadores.find((i: { clave: string }) => i.clave === k)?.valor;
      expect(valor('siniestros')).toBe(1);
      expect(valor('heridos_leves')).toBe(1);
      expect(valor('km')).toBe(120);
      expect(res.body.problemas.join(' ')).toMatch(/falta el número de IPAT/);
      await c.agente.get(`/api/org/vigia/siniestros/${mes}`).set(h()).expect(400);
    });

    it('genera el Excel del formulario de vehículos y lo marca como enviado', async () => {
      await c.agente.post(`/api/org/vigia/vehiculos/${mes}/enviado`).set(h()).expect(400);
      const gen = await c.agente.post(`/api/org/vigia/vehiculos/${mes}/generar`).set(h()).expect(201);
      expect(gen.body.archivo).toBe(`VIGIA2_vehiculos_${mes}.xlsx`);
      const archivo = await c.agente.get(`/api/org/vigia/vehiculos/${mes}/archivo?org=${c.orgId}`).buffer(true).parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (x: Buffer) => partes.push(x));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      }).expect(200);
      const libro = new ExcelJS.Workbook();
      await libro.xlsx.load(archivo.body as Buffer);
      expect(libro.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Relación de preoperacionales', 'Mantenimientos muestra 10 %']);
      const enviado = await c.agente.post(`/api/org/vigia/vehiculos/${mes}/enviado`).set(h()).expect(201);
      expect(enviado.body.estado).toBe('enviado');
    });
  });

  describe('tareas programadas', () => {
    it('emite avisos de vencimiento, mantenimiento y acciones una sola vez', async () => {
      const tareas = app.get(TareasService);
      const primera = await tareas.revisarOrganizacion(c.orgId);
      expect(primera).toBeGreaterThan(0);
      const tipos = await consultarComoAdmin<{ event_type: string }>('select distinct event_type from event_outbox where organization_id = $1', [c.orgId]);
      expect(tipos.map((t) => t.event_type)).toEqual(expect.arrayContaining(['mantenimiento.vencido']));
      expect(await tareas.revisarOrganizacion(c.orgId)).toBe(0);
    });
  });
});
