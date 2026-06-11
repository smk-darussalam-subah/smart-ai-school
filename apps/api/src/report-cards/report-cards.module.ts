import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [ReportCardsController],
  providers: [ReportCardsService],
  exports: [ReportCardsService],
})
export class ReportCardsModule {}
