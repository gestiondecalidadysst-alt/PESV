import { z } from 'zod';
import { IDS_TIPO_VEHICULO } from './catalog/flota';
import { IDS_AGENTE_IA, IDS_PROVEEDOR_IA } from './catalog/ia';
import { ROLES } from './roles';
import { IDS_ALCANCE_TOKEN, IDS_EVENTO } from './catalog/eventos';
import { crearOrganizacionSchema } from './schemas';
import { ESTADOS_PASO } from './types';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');
const fechaOpcional = fecha.optional().nullable();
const texto = (max = 200) => z.string().trim().max(max);

export const emailSchema = z.string().trim().toLowerCase().email('Escribe un correo válido').max(200);
export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200)
  .regex(/[A-Za-z]/, 'La contraseña debe incluir letras')
  .regex(/\d/, 'La contraseña debe incluir números');

export const registroSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre').max(120),
  email: emailSchema,
  password: passwordSchema,
  organizacion: crearOrganizacionSchema,
});
export type RegistroInput = z.infer<typeof registroSchema>;

export const ingresoSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Escribe tu contraseña').max(200),
});
export type IngresoInput = z.infer<typeof ingresoSchema>;

export const invitarMiembroSchema = z.object({
  email: emailSchema,
  nombre: z.string().trim().min(2, 'Escribe el nombre').max(120),
  roles: z.array(z.enum(ROLES)).min(1, 'Elige al menos un rol'),
  /** Solo si el usuario aún no existe en la plataforma. */
  passwordTemporal: passwordSchema.optional(),
});
export type InvitarMiembroInput = z.infer<typeof invitarMiembroSchema>;

export const actualizarPasoSchema = z.object({
  estado: z.enum(ESTADOS_PASO).exclude(['no_aplica']),
});
export type ActualizarPasoInput = z.infer<typeof actualizarPasoSchema>;

export const decisionEvidenciaSchema = z
  .object({
    decision: z.enum(['aprobar', 'rechazar']),
    motivo: texto(500).optional(),
  })
  .refine((v) => v.decision === 'aprobar' || (v.motivo && v.motivo.length >= 5), {
    message: 'Explica por qué se rechaza la evidencia',
    path: ['motivo'],
  });
export type DecisionEvidenciaInput = z.infer<typeof decisionEvidenciaSchema>;

export const subirEvidenciaSchema = z.object({
  titulo: z.string().trim().min(3, 'Ponle un título a la evidencia').max(200),
  descripcion: texto(1000).optional(),
  pasoNumero: z.coerce.number().int().min(1).max(24),
  /** Si reemplaza una evidencia anterior (nueva versión). */
  reemplazaId: z.string().uuid().optional(),
});
export type SubirEvidenciaInput = z.infer<typeof subirEvidenciaSchema>;

export const vehiculoSchema = z.object({
  placa: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,10}$/, 'Escribe la placa sin espacios'),
  tipo: z.enum(IDS_TIPO_VEHICULO),
  servicio: z.enum(['particular', 'publico', 'oficial', 'diplomatico', 'otro']).default('particular'),
  propiedad: z.enum(['propio', 'contratista', 'tercero']),
  marca: texto(80).optional(),
  modelo: z.number().int().min(1950).max(2100).optional().nullable(),
  capacidad: texto(80).optional(),
  soatVence: fechaOpcional,
  rtmVence: fechaOpcional,
  odometroKm: z.number().int().min(0).optional().nullable(),
  estado: z.enum(['apto', 'no_apto', 'inactivo']).optional(),
});
export type VehiculoInput = z.infer<typeof vehiculoSchema>;

