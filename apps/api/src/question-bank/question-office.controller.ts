import { Body, Controller, Post, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { FastifyReply } from 'fastify';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { exportOfficeQuestions } from './office-question-export';
import { QuestionBankService } from './question-bank.service';

const upload = z.object({
  subject: z.string().trim().min(1).max(100),
  file: z.string().min(4).max(819_200).regex(/^[a-z\d+/]+={0,2}$/i),
}).strict();
const selection = upload.extend({
  codes: z.array(z.string().regex(/^Q\d{3,5}$/)).min(1).max(100),
}).refine(({ codes }) => new Set(codes).size === codes.length, 'Pilih setiap soal satu kali.');
const output = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  format: z.enum(['xlsx', 'docx', 'student-docx', 'student-print']),
}).strict().refine(({ ids }) => new Set(ids).size === ids.length, 'Pilih setiap soal satu kali.');
const template = z.object({
  subject: z.string().trim().min(1).max(100),
  format: z.enum(['xlsx', 'docx']),
}).strict();

@Controller('question-office')
@Roles('GURU')
@RequirePermission('lms.own.manage')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class QuestionOfficeController {
  constructor(private readonly bank: QuestionBankService) {}

  @Post('preview')
  preview(@Body(ZodPipe(upload)) data: z.infer<typeof upload>, @CurrentUser() user: AuthUser) {
    return this.bank.previewOffice(data.subject, Buffer.from(data.file, 'base64'), user);
  }

  @Post('import')
  import(@Body(ZodPipe(selection)) data: z.infer<typeof selection>, @CurrentUser() user: AuthUser) {
    return this.bank.importOffice(data.subject, Buffer.from(data.file, 'base64'), data.codes, user);
  }

  @Post('export')
  async export(@Body(ZodPipe(output)) data: z.infer<typeof output>, @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) reply: FastifyReply) {
    return this.download(reply, await this.bank.exportOffice(data.ids, data.format, user), 'Soal-DIIS');
  }

  @Post('template')
  template(@Body(ZodPipe(template)) data: z.infer<typeof template>, @Res({ passthrough: true }) reply: FastifyReply) {
    const document = exportOfficeQuestions([{
      subject: data.subject, type: 'multiple_choice', body: 'Ganti teks ini dengan isi soal Anda.',
      options: [{ id: 'a', text: 'Ganti pilihan A' }, { id: 'b', text: 'Ganti pilihan B' }],
      answer: 'a', difficulty: 'medium', tags: [], rubric: null,
    }], [], data.format);
    return this.download(reply, document, 'Template-Soal-DIIS');
  }

  private download(reply: FastifyReply, file: ReturnType<typeof exportOfficeQuestions>, name: string) {
    void reply.header('Content-Type', file.mime);
    void reply.header('Content-Disposition', `attachment; filename="${name}.${file.extension}"`);
    void reply.header('Cache-Control', 'private, no-store');
    void reply.header('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.bytes);
  }
}
