import { Module } from '@nestjs/common';
import { PermissionModule } from '../permissions/permissions.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { SemesterClosingController } from './semester-closing.controller';
import { SemesterClosingService } from './semester-closing.service';

@Module({
  imports: [PermissionModule, AcademicPeriodModule],
  controllers: [SemesterClosingController],
  providers: [SemesterClosingService],
  exports: [SemesterClosingService],
})
export class SemesterClosingModule {}
