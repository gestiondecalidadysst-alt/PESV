import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { estadoVencimiento, rutaSchema, viajeSchema, type RutaInput, type ViajeInput } from '@pesv/shared';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import { OrgActual, Permiso, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService, type TenantTx } from '../db/database.service.js';
import { drivers, routes, trips, vehicles } from '../db/schema.js';

/**
 * Impedimentos para asignar un desplazamiento (RN-15): conductor inactivo o con licencia
 * vencida; vehículo no apto, inactivo, o con SOAT o revisión técnico-mecánica vencidos.
 */
export async function impedimentosDeViaje(tx: TenantTx, vehiculoId: string, conductorId: string): Promise<string[]> {
  const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehiculoId));
  const [c] = await tx.select().from(drivers).where(eq(drivers.id, conductorId));
  if (!v) throw new NotFoundException('Vehículo no encontrado');
  if (!c) throw new NotFoundException('Conductor no encontrado');
  const problemas: string[] = [];
  if (!c.active) problemas.push(`${c.fullName} está inactivo`);
  if (estadoVencimiento(c.licenseExpiresOn) === 'vencido') problemas.push(`La licencia de ${c.fullName} está vencida`);
  if (v.status === 'no_apto') problemas.push(`El vehículo ${v.plate} está no apto por una falla crítica sin cerrar`);
  if (v.status === 'inactivo') problemas.push(`El vehículo ${v.plate} está inactivo`);
  if (v.motorized && estadoVencimiento(v.soatExpiresOn) === 'vencido') problemas.push(`El SOAT de ${v.plate} está vencido`);
  if (v.motorized && estadoVencimiento(v.rtmExpiresOn) === 'vencido') problemas.push(`La revisión técnico-mecánica de ${v.plate} está vencida`);
  return problemas;
}

@Injectable()
export class DesplazamientosService {
  constructor(private readonly database: DatabaseService) {}

