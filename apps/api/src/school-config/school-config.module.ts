import { Module } from '@nestjs/common';
import { SchoolConfigController } from './school-config.controller';
import { SchoolConfigService } from './school-config.service';
import { PermissionModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionModule],  // TF2-P1-1: untuk cleanupOldYearPermissions
  controllers: [SchoolConfigController],
  providers: [SchoolConfigService],
  exports: [SchoolConfigService],
})
export class SchoolConfigModule {}
