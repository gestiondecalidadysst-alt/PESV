import { Module } from '@nestjs/common';
import { AccionesModule } from './acciones/acciones.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ComiteModule } from './comite/comite.module.js';
import { DesplazamientosModule } from './desplazamientos/desplazamientos.module.js';
import { MantenimientoModule } from './mantenimiento/mantenimiento.module.js';
import { PlanificacionModule } from './planificacion/planificacion.module.js';
import { SiniestrosModule } from './siniestros/siniestros.module.js';
import { TareasModule } from './tareas/tareas.module.js';
import { VigiaModule } from './vigia/vigia.module.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { ClassificationController } from './classification/classification.controller.js';
import { DatabaseModule } from './db/database.module.js';
import { EventosModule } from './eventos/eventos.module.js';
import { EvidenciasModule } from './evidencias/evidencias.module.js';
import { FlotaModule } from './flota/flota.module.js';
import { HealthController } from './health/health.controller.js';
import { IaModule } from './ia/ia.module.js';
import { InspeccionesModule } from './inspecciones/inspecciones.module.js';
import { MiembrosModule } from './miembros/miembros.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { StorageModule } from './storage/storage.service.js';
import { TableroModule } from './tablero/tablero.module.js';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    EventosModule,
    AuthModule,
    OrganizationsModule,
    MiembrosModule,
    EvidenciasModule,
    FlotaModule,
    InspeccionesModule,
    TableroModule,
    IaModule,
    MantenimientoModule,
    AccionesModule,
    SiniestrosModule,
    ComiteModule,
    PlanificacionModule,
    DesplazamientosModule,
    VigiaModule,
    TareasModule,
  ],
  controllers: [HealthController, CatalogController, ClassificationController],
})
export class AppModule {}
