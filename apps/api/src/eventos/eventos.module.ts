import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { tokenApiSchema, webhookSchema, type TokenApiInput, type WebhookInput } from '@pesv/shared';
import { desc, eq, isNull } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { encrypt, randomToken } from '../common/crypto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService } from '../db/database.service.js';
import { apiTokens, eventOutbox, webhookDeliveries, webhookEndpoints } from '../db/schema.js';
import { EventosService } from './eventos.service.js';

@Injectable()
export class IntegracionesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly eventos: EventosService,
  ) {}

  webhooks(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.organizationId, orgId)).orderBy(webhookEndpoints.createdAt)).map((w) => ({
        id: w.id,
        nombre: w.name,
        url: w.url,
        eventos: w.events,
        activo: w.active,
        creadoEn: w.createdAt,
      })),
    );
  }

  /** El secreto de firma se muestra solo al crearlo o regenerarlo. */
  async crearWebhook(orgId: string, input: WebhookInput, actorId: string) {
    const secreto = `whsec_${randomToken(24)}`;
    return this.database.withTenant(orgId, async (tx) => {
      const [w] = await tx
        .insert(webhookEndpoints)
        .values({ organizationId: orgId, name: input.nombre, url: input.url, events: input.eventos, active: input.activo, secretEncrypted: encrypt(secreto) })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'webhook.creado', entidad: 'webhook', entidadId: w!.id, datos: { url: input.url } });
      return { id: w!.id, secreto };
    });
  }

  async actualizarWebhook(orgId: string, id: string, input: WebhookInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [w] = await tx
        .update(webhookEndpoints)
        .set({ name: input.nombre, url: input.url, events: input.eventos, active: input.activo })
        .where(eq(webhookEndpoints.id, id))
        .returning();
      if (!w) throw new NotFoundException('Webhook no encontrado');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'webhook.actualizado', entidad: 'webhook', entidadId: id });
      return { id };
    });
  }

  async regenerarSecreto(orgId: string, id: string, actorId: string) {
    const secreto = `whsec_${randomToken(24)}`;
    return this.database.withTenant(orgId, async (tx) => {
      const [w] = await tx.update(webhookEndpoints).set({ secretEncrypted: encrypt(secreto) }).where(eq(webhookEndpoints.id, id)).returning();
      if (!w) throw new NotFoundException('Webhook no encontrado');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'webhook.secreto_regenerado', entidad: 'webhook', entidadId: id });
      return { id, secreto };
    });
  }

  async eliminarWebhook(orgId: string, id: string, actorId: string) {
    await this.database.withTenant(orgId, async (tx) => {
      await tx.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'webhook.eliminado', entidad: 'webhook', entidadId: id });
    });
  }

  async probar(orgId: string, usuario: UsuarioSesion) {
    const evento = await this.eventos.emitirAhora(orgId, 'prueba', { mensaje: 'Evento de prueba de PESV', enviadoPor: usuario.nombre });
    await this.eventos.despachar();
    return { eventoId: evento?.id };
  }

  entregas(orgId: string) {
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          id: webhookDeliveries.id,
          evento: eventOutbox.eventType,
          destino: webhookEndpoints.name,
          estado: webhookDeliveries.status,
          intentos: webhookDeliveries.attempts,
          codigo: webhookDeliveries.responseCode,
          respuesta: webhookDeliveries.responseBody,
          creadoEn: eventOutbox.createdAt,
          actualizadoEn: webhookDeliveries.updatedAt,
        })
        .from(webhookDeliveries)
        .innerJoin(eventOutbox, eq(eventOutbox.id, webhookDeliveries.eventId))
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .orderBy(desc(webhookDeliveries.id))
        .limit(100),
    );
  }

  tokens(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(apiTokens).where(isNull(apiTokens.revokedAt)).orderBy(desc(apiTokens.createdAt))).map((t) => ({
        id: t.id,
        nombre: t.name,
        prefijo: t.tokenPrefix,
        alcances: t.scopes,
        ultimoUso: t.lastUsedAt,
        creadoEn: t.createdAt,
      })),
    );
  }

  /** El token completo se muestra una sola vez; se guarda solo su hash. */
  async crearToken(orgId: string, input: TokenApiInput, actorId: string) {
    const token = `pesv_${randomToken(24)}`;
    return this.database.withTenant(orgId, async (tx) => {
      const [t] = await tx
        .insert(apiTokens)
        .values({
          organizationId: orgId,
          name: input.nombre,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          tokenPrefix: token.slice(0, 12),
          scopes: input.alcances,
          createdBy: actorId,
        })
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'token.creado', entidad: 'api_token', entidadId: t!.id, datos: { alcances: input.alcances } });
      return { id: t!.id, token };
    });
  }

  async revocarToken(orgId: string, id: string, actorId: string) {
    await this.database.withTenant(orgId, async (tx) => {
      await tx.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'token.revocado', entidad: 'api_token', entidadId: id });
    });
  }
}

@Controller('org/integraciones')
export class IntegracionesController {
  constructor(private readonly service: IntegracionesService) {}

  @Get('webhooks')
  @Permiso('configurar')
  webhooks(@OrgActual() org: OrgSesion) {
    return this.service.webhooks(org.id);
  }

  @Post('webhooks')
  @Permiso('configurar')
  crear(@Body(new ZodValidationPipe(webhookSchema)) body: WebhookInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crearWebhook(org.id, body, u.id);
  }

  @Patch('webhooks/:id')
  @Permiso('configurar')
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(webhookSchema)) body: WebhookInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.actualizarWebhook(org.id, id, body, u.id);
  }

  @Post('webhooks/:id/secreto')
  @Permiso('configurar')
  regenerar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.regenerarSecreto(org.id, id, u.id);
  }

  @Delete('webhooks/:id')
  @HttpCode(204)
  @Permiso('configurar')
  eliminar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.eliminarWebhook(org.id, id, u.id);
  }

  @Post('prueba')
  @Permiso('configurar')
  probar(@OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.probar(org.id, u);
  }

  @Get('entregas')
  @Permiso('configurar')
  entregas(@OrgActual() org: OrgSesion) {
    return this.service.entregas(org.id);
  }

  @Get('tokens')
  @Permiso('configurar')
  tokens(@OrgActual() org: OrgSesion) {
    return this.service.tokens(org.id);
  }

  @Post('tokens')
  @Permiso('configurar')
  crearToken(@Body(new ZodValidationPipe(tokenApiSchema)) body: TokenApiInput, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.crearToken(org.id, body, u.id);
  }

  @Delete('tokens/:id')
  @HttpCode(204)
  @Permiso('configurar')
  revocar(@Param('id', ParseUUIDPipe) id: string, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.revocarToken(org.id, id, u.id);
  }
}

@Global()
@Module({ controllers: [IntegracionesController], providers: [EventosService, IntegracionesService], exports: [EventosService] })
export class EventosModule {}
