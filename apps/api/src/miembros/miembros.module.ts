import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { invitarMiembroSchema, VIGENCIA_ENLACE_MINUTOS, type InvitarMiembroInput } from '@pesv/shared';
import { and, eq, sql } from 'drizzle-orm';
import {
  OrgActual,
  Permiso,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { hashPassword } from '../common/crypto.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { verificarLimite } from '../suscripciones/reglas.js';
import { DatabaseService } from '../db/database.service.js';
import { memberships, organizations, users } from '../db/schema.js';
import { crearEnlace } from '../auth/enlaces.js';
import { config } from '../config.js';
import { CorreoService } from '../correo/correo.module.js';
import { correoAgregado, correoInvitacion } from '../correo/plantillas.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class MiembrosService {
  constructor(
    private readonly database: DatabaseService,
    private readonly correo: CorreoService,
  ) {}

  async listar(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const filas = await tx
        .select({ id: users.id, email: users.email, nombre: users.fullName, rol: memberships.role, ultimoIngreso: users.lastLoginAt })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, orgId))
        .orderBy(users.fullName);
      const porUsuario = new Map<string, { id: string; email: string; nombre: string; roles: string[]; ultimoIngreso: Date | null }>();
      for (const f of filas) {
        const u = porUsuario.get(f.id) ?? { id: f.id, email: f.email, nombre: f.nombre, roles: [], ultimoIngreso: f.ultimoIngreso };
        u.roles.push(f.rol);
        porUsuario.set(f.id, u);
      }
      return [...porUsuario.values()];
    });
  }

  /**
   * Agrega a una persona con sus roles. Si no tiene cuenta se crea y recibe por correo un enlace
   * para crear su contraseña (o se usa la contraseña temporal, si el administrador la escribe).
   * Si ya tiene cuenta, recibe un aviso de que tiene acceso a la organización.
   */
  async invitar(orgId: string, input: InvitarMiembroInput, actor: UsuarioSesion) {
    const { rows } = await this.database.db.execute<{ id: string | null }>(sql`select auth_find_user_id(${input.email}) as id`);
    let usuarioId = rows[0]?.id ?? null;
    const passwordHash = usuarioId || !input.passwordTemporal ? null : await hashPassword(input.passwordTemporal);
    const r = await this.database.withTenant(orgId, async (tx) => {
      const creado = !usuarioId;
      const yaEsMiembro =
        !creado &&
        (await tx.select({ id: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, usuarioId!)))).length > 0;
      if (!yaEsMiembro) await verificarLimite(tx, orgId, 'usuarios');
      if (!usuarioId) {
        usuarioId = randomUUID();
        await tx.insert(users).values({ id: usuarioId, email: input.email, fullName: input.nombre, passwordHash });
      }
      await tx
        .insert(memberships)
        .values(input.roles.map((role) => ({ organizationId: orgId, userId: usuarioId!, role })))
        .onConflictDoNothing();
      // El enlace se crea en la misma transacción para que la función vea la cuenta recién creada.
      const enlace = creado && !passwordHash ? await crearEnlace(tx, input.email, 'invitacion') : null;
      const [org] = await tx.select({ nombre: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
      await auditar(tx, {
        organizacionId: orgId,
        actorId: actor.id,
        accion: 'miembro.agregado',
        entidad: 'membership',
        entidadId: usuarioId,
        datos: { roles: input.roles, cuentaNueva: creado, invitacionPorCorreo: !!enlace },
      });
      return { usuarioId: usuarioId!, creado, enlace, yaEsMiembro, organizacion: org?.nombre ?? 'la organización' };
    });

    let correoEnviado = false;
    if (r.enlace) {
      correoEnviado = await this.correo.enviarSinFallar(
        input.email,
        correoInvitacion(input.nombre, r.organizacion, actor.nombre, r.enlace.url, VIGENCIA_ENLACE_MINUTOS.invitacion / 1440),
      );
    } else if (!r.creado && !r.yaEsMiembro) {
      correoEnviado = await this.correo.enviarSinFallar(input.email, correoAgregado(input.nombre, r.organizacion, actor.nombre, `${config.webUrl}/ingresar`));
    }
    return {
      usuarioId: r.usuarioId,
      cuentaNueva: r.creado,
      correoEnviado: correoEnviado && this.correo.configurado,
      // Sin servidor de correo, el administrador puede compartir el enlace por otro medio.
      enlaceInvitacion: r.enlace && !this.correo.configurado ? r.enlace.url : undefined,
    };
  }

  async quitar(orgId: string, usuarioId: string, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const admins = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.organizationId, orgId), eq(memberships.role, 'admin')));
      if (admins.length === 1 && admins[0]!.userId === usuarioId) {
        throw new BadRequestException('No puedes quitar al único administrador de la organización');
      }
      await tx
        .delete(memberships)
        .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, usuarioId)));
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'miembro.retirado', entidad: 'membership', entidadId: usuarioId });
    });
  }
}

@Controller('org/miembros')
export class MiembrosController {
  constructor(private readonly service: MiembrosService) {}

  @Get()
  @Permiso('ver')
  listar(@OrgActual() org: OrgSesion) {
    return this.service.listar(org.id);
  }

  @Post()
  @Permiso('gestionar_miembros')
  invitar(
    @Body(new ZodValidationPipe(invitarMiembroSchema)) body: InvitarMiembroInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.service.invitar(org.id, body, usuario);
  }

  @Delete(':usuarioId')
  @HttpCode(204)
  @Permiso('gestionar_miembros')
  quitar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() usuario: UsuarioSesion,
  ) {
    return this.service.quitar(org.id, usuarioId, usuario.id);
  }
}

@Module({ controllers: [MiembrosController], providers: [MiembrosService] })
export class MiembrosModule {}
