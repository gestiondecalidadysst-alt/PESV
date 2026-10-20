/**
 * Envía los errores del navegador al registro de errores de la plataforma. Evita repetir el mismo
 * error y limita el envío a 10 por carga de página para no saturar la API.
 */
const enviados = new Set<string>();
let restantes = 10;

export function reportarError(error: unknown, extra: { componente?: string } = {}) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Error desconocido');
  const clave = `${e.message}|${e.stack?.split('\n')[1] ?? ''}`;
  if (enviados.has(clave) || restantes <= 0) return;
  enviados.add(clave);
  restantes--;
  const cuerpo = JSON.stringify({
    mensaje: (e.message || e.name).slice(0, 1000),
    pila: e.stack?.slice(0, 8000),
    url: window.location.href.split('?')[0],
    componente: extra.componente?.slice(0, 4000),
  });
  const base = import.meta.env.VITE_API_URL ?? '/api';
  try {
    // keepalive permite enviarlo aunque la persona cierre o recargue la página.
    void fetch(`${base}/errores/web`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: cuerpo, keepalive: true }).catch(() => undefined);
  } catch {
    // Si ni siquiera se puede enviar, no hay más que hacer.
  }
}

/** Escucha los errores que no capturó la aplicación (scripts y promesas). */
export function escucharErroresGlobales() {
  window.addEventListener('error', (ev) => {
    // Los errores de carga de recursos (imágenes) no traen ev.error; no son fallas del código.
    if (ev.error) reportarError(ev.error);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const motivo = ev.reason;
    // Los errores de la API ya se muestran en pantalla y la API registra los suyos.
    if (motivo && typeof motivo === 'object' && 'status' in motivo) return;
    reportarError(motivo);
  });
}
