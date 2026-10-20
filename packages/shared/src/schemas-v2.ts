import { z } from 'zod';
import { IDS_TIPO_DOCUMENTO } from './catalog/documentos';

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
