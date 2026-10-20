import { createHash } from 'node:crypto';
import {
  NIVEL_SINIESTRO_LABEL,
  nivelRiesgo,
  nivelSiniestro,
  type FormularioVigia,
  type Periodo,
} from '@pesv/shared';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { TenantTx } from '../db/database.service.js';
import {
  actions,
  crashes,
  drivers,
  goals,
  inspections,
  maintenancePlans,
  planActivities,
  roadRisks,
  trainingAttendance,
  trainings,
  trips,
  vehicles,
  workOrders,
} from '../db/schema.js';
import { vencimientoPlan } from '../mantenimiento/mantenimiento.module.js';

export interface Indicador {
  clave: string;
  nombre: string;
  valor: number | string;
}

export interface Hoja {
  nombre: string;
  columnas: string[];
  filas: (string | number | null)[][];
}

export interface ResultadoFormulario {
  indicadores: Indicador[];
  problemas: string[];
  hojas: Hoja[];
}

const inicio = (p: Periodo) => new Date(`${p.desde}T00:00:00-05:00`);
const fin = (p: Periodo) => new Date(new Date(`${p.hasta}T00:00:00-05:00`).getTime() + 86_400_000 - 1);
const diaColombia = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
const fechaHora = (d: Date) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);

/** Muestra determinista del 10 % de la flota para un periodo (siempre la misma para el mismo periodo). */
export function muestraDiezPorCiento<T extends { id: string }>(lista: T[], semilla: string): T[] {
  if (lista.length <= 10) return lista;
  const n = Math.ceil(lista.length * 0.1);
  return [...lista]
    .sort((a, b) => createHash('sha1').update(semilla + a.id).digest('hex').localeCompare(createHash('sha1').update(semilla + b.id).digest('hex')))
    .slice(0, n);
}

async function siniestros(tx: TenantTx, p: Periodo): Promise<ResultadoFormulario> {
  const filas = await tx.select().from(crashes).where(and(gte(crashes.occurredAt, inicio(p)), lte(crashes.occurredAt, fin(p))));
  const [{ km } = { km: 0 }] = await tx
    .select({ km: sql<number>`coalesce(sum(${trips.distanceKm}), 0)::float` })
    .from(trips)
    .where(and(gte(trips.departureAt, inicio(p)), lte(trips.departureAt, fin(p)), ne(trips.status, 'cancelado')));
  const porNivel = (n: ReturnType<typeof nivelSiniestro>) =>
    filas.filter((s) => nivelSiniestro({ fallecidos: s.fatalities, heridosGraves: s.seriousInjuries, heridosLeves: s.minorInjuries }) === n);
  const suma = (lista: typeof filas, campo: 'directCost' | 'indirectCost') => lista.reduce((t, s) => t + Number(s[campo]), 0);
  const problemas: string[] = [];
  for (const s of filas) {
    const etiqueta = `Siniestro del ${fechaHora(s.occurredAt)} (placa ${s.plate})`;
    if (!s.ipatNumber) problemas.push(`${etiqueta}: falta el número de IPAT`);
    if (!s.authority) problemas.push(`${etiqueta}: falta la autoridad que atendió`);
    if (!s.committeeReviewedOn) problemas.push(`${etiqueta}: falta la fecha de revisión del comité`);
  }
  const indicadores: Indicador[] = [
    { clave: 'siniestros', nombre: 'Siniestros viales en el periodo', valor: filas.length },
    { clave: 'fallecidos', nombre: 'Personas fallecidas', valor: filas.reduce((t, s) => t + s.fatalities, 0) },
    { clave: 'heridos_graves', nombre: 'Personas con lesiones graves', valor: filas.reduce((t, s) => t + s.seriousInjuries, 0) },
    { clave: 'heridos_leves', nombre: 'Personas con lesiones leves', valor: filas.reduce((t, s) => t + s.minorInjuries, 0) },
    { clave: 'choques_simples', nombre: 'Choques simples (solo daños)', valor: porNivel('solo_danos').length },
    { clave: 'km', nombre: 'Kilómetros recorridos en desplazamientos laborales', valor: Math.round(km) },
  ];
  for (const n of ['con_fallecidos', 'con_lesionados_graves', 'con_lesionados_leves', 'solo_danos'] as const) {
    const lista = porNivel(n);
    indicadores.push({ clave: `costo_directo_${n}`, nombre: `Costo directo · ${NIVEL_SINIESTRO_LABEL[n]} (COP)`, valor: suma(lista, 'directCost') });
    indicadores.push({ clave: `costo_indirecto_${n}`, nombre: `Costo indirecto · ${NIVEL_SINIESTRO_LABEL[n]} (COP)`, valor: suma(lista, 'indirectCost') });
  }
  return {
    indicadores,
    problemas,
    hojas: [
      {
        nombre: 'Registro de siniestros',
        columnas: [
          'Fecha', 'Nivel de pérdida', 'Fallecidos', 'Lesionados graves', 'Lesionados leves', 'Placa', 'Conductor', 'Cédula del conductor',
          'Número de IPAT', 'Autoridad', 'Fecha de revisión del comité', 'Costo directo (COP)', 'Costo indirecto (COP)',
        ],
        filas: filas.map((s) => [
          fechaHora(s.occurredAt),
          NIVEL_SINIESTRO_LABEL[nivelSiniestro({ fallecidos: s.fatalities, heridosGraves: s.seriousInjuries, heridosLeves: s.minorInjuries })],
          s.fatalities, s.seriousInjuries, s.minorInjuries, s.plate, s.driverName, s.driverDocument,
          s.ipatNumber, s.authority, s.committeeReviewedOn, Number(s.directCost), Number(s.indirectCost),
        ]),
      },
    ],
  };
}

