import {
  estadoVerificacionManual,
  evaluarRiesgo,
  finDeTrimestre,
  PASOS_PESV,
  periodosDelAnio,
  requisitosDelPaso,
  TABLA_10_INDICADORES,
  trimestreAnterior,
  TIPOS_PROGRAMA,
  type EstadoRequisito,
  type Frecuencia,
  type MetodologiaRiesgo,
  type Nivel,
  type ReglaRequisito,
  type RequisitoPaso,
} from '@pesv/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { fechaColombia, hoyColombia, restarMeses } from '../common/fechas.js';
import type { TenantTx } from '../db/database.service.js';
import { evidences, stepRequirementChecks, users } from '../db/schema.js';
import { estadoProgramas, programasFaltantes } from '../programas/estado.js';

export interface ResultadoRequisito {
  id: string;
  paso: number;
  texto: string;
  cita: string;
  obligatorio: boolean;
  verificacion: 'dato' | 'documento' | 'registro';
  criterio: string | null;
  ruta: string | null;
  porValidar: string | null;
  vigenciaMeses: number | null;
  estado: EstadoRequisito;
  detalle: string;
  verificado: { fecha: string; por: string | null; nota: string; evidenciaId: string | null; evidencia: string | null } | null;
}

interface Resultado {
  cumple: boolean;
  detalle: string;
}


const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const dia = (columna: string) => sql.raw(`(${columna} at time zone 'America/Bogota')::date`);

async function filas<T>(tx: TenantTx, consulta: ReturnType<typeof sql>) {
  return (await tx.execute(consulta)).rows as T[];
}
async function uno<T>(tx: TenantTx, consulta: ReturnType<typeof sql>) {
  return (await filas<T>(tx, consulta))[0]!;
}

/** Trimestres completos de los últimos doce meses que terminaron después de crear la organización. */
function trimestresExigibles(hoy: string, creada: string) {
  const lista: string[] = [];
  let t = trimestreAnterior(hoy);
  for (let i = 0; i < 4; i++) {
    if (finDeTrimestre(t) >= creada) lista.push(t);
    t = trimestreAnterior(`${finDeTrimestre(t).slice(0, 8)}01`);
  }
  return lista;
}

const rangoTrimestre = (t: string) => {
  const fin = finDeTrimestre(t);
  const inicio = restarMeses(`${fin.slice(0, 8)}01`, 2);
  return { inicio, fin };
};

type Contexto = { tx: TenantTx; hoy: string; hace12: string; nivel: Nivel; creada: string };

