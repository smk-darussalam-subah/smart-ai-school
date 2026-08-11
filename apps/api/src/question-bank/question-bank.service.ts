import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { dbQuestionToSnapshot, questionPayloadToData, sanitizeCsvCell } from '../assessment/assessment-runtime';
import { PrismaService } from '../prisma/prisma.service';
import { isElevated, resolveTeacherId } from '../common/helpers/role-helpers';
import {
  CreateQuestionDto,
  CreateQuestionSetDto,
  DuplicateQuestionDto,
  ImportQuestionsDto,
  ListQuestionDto,
  ListQuestionSetDto,
  UpdateQuestionDto,
} from './dto/question.dto';

const QUESTION_SELECT = {
  id: true,
  teacherId: true,
  subject: true,
  type: true,
  body: true,
  options: true,
  answer: true,
  difficulty: true,
  tags: true,
  rubric: true,
  source: true,
  aiGenerationId: true,
  aiItemKey: true,
  tpRefs: true,
  cognitiveLevel: true,
  createdAt: true,
  updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
} as const;

const QUESTIONSET_SELECT = {
  id: true,
  name: true,
  teacherId: true,
  createdAt: true,
  updatedAt: true,
  teacher: { select: { id: true, user: { select: { fullName: true } } } },
  _count: { select: { questions: true } },
} as const;

