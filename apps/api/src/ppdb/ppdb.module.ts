import { Module } from '@nestjs/common';
import { PpdbController } from './ppdb.controller';
import { PpdbService } from './ppdb.service';

@Module({
  controllers: [PpdbController],
  providers: [PpdbService],
})
export class PpdbModule {}
