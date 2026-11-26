import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentProgramController } from './assessment-program.controller';
import { AssessmentProgramService } from './assessment-program.service';
import { RemedialController } from './remedial.controller';
import { SubmissionController } from './submission.controller';
import { AssessmentService } from './assessment.service';
import { ExamScheduleService } from './exam-schedule.service';
import { ExamScheduleController } from './exam-schedule.controller';

import { ExamOperationsController } from './exam-operations.controller';
import { ExamOperationsService } from './exam-operations.service';

@Module({
  imports: [PrismaModule, PermissionModule, AuthModule, NotificationModule, AcademicPeriodModule],
  controllers: [AssessmentController, AssessmentProgramController, RemedialController, SubmissionController, ExamOperationsController, ExamScheduleController],
  providers: [AssessmentService, AssessmentProgramService, ExamScheduleService, ExamOperationsService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
