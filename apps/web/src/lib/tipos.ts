import type { EstadoPaso, Fase, Nivel, ResultadoClasificacion } from '@pesv/shared';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  esAdminPlataforma: boolean;
}

export interface Membresia {
  id: string;
  nombre: string;
  nit: string;
  roles: string[];
}

export interface Yo {
  usuario: Usuario;
  organizaciones: Membresia[];
}

export interface DetalleOrganizacion {
  organizacion: { id: string; name: string; nit: string; misionalidad: 1 | 2; modalityId: string | null; actionRadius: string | null };
  clasificacion: {
    vehicles: number;
    drivers: number;
    level: Nivel;
    levelByVehicles: Nivel | null;
    levelByDrivers: Nivel | null;
    reportsToSupertransporte: boolean;
    applicableSteps: number[];
  } | null;
  resumen: { aplicables: number; hechos: number; enCurso: number; pendientes: number; porcentajeCumplimiento: number };
}

export interface EstadoDePaso {
  numero: number;
  fase: Fase;
  nombre: string;
  estado: EstadoPaso;
  actualizado: string | null;
  clausulasIso: string[];
  evidencias: { aprobadas: number; enRevision: number; rechazadas: number };
}

export interface Evidencia {
  id: string;
  titulo: string;
  descripcion: string | null;
  paso: number;
  clausulasIso: string[];
  archivo: string | null;
  tipo: string | null;
  tamano: number | null;
  version: number;
  versiones: number;
  estado: 'borrador' | 'aprobada' | 'rechazada';
  motivoRechazo: string | null;
  generadaPorIa: boolean;
  subidaPor: string | null;
  aprobadaEn: string | null;
  creadaEn: string;
}

export type EstadoDocumento = 'vencido' | 'por_vencer' | 'vigente' | 'sin_dato';

export interface Vehiculo {
  id: string;
  placa: string;
  tipo: string;
  servicio: string;
  propiedad: 'propio' | 'contratista' | 'tercero';
  motorizado: boolean;
  marca: string | null;
  modelo: number | null;
  capacidad: string | null;
  soatVence: string | null;
  rtmVence: string | null;
  odometroKm: number | null;
  estado: 'apto' | 'no_apto' | 'inactivo';
  documentos: { soat: EstadoDocumento; rtm: EstadoDocumento };
}

export interface Conductor {
  id: string;
  documento: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  categoriaLicencia: string | null;
  licenciaVence: string | null;
  examenMedicoVence: string | null;
  tipoContrato: string;
  rolVia: string;
  activo: boolean;
  documentos: { licencia: EstadoDocumento; examenMedico: EstadoDocumento };
}

export interface Alerta {
  tipo: string;
  severidad: 'critica' | 'advertencia';
  titulo: string;
  detalle: string;
  entidad: 'vehiculo' | 'conductor';
  entidadId: string;
  vence?: string;
  dias?: number;
}

export interface Tablero {
  cumplimiento: DetalleOrganizacion['resumen'];
  nivel: Nivel | null;
  flota: { vehiculos: number; noAptos: number; conductoresActivos: number };
  preoperacionalesHoy: { esperados: number; realizados: number; fallasCriticas: number; fallasMenores: number };
  evidenciasPorRevisar: number;
  alertas: Alerta[];
  totalAlertas: number;
}

export interface PropuestaReclasificacion {
  vigente: { nivel: Nivel; vehiculos: number; conductores: number };
  registrados: { vehiculos: number; conductores: number };
  propuesta: ResultadoClasificacion;
  cambiaNivel: boolean;
}

export interface Miembro {
  id: string;
  email: string;
  nombre: string;
  roles: string[];
  ultimoIngreso: string | null;
}
