/**
 * Encuesta de caracterización de los colaboradores (perfil sociodemográfico y de desplazamientos),
 * insumo del diagnóstico del PESV (paso 5). El cuestionario es un dato versionado: si cambia, se
 * agrega una versión nueva y las campañas anteriores conservan la suya.
 */

export type TipoPregunta = 'unica' | 'multiple' | 'texto';

export interface Opcion {
  id: string;
  nombre: string;
}

export interface Pregunta {
  id: string;
  seccion: string;
  texto: string;
  tipo: TipoPregunta;
  opciones?: readonly Opcion[];
  obligatoria: boolean;
  ayuda?: string;
  /** Solo se pregunta si otra respuesta tiene alguno de estos valores. */
  si?: { pregunta: string; valores: readonly string[] };
}

export interface Cuestionario {
  id: string;
  nombre: string;
  secciones: readonly string[];
  preguntas: readonly Pregunta[];
}

const o = (pares: readonly (readonly [string, string])[]): Opcion[] => pares.map(([id, nombre]) => ({ id, nombre }));
const SI_NO = o([['si', 'Sí'], ['no', 'No']]);

export const ENCUESTA_PERFIL_V1: Cuestionario = {
  id: 'perfil-v1',
  nombre: 'Encuesta de perfil y desplazamientos de los colaboradores (versión 1)',
  secciones: ['Datos generales', 'Información laboral', 'Desplazamiento de la casa al trabajo', 'Desplazamientos en misión', 'Conducción', 'Siniestralidad y comportamiento', 'Percepción del riesgo'],
  preguntas: [
    { id: 'edad', seccion: 'Datos generales', texto: '¿Cuál es su rango de edad?', tipo: 'unica', obligatoria: true, opciones: o([['18-25', '18 a 25 años'], ['26-35', '26 a 35 años'], ['36-45', '36 a 45 años'], ['46-55', '46 a 55 años'], ['56+', '56 años o más']]) },
    { id: 'genero', seccion: 'Datos generales', texto: 'Género', tipo: 'unica', obligatoria: true, opciones: o([['femenino', 'Femenino'], ['masculino', 'Masculino'], ['otro', 'Otro'], ['no_responde', 'Prefiero no responder']]) },
    { id: 'escolaridad', seccion: 'Datos generales', texto: 'Nivel educativo más alto alcanzado', tipo: 'unica', obligatoria: true, opciones: o([['primaria', 'Primaria'], ['bachillerato', 'Bachillerato'], ['tecnico', 'Técnico o tecnólogo'], ['profesional', 'Profesional'], ['posgrado', 'Posgrado']]) },
    { id: 'personas_cargo', seccion: 'Datos generales', texto: '¿Cuántas personas dependen económicamente de usted?', tipo: 'unica', obligatoria: true, opciones: o([['0', 'Ninguna'], ['1-2', '1 o 2'], ['3-4', '3 o 4'], ['5+', '5 o más']]) },
    { id: 'municipio', seccion: 'Datos generales', texto: 'Municipio donde vive', tipo: 'texto', obligatoria: false },

    { id: 'vinculacion', seccion: 'Información laboral', texto: 'Tipo de vinculación', tipo: 'unica', obligatoria: true, opciones: o([['directo', 'Contrato directo'], ['temporal', 'Empresa temporal'], ['contratista', 'Contratista'], ['servicios', 'Prestación de servicios']]) },
    { id: 'antiguedad', seccion: 'Información laboral', texto: 'Tiempo en la organización', tipo: 'unica', obligatoria: true, opciones: o([['<1', 'Menos de 1 año'], ['1-3', '1 a 3 años'], ['4-10', '4 a 10 años'], ['>10', 'Más de 10 años']]) },
    { id: 'jornada', seccion: 'Información laboral', texto: 'Jornada de trabajo', tipo: 'unica', obligatoria: true, opciones: o([['diurna', 'Diurna'], ['nocturna', 'Nocturna'], ['rotativa', 'Por turnos rotativos'], ['mixta', 'Mixta']]) },
    { id: 'rol_vial', seccion: 'Información laboral', texto: 'En su trabajo, ¿cuál es su rol principal en la vía?', tipo: 'unica', obligatoria: true, opciones: o([['conductor', 'Conductor de vehículo de la organización'], ['motociclista', 'Motociclista'], ['conductor_propio', 'Conductor de vehículo propio'], ['peaton', 'Peatón'], ['ciclista', 'Ciclista'], ['pasajero', 'Pasajero']]) },

    { id: 'medio_itinere', seccion: 'Desplazamiento de la casa al trabajo', texto: '¿Cómo se desplaza normalmente de la casa al trabajo?', tipo: 'unica', obligatoria: true, opciones: o([['a_pie', 'A pie'], ['bicicleta', 'Bicicleta o patineta'], ['motocicleta', 'Motocicleta'], ['carro', 'Carro'], ['transporte_publico', 'Transporte público'], ['transporte_empresa', 'Transporte de la empresa'], ['taxi_plataforma', 'Taxi o plataforma'], ['otro', 'Otro']]) },
    { id: 'tiempo_itinere', seccion: 'Desplazamiento de la casa al trabajo', texto: '¿Cuánto tarda en llegar al trabajo?', tipo: 'unica', obligatoria: true, opciones: o([['<15', 'Menos de 15 minutos'], ['15-30', '15 a 30 minutos'], ['31-60', '31 a 60 minutos'], ['>60', 'Más de una hora']]) },
    { id: 'vehiculo_propio', seccion: 'Desplazamiento de la casa al trabajo', texto: '¿El vehículo en que se desplaza es suyo?', tipo: 'unica', obligatoria: true, opciones: SI_NO, si: { pregunta: 'medio_itinere', valores: ['motocicleta', 'carro'] } },

    { id: 'mision', seccion: 'Desplazamientos en misión', texto: '¿Se desplaza por la vía para cumplir sus funciones (en misión)?', tipo: 'unica', obligatoria: true, opciones: o([['no', 'No'], ['ocasional', 'Ocasionalmente'], ['frecuente', 'Varias veces por semana'], ['diario', 'Todos los días']]) },
    { id: 'medio_mision', seccion: 'Desplazamientos en misión', texto: '¿En qué se desplaza en misión?', tipo: 'multiple', obligatoria: true, opciones: o([['vehiculo_empresa', 'Vehículo de la organización'], ['vehiculo_propio', 'Vehículo propio'], ['motocicleta', 'Motocicleta'], ['transporte_publico', 'Transporte público'], ['a_pie', 'A pie'], ['bicicleta', 'Bicicleta'], ['avion', 'Avión']]), si: { pregunta: 'mision', valores: ['ocasional', 'frecuente', 'diario'] } },
    { id: 'km_mision', seccion: 'Desplazamientos en misión', texto: '¿Cuántos kilómetros recorre en un día de trabajo?', tipo: 'unica', obligatoria: true, opciones: o([['<20', 'Menos de 20 km'], ['20-100', '20 a 100 km'], ['101-300', '101 a 300 km'], ['>300', 'Más de 300 km']]), si: { pregunta: 'mision', valores: ['ocasional', 'frecuente', 'diario'] } },

    { id: 'licencia', seccion: 'Conducción', texto: '¿Tiene licencia de conducción vigente?', tipo: 'unica', obligatoria: true, opciones: SI_NO },
    { id: 'categorias', seccion: 'Conducción', texto: 'Categorías de su licencia', tipo: 'multiple', obligatoria: true, opciones: o([['A1', 'A1'], ['A2', 'A2'], ['B1', 'B1'], ['B2', 'B2'], ['B3', 'B3'], ['C1', 'C1'], ['C2', 'C2'], ['C3', 'C3']]), si: { pregunta: 'licencia', valores: ['si'] } },
    { id: 'experiencia', seccion: 'Conducción', texto: '¿Cuántos años de experiencia tiene conduciendo?', tipo: 'unica', obligatoria: true, opciones: o([['<1', 'Menos de 1 año'], ['1-5', '1 a 5 años'], ['6-10', '6 a 10 años'], ['>10', 'Más de 10 años']]), si: { pregunta: 'licencia', valores: ['si'] } },

    { id: 'siniestros', seccion: 'Siniestralidad y comportamiento', texto: 'En los últimos 5 años, ¿cuántos siniestros viales ha tenido (como conductor, pasajero, peatón o ciclista)?', tipo: 'unica', obligatoria: true, opciones: o([['0', 'Ninguno'], ['1', 'Uno'], ['2', 'Dos'], ['3+', 'Tres o más']]) },
    { id: 'siniestro_tipo', seccion: 'Siniestralidad y comportamiento', texto: '¿En qué tipo de desplazamiento ocurrieron?', tipo: 'multiple', obligatoria: true, opciones: o([['in_itinere', 'De la casa al trabajo o de regreso'], ['mision', 'En misión (trabajando)'], ['personal', 'En actividades personales']]), si: { pregunta: 'siniestros', valores: ['1', '2', '3+'] } },
    { id: 'comparendos', seccion: 'Siniestralidad y comportamiento', texto: 'En los últimos 2 años, ¿cuántos comparendos de tránsito ha recibido?', tipo: 'unica', obligatoria: true, opciones: o([['0', 'Ninguno'], ['1', 'Uno'], ['2+', 'Dos o más'], ['no_aplica', 'No conduzco']]) },
    { id: 'celular', seccion: 'Siniestralidad y comportamiento', texto: '¿Con qué frecuencia usa el celular mientras conduce?', tipo: 'unica', obligatoria: true, opciones: o([['nunca', 'Nunca'], ['a_veces', 'A veces'], ['frecuente', 'Con frecuencia'], ['no_aplica', 'No conduzco']]) },

    { id: 'riesgos', seccion: 'Percepción del riesgo', texto: '¿Qué situaciones considera más riesgosas en sus desplazamientos?', tipo: 'multiple', obligatoria: true, ayuda: 'Puede elegir varias.', opciones: o([['velocidad', 'Exceso de velocidad de otros'], ['fatiga', 'Cansancio o sueño'], ['celular', 'Distracciones y celular'], ['alcohol', 'Alcohol o sustancias'], ['vias', 'Mal estado de las vías'], ['clima', 'Lluvia, neblina o noche'], ['actores', 'Motos, peatones y ciclistas'], ['trafico', 'Congestión y presión de tiempo'], ['orden_publico', 'Inseguridad u orden público'], ['vehiculo', 'Estado del vehículo']]) },
    { id: 'sugerencias', seccion: 'Percepción del riesgo', texto: '¿Qué propone para mejorar su seguridad en la vía?', tipo: 'texto', obligatoria: false },
  ],
};

