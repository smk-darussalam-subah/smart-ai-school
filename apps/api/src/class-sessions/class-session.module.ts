import { Module } from '@nestjs/common';
import { BellScheduleModule } from '../bell-schedule/bell-schedule.module';
import { NotificationModule } from '../notification/notification.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { ClassSessionController } from './class-session.controller';
import { ClassSessionDueService } from './class-session-due.service';
import { ClassSessionService } from './class-session.service';

@Module({
  imports: [PrismaModule, BellScheduleModule, NotificationModule, PermissionModule, AcademicPeriodModule],
  controllers: [ClassSessionController],
  providers: [ClassSessionService, ClassSessionDueService],
  exports: [ClassSessionService, ClassSessionDueService],
})
export class ClassSessionModule {}
