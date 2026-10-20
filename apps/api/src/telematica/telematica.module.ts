import { Body, Controller, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { loteTelematicaSchema, type ViajeTelematicaInput } from '@pesv/shared';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { OrgActual, Permiso, RequiereFuncion, UsuarioActual, type OrgSesion, type UsuarioSesion } from '../auth/decorators.js';
import { auditar } from '../common/audit.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DatabaseService } from '../db/database.service.js';
import { drivers, routes, vehicles } from '../db/schema.js';
import { DesplazamientosModule, DesplazamientosService } from '../desplazamientos/desplazamientos.module.js';

interface ResultadoLote {
  recibidos: number;
  registrados: number;
  duplicados: number;
  rechazados: { idExterno: string; motivo: string }[];
  advertencias: { idExterno: string; problemas: string[] }[];
}

/**
 * Recepción de viajes desde plataformas GPS (directamente o vía n8n) con un token de API de
 * alcance «telematica». Cada viaje se identifica por su id externo, así que reenviar un lote no
 * duplica registros. A diferencia del registro manual, un viaje que ya ocurrió se guarda aunque
 * el conductor o el vehículo tengan impedimentos; esos impedimentos vuelven como advertencias.
 */
@Injectable()
export class TelematicaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly desplazamientos: DesplazamientosService,
  ) {}

  async recibir(orgId: string, viajes: ViajeTelematicaInput[], actorId: string | null): Promise<ResultadoLote> {
    const r: ResultadoLote = { recibidos: viajes.length, registrados: 0, duplicados: 0, rechazados: [], advertencias: [] };
    for (const v of viajes) {
      try {
        await this.database.withTenant(orgId, async (tx) => {
          const [vehiculo] = await tx.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.plate, v.placa));
          if (!vehiculo) return void r.rechazados.push({ idExterno: v.idExterno, motivo: `No hay un vehículo con placa ${v.placa}` });
          const [conductor] = await tx.select({ id: drivers.id }).from(drivers).where(eq(drivers.documentNumber, v.documentoConductor));
          if (!conductor) return void r.rechazados.push({ idExterno: v.idExterno, motivo: `No hay un conductor con cédula ${v.documentoConductor}` });
          const [ruta] = v.ruta
            ? await tx.select({ id: routes.id }).from(routes).where(sql`lower(${routes.name}) = lower(${v.ruta})`)
            : [];
          const { viaje, advertencias } = await this.desplazamientos.registrarEnTx(
            tx,
            orgId,
            {
              vehiculoId: vehiculo.id,
              conductorId: conductor.id,
              rutaId: ruta?.id ?? null,
              salida: v.salida,
              llegada: v.llegada ?? null,
              distanciaKm: v.distanciaKm ?? null,
              velocidadMaxima: v.velocidadMaxima ?? null,
              excesoJornada: v.excesoJornada,
              origenDatos: 'telematica',
              idExterno: v.idExterno,
            },
            actorId,
          );
          if (!viaje) return void r.duplicados++;
          r.registrados++;
          if (advertencias.length) r.advertencias.push({ idExterno: v.idExterno, problemas: advertencias });
          if (v.odometroKm != null) {
            await tx
              .update(vehicles)
              .set({ odometerKm: v.odometroKm })
              .where(and(eq(vehicles.id, vehiculo.id), or(isNull(vehicles.odometerKm), sql`${vehicles.odometerKm} < ${v.odometroKm}`)));
          }
        });
      } catch (err) {
        r.rechazados.push({ idExterno: v.idExterno, motivo: (err as Error).message });
      }
    }
    await this.database.withTenant(orgId, (tx) =>
      auditar(tx, { organizacionId: orgId, actorId, accion: 'telematica.lote', entidad: 'trip', entidadId: null, datos: { ...r, rechazados: r.rechazados.length, advertencias: r.advertencias.length } }),
    );
    return r;
  }
}

@Controller('telematica')
export class TelematicaController {
  constructor(private readonly service: TelematicaService) {}

  @Post('viajes')
  @HttpCode(200)
  @Permiso('telematica')
  @RequiereFuncion('telematica')
  recibir(@Body(new ZodValidationPipe(loteTelematicaSchema)) body: { viajes: ViajeTelematicaInput[] }, @OrgActual() org: OrgSesion, @UsuarioActual() u: UsuarioSesion) {
    return this.service.recibir(org.id, body.viajes, u.id || null);
  }
}

@Module({ imports: [DesplazamientosModule], controllers: [TelematicaController], providers: [TelematicaService] })
export class TelematicaModule {}