export const CUESTIONARIOS = [ENCUESTA_PERFIL_V1] as const;
export const CUESTIONARIO_VIGENTE = ENCUESTA_PERFIL_V1;
export const cuestionarioPorId = (id: string) => CUESTIONARIOS.find((c) => c.id === id) ?? null;

export type Respuestas = Record<string, string | string[]>;

/** ¿Aplica la pregunta según las respuestas dadas? */
export function aplica(p: Pregunta, r: Respuestas) {
  if (!p.si) return true;
  const v = r[p.si.pregunta];
  return typeof v === 'string' && p.si.valores.includes(v);
}

/**
 * Valida las respuestas contra el cuestionario: obligatorias, opciones válidas y sin respuestas a
 * preguntas que no aplican. Devuelve las respuestas limpias o los errores por pregunta.
 */
export function validarRespuestas(c: Cuestionario, entrada: Record<string, unknown>): { ok: true; respuestas: Respuestas } | { ok: false; errores: Record<string, string> } {
  const errores: Record<string, string> = {};
  const limpias: Respuestas = {};
  for (const p of c.preguntas) {
    if (!aplica(p, limpias)) continue;
    const v = entrada[p.id];
    const vacia = v == null || v === '' || (Array.isArray(v) && v.length === 0);
    if (vacia) {
      if (p.obligatoria) errores[p.id] = 'Responde esta pregunta';
      continue;
    }
    if (p.tipo === 'texto') {
      if (typeof v !== 'string' || v.trim().length > 500) errores[p.id] = 'Máximo 500 caracteres';
      else limpias[p.id] = v.trim();
    } else if (p.tipo === 'unica') {
      if (typeof v !== 'string' || !p.opciones!.some((x) => x.id === v)) errores[p.id] = 'Opción no válida';
      else limpias[p.id] = v;
    } else {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !p.opciones!.some((op) => op.id === x))) errores[p.id] = 'Opción no válida';
      else limpias[p.id] = [...new Set(v as string[])];
    }
  }
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, respuestas: limpias };
}

