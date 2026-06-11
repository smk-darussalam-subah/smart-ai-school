// =============================================================================
// ReportCardsService — Hub Rapor (referensi KamilEdu Modul 12)
//
// generate(): snapshot nilai (per mapel: count/average/byType) + kehadiran
//   (count per status) untuk SEMUA siswa aktif kelas; siswa yang sudah punya
//   rapor (unique studentId+TA+semester) DILEWATI (idempoten).
// Pipeline: draft → checked → published → distributed; return: checked → draft.
//   Snapshot TIDAK dihitung ulang setelah generate (immutable by design) —
//   regenerate = hapus dulu (belum diekspos; backlog bila dibutuhkan).
// Ownership baca DI QUERY: SISWA → miliknya; ORTU → anaknya; GURU → kelas yang
//   diampunya; SA/KS/TU → semua. Distribusi memancarkan event utk notifikasi WA.
// =============================================================================

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../prisma/prisma.service';
import { EVENTS, ReportDistributedPayload } from '../events/events.types';
import {
  GenerateReportsDto,
  ListReportsQueryDto,
  TransitionDto,
  UpdateNotesDto,
} from './dto/report-card.dto';

const ELEVATED = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] as const;

const REPORT_SELECT = {
  id: true, studentId: true, classId: true, academicYear: true, semester: true,
  status: true, grades: true, attendance: true, notes: true,
  generatedAt: true, checkedAt: true, publishedAt: true, distributedAt: true,
  student: { select: { id: true, nis: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
} as const;

// Transisi sah: action → { dari, ke, stempel waktu }
const TRANSITIONS: Record<
  TransitionDto['action'],
  { from: string; to: 'draft' | 'checked' | 'published' | 'distributed'; stamp: string | null }
> = {
  check:      { from: 'draft',     to: 'checked',     stamp: 'checkedAt' },
  return:     { from: 'checked',   to: 'draft',       stamp: null },
  publish:    { from: 'checked',   to: 'published',   stamp: 'publishedAt' },
  distribute: { from: 'published', to: 'distributed', stamp: 'distributedAt' },
};

interface SubjectSnapshot {
  subject: string;
  count: number;
  average: number;
  byType: Record<string, number>;
}

@Injectable()
export class ReportCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private isElevated(user: AuthUser): boolean {
    return user.roles.some((r) => (ELEVATED as readonly string[]).includes(r));
  }

  /** Klausa ownership baca per role — selalu DI QUERY. */
  private async ownershipWhere(user: AuthUser): Promise<Prisma.ReportCardWhereInput> {
    if (this.isElevated(user)) return {};

    if (user.roles.includes('GURU')) {
      const teacher = await this.prisma.teacher.findFirst({
        where: { user: { keycloakId: user.keycloakId }, deletedAt: null },
        select: { assignments: { select: { classId: true } } },
      });
      const classIds = [...new Set(teacher?.assignments.map((a) => a.classId) ?? [])];
      return { classId: { in: classIds } };
    }
    if (user.roles.includes('SISWA')) {
      const student = await this.prisma.student.findFirst({
        where: { user: { keycloakId: user.keycloakId } },
        select: { id: true },
      });
      return { studentId: student?.id ?? '00000000-0000-0000-0000-000000000000' };
    }
    if (user.roles.includes('ORANG_TUA')) {
      const me = await this.prisma.user.findUnique({
        where: { keycloakId: user.keycloakId },
        select: { parent: { select: { id: true } } },
      });
      const childIds = me?.parent.map((c) => c.id) ?? [];
      // Siswa/ortu hanya melihat rapor yang SUDAH dibagikan
      return { studentId: { in: childIds }, status: 'distributed' };
    }
    throw new ForbiddenException('Akses ditolak');
  }

  async findAll(query: ListReportsQueryDto, user: AuthUser) {
    const ownership = await this.ownershipWhere(user);
    // SISWA juga hanya melihat yang sudah dibagikan
    if (user.roles.includes('SISWA') && !this.isElevated(user)) {
      (ownership as Record<string, unknown>)['status'] = 'distributed';
    }
    const where: Prisma.ReportCardWhereInput = {
      ...ownership,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
    };

    const skip = (query.page - 1) * query.limit;
    const [data, total] = await Promise.all([
      this.prisma.reportCard.findMany({
        where,
        orderBy: [{ class: { name: 'asc' } }, { student: { nis: 'asc' } }],
        skip,
        take: query.limit,
        select: REPORT_SELECT,
      }),
      this.prisma.reportCard.count({ where }),
    ]);
    return { data, total, page: query.page, limit: query.limit };
  }

  /** Generate rapor massal satu kelas — idempoten (yang sudah ada dilewati). */
  async generate(dto: GenerateReportsDto) {
    const kelas = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: { id: true, students: { where: { status: 'active' }, select: { id: true } } },
    });
    if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
    if (kelas.students.length === 0) {
      throw new BadRequestException('Kelas tidak memiliki siswa aktif');
    }

    const existing = await this.prisma.reportCard.findMany({
      where: {
        academicYear: dto.academicYear,
        semester: dto.semester,
        studentId: { in: kelas.students.map((s) => s.id) },
      },
      select: { studentId: true },
    });
    const existingIds = new Set(existing.map((e) => e.studentId));
    const targets = kelas.students.filter((s) => !existingIds.has(s.id));

    let generated = 0;
    for (const s of targets) {
      const [grades, attendance] = await Promise.all([
        this.buildGradeSnapshot(s.id, dto.academicYear, dto.semester),
        this.buildAttendanceSnapshot(s.id, dto.classId),
      ]);
      await this.prisma.reportCard.create({
        data: {
          studentId: s.id,
          classId: dto.classId,
          academicYear: dto.academicYear,
          semester: dto.semester,
          grades: grades as unknown as Prisma.InputJsonValue,
          attendance: attendance as Prisma.InputJsonValue,
        },
      });
      generated++;
    }

    return { generated, skipped: existingIds.size, totalStudents: kelas.students.length };
  }

  private async buildGradeSnapshot(
    studentId: string,
    academicYear: string,
    semester: number,
  ): Promise<SubjectSnapshot[]> {
    const grades = await this.prisma.grade.findMany({
      where: { studentId, academicYear, semester },
      select: { score: true, type: true, assignment: { select: { subject: true } } },
    });

    const bySubject = new Map<string, { scores: number[]; byType: Map<string, number[]> }>();
    for (const g of grades) {
      const subject = g.assignment.subject;
      const entry =
        bySubject.get(subject) ??
        { scores: [] as number[], byType: new Map<string, number[]>() };
      const score = Number(g.score);
      entry.scores.push(score);
      const typeArr = entry.byType.get(g.type) ?? [];
      typeArr.push(score);
      entry.byType.set(g.type, typeArr);
      bySubject.set(subject, entry);
    }

    const avg = (arr: number[]) =>
      Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100;

    return [...bySubject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, e]) => ({
        subject,
        count: e.scores.length,
        average: avg(e.scores),
        byType: Object.fromEntries([...e.byType.entries()].map(([t, arr]) => [t, avg(arr)])),
      }));
  }

  private async buildAttendanceSnapshot(
    studentId: string,
    classId: string,
  ): Promise<Record<string, number>> {
    const grouped = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: { studentId, classId },
      _count: { _all: true },
    });
    const result: Record<string, number> = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const g of grouped) result[g.status] = g._count._all;
    return result;
  }

  /** Transisi status sesuai pipeline; aksi tidak sah → 409 dengan pesan jelas. */
  async transition(id: string, dto: TransitionDto, _user: AuthUser) {
    const existing = await this.prisma.reportCard.findUnique({
      where: { id },
      select: { id: true, status: true, studentId: true, academicYear: true, semester: true },
    });
    if (!existing) throw new NotFoundException('Rapor tidak ditemukan');

    const t = TRANSITIONS[dto.action];
    if (existing.status !== t.from) {
      throw new ConflictException(
        `Aksi '${dto.action}' butuh status '${t.from}' (sekarang '${existing.status}')`,
      );
    }

    const updated = await this.prisma.reportCard.update({
      where: { id },
      data: {
        status: t.to,
        ...(t.stamp ? { [t.stamp]: new Date() } : {}),
      },
      select: REPORT_SELECT,
    });

    if (dto.action === 'distribute') {
      this.eventEmitter.emit(EVENTS.REPORT_DISTRIBUTED, {
        reportCardId: updated.id,
        studentId: existing.studentId,
        academicYear: existing.academicYear,
        semester: existing.semester,
      } satisfies ReportDistributedPayload);
    }
    return updated;
  }

  /** Catatan wali kelas — hanya saat draft (sebelum diperiksa). */
  async updateNotes(id: string, dto: UpdateNotesDto) {
    const existing = await this.prisma.reportCard.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Rapor tidak ditemukan');
    if (existing.status !== 'draft') {
      throw new ConflictException('Catatan hanya bisa diubah saat status draft');
    }
    return this.prisma.reportCard.update({
      where: { id },
      data: { notes: dto.notes },
      select: REPORT_SELECT,
    });
  }
}
