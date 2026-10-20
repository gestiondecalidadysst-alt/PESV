import { Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { FUNCIONES_PLAN, planSchema, suscripcionSchema, type PlanInput, type SuscripcionInput } from '@pesv/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AdminPlataforma, Miembro, OrgActual, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar, esViolacionUnica } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService } from '../db/database.service.js';
import { plans, subscriptions } from '../db/schema.js';
import { esSoloLectura, suscripcionDe } from './reglas.js';

type FilaPlan = typeof plans.$inferSelect;

const aPlan = (p: FilaPlan) => ({
  id: p.id,
  codigo: p.code,
  nombre: p.name,
  descripcion: p.description,
  niveles: p.levels,
  maxVehiculos: p.maxVehicles,
  maxConductores: p.maxDrivers,
  maxUsuarios: p.maxUsers,
  funciones: p.features,
  precioMensual: p.monthlyPrice,
  moneda: p.currency,
  diasPrueba: p.trialDays,
  activo: p.active,
  porDefecto: p.isDefault,
});

const valoresPlan = (i: PlanInput) => ({
  code: i.codigo,
  name: i.nombre,
  description: i.descripcion ?? null,
  levels: i.niveles,
  maxVehicles: i.maxVehiculos ?? null,
  maxDrivers: i.maxConductores ?? null,
  maxUsers: i.maxUsuarios ?? null,
  features: i.funciones,
  monthlyPrice: i.precioMensual ?? null,
  currency: i.moneda,
  trialDays: i.diasPrueba,
  active: i.activo,
  isDefault: i.porDefecto,
  updatedAt: new Date(),
});

/**
 * Planes y suscripciones (RN-26 y RN-27). Los precios, límites y funciones de cada plan se
 * definen en el panel de la plataforma; nada de esto está fijo en el código.
 */
@Injectable()
export class SuscripcionesService {
  constructor(private readonly database: DatabaseService) {}

  /** Lo que ve la organización: su plan, límites, uso y si está en solo lectura. */
  async estado(orgId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const { estado, suscripcion, plan } = await suscripcionDe(tx, orgId);
      const { rows } = await tx.execute<{ vehiculos: number; conductores: number; usuarios: number }>(sql`
        select
          (select count(*)::int from vehicles where organization_id = ${orgId} and status <> 'inactivo') as vehiculos,
          (select count(*)::int from drivers where organization_id = ${orgId} and active) as conductores,
          (select count(distinct user_id)::int from memberships where organization_id = ${orgId}) as usuarios`);
      return {
        estado,
        soloLectura: esSoloLectura(estado),
        finPrueba: suscripcion?.trialEndsOn ?? null,
        vencePeriodoEl: suscripcion?.periodEndsOn ?? null,
        plan: plan ? aPlan(plan) : null,
        /** Sin plan asignado todas las funciones están disponibles. */
        funciones: plan ? plan.features : FUNCIONES_PLAN.map((f) => f.id),
        uso: rows[0] ?? { vehiculos: 0, conductores: 0, usuarios: 0 },
      };
    });
  }

  // Panel de la plataforma -----------------------------------------------------

  async planes() {
    return (await this.database.db.select().from(plans).orderBy(asc(plans.name))).map(aPlan);
  }

  async guardarPlan(input: PlanInput, id?: string) {
    try {
      return await this.database.db.transaction(async (tx) => {
        if (input.porDefecto) await tx.update(plans).set({ isDefault: false }).where(eq(plans.isDefault, true));
        const [p] = id
          ? await tx.update(plans).set(valoresPlan(input)).where(eq(plans.id, id)).returning()
          : await tx.insert(plans).values(valoresPlan(input)).returning();
        if (!p) throw new NotFoundException('Plan no encontrado');
        return aPlan(p);
      });
    } catch (err) {
      if (esViolacionUnica(err)) throw new ConflictException('Ya existe un plan con ese código');
      throw err;
    }
  }

  async organizaciones() {
    const { rows } = await this.database.db.execute<{
      id: string;
      name: string;
      nit: string;
      created_at: string;
      level: string | null;
      voluntary: boolean;
      plan_id: string | null;
      plan_name: string | null;
      status: string;
      period_ends_on: string | null;
      trial_ends_on: string | null;
      vehicles: string;
      drivers: string;
      users: string;
    }>(sql`select * from admin_organizations_overview()`);
    return rows.map((r) => ({
      id: r.id,
      nombre: r.name,
      nit: r.nit,
      creadaEn: r.created_at,
      nivel: r.level,
      voluntaria: r.voluntary,
      planId: r.plan_id,
      plan: r.plan_name,
      estado: r.status,
      vencePeriodoEl: r.period_ends_on,
      finPrueba: r.trial_ends_on,
      vehiculos: Number(r.vehicles),
      conductores: Number(r.drivers),
      usuarios: Number(r.users),
    }));
  }

  /** Cambia plan o estado de una organización; queda en la auditoría de esa organización. */
  async actualizarSuscripcion(orgId: string, input: SuscripcionInput, actor: UsuarioSesion) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        planId: input.planId,
        status: input.estado,
        periodEndsOn: input.vencePeriodoEl ?? null,
        notes: input.notas ?? null,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      const [s] = await tx
        .insert(subscriptions)
        .values({ organizationId: orgId, ...valores })
        .onConflictDoUpdate({ target: subscriptions.organizationId, set: valores })
        .returning();
      await auditar(tx, {
        organizacionId: orgId,
        actorId: actor.id,
        accion: 'suscripcion.actualizada',
        entidad: 'subscription',
        entidadId: orgId,
        datos: { planId: input.planId, estado: input.estado },
      });
      return s!;
    });
  }

  async administradores() {
    const { rows } = await this.database.db.execute<{ id: string; email: string; full_name: string }>(sql`select * from admin_platform_admins()`);
    return rows.map((r) => ({ id: r.id, email: r.email, nombre: r.full_name }));
  }

  async cambiarAdministrador(email: string, activo: boolean, actor: UsuarioSesion) {
    if (!activo && email.toLowerCase() === actor.email.toLowerCase()) {
      throw new ConflictException('No puedes quitarte a ti mismo el acceso de administrador');
    }
    const { rows } = await this.database.db.execute<{ id: string | null }>(sql`select admin_set_platform_admin(${email}, ${activo}) as id`);
    if (!rows[0]?.id) throw new NotFoundException('No hay una cuenta con ese correo');
    return { email, activo };
  }
}

