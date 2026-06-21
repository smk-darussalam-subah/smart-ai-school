import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { SchoolConfigModule } from '../school-config/school-config.module';
import { PublicKioskController } from './public-kiosk.controller';
import { PublicKioskService } from './public-kiosk.service';

@Module({
  imports: [AuthModule, AttendanceModule, SchoolConfigModule],
  controllers: [PublicKioskController],
  providers: [PublicKioskService],
})
export class PublicKioskModule {}
