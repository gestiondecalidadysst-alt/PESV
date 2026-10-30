import { evaluarRiesgo, indicadoresFormacion, valorIndicador, type CalculoIndicador, type MetodologiaRiesgo, type PeriodoIndicador, type UnidadIndicador } from '@pesv/shared';
import { sql } from 'drizzle-orm';
import type { TenantTx } from '../db/database.service.js';

export interface Medicion {
  numerador: number;
  denominador: number | null;
  detalle: string;
}

/** Fecha local de Colombia de una columna timestamptz. */
const dia = (columna: string) => sql.raw(`(${columna} at time zone 'America/Bogota')::date`);

async function filas<T>(tx: TenantTx, consulta: ReturnType<typeof sql>) {
  return (await tx.execute(consulta)).rows as T[];
}
const entero = (v: unknown) => Number(v ?? 0);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Mide un indicador automático en un periodo con los datos de la plataforma. Devuelve null cuando
 * el periodo aún no empieza (no hay nada que medir).
 */
export async function medir(tx: TenantTx, calculo: CalculoIndicador, p: PeriodoIndicador, hoy: string): Promise<Medicion | null> {
  if (p.desde > hoy) return null;
  const { desde, hasta } = p;
  const anio = Number(desde.slice(0, 4));

  switch (calculo) {
    case 'cumplimiento_plan_trabajo': {
      const mesDesde = Number(desde.slice(5, 7));
      const mesHasta = Number(hasta.slice(5, 7));
      const [r] = await filas<{ programados: number; ejecutados: number }>(
        tx,
        sql`select count(*)::int as programados,
                   count(f.id) filter (where f.executed)::int as ejecutados
              from plan_activities a
              cross join lateral unnest(a.planned_months) as m(mes)
              left join plan_followups f on f.activity_id = a.id and f.month = m.mes
             where a.year = ${anio} and a.status <> 'cancelada' and m.mes between ${mesDesde} and ${mesHasta}`,
      );
      return { numerador: entero(r?.ejecutados), denominador: entero(r?.programados), detalle: `${entero(r?.ejecutados)} de ${entero(r?.programados)} meses-actividad ejecutados` };
    }
    case 'cumplimiento_formacion': {
      const [r] = await filas<{ programadas: number; ejecutadas: number }>(
        tx,
        sql`select count(*)::int as programadas, count(*) filter (where status = 'ejecutada')::int as ejecutadas
              from trainings where status <> 'cancelada' and planned_on between ${desde} and ${hasta}`,
      );
      return { numerador: entero(r?.ejecutadas), denominador: entero(r?.programadas), detalle: `${entero(r?.ejecutadas)} de ${entero(r?.programadas)} capacitaciones ejecutadas` };
    }
    case 'cobertura_formacion': {
      const [r] = await filas<{ activos: number; formados: number }>(
        tx,
        sql`select count(*)::int as activos,
                   count(*) filter (where exists (
                     select 1 from training_attendance a join trainings t on t.id = a.training_id
                      where a.driver_id = d.id and a.attended and t.status = 'ejecutada'
                        and t.executed_on between ${`${anio}-01-01`} and ${hasta}))::int as formados
              from drivers d where d.active`,
      );
      return { numerador: entero(r?.formados), denominador: entero(r?.activos), detalle: `${entero(r?.formados)} de ${entero(r?.activos)} conductores activos formados en el año` };
    }
    case 'eficacia_formacion': {
      const caps = await filas<{ id: string; status: 'ejecutada'; planned_on: string; hours: number | null; passing_score: number; driver_id: string | null; attended: boolean; score: number | null }>(
        tx,
        sql`select t.id, t.status, t.planned_on::text, t.hours::float, t.passing_score::float, a.driver_id, a.attended, a.score::float
              from trainings t join training_attendance a on a.training_id = t.id
             where t.status = 'ejecutada' and t.executed_on between ${desde} and ${hasta}`,
      );
      const porCap = new Map<string, { estado: 'ejecutada'; programadaEl: string; horas: number | null; notaMinima: number; asistentes: { conductorId: string | null; asistio: boolean; nota: number | null }[] }>();
      for (const c of caps) {
        const x = porCap.get(c.id) ?? { estado: 'ejecutada' as const, programadaEl: c.planned_on, horas: c.hours, notaMinima: c.passing_score, asistentes: [] };
        x.asistentes.push({ conductorId: c.driver_id, asistio: c.attended, nota: c.score });
        porCap.set(c.id, x);
      }
      const i = indicadoresFormacion([...porCap.values()], [], hasta);
      return { numerador: i.aprobados, denominador: i.evaluados, detalle: `${i.aprobados} de ${i.evaluados} evaluados aprobaron` };
    }
    case 'inspecciones_preoperacionales': {
      const [r] = await filas<{ activos: number; inspeccionados: number }>(
        tx,
        sql`select count(*)::int as activos,
                   count(*) filter (where exists (
                     select 1 from inspections i where i.vehicle_id = v.id and ${dia('i.performed_at')} between ${desde} and ${hasta}))::int as inspeccionados
              from vehicles v where v.status <> 'inactivo' and v.motorized`,
      );
      return { numerador: entero(r?.inspeccionados), denominador: entero(r?.activos), detalle: `${entero(r?.inspeccionados)} de ${entero(r?.activos)} vehículos con inspección` };
    }
    case 'mantenimiento_preventivo': {
      const [r] = await filas<{ abiertas: number; cerradas: number }>(
        tx,
        sql`select count(*)::int as abiertas, count(*) filter (where status = 'cerrada')::int as cerradas
              from work_orders where kind = 'preventivo' and ${dia('opened_at')} between ${desde} and ${hasta}`,
      );
      return { numerador: entero(r?.cerradas), denominador: entero(r?.abiertas), detalle: `${entero(r?.cerradas)} de ${entero(r?.abiertas)} órdenes preventivas cerradas` };
    }
    case 'siniestros_viales':
    case 'victimas_fatales':
    case 'lesionados':
    case 'tasa_siniestralidad': {
      const [r] = await filas<{ siniestros: number; fallecidos: number; lesionados: number }>(
        tx,
        sql`select count(*)::int as siniestros, coalesce(sum(fatalities), 0)::int as fallecidos,
                   coalesce(sum(serious_injuries + minor_injuries), 0)::int as lesionados
              from crashes where ${dia('occurred_at')} between ${desde} and ${hasta}`,
      );
      if (calculo === 'siniestros_viales') return { numerador: entero(r?.siniestros), denominador: null, detalle: `${plural(entero(r?.siniestros), 'siniestro', 'siniestros')} en el periodo` };
      if (calculo === 'victimas_fatales') return { numerador: entero(r?.fallecidos), denominador: null, detalle: plural(entero(r?.fallecidos), 'víctima fatal', 'víctimas fatales') };
      if (calculo === 'lesionados') return { numerador: entero(r?.lesionados), denominador: null, detalle: plural(entero(r?.lesionados), 'lesionado', 'lesionados') };
      const [k] = await filas<{ km: number }>(
        tx,
        sql`select coalesce(sum(distance_km), 0)::float as km from trips where status <> 'cancelado' and ${dia('departure_at')} between ${desde} and ${hasta}`,
      );
      const km = Math.round(entero(k?.km));
      return { numerador: entero(r?.siniestros), denominador: km, detalle: `${plural(entero(r?.siniestros), 'siniestro', 'siniestros')} en ${new Intl.NumberFormat('es-CO').format(km)} km` };
    }
    case 'riesgos_criticos_intervenidos': {
      const riesgos = await filas<{ id: string; methodology: MetodologiaRiesgo; deficiency: number | null; exposure: number | null; consequence: number | null; probability: number | null; severity: number | null; intervenido: boolean }>(
        tx,
        sql`select r.id, r.methodology, r.deficiency, r.exposure, r.consequence, r.probability, r.severity,
                   exists (select 1 from risk_measures m where m.risk_id = r.id and m.status = 'implementada'
                            and ${dia('m.updated_at')} <= ${hasta}) as intervenido
              from road_risks r where r.identified_on <= ${hasta}`,
      );
      const criticos = riesgos.filter((r) => evaluarRiesgo(r.methodology, { deficiencia: r.deficiency, exposicion: r.exposure, consecuencia: r.consequence, probabilidad: r.probability, severidad: r.severity })?.critico);
      const intervenidos = criticos.filter((r) => r.intervenido).length;
      return { numerador: intervenidos, denominador: criticos.length, detalle: `${intervenidos} de ${criticos.length} riesgos críticos con medida implementada` };
    }
    case 'acciones_a_tiempo': {
      const [r] = await filas<{ total: number; a_tiempo: number }>(
        tx,
        sql`select count(*)::int as total,
                   count(*) filter (where status = 'cerrada' and ${dia('closed_at')} <= due_on)::int as a_tiempo
              from actions where due_on between ${desde} and ${hasta} and due_on <= ${hoy}`,
      );
      return { numerador: entero(r?.a_tiempo), denominador: entero(r?.total), detalle: `${entero(r?.a_tiempo)} de ${entero(r?.total)} acciones cerradas a tiempo` };
    }
    case 'costos_siniestros': {
      const [r] = await filas<{ siniestros: number; costo: number }>(
        tx,
        sql`select count(*)::int as siniestros, coalesce(sum(direct_cost + indirect_cost), 0)::float as costo
              from crashes where ${dia('occurred_at')} between ${desde} and ${hasta}`,
      );
      const costo = Math.round(Number(r?.costo ?? 0));
      return { numerador: costo, denominador: null, detalle: `$ ${new Intl.NumberFormat('es-CO').format(costo)} en ${plural(entero(r?.siniestros), 'siniestro', 'siniestros')}` };
    }
    case 'excesos_jornada':
    case 'excesos_velocidad': {
      const [r] = await filas<{ viajes: number; jornada: number; velocidad: number }>(
        tx,
        sql`select count(*)::int as viajes, count(*) filter (where over_shift)::int as jornada, count(*) filter (where speeding)::int as velocidad
              from trips where status <> 'cancelado' and ${dia('departure_at')} between ${desde} and ${hasta}`,
      );
      const excesos = entero(calculo === 'excesos_jornada' ? r?.jornada : r?.velocidad);
      return { numerador: excesos, denominador: entero(r?.viajes), detalle: `${excesos} de ${plural(entero(r?.viajes), 'desplazamiento', 'desplazamientos')} con exceso de ${calculo === 'excesos_jornada' ? 'jornada' : 'velocidad'}` };
    }
    case 'cobertura_programa_velocidad': {
      const [r] = await filas<{ activos: number; cubiertos: number }>(
        tx,
        sql`select count(*)::int as activos,
                   count(*) filter (where exists (
                     select 1 from speed_devices d where d.vehicle_id = v.id and d.active and ${dia('d.created_at')} <= ${hasta}
                        and (d.calibration_expires_on is null or d.calibration_expires_on >= ${hasta})))::int as cubiertos
              from vehicles v where v.status <> 'inactivo' and v.motorized`,
      );
      return { numerador: entero(r?.cubiertos), denominador: entero(r?.activos), detalle: `${entero(r?.cubiertos)} de ${entero(r?.activos)} vehículos con equipo de control de velocidad` };
    }
    case 'nc_auditoria_cerradas': {
      const [r] = await filas<{ total: number; cerradas: number }>(
        tx,
        sql`select count(*)::int as total, count(*) filter (where status = 'cerrado' and ${dia('closed_at')} <= ${hasta})::int as cerradas
              from audit_findings
             where kind in ('no_conformidad_mayor', 'no_conformidad_menor') and ${dia('created_at')} between ${desde} and ${hasta}`,
      );
      return { numerador: entero(r?.cerradas), denominador: entero(r?.total), detalle: `${entero(r?.cerradas)} de ${plural(entero(r?.total), 'no conformidad', 'no conformidades')} cerradas` };
    }
    case 'cumplimiento_metas': {
      const metas = await filas<{ target: number; direction: 'mayor_o_igual' | 'menor_o_igual'; current_value: number | null; calculation: CalculoIndicador | null; unit: UnidadIndicador | null; registrado: number | null }>(
        tx,
        sql`select g.target::float, g.direction, g.current_value::float, i.calculation, i.unit,
                   (select r.value::float from indicator_results r
                     where r.indicator_id = i.id and r.value is not null and r.period like ${`${anio}%`}
                     order by r.period desc limit 1) as registrado
              from goals g left join indicators i on i.id = g.indicator_id
             where g.year = ${anio}`,
      );
      let medidas = 0;
      let cumplen = 0;
      for (const m of metas) {
        let valor: number | null = m.registrado ?? (m.calculation ? null : m.current_value);
        if (valor == null && m.calculation && m.calculation !== 'cumplimiento_metas' && m.unit) {
          const anual = await medir(tx, m.calculation, { id: `${anio}`, etiqueta: String(anio), desde: `${anio}-01-01`, hasta }, hoy);
          valor = anual ? valorIndicador(m.unit, anual.numerador, anual.denominador) : null;
        }
        if (valor == null) continue;
        medidas += 1;
        if (m.direction === 'mayor_o_igual' ? valor >= m.target : valor <= m.target) cumplen += 1;
      }
      return { numerador: cumplen, denominador: medidas, detalle: `${cumplen} de ${plural(medidas, 'meta medida', 'metas medidas')} cumplen (${metas.length} en el año)` };
    }
  }
}
