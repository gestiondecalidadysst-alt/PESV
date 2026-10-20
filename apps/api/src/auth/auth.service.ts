import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { VIGENCIA_ENLACE_MINUTOS, type CambiarClaveInput, type IngresoInput, type RegistroInput } from '@pesv/shared';
import { sql } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../common/crypto.js';
import { config } from '../config.js';
import { CorreoService } from '../correo/correo.module.js';
import { correoContrasenaCambiada, correoRecuperacion } from '../correo/plantillas.js';
import { DatabaseService } from '../db/database.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import type { UsuarioSesion } from './decorators.js';
import { crearEnlace, hashEnlace } from './enlaces.js';
import { firmarSesion } from './session.js';

interface FilaUsuario extends Record<string, unknown> {
  id: string;
  email: string;
  full_name: string;
  is_platform_admin: boolean;
  password_hash?: string | null;
  sessions_valid_from?: string | Date | null;
}

const aSesion = (u: FilaUsuario): UsuarioSesion => ({
  id: u.id,
  email: u.email,
  nombre: u.full_name,
  esAdminPlataforma: u.is_platform_admin,
});

/** Hash ficticio para comparar siempre, aunque la cuenta no exista o no tenga contraseña. */
const HASH_FICTICIO = 'scrypt$AAAA$AAAA';

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizaciones: OrganizationsService,
    private readonly correo: CorreoService,
  ) {}

  /**
   * Usuario de una sesión. Devuelve null si la sesión se firmó antes de un cambio de contraseña
   * o de «cerrar sesión en todos los dispositivos».
   */
  async usuarioDeSesion(id: string, emitidaMs: number): Promise<UsuarioSesion | null> {
    const { rows } = await this.database.db.execute<FilaUsuario>(sql`select * from auth_user_by_id(${id})`);
    const u = rows[0];
    if (!u) return null;
    if (u.sessions_valid_from && emitidaMs < new Date(u.sessions_valid_from).getTime()) return null;
    return aSesion(u);
  }

  async idPorEmail(email: string): Promise<string | null> {
    const { rows } = await this.database.db.execute<{ id: string | null }>(sql`select auth_find_user_id(${email}) as id`);
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

  private async buscarPorEmail(email: string) {
    const { rows } = await this.database.db.execute<FilaUsuario>(sql`select * from auth_lookup_user(${email})`);
    return rows[0] ?? null;
  }

  async ingresar(input: IngresoInput) {
    const fila = await this.buscarPorEmail(input.email);
    // Se verifica siempre para no revelar por tiempo de respuesta si el correo existe.
    const valida = await verifyPassword(input.password, fila?.password_hash ?? HASH_FICTICIO);
    if (!fila || !fila.password_hash || !valida) throw new UnauthorizedException('Correo o contraseña incorrectos');
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

  // Contraseñas -----------------------------------------------------------------

  /**
   * Envía el enlace de recuperación si el correo existe. La respuesta es la misma exista o no la
   * cuenta, y el correo sale en segundo plano para no revelarlo por el tiempo de respuesta.
   */
  async recuperar(email: string) {
    const enlace = await crearEnlace(this.database.db, email, 'recuperacion');
    if (enlace) void this.correo.enviarSinFallar(enlace.email, correoRecuperacion(enlace.nombre, enlace.url, VIGENCIA_ENLACE_MINUTOS.recuperacion));
  }

  /** Datos para mostrar el formulario de un enlace vigente (sin consumirlo). */
  async verificarEnlace(token: string) {
    const { rows } = await this.database.db.execute<{ email: string; full_name: string; purpose: 'recuperacion' | 'invitacion' }>(
      sql`select * from auth_check_password_token(${hashEnlace(token)})`,
    );
    const r = rows[0];
    if (!r) throw new NotFoundException('El enlace venció o ya se usó. Pide uno nuevo.');
    return { email: r.email, nombre: r.full_name, proposito: r.purpose };
  }

  /** Cambia la contraseña con un enlace, cierra las demás sesiones e inicia una nueva. */
  async restablecer(token: string, password: string) {
    const passwordHash = await hashPassword(password);
    const { rows } = await this.database.db.execute<{ user_id: string; email: string; full_name: string; purpose: string }>(
      sql`select * from auth_consume_password_token(${hashEnlace(token)}, ${passwordHash})`,
    );
    const r = rows[0];
    if (!r) throw new BadRequestException('El enlace venció o ya se usó. Pide uno nuevo.');
    if (r.purpose === 'recuperacion') {
      void this.correo.enviarSinFallar(r.email, correoContrasenaCambiada(r.full_name, `${config.webUrl}/recuperar`));
    }
    await this.database.db.execute(sql`select auth_touch_login(${r.user_id})`);
    return this.nuevaSesion(r.user_id);
  }

  async cambiarClave(usuario: UsuarioSesion, input: CambiarClaveInput) {
    const fila = await this.buscarPorEmail(usuario.email);
    const valida = await verifyPassword(input.actual, fila?.password_hash ?? HASH_FICTICIO);
    if (!fila?.password_hash || !valida) throw new BadRequestException('La contraseña actual no es correcta');
    await this.database.db.execute(sql`select auth_set_password(${usuario.id}, ${await hashPassword(input.password)})`);
    void this.correo.enviarSinFallar(usuario.email, correoContrasenaCambiada(usuario.nombre, `${config.webUrl}/recuperar`));
    return this.nuevaSesion(usuario.id);
  }

  /** Cierra la sesión en todos los dispositivos y deja abierta solo la actual. */
  async cerrarSesiones(usuario: UsuarioSesion) {
    await this.database.db.execute(sql`select auth_revoke_sessions(${usuario.id})`);
    return this.nuevaSesion(usuario.id);
  }

  /** Sesión nueva para el dispositivo actual; las anteriores ya quedaron invalidadas. */
  private async nuevaSesion(usuarioId: string) {
    const usuario = await this.usuarioDeSesion(usuarioId, Date.now());
    if (!usuario) throw new UnauthorizedException('No se pudo iniciar la sesión');
    return { token: await firmarSesion(usuarioId), usuario };
  }
}
