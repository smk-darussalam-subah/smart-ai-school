import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { LmsController } from './lms.controller';
import { LmsService } from './lms.service';
import { LmsEventListener } from './lms.event-listener';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [LmsController],
  providers: [LmsService, LmsEventListener],
  exports: [LmsService],
})
export class LmsModule {}
