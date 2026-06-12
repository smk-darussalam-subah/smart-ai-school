import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProvisioningModule } from '../provisioning/provisioning.module';

@Module({
  imports: [ProvisioningModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
