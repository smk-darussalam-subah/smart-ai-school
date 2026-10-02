import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permissions/permissions.module';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [AuthModule, PermissionModule, KeycloakAdminModule, ClassesModule],
  controllers: [ProvisioningController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
