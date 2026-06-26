import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { StudentDashboardController } from './student-dashboard.controller';
import { StudentDashboardService } from './student-dashboard.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [StudentDashboardController],
  providers: [StudentDashboardService],
  exports: [StudentDashboardService],
})
export class StudentDashboardModule {}
