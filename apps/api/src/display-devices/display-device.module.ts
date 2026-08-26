import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DisplayDeviceActivationController, DisplayDeviceManagementController } from './display-device.controller';
import { DisplayDeviceService } from './display-device.service';

@Module({
  imports: [PrismaModule],
  controllers: [DisplayDeviceManagementController, DisplayDeviceActivationController],
  providers: [DisplayDeviceService],
  exports: [DisplayDeviceService],
})
export class DisplayDeviceModule {}
