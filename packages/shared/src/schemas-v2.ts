import { z } from 'zod';
import { IDS_TIPO_DOCUMENTO } from './catalog/documentos';
import {
  IDS_ACTOR_VIAL,
  IDS_FACTOR_RIESGO_VIAL,
  IDS_JERARQUIA_CONTROL,
  IDS_METODOLOGIA_RIESGO,
  IDS_TIPO_DESPLAZAMIENTO,
  NIVELES_CONSECUENCIA,
  NIVELES_DEFICIENCIA,
  NIVELES_EXPOSICION,
} from './catalog/matriz-riesgos';
import { IDS_FASE_PHVA } from './catalog/plan-trabajo';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const opcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const firmante = { nombre: opcional(120), cargo: opcional(120) };

// Formato del sistema de gestión (encabezado y pie) ------------------------------

export const formatoGeneralSchema = z.object({
  prefijo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,12}$/, 'Usa letras, números o guion (máximo 12)'),
  pieTexto: opcional(300),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color hexadecimal, por ejemplo #0F1B2D'),
  elaboro: z.object(firmante),
  reviso: z.object(firmante),
  aprobo: z.object(firmante),
});
export type FormatoGeneralInput = z.infer<typeof formatoGeneralSchema>;

export const formatoDocumentoSchema = z.object({
  tipo: z.enum(IDS_TIPO_DOCUMENTO),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9.-]{2,30}$/, 'Usa letras, números, punto o guion'),
  version: z.number().int().min(1).max(999),
  fechaVersion: fecha,
  elaboro: z.object(firmante),
  reviso: z.object(firmante),
  aprobo: z.object(firmante),
});
export type FormatoDocumentoInput = z.infer<typeof formatoDocumentoSchema>;

// Matriz de riesgos viales (paso 6) ------------------------------------------------

const texto = (min: number, max: number, mensaje: string) => z.string().trim().min(min, mensaje).max(max);
const valorDe = (lista: readonly { valor: number }[], mensaje: string) =>
  z
    .number()
    .int()
    .refine((v) => lista.some((x) => x.valor === v), mensaje)
    .nullable()
    .optional();
const escala5 = z.number().int().min(1).max(5).nullable().optional();

const evaluacion = z.object({
  deficiencia: valorDe(NIVELES_DEFICIENCIA, 'Nivel de deficiencia no válido'),
  exposicion: valorDe(NIVELES_EXPOSICION, 'Nivel de exposición no válido'),
  consecuencia: valorDe(NIVELES_CONSECUENCIA, 'Nivel de consecuencia no válido'),
  probabilidad: escala5,
  severidad: escala5,
});
export type EvaluacionInput = z.infer<typeof evaluacion>;

const completa = (metodologia: string, e: EvaluacionInput | undefined | null) =>
  !!e && (metodologia === 'gtc45' ? e.deficiencia != null && e.exposicion != null && e.consecuencia != null : e.probabilidad != null && e.severidad != null);
const vacia = (e: EvaluacionInput | undefined | null) => !e || Object.values(e).every((v) => v == null);

export const riesgoViaSchema = z
  .object({
    metodologia: z.enum(IDS_METODOLOGIA_RIESGO),
    proceso: texto(2, 150, 'Indica el proceso'),
    actividad: opcional(200),
    cargo: opcional(150),
    rutinaria: z.boolean().default(true),
    tipoDesplazamiento: z.enum(IDS_TIPO_DESPLAZAMIENTO).default('en_mision'),
    actorVial: z.enum(IDS_ACTOR_VIAL),
    factor: z.enum(IDS_FACTOR_RIESGO_VIAL),
    peligro: texto(3, 300, 'Describe el peligro'),
    descripcion: opcional(2000),
    efectos: opcional(1000),
    expuestos: z.number().int().min(0).max(1_000_000).nullable().optional(),
    controlFuente: opcional(1000),
    controlMedio: opcional(1000),
    controlIndividuo: opcional(1000),
    inherente: evaluacion,
    residual: evaluacion.nullable().optional(),
    peorConsecuencia: opcional(500),
    requisitoLegal: z.boolean().default(false),
    referenciaLegal: opcional(500),
    responsable: opcional(150),
    estado: z.enum(['abierto', 'controlado', 'cerrado']).default('abierto'),
  })
  .refine((r) => completa(r.metodologia, r.inherente), {
    message: 'Completa la evaluación del riesgo con la metodología elegida',
    path: ['inherente'],
  })
  .refine((r) => vacia(r.residual) || completa(r.metodologia, r.residual), {
    message: 'Completa la evaluación residual o déjala vacía',
    path: ['residual'],
  });
export type RiesgoViaInput = z.infer<typeof riesgoViaSchema>;

export const metodologiaSchema = z.object({ metodologia: z.enum(IDS_METODOLOGIA_RIESGO) });

export const medidaSchema = z.object({
  jerarquia: z.enum(IDS_JERARQUIA_CONTROL),
  descripcion: texto(3, 1000, 'Describe la medida'),
  responsable: opcional(150),
  fechaLimite: fecha.optional().nullable(),
  estado: z.enum(['pendiente', 'en_curso', 'implementada']).default('pendiente'),
});
export type MedidaInput = z.infer<typeof medidaSchema>;

// Plan anual de trabajo (paso 9) ------------------------------------------------------

const mes = z.number().int().min(1).max(12);

export const actividadTrabajoSchema = z.object({
  anio: z.number().int().min(2020).max(2100),
  titulo: texto(3, 300, 'Escribe la actividad'),
  descripcion: opcional(2000),
  pasoNumero: z.number().int().min(1).max(24).nullable().optional(),
  metaId: z.string().uuid().nullable().optional(),
  fase: z.enum(IDS_FASE_PHVA).default('hacer'),
  responsable: texto(3, 150, 'Indica el responsable'),
  recursos: opcional(1000),
  entregable: opcional(500),
  presupuesto: z.number().min(0).max(100_000_000_000).nullable().optional(),
  presupuestoEjecutado: z.number().min(0).max(100_000_000_000).nullable().optional(),
  meses: z
    .array(mes)
    .min(1, 'Programa al menos un mes')
    .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
  cancelada: z.boolean().default(false),
});
export type ActividadTrabajoInput = z.infer<typeof actividadTrabajoSchema>;

export const seguimientoActividadSchema = z
  .object({
    // Llega como texto cuando el seguimiento trae un archivo (formulario multipart).
    mes: z.coerce.number().int().min(1).max(12),
    ejecutado: z.preprocess((v) => v === true || v === 'true', z.boolean()),
    fecha: z.preprocess((v) => (v === '' ? null : v), fecha.nullable().optional()),
    nota: opcional(2000),
  })
  .refine((s) => !s.ejecutado || !!s.fecha, { message: 'Indica la fecha de ejecución', path: ['fecha'] })
  .refine((s) => s.ejecutado || !!s.nota, { message: 'Explica por qué no se ejecutó', path: ['nota'] });
export type SeguimientoActividadInput = z.infer<typeof seguimientoActividadSchema>;
