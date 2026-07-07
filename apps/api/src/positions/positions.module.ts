import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permissions/permissions.module';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { PositionsController } from './positions.controller';
import { PositionsService } from './positions.service';

@Module({
  imports: [AuthModule, PermissionModule, KeycloakAdminModule],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
