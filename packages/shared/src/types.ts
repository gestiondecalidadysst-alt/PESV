/** Misionalidad según la Resolución 40595 de 2022: 1 = transporte, 2 = otros sectores. */
export type Misionalidad = 1 | 2;

export const NIVELES = ['basico', 'estandar', 'avanzado'] as const;
export type Nivel = (typeof NIVELES)[number];

export const NIVEL_LABEL: Record<Nivel, string> = {
  basico: 'Básico',
  estandar: 'Estándar',
  avanzado: 'Avanzado',
};

export const FASES = ['planear', 'hacer', 'verificar', 'actuar'] as const;
export type Fase = (typeof FASES)[number];

export const FASE_LABEL: Record<Fase, string> = {
  planear: 'Planear',
  hacer: 'Hacer',
  verificar: 'Verificar',
  actuar: 'Actuar',
};

/** Estado de cumplimiento de un paso para una organización. */
export const ESTADOS_PASO = ['pendiente', 'en_curso', 'hecho', 'no_aplica'] as const;
export type EstadoPaso = (typeof ESTADOS_PASO)[number];

export interface Rango {
  min: number;
  /** null = sin límite superior. */
  max: number | null;
}

export interface ReglaNivel {
  misionalidad: Misionalidad;
  nivel: Nivel;
  vehiculos: Rango;
  conductores: Rango;
}

export interface PasoPesv {
  numero: number;
  fase: Fase;
  nombre: string;
  niveles: readonly Nivel[];
}

export interface Modalidad {
  id: string;
  nombre: string;
  misionalidad: Misionalidad;
  /** false = Supertransporte no es la autoridad que verifica su PESV (no reporta en VIGIA 2). */
  reportaSupertransporte: boolean;
}

export interface VersionNormativa {
  id: string;
  nombre: string;
  fechaExpedicion: string;
  autoridad: string;
}

export interface ClausulaIso {
  codigo: string;
  titulo: string;
  /** Código de la cláusula padre; null para las cláusulas principales (4 a 10). */
  padre: string | null;
}
