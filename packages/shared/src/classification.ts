import {
  MODALIDADES,
  OBLIGACION,
  PASOS_PESV,
  RES_40595_2022,
  REGLAS_NIVEL,
} from './catalog/pesv-40595';
import type { Misionalidad, Nivel, PasoPesv, Rango, ReglaNivel } from './types';
import { NIVELES } from './types';

export interface EntradaClasificacion {
  misionalidad: Misionalidad;
  /** Vehículos automotores y no automotores (propios, de contratistas o de terceros al servicio de la organización). */
  vehiculos: number;
  /** Personas que conducen para la organización, sin importar su cargo. */
  conductores: number;
  /** Id de modalidad del catálogo; si se omite, se asume que reporta a Supertransporte. */
  modalidadId?: string;
}

export interface ResultadoClasificacion {
  versionNormativa: string;
  obligada: boolean;
  motivosObligacion: string[];
  nivel: Nivel | null;
  nivelPorVehiculos: Nivel | null;
  nivelPorConductores: Nivel | null;
  /** Qué criterio definió el nivel final. */
  criterioDeterminante: 'vehiculos' | 'conductores' | 'ambos' | null;
  pasosAplicables: number[];
  pasosNoAplicables: number[];
  reportaSupertransporte: boolean;
}

export interface CatalogoClasificacion {
  reglas: readonly ReglaNivel[];
  pasos: readonly PasoPesv[];
  versionId: string;
}

const CATALOGO_POR_DEFECTO: CatalogoClasificacion = {
  reglas: REGLAS_NIVEL,
  pasos: PASOS_PESV,
  versionId: RES_40595_2022.id,
};

const dentroDe = (valor: number, rango: Rango) =>
  valor >= rango.min && (rango.max === null || valor <= rango.max);

const rango = (nivel: Nivel | null) => (nivel === null ? -1 : NIVELES.indexOf(nivel));

/** El nivel más exigente entre dos (null = no alcanza ningún nivel). */
export function nivelMasExigente(a: Nivel | null, b: Nivel | null): Nivel | null {
  return rango(a) >= rango(b) ? a : b;
}

function nivelPor(
  criterio: 'vehiculos' | 'conductores',
  misionalidad: Misionalidad,
  valor: number,
  reglas: readonly ReglaNivel[],
): Nivel | null {
  const regla = reglas.find((r) => r.misionalidad === misionalidad && dentroDe(valor, r[criterio]));
  return regla ? regla.nivel : null;
}

/** Pasos que aplican a un nivel, en orden. */
export function pasosParaNivel(nivel: Nivel, pasos: readonly PasoPesv[] = PASOS_PESV): number[] {
  return pasos.filter((p) => p.niveles.includes(nivel)).map((p) => p.numero);
}

/**
 * Clasifica una organización según la metodología PESV.
 *
 * Reglas (ver docs/reglas-de-negocio.md, RN-01 a RN-05):
 * - Obligada si tiene más de 10 vehículos o 2 o más conductores.
 * - El nivel es el más exigente entre el que resulta por vehículos y el que resulta por conductores.
 * - Los pasos aplicables salen del catálogo filtrado por nivel.
 * - Las modalidades urbana, colectiva y masiva no reportan en el módulo PESV de VIGIA 2.
 */
export function clasificar(
  entrada: EntradaClasificacion,
  catalogo: CatalogoClasificacion = CATALOGO_POR_DEFECTO,
): ResultadoClasificacion {
  const { misionalidad, vehiculos, conductores } = entrada;

  if (
    !Number.isInteger(vehiculos) ||
    vehiculos < 0 ||
    !Number.isInteger(conductores) ||
    conductores < 0
  ) {
    throw new RangeError('Vehículos y conductores deben ser enteros mayores o iguales a cero.');
  }

  const motivosObligacion: string[] = [];
  if (vehiculos > OBLIGACION.vehiculosMayorA) {
    motivosObligacion.push(`Tiene ${vehiculos} vehículos (más de ${OBLIGACION.vehiculosMayorA}).`);
  }
  if (conductores >= OBLIGACION.conductoresDesde) {
    motivosObligacion.push(
      `Tiene ${conductores} conductores (${OBLIGACION.conductoresDesde} o más).`,
    );
  }
  const obligada = motivosObligacion.length > 0;

  const nivelPorVehiculos = nivelPor('vehiculos', misionalidad, vehiculos, catalogo.reglas);
  const nivelPorConductores = nivelPor('conductores', misionalidad, conductores, catalogo.reglas);
  const nivel = obligada ? nivelMasExigente(nivelPorVehiculos, nivelPorConductores) : null;

  let criterioDeterminante: ResultadoClasificacion['criterioDeterminante'] = null;
  if (nivel) {
    const porV = nivelPorVehiculos === nivel;
    const porC = nivelPorConductores === nivel;
    criterioDeterminante = porV && porC ? 'ambos' : porV ? 'vehiculos' : 'conductores';
  }

  const pasosAplicables = nivel ? pasosParaNivel(nivel, catalogo.pasos) : [];
  const pasosNoAplicables = catalogo.pasos
    .map((p) => p.numero)
    .filter((n) => !pasosAplicables.includes(n));

  const modalidad = MODALIDADES.find((m) => m.id === entrada.modalidadId);
  const reportaSupertransporte = obligada && (modalidad ? modalidad.reportaSupertransporte : true);

  return {
    versionNormativa: catalogo.versionId,
    obligada,
    motivosObligacion,
    nivel,
    nivelPorVehiculos,
    nivelPorConductores,
    criterioDeterminante,
    pasosAplicables,
    pasosNoAplicables,
    reportaSupertransporte,
  };
}
