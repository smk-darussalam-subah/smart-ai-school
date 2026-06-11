import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { ClassActivitiesController } from './class-activities.controller';
import { ClassActivitiesService } from './class-activities.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [ClassActivitiesController],
  providers: [ClassActivitiesService],
  exports: [ClassActivitiesService],
})
export class ClassActivitiesModule {}
