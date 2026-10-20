import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  conductorSchema,
  estadoVencimiento,
  diasHasta,
  TIPOS_VEHICULO,
  vehiculoSchema,
  type ConductorInput,
  type VehiculoInput,
} from '@pesv/shared';
import { asc, eq } from 'drizzle-orm';
import {
  Miembro,
  OrgActual,
  Permiso,
  UsuarioActual,
  type OrgSesion,
  type UsuarioSesion,
} from '../auth/decorators.js';
import { auditar, esViolacionUnica } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { verificarLimite } from '../suscripciones/reglas.js';
import { DatabaseService } from '../db/database.service.js';
import { drivers, vehicles } from '../db/schema.js';

type FilaVehiculo = typeof vehicles.$inferSelect;
type FilaConductor = typeof drivers.$inferSelect;

const aVehiculo = (v: FilaVehiculo) => ({
  id: v.id,
  placa: v.plate,
  tipo: v.vehicleType,
  servicio: v.serviceType,
  propiedad: v.ownership,
  motorizado: v.motorized,
  marca: v.brand,
  modelo: v.modelYear,
  capacidad: v.capacity,
  soatVence: v.soatExpiresOn,
  rtmVence: v.rtmExpiresOn,
  odometroKm: v.odometerKm,
  estado: v.status,
  documentos: {
    soat: estadoVencimiento(v.soatExpiresOn),
    rtm: estadoVencimiento(v.rtmExpiresOn),
  },
});

const aConductor = (c: FilaConductor) => ({
  id: c.id,
  documento: c.documentNumber,
  nombre: c.fullName,
  telefono: c.phone,
  email: c.email,
  categoriaLicencia: c.licenseCategory,
  licenciaVence: c.licenseExpiresOn,
  examenMedicoVence: c.medicalExamExpiresOn,
  tipoContrato: c.contractType,
  rolVia: c.roadRole,
  activo: c.active,
  documentos: {
    licencia: estadoVencimiento(c.licenseExpiresOn),
    examenMedico: estadoVencimiento(c.medicalExamExpiresOn),
  },
});

const valoresVehiculo = (input: VehiculoInput) => ({
  plate: input.placa,
  vehicleType: input.tipo,
  serviceType: input.servicio,
  ownership: input.propiedad,
  motorized: TIPOS_VEHICULO.find((t) => t.id === input.tipo)?.motorizado ?? true,
  brand: input.marca ?? null,
  modelYear: input.modelo ?? null,
  capacity: input.capacidad ?? null,
  soatExpiresOn: input.soatVence ?? null,
  rtmExpiresOn: input.rtmVence ?? null,
  odometerKm: input.odometroKm ?? null,
  ...(input.estado ? { status: input.estado } : {}),
});

const valoresConductor = (input: ConductorInput) => ({
  documentNumber: input.documento,
  fullName: input.nombre,
  phone: input.telefono ?? null,
  email: input.email ?? null,
  licenseCategory: input.categoriaLicencia ?? null,
  licenseExpiresOn: input.licenciaVence ?? null,
  medicalExamExpiresOn: input.examenMedicoVence ?? null,
  contractType: input.tipoContrato,
  roadRole: input.rolVia,
  ...(input.activo === undefined ? {} : { active: input.activo }),
});

export interface Alerta {
  tipo: 'documento' | 'vehiculo_no_apto';
  severidad: 'critica' | 'advertencia';
  titulo: string;
  detalle: string;
  entidad: 'vehiculo' | 'conductor';
  entidadId: string;
  vence?: string;
  dias?: number;
}

@Injectable()
export class FlotaService {
  constructor(private readonly database: DatabaseService) {}

