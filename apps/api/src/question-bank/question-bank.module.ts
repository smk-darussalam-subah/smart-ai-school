import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionModule } from '../permissions/permissions.module';
import { QuestionBankService } from './question-bank.service';
import { QuestionController, QuestionSetController } from './question-bank.controller';

@Module({
  imports: [PrismaModule, PermissionModule],
  controllers: [QuestionController, QuestionSetController],
  providers: [QuestionBankService],
  exports: [QuestionBankService],
})
export class QuestionBankModule {}
