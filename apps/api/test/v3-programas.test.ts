import type { NestExpressApplication } from '@nestjs/platform-express';
import { trimestreAnterior } from '@pesv/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { binario, crearApp, documentoAprobado, hayBaseDeDatos, limpiar, registrar, textoPdf, type Cuenta } from './helpers.js';

const hoyCo = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const anio = Number(hoyCo().slice(0, 4));

interface Requisito { id: string; estado: string; detalle: string; verificacion: string }
interface Programa { id: string; tipo: string; nombre: string; completo: boolean; avance: number; camposFaltantes: string[]; elementosFaltantes: string[]; vigente: boolean; actividades: unknown[] }

describe.skipIf(!hayBaseDeDatos)('V3 · requisitos de los pasos y programas del paso 8', () => {
  let app: NestExpressApplication;
  let c: Cuenta;
  const h = () => ({ 'x-organization-id': c.orgId });
  const requisitos = async (paso: number) => (await c.agente.get(`/api/org/pasos/${paso}/requisitos`).set(h()).expect(200)).body as { resumen: { total: number; cumplen: number; completo: boolean }; requisitos: Requisito[] };
  const req = async (paso: number, id: string) => (await requisitos(paso)).requisitos.find((r) => r.id === id)!;
  const programas = async () => (await c.agente.get('/api/org/programas').set(h()).expect(200)).body as { programas: Programa[]; faltantes: string[]; trimestrePendiente: string | null; velocidad: { vehiculosActivos: number; vehiculosCubiertos: number; equipos: { id: string; estado: string }[] }; sustancias: Record<string, number> };
  let vehiculo = '';
  let conductor = '';
  let indicadorVelocidad = '';

  beforeAll(async () => {
    app = await crearApp();
    // Nivel estándar: aplican los indicadores de la tabla 10 de estándar y avanzado.
    c = await registrar(app, { misionalidad: 2, vehiculos: 64, conductores: 30 });
    const v = await c.agente.post('/api/org/vehiculos').set(h()).send({ placa: 'PRG001', tipo: 'camion', propiedad: 'propio', soatVence: `${anio + 1}-06-01`, rtmVence: `${anio + 1}-06-01` }).expect(201);
    vehiculo = v.body.id;
    const d = await c.agente.post('/api/org/conductores').set(h()).send({ documento: '1067444555', nombre: 'Ana Ruta', licenciaVence: `${anio + 3}-01-01`, consentimientoDatos: true }).expect(201);
    conductor = d.body.id;
  });

  afterAll(async () => {
    await limpiar([c]);
    await app?.close();
  });

  it('crea los cinco programas obligatorios y exige su contenido mínimo', async () => {
    let p8 = await requisitos(8);
    expect(p8.requisitos.map((r) => r.id)).toEqual(['P8.1', 'P8.2', 'P8.3', 'P8.4', 'P8.5']);
    expect(p8.requisitos[0]).toMatchObject({ estado: 'no_cumple', verificacion: 'dato' });
    expect(p8.requisitos[0]!.detalle).toMatch(/Falta crear/);

    await c.agente.post('/api/org/indicadores/plantillas').set(h()).send({ calculos: ['excesos_velocidad', 'excesos_jornada', 'cobertura_programa_velocidad', 'costos_siniestros', 'nc_auditoria_cerradas', 'cumplimiento_metas'] }).expect(201);
    const inicio = await c.agente.post('/api/org/programas/iniciar').set(h()).expect(201);
    expect(inicio.body.creados).toBe(5);
    expect((await c.agente.post('/api/org/programas/iniciar').set(h()).expect(201)).body.creados).toBe(0);

    const lista = await programas();
    expect(lista.faltantes).toEqual([]);
    expect(lista.programas.map((p) => p.tipo)).toEqual(['velocidad', 'fatiga', 'distraccion', 'alcohol_spa', 'vulnerables']);
    const velocidad = lista.programas[0]!;
    // Los factores de desempeño de la norma y el indicador sugerido vienen precargados.
    expect(velocidad.camposFaltantes).not.toContain('factores');
    expect(velocidad.camposFaltantes).not.toContain('indicadores');
    expect(velocidad.elementosFaltantes).toEqual(['control', 'equipos', 'evaluacion', 'excesos']);
    const ind = await c.agente.get(`/api/org/indicadores?anio=${anio}`).set(h()).expect(200);
    indicadorVelocidad = ind.body.indicadores.find((i: { calculo: string }) => i.calculo === 'excesos_velocidad').id;

    await c.agente.post('/api/org/programas').set(h()).send({ tipo: 'velocidad', nombre: 'Otro de velocidad' }).expect(400);
    await c.agente.delete(`/api/org/programas/${velocidad.id}`).set(h()).expect(400);
    await c.agente.put(`/api/org/programas/${velocidad.id}`).set(h()).send({ tipo: 'velocidad', nombre: 'Velocidad', elementos: ['no-existe'] }).expect(400);

    await c.agente
      .put(`/api/org/programas/${velocidad.id}`)
      .set(h())
      .send({
        tipo: 'velocidad',
        nombre: 'Programa de gestión de la velocidad segura',
        lineamientos: 'Límite de 80 km/h en vías nacionales y 30 km/h en zonas escolares; alertas del GPS.',
        alcance: 'Todos los conductores de vehículos propios y contratados.',
        inicio: `${anio}-01-15`,
        duracionMeses: 12,
        lineaBase: '18 % de los desplazamientos con exceso de velocidad en el año anterior.',
        objetivos: 'Bajar los excesos de velocidad a menos del 5 % de los desplazamientos.',
        factores: 'Cumplimiento de los límites de velocidad',
        responsable: 'Jefe de flota',
        presupuesto: 4_500_000,
        seguimiento: 'Reporte mensual del GPS y revisión trimestral en el comité.',
        elementos: ['control', 'equipos', 'evaluacion', 'excesos'],
        indicadorIds: [indicadorVelocidad],
      })
      .expect(200);
    let v = (await programas()).programas[0]!;
    expect(v.camposFaltantes).toEqual(['actividades', 'cronograma']);
    await c.agente.post(`/api/org/programas/${velocidad.id}/actividades`).set(h()).send({ anio, titulo: 'Revisión mensual de excesos del GPS', responsable: 'Jefe de flota', meses: [2, 5, 8, 11] }).expect(201);
    v = (await programas()).programas[0]!;
    expect(v).toMatchObject({ completo: true, avance: 100 });
    // La actividad queda en el plan de trabajo con origen «programa» y paso 8.
    const plan = await c.agente.get(`/api/org/plan-trabajo?anio=${anio}`).set(h()).expect(200);
    expect(plan.body.actividades.find((a: { titulo: string }) => a.titulo === 'Revisión mensual de excesos del GPS')).toMatchObject({ origen: 'programa', pasoNumero: 8 });

    p8 = await requisitos(8);
    expect(p8.requisitos[0]!.detalle).toMatch(/Incompletos: Programa de prevención de la fatiga/);

    // Un programa adicional se crea y se retira.
    const otro = await c.agente.post('/api/org/programas').set(h()).send({ tipo: 'otro', nombre: 'Programa de seguridad del peatón en planta' }).expect(201);
    await c.agente.delete(`/api/org/programas/${otro.body.id}`).set(h()).expect(204);
  });

  it('controla la calibración de los equipos de velocidad y la cobertura del programa', async () => {
    expect((await req(8, 'P8.2')).detalle).toMatch(/No hay equipos/);
    const e = await c.agente.post('/api/org/programas/equipos').set(h()).send({ tipo: 'gps', nombre: 'GPS Satrack', vehiculoId: vehiculo }).expect(201);
    expect((await req(8, 'P8.2')).detalle).toMatch(/sin calibración/);
    await c.agente.put(`/api/org/programas/equipos/${e.body.id}`).set(h()).send({ tipo: 'gps', nombre: 'GPS Satrack', vehiculoId: vehiculo, calibradoEl: `${anio}-01-10`, calibracionVence: `${anio - 1}-01-10` }).expect(400);
    await c.agente.put(`/api/org/programas/equipos/${e.body.id}`).set(h()).send({ tipo: 'gps', nombre: 'GPS Satrack', vehiculoId: vehiculo, calibradoEl: `${anio - 1}-01-10`, calibracionVence: `${anio - 1}-12-31` }).expect(200);
    expect((await req(8, 'P8.2')).detalle).toMatch(/vencida/);
    expect((await programas()).velocidad.equipos[0]!.estado).toBe('vencido');
    await c.agente.put(`/api/org/programas/equipos/${e.body.id}`).set(h()).send({ tipo: 'gps', nombre: 'GPS Satrack', vehiculoId: vehiculo, calibradoEl: hoyCo(), calibracionVence: `${anio + 1}-12-31` }).expect(200);
    expect(await req(8, 'P8.2')).toMatchObject({ estado: 'cumple' });
    expect((await programas()).velocidad).toMatchObject({ vehiculosActivos: 1, vehiculosCubiertos: 1 });
  });

  it('registra pruebas de alcohol y sustancias con consentimiento y abre una acción ante un positivo', async () => {
    await c.agente.post('/api/org/programas/pruebas').set(h()).send({ conductorId: conductor, tipo: 'alcohol_aleatoria', fecha: hoyCo(), resultado: 'negativo' }).expect(400);
    const neg = await c.agente.post('/api/org/programas/pruebas').set(h()).send({ conductorId: conductor, tipo: 'alcohol_aleatoria', fecha: hoyCo(), resultado: 'negativo', consentimiento: true }).expect(201);
    expect(neg.body.accionId).toBeNull();
    expect((await req(8, 'P8.3')).detalle).toMatch(/control anual de alcohol: 0 de 1/);
    await c.agente.post('/api/org/programas/pruebas').set(h()).send({ conductorId: conductor, tipo: 'alcohol_sangre_anual', fecha: hoyCo(), resultado: 'negativo', consentimiento: true }).expect(201);
    const pos = await c.agente.post('/api/org/programas/pruebas').set(h()).send({ conductorId: conductor, tipo: 'sustancias_orina_anual', fecha: hoyCo(), resultado: 'positivo', consentimiento: true, metodo: 'Laboratorio clínico' }).expect(201);
    expect(pos.body.accionId).toBeTruthy();
    expect(await req(8, 'P8.3')).toMatchObject({ estado: 'cumple' });
    const plan = await c.agente.get('/api/org/acciones/plan').set(h()).expect(200);
    expect(plan.body.acciones.find((a: { id: string }) => a.id === pos.body.accionId)).toMatchObject({ origen: 'programa', tipo: 'correctiva', pasoNumero: 8 });
    const pruebas = await c.agente.get('/api/org/programas/pruebas').set(h()).expect(200);
    expect(pruebas.body).toHaveLength(3);
    expect((await programas()).sustancias).toMatchObject({ conductores: 1, aleatorias: 1, positivas: 1 });
  });

  it('registra la actualización anual, la divulgación y la revisión trimestral', async () => {
    const lista = await programas();
    expect((await req(8, 'P8.4')).estado).toBe('no_cumple');
    for (const p of lista.programas) {
      await c.agente.post(`/api/org/programas/${p.id}/actualizacion`).set(h()).send({ fecha: hoyCo(), divulgacion: 'Socializado en la inducción y por correo a todos los colaboradores' }).expect(201);
    }
    expect((await programas()).programas.every((p) => p.vigente)).toBe(true);
    expect(await req(8, 'P8.4')).toMatchObject({ estado: 'cumple' });
    const periodo = trimestreAnterior(hoyCo());
    await c.agente.post('/api/org/programas/revisiones').set(h()).send({ periodo, fecha: hoyCo(), instancia: 'comite', participantes: 'Comité', conclusiones: 'corto' }).expect(400);
    await c.agente
      .post('/api/org/programas/revisiones')
      .set(h())
      .send({ periodo, fecha: hoyCo(), instancia: 'comite', participantes: 'Laura Prueba, Carlos Secretario', conclusiones: 'Los excesos de velocidad bajaron; falta completar el programa de fatiga.' })
      .expect(201);
    expect((await programas()).trimestrePendiente).toBeNull();
    expect(await req(8, 'P8.5')).toMatchObject({ estado: 'cumple' });
  });

  it('mide los nuevos indicadores de la tabla 10 y exige los que aplican al nivel', async () => {
    const ruta = await c.agente.post('/api/org/rutas').set(h()).send({ nombre: 'Planta – Puerto', origen: 'Planta', destino: 'Puerto', distanciaKm: 120, viajesPorMes: 20, limiteVelocidad: 80 }).expect(201);
    const salida = `${hoyCo()}T07:00:00-05:00`;
    await c.agente.post('/api/org/viajes').set(h()).send({ rutaId: ruta.body.id, vehiculoId: vehiculo, conductorId: conductor, salida, llegada: `${hoyCo()}T09:00:00-05:00`, distanciaKm: 120, velocidadMaxima: 102, excesoJornada: true }).expect(201);
    await c.agente.post('/api/org/viajes').set(h()).send({ rutaId: ruta.body.id, vehiculoId: vehiculo, conductorId: conductor, salida: `${hoyCo()}T10:00:00-05:00`, llegada: `${hoyCo()}T11:30:00-05:00`, distanciaKm: 120, velocidadMaxima: 70 }).expect(201);
    const ind = await c.agente.get(`/api/org/indicadores?anio=${anio}`).set(h()).expect(200);
    const mes = Number(hoyCo().slice(5, 7));
    const valor = (calculo: string, indice: number) => ind.body.indicadores.find((i: { calculo: string }) => i.calculo === calculo).periodos[indice];
    expect(valor('excesos_velocidad', mes - 1)).toMatchObject({ valor: 50, numerador: 1, denominador: 2 });
    expect(valor('excesos_jornada', mes - 1)).toMatchObject({ valor: 50 });
    expect(valor('cobertura_programa_velocidad', Math.floor((mes - 1) / 3))).toMatchObject({ valor: 100 });

    const p20 = await req(20, 'P20.1');
    expect(p20.estado).toBe('no_cumple');
    expect(p20.detalle).toMatch(/Faltan 7 de 13/);
  });

  it('verifica los documentos del paso por su aprobación, vigencia y divulgación', async () => {
    expect((await req(3, 'P3.1')).estado).toBe('no_cumple');
    const id = await documentoAprobado(c, 3, 'politica', 'Política de seguridad vial');
    expect(await req(3, 'P3.1')).toMatchObject({ estado: 'cumple' });
    expect((await req(3, 'P3.3')).detalle).toMatch(/falta registrar la divulgación/);
    await c.agente.post(`/api/org/documentos/${id}/divulgacion`).set(h()).send({ fecha: hoyCo(), medio: 'Cartelera y correo a todo el personal' }).expect(201);
    expect(await req(3, 'P3.3')).toMatchObject({ estado: 'cumple' });
    // El requisito de firma del representante legal se verifica con una evidencia.
    expect(await req(3, 'P3.2')).toMatchObject({ estado: 'sin_verificar', verificacion: 'registro' });
    const resumen = await c.agente.get('/api/org/requisitos').set(h()).expect(200);
    expect(resumen.body.nivel).toBe('estandar');
    expect(resumen.body.porPaso.find((p: { paso: number }) => p.paso === 3)).toMatchObject({ total: 3, cumplen: 2 });
    expect(resumen.body.porPaso.map((p: { paso: number }) => p.paso)).not.toContain(11);
  });

  it('exporta los programas en PDF y los guarda como evidencia del paso 8', async () => {
    const pdf = await c.agente.get('/api/org/programas/exportar').set(h()).buffer(true).parse(binario).expect(200);
    const texto = textoPdf(pdf.body as Buffer);
    if (texto !== null) {
      expect(texto).toContain('PESV-PG-01');
      expect(texto).toContain('Revisión mensual de excesos del GPS');
      expect(texto).not.toContain('Ana Ruta');
    }
    const ev = await c.agente.post('/api/org/programas/evidencia').set(h()).expect(201);
    const evidencias = await c.agente.get('/api/org/evidencias?paso=8').set(h()).expect(200);
    expect(evidencias.body.some((e: { id: string }) => e.id === ev.body.evidenciaId)).toBe(true);
  });
});
