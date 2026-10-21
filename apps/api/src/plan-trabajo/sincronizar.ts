import { estadoDerivado, type EstadoActividad } from '@pesv/shared';
import { and, eq } from 'drizzle-orm';
import type { TenantTx } from '../db/database.service.js';
import { planActivities, planFollowups, riskMeasures } from '../db/schema.js';

const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const dos = (n: number) => String(n).padStart(2, '0');

/** Fechas programadas de una actividad a partir de sus meses (primer día del primero, último del último). */
export function fechasDeMeses(anio: number, meses: number[]) {
  const primero = Math.min(...meses);
  const ultimo = Math.max(...meses);
  return { plannedStart: `${anio}-${dos(primero)}-01`, plannedEnd: `${anio}-${dos(ultimo)}-${dos(ultimoDia(anio, ultimo))}` };
}

/** Nota con que quedan los meses que se dan por ejecutados al implementar una medida. */
export const NOTA_MEDIDA_IMPLEMENTADA = 'Medida implementada (registrado desde la matriz de riesgos)';

/**
 * Recalcula el estado de una actividad a partir de su seguimiento mensual y lo propaga a lo que la
 * originó (por ahora, la medida de la matriz de riesgos). Devuelve el estado resultante.
 */
export async function sincronizarActividad(tx: TenantTx, actividadId: string, propagar = true): Promise<EstadoActividad | null> {
  const [a] = await tx.select().from(planActivities).where(eq(planActivities.id, actividadId));
  if (!a) return null;
  const seguimiento = await tx.select().from(planFollowups).where(eq(planFollowups.activityId, a.id));
  const estado = estadoDerivado(
    a.plannedMonths,
    seguimiento.map((s) => ({ mes: s.month, ejecutado: s.executed })),
    a.status as EstadoActividad,
  );
  const fechas = seguimiento.filter((s) => s.executed && s.executedOn).map((s) => s.executedOn!).sort();
  await tx
    .update(planActivities)
    .set({ status: estado, executedOn: estado === 'ejecutada' ? (fechas[fechas.length - 1] ?? null) : null, updatedAt: new Date() })
    .where(eq(planActivities.id, a.id));
  if (propagar && a.source === 'riesgo' && a.sourceId && estado !== 'cancelada') {
    // Plan ejecutado → medida implementada; con avance parcial, la medida queda en curso.
    const [m] = await tx.select({ status: riskMeasures.status }).from(riskMeasures).where(eq(riskMeasures.id, a.sourceId));
    const nuevo = estado === 'ejecutada' ? 'implementada' : estado === 'en_curso' ? 'en_curso' : m?.status === 'implementada' ? 'en_curso' : m?.status;
    if (m && nuevo && nuevo !== m.status) await tx.update(riskMeasures).set({ status: nuevo, updatedAt: new Date() }).where(eq(riskMeasures.id, a.sourceId));
  }
  return estado;
}

/**
 * Lleva el avance de una medida al plan: si se implementó, los meses programados sin seguimiento
 * quedan ejecutados en la fecha indicada.
 */
export async function ejecutarMesesPendientes(tx: TenantTx, actividadId: string, fecha: string, actorId: string, nota = NOTA_MEDIDA_IMPLEMENTADA) {
  const [a] = await tx.select().from(planActivities).where(eq(planActivities.id, actividadId));
  if (!a) return;
  const existentes = new Set((await tx.select({ m: planFollowups.month, e: planFollowups.executed }).from(planFollowups).where(eq(planFollowups.activityId, a.id))).filter((s) => s.e).map((s) => s.m));
  for (const mes of a.plannedMonths.filter((m) => !existentes.has(m))) {
    await tx
      .insert(planFollowups)
      .values({ organizationId: a.organizationId, activityId: a.id, month: mes, executed: true, executedOn: fecha, note: nota, createdBy: actorId })
      .onConflictDoUpdate({ target: [planFollowups.activityId, planFollowups.month], set: { executed: true, executedOn: fecha, note: nota, updatedAt: new Date() } });
  }
}

/** Deshace los meses que se dieron por ejecutados al implementar la medida (si se reabre). */
export async function revertirMedidaImplementada(tx: TenantTx, actividadId: string) {
  await tx.delete(planFollowups).where(and(eq(planFollowups.activityId, actividadId), eq(planFollowups.note, NOTA_MEDIDA_IMPLEMENTADA)));
}
