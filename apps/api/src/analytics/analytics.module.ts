import { Module } from '@nestjs/common';
import { SchoolConfigModule } from '../school-config/school-config.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { StudentAnalyticsService } from './analytics.service';

@Module({
  imports: [SchoolConfigModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, StudentAnalyticsService],
})
export class AnalyticsModule {}
