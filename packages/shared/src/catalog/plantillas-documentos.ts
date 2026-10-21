import type { ClaseDocumento } from './documentos';

/**
 * Plantillas para redactar documentos controlados del PESV. Son un punto de partida: la
 * organización las adapta antes de aprobarlas. Las marcas {{…}} se reemplazan con sus datos.
 * Formato: subconjunto de Markdown (# títulos, - viñetas, 1. listas, **negrita**).
 */
export interface PlantillaDocumento {
  id: string;
  nombre: string;
  clase: ClaseDocumento;
  paso: number;
  descripcion: string;
  contenido: string;
}

export const PLANTILLAS_DOCUMENTO: readonly PlantillaDocumento[] = [
  {
    id: 'politica_seguridad_vial',
    nombre: 'Política de seguridad vial',
    clase: 'politica',
    paso: 3,
    descripcion: 'Compromisos de la alta dirección frente a la seguridad vial. Debe firmarla el representante legal y divulgarse a todos los colaboradores.',
    contenido: `# Política de seguridad vial

**{{organizacion}}**, identificada con NIT {{nit}}, consciente de que los desplazamientos de sus colaboradores, contratistas y visitantes implican riesgos para la vida y la integridad de las personas, se compromete a gestionar la seguridad vial como parte de su cultura organizacional, mediante el Plan Estratégico de Seguridad Vial (PESV), en cumplimiento de la Ley 1503 de 2011, la Ley 2050 de 2020 y la Resolución 40595 de 2022 del Ministerio de Transporte.

## Compromisos

Para ello, la alta dirección se compromete a:

1. Cumplir la normatividad vigente en materia de tránsito, transporte y seguridad vial, así como los demás requisitos que la organización suscriba.
2. Identificar los peligros, evaluar y controlar los riesgos viales a los que se exponen los colaboradores en sus desplazamientos en misión y, en lo posible, in itinere.
3. Asignar los recursos humanos, técnicos, financieros y tecnológicos necesarios para diseñar, implementar, verificar y mejorar el PESV.
4. Promover comportamientos seguros en todos los actores viales mediante formación, sensibilización y seguimiento.
5. Garantizar que los vehículos propios y contratados se encuentren en condiciones técnico-mecánicas seguras, con inspección y mantenimiento oportunos.
6. Prevenir los siniestros viales y atender, investigar y aprender de los que ocurran.
7. Consultar y hacer partícipes a los colaboradores en la gestión de la seguridad vial.
8. Mejorar continuamente el desempeño en seguridad vial, con base en el seguimiento de los objetivos, metas e indicadores del PESV.

## Alcance

Esta política aplica a todos los colaboradores, contratistas y visitantes de {{organizacion}} en sus desplazamientos laborales, sin importar su rol en la vía: conductores, motociclistas, ciclistas, pasajeros y peatones.

## Revisión y divulgación

La política se revisa al menos una vez al año o cuando cambien las condiciones de la organización, y se divulga a todos los colaboradores y partes interesadas.

Dada en {{municipio}}, el {{fecha}}.

**{{representante}}**
Representante legal`,
  },
  {
    id: 'designacion_lider',
    nombre: 'Designación del líder del PESV',
    clase: 'acta',
    paso: 1,
    descripcion: 'Documento con el que la alta dirección designa al líder del diseño e implementación del PESV, con sus responsabilidades.',
    contenido: `# Designación del líder del Plan Estratégico de Seguridad Vial

**{{organizacion}}**, identificada con NIT {{nit}}, en cumplimiento de la Resolución 40595 de 2022, designa a **{{lider}}** como líder del diseño, implementación y verificación del Plan Estratégico de Seguridad Vial (PESV).

## Responsabilidades

- Liderar el diseño, la implementación, el seguimiento y la mejora del PESV.
- Coordinar el comité de seguridad vial y hacer seguimiento a sus compromisos.
- Gestionar los recursos aprobados por la alta dirección para el PESV.
- Reportar a la alta dirección los avances, resultados e indicadores del PESV.
- Reportar la información requerida por las autoridades (VIGIA 2).
- Promover la participación de los colaboradores en la seguridad vial.

## Autoridad

El líder del PESV cuenta con la autoridad para solicitar información a todas las áreas y proponer las acciones necesarias para cumplir el plan.

Dada en {{municipio}}, el {{fecha}}.

**{{representante}}**
Representante legal

**{{lider}}**
Líder del PESV — acepto la designación`,
  },
  {
    id: 'procedimiento',
    nombre: 'Procedimiento (estructura base)',
    clase: 'procedimiento',
    paso: 19,
    descripcion: 'Estructura para redactar cualquier procedimiento del PESV.',
    contenido: `# Nombre del procedimiento

## 1. Objetivo

Describe para qué existe el procedimiento.

## 2. Alcance

A qué procesos, personas y vehículos aplica.

## 3. Responsables

- **Líder del PESV:**
- **Jefe de área:**

## 4. Definiciones

- **Término:** definición.

## 5. Descripción de actividades

1. Primera actividad: quién la hace y cómo.
2. Segunda actividad.

## 6. Registros

- Formatos o registros que se generan.

## 7. Documentos de referencia

- Resolución 40595 de 2022.`,
  },
];

/** Reemplaza las marcas {{…}} de una plantilla; las que no tengan dato quedan para completar. */
export function llenarPlantilla(contenido: string, datos: Record<string, string | null | undefined>) {
  return contenido.replace(/\{\{(\w+)\}\}/g, (marca, clave: string) => datos[clave]?.trim() || `[${clave}]`);
}
