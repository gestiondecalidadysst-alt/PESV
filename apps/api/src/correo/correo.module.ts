import {
  Body,
  Controller,
  Get,
  Global,
  Injectable,
  Logger,
  Module,
  Post,
  Put,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { EVENTOS, reglaCorreoSchema, type ReglaCorreoInput } from '@pesv/shared';
import { and, desc, eq, sql } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { config } from '../config.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { emailOutbox, emailRules, organizations } from '../db/schema.js';
import { correoPrueba, type Mensaje } from './plantillas.js';

const MAX_INTENTOS = 5;

export interface CorreoRegistrado {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

/**
 * Envío de correo por SMTP. Sin SMTP_HOST los correos no salen: se escriben en el registro de la
 * API y, fuera de producción, quedan en memoria para las pruebas.
 */
@Injectable()
export class CorreoService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Correo');
  private readonly transporte: Transporter | null = config.correo.host
    ? nodemailer.createTransport({
        host: config.correo.host,
        port: config.correo.port,
        secure: config.correo.secure,
        auth: config.correo.user ? { user: config.correo.user, pass: config.correo.pass } : undefined,
      })
    : null;
  private readonly registrados: CorreoRegistrado[] = [];
  private temporizador?: NodeJS.Timeout;
  private despachando = false;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit() {
    if (!this.transporte) this.log.warn('SMTP_HOST no está configurado: los correos se escriben en el registro y no se envían.');
    if (process.env.DISABLE_WORKERS === 'true') return;
    this.temporizador = setInterval(() => void this.despachar().catch((e) => this.log.error(e)), 15_000);
  }

  onModuleDestroy() {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  get configurado() {
    return this.transporte !== null;
  }

  /** Últimos correos que no salieron por falta de SMTP (solo fuera de producción; para pruebas). */
  ultimosRegistrados(): readonly CorreoRegistrado[] {
    return this.registrados;
  }

  /** Envía ya. Lanza un error si el servidor SMTP lo rechaza. */
  async enviar(para: string, m: Mensaje): Promise<void> {
    if (!this.transporte) {
      this.log.log(`(sin SMTP) Para ${para}: ${m.asunto}`);
      if (!config.produccion) {
        this.registrados.push({ para, asunto: m.asunto, texto: m.texto, html: m.html });
        if (this.registrados.length > 100) this.registrados.shift();
      }
      return;
    }
    await this.transporte.sendMail({ from: config.correo.from, to: para, subject: m.asunto, html: m.html, text: m.texto });
  }

  /** Para cuentas y contraseñas: si el envío falla se registra el error pero la petición sigue. */
  async enviarSinFallar(para: string, m: Mensaje): Promise<boolean> {
    try {
      await this.enviar(para, m);
      return true;
    } catch (err) {
      this.log.error(`No se pudo enviar «${m.asunto}» a ${para}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Encola un correo dentro de una transacción de la organización; el despachador lo envía con reintentos. */
  async encolar(tx: TenantTx, orgId: string, para: string[], m: Mensaje) {
    if (!para.length) return;
    await tx.insert(emailOutbox).values(para.map((p) => ({ organizationId: orgId, recipient: p, subject: m.asunto, html: m.html, bodyText: m.texto })));
  }

  /** Envía los correos pendientes de todas las organizaciones, con espera creciente entre intentos. */
  async despachar(limite = 20): Promise<number> {
    if (this.despachando) return 0;
    this.despachando = true;
    try {
      const { rows } = await this.database.db.execute<{ email_id: string; organization_id: string }>(sql`select * from email_claim_due(${limite})`);
      for (const r of rows) await this.entregar(r.organization_id, Number(r.email_id));
      return rows.length;
    } finally {
      this.despachando = false;
    }
  }

  private async entregar(orgId: string, id: number) {
    const [c] = await this.database.withTenant(orgId, (tx) => tx.select().from(emailOutbox).where(eq(emailOutbox.id, id)));
    if (!c || c.status === 'enviado' || c.status === 'fallido') return;
    let error: string | null = null;
    try {
      await this.enviar(c.recipient, { asunto: c.subject, html: c.html, texto: c.bodyText });
    } catch (err) {
      error = (err as Error).message.slice(0, 500);
    }
    const intentos = c.attempts + 1;
    await this.database.withTenant(orgId, (tx) =>
      tx
        .update(emailOutbox)
        .set(
          error === null
            ? { status: 'enviado', attempts: intentos, sentAt: new Date(), lastError: null }
            : intentos >= MAX_INTENTOS
              ? { status: 'fallido', attempts: intentos, lastError: error }
              : { status: 'reintentando', attempts: intentos, lastError: error, nextAttemptAt: new Date(Date.now() + 2 ** intentos * 60_000) },
        )
        .where(eq(emailOutbox.id, id)),
    );
    if (error) this.log.warn(`Correo ${id} a ${c.recipient}: intento ${intentos} falló (${error})`);
  }

  // Configuración de la organización -------------------------------------------

  estado() {
    return { configurado: this.configurado, remitente: config.correo.from };
  }

  async reglas(orgId: string) {
    const filas = await this.database.withTenant(orgId, (tx) => tx.select().from(emailRules).where(eq(emailRules.organizationId, orgId)));
    return EVENTOS.filter((e) => e.id !== 'prueba').map((e) => {
      const r = filas.find((f) => f.eventType === e.id);
      return { evento: e.id, nombre: e.nombre, descripcion: e.descripcion, roles: r?.roles ?? [], correos: r?.extraEmails ?? [], activa: r?.active ?? false };
    });
  }

  guardarRegla(orgId: string, input: ReglaCorreoInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = { roles: input.roles, extraEmails: [...new Set(input.correos)], active: input.activa, updatedAt: new Date() };
      await tx
        .insert(emailRules)
        .values({ organizationId: orgId, eventType: input.evento, ...valores })
        .onConflictDoUpdate({ target: [emailRules.organizationId, emailRules.eventType], set: valores });
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'notificaciones.regla', entidad: 'email_rule', entidadId: null, datos: { evento: input.evento, activa: input.activa } });
      return input;
    });
  }

  historial(orgId: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          id: emailOutbox.id,
          para: emailOutbox.recipient,
          asunto: emailOutbox.subject,
          estado: emailOutbox.status,
          intentos: emailOutbox.attempts,
          error: emailOutbox.lastError,
          enviadoEn: emailOutbox.sentAt,
          creadoEn: emailOutbox.createdAt,
        })
        .from(emailOutbox)
        .where(eq(emailOutbox.organizationId, orgId))
        .orderBy(desc(emailOutbox.createdAt))
        .limit(50),
    );
  }

  /** Correo de prueba al usuario que lo pide; se envía de inmediato para mostrar el error si lo hay. */
  async probar(orgId: string, usuario: UsuarioSesion) {
    const [org] = await this.database.withTenant(orgId, (tx) => tx.select({ nombre: organizations.name }).from(organizations).where(and(eq(organizations.id, orgId))));
    try {
      await this.enviar(usuario.email, correoPrueba(org?.nombre ?? 'tu organización'));
      return { enviado: this.configurado, para: usuario.email, configurado: this.configurado };
    } catch (err) {
      return { enviado: false, para: usuario.email, configurado: true, error: (err as Error).message };
    }
  }
}

@Controller('org/notificaciones')
export class NotificacionesController {
  constructor(private readonly correo: CorreoService) {}

  @Get()
  @Permiso('configurar')
  async listar(@OrgActual() org: OrgSesion) {
    return { ...this.correo.estado(), reglas: await this.correo.reglas(org.id) };
  }

  @Put()
  @Permiso('configurar')
  guardar(@Body(new ZodValidationPipe(reglaCorreoSchema)) body: ReglaCorreoInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.correo.guardarRegla(org.id, body, u.id);
  }

  @Get('historial')
  @Permiso('configurar')
  historial(@OrgActual() org: OrgSesion) {
    return this.correo.historial(org.id);
  }

  @Post('prueba')
  @Permiso('configurar')
  probar(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.correo.probar(org.id, u);
  }
}

@Global()
@Module({ controllers: [NotificacionesController], providers: [CorreoService], exports: [CorreoService] })
export class CorreoModule {}
