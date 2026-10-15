import { Module } from '@nestjs/common';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { PermissionModule } from '../permissions/permissions.module';

@Module({
  imports: [AcademicPeriodModule, PermissionModule],
  controllers: [GradeController],
  providers: [GradeService],
})
export class GradeModule {}
