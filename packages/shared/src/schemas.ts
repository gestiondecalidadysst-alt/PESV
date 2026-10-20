import { z } from 'zod';
import { MODALIDADES, RADIOS_ACCION } from './catalog/pesv-40595';

const entero = (campo: string) =>
  z
    .number({ error: `${campo} debe ser un número` })
    .int(`${campo} debe ser un número entero`)
    .min(0, `${campo} no puede ser negativo`)
    .max(1_000_000, `${campo} es demasiado alto`);

export const misionalidadSchema = z.union([z.literal(1), z.literal(2)], {
  error: 'La misionalidad debe ser 1 (transporte) o 2 (otros sectores)',
});

export const entradaClasificacionSchema = z
  .object({
    misionalidad: misionalidadSchema,
    vehiculos: entero('Vehículos'),
    conductores: entero('Conductores'),
    modalidadId: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.modalidadId) return;
    const modalidad = MODALIDADES.find((m) => m.id === v.modalidadId);
    if (!modalidad) {
      ctx.addIssue({ code: 'custom', path: ['modalidadId'], message: 'Modalidad desconocida' });
    } else if (modalidad.misionalidad !== v.misionalidad) {
      ctx.addIssue({
        code: 'custom',
        path: ['modalidadId'],
        message: 'La modalidad no corresponde a la misionalidad elegida',
      });
    }
  });

export type EntradaClasificacionInput = z.infer<typeof entradaClasificacionSchema>;

/** NIT colombiano sin dígito de verificación (como lo pide VIGIA 2): 6 a 10 dígitos. */
export const nitSchema = z
  .string()
  .trim()
  .regex(/^\d{6,10}$/, 'Escribe el NIT sin puntos ni dígito de verificación');

export const crearOrganizacionSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre de la organización').max(200),
  nit: nitSchema,
  radioAccion: z.enum(RADIOS_ACCION).optional(),
  clasificacion: entradaClasificacionSchema,
});

export type CrearOrganizacionInput = z.infer<typeof crearOrganizacionSchema>;