export interface ResumenPregunta {
  pregunta: string;
  texto: string;
  seccion: string;
  tipo: TipoPregunta;
  /** Personas a las que aplicaba la pregunta. */
  base: number;
  respondieron: number;
  opciones: { id: string; nombre: string; cantidad: number; porcentaje: number }[];
  textos: string[];
}

/** Distribución de respuestas por pregunta (porcentajes sobre quienes respondieron). */
export function resumirRespuestas(c: Cuestionario, todas: Respuestas[]): ResumenPregunta[] {
  return c.preguntas.map((p) => {
    const aplicables = todas.filter((r) => aplica(p, r));
    const con = aplicables.filter((r) => r[p.id] != null);
    const cuenta = (id: string) => con.filter((r) => (Array.isArray(r[p.id]) ? (r[p.id] as string[]).includes(id) : r[p.id] === id)).length;
    return {
      pregunta: p.id,
      texto: p.texto,
      seccion: p.seccion,
      tipo: p.tipo,
      base: aplicables.length,
      respondieron: con.length,
      opciones: (p.opciones ?? []).map((op) => {
        const n = cuenta(op.id);
        return { id: op.id, nombre: op.nombre, cantidad: n, porcentaje: con.length ? Math.round((n / con.length) * 1000) / 10 : 0 };
      }),
      textos: p.tipo === 'texto' ? con.map((r) => r[p.id] as string) : [],
    };
  });
}

