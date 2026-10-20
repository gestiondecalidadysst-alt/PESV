import { z } from 'zod';
import { emailSchema, passwordSchema } from './schemas-fase1';
import { IDS_EVENTO, type TipoEvento } from './catalog/eventos';
import { ROLES, type Rol } from './roles';

// Cuentas ---------------------------------------------------------------------

export const recuperarSchema = z.object({ email: emailSchema });
export type RecuperarInput = z.infer<typeof recuperarSchema>;

export const restablecerSchema = z
  .object({
    token: z.string().trim().min(20, 'El enlace no es válido').max(200),
    password: passwordSchema,
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { message: 'Las contraseñas no coinciden', path: ['confirmacion'] });
export type RestablecerInput = z.infer<typeof restablecerSchema>;

export const cambiarClaveSchema = z
  .object({
    actual: z.string().min(1, 'Escribe tu contraseña actual').max(200),
    password: passwordSchema,
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { message: 'Las contraseñas no coinciden', path: ['confirmacion'] })
  .refine((v) => v.password !== v.actual, { message: 'La nueva contraseña debe ser distinta de la actual', path: ['password'] });
export type CambiarClaveInput = z.infer<typeof cambiarClaveSchema>;

/** Vigencia de los enlaces: recuperación 60 minutos, invitación 7 días. */
export const VIGENCIA_ENLACE_MINUTOS = { recuperacion: 60, invitacion: 7 * 24 * 60 } as const;

// Notificaciones por correo ---------------------------------------------------

/** Quién recibe por correo cada evento al crear una organización (se puede cambiar después). */
export const NOTIFICACIONES_POR_DEFECTO: Partial<Record<TipoEvento, Rol[]>> = {
  'documento.vencido': ['admin', 'lider_pesv'],
  'documento.por_vencer': ['lider_pesv'],
  'preoperacional.falla': ['lider_pesv', 'mantenimiento'],
  'evidencia.por_revisar': ['lider_pesv'],
  'siniestro.creado': ['admin', 'lider_pesv', 'comite'],
  'mantenimiento.vencido': ['mantenimiento'],
  'vigia.plazo': ['lider_pesv'],
  'accion.por_vencer': ['lider_pesv'],
  'comite.reunion': ['comite', 'lider_pesv'],
  'auditoria.hallazgo': ['lider_pesv'],
  'riesgo.critico': ['lider_pesv'],
  'ia.presupuesto': ['admin'],
};

export const reglaCorreoSchema = z.object({
  evento: z.enum(IDS_EVENTO).refine((e) => e !== 'prueba', 'Evento no válido'),
  roles: z.array(z.enum(ROLES)).max(ROLES.length),
  correos: z.array(emailSchema).max(20, 'Máximo 20 correos adicionales'),
  activa: z.boolean(),
});
export type ReglaCorreoInput = z.infer<typeof reglaCorreoSchema>;

// Errores del navegador -------------------------------------------------------

export const errorWebSchema = z.object({
  mensaje: z.string().trim().min(1).max(1000),
  pila: z.string().max(8000).optional(),
  url: z.string().max(1000).optional(),
  componente: z.string().max(4000).optional(),
});
export type ErrorWebInput = z.infer<typeof errorWebSchema>;
