import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { PrivateObjectStorageModule } from '../storage/private-object-storage.module';
import { ClassActivitiesController } from './class-activities.controller';
import { ClassActivitiesService } from './class-activities.service';

@Module({
  imports: [PrismaModule, PermissionModule, PrivateObjectStorageModule],
  controllers: [ClassActivitiesController],
  providers: [ClassActivitiesService],
  exports: [ClassActivitiesService],
})
export class ClassActivitiesModule {}
