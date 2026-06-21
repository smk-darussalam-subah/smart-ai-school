import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [LmsController],
  providers: [LmsService],
  exports: [LmsService],
})
export class LmsModule {}