  vehiculos(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(vehicles).where(eq(vehicles.organizationId, orgId)).orderBy(asc(vehicles.plate))).map(aVehiculo),
    );
  }

  async crearVehiculo(orgId: string, input: VehiculoInput, actorId: string) {
    try {
      return await this.database.withTenant(orgId, async (tx) => {
        await verificarLimite(tx, orgId, 'vehiculos');
        const [v] = await tx.insert(vehicles).values({ organizationId: orgId, ...valoresVehiculo(input) }).returning();
        await auditar(tx, { organizacionId: orgId, actorId, accion: 'vehiculo.creado', entidad: 'vehicle', entidadId: v!.id });
        return aVehiculo(v!);
      });
    } catch (err) {
      if (esViolacionUnica(err)) throw new ConflictException(`Ya existe un vehículo con la placa ${input.placa}`);
      throw err;
    }
  }

  async actualizarVehiculo(orgId: string, id: string, input: VehiculoInput, actorId: string) {
    try {
      return await this.database.withTenant(orgId, async (tx) => {
        const [v] = await tx
          .update(vehicles)
          .set({ ...valoresVehiculo(input), updatedAt: new Date() })
          .where(eq(vehicles.id, id))
          .returning();
        if (!v) throw new NotFoundException('Vehículo no encontrado');
        await auditar(tx, { organizacionId: orgId, actorId, accion: 'vehiculo.actualizado', entidad: 'vehicle', entidadId: id });
        return aVehiculo(v);
      });
    } catch (err) {
      if (esViolacionUnica(err)) throw new ConflictException(`Ya existe un vehículo con la placa ${input.placa}`);
      throw err;
    }
  }

  conductores(orgId: string) {
    return this.database.withTenant(orgId, async (tx) =>
      (await tx.select().from(drivers).where(eq(drivers.organizationId, orgId)).orderBy(asc(drivers.fullName))).map(aConductor),
    );
  }

  async crearConductor(orgId: string, input: ConductorInput, actorId: string) {
    try {
      return await this.database.withTenant(orgId, async (tx) => {
        await verificarLimite(tx, orgId, 'conductores');
        const [c] = await tx
          .insert(drivers)
          .values({ organizationId: orgId, ...valoresConductor(input), dataConsentAt: new Date() })
          .returning();
        await auditar(tx, { organizacionId: orgId, actorId, accion: 'conductor.creado', entidad: 'driver', entidadId: c!.id });
        return aConductor(c!);
      });
    } catch (err) {
      if (esViolacionUnica(err)) throw new ConflictException(`Ya existe un conductor con la cédula ${input.documento}`);
      throw err;
    }
  }

  async actualizarConductor(orgId: string, id: string, input: ConductorInput, actorId: string) {
    return this.database.withTenant(orgId, async (tx) => {
      const [c] = await tx
        .update(drivers)
        .set({ ...valoresConductor(input), updatedAt: new Date() })
        .where(eq(drivers.id, id))
        .returning();
      if (!c) throw new NotFoundException('Conductor no encontrado');
      await auditar(tx, { organizacionId: orgId, actorId, accion: 'conductor.actualizado', entidad: 'driver', entidadId: id });
      return aConductor(c);
    });
  }

  /** Vencimientos y vehículos no aptos, ordenados por urgencia (RN-14, RN-15). */
  async alertas(orgId: string): Promise<Alerta[]> {
    const [vs, cs] = await Promise.all([this.vehiculos(orgId), this.conductores(orgId)]);
    const alertas: Alerta[] = [];
    const documento = (
      fecha: string | null,
      nombreDoc: string,
      quien: string,
      entidad: Alerta['entidad'],
      entidadId: string,
    ) => {
      const estado = estadoVencimiento(fecha);
      if (!fecha || (estado !== 'vencido' && estado !== 'por_vencer')) return;
      const dias = diasHasta(fecha);
      alertas.push({
        tipo: 'documento',
        severidad: estado === 'vencido' ? 'critica' : 'advertencia',
        titulo: estado === 'vencido' ? `${nombreDoc} vencido` : `${nombreDoc} por vencer`,
        detalle: estado === 'vencido' ? `${quien} · venció hace ${-dias} días` : `${quien} · vence en ${dias} días`,
        entidad,
        entidadId,
        vence: fecha,
        dias,
      });
    };
    for (const v of vs.filter((v) => v.estado !== 'inactivo')) {
      if (v.motorizado) {
        documento(v.soatVence, 'SOAT', `Placa ${v.placa}`, 'vehiculo', v.id);
        documento(v.rtmVence, 'Revisión técnico-mecánica', `Placa ${v.placa}`, 'vehiculo', v.id);
      }
      if (v.estado === 'no_apto') {
        alertas.push({
          tipo: 'vehiculo_no_apto',
          severidad: 'critica',
          titulo: 'Vehículo no apto para operar',
          detalle: `Placa ${v.placa} · tiene una falla crítica sin cerrar`,
          entidad: 'vehiculo',
          entidadId: v.id,
        });
      }
    }
    for (const c of cs.filter((c) => c.activo)) {
      documento(c.licenciaVence, 'Licencia de conducción', c.nombre, 'conductor', c.id);
      documento(c.examenMedicoVence, 'Examen médico', c.nombre, 'conductor', c.id);
    }
    const peso = (a: Alerta) => (a.severidad === 'critica' ? 0 : 1) * 1000 + (a.dias ?? -1000);
    return alertas.sort((a, b) => peso(a) - peso(b));
  }
}

@Controller('org')
export class FlotaController {
  constructor(private readonly service: FlotaService) {}

  /** Lista para el preoperacional: la usan también los conductores. */
  @Get('vehiculos')
  @Miembro()
  vehiculos(@OrgActual() org: OrgSesion) {
    return this.service.vehiculos(org.id);
  }

  @Post('vehiculos')
  @Permiso('gestionar_flota')
  crearVehiculo(
    @Body(new ZodValidationPipe(vehiculoSchema)) body: VehiculoInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.crearVehiculo(org.id, body, u.id);
  }

  @Patch('vehiculos/:id')
  @Permiso('gestionar_flota')
  actualizarVehiculo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(vehiculoSchema)) body: VehiculoInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.actualizarVehiculo(org.id, id, body, u.id);
  }

  @Get('conductores')
  @Miembro()
  conductores(@OrgActual() org: OrgSesion) {
    return this.service.conductores(org.id);
  }

  @Post('conductores')
  @Permiso('gestionar_flota')
  crearConductor(
    @Body(new ZodValidationPipe(conductorSchema)) body: ConductorInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.crearConductor(org.id, body, u.id);
  }

  @Patch('conductores/:id')
  @Permiso('gestionar_flota')
  actualizarConductor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(conductorSchema)) body: ConductorInput,
    @OrgActual() org: OrgSesion,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.service.actualizarConductor(org.id, id, body, u.id);
  }

  @Get('alertas')
  @Permiso('ver')
  alertas(@OrgActual() org: OrgSesion) {
    return this.service.alertas(org.id);
  }
}

@Module({ controllers: [FlotaController], providers: [FlotaService], exports: [FlotaService] })
export class FlotaModule {}
