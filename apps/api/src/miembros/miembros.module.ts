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
import { invitarMiembroSchema, type InvitarMiembroInput } from '@pesv/shared';
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
import { DatabaseService } from '../db/database.service.js';
import { memberships, users } from '../db/schema.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class MiembrosService {
  constructor(private readonly database: DatabaseService) {}

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

  /** Agrega a una persona con sus roles. Si no tiene cuenta, se crea con una contraseña temporal. */
  async invitar(orgId: string, input: InvitarMiembroInput, actorId: string) {
    const { rows } = await this.database.db.execute<{ id: string | null }>(
      sql`select auth_find_user_id(${input.email}) as id`,
    );
    let usuarioId = rows[0]?.id ?? null;
    const passwordHash = usuarioId || !input.passwordTemporal ? null : await hashPassword(input.passwordTemporal);
    if (!usuarioId && !passwordHash) {
      throw new BadRequestException('Esta persona aún no tiene cuenta: escribe una contraseña temporal para crearla');
    }
    return this.database.withTenant(orgId, async (tx) => {
      const creado = !usuarioId;
      if (!usuarioId) {
        usuarioId = randomUUID();
        await tx.insert(users).values({ id: usuarioId, email: input.email, fullName: input.nombre, passwordHash });
      }
      await tx
        .insert(memberships)
        .values(input.roles.map((role) => ({ organizationId: orgId, userId: usuarioId!, role })))
        .onConflictDoNothing();
      await auditar(tx, {
        organizacionId: orgId,
        actorId,
        accion: 'miembro.agregado',
        entidad: 'membership',
        entidadId: usuarioId,
        datos: { roles: input.roles, cuentaNueva: creado },
      });
      return { usuarioId, cuentaNueva: creado };
    });
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
    return this.service.invitar(org.id, body, usuario.id);
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
