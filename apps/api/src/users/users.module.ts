import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permissions/permissions.module';
import { KeycloakAdminModule } from '../keycloak-admin/keycloak-admin.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [AuthModule, PermissionModule, KeycloakAdminModule, ClassesModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
