import { Module } from '@nestjs/common';
import { KktpConfigController } from './kktp-config.controller';
import { KktpConfigService } from './kktp-config.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [KktpConfigController],
  providers: [KktpConfigService],
  exports: [KktpConfigService],
})
export class KktpConfigModule {}
