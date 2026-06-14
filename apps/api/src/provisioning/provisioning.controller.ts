// =============================================================================
// ProvisioningController — Endpoint provisioning user & siswa
// =============================================================================

import { Body, Controller, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { Audit } from '../audit-log/decorators/audit.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '@smk/auth';
import { ProvisioningService } from './provisioning.service';
import {
  ProvisionUserSchema,
  ProvisionStudentSchema,
  ProvisionUsersBulkSchema,
} from './dto/provision.dto';
import type {
  ProvisionUserDto,
  ProvisionStudentDto,
  ProvisionUsersBulkDto,
} from './dto/provision.dto';

@Controller('provision')
@Roles('SUPER_ADMIN', 'TATA_USAHA')
export class ProvisioningController {
  constructor(private readonly provisioning: ProvisioningService) {}

  @Post('users')
  @RequirePermission('user.provision')
  @Audit({ captureBody: true })
  async provisionUser(
    @Body(ZodPipe(ProvisionUserSchema)) dto: ProvisionUserDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.provisioning.provisionUser(dto, {
      keycloakId: actor.keycloakId,
      roles: actor.roles,
    });
  }

  @Post('users/bulk')
  @RequirePermission('user.provision')
  @Audit({ captureBody: false }) // payload besar + kredensial sementara → jangan disimpan utuh
  async provisionUsersBulk(
    @Body(ZodPipe(ProvisionUsersBulkSchema)) dto: ProvisionUsersBulkDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.provisioning.bulkProvisionUsers(
      dto.users as Array<Record<string, unknown>>,
      { keycloakId: actor.keycloakId, roles: actor.roles },
    );
  }

  @Post('students')
  @RequirePermission('user.provision')
  @Audit({ captureBody: true })
  async provisionStudent(
    @Body(ZodPipe(ProvisionStudentSchema)) dto: ProvisionStudentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.provisioning.provisionStudent(dto, {
      keycloakId: actor.keycloakId,
      roles: actor.roles,
    });
  }
}
