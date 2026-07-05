import { Module } from '@nestjs/common';
import { TeachingAssignmentController } from './teaching-assignment.controller';
import { WaliKelasController } from './wali-kelas.controller';
import { TeachingAssignmentService } from './teaching-assignment.service';

@Module({
  controllers: [TeachingAssignmentController, WaliKelasController],
  providers: [TeachingAssignmentService],
})
export class TeachingAssignmentModule {}