async function administrativo(tx: TenantTx, p: Periodo): Promise<ResultadoFormulario> {
  const anio = Number(p.desde.slice(0, 4));
  const riesgos = await tx.select().from(roadRisks);
  const alInicio = riesgos.filter((r) => r.identifiedOn < `${anio}-01-01`).length;
  const alCierre = riesgos.filter((r) => r.identifiedOn <= p.hasta).length;
  const altos = riesgos.filter((r) => r.identifiedOn <= p.hasta && ['alto', 'extremo'].includes(nivelRiesgo(r.probability, r.severity).banda)).length;
  const metas = await tx.select().from(goals).where(eq(goals.year, anio));
  const cumplidas = metas.filter((m) => m.currentValue !== null && (m.direction === 'menor_o_igual' ? m.currentValue <= m.target : m.currentValue >= m.target)).length;
  const actividades = await tx.select().from(planActivities).where(and(gte(planActivities.plannedEnd, p.desde), lte(planActivities.plannedEnd, p.hasta), ne(planActivities.status, 'cancelada')));
  const caps = await tx.select().from(trainings).where(and(gte(trainings.plannedOn, p.desde), lte(trainings.plannedOn, p.hasta), ne(trainings.status, 'cancelada')));
  const asistencia = await tx
    .select({ a: trainingAttendance, t: trainings })
    .from(trainingAttendance)
    .innerJoin(trainings, eq(trainings.id, trainingAttendance.trainingId))
    .where(and(eq(trainingAttendance.attended, true), gte(trainings.executedOn, p.desde), lte(trainings.executedOn, p.hasta)));
  const conductores = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.active, true));
  const hallazgos = await tx.select().from(actions).where(sql`${actions.source} in ('auditoria', 'hallazgo')`);
  const abiertosEnPeriodo = hallazgos.filter((h) => diaColombia(h.createdAt) >= p.desde && diaColombia(h.createdAt) <= p.hasta).length;
  const cerradosEnPeriodo = hallazgos.filter((h) => h.closedAt && diaColombia(h.closedAt) >= p.desde && diaColombia(h.closedAt) <= p.hasta).length;
  const problemas: string[] = [];
  if (riesgos.length === 0) problemas.push('No hay riesgos viales registrados (paso 6)');
  if (metas.length === 0) problemas.push(`No hay metas registradas para ${anio} (paso 7)`);
  for (const t of caps.filter((c) => c.status === 'ejecutada')) {
    if (!asistencia.some((a) => a.t.id === t.id)) problemas.push(`La capacitación «${t.title}» no tiene lista de asistencia`);
  }
  return {
    indicadores: [
      { clave: 'riesgos_inicio', nombre: `Riesgos identificados al inicio de ${anio}`, valor: alInicio },
      { clave: 'riesgos_cierre', nombre: 'Riesgos identificados al cierre del periodo', valor: alCierre },
      { clave: 'riesgos_altos', nombre: 'Riesgos con valoración alta o extrema', valor: altos },
      { clave: 'metas_cumplidas', nombre: 'Metas del PESV cumplidas', valor: cumplidas },
      { clave: 'metas_total', nombre: 'Metas del PESV definidas', valor: metas.length },
      { clave: 'actividades_planeadas', nombre: 'Actividades del plan anual programadas en el periodo', valor: actividades.length },
      { clave: 'actividades_ejecutadas', nombre: 'Actividades del plan anual ejecutadas', valor: actividades.filter((a) => a.status === 'ejecutada').length },
      { clave: 'capacitaciones_programadas', nombre: 'Capacitaciones programadas', valor: caps.length },
      { clave: 'capacitaciones_ejecutadas', nombre: 'Capacitaciones ejecutadas', valor: caps.filter((c) => c.status === 'ejecutada').length },
      { clave: 'personas_capacitadas', nombre: 'Personas capacitadas', valor: new Set(asistencia.map((a) => a.a.documentNumber)).size },
      { clave: 'conductores_activos', nombre: 'Conductores activos (referencia de trabajadores expuestos)', valor: conductores.length },
      { clave: 'no_conformidades', nombre: 'No conformidades identificadas en el periodo', valor: abiertosEnPeriodo },
      { clave: 'no_conformidades_cerradas', nombre: 'No conformidades cerradas en el periodo', valor: cerradosEnPeriodo },
    ],
    problemas,
    hojas: [
      {
        nombre: 'Asistencia a capacitaciones',
        columnas: ['Nombre', 'Cédula', 'Fecha', 'Tema'],
        filas: asistencia.map((a) => [a.a.fullName, a.a.documentNumber, a.t.executedOn, a.t.topic]),
      },
      {
        nombre: 'Plan anual',
        columnas: ['Actividad', 'Paso', 'Responsable', 'Fin programado', 'Estado'],
        filas: actividades.map((a) => [a.title, a.stepNumber, a.responsibleName, a.plannedEnd, a.status]),
      },
    ],
  };
}

