import { completitudPrograma, PROGRAMAS_OBLIGATORIOS, type TipoProgramaId } from '@pesv/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { TenantTx } from '../db/database.service.js';
import { criticalPrograms, indicators, planActivities } from '../db/schema.js';

export type FilaPrograma = typeof criticalPrograms.$inferSelect;

/**
 * Programas activos con su completitud frente al contenido mínimo del paso 8. Las actividades y el
 * cronograma salen del plan de trabajo (actividades con origen «programa»).
 */
export async function estadoProgramas(tx: TenantTx) {
  const programas = await tx.select().from(criticalPrograms).where(eq(criticalPrograms.active, true));
  const actividades = programas.length
    ? await tx
        .select({ id: planActivities.id, programaId: planActivities.sourceId, meses: planActivities.plannedMonths, estado: planActivities.status })
        .from(planActivities)
        .where(and(eq(planActivities.source, 'programa'), inArray(planActivities.sourceId, programas.map((p) => p.id))))
    : [];
  const activos = new Set((await tx.select({ id: indicators.id }).from(indicators).where(eq(indicators.active, true))).map((i) => i.id));
  return programas.map((p) => {
    const propias = actividades.filter((a) => a.programaId === p.id && a.estado !== 'cancelada');
    const completitud = completitudPrograma({
      tipo: p.kind as TipoProgramaId,
      nombre: p.name,
      lineamientos: p.guidelines,
      alcance: p.scope,
      inicio: p.startOn,
      duracionMeses: p.durationMonths,
      lineaBase: p.baseline,
      objetivos: p.objectives,
      indicadores: p.indicatorIds.filter((i) => activos.has(i)).length,
      factores: p.performanceFactors,
      actividades: propias.length,
      actividadesConCronograma: propias.filter((a) => a.meses.length > 0).length,
      responsable: p.responsibleName,
      presupuesto: p.budget,
      seguimiento: p.followUp,
      elementos: p.elements,
    });
    return { fila: p, actividades: propias.length, ...completitud };
  });
}

/** Tipos obligatorios que aún no tienen programa activo. */
export function programasFaltantes(lista: { fila: FilaPrograma }[]) {
  const tipos = new Set(lista.map((p) => p.fila.kind));
  return PROGRAMAS_OBLIGATORIOS.filter((t) => !tipos.has(t));
}
