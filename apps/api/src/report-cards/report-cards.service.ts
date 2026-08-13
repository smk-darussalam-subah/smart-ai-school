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
import { PermissionsService } from '../permissions/permissions.service';
import {
  resolveGuruClassIds,
  resolveTeacherId,
} from '../common/helpers/role-helpers';
import {
  assertClassInKaprogScope,
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import { averageScores, calculateWeightedFinalScore } from '../common/helpers/grade-final-score.helper';
import { EVENTS, ReportDistributedPayload } from '../events/events.types';
import {
  GenerateReportsDto,
  ListReportsQueryDto,
  RecoverReportDto,
  TransitionDto,
  UpdateNotesDto,
} from './dto/report-card.dto';

const ELEVATED = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'WAKA_KURIKULUM'] as const;

const REPORT_SELECT = {
  id: true, studentId: true, classId: true, academicYear: true, semester: true,
  status: true, grades: true, attendance: true, notes: true,
  studentNameSnapshot: true, studentNisSnapshot: true,
  classNameSnapshot: true, homeroomTeacherNameSnapshot: true,
  generatedAt: true, checkedAt: true, checkedBy: true,
  checkedByName: true,
  returnedAt: true, returnedBy: true, returnedByName: true, returnReason: true,
  publishedAt: true, publishedBy: true, publishedByName: true,
  distributedAt: true, distributedBy: true, distributedByName: true,
  updatedAt: true,
  student: { select: { id: true, nis: true, user: { select: { fullName: true } } } },
  class: { select: { id: true, name: true } },
  statusEvents: {
    select: {
      id: true, action: true, fromStatus: true, toStatus: true, actorName: true,
      reason: true, incidentReference: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
} as const;

type ReportSnapshotDb = Pick<Prisma.TransactionClient, 'grade' | 'attendance'>;

// Transisi sah: action → { dari, ke, stempel waktu }
const TRANSITIONS: Record<
  TransitionDto['action'],
  { from: string; to: 'draft' | 'checked' | 'published' | 'distributed' }
> = {
  check:      { from: 'draft',     to: 'checked' },
  return:     { from: 'checked',   to: 'draft' },
  publish:    { from: 'checked',   to: 'published' },
  distribute: { from: 'published', to: 'distributed' },
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
    private readonly permissions: PermissionsService,
  ) {}

  private isElevated(user: AuthUser): boolean {
    return user.roles.some((r) => (ELEVATED as readonly string[]).includes(r));
  }

  /** Klausa ownership baca per role — selalu DI QUERY. */
  private async ownershipWhere(user: AuthUser): Promise<Prisma.ReportCardWhereInput> {
    if (isKaprogScopedReader(user)) {
      return { class: kaprogClassWhere(await resolveActiveKaprogMajorScope(this.prisma, user)) };
    }
    if (this.isElevated(user)) return {};

    if (user.roles.includes('GURU')) {
      const classIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
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

  private async draftManagerClassIds(user: AuthUser): Promise<Set<string> | null> {
    if (user.roles.includes('SUPER_ADMIN')) return new Set();
    if (!user.roles.includes('GURU')) return new Set();
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const classes = await this.prisma.class.findMany({
      where: { teacherId, isActive: true },
      select: { id: true },
    });
    return new Set(classes.map((item) => item.id));
  }

  async listReadableClasses(user: AuthUser) {
    let where: Prisma.ClassWhereInput = { isActive: true };
    let teacherId: string | null = null;

    if (isKaprogScopedReader(user)) {
      where = {
        ...where,
        ...kaprogClassWhere(await resolveActiveKaprogMajorScope(this.prisma, user)),
      };
    } else if (!this.isElevated(user)) {
      if (!user.roles.includes('GURU')) throw new ForbiddenException('Akses ditolak');
      const classIds = await resolveGuruClassIds(this.prisma, user.keycloakId);
      teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      where = { ...where, id: { in: classIds } };
    }
    if (teacherId === null && user.roles.includes('GURU') && !user.roles.includes('SUPER_ADMIN')) {
      teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    }

    const classes = await this.prisma.class.findMany({
      where,
      select: { id: true, name: true, teacherId: true },
      orderBy: { name: 'asc' },
    });
    return {
      data: classes.map((item) => ({
        id: item.id,
        name: item.name,
        canManageDraft: teacherId !== null && item.teacherId === teacherId,
      })),
    };
  }

  async findAll(query: ListReportsQueryDto, user: AuthUser) {
    const ownership = await this.ownershipWhere(user);
    const where: Prisma.ReportCardWhereInput = {
      ...ownership,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
      ...(query.search ? {
        OR: [
          { student: { user: { fullName: { contains: query.search, mode: 'insensitive' } } } },
          { student: { nis: { contains: query.search, mode: 'insensitive' } } },
          { class: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    if (isKaprogScopedReader(user) && query.classId) {
      await assertClassInKaprogScope(
        this.prisma,
        query.classId,
        await resolveActiveKaprogMajorScope(this.prisma, user),
      );
    }
    if (
      !this.isElevated(user) &&
      (user.roles.includes('SISWA') || user.roles.includes('ORANG_TUA'))
    ) {
      where.status = 'distributed';
    } else if (query.status) {
      where.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;
    const [data, total, manageableClassIds] = await Promise.all([
      this.prisma.reportCard.findMany({
        where,
        orderBy: [{ class: { name: 'asc' } }, { student: { nis: 'asc' } }],
        skip,
        take: query.limit,
        select: REPORT_SELECT,
      }),
      this.prisma.reportCard.count({ where }),
      this.draftManagerClassIds(user),
    ]);
    return {
      data: data.map((item) => ({
        ...item,
        canManageDraft: manageableClassIds === null || manageableClassIds.has(item.classId),
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Generate rapor massal satu kelas — idempoten (yang sudah ada dilewati). */
  async generate(dto: GenerateReportsDto, user?: AuthUser) {
    if (user) await this.assertDraftManager(dto.classId, user);
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `${dto.classId}:${dto.academicYear}:${dto.semester}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('report-card-generate'), hashtext(${lockKey}))`,
      );
      const kelas = await tx.class.findUnique({
        where: { id: dto.classId },
        select: {
          id: true,
          name: true,
          academicYear: true,
          teacher: { select: { user: { select: { fullName: true } } } },
          students: {
            where: { status: 'active', deletedAt: null },
            select: { id: true, nis: true, user: { select: { fullName: true } } },
          },
        },
      });
      if (!kelas) throw new NotFoundException('Kelas tidak ditemukan');
      if (kelas.academicYear !== dto.academicYear) {
        throw new BadRequestException('Tahun ajaran rapor harus sama dengan tahun ajaran kelas');
      }
      if (kelas.students.length === 0) {
        throw new BadRequestException('Kelas tidak memiliki siswa aktif');
      }

      const existing = await tx.reportCard.findMany({
        where: {
          academicYear: dto.academicYear,
          semester: dto.semester,
          studentId: { in: kelas.students.map((student) => student.id) },
        },
        select: { id: true, studentId: true, status: true },
      });
      const existingByStudent = new Map(existing.map((item) => [item.studentId, item]));

      let generated = 0;
      let refreshed = 0;
      let skipped = 0;
      for (const student of kelas.students) {
        const current = existingByStudent.get(student.id);
        if (current && current.status !== 'draft') {
          skipped++;
          continue;
        }
        const [grades, attendance] = await Promise.all([
          this.buildGradeSnapshot(tx, student.id, dto.classId, dto.academicYear, dto.semester),
          this.buildAttendanceSnapshot(tx, student.id, dto.classId, dto.academicYear, dto.semester),
        ]);
        const data = {
          studentId: student.id,
          classId: dto.classId,
          academicYear: dto.academicYear,
          semester: dto.semester,
          grades: grades as unknown as Prisma.InputJsonValue,
          attendance: attendance as Prisma.InputJsonValue,
          studentNameSnapshot: student.user.fullName,
          studentNisSnapshot: student.nis,
          classNameSnapshot: kelas.name,
          homeroomTeacherNameSnapshot: kelas.teacher?.user.fullName ?? null,
        };
        if (current) {
          const changed = await tx.reportCard.updateMany({
            where: { id: current.id, status: 'draft' },
            data,
          });
          if (changed.count === 1) refreshed++;
          else skipped++;
        } else {
          await tx.reportCard.create({ data });
          generated++;
        }
      }

      return { generated, refreshed, skipped, totalStudents: kelas.students.length };
    });
  }

  private async buildGradeSnapshot(
    db: ReportSnapshotDb,
    studentId: string,
    classId: string,
    academicYear: string,
    semester: number,
  ): Promise<SubjectSnapshot[]> {
    const grades = await db.grade.findMany({
      where: { studentId, academicYear, semester, assignment: { classId } },
      select: { score: true, type: true, assignment: { select: { subject: true } } },
    });

    const bySubject = new Map<string, { count: number; byType: Map<string, number[]> }>();
    for (const g of grades) {
      const subject = g.assignment.subject;
      const entry =
        bySubject.get(subject) ??
        { count: 0, byType: new Map<string, number[]>() };
      const score = Number(g.score);
      entry.count++;
      const typeArr = entry.byType.get(g.type) ?? [];
      typeArr.push(score);
      entry.byType.set(g.type, typeArr);
      bySubject.set(subject, entry);
    }

    return [...bySubject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subject, e]) => ({
        subject,
        count: e.count,
        average: calculateWeightedFinalScore(e.byType),
        byType: Object.fromEntries([...e.byType.entries()].map(([type, scores]) => [type, averageScores(scores)])),
      }));
  }

  private async buildAttendanceSnapshot(
    db: ReportSnapshotDb,
    studentId: string,
    classId: string,
    academicYear: string,
    semester: number,
  ): Promise<Record<string, number>> {
    const { from, to } = this.semesterDateRange(academicYear, semester);
    const grouped = await db.attendance.groupBy({
      by: ['status'],
      where: { studentId, classId, date: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const result: Record<string, number> = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    for (const g of grouped) result[g.status] = g._count._all;
    return result;
  }

  private semesterDateRange(academicYear: string, semester: number): { from: Date; to: Date } {
    const match = /^(\d{4})\/(\d{4})$/.exec(academicYear);
    if (!match || Number(match[2]) !== Number(match[1]) + 1 || ![1, 2].includes(semester)) {
      throw new BadRequestException('Tahun ajaran atau semester tidak valid');
    }
    const firstYear = Number(match[1]);
    const secondYear = Number(match[2]);
    return semester === 1
      ? { from: new Date(Date.UTC(firstYear, 6, 1)), to: new Date(Date.UTC(firstYear, 11, 31, 23, 59, 59, 999)) }
      : { from: new Date(Date.UTC(secondYear, 0, 1)), to: new Date(Date.UTC(secondYear, 5, 30, 23, 59, 59, 999)) };
  }

  /** Transisi status sesuai pipeline; aksi tidak sah → 409 dengan pesan jelas. */
  async transition(id: string, dto: TransitionDto, user: AuthUser) {
    await this.assertTransitionAuthority(dto.action, user);
    const actor = await this.prisma.user.findUnique({
      where: { keycloakId: user.keycloakId },
      select: { fullName: true },
    });
    const actorName = actor?.fullName ?? user.username;
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

    const updateData: Prisma.ReportCardUpdateManyMutationInput = {
        status: t.to,
        ...(dto.action === 'check' ? {
          checkedAt: new Date(),
          checkedBy: user.keycloakId,
          checkedByName: actorName,
          returnedAt: null,
          returnedBy: null,
          returnedByName: null,
          returnReason: null,
        } : {}),
        ...(dto.action === 'return' ? {
          checkedAt: null,
          checkedBy: null,
          checkedByName: null,
          returnedAt: new Date(),
          returnedBy: user.keycloakId,
          returnedByName: actorName,
          returnReason: dto.reason,
        } : {}),
        ...(dto.action === 'publish' ? {
          publishedAt: new Date(),
          publishedBy: user.keycloakId,
          publishedByName: actorName,
        } : {}),
        ...(dto.action === 'distribute' ? {
          distributedAt: new Date(),
          distributedBy: user.keycloakId,
          distributedByName: actorName,
        } : {}),
    };
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.reportCard.updateMany({
        where: { id, status: existing.status },
        data: updateData,
      });
      if (changed.count !== 1) {
        throw new ConflictException('Status rapor berubah. Muat ulang data sebelum mengambil keputusan.');
      }
      await tx.reportCardStatusEvent.create({
        data: {
          reportCardId: id,
          action: dto.action,
          fromStatus: existing.status,
          toStatus: t.to,
          actorId: user.keycloakId,
          actorName,
          reason: dto.reason ?? null,
        },
      });
      const result = await tx.reportCard.findUnique({ where: { id }, select: REPORT_SELECT });
      if (!result) throw new NotFoundException('Rapor tidak ditemukan setelah transisi');
      return result;
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

  private async assertTransitionAuthority(action: TransitionDto['action'], user: AuthUser): Promise<void> {
    const requiredPermission = action === 'check' || action === 'return'
      ? 'report.review'
      : action === 'publish'
        ? 'report.publish'
        : 'report.distribute';
    if (!await this.permissions.hasPermission(user.keycloakId, user.roles, requiredPermission)) {
      throw new ForbiddenException(`Permission '${requiredPermission}' diperlukan untuk aksi ini`);
    }

    const isSuperAdmin = user.roles.includes('SUPER_ADMIN');
    if (isSuperAdmin) {
      if (action === 'publish' || action === 'distribute') return;
      throw new ForbiddenException('Pemeriksaan dan pengembalian rapor hanya untuk Waka Kurikulum');
    }

    const activePositions = await this.permissions.getActivePositionCodes(user.keycloakId);
    const isCurriculumDeputy = activePositions.has('WAKA_KURIKULUM');
    const isPrincipal = activePositions.has('KEPALA_SEKOLAH');
    const isAdministration = user.roles.includes('TATA_USAHA');
    const allowed = action === 'check' || action === 'return'
      ? isCurriculumDeputy
      : action === 'publish'
        ? isPrincipal
        : isPrincipal || isAdministration;
    if (!allowed) {
      throw new ForbiddenException(`Aktor tidak berwenang menjalankan aksi '${action}' pada rapor`);
    }
  }

  /** Administrative recovery is isolated from the pedagogical workflow. */
  async recover(id: string, dto: RecoverReportDto, user: AuthUser) {
    if (!user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Pemulihan rapor hanya untuk Super Admin');
    }
    const actor = await this.prisma.user.findUnique({
      where: { keycloakId: user.keycloakId },
      select: { fullName: true },
    });
    const actorName = actor?.fullName ?? user.username;
    const existing = await this.prisma.reportCard.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Rapor tidak ditemukan');
    if (existing.status === 'draft') {
      throw new ConflictException('Rapor sudah berstatus draft dan tidak memerlukan pemulihan');
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.reportCard.updateMany({
        where: { id, status: existing.status },
        data: {
          status: 'draft',
          checkedAt: null,
          checkedBy: null,
          checkedByName: null,
          returnedAt: null,
          returnedBy: null,
          returnedByName: null,
          returnReason: null,
          publishedAt: null,
          publishedBy: null,
          publishedByName: null,
          distributedAt: null,
          distributedBy: null,
          distributedByName: null,
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Status rapor berubah. Muat ulang sebelum melakukan pemulihan.');
      }
      await tx.reportCardStatusEvent.create({
        data: {
          reportCardId: id,
          action: 'recover',
          fromStatus: existing.status,
          toStatus: 'draft',
          actorId: user.keycloakId,
          actorName,
          reason: dto.reason,
          incidentReference: dto.incidentReference,
        },
      });
      const recovered = await tx.reportCard.findUnique({ where: { id }, select: REPORT_SELECT });
      if (!recovered) throw new NotFoundException('Rapor tidak ditemukan setelah pemulihan');
      return recovered;
    });
  }

  /** Catatan wali kelas — hanya saat draft (sebelum diperiksa). */
  async updateNotes(id: string, dto: UpdateNotesDto, user?: AuthUser) {
    if (user) this.assertRoutineReportOperator(user);
    const existing = await this.prisma.reportCard.findUnique({
      where: { id },
      select: { id: true, status: true, classId: true },
    });
    if (!existing) throw new NotFoundException('Rapor tidak ditemukan');
    if (user) await this.assertDraftManager(existing.classId, user);
    if (existing.status !== 'draft') {
      throw new ConflictException('Catatan hanya bisa diubah saat status draft');
    }
    const nextUpdatedAt = new Date(Math.max(Date.now(), dto.expectedUpdatedAt.getTime() + 1));
    const changed = await this.prisma.reportCard.updateMany({
      where: { id, status: 'draft', updatedAt: dto.expectedUpdatedAt },
      data: { notes: dto.notes, updatedAt: nextUpdatedAt },
    });
    if (changed.count !== 1) {
      throw new ConflictException('Rapor telah berubah. Muat ulang sebelum menyimpan catatan.');
    }
    const updated = await this.prisma.reportCard.findUnique({ where: { id }, select: REPORT_SELECT });
    if (!updated) throw new NotFoundException('Rapor tidak ditemukan setelah catatan diperbarui');
    return updated;
  }

  private async assertDraftManager(classId: string, user: AuthUser): Promise<void> {
    this.assertRoutineReportOperator(user);
    const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
    const waliClass = await this.prisma.class.findFirst({
      where: { id: classId, teacherId, isActive: true },
      select: { id: true },
    });
    if (!waliClass) {
      throw new ForbiddenException('Hanya wali kelas yang dapat menyiapkan draft rapor kelas ini');
    }
  }

  private assertRoutineReportOperator(user: AuthUser): void {
    if (user.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Super Admin hanya dapat memakai jalur pemulihan administratif rapor');
    }
    if (!user.roles.includes('GURU')) throw new ForbiddenException('Akses ditolak');
  }

  // ── Rapor Section Endpoints (P23) ──────────────────────────────────────

  /** Section B — Muatan Lokal grades for a student */
  private async findOfficialSectionSnapshot(
    studentId: string,
    year: string,
    semester: number,
    user: AuthUser,
  ) {
    const ownership = await this.ownershipWhere(user);
    const family = user.roles.includes('SISWA') || user.roles.includes('ORANG_TUA');
    const report = await this.prisma.reportCard.findFirst({
      where: {
        ...ownership,
        studentId,
        academicYear: year,
        semester,
        ...(family ? { status: 'distributed' as const } : {}),
      },
      select: {
        id: true,
        status: true,
        grades: true,
        attendance: true,
        studentNameSnapshot: true,
        studentNisSnapshot: true,
        classNameSnapshot: true,
        homeroomTeacherNameSnapshot: true,
        publishedAt: true,
        publishedByName: true,
      },
    });
    if (!report) {
      throw new ForbiddenException(
        family ? 'Rapor belum dibagikan untuk periode ini' : 'Rapor tidak tersedia dalam lingkup akses Anda',
      );
    }
    return report;
  }

  private officialSectionsFromSnapshot(
    report: Awaited<ReturnType<ReportCardsService['findOfficialSectionSnapshot']>>,
    year: string,
    semester: number,
  ) {
    const grades = Array.isArray(report.grades)
      ? (report.grades as unknown as SubjectSnapshot[]).filter((item) =>
          typeof item?.subject === 'string' && Number.isFinite(item.average))
      : [];
    const attendanceValue = report.attendance && typeof report.attendance === 'object' && !Array.isArray(report.attendance)
      ? report.attendance as Record<string, unknown>
      : {};
    const attendance = {
      hadir: Number(attendanceValue.hadir ?? 0),
      izin: Number(attendanceValue.izin ?? 0),
      sakit: Number(attendanceValue.sakit ?? 0),
      alpha: Number(attendanceValue.alpha ?? 0),
    };
    const total = attendance.hadir + attendance.izin + attendance.sakit + attendance.alpha;
    const scores = grades.map((grade) => grade.average);
    const average = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;
    const academicLevel = average === null
      ? '-'
      : average >= 85 ? 'Sangat Baik' : average >= 75 ? 'Baik' : average >= 60 ? 'Cukup' : 'Perlu Bimbingan';
    const description = average === null
      ? 'Belum ada data nilai pada snapshot rapor ini.'
      : `Siswa menunjukkan perkembangan akademik ${academicLevel.toLowerCase()} dengan rata-rata nilai akhir ${Math.round(average)}. Semangat belajar perlu dipertahankan dan ditingkatkan untuk mencapai hasil yang lebih optimal.`;

    return {
      reportCardId: report.id,
      snapshotStatus: report.status,
      identity: {
        studentName: report.studentNameSnapshot ?? '-',
        nis: report.studentNisSnapshot ?? '-',
      },
      muatanLokal: {
        subjects: grades
          .filter((grade) => grade.subject.toLowerCase().includes('muatan lokal'))
          .map((grade) => ({
            name: grade.subject,
            na: grade.average,
            kktp: 75,
            predikat: grade.average >= 75 ? 'Tuntas' : 'Belum Tuntas',
          })),
      },
      attendance: { ...attendance, total },
      development: { description, spiritual: '-', social: '-', academic: academicLevel },
      approval: {
        homeroomTeacher: report.homeroomTeacherNameSnapshot ?? '-',
        principal: report.publishedByName ?? '-',
        approvedAt: report.publishedAt,
        schoolYear: year,
        semester,
        className: report.classNameSnapshot ?? '-',
      },
    };
  }

  async findOfficialSections(studentId: string, year: string, semester: number, user: AuthUser) {
    const report = await this.findOfficialSectionSnapshot(studentId, year, semester, user);
    return this.officialSectionsFromSnapshot(report, year, semester);
  }

  async findMuatanLokal(studentId: string, year: string, semester: number, user: AuthUser) {
    return (await this.findOfficialSections(studentId, year, semester, user)).muatanLokal;
  }

  /** Section D — Ketidakhadiran summary for a student */
  async findAttendanceSummary(studentId: string, year: string, semester: number, user: AuthUser) {
    return (await this.findOfficialSections(studentId, year, semester, user)).attendance;
  }

  /** Section F — Deskripsi Perkembangan (auto-generated from grade trends) */
  async findDevelopmentDescription(studentId: string, year: string, semester: number, user: AuthUser) {
    return (await this.findOfficialSections(studentId, year, semester, user)).development;
  }

  /** Section G — Pengesahan (homeroom teacher + principal info) */
  async findApproval(studentId: string, year: string, semester: number, user: AuthUser) {
    return (await this.findOfficialSections(studentId, year, semester, user)).approval;
  }
}
