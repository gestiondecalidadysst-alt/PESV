import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SesionGuard } from './sesion.guard.js';

@Module({
  imports: [OrganizationsModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: SesionGuard }],
  exports: [AuthService],
})
export class AuthModule {}
