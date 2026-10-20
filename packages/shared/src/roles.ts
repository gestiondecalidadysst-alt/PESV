export const ROLES = ['admin', 'lider_pesv', 'comite', 'conductor', 'mantenimiento', 'auditor', 'consultor'] as const;
export type Rol = (typeof ROLES)[number];

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  lider_pesv: 'Líder PESV',
  comite: 'Comité de seguridad vial',
  conductor: 'Conductor',
  mantenimiento: 'Mantenimiento',
  auditor: 'Auditor',
  consultor: 'Consultor',
};

export const PERMISOS = [
  'ver',
  'gestionar_pesv',
  'aprobar_evidencias',
  'gestionar_flota',
  'inspeccionar',
  'gestionar_mantenimiento',
  'gestionar_siniestros',
  'comite',
  'auditar',
  'gestionar_miembros',
  'configurar',
  /** Enviar viajes desde la plataforma GPS; se da a tokens de API con alcance «telematica». */
  'telematica',
] as const;
export type Permiso = (typeof PERMISOS)[number];

const TODOS: readonly Permiso[] = PERMISOS;

export const PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]> = {
  admin: TODOS,
  lider_pesv: TODOS.filter((p) => p !== 'configurar'),
  consultor: TODOS.filter((p) => p !== 'configurar' && p !== 'gestionar_miembros'),
  comite: ['ver', 'comite', 'gestionar_siniestros'],
  mantenimiento: ['ver', 'gestionar_flota', 'gestionar_mantenimiento', 'inspeccionar'],
  conductor: ['inspeccionar'],
  auditor: ['ver', 'auditar'],
};

export function tienePermiso(roles: readonly string[], permiso: Permiso): boolean {
  return roles.some((r) => (PERMISOS_POR_ROL[r as Rol] ?? []).includes(permiso));
}