/** Hallazgos clave para el diagnóstico (porcentaje sobre el total de encuestados). */
export function hallazgosPerfil(todas: Respuestas[]) {
  const n = todas.length;
  const pct = (f: (r: Respuestas) => boolean) => (n ? Math.round((todas.filter(f).length / n) * 1000) / 10 : null);
  return [
    { id: 'moto_itinere', nombre: 'Se desplazan en moto de la casa al trabajo', valor: pct((r) => r.medio_itinere === 'motocicleta'), ayuda: 'Los motociclistas son el actor vial con mayor siniestralidad en Colombia.' },
    { id: 'mision', nombre: 'Se desplazan en misión', valor: pct((r) => typeof r.mision === 'string' && r.mision !== 'no'), ayuda: 'Define el alcance de los controles en misión (pasos 15 a 17).' },
    { id: 'siniestros', nombre: 'Han tenido siniestros en los últimos 5 años', valor: pct((r) => typeof r.siniestros === 'string' && r.siniestros !== '0'), ayuda: 'Insumo para la matriz de riesgos y la formación.' },
    { id: 'celular', nombre: 'Usan el celular al conducir a veces o con frecuencia', valor: pct((r) => r.celular === 'a_veces' || r.celular === 'frecuente'), ayuda: 'Comportamiento de riesgo para el programa de distractores.' },
    { id: 'trayecto_largo', nombre: 'Tardan más de 30 minutos en llegar al trabajo', valor: pct((r) => r.tiempo_itinere === '31-60' || r.tiempo_itinere === '>60'), ayuda: 'Mayor exposición in itinere y riesgo de fatiga.' },
    { id: 'comparendos', nombre: 'Con comparendos en los últimos 2 años', valor: pct((r) => r.comparendos === '1' || r.comparendos === '2+'), ayuda: 'Indica comportamientos a intervenir con formación.' },
  ];
}