/** Reglas fijas que verifican un requisito con los datos de la organización (RN-07). */
const REGLAS: Record<ReglaRequisito, (c: Contexto) => Promise<Resultado>> = {
  async comite_integrantes({ tx }) {
    const r = await uno<{ activos: number; lider: boolean }>(
      tx,
      sql`select count(*)::int as activos,
                 exists (select 1 from committee_members c join memberships m on m.user_id = c.user_id and m.organization_id = c.organization_id
                          where c.active and m.role = 'lider_pesv') as lider
            from committee_members where active`,
    );
    if (r.activos < 3) return { cumple: false, detalle: `${plural(r.activos, 'integrante activo', 'integrantes activos')}; se requieren al menos tres.` };
    return r.lider
      ? { cumple: true, detalle: `${r.activos} integrantes activos, incluido el líder del PESV.` }
      : { cumple: false, detalle: `${r.activos} integrantes activos, pero el líder del PESV no está en el comité.` };
  },

  async comite_trimestral({ tx, hoy, creada }) {
    const trimestres = trimestresExigibles(hoy, creada);
    if (!trimestres.length) return { cumple: true, detalle: 'Aún no termina el primer trimestre desde el registro de la organización.' };
    const sin: string[] = [];
    for (const t of trimestres) {
      const { inicio, fin } = rangoTrimestre(t);
      const r = await uno<{ n: number }>(tx, sql`select count(*)::int as n from committee_meetings where status in ('cerrada', 'firmada') and ${dia('scheduled_at')} between ${inicio} and ${fin}`);
      if (r.n === 0) sin.push(t);
    }
    return sin.length
      ? { cumple: false, detalle: `Sin reunión cerrada en: ${sin.join(', ')}.` }
      : { cumple: true, detalle: `Reunión cerrada en cada trimestre: ${trimestres.join(', ')}.` };
  },

  async perfil_colaboradores({ tx, hace12 }) {
    const r = await uno<{ conductores: number; respuestas: number }>(
      tx,
      sql`select (select count(*)::int from drivers where active) as conductores,
                 (select count(*)::int from survey_responses where ${dia('submitted_at')} >= ${hace12}) as respuestas`,
    );
    if (!r.conductores) return { cumple: false, detalle: 'No hay conductores registrados.' };
    return r.respuestas
      ? { cumple: true, detalle: `${r.conductores} conductores activos y ${plural(r.respuestas, 'respuesta', 'respuestas')} de la encuesta de perfil en los últimos doce meses.` }
      : { cumple: false, detalle: `${r.conductores} conductores activos, pero ninguna respuesta de la encuesta de perfil en los últimos doce meses.` };
  },

  async flota_registrada({ tx }) {
    const r = await uno<{ total: number; sin_soat: number; sin_rtm: number }>(
      tx,
      sql`select count(*)::int as total,
                 count(*) filter (where motorized and soat_expires_on is null)::int as sin_soat,
                 count(*) filter (where motorized and rtm_expires_on is null)::int as sin_rtm
            from vehicles where status <> 'inactivo'`,
    );
    if (!r.total) return { cumple: false, detalle: 'No hay vehículos registrados.' };
    const extra = r.sin_rtm ? ` ${plural(r.sin_rtm, 'automotor', 'automotores')} sin fecha de revisión técnico-mecánica (revisa si aplica).` : '';
    return r.sin_soat
      ? { cumple: false, detalle: `${plural(r.sin_soat, 'automotor', 'automotores')} sin fecha de SOAT.${extra}` }
      : { cumple: true, detalle: `${plural(r.total, 'vehículo registrado', 'vehículos registrados')}.${extra}` };
  },

  async rutas_registradas({ tx }) {
    const r = await uno<{ n: number }>(tx, sql`select count(*)::int as n from routes where active and distance_km > 0 and trips_per_month > 0`);
    return r.n ? { cumple: true, detalle: `${plural(r.n, 'ruta activa', 'rutas activas')} con distancia y frecuencia.` } : { cumple: false, detalle: 'No hay rutas con distancia y frecuencia de uso.' };
  },

  async matriz_riesgos({ tx }) {
    const riesgos = await riesgosValorados(tx);
    if (!riesgos.length) return { cumple: false, detalle: 'La matriz no tiene riesgos.' };
    const sin = riesgos.filter((r) => !r.evaluacion).length;
    return sin ? { cumple: false, detalle: `${plural(sin, 'riesgo', 'riesgos')} sin valorar de ${riesgos.length}.` } : { cumple: true, detalle: `${plural(riesgos.length, 'riesgo identificado y valorado', 'riesgos identificados y valorados')}.` };
  },

  async matriz_exposicion({ tx }) {
    const r = await uno<{ total: number; sin: number }>(tx, sql`select count(*)::int as total, count(*) filter (where methodology <> 'gtc45' or exposure is null)::int as sin from road_risks`);
    if (!r.total) return { cumple: false, detalle: 'La matriz no tiene riesgos.' };
    return r.sin
      ? { cumple: false, detalle: `${plural(r.sin, 'riesgo valorado', 'riesgos valorados')} sin exposición (por ejemplo, con la matriz 5×5).` }
      : { cumple: true, detalle: 'Todos los riesgos se valoran con exposición.' };
  },

  async riesgos_criticos_con_medida({ tx }) {
    const riesgos = await riesgosValorados(tx);
    const criticos = riesgos.filter((r) => r.evaluacion?.critico);
    if (!riesgos.length) return { cumple: false, detalle: 'La matriz no tiene riesgos.' };
    const sin = criticos.filter((r) => !r.medidas).length;
    if (!criticos.length) return { cumple: true, detalle: 'No hay riesgos críticos.' };
    return sin ? { cumple: false, detalle: `${sin} de ${plural(criticos.length, 'riesgo crítico', 'riesgos críticos')} sin medida de intervención.` } : { cumple: true, detalle: `Los ${criticos.length} riesgos críticos tienen medidas.` };
  },

  async matriz_actualizada({ tx, hace12 }) {
    const r = await uno<{ ultima: string | null }>(tx, sql`select max(${dia('updated_at')})::text as ultima from road_risks`);
    if (!r.ultima) return { cumple: false, detalle: 'La matriz no tiene riesgos.' };
    return r.ultima >= hace12 ? { cumple: true, detalle: `Última actualización: ${r.ultima}.` } : { cumple: false, detalle: `Última actualización: ${r.ultima}; tiene más de un año.` };
  },

  async matriz_tras_siniestro({ tx, hace12 }) {
    const lista = await filas<{ fecha: string; actualizada: boolean }>(
      tx,
      sql`select ${dia('c.occurred_at')}::text as fecha,
                 exists (select 1 from road_risks r where r.updated_at > c.occurred_at) as actualizada
            from crashes c where c.fatalities + c.serious_injuries + c.minor_injuries > 0 and ${dia('c.occurred_at')} >= ${hace12}`,
    );
    if (!lista.length) return { cumple: true, detalle: 'Sin siniestros con víctimas en los últimos doce meses.' };
    const sin = lista.filter((s) => !s.actualizada);
    return sin.length ? { cumple: false, detalle: `Falta actualizar la matriz después del siniestro del ${sin.map((s) => s.fecha).join(', ')}.` } : { cumple: true, detalle: `Matriz actualizada después de ${plural(lista.length, 'siniestro con víctimas', 'siniestros con víctimas')}.` };
  },

  async metas_anio({ tx, hoy }) {
    const r = await uno<{ total: number; con: number }>(tx, sql`select count(*)::int as total, count(*) filter (where indicator_id is not null)::int as con from goals where year = ${Number(hoy.slice(0, 4))}`);
    if (!r.total) return { cumple: false, detalle: `No hay metas para ${hoy.slice(0, 4)}.` };
    return r.con ? { cumple: true, detalle: `${plural(r.total, 'meta', 'metas')} del año, ${r.con} con indicador.` } : { cumple: false, detalle: `${plural(r.total, 'meta', 'metas')} del año, ninguna ligada a un indicador.` };
  },

  async programas_completos({ tx }) {
    const lista = await estadoProgramas(tx);
    const faltan = programasFaltantes(lista);
    const nombres = (ids: readonly string[]) => ids.map((t) => TIPOS_PROGRAMA.find((x) => x.id === t)!.nombre.replace('Programa de ', '')).join(', ');
    if (faltan.length) return { cumple: false, detalle: `Falta crear: ${nombres(faltan)}.` };
    const incompletos = lista.filter((p) => p.fila.kind !== 'otro' && !p.completo);
    return incompletos.length
      ? { cumple: false, detalle: `Incompletos: ${incompletos.map((p) => `${p.fila.name} (${p.avance} %)`).join('; ')}.` }
      : { cumple: true, detalle: 'Los cinco programas obligatorios tienen todo su contenido mínimo.' };
  },

  async equipos_velocidad({ tx, hoy }) {
    const r = await uno<{ activos: number; sin: number; vencidos: number }>(
      tx,
      sql`select count(*)::int as activos,
                 count(*) filter (where calibrated_on is null or calibration_expires_on is null)::int as sin,
                 count(*) filter (where calibration_expires_on < ${hoy})::int as vencidos
            from speed_devices where active`,
    );
    if (!r.activos) return { cumple: false, detalle: 'No hay equipos de medición de velocidad registrados.' };
    if (r.vencidos) return { cumple: false, detalle: `${plural(r.vencidos, 'equipo', 'equipos')} con la calibración vencida.` };
    if (r.sin) return { cumple: false, detalle: `${plural(r.sin, 'equipo', 'equipos')} sin calibración registrada.` };
    return { cumple: true, detalle: `${plural(r.activos, 'equipo activo', 'equipos activos')} con calibración vigente.` };
  },

  async pruebas_sustancias({ tx, hace12 }) {
    const r = await uno<{ conductores: number; aleatorias: number; alcohol: number; sustancias: number }>(
      tx,
      sql`select (select count(*)::int from drivers where active) as conductores,
                 (select count(*)::int from substance_tests where kind like '%aleatoria' and performed_on >= ${hace12} and result <> 'no_realizada') as aleatorias,
                 (select count(*)::int from drivers d where d.active and exists (select 1 from substance_tests t where t.driver_id = d.id and t.kind = 'alcohol_sangre_anual' and t.performed_on >= ${hace12} and t.result <> 'no_realizada')) as alcohol,
                 (select count(*)::int from drivers d where d.active and exists (select 1 from substance_tests t where t.driver_id = d.id and t.kind = 'sustancias_orina_anual' and t.performed_on >= ${hace12} and t.result <> 'no_realizada')) as sustancias`,
    );
    if (!r.conductores) return { cumple: false, detalle: 'No hay conductores activos.' };
    const faltas: string[] = [];
    if (!r.aleatorias) faltas.push('sin pruebas aleatorias en los últimos doce meses');
    if (r.alcohol < r.conductores) faltas.push(`control anual de alcohol: ${r.alcohol} de ${r.conductores} conductores`);
    if (r.sustancias < r.conductores) faltas.push(`control anual de sustancias: ${r.sustancias} de ${r.conductores} conductores`);
    return faltas.length ? { cumple: false, detalle: `${faltas.join('; ')}.` } : { cumple: true, detalle: `${plural(r.aleatorias, 'prueba aleatoria', 'pruebas aleatorias')} y controles anuales vigentes para los ${r.conductores} conductores.` };
  },

  async programas_actualizados({ tx, hace12 }) {
    const lista = (await estadoProgramas(tx)).filter((p) => p.fila.kind !== 'otro');
    if (programasFaltantes(lista).length) return { cumple: false, detalle: 'Primero crea los cinco programas obligatorios.' };
    const viejos = lista.filter((p) => !p.fila.reviewedOn || p.fila.reviewedOn < hace12 || !p.fila.disseminatedOn || p.fila.disseminatedOn < hace12);
    return viejos.length ? { cumple: false, detalle: `Sin actualización o divulgación en el último año: ${viejos.map((p) => p.fila.name).join('; ')}.` } : { cumple: true, detalle: 'Los programas se actualizaron y divulgaron en el último año.' };
  },

  async programas_revision_trimestral({ tx, hoy, creada }) {
    const t = trimestreAnterior(hoy);
    if (finDeTrimestre(t) < creada) return { cumple: true, detalle: 'Aún no termina el primer trimestre desde el registro de la organización.' };
    const r = await uno<{ n: number }>(tx, sql`select count(*)::int as n from program_reviews where period = ${t}`);
    return r.n ? { cumple: true, detalle: `Revisión del trimestre ${t} registrada.` } : { cumple: false, detalle: `Falta la revisión de los programas del trimestre ${t}.` };
  },

  async plan_trabajo_anio({ tx, hoy }) {
    const r = await uno<{ total: number; con_meta: number }>(
      tx,
      sql`select count(*)::int as total, count(*) filter (where goal_id is not null)::int as con_meta
            from plan_activities where year = ${Number(hoy.slice(0, 4))} and status <> 'cancelada'`,
    );
    if (!r.total) return { cumple: false, detalle: `No hay actividades para ${hoy.slice(0, 4)}.` };
    return r.con_meta ? { cumple: true, detalle: `${plural(r.total, 'actividad', 'actividades')} con responsable y cronograma; ${r.con_meta} ligadas a metas.` } : { cumple: false, detalle: `${plural(r.total, 'actividad', 'actividades')}, ninguna ligada a una meta del PESV.` };
  },

  async plan_formacion_anio({ tx, hoy }) {
    const r = await uno<{ total: number; incompletas: number }>(
      tx,
      sql`select count(*)::int as total, count(*) filter (where hours is null or instructor is null)::int as incompletas
            from trainings where year = ${Number(hoy.slice(0, 4))} and status <> 'cancelada'`,
    );
    if (!r.total) return { cumple: false, detalle: `No hay capacitaciones programadas para ${hoy.slice(0, 4)}.` };
    return r.incompletas ? { cumple: false, detalle: `${plural(r.incompletas, 'capacitación', 'capacitaciones')} sin horas o sin facilitador.` } : { cumple: true, detalle: `${plural(r.total, 'capacitación programada', 'capacitaciones programadas')} con horas y facilitador.` };
  },

  async formacion_por_riesgo({ tx, hoy }) {
    const r = await uno<{ n: number }>(tx, sql`select count(*)::int as n from trainings where year = ${Number(hoy.slice(0, 4))} and status <> 'cancelada' and risk_id is not null`);
    return r.n ? { cumple: true, detalle: `${plural(r.n, 'capacitación ligada', 'capacitaciones ligadas')} a riesgos de la matriz.` } : { cumple: false, detalle: 'Ninguna capacitación del año está ligada a un riesgo.' };
  },

  async formacion_emergencias({ tx, hace12 }) {
    const r = await uno<{ ultima: string | null }>(tx, sql`select max(executed_on)::text as ultima from trainings where topic_id = 'emergencias' and status = 'ejecutada' and executed_on >= ${hace12}`);
    return r.ultima ? { cumple: true, detalle: `Última capacitación en emergencias: ${r.ultima}.` } : { cumple: false, detalle: 'Sin capacitación ejecutada en emergencias en los últimos doce meses.' };
  },

  async siniestros_investigados({ tx, hace12 }) {
    const lista = await filas<{ fecha: string; ok: boolean }>(
      tx,
      sql`select ${dia('c.occurred_at')}::text as fecha,
                 coalesce(i.status = 'cerrada' and i.immediate_causes is not null and i.root_causes is not null, false) as ok
            from crashes c left join crash_investigations i on i.crash_id = c.id
           where c.fatalities + c.serious_injuries + c.minor_injuries > 0 and ${dia('c.occurred_at')} >= ${hace12}`,
    );
    if (!lista.length) return { cumple: true, detalle: 'Sin siniestros con víctimas en los últimos doce meses.' };
    const sin = lista.filter((s) => !s.ok);
    return sin.length ? { cumple: false, detalle: `${sin.length} de ${plural(lista.length, 'siniestro', 'siniestros')} con víctimas sin investigación cerrada con causas.` } : { cumple: true, detalle: `${plural(lista.length, 'siniestro con víctimas investigado', 'siniestros con víctimas investigados')}.` };
  },

  async siniestros_con_acciones({ tx, hace12 }) {
    const lista = await filas<{ acciones: number }>(
      tx,
      sql`select (select count(*)::int from actions a where a.source = 'siniestro' and a.source_id = c.id) as acciones
            from crashes c where c.fatalities + c.serious_injuries + c.minor_injuries > 0 and ${dia('c.occurred_at')} >= ${hace12}`,
    );
    if (!lista.length) return { cumple: true, detalle: 'Sin siniestros con víctimas en los últimos doce meses.' };
    const sin = lista.filter((s) => !s.acciones).length;
    return sin ? { cumple: false, detalle: `${sin} de ${plural(lista.length, 'siniestro', 'siniestros')} con víctimas sin plan de acción.` } : { cumple: true, detalle: 'Cada siniestro con víctimas tiene acciones.' };
  },

  async preoperacional_al_dia({ tx }) {
    const r = await uno<{ activos: number; al_dia: number }>(
      tx,
      sql`select count(*)::int as activos,
                 count(*) filter (where exists (select 1 from inspections i where i.vehicle_id = v.id and i.performed_at >= now() - interval '7 days'))::int as al_dia
            from vehicles v where v.status <> 'inactivo' and v.motorized`,
    );
    if (!r.activos) return { cumple: false, detalle: 'No hay vehículos automotores activos.' };
    return r.al_dia === r.activos ? { cumple: true, detalle: `Los ${r.activos} vehículos tienen inspección en los últimos siete días.` } : { cumple: false, detalle: `${r.al_dia} de ${r.activos} vehículos con inspección en los últimos siete días.` };
  },

  async mantenimiento_planes({ tx }) {
    const r = await uno<{ activos: number; con: number }>(
      tx,
      sql`select count(*)::int as activos,
                 count(*) filter (where exists (select 1 from maintenance_plans p where p.vehicle_id = v.id and p.active))::int as con
            from vehicles v where v.status <> 'inactivo' and v.motorized`,
    );
    if (!r.activos) return { cumple: false, detalle: 'No hay vehículos automotores activos.' };
    return r.con === r.activos ? { cumple: true, detalle: `Los ${r.activos} vehículos tienen plan preventivo.` } : { cumple: false, detalle: `${r.con} de ${r.activos} vehículos con plan preventivo activo.` };
  },

  async indicadores_tabla10({ tx, nivel }) {
    const exigidos = TABLA_10_INDICADORES.filter((t) => t.niveles.includes(nivel));
    const activos = new Set((await filas<{ calculation: string }>(tx, sql`select calculation from indicators where active and calculation is not null`)).map((r) => r.calculation));
    const faltan = exigidos.filter((t) => !activos.has(t.calculo));
    return faltan.length ? { cumple: false, detalle: `Faltan ${faltan.length} de ${exigidos.length}: ${faltan.map((f) => f.nombre).join('; ')}.` } : { cumple: true, detalle: `Los ${exigidos.length} indicadores de la tabla 10 que aplican al nivel están creados.` };
  },

  async indicadores_medidos({ tx, hoy }) {
    const lista = await filas<{ id: string; name: string; frequency: Frecuencia; created: string }>(tx, sql`select id, name, frequency, ${dia('created_at')}::text as created from indicators where active`);
    if (!lista.length) return { cumple: false, detalle: 'No hay indicadores activos.' };
    const anio = Number(hoy.slice(0, 4));
    const pendientes: string[] = [];
    for (const i of lista) {
      const periodos = [...periodosDelAnio(anio - 1, i.frequency), ...periodosDelAnio(anio, i.frequency)].filter((p) => p.hasta < hoy && p.hasta >= i.created);
      const ultimo = periodos[periodos.length - 1];
      if (!ultimo) continue;
      const r = await uno<{ n: number }>(tx, sql`select count(*)::int as n from indicator_results where indicator_id = ${i.id} and period = ${ultimo.id} and value is not null`);
      if (!r.n) pendientes.push(`${i.name} (${ultimo.id})`);
    }
    return pendientes.length ? { cumple: false, detalle: `Sin resultado registrado: ${pendientes.join('; ')}.` } : { cumple: true, detalle: `Los ${lista.length} indicadores tienen registrado su último periodo.` };
  },

  async auditoria_anual({ tx, hace12 }) {
    const r = await uno<{ ultima: string | null }>(tx, sql`select max(executed_on)::text as ultima from audits where executed_on is not null and executed_on >= ${hace12}`);
    return r.ultima ? { cumple: true, detalle: `Última auditoría ejecutada: ${r.ultima}.` } : { cumple: false, detalle: 'Sin auditoría ejecutada en los últimos doce meses.' };
  },

  async auditor_independiente({ tx }) {
    const [r] = await filas<{ auditor: string; independiente: boolean }>(tx, sql`select auditor_name as auditor, auditor_independent as independiente from audits where executed_on is not null order by executed_on desc limit 1`);
    if (!r) return { cumple: false, detalle: 'No hay auditorías ejecutadas.' };
    return r.independiente ? { cumple: true, detalle: `Auditor de la última auditoría: ${r.auditor}, independiente del líder.` } : { cumple: false, detalle: `La última auditoría (${r.auditor}) no está marcada con auditor independiente del líder.` };
  },

  async nc_auditoria_tratadas({ tx }) {
    const r = await uno<{ abiertas: number; sin: number }>(
      tx,
      sql`select count(*)::int as abiertas,
                 count(*) filter (where not exists (select 1 from actions a where a.source = 'hallazgo' and a.source_id = f.id))::int as sin
            from audit_findings f where f.status = 'abierto' and f.kind in ('no_conformidad_mayor', 'no_conformidad_menor')`,
    );
    if (!r.abiertas) return { cumple: true, detalle: 'No hay no conformidades de auditoría abiertas.' };
    return r.sin ? { cumple: false, detalle: `${r.sin} de ${plural(r.abiertas, 'no conformidad abierta', 'no conformidades abiertas')} sin acción.` } : { cumple: true, detalle: `Las ${r.abiertas} no conformidades abiertas tienen acciones.` };
  },
};

