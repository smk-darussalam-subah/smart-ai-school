import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { AssessmentController } from './assessment.controller';
import { RemedialController } from './remedial.controller';
import { SubmissionController } from './submission.controller';
import { AssessmentService } from './assessment.service';
import { ExamScheduleService } from './exam-schedule.service';
import { ExamScheduleController } from './exam-schedule.controller';

@Module({
  imports: [PrismaModule, PermissionModule, AuthModule, NotificationModule, AcademicPeriodModule],
  controllers: [AssessmentController, RemedialController, SubmissionController, ExamScheduleController],
  providers: [AssessmentService, ExamScheduleService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
