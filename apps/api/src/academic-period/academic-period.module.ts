import { Module } from '@nestjs/common';
import { PermissionModule } from '../permissions/permissions.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AcademicPeriodService } from './academic-period.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  providers: [AcademicPeriodService],
  exports: [AcademicPeriodService],
})
export class AcademicPeriodModule {}
