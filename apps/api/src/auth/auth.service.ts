import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IngresoInput, RegistroInput } from '@pesv/shared';
import { sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../common/crypto.js';
import { DatabaseService } from '../db/database.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import type { UsuarioSesion } from './decorators.js';
import { firmarSesion } from './session.js';

interface FilaUsuario extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string;
  is_platform_admin: boolean;
  password_hash?: string | null;
}

const aSesion = (u: FilaUsuario): UsuarioSesion => ({
  id: u.id,
  email: u.email,
  nombre: u.full_name,
  esAdminPlataforma: u.is_platform_admin,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizaciones: OrganizationsService,
  ) {}

  async usuarioPorId(id: string): Promise<UsuarioSesion | null> {
    const { rows } = await this.database.db.execute<FilaUsuario>(sql`select * from auth_user_by_id(${id})`);
    return rows[0] ? aSesion(rows[0]) : null;
  }

  async idPorEmail(email: string): Promise<string | null> {
    const { rows } = await this.database.db.execute<{ id: string | null }>(
      sql`select auth_find_user_id(${email}) as id`,
    );
    return rows[0]?.id ?? null;
  }

  /** Crea la cuenta, la organización y deja al usuario como administrador y líder PESV. */
  async registrar(input: RegistroInput) {
    if (await this.idPorEmail(input.email)) {
      throw new ConflictException('Ya existe una cuenta con ese correo. Ingresa con tu contraseña.');
    }
    const passwordHash = await hashPassword(input.password);
    const creado = await this.organizaciones.crear(input.organizacion, {
      nuevo: { email: input.email, nombre: input.nombre, passwordHash },
    });
    const token = await firmarSesion(creado.usuarioId);
    return { token, organizacionId: creado.organizacion.id, resultado: creado.resultado };
  }

  async ingresar(input: IngresoInput) {
    const { rows } = await this.database.db.execute<FilaUsuario>(
      sql`select * from auth_lookup_user(${input.email})`,
    );
    const fila = rows[0];
    // Se verifica siempre para no revelar por tiempo de respuesta si el correo existe.
    const valida = await verifyPassword(input.password, fila?.password_hash ?? 'scrypt$AAAA$AAAA');
    if (!fila || !valida) throw new UnauthorizedException('Correo o contraseña incorrectos');
    await this.database.db.execute(sql`select auth_touch_login(${fila.id})`);
    return { token: await firmarSesion(fila.id), usuario: aSesion(fila) };
  }

  async membresias(usuarioId: string) {
    const { rows } = await this.database.db.execute<{
      organization_id: string;
      organization_name: string;
      nit: string;
      roles: string[];
    }>(sql`select * from auth_user_memberships(${usuarioId})`);
    return rows.map((r) => ({ id: r.organization_id, nombre: r.organization_name, nit: r.nit, roles: r.roles }));
  }
}