async function riesgosValorados(tx: TenantTx) {
  const lista = await filas<{ id: string; methodology: MetodologiaRiesgo; deficiency: number | null; exposure: number | null; consequence: number | null; probability: number | null; severity: number | null; medidas: number }>(
    tx,
    sql`select r.id, r.methodology, r.deficiency, r.exposure, r.consequence, r.probability, r.severity,
               (select count(*)::int from risk_measures m where m.risk_id = r.id) as medidas
          from road_risks r`,
  );
  return lista.map((r) => ({ ...r, evaluacion: evaluarRiesgo(r.methodology, { deficiencia: r.deficiency, exposicion: r.exposure, consecuencia: r.consequence, probabilidad: r.probability, severidad: r.severity }) }));
}

async function evaluarDocumento(tx: TenantTx, req: RequisitoPaso & { verificacion: { tipo: 'documento' } }, hoy: string): Promise<Resultado> {
  const v = req.verificacion;
  const docs = await filas<{ codigo: string; titulo: string; version: number | null; aprobado: string | null; divulgado: string | null }>(
    tx,
    sql`select d.code as codigo, d.title as titulo, v.version, ${dia('v.approved_at')}::text as aprobado, v.disseminated_on::text as divulgado
          from controlled_documents d
          left join document_versions v on v.document_id = d.id and v.status = 'aprobado'
         where d.step_number = ${req.paso} and d.class in ${sql.raw(`(${v.clases.map((c) => `'${c}'`).join(', ')})`)}
         order by v.approved_at desc nulls last`,
  );
  if (!docs.length) return { cumple: false, detalle: 'No hay un documento controlado de este paso con la clase requerida.' };
  const aprobados = docs.filter((d) => d.aprobado);
  if (!aprobados.length) return { cumple: false, detalle: `${docs[0]!.codigo} · ${docs[0]!.titulo}: sin versión aprobada.` };
  const vigentes = v.maxMeses ? aprobados.filter((d) => d.aprobado! >= restarMeses(hoy, v.maxMeses!)) : aprobados;
  if (!vigentes.length) return { cumple: false, detalle: `${aprobados[0]!.codigo} v${aprobados[0]!.version}: aprobado el ${aprobados[0]!.aprobado}; requiere revisión (más de ${v.maxMeses} meses).` };
  if (v.divulgado) {
    const divulgado = vigentes.find((d) => d.divulgado);
    return divulgado ? { cumple: true, detalle: `${divulgado.codigo} v${divulgado.version}: divulgado el ${divulgado.divulgado}.` } : { cumple: false, detalle: `${vigentes[0]!.codigo} v${vigentes[0]!.version}: aprobado, falta registrar la divulgación.` };
  }
  const d = vigentes[0]!;
  return { cumple: true, detalle: `${d.codigo} · ${d.titulo} v${d.version}, aprobado el ${d.aprobado}.` };
}

