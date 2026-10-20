import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { and, count, eq, gte, lt } from 'drizzle-orm';
import { cumplimientoIso } from '@pesv/shared';
import { OrgActual, Permiso, RequiereFuncion, type OrgSesion } from '../auth/decorators.js';
import { DatabaseService } from '../db/database.service.js';
import { evidences, inspections } from '../db/schema.js';
import { FlotaModule, FlotaService } from '../flota/flota.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

/** Inicio del día de hoy en Colombia (UTC-5, sin horario de verano). */
export function inicioDelDiaColombia(fecha = new Date()): Date {
  const local = new Date(fecha.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 5));
}

@Injectable()
export class TableroService {
  constructor(
    private readonly database: DatabaseService,
    private readonly organizaciones: OrganizationsService,
    private readonly flota: FlotaService,
  ) {}

  async iso(orgId: string) {
    const pasos = await this.organizaciones.pasos(orgId);
    return cumplimientoIso(Object.fromEntries(pasos.map((p) => [p.numero, p.estado])));
  }

  async resumen(orgId: string) {
    const desde = inicioDelDiaColombia();
    const hasta = new Date(desde.getTime() + 86_400_000);
    const [detalle, vehiculos, conductores, alertas, conteos, iso] = await Promise.all([
      this.organizaciones.obtener(orgId),
      this.flota.vehiculos(orgId),
      this.flota.conductores(orgId),
      this.flota.alertas(orgId),
      this.database.withTenant(orgId, async (tx) => {
        const hoy = await tx
          .select({ resultado: inspections.result, vehiculo: inspections.vehicleId })
          .from(inspections)
          .where(and(gte(inspections.performedAt, desde), lt(inspections.performedAt, hasta)));
        const [{ porRevisar } = { porRevisar: 0 }] = await tx
          .select({ porRevisar: count() })
          .from(evidences)
          .where(eq(evidences.status, 'borrador'));
        return { hoy, porRevisar };
      }),
      this.iso(orgId),
    ]);
    const operables = vehiculos.filter((v) => v.estado !== 'inactivo' && v.motorizado);
    const inspeccionados = new Set(conteos.hoy.map((i) => i.vehiculo));
    return {
      cumplimiento: detalle.resumen,
      iso: { porcentaje: iso.porcentaje, cubiertas: iso.cubiertas, evaluables: iso.evaluables },
      nivel: detalle.clasificacion?.level ?? null,
      flota: {
        vehiculos: vehiculos.filter((v) => v.estado !== 'inactivo').length,
        noAptos: vehiculos.filter((v) => v.estado === 'no_apto').length,
        conductoresActivos: conductores.filter((c) => c.activo).length,
      },
      preoperacionalesHoy: {
        esperados: operables.length,
        realizados: operables.filter((v) => inspeccionados.has(v.id)).length,
        fallasCriticas: conteos.hoy.filter((i) => i.resultado === 'falla_critica').length,
        fallasMenores: conteos.hoy.filter((i) => i.resultado === 'falla_menor').length,
      },
      evidenciasPorRevisar: conteos.porRevisar,
      alertas: alertas.slice(0, 8),
      totalAlertas: alertas.length,
    };
  }
}

@Controller('org/tablero')
export class TableroController {
  constructor(private readonly service: TableroService) {}

  @Get()
  @Permiso('ver')
  resumen(@OrgActual() org: OrgSesion) {
    return this.service.resumen(org.id);
  }

  /** Cumplimiento de ISO 39001 por cláusula, derivado del estado de los pasos (RN-07). */
  @Get('iso')
  @Permiso('ver')
  @RequiereFuncion('iso39001')
  iso(@OrgActual() org: OrgSesion) {
    return this.service.iso(org.id);
  }
}

@Module({ imports: [OrganizationsModule, FlotaModule], controllers: [TableroController], providers: [TableroService], exports: [TableroService] })
export class TableroModule {}