@Injectable()
export class QuestionBankService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTeacherSubject(teacherId: string, subject: string): Promise<void> {
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { code: true },
    });
    if (!activeYear) {
      throw new BadRequestException('Tahun ajaran aktif belum dikonfigurasi');
    }
    const assignment = await this.prisma.teachingAssignment.findFirst({
      where: { teacherId, subject, academicYear: activeYear.code },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Guru hanya dapat mengelola soal untuk mapel yang diampu');
    }
  }

  private questionData(dto: CreateQuestionDto | UpdateQuestionDto) {
    const typed = questionPayloadToData(dto);
    return {
      subject: dto.subject,
      type: dto.type,
      body: dto.body,
      difficulty: dto.difficulty,
      tags: dto.tags,
      ...typed,
    };
  }

  async create(dto: CreateQuestionDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    await this.assertTeacherSubject(teacherId, dto.subject);
    return this.prisma.question.create({
      data: {
        teacherId,
        ...this.questionData(dto),
      },
      select: QUESTION_SELECT,
    });
  }

  async findAll(query: ListQuestionDto, user: AuthUser) {
    const filters: Prisma.QuestionWhereInput = {
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.tags ? { tags: { hasSome: query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) } } : {}),
      ...(query.search
        ? {
            OR: [
              { body: { contains: query.search, mode: 'insensitive' } },
              { tags: { has: query.search } },
            ],
          }
        : {}),
    };

    if (!isElevated(user)) {
      if (user.roles.includes('GURU')) {
        const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
        filters.teacherId = teacherId;
      } else {
        throw new ForbiddenException('Akses ditolak');
      }
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.question.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: QUESTION_SELECT,
      }),
      this.prisma.question.count({ where: filters }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async findOne(id: string, user: AuthUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: QUESTION_SELECT,
    });
    if (!question) throw new NotFoundException('Soal tidak ditemukan');

    if (!isElevated(user) && user.roles.includes('GURU')) {
      const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      if (question.teacherId !== teacherId) {
        throw new ForbiddenException('Anda bukan pemilik soal ini');
      }
    } else if (!isElevated(user) && !user.roles.includes('GURU')) {
      throw new ForbiddenException('Akses ditolak');
    }
    return question;
  }

  async update(id: string, dto: UpdateQuestionDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    await this.assertTeacherSubject(teacherId, dto.subject);
    const existing = await this.prisma.question.findFirst({
      where: { id, teacherId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Soal tidak ditemukan');

    return this.prisma.question.update({
      where: { id },
      data: this.questionData(dto),
      select: QUESTION_SELECT,
    });
  }

  async duplicate(id: string, dto: DuplicateQuestionDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const source = await this.prisma.question.findFirst({
      where: { id, teacherId },
      select: QUESTION_SELECT,
    });
    if (!source) throw new NotFoundException('Soal tidak ditemukan');
    const subject = dto.subject ?? source.subject;
    await this.assertTeacherSubject(teacherId, subject);
    const snapshot = dbQuestionToSnapshot({ ...source, subject }, 1);
    const clone = {
      ...snapshot,
      subject,
      body: `${snapshot.body} (salinan)`,
      tags: [...snapshot.tags, 'salinan'].slice(0, 20),
    };
    const { id: _ignored, points: _points, ...payload } = clone;
    return this.prisma.question.create({
      data: {
        teacherId,
        ...this.questionData(payload as CreateQuestionDto),
      },
      select: QUESTION_SELECT,
    });
  }

  async remove(id: string, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const existing = await this.prisma.question.findFirst({
      where: { id, teacherId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Soal tidak ditemukan');

    await this.prisma.question.delete({ where: { id } });
    return { id, deleted: true };
  }

  async createSet(dto: CreateQuestionSetDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: dto.questionIds } },
      select: { id: true, teacherId: true },
    });
    if (questions.length !== dto.questionIds.length) {
      throw new NotFoundException('Beberapa soal tidak ditemukan');
    }
    if (!isElevated(user) && questions.some((question) => question.teacherId !== teacherId)) {
      throw new ForbiddenException('Anda tidak dapat menambahkan soal milik guru lain ke set');
    }

    return this.prisma.questionSet.create({
      data: {
        name: dto.name,
        teacherId,
        questions: { connect: dto.questionIds.map((questionId) => ({ id: questionId })) },
      },
      select: QUESTIONSET_SELECT,
    });
  }

  async findSets(query: ListQuestionSetDto, user: AuthUser) {
    const filters: Prisma.QuestionSetWhereInput = {};

    if (!isElevated(user)) {
      if (user.roles.includes('GURU')) {
        const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
        filters.teacherId = teacherId;
      } else {
        throw new ForbiddenException('Akses ditolak');
      }
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.questionSet.findMany({
        where: filters,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        select: QUESTIONSET_SELECT,
      }),
      this.prisma.questionSet.count({ where: filters }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  async exportQuestionsCsv(subject: string | undefined, user: AuthUser) {
    const first = await this.findAll({ page: 1, limit: 100, ...(subject ? { subject } : {}) }, user);
    const pages = Math.ceil(first.total / first.limit);
    const pageResults = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
        this.findAll({ page: index + 2, limit: 100, ...(subject ? { subject } : {}) }, user)),
    );
    const questions = [first, ...pageResults].flatMap((page) => page.data);
    const header = 'type,subject,body,options,answer,difficulty,tags,rubric';
    const rows = questions.map((question) => [
      sanitizeCsvCell(question.type),
      sanitizeCsvCell(question.subject),
      sanitizeCsvCell(question.body),
      sanitizeCsvCell(question.options),
      sanitizeCsvCell(question.answer ?? ''),
      sanitizeCsvCell(question.difficulty),
      sanitizeCsvCell(question.tags),
      sanitizeCsvCell(question.rubric),
    ].join(','));

    return { csv: [header, ...rows].join('\n'), count: questions.length };
  }

  async importQuestionsCsv(dto: ImportQuestionsDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    await this.assertTeacherSubject(teacherId, dto.subject);
    const errors: Array<{ row: number; column?: string; message: string }> = [];
    let imported = 0;

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i]!;
      try {
        if (row.question.subject !== dto.subject) {
          throw new BadRequestException('Subject baris harus sama dengan subject import');
        }
        const data = this.questionData(row.question);
        const fingerprint = this.questionIdentityFingerprint(data);
        await this.prisma.$transaction(async (tx) => {
          await this.lockQuestionImportRow(tx, teacherId, dto.batchKey, row.rowKey);
          const ledger = await tx.questionImportRow.upsert({
            where: {
              teacherId_batchKey_rowKey: {
                teacherId,
                batchKey: dto.batchKey,
                rowKey: row.rowKey,
              },
            },
            create: {
              teacherId,
              batchKey: dto.batchKey,
              rowKey: row.rowKey,
              payloadFingerprint: fingerprint,
            },
            update: {},
            select: { payloadFingerprint: true, questionId: true },
          });
          if (ledger.payloadFingerprint !== fingerprint) {
            throw new ConflictException('Row import sudah dipakai untuk payload berbeda');
          }
          if (ledger.questionId) return;

          const existing = await this.findQuestionByFullFingerprint(tx, teacherId, data);
          const question = existing ?? await tx.question.create({
            data: {
              teacherId,
              ...data,
            },
            select: { id: true },
          });
          await tx.questionImportRow.update({
            where: {
              teacherId_batchKey_rowKey: {
                teacherId,
                batchKey: dto.batchKey,
                rowKey: row.rowKey,
              },
            },
            data: { questionId: question.id, status: 'imported', errorMessage: null },
          });
        });
        imported++;
      } catch (error) {
        errors.push({
          row: i + 1,
          column: row.rowKey,
          message: error instanceof BadRequestException || error instanceof ConflictException || error instanceof ForbiddenException
            ? error.message
            : 'Baris tidak dapat diimpor. Periksa format dan duplikasi data.',
        });
      }
    }

    return { imported, errors };
  }

  private async lockQuestionImportRow(
    tx: Prisma.TransactionClient,
    teacherId: string,
    batchKey: string,
    rowKey: string,
  ): Promise<void> {
    const rawTx = tx as unknown as { $executeRaw?: (query: unknown) => Promise<unknown> };
    if (typeof rawTx.$executeRaw !== 'function') return;
    const [left, right] = this.advisoryLockPair(`question-import:${teacherId}:${batchKey}:${rowKey}`);
    await rawTx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${left}::int, ${right}::int)`);
  }

  private advisoryLockPair(lockName: string): [number, number] {
    const digest = createHash('sha256').update(lockName).digest();
    return [digest.readInt32BE(0), digest.readInt32BE(4)];
  }

  private exactQuestionIdentityWhere(
    teacherId: string,
    data: ReturnType<QuestionBankService['questionData']>,
  ): Prisma.QuestionWhereInput {
    return {
      teacherId,
      subject: data.subject,
      type: data.type,
      body: data.body,
      difficulty: data.difficulty,
    };
  }

  private async findQuestionByFullFingerprint(
    db: Prisma.TransactionClient | PrismaService,
    teacherId: string,
    data: ReturnType<QuestionBankService['questionData']>,
  ): Promise<{ id: string } | null> {
    const candidates = await db.question.findMany({
      where: this.exactQuestionIdentityWhere(teacherId, data),
      select: {
        id: true,
        subject: true,
        type: true,
        body: true,
        difficulty: true,
        tags: true,
        options: true,
        answer: true,
        rubric: true,
      },
    });
    const expected = this.questionIdentityFingerprint(data);
    return candidates.find((candidate) => this.questionIdentityFingerprint(candidate) === expected) ?? null;
  }

  private questionIdentityFingerprint(value: {
    subject: string;
    type: string;
    body: string;
    difficulty: string;
    tags: string[];
    options?: unknown;
    answer?: string | null;
    rubric?: unknown;
  }): string {
    const normalizeJson = (input: unknown): unknown => {
      if (input === Prisma.JsonNull || input === Prisma.DbNull || input == null) return null;
      if (Array.isArray(input)) return input.map(normalizeJson);
      if (input && typeof input === 'object') {
        return Object.fromEntries(
          Object.entries(input as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, normalizeJson(nested)]),
        );
      }
      return input;
    };
    const payload = {
      subject: value.subject,
      type: value.type,
      body: value.body,
      difficulty: value.difficulty,
      tags: [...(value.tags ?? [])].sort(),
      options: normalizeJson(value.options),
      answer: value.answer ?? null,
      rubric: normalizeJson(value.rubric),
    };
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
