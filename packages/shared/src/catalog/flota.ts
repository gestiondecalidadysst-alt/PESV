/**
 * Catálogo base de tipos de vehículo y plantillas de inspección preoperacional.
 * Es contenido de producto (no normativo): cada organización podrá ajustarlo más adelante.
 */

export const TIPOS_VEHICULO = [
  { id: 'motocicleta', nombre: 'Motocicleta', plantilla: 'moto', motorizado: true },
  { id: 'automovil', nombre: 'Automóvil', plantilla: 'liviano', motorizado: true },
  { id: 'camioneta', nombre: 'Camioneta', plantilla: 'liviano', motorizado: true },
  { id: 'campero', nombre: 'Campero', plantilla: 'liviano', motorizado: true },
  { id: 'microbus', nombre: 'Microbús', plantilla: 'pasajeros', motorizado: true },
  { id: 'buseta', nombre: 'Buseta', plantilla: 'pasajeros', motorizado: true },
  { id: 'bus', nombre: 'Bus', plantilla: 'pasajeros', motorizado: true },
  { id: 'camion', nombre: 'Camión', plantilla: 'carga', motorizado: true },
  { id: 'tractocamion', nombre: 'Tractocamión', plantilla: 'carga', motorizado: true },
  { id: 'volqueta', nombre: 'Volqueta', plantilla: 'carga', motorizado: true },
  { id: 'maquinaria', nombre: 'Maquinaria amarilla o agrícola', plantilla: 'maquinaria', motorizado: true },
  { id: 'bicicleta', nombre: 'Bicicleta', plantilla: 'bicicleta', motorizado: false },
  { id: 'otro_no_motorizado', nombre: 'Otro no motorizado', plantilla: 'bicicleta', motorizado: false },
] as const;

export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number]['id'];
export const IDS_TIPO_VEHICULO = TIPOS_VEHICULO.map((t) => t.id) as [TipoVehiculo, ...TipoVehiculo[]];

export interface ItemInspeccion {
  codigo: string;
  nombre: string;
  /** Una falla en un ítem crítico deja el vehículo "no apto" (RN-14). */
  critico: boolean;
}

const documentos: ItemInspeccion = { codigo: 'documentos', nombre: 'SOAT, revisión técnico-mecánica y licencia vigentes', critico: true };
const luces: ItemInspeccion = { codigo: 'luces', nombre: 'Luces delanteras, traseras, direccionales y de freno', critico: true };
const frenos: ItemInspeccion = { codigo: 'frenos', nombre: 'Frenos', critico: true };
const llantas: ItemInspeccion = { codigo: 'llantas', nombre: 'Llantas: presión, labrado y estado', critico: true };
const espejos: ItemInspeccion = { codigo: 'espejos', nombre: 'Espejos', critico: false };
const pito: ItemInspeccion = { codigo: 'pito', nombre: 'Pito', critico: false };

export const PLANTILLAS_INSPECCION: Readonly<Record<string, { nombre: string; items: readonly ItemInspeccion[] }>> = {
  moto: {
    nombre: 'Motocicleta',
    items: [
      documentos, luces, frenos, llantas, espejos, pito,
      { codigo: 'transmision', nombre: 'Cadena o transmisión', critico: false },
      { codigo: 'casco', nombre: 'Casco y elementos de protección', critico: true },
    ],
  },
  liviano: {
    nombre: 'Vehículo liviano',
    items: [
      documentos, luces, frenos, llantas,
      { codigo: 'direccion', nombre: 'Dirección', critico: true },
      { codigo: 'cinturones', nombre: 'Cinturones de seguridad', critico: true },
      espejos,
      { codigo: 'limpiaparabrisas', nombre: 'Limpiaparabrisas', critico: false },
      pito,
      { codigo: 'fluidos', nombre: 'Niveles de aceite, refrigerante y frenos', critico: false },
      { codigo: 'kit', nombre: 'Kit de carretera y extintor', critico: false },
    ],
  },
  pasajeros: {
    nombre: 'Vehículo de pasajeros',
    items: [
      documentos, luces, frenos, llantas,
      { codigo: 'direccion', nombre: 'Dirección', critico: true },
      { codigo: 'cinturones', nombre: 'Cinturones de seguridad', critico: true },
      { codigo: 'salidas', nombre: 'Salidas de emergencia y martillos', critico: true },
      espejos,
      { codigo: 'limpiaparabrisas', nombre: 'Limpiaparabrisas', critico: false },
      pito,
      { codigo: 'fluidos', nombre: 'Niveles de aceite, refrigerante y frenos', critico: false },
      { codigo: 'kit', nombre: 'Kit de carretera, botiquín y extintor', critico: false },
    ],
  },
  carga: {
    nombre: 'Vehículo de carga',
    items: [
      documentos, luces, frenos, llantas,
      { codigo: 'direccion', nombre: 'Dirección', critico: true },
      { codigo: 'cinturones', nombre: 'Cinturones de seguridad', critico: true },
      { codigo: 'amarre', nombre: 'Amarre y estiba de la carga', critico: true },
      { codigo: 'alarma_reversa', nombre: 'Alarma y luz de reversa', critico: false },
      espejos,
      pito,
      { codigo: 'fluidos', nombre: 'Niveles de aceite, refrigerante y frenos', critico: false },
      { codigo: 'kit', nombre: 'Kit de carretera, conos y extintor', critico: false },
    ],
  },
  maquinaria: {
    nombre: 'Maquinaria',
    items: [
      frenos,
      { codigo: 'hidraulico', nombre: 'Sistema hidráulico sin fugas', critico: true },
      { codigo: 'alarma_reversa', nombre: 'Alarma y luz de reversa', critico: true },
      { codigo: 'cinturones', nombre: 'Cinturón y estructura antivuelco', critico: true },
      luces,
      { codigo: 'extintor', nombre: 'Extintor', critico: false },
    ],
  },
  bicicleta: {
    nombre: 'Bicicleta',
    items: [
      frenos,
      { codigo: 'llantas', nombre: 'Llantas', critico: true },
      { codigo: 'reflectivos', nombre: 'Luces y reflectivos', critico: true },
      { codigo: 'casco', nombre: 'Casco', critico: true },
      { codigo: 'transmision', nombre: 'Cadena y cambios', critico: false },
    ],
  },
};

export function plantillaParaTipo(tipo: string) {
  const id = TIPOS_VEHICULO.find((t) => t.id === tipo)?.plantilla ?? 'liviano';
  return { id, ...PLANTILLAS_INSPECCION[id]! };
}

/** Días de anticipación de las alertas de vencimiento (RN-15). */
export const DIAS_ALERTA_VENCIMIENTO = [30, 15, 5] as const;
