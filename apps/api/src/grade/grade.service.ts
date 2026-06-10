// =============================================================================
// GradeService — CRUD nilai + ownership
//
// RBAC (di service layer, pola SMA-36):
//   POST:  hanya GURU; harus punya TeachingAssignment untuk assignment tersebut.
//   GET:   SA/KS/TU → semua; GURU → nilai kelas sendiri; SISWA → diri sendiri;
//          ORANG_TUA → nilai anak.
//   PATCH: SA → selalu bisa; GURU(own) → hanya jika submittedBy === userId
//          DAN dalam 7 hari kalender sejak createdAt.
//
// DOBEL GUARD (service layer):
//   UTS/UAS → cek duplikat (studentId, assignmentId, semester, type) sebelum INSERT.
//   UH/praktik/sikap → boleh banyak.
//
// submittedBy = auth.users.id (bukan teacherId), konsisten dengan audit field schema.
// =============================================================================

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GradeType, Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { isGuruOnly, isSiswaOnly, isOrangTuaOnly, resolveUserId, resolveTeacherId, resolveSiswaId } from '../common/helpers/role-helpers';
import { CreateGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { ListGradesQuery } from './dto/list-grades.dto';
import { EVENTS, GradeSubmittedPayload } from '../events/events.types';

// ── Konstanta ─────────────────────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Select shape ─────────────────────────────────────────────────────────────

const GRADE_SELECT = {
  id:           true,
  studentId:    true,
  assignmentId: true,
  semester:     true,
  academicYear: true,
  score:        true,
  type:         true,
  notes:        true,
  submittedBy:  true,
  createdAt:    true,
  updatedAt:    true,
  student: {
    select: {
      id:  true,
      nis: true,
      user: { select: { fullName: true } },
    },
  },
  assignment: {
    select: {
      id:          true,
      subject:     true,
      teacherId:   true,
      classId:     true,
      academicYear: true,
      class:   { select: { id: true, name: true } },
      teacher: { select: { id: true, user: { select: { fullName: true } } } },
    },
  },
} as const;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class GradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** keycloakId → student.id[] (satu atau lebih anak untuk ORANG_TUA) */
  private async resolveChildStudentIds(keycloakId: string): Promise<string[]> {
    const userId = await resolveUserId(this.prisma, keycloakId);
    const children = await this.prisma.student.findMany({
      where: { parentId: userId },
      select: { id: true },
    });
    if (children.length === 0) {
      throw new ForbiddenException('Tidak ada data anak yang terdaftar untuk akun ini');
    }
    return children.map((c) => c.id);
  }

  // ── findAll ─────────────────────────────────────────────────────────────────

  async findAll(query: ListGradesQuery, user: AuthUser) {
    const where: Prisma.GradeWhereInput = {};

    // Query filters yang umum untuk semua role
    if (query.assignmentId) where.assignmentId = query.assignmentId;
    if (query.semester)     where.semester = query.semester;
    if (query.academicYear) where.academicYear = query.academicYear;
    if (query.type)         where.type = query.type as GradeType;

    // Ownership filter — dibangun berdasarkan role
    const assignmentFilter: Prisma.TeachingAssignmentWhereInput = {};
    if (query.classId) assignmentFilter.classId = query.classId;

    if (isGuruOnly(user)) {
      // GURU: hanya nilai dari assignment yang dipegang sendiri
      const myTeacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      assignmentFilter.teacherId = myTeacherId;
      where.assignment = assignmentFilter;
    } else if (isSiswaOnly(user)) {
      // SISWA: hanya nilai sendiri (query.studentId diabaikan)
      where.studentId = await resolveSiswaId(this.prisma, user.keycloakId);
    } else if (isOrangTuaOnly(user)) {
      // ORANG_TUA: hanya nilai anak (query.studentId diabaikan)
      const childIds = await this.resolveChildStudentIds(user.keycloakId);
      where.studentId = { in: childIds };
    } else {
      // ELEVATED (SA/KS/TU): filter opsional dari query
      if (query.studentId) where.studentId = query.studentId;
      if (Object.keys(assignmentFilter).length > 0) where.assignment = assignmentFilter;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.grade.findMany({
        where,
        skip,
        take: query.limit,
        select: GRADE_SELECT,
        orderBy: [{ academicYear: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.grade.count({ where }),
    ]);

    return { data, total, page: query.page, limit: query.limit };
  }

  // ── create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateGradeDto, user: AuthUser) {
    // 1. Resolve userId untuk submittedBy
    const userId = await resolveUserId(this.prisma, user.keycloakId);

    // 2. Pastikan guru punya profil teacher dan assignment-nya milik dia
    const myTeacherId = await resolveTeacherId(this.prisma, user.keycloakId);

    const assignment = await this.prisma.teachingAssignment.findUnique({
      where: { id: dto.assignmentId },
      select: { id: true, teacherId: true, academicYear: true },
    });
    if (!assignment) throw new NotFoundException('TeachingAssignment tidak ditemukan');
    if (assignment.teacherId !== myTeacherId) {
      throw new ForbiddenException('Guru hanya bisa input nilai untuk assignment sendiri');
    }

    // 3. Pastikan siswa terdaftar
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException('Siswa tidak ditemukan');

    // 4. DOBEL GUARD: UTS/UAS hanya boleh satu per (siswa, assignment, semester, type)
    if (dto.type === 'uts' || dto.type === 'uas') {
      const existing = await this.prisma.grade.findFirst({
        where: {
          studentId:    dto.studentId,
          assignmentId: dto.assignmentId,
          semester:     dto.semester,
          type:         dto.type as GradeType,
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `Nilai ${dto.type.toUpperCase()} untuk siswa ini sudah ada di semester ${dto.semester}`,
        );
      }
    }
    // UH/praktik/sikap: boleh banyak, tidak ada guard dobel

    // 5. Simpan
    const grade = await this.prisma.grade.create({
      data: {
        studentId:    dto.studentId,
        assignmentId: dto.assignmentId,
        semester:     dto.semester,
        academicYear: assignment.academicYear,
        score:        dto.score,
        type:         dto.type as GradeType,
        notes:        dto.notes,
        submittedBy:  userId,
      },
      select: GRADE_SELECT,
    });

    // Emit grade.submitted — fire-and-forget
    const gradePayload: GradeSubmittedPayload = {
      gradeId:      grade.id,
      studentId:    grade.studentId,
      subject:      grade.assignment.subject,
      score:        grade.score.toString(),
      type:         grade.type,
      semester:     grade.semester,
      academicYear: grade.academicYear,
    };
    this.eventEmitter.emit(EVENTS.GRADE_SUBMITTED, gradePayload);

    return grade;
  }

  // ── update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateGradeDto, user: AuthUser) {
    const grade = await this.prisma.grade.findUnique({
      where: { id },
      select: { id: true, submittedBy: true, createdAt: true },
    });
    if (!grade) throw new NotFoundException('Grade tidak ditemukan');

    // SA: akses penuh, tidak ada batasan waktu
    if (!user.roles.includes('SUPER_ADMIN')) {
      // GURU: cek ownership submittedBy dan jendela 7 hari
      const userId = await resolveUserId(this.prisma, user.keycloakId);

      if (grade.submittedBy !== userId) {
        throw new ForbiddenException('Hanya guru yang menginput nilai ini yang bisa mengeditnya');
      }

      if (Date.now() - grade.createdAt.getTime() > SEVEN_DAYS_MS) {
        throw new ForbiddenException(
          'Nilai tidak bisa diedit setelah 7 hari kalender sejak diinput',
        );
      }
    }

    return this.prisma.grade.update({
      where: { id },
      data: dto,
      select: GRADE_SELECT,
    });
  }
}
