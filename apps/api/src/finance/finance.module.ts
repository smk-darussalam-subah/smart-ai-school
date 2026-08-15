import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [NotificationModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
