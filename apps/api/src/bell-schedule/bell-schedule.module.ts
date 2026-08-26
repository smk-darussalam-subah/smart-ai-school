import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BellScheduleController } from './bell-schedule.controller';
import { BellScheduleService } from './bell-schedule.service';

@Module({
  imports: [PrismaModule],
  controllers: [BellScheduleController],
  providers: [BellScheduleService],
  exports: [BellScheduleService],
})
export class BellScheduleModule {}
