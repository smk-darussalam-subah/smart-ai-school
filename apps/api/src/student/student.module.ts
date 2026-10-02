import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { ClassesModule } from '../classes/classes.module';

@Module({
  imports: [ProvisioningModule, ClassesModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
