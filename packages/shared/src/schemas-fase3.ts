import { z } from 'zod';
import { NIVELES } from './types';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const fechaHora = z.string().datetime({ offset: true, message: 'Fecha y hora inválidas' });
const texto = (min: number, max: number, mensaje: string) => z.string().trim().min(min, mensaje).max(max);
const opcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

// Auditorías (pasos 22 y 23) -------------------------------------------------

export const TIPOS_HALLAZGO = [
  { id: 'no_conformidad_mayor', nombre: 'No conformidad mayor' },
  { id: 'no_conformidad_menor', nombre: 'No conformidad menor' },
  { id: 'observacion', nombre: 'Observación' },
  { id: 'oportunidad_mejora', nombre: 'Oportunidad de mejora' },
] as const;
export type TipoHallazgo = (typeof TIPOS_HALLAZGO)[number]['id'];
const IDS_TIPO_HALLAZGO = TIPOS_HALLAZGO.map((t) => t.id) as [TipoHallazgo, ...TipoHallazgo[]];

/** Las no conformidades exigen acción correctiva antes de cerrarse (RN-33). */
export const exigeAccionCorrectiva = (tipo: TipoHallazgo) => tipo === 'no_conformidad_mayor' || tipo === 'no_conformidad_menor';

export const auditoriaSchema = z.object({
    tipo: z.enum(['interna', 'externa', 'simulada']).default('interna'),
    alcance: texto(3, 1000, 'Describe el alcance'),
    auditor: texto(3, 150, 'Indica quién audita'),
    /** Independencia del auditor: no audita su propio trabajo (ISO 39001, 9.2). */
    auditorIndependiente: z.boolean().default(true),
    programadaEl: fecha,
    ejecutadaEl: fecha.optional().nullable(),
  incluyeIso: z.boolean().default(false),
});
export type AuditoriaInput = z.infer<typeof auditoriaSchema>;

export const cerrarAuditoriaSchema = z.object({ conclusiones: texto(10, 10_000, 'Escribe las conclusiones (mínimo 10 caracteres)') });

export const hallazgoSchema = z.object({
  tipo: z.enum(IDS_TIPO_HALLAZGO),
  pasoNumero: z.number().int().min(1).max(24).optional().nullable(),
  clausulaIso: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)*$/, 'Escribe la cláusula como 9.2')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  descripcion: texto(10, 4000, 'Describe el hallazgo (mínimo 10 caracteres)'),
  evidencia: opcional(4000),
  causa: opcional(4000),
});
export type HallazgoInput = z.infer<typeof hallazgoSchema>;

export const cerrarHallazgoSchema = z.object({ verificacion: texto(10, 4000, 'Describe cómo se verificó la eficacia (mínimo 10 caracteres)') });

/** Hallazgos propuestos por el auditor simulado que la persona decide registrar. */
export const importarSimulacroSchema = z.object({
  hallazgos: z.array(hallazgoSchema).min(1, 'Elige al menos un hallazgo').max(50),
});

// Telemática -----------------------------------------------------------------

export const viajeTelematicaSchema = z.object({
  /** Identificador del viaje en la plataforma GPS; evita duplicados si se reenvía. */
  idExterno: texto(1, 120, 'Falta el identificador del viaje'),
  placa: z.string().trim().toUpperCase().min(3).max(10),
  documentoConductor: z.string().trim().regex(/^\d{5,12}$/, 'Cédula sin puntos'),
  salida: fechaHora,
  llegada: fechaHora.optional().nullable(),
  distanciaKm: z.number().min(0).max(10_000).optional().nullable(),
  velocidadMaxima: z.number().int().min(0).max(300).optional().nullable(),
  excesoJornada: z.boolean().default(false),
  /** Nombre de la ruta registrada en la plataforma, si coincide. */
  ruta: opcional(150),
  odometroKm: z.number().int().min(0).max(5_000_000).optional().nullable(),
});
export type ViajeTelematicaInput = z.infer<typeof viajeTelematicaSchema>;

export const loteTelematicaSchema = z.object({ viajes: z.array(viajeTelematicaSchema).min(1).max(500) });

// Planes y suscripciones (panel de la plataforma) ---------------------------

export const FUNCIONES_PLAN = [
  { id: 'ia', nombre: 'Inteligencia artificial' },
  { id: 'n8n', nombre: 'Integración con n8n y tokens de API' },
  { id: 'telematica', nombre: 'Telemática GPS' },
  { id: 'iso39001', nombre: 'Seguimiento de ISO 39001' },
  { id: 'auditor_ia', nombre: 'Auditor simulado con IA' },
] as const;
export type FuncionPlan = (typeof FUNCIONES_PLAN)[number]['id'];
const IDS_FUNCION_PLAN = FUNCIONES_PLAN.map((f) => f.id) as [FuncionPlan, ...FuncionPlan[]];

const limite = z.number().int().positive().max(1_000_000).optional().nullable();

export const planSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,40}$/, 'Usa minúsculas, números, guion o guion bajo'),
  nombre: texto(2, 80, 'Escribe el nombre del plan'),
  descripcion: opcional(500),
  /** Niveles PESV a los que se ofrece (RN-26). Vacío = todos. */
  niveles: z.array(z.enum(NIVELES)).default([]),
  maxVehiculos: limite,
  maxConductores: limite,
  maxUsuarios: limite,
  funciones: z.array(z.enum(IDS_FUNCION_PLAN)).default([]),
  /** Precio mensual; vacío = se cotiza. Nunca está fijo en el código. */
  precioMensual: z.number().min(0).max(1_000_000_000).optional().nullable(),
  moneda: z.string().trim().toUpperCase().length(3).default('COP'),
  diasPrueba: z.number().int().min(0).max(365).default(0),
  activo: z.boolean().default(true),
  porDefecto: z.boolean().default(false),
});
export type PlanInput = z.infer<typeof planSchema>;

export const ESTADOS_SUSCRIPCION = ['prueba', 'activa', 'mora', 'cancelada'] as const;
export type EstadoSuscripcion = (typeof ESTADOS_SUSCRIPCION)[number];

export const suscripcionSchema = z.object({
  planId: z.string().uuid().nullable(),
  estado: z.enum(ESTADOS_SUSCRIPCION),
  vencePeriodoEl: fecha.optional().nullable(),
  notas: opcional(1000),
});
export type SuscripcionInput = z.infer<typeof suscripcionSchema>;
