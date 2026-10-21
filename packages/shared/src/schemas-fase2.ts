import { z } from 'zod';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const fechaHora = z.string().datetime({ offset: true, message: 'Fecha y hora inválidas' });
const texto = (min: number, max: number, mensaje: string) => z.string().trim().min(min, mensaje).max(max);
/** Texto opcional: vacío se guarda como ausente (null en la base), no como cadena vacía. */
const opcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));
const uuid = z.string().uuid();
const dinero = z.number().min(0).max(100_000_000_000);

// Mantenimiento -------------------------------------------------------------

export const planMantenimientoSchema = z
  .object({
    vehiculoId: uuid,
    nombre: texto(3, 150, 'Ponle un nombre al plan'),
    intervaloKm: z.number().int().positive().optional().nullable(),
    intervaloDias: z.number().int().positive().optional().nullable(),
    ultimoEn: fecha.optional().nullable(),
    ultimoKm: z.number().int().min(0).optional().nullable(),
  })
  .refine((v) => v.intervaloKm || v.intervaloDias, { message: 'Indica cada cuántos kilómetros o días', path: ['intervaloKm'] });
export type PlanMantenimientoInput = z.infer<typeof planMantenimientoSchema>;

export const ordenTrabajoSchema = z.object({
  vehiculoId: uuid,
  tipo: z.enum(['preventivo', 'correctivo']),
  descripcion: texto(3, 1000, 'Describe el trabajo'),
  prioridad: z.enum(['critica', 'normal']).default('normal'),
  planId: uuid.optional(),
});
export type OrdenTrabajoInput = z.infer<typeof ordenTrabajoSchema>;

export const cerrarOrdenSchema = z.object({
  proveedor: texto(2, 150, 'Escribe el taller o proveedor'),
  nitProveedor: opcional(20),
  tecnico: texto(3, 150, 'Escribe el nombre del técnico'),
  documentoTecnico: opcional(20),
  cargoTecnico: opcional(80),
  costo: dinero.optional().nullable(),
  odometroKm: z.number().int().min(0).optional().nullable(),
  notas: opcional(1000),
});
export type CerrarOrdenInput = z.infer<typeof cerrarOrdenSchema>;

// Acciones ------------------------------------------------------------------

export const accionSchema = z.object({
  descripcion: texto(3, 1000, 'Describe la acción'),
  tipo: z.enum(['correctiva', 'preventiva', 'mejora', 'compromiso']).default('compromiso'),
  responsable: texto(3, 150, 'Indica quién es responsable'),
  responsableUsuarioId: uuid.optional().nullable(),
  venceEl: fecha,
  origen: z.enum(['comite', 'siniestro', 'auditoria', 'hallazgo', 'manual']).default('manual'),
  origenId: uuid.optional().nullable(),
});
export type AccionInput = z.infer<typeof accionSchema>;

export const cerrarAccionSchema = z.object({ nota: texto(3, 1000, 'Explica cómo se cerró la acción') });

// Siniestros ----------------------------------------------------------------

export const siniestroSchema = z.object({
  ocurridoEn: fechaHora,
  lugar: texto(3, 300, 'Indica dónde ocurrió'),
  municipio: opcional(120),
  vehiculoId: uuid.optional().nullable(),
  placa: z.string().trim().toUpperCase().min(3, 'Escribe la placa').max(10),
  conductorId: uuid.optional().nullable(),
  conductorNombre: texto(3, 150, 'Escribe el nombre del conductor'),
  conductorDocumento: z.string().trim().regex(/^\d{5,12}$/, 'Escribe la cédula sin puntos'),
  fallecidos: z.number().int().min(0).max(500).default(0),
  heridosGraves: z.number().int().min(0).max(500).default(0),
  heridosLeves: z.number().int().min(0).max(500).default(0),
  numeroIpat: opcional(40),
  autoridad: opcional(150),
  descripcion: texto(10, 4000, 'Describe lo ocurrido (mínimo 10 caracteres)'),
  enMision: z.boolean().default(true),
  costoDirecto: dinero.default(0),
  costoIndirecto: dinero.default(0),
});
export type SiniestroInput = z.infer<typeof siniestroSchema>;

export const investigacionSchema = z.object({
  investigadores: opcional(500),
  hechos: opcional(6000),
  causasInmediatas: opcional(4000),
  causasRaiz: opcional(4000),
  leccionesAprendidas: opcional(4000),
  estado: z.enum(['pendiente', 'en_curso', 'cerrada']),
  revisadoPorComiteEl: fecha.optional().nullable(),
});
export type InvestigacionInput = z.infer<typeof investigacionSchema>;

// Comité --------------------------------------------------------------------