@Controller('org/suscripcion')
export class SuscripcionController {
  constructor(private readonly service: SuscripcionesService) {}

  @Get()
  @Miembro()
  estado(@OrgActual() org: OrgSesion) {
    return this.service.estado(org.id);
  }
}

@Controller('plataforma')
@AdminPlataforma()
export class PlataformaController {
  constructor(private readonly service: SuscripcionesService) {}

  @Get('planes')
  planes() {
    return this.service.planes();
  }

  @Post('planes')
  crearPlan(@Body(new ZodValidationPipe(planSchema)) body: PlanInput) {
    return this.service.guardarPlan(body);
  }

  @Patch('planes/:id')
  editarPlan(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(planSchema)) body: PlanInput) {
    return this.service.guardarPlan(body, id);
  }

  @Get('organizaciones')
  organizaciones() {
    return this.service.organizaciones();
  }

  @Put('organizaciones/:id/suscripcion')
  suscripcion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(suscripcionSchema)) body: SuscripcionInput, @UsuarioActual() u: UsuarioSesion) {
    return this.service.actualizarSuscripcion(id, body, u);
  }

  @Get('administradores')
  administradores() {
    return this.service.administradores();
  }

  @Post('administradores')
  cambiarAdministrador(
    @Body(new ZodValidationPipe(z.object({ email: z.string().trim().toLowerCase().email('Escribe un correo válido'), activo: z.boolean() }))) body: { email: string; activo: boolean },
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.cambiarAdministrador(body.email, body.activo, u);
  }
}

@Module({ controllers: [SuscripcionController, PlataformaController], providers: [SuscripcionesService], exports: [SuscripcionesService] })
export class SuscripcionesModule {}