async function funcionamiento(tx: TenantTx, p: Periodo): Promise<ResultadoFormulario> {
  const filas = await tx
    .select({ t: trips, placa: vehicles.plate, conductor: drivers.fullName })
    .from(trips)
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .where(and(gte(trips.departureAt, inicio(p)), lte(trips.departureAt, fin(p)), ne(trips.status, 'cancelado')));
  const jornadas = new Set(filas.map((f) => `${f.t.driverId}|${diaColombia(f.t.departureAt)}`)).size;
  const problemas = filas.length ? [] : ['No hay viajes laborales registrados en el periodo (paso 15)'];
  return {
    indicadores: [
      { clave: 'excesos_jornada', nombre: 'Excesos de jornada de conductores', valor: filas.filter((f) => f.t.overShift).length },
      { clave: 'jornadas', nombre: 'Jornadas laborales de conductores (conductor por día)', valor: jornadas },
      { clave: 'viajes_exceso_velocidad', nombre: 'Viajes con exceso de velocidad', valor: filas.filter((f) => f.t.speeding).length },
      { clave: 'viajes', nombre: 'Viajes laborales', valor: filas.length },
    ],
    problemas,
    hojas: [
      {
        nombre: 'Viajes laborales',
        columnas: ['Salida', 'Placa', 'Conductor', 'Km', 'Velocidad máxima', 'Exceso de velocidad', 'Exceso de jornada', 'Origen del dato'],
        filas: filas.map((f) => [fechaHora(f.t.departureAt), f.placa, f.conductor, f.t.distanceKm, f.t.maxSpeedKmh, f.t.speeding ? 'Sí' : 'No', f.t.overShift ? 'Sí' : 'No', f.t.source]),
      },
    ],
  };
}

