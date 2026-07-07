import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { AssessmentController } from './assessment.controller';
import { SubmissionController } from './submission.controller';
import { AssessmentService } from './assessment.service';

@Module({
  imports: [PrismaModule, PermissionModule, AuthModule],
  controllers: [AssessmentController, SubmissionController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
