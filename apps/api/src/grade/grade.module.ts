import { Module } from '@nestjs/common';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';

@Module({
  imports: [AcademicPeriodModule],
  controllers: [GradeController],
  providers: [GradeService],
})
export class GradeModule {}
