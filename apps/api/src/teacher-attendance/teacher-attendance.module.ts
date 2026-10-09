import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { TeacherAttendanceController } from './teacher-attendance.controller';
import { TeacherAttendanceService } from './teacher-attendance.service';
import { StaffAttendanceModule } from '../staff-attendance/staff-attendance.module';

@Module({
  imports: [PrismaModule, PermissionModule, StaffAttendanceModule],
  controllers: [TeacherAttendanceController],
  providers: [TeacherAttendanceService],
  exports: [TeacherAttendanceService],
})
export class TeacherAttendanceModule {}
