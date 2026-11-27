import {
  Body, Controller, Get, Headers, NotFoundException, Param, ParseUUIDPipe, Post, Query,
  Res, StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { FastifyReply } from 'fastify';
import { createHash } from 'node:crypto';
import { AssessmentService } from '../assessment/assessment.service';
import { parseSnapshotQuestions } from '../assessment/assessment-runtime';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { OPERATIONAL_TEACHER_WHERE } from '../common/helpers/operational-teacher';
import { RequirePermission } from '../permissions/decorators/require-permission.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { questionMediaIds, validateQuestionMedia } from './question-media';

@Controller('question-media')
export class QuestionMediaController {
  constructor(private readonly db: PrismaService, private readonly assessments: AssessmentService) {}

  @Post()
  @Roles('GURU')
  @RequirePermission('lms.own.manage')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async upload(@Body() body: unknown, @Headers('content-type') mime: string, @CurrentUser() user: AuthUser) {
    const image = validateQuestionMedia(body, mime);
    const teacher = await this.db.teacher.findFirst({
      where: { ...OPERATIONAL_TEACHER_WHERE, user: { ...OPERATIONAL_TEACHER_WHERE.user, keycloakId: user.keycloakId } },
      select: { id: true },
    });
    if (!teacher) throw new NotFoundException('Profil pengajar tidak tersedia.');
    const digest = createHash('sha256').update(image.bytes).digest('hex');
    return this.db.questionMedia.upsert({
      where: { teacherId_digest: { teacherId: teacher.id, digest } },
      update: {},
      create: { teacherId: teacher.id, digest, ...image },
      select: { id: true, width: true, height: true },
    });
  }

  @Get(':id')
  @Roles('GURU', 'SISWA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN')
  @RequirePermission('lms.read')
  async read(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sessionId', new ParseUUIDPipe({ optional: true })) sessionId: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const session = sessionId ? await this.assessments.findOne(sessionId, user, true) : null;
    if (sessionId && (!session || !parseSnapshotQuestions(session.questions).some(
      (question) => questionMediaIds(question).includes(id.toLowerCase()),
    ))) throw new NotFoundException('Gambar soal tidak tersedia.');
    const media = await this.db.questionMedia.findFirst({
      where: {
        id,
        ...(session ? { teacherId: session.teacherId } : {
          teacher: { ...OPERATIONAL_TEACHER_WHERE, user: { ...OPERATIONAL_TEACHER_WHERE.user, keycloakId: user.keycloakId } },
        }),
      },
      select: { bytes: true, contentType: true },
    });
    if (!media) throw new NotFoundException('Gambar soal tidak tersedia.');
    void reply.header('Content-Type', media.contentType);
    void reply.header('Cache-Control', 'private, no-store');
    void reply.header('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(media.bytes);
  }
}
