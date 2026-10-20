import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { CorreoService } from '../correo/correo.module.js';
import { correoAlertaError } from '../correo/plantillas.js';
import { DatabaseService } from '../db/database.service.js';
import { errorEvents, errorGroups } from '../db/schema.js';

export type FuenteError = 'api' | 'web' | 'tarea';

export interface DatosError {
  fuente: FuenteError;
  mensaje: string;
  pila?: string | null;
  metodo?: string | null;
  ruta?: string | null;
  estado?: number | null;
  idSolicitud?: string | null;
  usuarioId?: string | null;
  organizacionId?: string | null;
  agenteUsuario?: string | null;
  contexto?: Record<string, unknown>;
}

/** Quita lo que cambia entre ocurrencias del mismo error (ids, números, fechas) para agruparlas. */
export function normalizarMensaje(mensaje: string) {
  return mensaje
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 300);
}

/** Huella: fuente + mensaje normalizado + primera línea de la pila que apunta al código propio. */
export function huellaError(fuente: FuenteError, mensaje: string, pila?: string | null) {
  const marco =
    pila
      ?.split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at ') && !l.includes('node_modules') && !l.includes('node:'))
      ?.replace(/:\d+:\d+\)?$/, '') ?? '';
  return createHash('sha1').update(`${fuente}|${normalizarMensaje(mensaje)}|${marco}`).digest('hex');
}

const UNA_HORA = 3_600_000;

/**
 * Registro de errores de la plataforma: agrupa las ocurrencias por huella y avisa por correo a
 * los administradores de la plataforma cuando aparece un error nuevo o vuelve uno resuelto
 * (máximo un aviso por hora por error). Nunca lanza: si falla, solo lo deja en el registro.
 */
@Injectable()
export class ErroresService {
  private readonly log = new Logger('Errores');

  constructor(
    private readonly database: DatabaseService,
    private readonly correo: CorreoService,
  ) {}

  async registrar(d: DatosError): Promise<void> {
    try {
      const huella = huellaError(d.fuente, d.mensaje, d.pila);
      const mensaje = d.mensaje.slice(0, 1000);
      const alerta = await this.database.db.transaction(async (tx) => {
        const [previo] = await tx.select().from(errorGroups).where(eq(errorGroups.fingerprint, huella)).for('update');
        const ahora = new Date();
        const reabierto = previo?.status === 'resuelto';
        if (!previo) {
          await tx.insert(errorGroups).values({ fingerprint: huella, source: d.fuente, message: mensaje, occurrences: 1 });
        } else {
          await tx
            .update(errorGroups)
            .set({ occurrences: previo.occurrences + 1, lastSeen: ahora, message: mensaje, ...(reabierto ? { status: 'abierto' } : {}) })
            .where(eq(errorGroups.fingerprint, huella));
        }
        await tx.insert(errorEvents).values({
          fingerprint: huella,
          source: d.fuente,
          message: mensaje,
          stack: d.pila?.slice(0, 8000) ?? null,
          method: d.metodo ?? null,
          path: d.ruta?.slice(0, 500) ?? null,
          status: d.estado ?? null,
          requestId: d.idSolicitud ?? null,
          userId: d.usuarioId ?? null,
          organizationId: d.organizacionId ?? null,
          userAgent: d.agenteUsuario?.slice(0, 300) ?? null,
          context: d.contexto ?? {},
        });
        const debeAvisar =
          (!previo || reabierto) && previo?.status !== 'ignorado' && (!previo?.lastAlertAt || ahora.getTime() - previo.lastAlertAt.getTime() > UNA_HORA);
        if (debeAvisar) await tx.update(errorGroups).set({ lastAlertAt: ahora }).where(eq(errorGroups.fingerprint, huella));
        return debeAvisar ? { ocurrencias: (previo?.occurrences ?? 0) + 1 } : null;
      });
      if (alerta) void this.avisar(d, mensaje, alerta.ocurrencias, huella);
    } catch (err) {
      this.log.error(`No se pudo registrar el error: ${(err as Error).message}`);
    }
  }

  private async avisar(d: DatosError, mensaje: string, ocurrencias: number, huella: string) {
    const { rows } = await this.database.db.execute<{ email: string }>(sql`select email from admin_platform_admins()`);
    const m = correoAlertaError({
      fuente: { api: 'API', web: 'aplicación web', tarea: 'tareas programadas' }[d.fuente],
      mensaje,
      ruta: d.ruta ? `${d.metodo ?? ''} ${d.ruta}`.trim() : null,
      ocurrencias,
      enlace: `${config.webUrl}/plataforma?errores=${huella}`,
    });
    for (const r of rows) await this.correo.enviarSinFallar(r.email, m);
  }

  grupos(estado?: string) {
    const filtro = estado && ['abierto', 'resuelto', 'ignorado'].includes(estado) ? eq(errorGroups.status, estado) : undefined;
    return this.database.db
      .select({
        huella: errorGroups.fingerprint,
        fuente: errorGroups.source,
        mensaje: errorGroups.message,
        estado: errorGroups.status,
        ocurrencias: errorGroups.occurrences,
        primeraVez: errorGroups.firstSeen,
        ultimaVez: errorGroups.lastSeen,
        // Columna externa escrita con su tabla: Drizzle la dejaría sin calificar y se compararía consigo misma.
        ultimas24h: sql<number>`(select count(*)::int from error_events e where e.fingerprint = error_groups.fingerprint and e.created_at > now() - interval '24 hours')`,
      })
      .from(errorGroups)
      .where(filtro)
      .orderBy(desc(errorGroups.lastSeen))
      .limit(200);
  }

  async ocurrencias(huella: string) {
    const filas = await this.database.db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.fingerprint, huella))
      .orderBy(desc(errorEvents.createdAt))
      .limit(20);
    return filas.map((e) => ({
      id: e.id,
      fuente: e.source,
      mensaje: e.message,
      pila: e.stack,
      metodo: e.method,
      ruta: e.path,
      estado: e.status,
      idSolicitud: e.requestId,
      usuarioId: e.userId,
      organizacionId: e.organizationId,
      agenteUsuario: e.userAgent,
      contexto: e.context,
      fecha: e.createdAt,
    }));
  }

  async cambiarEstado(huella: string, estado: 'abierto' | 'resuelto' | 'ignorado') {
    const [g] = await this.database.db.update(errorGroups).set({ status: estado }).where(eq(errorGroups.fingerprint, huella)).returning();
    return { huella, estado: g?.status ?? estado };
  }

  /** Conserva 30 días de ocurrencias; los grupos se mantienen para el historial. */
  async depurar(dias = 30) {
    const limite = new Date(Date.now() - dias * 86_400_000);
    await this.database.db.delete(errorEvents).where(and(lt(errorEvents.createdAt, limite)));
  }
}
