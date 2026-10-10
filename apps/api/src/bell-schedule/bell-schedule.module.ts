import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { BellScheduleController } from './bell-schedule.controller';
import { BellScheduleService } from './bell-schedule.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [BellScheduleController],
  providers: [BellScheduleService],
  exports: [BellScheduleService],
})
export class BellScheduleModule {}