async function vehiculosForm(tx: TenantTx, p: Periodo): Promise<ResultadoFormulario> {
  const flota = await tx.select().from(vehicles).where(ne(vehicles.status, 'inactivo'));
  const insp = await tx
    .select({ i: inspections, placa: vehicles.plate })
    .from(inspections)
    .innerJoin(vehicles, eq(vehicles.id, inspections.vehicleId))
    .where(and(gte(inspections.performedAt, inicio(p)), lte(inspections.performedAt, fin(p))));
  const viajes = await tx.select().from(trips).where(and(gte(trips.departureAt, inicio(p)), lte(trips.departureAt, fin(p)), ne(trips.status, 'cancelado')));
  const ordenes = await tx
    .select({ o: workOrders, placa: vehicles.plate })
    .from(workOrders)
    .innerJoin(vehicles, eq(vehicles.id, workOrders.vehicleId))
    .where(and(eq(workOrders.kind, 'preventivo'), eq(workOrders.status, 'cerrada'), gte(workOrders.closedAt, inicio(p)), lte(workOrders.closedAt, fin(p))));
  const planes = await tx.select().from(maintenancePlans).where(eq(maintenancePlans.active, true));
  const planeados = planes.filter((pl) => {
    const v = flota.find((f) => f.id === pl.vehicleId);
    const vence = vencimientoPlan(pl, v?.odometerKm ?? null, new Date(`${p.hasta}T12:00:00Z`));
    return vence.proximaFecha ? vence.proximaFecha >= p.desde && vence.proximaFecha <= p.hasta : vence.estado === 'vencido';
  }).length;
  const dias = new Set([...insp.map((x) => diaColombia(x.i.performedAt)), ...viajes.map((v) => diaColombia(v.departureAt))]);
  const promedio = (fn: (dia: string) => number) => (dias.size ? Math.round(([...dias].reduce((t, d) => t + fn(d), 0) / dias.size) * 10) / 10 : 0);
  const inspeccionadosDia = promedio((d) => new Set(insp.filter((x) => diaColombia(x.i.performedAt) === d).map((x) => x.i.vehicleId)).size);
  const operandoDia = promedio((d) => new Set([...insp.filter((x) => diaColombia(x.i.performedAt) === d).map((x) => x.i.vehicleId), ...viajes.filter((v) => diaColombia(v.departureAt) === d).map((v) => v.vehicleId)]).size);
  const muestra = muestraDiezPorCiento(flota, p.id);
  const idsMuestra = new Set(muestra.map((m) => m.id));
  const problemas: string[] = [];
  if (insp.length === 0) problemas.push('No hay preoperacionales registrados en el periodo (paso 16)');
  if (planes.length === 0) problemas.push('No hay planes de mantenimiento preventivo (paso 17)');
  return {
    indicadores: [
      { clave: 'vehiculos_programa_velocidad', nombre: 'Vehículos en el programa de gestión de velocidad', valor: new Set(viajes.filter((v) => v.maxSpeedKmh !== null).map((v) => v.vehicleId)).size },
      { clave: 'vehiculos_viajes', nombre: 'Vehículos usados en desplazamientos laborales', valor: new Set(viajes.map((v) => v.vehicleId)).size },
      { clave: 'inspeccionados_dia', nombre: 'Vehículos inspeccionados por día (promedio)', valor: inspeccionadosDia },
      { clave: 'operando_dia', nombre: 'Vehículos en operación por día (promedio)', valor: operandoDia },
      { clave: 'con_fallas', nombre: 'Vehículos que reportaron fallas', valor: new Set(insp.filter((x) => x.i.result !== 'apto').map((x) => x.i.vehicleId)).size },
      { clave: 'preventivos_planeados', nombre: 'Mantenimientos preventivos programados', valor: planeados },
      { clave: 'preventivos_ejecutados', nombre: 'Mantenimientos preventivos ejecutados', valor: ordenes.length },
      { clave: 'muestra', nombre: 'Vehículos en la muestra del 10 %', valor: muestra.length },
    ],
    problemas,
    hojas: [
      {
        nombre: 'Relación de preoperacionales',
        columnas: ['Fecha', 'Placa', 'Resultado', 'Odómetro (km)', 'En muestra 10 %'],
        filas: insp.map((x) => [fechaHora(x.i.performedAt), x.placa, x.i.result, x.i.odometerKm, idsMuestra.has(x.i.vehicleId) ? 'Sí' : 'No']),
      },
      {
        nombre: 'Mantenimientos muestra 10 %',
        columnas: ['Fecha', 'Placa', 'Tipo', 'Proveedor', 'NIT', 'Técnico', 'Cédula del técnico', 'Cargo'],
        filas: ordenes
          .filter((o) => idsMuestra.has(o.o.vehicleId))
          .map((o) => [o.o.closedAt ? fechaHora(o.o.closedAt) : null, o.placa, o.o.kind, o.o.providerName, o.o.providerNit, o.o.technicianName, o.o.technicianDocument, o.o.technicianRole]),
      },
    ],
  };
}

export function calcularFormulario(tx: TenantTx, formulario: FormularioVigia, p: Periodo) {
  switch (formulario) {
    case 'siniestros':
      return siniestros(tx, p);
    case 'administrativo':
      return administrativo(tx, p);
    case 'funcionamiento':
      return funcionamiento(tx, p);
    case 'vehiculos':
      return vehiculosForm(tx, p);
  }
}
