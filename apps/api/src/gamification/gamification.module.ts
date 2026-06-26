import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { GamificationListener } from './gamification.listener';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [GamificationController],
  providers: [GamificationService, GamificationListener],
  exports: [GamificationService],
})
export class GamificationModule {}
