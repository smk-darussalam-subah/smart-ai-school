import { Module } from '@nestjs/common';
import { BellScheduleModule } from '../bell-schedule/bell-schedule.module';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClassSessionController } from './class-session.controller';
import { ClassSessionDueService } from './class-session-due.service';
import { ClassSessionService } from './class-session.service';

@Module({
  imports: [PrismaModule, BellScheduleModule, NotificationModule],
  controllers: [ClassSessionController],
  providers: [ClassSessionService, ClassSessionDueService],
  exports: [ClassSessionService, ClassSessionDueService],
})
export class ClassSessionModule {}
