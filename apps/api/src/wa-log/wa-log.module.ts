import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { WaLogController } from './wa-log.controller';
import { WaLogService } from './wa-log.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [WaLogController],
  providers: [WaLogService],
  exports: [WaLogService],
})
export class WaLogModule {}
