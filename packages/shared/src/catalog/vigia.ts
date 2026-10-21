/**
 * Formularios de la Fase 2 del módulo PESV de SINST-VIGIA 2 (Supertransporte), según el
 * manual de usuario 2025 y el anexo técnico PESV. Los plazos son de referencia: la
 * Superintendencia publica el calendario oficial de cada vigencia.
 */
export const FORMULARIOS_VIGIA = [
  {
    id: 'siniestros',
    nombre: 'A. Siniestros',
    periodicidad: 'trimestral',
    descripcion: 'Registro de siniestros con víctimas por nivel, IPAT, autoridad y revisión del comité; costos directos e indirectos.',
  },
  {
    id: 'administrativo',
    nombre: 'B. Administrativo',
    periodicidad: 'trimestral',
    descripcion: 'Riesgos identificados, metas cumplidas, plan anual, capacitaciones y no conformidades.',
  },
  {
    id: 'funcionamiento',
    nombre: 'C. Funcionamiento',
    periodicidad: 'mensual',
    descripcion: 'Excesos de jornada, días trabajados, viajes con exceso de velocidad y viajes laborales.',
  },
  {
    id: 'vehiculos',
    nombre: 'D. Vehículos',
    periodicidad: 'mensual',
    descripcion: 'Preoperacionales, vehículos en operación, mantenimientos preventivos y muestra del 10 % de la flota.',
  },
] as const;

export type FormularioVigia = (typeof FORMULARIOS_VIGIA)[number]['id'];
export const IDS_FORMULARIO_VIGIA = FORMULARIOS_VIGIA.map((f) => f.id) as [FormularioVigia, ...FormularioVigia[]];

export interface Periodo {
  id: string;
  desde: string;
  hasta: string;
  /** Fecha de referencia para cargarlo: último día del mes siguiente al periodo. */
  plazo: string;
  etiqueta: string;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** Periodo a partir de su id: "2026-09" (mensual) o "2026-T3" (trimestral). */
export function periodoDesdeId(id: string): Periodo | null {
  const mensual = /^(\d{4})-(\d{2})$/.exec(id);
  if (mensual) {
    const a = Number(mensual[1]);
    const m = Number(mensual[2]);
    if (m < 1 || m > 12) return null;
    const [pa, pm] = m === 12 ? [a + 1, 1] : [a, m + 1];
    return { id, desde: iso(a, m, 1), hasta: iso(a, m, ultimoDia(a, m)), plazo: iso(pa, pm, ultimoDia(pa, pm)), etiqueta: `${MESES[m - 1]} de ${a}` };
  }
  const trimestral = /^(\d{4})-T([1-4])$/.exec(id);
  if (trimestral) {
    const a = Number(trimestral[1]);
    const t = Number(trimestral[2]);
    const mi = (t - 1) * 3 + 1;
    const mf = mi + 2;
    const [pa, pm] = mf === 12 ? [a + 1, 1] : [a, mf + 1];
    return { id, desde: iso(a, mi, 1), hasta: iso(a, mf, ultimoDia(a, mf)), plazo: iso(pa, pm, ultimoDia(pa, pm)), etiqueta: `trimestre ${t} de ${a}` };
  }
  return null;
}

/** Último periodo cerrado de un formulario a la fecha dada. */
export function periodoAnterior(formulario: FormularioVigia, hoy: Date = new Date()): Periodo {
  const def = FORMULARIOS_VIGIA.find((f) => f.id === formulario)!;
  const a = hoy.getFullYear();
  const m = hoy.getMonth() + 1;
  if (def.periodicidad === 'mensual') {
    const [pa, pm] = m === 1 ? [a - 1, 12] : [a, m - 1];
    return periodoDesdeId(`${pa}-${String(pm).padStart(2, '0')}`)!;
  }
  const t = Math.ceil(m / 3);
  const [pa, pt] = t === 1 ? [a - 1, 4] : [a, t - 1];
  return periodoDesdeId(`${pa}-T${pt}`)!;
}

/** Clasificación del siniestro según la víctima más grave (anexo técnico PESV). */
export function nivelSiniestro(s: { fallecidos: number; heridosGraves: number; heridosLeves: number }) {
  if (s.fallecidos > 0) return 'con_fallecidos' as const;
  if (s.heridosGraves > 0) return 'con_lesionados_graves' as const;
  if (s.heridosLeves > 0) return 'con_lesionados_leves' as const;
  return 'solo_danos' as const;
}

export const NIVEL_SINIESTRO_LABEL = {
  con_fallecidos: 'Con fallecidos',
  con_lesionados_graves: 'Con lesionados graves',
  con_lesionados_leves: 'Con lesionados leves',
  solo_danos: 'Solo daños (choque simple)',
} as const;

