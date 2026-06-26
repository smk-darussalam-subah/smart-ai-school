import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { BadgesController } from './badges.controller';
import { BadgesService } from './badges.service';
import { BadgesListener } from './badges.listener';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [BadgesController],
  providers: [BadgesService, BadgesListener],
  exports: [BadgesService],
})
export class BadgesModule {}
