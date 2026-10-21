import { z } from 'zod';
import { IDS_CLASE_DOCUMENTO, IDS_TIPO_DOCUMENTO } from './catalog/documentos';
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
import { IDS_FUENTE_HALLAZGO, IDS_TIPO_HALLAZGO_PASO } from './catalog/plan-accion';
import { CALCULOS_INDICADOR, IDS_FRECUENCIA, IDS_TIPO_INDICADOR, IDS_UNIDAD_INDICADOR } from './catalog/indicadores';
import { IDS_FACILITADOR, IDS_METODO_EVALUACION, IDS_MODALIDAD_FORMACION, IDS_PUBLICO_FORMACION, IDS_TEMA_FORMACION, IDS_TIPO_FORMACION } from './catalog/formacion';

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

// Plan anual de formación (paso 10) -------------------------------------------------

export const capacitacionPlanSchema = z.object({
  titulo: texto(3, 200, 'Escribe el título'),
  tipo: z.enum(IDS_TIPO_FORMACION).default('formacion'),
  temaId: z.enum(IDS_TEMA_FORMACION),
  tema: opcional(500),
  objetivo: opcional(1000),
  publico: z.array(z.enum(IDS_PUBLICO_FORMACION)).min(1, 'Elige al menos un público'),
  modalidad: z.enum(IDS_MODALIDAD_FORMACION).default('presencial'),
  programadaEl: fecha,
  horas: z.number().positive('Las horas deben ser mayores que cero').max(200).nullable().optional(),
  facilitador: opcional(150),
  tipoFacilitador: z.enum(IDS_FACILITADOR).default('interno'),
  lugar: opcional(200),
  evaluacion: z.enum(IDS_METODO_EVALUACION).default('evaluacion_escrita'),
  notaMinima: z.number().min(0).max(100).default(70),
  riesgoId: z.string().uuid().nullable().optional(),
  enPlanDeTrabajo: z.boolean().default(true),
  cancelada: z.boolean().default(false),
});
export type CapacitacionPlanInput = z.infer<typeof capacitacionPlanSchema>;

export const asistenciaCapacitacionSchema = z.object({
  asistentes: z
    .array(
      z.object({
        conductorId: z.string().uuid().nullable().optional(),
        nombre: texto(3, 150, 'Escribe el nombre'),
        documento: z.string().trim().regex(/^\d{5,12}$/, 'Escribe la cédula sin puntos'),
        cargo: opcional(150),
        asistio: z.boolean().default(true),
        nota: z.number().min(0).max(100).nullable().optional(),
      }),
    )
    .min(1, 'Agrega al menos una persona')
    .refine((l) => new Set(l.map((a) => a.documento)).size === l.length, 'Hay cédulas repetidas en la lista'),
});
export type AsistenciaCapacitacionInput = z.infer<typeof asistenciaCapacitacionSchema>;

export const ejecutarCapacitacionSchema = z.object({
  fecha,
  horas: z.number().positive().max(200).nullable().optional(),
});
export type EjecutarCapacitacionInput = z.infer<typeof ejecutarCapacitacionSchema>;

export const eficaciaSchema = z.object({
  efectiva: z.boolean(),
  fecha,
  nota: texto(5, 2000, 'Describe cómo se verificó la eficacia'),
});
export type EficaciaInput = z.infer<typeof eficaciaSchema>;

// Indicadores (paso 20) y metas (paso 7) ----------------------------------------------

const sentido = z.enum(['mayor_o_igual', 'menor_o_igual']);

export const indicadorSchema = z
  .object({
    nombre: texto(3, 200, 'Escribe el nombre del indicador'),
    objetivo: opcional(1000),
    tipo: z.enum(IDS_TIPO_INDICADOR),
    formula: texto(3, 1000, 'Describe la fórmula'),
    unidad: z.enum(IDS_UNIDAD_INDICADOR),
    frecuencia: z.enum(IDS_FRECUENCIA),
    sentido,
    meta: z.number().min(-1_000_000_000).max(1_000_000_000),
    alerta: z.number().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
    fuente: opcional(500),
    responsable: opcional(150),
    pasoNumero: z.number().int().min(1).max(24).nullable().optional(),
    activo: z.boolean().default(true),
  })
  .refine((i) => i.alerta == null || (i.sentido === 'mayor_o_igual' ? i.alerta < i.meta : i.alerta > i.meta), {
    message: 'El umbral de alerta debe quedar del lado de incumplimiento de la meta',
    path: ['alerta'],
  });
export type IndicadorInput = z.infer<typeof indicadorSchema>;

export const plantillasIndicadorSchema = z.object({
  calculos: z.array(z.enum(CALCULOS_INDICADOR)).min(1, 'Elige al menos un indicador'),
});