export const conductorSchema = z.object({
  documento: z.string().trim().regex(/^\d{5,12}$/, 'Escribe la cédula sin puntos'),
  nombre: z.string().trim().min(3, 'Escribe el nombre completo').max(150),
  telefono: texto(30).optional(),
  email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
  categoriaLicencia: texto(10).optional(),
  licenciaVence: fechaOpcional,
  examenMedicoVence: fechaOpcional,
  tipoContrato: z.enum(['directo', 'contratista', 'tercero', 'otro']).default('directo'),
  rolVia: z.enum(['conductor', 'motociclista', 'ciclista', 'peaton', 'pasajero']).default('conductor'),
  activo: z.boolean().optional(),
  /** Ley 1581 de 2012: el conductor autorizó el tratamiento de sus datos (RN-29). */
  consentimientoDatos: z.literal(true, { error: 'Se requiere la autorización de tratamiento de datos' }),
});
export type ConductorInput = z.infer<typeof conductorSchema>;

export const inspeccionSchema = z.object({
  vehiculoId: z.string().uuid(),
  conductorId: z.string().uuid().optional().nullable(),
  odometroKm: z.number().int().min(0).optional().nullable(),
  items: z
    .array(z.object({ codigo: z.string().min(1).max(40), ok: z.boolean(), nota: texto(300).optional() }))
    .min(1, 'Revisa al menos un ítem'),
  notas: texto(1000).optional(),
  /** Identificador generado en el celular para no duplicar envíos hechos sin conexión. */
  clientId: z.string().min(8).max(64),
  realizadaEn: z.string().datetime({ offset: true }),
});
export type InspeccionInput = z.infer<typeof inspeccionSchema>;

export const iaConfigSchema = z
  .object({
    proveedor: z.enum(IDS_PROVEEDOR_IA),
    modelo: z.string().trim().min(1, 'Escribe el modelo').max(120),
    modeloEconomico: texto(120).optional(),
    urlBase: z.string().trim().url('Escribe una URL válida').optional().or(z.literal('').transform(() => undefined)),
    despliegue: texto(120).optional(),
    versionApi: texto(40).optional(),
    /** Se omite para conservar la clave guardada. */
    claveApi: z.string().trim().min(8).max(500).optional(),
    presupuestoMensualUsd: z.number().min(0).max(1_000_000).optional().nullable(),
    precioEntradaPorMillon: z.number().min(0).max(10_000).default(0),
    precioSalidaPorMillon: z.number().min(0).max(10_000).default(0),
    umbralAlertaPct: z.number().int().min(1).max(100).default(80),
    agentes: z.array(z.enum(IDS_AGENTE_IA)).default(['copiloto', 'redactor', 'diagnostico', 'lector']),
  })
  .superRefine((v, ctx) => {
    if ((v.proveedor === 'azure' || v.proveedor === 'local' || v.proveedor === 'compatible') && !v.urlBase) {
      ctx.addIssue({ code: 'custom', path: ['urlBase'], message: 'Este proveedor necesita la URL del servicio' });
    }
    if (v.proveedor === 'azure' && !v.despliegue) {
      ctx.addIssue({ code: 'custom', path: ['despliegue'], message: 'Escribe el nombre del despliegue de Azure' });
    }
  });
export type IaConfigInput = z.infer<typeof iaConfigSchema>;

export const copilotoSchema = z.object({
  pregunta: z.string().trim().min(3, 'Escribe tu pregunta').max(2000),
});

export const redactarSchema = z.object({
  pasoNumero: z.number().int().min(1).max(24),
  documento: z.string().trim().min(3, 'Indica qué documento necesitas').max(200),
  instrucciones: texto(2000).optional(),
});
export type RedactarInput = z.infer<typeof redactarSchema>;

export const webhookSchema = z.object({
  nombre: z.string().trim().min(2, 'Ponle un nombre').max(100),
  url: z.string().trim().url('Escribe la URL del webhook de n8n').regex(/^https?:\/\//, 'La URL debe empezar por http:// o https://'),
  eventos: z.array(z.enum(IDS_EVENTO)).min(1, 'Elige al menos un evento'),
  activo: z.boolean().default(true),
});
export type WebhookInput = z.infer<typeof webhookSchema>;

export const tokenApiSchema = z.object({
  nombre: z.string().trim().min(2, 'Ponle un nombre al token').max(100),
  alcances: z.array(z.enum(IDS_ALCANCE_TOKEN)).min(1, 'Elige al menos un permiso'),
});
export type TokenApiInput = z.infer<typeof tokenApiSchema>;
