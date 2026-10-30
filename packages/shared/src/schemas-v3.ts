import { z } from 'zod';
import { IDS_EQUIPO_VELOCIDAD, IDS_PRUEBA_SUSTANCIAS, IDS_TIPO_PROGRAMA, INSTANCIAS_REVISION, RESULTADOS_PRUEBA } from './catalog/programas';

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
const texto = (min: number, max: number, mensaje: string) => z.string().trim().min(min, mensaje).max(max);
const ids = <T extends string>(lista: readonly { id: T }[]) => lista.map((x) => x.id) as [T, ...T[]];

// Requisitos de los pasos ---------------------------------------------------------

export const verificarRequisitoSchema = z
  .object({
    estado: z.enum(['cumple', 'no_cumple']),
    nota: texto(3, 2000, 'Explica cómo se cumple o qué falta'),
    evidenciaId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.estado === 'no_cumple' || !!v.evidenciaId, { message: 'Elige la evidencia aprobada que lo soporta', path: ['evidenciaId'] });
export type VerificarRequisitoInput = z.infer<typeof verificarRequisitoSchema>;

// Programas de riesgos críticos (paso 8) ------------------------------------------

export const programaSchema = z.object({
  tipo: z.enum(IDS_TIPO_PROGRAMA),
  nombre: texto(3, 200, 'Escribe el nombre del programa'),
  lineamientos: opcional(4000),
  alcance: opcional(2000),
  inicio: fecha.nullable().optional(),
  duracionMeses: z.number().int().min(1, 'La duración es de al menos un mes').max(120).nullable().optional(),
  lineaBase: opcional(2000),
  objetivos: opcional(2000),
  factores: opcional(2000),
  responsable: opcional(150),
  presupuesto: z.number().min(0).max(100_000_000_000).nullable().optional(),
  seguimiento: opcional(2000),
  elementos: z.array(z.string().max(40)).max(20).default([]),
  indicadorIds: z.array(z.string().uuid()).max(20).default([]),
  riesgoIds: z.array(z.string().uuid()).max(50).default([]),
});
export type ProgramaInput = z.infer<typeof programaSchema>;

export const actualizacionProgramaSchema = z.object({
  fecha,
  divulgacion: texto(3, 1000, 'Indica cómo se divulgó (medio, a quién)'),
});
export type ActualizacionProgramaInput = z.infer<typeof actualizacionProgramaSchema>;

export const revisionProgramasSchema = z.object({
  periodo: z.string().regex(/^\d{4}-T[1-4]$/, 'Periodo inválido'),
  fecha,
  instancia: z.enum(ids(INSTANCIAS_REVISION)),
  reunionId: z.string().uuid().nullable().optional(),
  participantes: texto(3, 1000, 'Indica quiénes participaron'),
  conclusiones: texto(10, 4000, 'Escribe el análisis y las conclusiones'),
});
export type RevisionProgramasInput = z.infer<typeof revisionProgramasSchema>;

export const equipoVelocidadSchema = z
  .object({
    tipo: z.enum(IDS_EQUIPO_VELOCIDAD),
    nombre: texto(2, 150, 'Escribe el nombre o la referencia del equipo'),
    serial: opcional(80),
    vehiculoId: z.string().uuid().nullable().optional(),
    calibradoEl: fecha.nullable().optional(),
    calibracionVence: fecha.nullable().optional(),
    notas: opcional(1000),
    activo: z.boolean().default(true),
  })
  .refine((v) => !v.calibradoEl || !v.calibracionVence || v.calibracionVence >= v.calibradoEl, { message: 'El vencimiento no puede ser anterior a la calibración', path: ['calibracionVence'] });
export type EquipoVelocidadInput = z.infer<typeof equipoVelocidadSchema>;

export const pruebaSustanciasSchema = z.object({
  conductorId: z.string().uuid(),
  tipo: z.enum(IDS_PRUEBA_SUSTANCIAS),
  metodo: opcional(150),
  fecha,
  resultado: z.enum(ids(RESULTADOS_PRUEBA)),
  consentimiento: z.literal(true, { error: 'Se requiere la autorización del colaborador (Ley 1581 de 2012)' }),
  notas: opcional(1000),
});
export type PruebaSustanciasInput = z.infer<typeof pruebaSustanciasSchema>;
