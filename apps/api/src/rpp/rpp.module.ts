import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { AcademicPeriodModule } from '../academic-period/academic-period.module';
import { RppController } from './rpp.controller';
import { RppService } from './rpp.service';

@Module({
  imports: [PrismaModule, PermissionModule, AcademicPeriodModule],
  controllers: [RppController],
  providers: [RppService],
  exports: [RppService],
})
export class RppModule {}