export const miembroComiteSchema = z.object({
  usuarioId: uuid.optional().nullable(),
  nombre: texto(3, 150, 'Escribe el nombre'),
  cargo: opcional(120),
  rolComite: z.enum(['presidente', 'secretario', 'lider_pesv', 'integrante']).default('integrante'),
  activo: z.boolean().default(true),
});
export type MiembroComiteInput = z.infer<typeof miembroComiteSchema>;

export const programarReunionSchema = z.object({
  fecha: fechaHora,
  lugar: opcional(200),
  tipo: z.enum(['ordinaria', 'extraordinaria']).default('ordinaria'),
  /** Si se omite, se usa la agenda sugerida con los pendientes de la organización. */
  agenda: z.array(texto(3, 300, 'Escribe el punto de agenda')).max(30).optional(),
});
export type ProgramarReunionInput = z.infer<typeof programarReunionSchema>;

export const notasPuntoSchema = z.object({ notas: z.string().max(20000) });

export const asistenciaSchema = z.object({ miembroId: uuid, presente: z.boolean() });

export const decisionSchema = z.object({
  puntoId: z.string().max(40).optional(),
  texto: texto(3, 2000, 'Escribe la decisión'),
  votosAFavor: z.number().int().min(0).max(200),
  votosEnContra: z.number().int().min(0).max(200),
  abstenciones: z.number().int().min(0).max(200).default(0),
});
export type DecisionInput = z.infer<typeof decisionSchema>;

export const firmaActaSchema = z.object({ password: z.string().min(1, 'Confirma con tu contraseña') });

// Planificación -------------------------------------------------------------

export const metaSchema = z.object({
  anio: z.number().int().min(2020).max(2100),
  objetivo: texto(3, 500, 'Escribe el objetivo'),
  indicador: texto(3, 300, 'Escribe el indicador'),
  meta: z.number(),
  valorActual: z.number().optional().nullable(),
  sentido: z.enum(['menor_o_igual', 'mayor_o_igual']).default('menor_o_igual'),
});
export type MetaInput = z.infer<typeof metaSchema>;

export const actividadPlanSchema = z
  .object({
    anio: z.number().int().min(2020).max(2100),
    titulo: texto(3, 300, 'Escribe la actividad'),
    pasoNumero: z.number().int().min(1).max(24).optional().nullable(),
    responsable: texto(3, 150, 'Indica el responsable'),
    inicio: fecha,
    fin: fecha,
    estado: z.enum(['planeada', 'en_curso', 'ejecutada', 'cancelada']).default('planeada'),
    ejecutadaEl: fecha.optional().nullable(),
    presupuesto: dinero.optional().nullable(),
  })
  .refine((v) => v.fin >= v.inicio, { message: 'La fecha final no puede ser anterior a la inicial', path: ['fin'] });
export type ActividadPlanInput = z.infer<typeof actividadPlanSchema>;

export const capacitacionSchema = z.object({
  titulo: texto(3, 200, 'Escribe el título'),
  tema: texto(3, 300, 'Escribe el tema'),
  programadaEl: fecha,
  ejecutadaEl: fecha.optional().nullable(),
  horas: z.number().positive().max(200).optional().nullable(),
  instructor: opcional(150),
  estado: z.enum(['programada', 'ejecutada', 'cancelada']).default('programada'),
});
export type CapacitacionInput = z.infer<typeof capacitacionSchema>;

export const asistentesCapacitacionSchema = z.object({
  asistentes: z
    .array(
      z.object({
        conductorId: uuid.optional().nullable(),
        nombre: texto(3, 150, 'Escribe el nombre'),
        documento: z.string().trim().regex(/^\d{5,12}$/, 'Escribe la cédula sin puntos'),
        asistio: z.boolean().default(true),
      }),
    )
    .min(1, 'Agrega al menos un asistente'),
});
export type AsistentesCapacitacionInput = z.infer<typeof asistentesCapacitacionSchema>;

// Desplazamientos -----------------------------------------------------------

export const rutaSchema = z.object({
  nombre: texto(3, 150, 'Ponle un nombre a la ruta'),
  origen: texto(2, 200, 'Escribe el origen'),
  destino: texto(2, 200, 'Escribe el destino'),
  distanciaKm: z.number().positive().max(10_000),
  viajesPorMes: z.number().int().min(0).max(10_000).default(0),
  limiteVelocidad: z.number().int().min(5).max(150).optional().nullable(),
  notasRiesgo: opcional(2000),
  activa: z.boolean().default(true),
});
export type RutaInput = z.infer<typeof rutaSchema>;

export const viajeSchema = z.object({
  rutaId: uuid.optional().nullable(),
  vehiculoId: uuid,
  conductorId: uuid,
  salida: fechaHora,
  llegada: fechaHora.optional().nullable(),
  distanciaKm: z.number().min(0).max(10_000).optional().nullable(),
  velocidadMaxima: z.number().int().min(0).max(300).optional().nullable(),
  excesoJornada: z.boolean().default(false),
});
export type ViajeInput = z.infer<typeof viajeSchema>;
