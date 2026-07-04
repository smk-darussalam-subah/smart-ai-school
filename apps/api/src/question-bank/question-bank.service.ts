// =============================================================================
// QuestionBankService — repository soal reusable (P14 — W3-2).
// GURU: CRUD soal milik sendiri + question sets · KS/SA: baca semua (audit).
// Pola ownership/role mengikuti AssessmentService & RppService.
// =============================================================================

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { isElevated, resolveTeacherId } from '../common/helpers/role-helpers';
import {
  CreateQuestionDto,
  CreateQuestionSetDto,
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
  rubric: true, // U2 Wave 2: essay rubrik
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

  // ── Questions ─────────────────────────────────────────────────────────────

  async create(dto: CreateQuestionDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    return this.prisma.question.create({
      data: {
        teacherId,
        subject: dto.subject,
        type: dto.type,
        body: dto.body,
        options: dto.options as Prisma.InputJsonValue | undefined,
        answer: dto.answer ?? null,
        difficulty: dto.difficulty,
        tags: dto.tags,
        // U2 Wave 2: essay rubrik
        ...(dto.rubric !== undefined ? { rubric: dto.rubric as Prisma.InputJsonValue } : {}),
      },
      select: QUESTION_SELECT,
    });
  }

  async findAll(query: ListQuestionDto, user: AuthUser) {
    const filters: Prisma.QuestionWhereInput = {
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.tags ? { tags: { hasSome: query.tags.split(',').map((t) => t.trim()) } } : {}),
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
    const existing = await this.prisma.question.findFirst({
      where: { id, teacherId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Soal tidak ditemukan');

    return this.prisma.question.update({
      where: { id },
      data: {
        ...(dto.subject !== undefined ? { subject: dto.subject } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.options !== undefined ? { options: dto.options as Prisma.InputJsonValue } : {}),
        ...(dto.answer !== undefined ? { answer: dto.answer } : {}),
        ...(dto.difficulty !== undefined ? { difficulty: dto.difficulty } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
        // U2 Wave 2: essay rubrik
        ...(dto.rubric !== undefined ? { rubric: dto.rubric as Prisma.InputJsonValue } : {}),
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

  // ── Question Sets ─────────────────────────────────────────────────────────

  async createSet(dto: CreateQuestionSetDto, user: AuthUser) {
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);

    // Verify all questions exist and belong to this teacher (or elevated)
    const questions = await this.prisma.question.findMany({
      where: { id: { in: dto.questionIds } },
      select: { id: true, teacherId: true },
    });
    if (questions.length !== dto.questionIds.length) {
      throw new NotFoundException('Beberapa soal tidak ditemukan');
    }
    if (!isElevated(user)) {
      const notOwned = questions.filter((q) => q.teacherId !== teacherId);
      if (notOwned.length > 0) {
        throw new ForbiddenException('Anda tidak dapat menambahkan soal milik guru lain ke set');
      }
    }

    return this.prisma.questionSet.create({
      data: {
        name: dto.name,
        teacherId,
        questions: { connect: dto.questionIds.map((id) => ({ id })) },
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
}
