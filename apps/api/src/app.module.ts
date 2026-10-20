import { Module } from '@nestjs/common';
import { CatalogController } from './catalog/catalog.controller.js';
import { ClassificationController } from './classification/classification.controller.js';
import { DatabaseModule } from './db/database.module.js';
import { HealthController } from './health/health.controller.js';
import { OrganizationsController } from './organizations/organizations.controller.js';
import { OrganizationsService } from './organizations/organizations.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [
    HealthController,
    CatalogController,
    ClassificationController,
    OrganizationsController,
  ],
  providers: [OrganizationsService],
})
export class AppModule {}