/**
 * Evalúa los requisitos de los pasos indicados (todos si no se indican) para el nivel de la
 * organización. Las reglas automáticas usan los datos de la plataforma; los registros manuales,
 * la verificación del líder y su vigencia.
 */
export async function evaluarRequisitos(tx: TenantTx, opciones: { nivel: Nivel; creada: string; pasos?: number[]; hoy?: string }): Promise<ResultadoRequisito[]> {
  const hoy = opciones.hoy ?? hoyColombia();
  const contexto: Contexto = { tx, hoy, hace12: restarMeses(hoy, 12), nivel: opciones.nivel, creada: opciones.creada };
  const pasos = opciones.pasos ?? PASOS_PESV.map((p) => p.numero);
  const requisitos = pasos.flatMap((p) => requisitosDelPaso(p, opciones.nivel));
  const manuales = requisitos.filter((r) => r.verificacion.tipo === 'registro').map((r) => r.id);
  const verificaciones = manuales.length
    ? await tx
        .select({ c: stepRequirementChecks, por: users.fullName, evidencia: evidences.title, estadoEvidencia: evidences.status })
        .from(stepRequirementChecks)
        .leftJoin(users, eq(users.id, stepRequirementChecks.checkedBy))
        .leftJoin(evidences, eq(evidences.id, stepRequirementChecks.evidenceId))
        .where(inArray(stepRequirementChecks.requirementId, manuales))
    : [];
  const resultados: ResultadoRequisito[] = [];
  for (const r of requisitos) {
    const base = {
      id: r.id,
      paso: r.paso,
      texto: r.texto,
      cita: r.cita,
      obligatorio: r.obligatorio,
      verificacion: r.verificacion.tipo,
      criterio: r.verificacion.tipo === 'dato' ? r.verificacion.criterio : null,
      ruta: r.ruta ?? null,
      porValidar: r.porValidar ?? null,
      vigenciaMeses: r.verificacion.tipo === 'registro' ? (r.verificacion.vigenciaMeses ?? null) : null,
    };
    if (r.verificacion.tipo === 'dato') {
      const x = await REGLAS[r.verificacion.regla](contexto);
      resultados.push({ ...base, estado: x.cumple ? 'cumple' : 'no_cumple', detalle: x.detalle, verificado: null });
    } else if (r.verificacion.tipo === 'documento') {
      const x = await evaluarDocumento(tx, r as RequisitoPaso & { verificacion: { tipo: 'documento' } }, hoy);
      resultados.push({ ...base, estado: x.cumple ? 'cumple' : 'no_cumple', detalle: x.detalle, verificado: null });
    } else {
      const v = verificaciones.find((x) => x.c.requirementId === r.id);
      const fecha = v ? fechaColombia(v.c.checkedAt) : null;
      let estado = estadoVerificacionManual(v ? { estado: v.c.status as 'cumple' | 'no_cumple', fecha: fecha! } : null, r.verificacion.vigenciaMeses, hoy);
      let detalle = !v ? 'El líder aún no lo ha verificado.' : estado === 'vencido' ? `Verificado el ${fecha}; la verificación venció (vigencia de ${r.verificacion.vigenciaMeses} meses).` : `${v.c.status === 'cumple' ? 'Verificado' : 'Marcado como no cumple'} el ${fecha}${v.por ? ` por ${v.por}` : ''}.`;
      if (v && estado === 'cumple' && v.estadoEvidencia !== 'aprobada') {
        estado = 'sin_verificar';
        detalle = 'La evidencia que lo soportaba ya no está aprobada; verifícalo de nuevo.';
      }
      resultados.push({ ...base, estado, detalle, verificado: v ? { fecha: fecha!, por: v.por, nota: v.c.note, evidenciaId: v.c.evidenceId, evidencia: v.evidencia } : null });
    }
  }
  return resultados;
}