export const resultadoIndicadorSchema = z.object({
  /** Para indicadores manuales. En los automáticos se toma el valor calculado. */
  valor: z.number().min(-1_000_000_000).max(1_000_000_000).nullable().optional(),
  numerador: z.number().min(0).nullable().optional(),
  denominador: z.number().min(0).nullable().optional(),
  analisis: opcional(3000),
});
export type ResultadoIndicadorInput = z.infer<typeof resultadoIndicadorSchema>;

export const accionIndicadorSchema = z.object({
  descripcion: texto(5, 1000, 'Describe la acción'),
  responsable: texto(3, 150, 'Indica el responsable'),
  fechaLimite: fecha,
  tipo: z.enum(['correctiva', 'preventiva', 'mejora']).default('correctiva'),
});
export type AccionIndicadorInput = z.infer<typeof accionIndicadorSchema>;

export const metaPesvSchema = z.object({
  anio: z.number().int().min(2020).max(2100),
  objetivo: texto(3, 500, 'Escribe el objetivo'),
  indicadorId: z.string().uuid().nullable().optional(),
  indicador: opcional(300),
  meta: z.number(),
  valorActual: z.number().nullable().optional(),
  sentido: sentido.default('menor_o_igual'),
}).refine((m) => !!m.indicadorId || !!m.indicador, { message: 'Elige un indicador o escribe cómo se mide', path: ['indicador'] });
export type MetaPesvInput = z.infer<typeof metaPesvSchema>;

// Perfil de los colaboradores (paso 5) ----------------------------------------------

export const campanaEncuestaSchema = z.object({
  titulo: texto(3, 200, 'Ponle un título a la encuesta'),
  cierraEl: fecha.nullable().optional(),
  anonima: z.boolean().default(false),
});
export type CampanaEncuestaInput = z.infer<typeof campanaEncuestaSchema>;

export const respuestaEncuestaSchema = z.object({
  documento: z.string().trim().regex(/^\d{5,12}$/, 'Escribe la cédula sin puntos').optional(),
  nombre: z.string().trim().min(3, 'Escribe tu nombre').max(150).optional(),
  conductorId: z.string().uuid().nullable().optional(),
  consentimiento: z.literal(true, { error: 'Debes autorizar el tratamiento de los datos para enviar la encuesta' }),
  respuestas: z.record(z.string(), z.union([z.string().max(500), z.array(z.string().max(60)).max(20)])),
});
export type RespuestaEncuestaInput = z.infer<typeof respuestaEncuestaSchema>;

// Documentos controlados (pasos 3 y 19) ----------------------------------------------

export const documentoControladoSchema = z.object({
  clase: z.enum(IDS_CLASE_DOCUMENTO),
  titulo: texto(3, 200, 'Escribe el título'),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9.-]{1,29}$/, 'Usa letras, números, punto o guion')
    .optional(),
  pasoNumero: z.number().int().min(1).max(24).nullable().optional(),
  responsable: opcional(150),
  retencion: opcional(150),
  plantilla: z.string().max(60).optional(),
  /** Datos para las marcas de la plantilla: representante, líder, municipio. */
  datosPlantilla: z.record(z.string(), z.string().max(150)).optional(),
  contenido: z.string().max(100_000).optional(),
});
export type DocumentoControladoInput = z.infer<typeof documentoControladoSchema>;

export const borradorDocumentoSchema = z.object({
  contenido: z.string().max(100_000).nullable().optional(),
  resumenCambios: opcional(1000),
});
export type BorradorDocumentoInput = z.infer<typeof borradorDocumentoSchema>;

export const aprobarDocumentoSchema = z.object({
  password: z.string().min(1, 'Confirma con tu contraseña'),
  vigenteDesde: fecha.optional(),
});
export type AprobarDocumentoInput = z.infer<typeof aprobarDocumentoSchema>;

export const devolverDocumentoSchema = z.object({ nota: texto(5, 2000, 'Explica qué hay que corregir') });

export const divulgacionSchema = z.object({
  fecha,
  medio: texto(3, 500, 'Indica cómo se divulgó (correo, cartelera, inducción…)'),
});
export type DivulgacionInput = z.infer<typeof divulgacionSchema>;

// Hallazgos de los pasos y plan de acción (paso 23) --------------------------------------

export const hallazgoPasoSchema = z.object({
  tipo: z.enum(IDS_TIPO_HALLAZGO_PASO),
  fuente: z.enum(IDS_FUENTE_HALLAZGO).default('autoevaluacion'),
  descripcion: texto(5, 2000, 'Describe el hallazgo'),
  causa: opcional(2000),
  detectadoEl: fecha,
});
export type HallazgoPasoInput = z.infer<typeof hallazgoPasoSchema>;

export const cerrarHallazgoPasoSchema = z.object({ nota: texto(5, 2000, 'Explica cómo se verificó que el hallazgo quedó resuelto') });
