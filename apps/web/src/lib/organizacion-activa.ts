// FASE 0: la organización activa se recuerda en este navegador. En la Fase 1 sale de la sesión
// autenticada del usuario.
const CLAVE = 'pesv.organizacionActiva';

export function leerOrganizacionActiva(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarOrganizacionActiva(id: string | null) {
  try {
    if (id) localStorage.setItem(CLAVE, id);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento disponible (modo privado): la app sigue funcionando en esta sesión.
  }
}
