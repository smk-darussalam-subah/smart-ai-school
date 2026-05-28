import { Module } from '@nestjs/common';
import { KeycloakGuard } from './guards/keycloak.guard';

@Module({
  providers: [KeycloakGuard],
  exports: [KeycloakGuard],
})
export class AuthModule {}