  rutas(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(routes).orderBy(desc(routes.active), asc(routes.name))).map((r) => ({
        id: r.id,
        nombre: r.name,
        origen: r.origin,
        destino: r.destination,
        distanciaKm: r.distanceKm,
        viajesPorMes: r.tripsPerMonth,
        limiteVelocidad: r.speedLimitKmh,
        notasRiesgo: r.riskNotes,
        activa: r.active,
      })),
    );
  }

  guardarRuta(orgId: string, input: RutaInput, actorId: string, id?: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const valores = {
        name: input.nombre,
        origin: input.origen,
        destination: input.destino,
        distanceKm: input.distanciaKm,
        tripsPerMonth: input.viajesPorMes,
        speedLimitKmh: input.limiteVelocidad ?? null,
        riskNotes: input.notasRiesgo ?? null,
        active: input.activa,
      };
      const [r] = id
        ? await tx.update(routes).set(valores).where(eq(routes.id, id)).returning()
        : await tx.insert(routes).values({ organizationId: orgId, ...valores }).returning();
      if (!r) throw new NotFoundException('Ruta no encontrada');
      await auditar(tx, { organizacionId: orgId, actorId, accion: id ? 'ruta.actualizada' : 'ruta.creada', entidad: 'route', entidadId: r.id });
      return r;
    });
  }

  viajes(orgId: string, mes?: string) {
    const base = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);
    const desde = new Date(`${base}-01T00:00:00-05:00`);
    const hasta = new Date(desde);
    hasta.setMonth(hasta.getMonth() + 1);
    return this.database.withTenant(orgId, (tx) =>
      tx
        .select({
          id: trips.id,
          salida: trips.departureAt,
          llegada: trips.arrivalAt,
          distanciaKm: trips.distanceKm,
          velocidadMaxima: trips.maxSpeedKmh,
          excesoVelocidad: trips.speeding,
          excesoJornada: trips.overShift,
          origen: trips.source,
          estado: trips.status,
          placa: vehicles.plate,
          conductor: drivers.fullName,
          ruta: routes.name,
        })
        .from(trips)
        .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
        .innerJoin(drivers, eq(drivers.id, trips.driverId))
        .leftJoin(routes, eq(routes.id, trips.routeId))
        .where(and(gte(trips.departureAt, desde), lt(trips.departureAt, hasta)))
        .orderBy(desc(trips.departureAt)),
    );
  }

  /** Registra un viaje en una transacción existente (lo usan también la telemática y n8n). */
  async registrarEnTx(tx: TenantTx, orgId: string, input: ViajeInput & { origenDatos?: 'manual' | 'telematica'; idExterno?: string }, actorId: string | null) {
    const problemas = await impedimentosDeViaje(tx, input.vehiculoId, input.conductorId);
    if (problemas.length && input.origenDatos !== 'telematica') {
      throw new UnprocessableEntityException({ message: 'No se puede asignar este desplazamiento', errores: problemas.map((p) => ({ campo: 'asignacion', mensaje: p })) });
    }
    let limite: number | null = null;
    let distancia = input.distanciaKm ?? null;
    if (input.rutaId) {
      const [r] = await tx.select().from(routes).where(eq(routes.id, input.rutaId));
      if (!r) throw new NotFoundException('Ruta no encontrada');
      limite = r.speedLimitKmh;
      distancia ??= r.distanceKm;
    }
    const exceso = limite !== null && input.velocidadMaxima != null && input.velocidadMaxima > limite;
    const [t] = await tx
      .insert(trips)
      .values({
        organizationId: orgId,
        routeId: input.rutaId ?? null,
        vehicleId: input.vehiculoId,
        driverId: input.conductorId,
        departureAt: new Date(input.salida),
        arrivalAt: input.llegada ? new Date(input.llegada) : null,
        distanceKm: distancia,
        maxSpeedKmh: input.velocidadMaxima ?? null,
        speeding: exceso,
        overShift: input.excesoJornada,
        source: input.origenDatos ?? 'manual',
        externalId: input.idExterno ?? null,
        status: input.llegada ? 'terminado' : 'programado',
        createdBy: actorId,
      })
      .onConflictDoNothing()
      .returning();
    return { viaje: t ?? null, advertencias: problemas };
  }

  registrar(orgId: string, input: ViajeInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const r = await this.registrarEnTx(tx, orgId, input, actorId);
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'viaje.registrado', entidad: 'trip', entidadId: r.viaje?.id ?? null });
      return r;
    });
  }

  terminar(orgId: string, id: string, datos: { llegada: string; distanciaKm?: number | null; velocidadMaxima?: number | null; excesoJornada?: boolean }, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [actual] = await tx.select().from(trips).where(eq(trips.id, id));
      if (!actual) throw new NotFoundException('Viaje no encontrado');
      let limite: number | null = null;
      if (actual.routeId) limite = (await tx.select().from(routes).where(eq(routes.id, actual.routeId)))[0]?.speedLimitKmh ?? null;
      const velocidad = datos.velocidadMaxima ?? actual.maxSpeedKmh;
      const [t] = await tx
        .update(trips)
        .set({
          arrivalAt: new Date(datos.llegada),
          distanceKm: datos.distanciaKm ?? actual.distanceKm,
          maxSpeedKmh: velocidad,
          speeding: limite !== null && velocidad !== null && velocidad > limite,
          overShift: datos.excesoJornada ?? actual.overShift,
          status: 'terminado',
        })
        .where(eq(trips.id, id))
        .returning();
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'viaje.terminado', entidad: 'trip', entidadId: id });
      return t!;
    });
  }
}

@Controller('org')
export class DesplazamientosController {
  constructor(private readonly s: DesplazamientosService) {}

  @Get('rutas') @Permiso('ver')
  rutas(@OrgActual() o: OrgSesion) { return this.s.rutas(o.id); }

  @Post('rutas') @Permiso('gestionar_flota')
  crearRuta(@Body(new ZodValidationPipe(rutaSchema)) b: RutaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarRuta(o.id, b, u.id); }

  @Patch('rutas/:id') @Permiso('gestionar_flota')
  editarRuta(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(rutaSchema)) b: RutaInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.guardarRuta(o.id, b, u.id, id); }

  @Get('viajes') @Permiso('ver')
  viajes(@OrgActual() o: OrgSesion, @Query('mes') mes?: string) { return this.s.viajes(o.id, mes); }

  @Post('viajes') @Permiso('gestionar_flota')
  registrar(@Body(new ZodValidationPipe(viajeSchema)) b: ViajeInput, @OrgActual() o: OrgSesion, @UsuarioActual() u: UsuarioSesion) { return this.s.registrar(o.id, b, u.id); }

  @Post('viajes/:id/terminar') @Permiso('gestionar_flota')
  terminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(viajeSchema.pick({ llegada: true, distanciaKm: true, velocidadMaxima: true, excesoJornada: true }).required({ llegada: true })))
    b: { llegada: string; distanciaKm?: number | null; velocidadMaxima?: number | null; excesoJornada?: boolean },
    @OrgActual() o: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) { return this.s.terminar(o.id, id, b, u.id); }
}

@Module({ controllers: [DesplazamientosController], providers: [DesplazamientosService], exports: [DesplazamientosService] })
export class DesplazamientosModule {}
