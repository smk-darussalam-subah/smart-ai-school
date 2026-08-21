import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '@smk/auth';
import { AcademicPeriodIdentity, AcademicPeriodService, NextPeriodIdentity } from '../academic-period/academic-period.service';
import {
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';
import { resolveTeacherId } from '../common/helpers/role-helpers';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveKktpThreshold } from '../academic/kktp-resolver';
import { CloseSemesterDto, SemesterClosingQueryDto } from './dto/semester-closing.dto';

const READINESS_VERSION = 'wave7.v1';
const CLOSE_CONFIRMATION = 'TUTUP SEMESTER';
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

type ReadinessItem = {
  code: string;
  owner: string;
  count: number;
  action: string;
  message: string;
};

type ReadinessMetric = {
  code: string;
  label: string;
  value: number;
  total?: number;
};

type AssignmentSource = 'schedule' | 'rpp' | 'lms' | 'assessment';

type AssignmentCoverage = {
  id?: string;
  teacherId: string;
  classId: string;
  subject: string;
  academicYear: string;
  sources: Set<AssignmentSource>;
};

type CurriculumMapping = {
  cpCount: number;
  tpCount: number;
  atpCount: number;
  cpStatus: 'terisi' | 'belum_terisi';
  tpRefs: string[];
  mappedAtpCount: number;
  unmappedAtpCount: number;
  invalidReasonCodes: string[];
};

type FinalGradeEntry = {
  studentId: string;
  classId: string;
  subject: string;
  score: number;
  kktp: number;
  kktpProvenance: string;
};

type SemesterFinalReport = {
  classHeatmap: Array<{
    className: string;
    majorCode: string | null;
    activeStudents: number;
    distributedReports: number;
    gradeRecords: number;
    averageScore: number | null;
    belowKktpCount: number;
  }>;
  majorHeatmap: Array<{
    majorCode: string;
    activeStudents: number;
    distributedReports: number;
    gradeRecords: number;
    averageScore: number | null;
    belowKktpCount: number;
  }>;
  subjectKktp: Array<{
    subject: string;
    kktp: number | null;
    provenance: string;
    gradeRecords: number;
    belowKktpCount: number;
    passRate: number | null;
  }>;
  curriculumMap: Array<{
    className: string;
    subject: string;
    cpCount: number;
    tpCount: number;
    atpCount: number;
    cpStatus: 'terisi' | 'belum_terisi';
    tpRefs: string[];
    mappedAtpCount: number;
    unmappedAtpCount: number;
    invalidReasonCodes: string[];
  }>;
};

type ReadScope =
  | { kind: 'school'; classWhere: Prisma.ClassWhereInput; teacherId?: undefined; majorCodes?: undefined }
  | { kind: 'major'; classWhere: Prisma.ClassWhereInput; teacherId?: undefined; majorCodes: string[] }
  | { kind: 'teacher'; classWhere: Prisma.ClassWhereInput; teacherId: string; majorCodes?: undefined };

type ReadinessSnapshot = {
  readinessVersion: string;
  period: {
    academicYearId: string;
    academicYear: string;
    semesterId: string;
    semester: number;
    startDate: string;
    endDate: string;
  };
  nextPeriod: null | {
    academicYearId: string;
    academicYear: string;
    semesterId: string;
    semester: number;
    startDate: string;
    endDate: string;
  };
  scope: {
    kind: ReadScope['kind'];
    majorCodes?: string[];
  };
  metrics: ReadinessMetric[];
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  finalReport: SemesterFinalReport;
};

type StoredClosureSnapshot = ReadinessSnapshot & {
  majorSnapshots?: ReadinessSnapshot[];
  closure?: {
    actorUserId: string;
    closeRequestFingerprint: string;
    idempotencyKeyHash: string;
  };
};

type ReadinessResponse = ReadinessSnapshot & {
  ready: boolean;
  readinessHash: string;
  generatedAt: string;
  closedAt: Date | null;
};

@Injectable()
export class SemesterClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly period: AcademicPeriodService,
    private readonly permissions: PermissionsService,
  ) {}

  async readiness(query: SemesterClosingQueryDto, user: AuthUser): Promise<ReadinessResponse> {
    const target = query.semesterId
      ? await this.findPeriodBySemesterId(query.semesterId, this.prisma)
      : await this.period.getActivePeriod(this.prisma);
    await this.assertCanRead(user, target);
    const scope = await this.resolveScope(user, target);
    return this.computeReadiness(target, scope, this.prisma);
  }

  async close(dto: CloseSemesterDto, user: AuthUser) {
    if (dto.confirmation !== CLOSE_CONFIRMATION) {
      throw new BadRequestException('Konfirmasi penutupan semester tidak valid.');
    }
    await this.period.assertPrincipalCloseAuthority(user);
    const userRecord = await this.prisma.user.findUnique({
      where: { keycloakId: user.keycloakId },
      select: { id: true },
    });
    if (!userRecord) throw new ForbiddenException('Akun penutup semester tidak ditemukan.');

    const payloadFingerprint = this.period.sha256({
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId ?? null,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash.toLowerCase(),
      confirmation: dto.confirmation,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.period.acquireCutoverLock(tx);
        const existingByKey = await tx.semesterClosure.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          select: {
            id: true,
            snapshot: true,
            closedAt: true,
            semesterId: true,
            nextSemesterId: true,
            readinessVersion: true,
            readinessHash: true,
            semester: {
              select: {
                number: true,
                academicYear: { select: { code: true } },
              },
            },
            closedBy: { select: { fullName: true } },
          },
        });
        if (existingByKey) {
          const existingFingerprint = this.extractCloseFingerprint(existingByKey.snapshot);
          if (existingFingerprint !== payloadFingerprint) {
            throw new ConflictException('Idempotency key sudah dipakai untuk payload penutupan semester yang berbeda.');
          }
          return this.toPublicClosure(existingByKey);
        }

        const active = await this.period.getActivePeriod(tx);
        if (active.semesterId !== dto.semesterId) {
          throw new ConflictException('Hanya semester aktif saat ini yang dapat ditutup.');
        }
        const nextPeriod = await this.period.findNextPeriodForClose(active, dto.nextSemesterId ?? null, tx);

        const existingClosure = await tx.semesterClosure.findUnique({
          where: { semesterId: dto.semesterId },
          select: { id: true, closedAt: true },
        });
        if (existingClosure) {
          throw new ConflictException('Semester ini sudah ditutup.');
        }

        const schoolScope: ReadScope = { kind: 'school', classWhere: { isActive: true, academicYear: active.academicYear } };
        const readiness = await this.computeReadiness(active, schoolScope, tx, nextPeriod);
        if (readiness.readinessVersion !== dto.readinessVersion || readiness.readinessHash !== dto.readinessHash.toLowerCase()) {
          throw new ConflictException({
            code: 'READINESS_HASH_STALE',
            message: 'Readiness berubah. Muat ulang preview sebelum menutup semester.',
            latest: readiness,
          });
        }
        if (!readiness.ready) {
          throw new ConflictException({
            code: 'SEMESTER_NOT_READY',
            message: 'Semester belum siap ditutup.',
            blockers: readiness.blockers,
          });
        }

        const majorSnapshots = await this.computeMajorSnapshots(active, tx, nextPeriod);

        const closeSnapshot: StoredClosureSnapshot = {
          ...this.toSnapshot(readiness),
          majorSnapshots,
          closure: {
            actorUserId: userRecord.id,
            closeRequestFingerprint: payloadFingerprint,
            idempotencyKeyHash: this.period.sha256(dto.idempotencyKey),
          },
        };

        const closure = await tx.semesterClosure.create({
          data: {
            academicYearId: active.academicYearId,
            semesterId: active.semesterId,
            nextSemesterId: nextPeriod?.semesterId ?? null,
            closedByUserId: userRecord.id,
            readinessVersion: readiness.readinessVersion,
            readinessHash: readiness.readinessHash,
            idempotencyKey: dto.idempotencyKey,
            snapshot: closeSnapshot as unknown as Prisma.InputJsonValue,
          },
          select: {
            id: true,
            snapshot: true,
            closedAt: true,
            semesterId: true,
            nextSemesterId: true,
            readinessVersion: true,
            readinessHash: true,
            semester: {
              select: {
                number: true,
                academicYear: { select: { code: true } },
              },
            },
            closedBy: { select: { fullName: true } },
          },
        });

        const closed = await tx.semester.updateMany({
          where: { id: active.semesterId, isActive: true },
          data: { isActive: false },
        });
        if (closed.count !== 1) {
          throw new ConflictException('Semester aktif berubah saat proses close berjalan.');
        }
        if (nextPeriod) {
          const opened = await tx.semester.updateMany({
            where: { id: nextPeriod.semesterId, isActive: false },
            data: { isActive: true },
          });
          if (opened.count !== 1) {
            throw new ConflictException('Semester berikutnya berubah saat proses close berjalan.');
          }
        }
        return this.toPublicClosure(closure);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const existingByKey = await this.findClosureByIdempotencyKey(dto.idempotencyKey);
      if (existingByKey) {
        const existingFingerprint = this.extractCloseFingerprint(existingByKey.snapshot);
        if (existingFingerprint === payloadFingerprint) {
          return this.toPublicClosure(existingByKey);
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('Idempotency key sudah dipakai untuk payload penutupan semester yang berbeda.');
        }
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Penutupan semester sudah diproses oleh request lain.');
      }
      throw error;
    } finally {
      this.permissions.invalidateAll();
    }
  }

  private findClosureByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.semesterClosure.findUnique({
      where: { idempotencyKey },
      select: {
        id: true,
        snapshot: true,
        closedAt: true,
        semesterId: true,
        nextSemesterId: true,
        readinessVersion: true,
        readinessHash: true,
        semester: {
          select: {
            number: true,
            academicYear: { select: { code: true } },
          },
        },
        closedBy: { select: { fullName: true } },
      },
    });
  }

  async listClosures(user: AuthUser) {
    await this.assertCanReadFinalReport(user);
    const rows = await this.prisma.semesterClosure.findMany({
      orderBy: { closedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        closedAt: true,
        readinessVersion: true,
        readinessHash: true,
        semester: {
          select: {
            number: true,
            academicYear: { select: { code: true } },
          },
        },
        closedBy: { select: { fullName: true } },
      },
    });
    return { data: rows };
  }

  async closureDetail(id: string, user: AuthUser) {
    await this.assertCanReadFinalReport(user);
    const closure = await this.prisma.semesterClosure.findUnique({
      where: { id },
      select: {
        id: true,
        closedAt: true,
        semesterId: true,
        nextSemesterId: true,
        readinessVersion: true,
        readinessHash: true,
        snapshot: true,
        semester: {
          select: {
            number: true,
            academicYear: { select: { code: true } },
          },
        },
        closedBy: { select: { fullName: true } },
      },
    });
    if (!closure) throw new NotFoundException('Snapshot penutupan semester tidak ditemukan.');
    return this.toPublicClosure(await this.filterSnapshotForUser(closure, user));
  }

  async exportClosureCsv(id: string, user: AuthUser): Promise<string> {
    const detail = await this.closureDetail(id, user);
    const snapshot = detail.snapshot as ReadinessSnapshot;
    const rows = [
      ['section', 'code', 'label', 'value', 'total', 'owner', 'message'],
      ...snapshot.metrics.map((metric) => [
        'metric',
        metric.code,
        metric.label,
        String(metric.value),
        metric.total === undefined ? '' : String(metric.total),
        '',
        '',
      ]),
      ...snapshot.blockers.map((item) => ['blocker', item.code, '', String(item.count), '', item.owner, item.message]),
      ...snapshot.warnings.map((item) => ['warning', item.code, '', String(item.count), '', item.owner, item.message]),
      ...snapshot.finalReport.classHeatmap.map((row) => [
        'class_heatmap',
        row.className,
        row.majorCode ?? '',
        String(row.activeStudents),
        String(row.distributedReports),
        '',
        `nilai=${row.gradeRecords}; rata=${row.averageScore ?? ''}; bawah_kktp=${row.belowKktpCount}`,
      ]),
      ...snapshot.finalReport.majorHeatmap.map((row) => [
        'major_heatmap',
        row.majorCode,
        '',
        String(row.activeStudents),
        String(row.distributedReports),
        '',
        `nilai=${row.gradeRecords}; rata=${row.averageScore ?? ''}; bawah_kktp=${row.belowKktpCount}`,
      ]),
      ...snapshot.finalReport.subjectKktp.map((row) => [
        'subject_kktp',
        row.subject,
        row.provenance,
        row.kktp === null ? '' : String(row.kktp),
        row.passRate === null ? '' : String(row.passRate),
        '',
        `nilai=${row.gradeRecords}; bawah_kktp=${row.belowKktpCount}`,
      ]),
      ...snapshot.finalReport.curriculumMap.map((row) => [
        'curriculum_map',
        row.className,
        row.subject,
        row.cpStatus,
        row.tpRefs.join('|'),
        '',
        `tp=${row.tpCount}; atp_terpetakan=${row.mappedAtpCount}; atp_belum=${row.unmappedAtpCount}; invalid=${row.invalidReasonCodes.join('|')}`,
      ]),
    ];
    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\r\n');
  }

  private async computeReadiness(
    target: AcademicPeriodIdentity,
    scope: ReadScope,
    db: PrismaService | Prisma.TransactionClient,
    forcedNext?: NextPeriodIdentity | null,
  ): Promise<ReadinessResponse> {
    const blockers: ReadinessItem[] = [];
    const warnings: ReadinessItem[] = [];
    const metrics: ReadinessMetric[] = [];
    const classWhere: Prisma.ClassWhereInput = {
      ...scope.classWhere,
      academicYear: target.academicYear,
      isActive: true,
    };
    const classes = await db.class.findMany({
      where: classWhere,
      select: {
        id: true,
        name: true,
        majorCode: true,
        _count: { select: { students: { where: { status: 'active', deletedAt: null } } } },
      },
      orderBy: [{ grade: 'asc' }, { name: 'asc' }],
    });
    const classIds = classes.map((kelas) => kelas.id);
    const classIdSet = new Set(classIds);
    const activeStudentTotal = classes.reduce((sum, kelas) => sum + kelas._count.students, 0);
    const periodClasses = await db.class.findMany({
      where: { academicYear: target.academicYear },
      select: { id: true, name: true, isActive: true, majorCode: true },
    });
    const periodClassById = new Map(periodClasses.map((kelas) => [kelas.id, kelas]));

    const targetClosed = await db.semesterClosure.findUnique({
      where: { semesterId: target.semesterId },
      select: { closedAt: true },
    });
    if (targetClosed) {
      blockers.push({
        code: 'PERIOD_ALREADY_CLOSED',
        owner: 'Kepala Sekolah',
        count: 1,
        action: 'view_closure',
        message: 'Semester target sudah memiliki snapshot penutupan.',
      });
    }

    const nextPeriod = forcedNext ?? await this.period.findNextPeriodForClose(target, null, db).catch(() => null);
    if (target.semester === 1 && !nextPeriod) {
      blockers.push({
        code: 'NEXT_SEMESTER_MISSING',
        owner: 'Super Admin',
        count: 1,
        action: 'configure_next_semester',
        message: 'Semester 2 harus tersedia sebelum Semester 1 ditutup.',
      });
    }
    const overlappingSemesters = await db.semester.count({
      where: {
        id: { not: target.semesterId },
        startDate: { lte: target.endDate },
        endDate: { gte: target.startDate },
      },
    });
    if (overlappingSemesters > 0) {
      blockers.push({
        code: 'PERIOD_DATE_OVERLAP',
        owner: 'Super Admin',
        count: overlappingSemesters,
        action: 'configure_next_semester',
        message: 'Rentang tanggal semester saling bertumpuk dan harus dibereskan sebelum close.',
      });
    }

    metrics.push(
      { code: 'active_classes', label: 'Kelas aktif', value: classes.length },
      { code: 'active_students', label: 'Siswa aktif', value: activeStudentTotal },
    );

    const teachingWhere: Prisma.TeachingAssignmentWhereInput = {
      academicYear: target.academicYear,
      ...(classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID }),
      ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
    };
    const teachingAssignments = await db.teachingAssignment.findMany({
      where: teachingWhere,
      select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true },
    });
    const teachingByKey = new Map(teachingAssignments.map((assignment) => [this.assignmentKey(assignment), assignment]));
    const assignmentCoverage = new Map<string, AssignmentCoverage>();
    const unmappedSources: ReadinessItem[] = [];
    const sourceIssues: ReadinessItem[] = [];
    const addExpectedAssignment = (
      source: AssignmentSource,
      item: { teacherId: string; classId: string | null; subject: string; academicYear: string },
      label: string,
    ) => {
      const subject = item.subject.trim();
      if (!item.classId) {
        sourceIssues.push({
          code: 'ASSIGNMENT_SOURCE_MISSING_CLASS',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} belum memiliki kelas target.`,
        });
        return;
      }
      if (!subject) {
        sourceIssues.push({
          code: 'ASSIGNMENT_SOURCE_MISSING_SUBJECT',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} belum memiliki mapel.`,
        });
        return;
      }
      const sourceClass = periodClassById.get(item.classId);
      if (!sourceClass) {
        sourceIssues.push({
          code: 'ASSIGNMENT_SOURCE_OUT_OF_PERIOD',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} mengarah ke kelas di luar tahun ajaran target.`,
        });
        return;
      }
      if (!sourceClass.isActive) {
        sourceIssues.push({
          code: 'ASSIGNMENT_SOURCE_INACTIVE_CLASS',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} mengarah ke kelas nonaktif.`,
        });
        return;
      }
      if (!classIdSet.has(item.classId)) {
        sourceIssues.push({
          code: 'ASSIGNMENT_SOURCE_OUT_OF_SCOPE',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} berada di luar scope penutupan semester.`,
        });
        return;
      }
      const key = this.assignmentKey({ ...item, classId: item.classId });
      const teaching = teachingByKey.get(key);
      if (!teaching) {
        unmappedSources.push({
          code: 'ASSIGNMENT_SOURCE_UNMAPPED',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'review_teaching_assignments',
          message: `${label} belum memiliki TeachingAssignment aktif yang cocok.`,
        });
        return;
      }
      const existing = assignmentCoverage.get(key);
      if (existing) {
        existing.sources.add(source);
        return;
      }
      assignmentCoverage.set(key, {
        id: teaching.id,
        teacherId: teaching.teacherId,
        classId: teaching.classId,
        subject: teaching.subject,
        academicYear: teaching.academicYear,
        sources: new Set([source]),
      });
    };

    const scheduledAssignments = await db.teachingAssignment.findMany({
      where: {
        academicYear: target.academicYear,
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        ...(scope.kind === 'major' ? (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID }) : {}),
        schedules: { some: { semester: target.semester } },
      },
      select: { id: true, teacherId: true, classId: true, subject: true, academicYear: true },
    });
    scheduledAssignments.forEach((assignment) => addExpectedAssignment('schedule', assignment, `Jadwal ${assignment.subject}`));

    const approvedRpps = await db.rpp.findMany({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        status: 'approved',
        archivedAt: null,
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        ...(scope.kind === 'major' ? (classIds.length > 0 ? { OR: [{ classId: { in: classIds } }, { classId: null }] } : { classId: null }) : {}),
      },
      select: { teacherId: true, classId: true, subject: true, academicYear: true, body: true, class: { select: { name: true } } },
    });
    approvedRpps.forEach((rpp) => addExpectedAssignment('rpp', rpp, `Modul Ajar ${rpp.subject}`));
    const curriculumRows = approvedRpps.map((rpp) => ({
      subject: rpp.subject,
      className: rpp.class?.name ?? 'Tanpa kelas',
      mapping: this.curriculumMapping(rpp.body),
    }));
    const invalidCurriculumRows = curriculumRows.filter((row) => row.mapping.invalidReasonCodes.length > 0);
    if (invalidCurriculumRows.length > 0) {
      blockers.push({
        code: 'CURRICULUM_MAPPING_INVALID',
        owner: 'Guru/Waka Kurikulum/Kepala Sekolah',
        count: invalidCurriculumRows.length,
        action: 'complete_rpp_review',
        message: 'Pemetaan CP/TP/ATP pada Modul Ajar approved belum valid atau belum lengkap.',
      });
    }
    const approvedRppKeys = new Set(
      approvedRpps.filter((rpp) => rpp.classId).map((rpp) => this.assignmentKey({ ...rpp, classId: rpp.classId! })),
    );
    const lmsModulesForCoverage = await db.lmsModule.findMany({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        ...(scope.kind === 'major' ? (classIds.length > 0 ? { OR: [{ classId: { in: classIds } }, { classId: null }] } : { classId: null }) : {}),
      },
      select: { teacherId: true, classId: true, subject: true, academicYear: true, status: true },
    });
    lmsModulesForCoverage.forEach((module) => addExpectedAssignment('lms', module, `LMS ${module.subject}`));
    const assessmentSessionsForCoverage = await db.assessmentSession.findMany({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        ...(scope.kind === 'major' ? (classIds.length > 0 ? { OR: [{ classId: { in: classIds } }, { classId: null }] } : { classId: null }) : {}),
      },
      select: {
        teacherId: true,
        classId: true,
        academicYear: true,
        module: { select: { subject: true } },
        teachingAssignment: { select: { subject: true } },
      },
    });
    assessmentSessionsForCoverage.forEach((session) => {
      const subject = session.teachingAssignment?.subject ?? session.module?.subject;
      if (!subject) {
        addExpectedAssignment('assessment', { ...session, subject: '' }, 'Asesmen tanpa mapel');
        return;
      }
      addExpectedAssignment('assessment', { ...session, subject }, `Asesmen ${subject}`);
    });
    if (sourceIssues.length > 0) {
      for (const item of this.aggregateReadinessItems(sourceIssues)) blockers.push(item);
    }
    if (unmappedSources.length > 0) {
      blockers.push({
        code: 'ASSIGNMENT_SOURCE_UNMAPPED',
        owner: 'Waka Kurikulum/Kepala Sekolah',
        count: unmappedSources.length,
        action: 'review_teaching_assignments',
        message: 'Ada aktivitas jadwal/RPP/LMS/asesmen yang tidak memiliki TeachingAssignment aktif yang cocok.',
      });
    }
    const assignmentKeys = [...assignmentCoverage.keys()].sort();
    const missingApprovedRpp = assignmentKeys.filter((key) => !approvedRppKeys.has(key)).length;
    if (missingApprovedRpp > 0) {
      blockers.push({
        code: 'RPP_APPROVED_MISSING',
        owner: 'Guru/Waka Kurikulum/Kepala Sekolah',
        count: missingApprovedRpp,
        action: 'complete_rpp_review',
        message: 'Assignment dari jadwal/RPP/LMS/asesmen belum memiliki Modul Ajar yang approved.',
      });
    }
    const openRpp = await db.rpp.count({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        status: { in: ['draft', 'revision', 'submitted', 'curriculum_reviewed'] },
        archivedAt: null,
        ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
      },
    });
    if (openRpp > 0) {
      blockers.push({
        code: 'RPP_OPEN_REVIEW',
        owner: 'Guru/Waka Kurikulum/Kepala Sekolah',
        count: openRpp,
        action: 'finish_rpp_pipeline',
        message: 'Masih ada Modul Ajar draft/revisi/submitted/curriculum_reviewed.',
      });
    }

    const lmsOpen = await db.lmsModule.count({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        status: { in: ['draft', 'published'] },
        ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
      },
    });
    if (lmsOpen > 0) {
      blockers.push({
        code: 'LMS_NOT_ARCHIVED',
        owner: 'Guru',
        count: lmsOpen,
        action: 'archive_lms_modules',
        message: 'Semua modul LMS periode target harus diarsipkan sebelum close.',
      });
    }

    const incompleteProgress = await db.lmsModuleProgress.count({
      where: {
        status: { not: 'completed' },
        module: {
          academicYear: target.academicYear,
          semester: target.semester,
          ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
          ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        },
      },
    });
    if (incompleteProgress > 0) {
      warnings.push({
        code: 'LMS_PROGRESS_INCOMPLETE',
        owner: 'Guru',
        count: incompleteProgress,
        action: 'review_learning_progress',
        message: 'Ada progres LMS siswa yang belum 100%. Ini metric/warning, bukan blocker institusi.',
      });
    }

    const openAssessments = await db.assessmentSession.count({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        status: { in: ['draft', 'active'] },
        ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
        ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
      },
    });
    if (openAssessments > 0) {
      blockers.push({
        code: 'ASSESSMENT_OPEN',
        owner: 'Guru',
        count: openAssessments,
        action: 'complete_assessment_sessions',
        message: 'Masih ada sesi asesmen draft/aktif.',
      });
    }

    const pendingManualResponses = await db.assessmentResponse.count({
      where: {
        submittedAt: { not: null },
        score: null,
        session: {
          academicYear: target.academicYear,
          semester: target.semester,
          ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
          ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        },
      },
    });
    if (pendingManualResponses > 0) {
      blockers.push({
        code: 'ASSESSMENT_GRADING_PENDING',
        owner: 'Guru',
        count: pendingManualResponses,
        action: 'grade_pending_responses',
        message: 'Ada respons submit yang belum punya skor final.',
      });
    }

    const openRemedials = await db.remedialParticipant.count({
      where: {
        status: { in: ['assigned', 'in_progress', 'submitted', 'needs_retry'] },
        session: {
          academicYear: target.academicYear,
          semester: target.semester,
          ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
          ...(scope.kind === 'teacher' ? { teacherId: scope.teacherId } : {}),
        },
      },
    });
    if (openRemedials > 0) {
      blockers.push({
        code: 'REMEDIAL_OPEN',
        owner: 'Guru',
        count: openRemedials,
        action: 'finalize_remedials',
        message: 'Masih ada peserta remedial belum terminal.',
      });
    }

    const activeStudents = await db.student.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        ...(classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID }),
      },
      select: { id: true, classId: true },
    });
    const activeStudentIds = new Set(activeStudents.map((student) => student.id));
    const reportRows = await db.reportCard.findMany({
      where: {
        academicYear: target.academicYear,
        semester: target.semester,
        ...(scope.kind === 'school' ? {} : (classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID })),
      },
      select: { id: true, studentId: true, classId: true, status: true, grades: true },
    });
    const distributedStudentIds = new Set(
      reportRows
        .filter((report) => report.status === 'distributed' && activeStudentIds.has(report.studentId))
        .map((report) => report.studentId),
    );
    const distributedReports = distributedStudentIds.size;
    const missingReports = activeStudents.filter((student) => !distributedStudentIds.has(student.id)).length;
    if (missingReports > 0) {
      blockers.push({
        code: 'REPORT_CARD_NOT_DISTRIBUTED',
        owner: 'Wali Kelas/Waka Kurikulum/Kepala Sekolah/TU',
        count: missingReports,
        action: 'finish_report_distribution',
        message: 'Setiap siswa aktif harus memiliki tepat satu rapor distributed untuk periode target.',
      });
    }
    const orphanReports = reportRows.filter((report) => !activeStudentIds.has(report.studentId)).length;
    if (orphanReports > 0) {
      blockers.push({
        code: 'REPORT_CARD_ORPHANED',
        owner: 'Wali Kelas/Waka Kurikulum/Kepala Sekolah/TU',
        count: orphanReports,
        action: 'finish_report_distribution',
        message: 'Ada rapor periode target yang tidak cocok dengan roster siswa aktif scope ini.',
      });
    }
    metrics.push({ code: 'distributed_reports', label: 'Rapor distributed', value: distributedReports, total: activeStudentTotal });
    const reportGradeIntegrity = this.extractFinalGradeEntries(reportRows, activeStudentIds);
    if (reportGradeIntegrity.invalidSnapshots > 0) {
      blockers.push({
        code: 'REPORT_CARD_GRADE_SNAPSHOT_INVALID',
        owner: 'Wali Kelas/Waka Kurikulum/Kepala Sekolah',
        count: reportGradeIntegrity.invalidSnapshots,
        action: 'finish_report_distribution',
        message: 'Ada snapshot nilai rapor distributed yang tidak lengkap atau tidak valid.',
      });
    }
    if (reportGradeIntegrity.duplicateSubjects > 0) {
      blockers.push({
        code: 'REPORT_CARD_SUBJECT_DUPLICATE',
        owner: 'Wali Kelas/Waka Kurikulum/Kepala Sekolah',
        count: reportGradeIntegrity.duplicateSubjects,
        action: 'finish_report_distribution',
        message: 'Ada snapshot rapor dengan lebih dari satu nilai akhir untuk siswa/mapel yang sama.',
      });
    }

    const attendanceGroups = await db.attendance.groupBy({
      by: ['status'],
      where: {
        date: { gte: target.startDate, lte: target.endDate },
        ...(classIds.length > 0 ? { classId: { in: classIds } } : { id: EMPTY_UUID }),
      },
      _count: { _all: true },
    });
    const attendanceTotal = attendanceGroups.reduce((sum, group) => sum + group._count._all, 0);
    metrics.push({ code: 'attendance_records', label: 'Record kehadiran', value: attendanceTotal });
    if (attendanceTotal === 0 && activeStudentTotal > 0) {
      warnings.push({
        code: 'ATTENDANCE_EMPTY',
        owner: 'Guru/TU',
        count: activeStudentTotal,
        action: 'review_attendance',
        message: 'Belum ada record kehadiran pada rentang tanggal semester.',
      });
    }

    const subjects = [...new Set([...assignmentCoverage.values()].map((assignment) => assignment.subject))].sort();
    const kktpBySubject = new Map<string, Awaited<ReturnType<typeof resolveKktpThreshold>>>();
    let systemDefaultKktp = 0;
    for (const subject of subjects) {
      const kktp = await resolveKktpThreshold(db, {
        subject,
        academicYear: target.academicYear,
        semester: target.semester,
      });
      kktpBySubject.set(subject, kktp);
      if (kktp.value === null || kktp.provenance === 'unconfigured') {
        blockers.push({
          code: 'KKTP_UNCONFIGURED',
          owner: 'Waka Kurikulum/Kepala Sekolah',
          count: 1,
          action: 'configure_kktp',
          message: `KKTP ${subject} belum memiliki threshold sah.`,
        });
      } else if (kktp.provenance === 'system_default') {
        systemDefaultKktp++;
      }
    }
    if (systemDefaultKktp > 0) {
      warnings.push({
        code: 'KKTP_SYSTEM_DEFAULT',
        owner: 'Waka Kurikulum/Kepala Sekolah',
        count: systemDefaultKktp,
        action: 'review_kktp_defaults',
        message: 'Sebagian mapel memakai default sistem 75 dengan provenance eksplisit.',
      });
    }

    const finalGradeEntries = reportGradeIntegrity.entries;
    const gradeDistribution = this.gradeDistribution(finalGradeEntries.map((row) => row.score));
    const finalReport = this.buildFinalReport({
      classes,
      activeStudents,
      reportRows,
      subjects,
      kktpBySubject,
      finalGradeEntries,
      curriculumRows,
    });
    metrics.push(
      { code: 'grade_records', label: 'Nilai akhir rapor', value: finalGradeEntries.length },
      { code: 'assignments_scheduled', label: 'Assignment terjadwal', value: scheduledAssignments.length },
      { code: 'assignments_expected', label: 'Assignment expected', value: assignmentCoverage.size },
      { code: 'grade_a_count', label: 'Nilai A', value: gradeDistribution.A },
      { code: 'grade_b_count', label: 'Nilai B', value: gradeDistribution.B },
      { code: 'grade_c_count', label: 'Nilai C', value: gradeDistribution.C },
      { code: 'grade_d_count', label: 'Nilai D', value: gradeDistribution.D },
    );

    const snapshot = this.toSnapshot({
      readinessVersion: READINESS_VERSION,
      period: this.periodPayload(target),
      nextPeriod: nextPeriod ? this.nextPeriodPayload(nextPeriod) : null,
      scope: { kind: scope.kind, ...(scope.majorCodes ? { majorCodes: scope.majorCodes } : {}) },
      metrics: metrics.sort((a, b) => a.code.localeCompare(b.code)),
      blockers: blockers.sort((a, b) => a.code.localeCompare(b.code)),
      warnings: warnings.sort((a, b) => a.code.localeCompare(b.code)),
      finalReport,
      ready: blockers.length === 0,
      generatedAt: new Date(0).toISOString(),
      closedAt: targetClosed?.closedAt ?? null,
      readinessHash: '',
    });
    const readinessHash = this.period.sha256(snapshot);
    return {
      ...snapshot,
      ready: blockers.length === 0,
      readinessHash,
      generatedAt: new Date().toISOString(),
      closedAt: targetClosed?.closedAt ?? null,
    };
  }

  private async computeMajorSnapshots(
    target: AcademicPeriodIdentity,
    db: Prisma.TransactionClient,
    forcedNext: NextPeriodIdentity | null,
  ): Promise<ReadinessSnapshot[]> {
    const majors = await db.class.findMany({
      where: {
        academicYear: target.academicYear,
        isActive: true,
      },
      select: { majorCode: true },
      distinct: ['majorCode'],
      orderBy: { majorCode: 'asc' },
    });

    const snapshots: ReadinessSnapshot[] = [];
    for (const major of majors) {
      if (!major.majorCode) continue;
      const readiness = await this.computeReadiness(
        target,
        {
          kind: 'major',
          classWhere: {
            academicYear: target.academicYear,
            isActive: true,
            majorCode: major.majorCode,
          },
          majorCodes: [major.majorCode],
        },
        db,
        forcedNext,
      );
      snapshots.push(this.toSnapshot(readiness));
    }
    return snapshots;
  }

  private assignmentKey(input: { teacherId: string; classId: string; subject: string; academicYear: string }): string {
    return `${input.teacherId}|${input.classId}|${input.subject}|${input.academicYear}`;
  }

  private buildFinalReport(input: {
    classes: Array<{
      id: string;
      name: string;
      majorCode: string | null;
      _count: { students: number };
    }>;
    activeStudents: Array<{ id: string; classId: string | null }>;
    reportRows: Array<{ studentId: string; classId: string; status: string; grades: Prisma.JsonValue }>;
    subjects: string[];
    kktpBySubject: Map<string, Awaited<ReturnType<typeof resolveKktpThreshold>>>;
    finalGradeEntries: FinalGradeEntry[];
    curriculumRows: Array<{
      subject: string;
      className: string;
      mapping: CurriculumMapping;
    }>;
  }): SemesterFinalReport {
    const activeStudentsByClass = new Map<string, number>();
    for (const student of input.activeStudents) {
      if (!student.classId) continue;
      activeStudentsByClass.set(student.classId, (activeStudentsByClass.get(student.classId) ?? 0) + 1);
    }
    const activeStudentIds = new Set(input.activeStudents.map((student) => student.id));
    const distributedByClass = new Map<string, number>();
    for (const report of input.reportRows) {
      if (report.status !== 'distributed' || !activeStudentIds.has(report.studentId)) continue;
      distributedByClass.set(report.classId, (distributedByClass.get(report.classId) ?? 0) + 1);
    }

    const classGradeStats = new Map<string, { records: number; scoreTotal: number; belowKktp: number }>();
    const subjectStats = new Map<string, {
      records: number;
      belowKktp: number;
      kktpValues: Set<number>;
      provenances: Set<string>;
    }>();
    for (const row of input.finalGradeEntries) {
      const below = row.score < row.kktp ? 1 : 0;
      const classStat = classGradeStats.get(row.classId) ?? { records: 0, scoreTotal: 0, belowKktp: 0 };
      classStat.records += 1;
      classStat.scoreTotal += row.score;
      classStat.belowKktp += below;
      classGradeStats.set(row.classId, classStat);
      const subjectStat = subjectStats.get(row.subject) ?? {
        records: 0,
        belowKktp: 0,
        kktpValues: new Set<number>(),
        provenances: new Set<string>(),
      };
      subjectStat.records += 1;
      subjectStat.belowKktp += below;
      subjectStat.kktpValues.add(row.kktp);
      subjectStat.provenances.add(row.kktpProvenance);
      subjectStats.set(row.subject, subjectStat);
    }

    const classHeatmap = input.classes.map((kelas) => {
      const stat = classGradeStats.get(kelas.id) ?? { records: 0, scoreTotal: 0, belowKktp: 0 };
      return {
        className: kelas.name,
        majorCode: kelas.majorCode,
        activeStudents: activeStudentsByClass.get(kelas.id) ?? kelas._count.students,
        distributedReports: distributedByClass.get(kelas.id) ?? 0,
        gradeRecords: stat.records,
        averageScore: stat.records > 0 ? Number((stat.scoreTotal / stat.records).toFixed(2)) : null,
        belowKktpCount: stat.belowKktp,
      };
    });

    const majorMap = new Map<string, { active: number; reports: number; records: number; scoreTotal: number; below: number }>();
    for (const row of classHeatmap) {
      const code = row.majorCode ?? 'UNSET';
      const existing = majorMap.get(code) ?? { active: 0, reports: 0, records: 0, scoreTotal: 0, below: 0 };
      existing.active += row.activeStudents;
      existing.reports += row.distributedReports;
      existing.records += row.gradeRecords;
      existing.scoreTotal += row.averageScore === null ? 0 : row.averageScore * row.gradeRecords;
      existing.below += row.belowKktpCount;
      majorMap.set(code, existing);
    }
    const majorHeatmap = [...majorMap.entries()]
      .map(([majorCode, stat]) => ({
        majorCode,
        activeStudents: stat.active,
        distributedReports: stat.reports,
        gradeRecords: stat.records,
        averageScore: stat.records > 0 ? Number((stat.scoreTotal / stat.records).toFixed(2)) : null,
        belowKktpCount: stat.below,
      }))
      .sort((a, b) => a.majorCode.localeCompare(b.majorCode));

    const subjects = [...new Set([...input.subjects, ...input.finalGradeEntries.map((entry) => entry.subject)])].sort();
    const subjectKktp = subjects.map((subject) => {
      const kktp = input.kktpBySubject.get(subject);
      const stat = subjectStats.get(subject) ?? {
        records: 0,
        belowKktp: 0,
        kktpValues: new Set<number>(),
        provenances: new Set<string>(),
      };
      const snapshotKktpValues = [...stat.kktpValues].sort((a, b) => a - b);
      const snapshotProvenances = [...stat.provenances].sort();
      return {
        subject,
        kktp: snapshotKktpValues.length === 1 ? snapshotKktpValues[0]! : (kktp?.value ?? null),
        provenance: snapshotProvenances.length === 1
          ? snapshotProvenances[0]!
          : snapshotProvenances.length > 1
            ? 'mixed_snapshot'
            : (kktp?.provenance ?? 'unconfigured'),
        gradeRecords: stat.records,
        belowKktpCount: stat.belowKktp,
        passRate: stat.records > 0
          ? Number((((stat.records - stat.belowKktp) / stat.records) * 100).toFixed(2))
          : null,
      };
    });

    const curriculumMap = input.curriculumRows
      .map((row) => ({
        className: row.className,
        subject: row.subject,
        cpCount: row.mapping.cpCount,
        tpCount: row.mapping.tpCount,
        atpCount: row.mapping.atpCount,
        cpStatus: row.mapping.cpStatus,
        tpRefs: row.mapping.tpRefs,
        mappedAtpCount: row.mapping.mappedAtpCount,
        unmappedAtpCount: row.mapping.unmappedAtpCount,
        invalidReasonCodes: row.mapping.invalidReasonCodes,
      }))
      .sort((a, b) => `${a.className}|${a.subject}`.localeCompare(`${b.className}|${b.subject}`));

    return { classHeatmap, majorHeatmap, subjectKktp, curriculumMap };
  }

  private curriculumMapping(body: Prisma.JsonValue | null): CurriculumMapping {
    const empty = (): CurriculumMapping => ({
      cpCount: 0,
      tpCount: 0,
      atpCount: 0,
      cpStatus: 'belum_terisi',
      tpRefs: [],
      mappedAtpCount: 0,
      unmappedAtpCount: 0,
      invalidReasonCodes: ['missing_body'],
    });
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return empty();
    }
    const record = body as Record<string, unknown>;
    const invalid = new Set<string>();
    const legacyKeys = ['kd', 'ki', 'kiKd', 'ki_kd', 'kompetensiDasar', 'kompetensiInti', 'kompetensi_dasar', 'kompetensi_inti'];
    if (legacyKeys.some((key) => this.hasNonEmptyValue(record[key]))) invalid.add('legacy_curriculum_key');
    const cpCount = typeof record['cp'] === 'string' && record['cp'].trim() ? 1 : 0;
    if (cpCount === 0) invalid.add('missing_cp');
    const tpRaw = Array.isArray(record['tp']) ? record['tp'] : [];
    if (!Array.isArray(record['tp'])) invalid.add('missing_tp');
    const tpRefs: string[] = [];
    const tpAliases = new Set<string>();
    for (const [index, item] of tpRaw.entries()) {
      const parsed = this.curriculumTpRef(item, index);
      if (!parsed.ref) {
        invalid.add('invalid_tp');
        continue;
      }
      if (tpRefs.includes(parsed.ref)) invalid.add('duplicate_tp_ref');
      tpRefs.push(parsed.ref);
      for (const alias of parsed.aliases) tpAliases.add(alias);
    }
    if (tpRefs.length === 0) invalid.add('missing_tp');
    const atpRaw = Array.isArray(record['atp']) ? record['atp'] : [];
    if (!Array.isArray(record['atp'])) invalid.add('missing_atp');
    let mappedAtpCount = 0;
    let unmappedAtpCount = 0;
    for (const item of atpRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        invalid.add('invalid_atp');
        unmappedAtpCount += 1;
        continue;
      }
      const atp = item as Record<string, unknown>;
      const rawTpRef = this.normalizeText(atp['tpRef'] ?? atp['tp_ref'] ?? atp['tp']);
      const indicatorCount = this.indicatorCount(atp['indikator'] ?? atp['indicators']);
      if (!rawTpRef) invalid.add('missing_atp_tp_ref');
      if (!indicatorCount) invalid.add('missing_atp_indicator');
      if (!rawTpRef || !tpAliases.has(rawTpRef.toLowerCase()) || !indicatorCount) {
        if (rawTpRef && !tpAliases.has(rawTpRef.toLowerCase())) invalid.add('unknown_atp_tp_ref');
        unmappedAtpCount += 1;
        continue;
      }
      mappedAtpCount += 1;
    }
    if (atpRaw.length === 0) invalid.add('missing_atp');
    return {
      cpCount,
      tpCount: tpRefs.length,
      atpCount: atpRaw.length,
      cpStatus: cpCount > 0 ? 'terisi' : 'belum_terisi',
      tpRefs,
      mappedAtpCount,
      unmappedAtpCount,
      invalidReasonCodes: [...invalid].sort(),
    };
  }

  private extractFinalGradeEntries(
    reportRows: Array<{ studentId: string; classId: string; status: string; grades: Prisma.JsonValue }>,
    activeStudentIds: Set<string>,
  ): { entries: FinalGradeEntry[]; invalidSnapshots: number; duplicateSubjects: number } {
    const entries: FinalGradeEntry[] = [];
    let invalidSnapshots = 0;
    let duplicateSubjects = 0;
    for (const report of reportRows) {
      if (report.status !== 'distributed' || !activeStudentIds.has(report.studentId)) continue;
      if (!Array.isArray(report.grades)) {
        invalidSnapshots += 1;
        continue;
      }
      const seenSubjects = new Set<string>();
      for (const item of report.grades) {
        const parsed = this.parseReportSubjectSnapshot(item);
        if (!parsed) {
          invalidSnapshots += 1;
          continue;
        }
        const subjectKey = parsed.subject.toLowerCase();
        if (seenSubjects.has(subjectKey)) {
          duplicateSubjects += 1;
          continue;
        }
        seenSubjects.add(subjectKey);
        entries.push({
          studentId: report.studentId,
          classId: report.classId,
          subject: parsed.subject,
          score: parsed.average,
          kktp: parsed.kktp,
          kktpProvenance: parsed.kktpProvenance,
        });
      }
    }
    return { entries, invalidSnapshots, duplicateSubjects };
  }

  private parseReportSubjectSnapshot(value: unknown): {
    subject: string;
    average: number;
    kktp: number;
    kktpProvenance: string;
  } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const subject = this.normalizeText(record['subject']);
    const average = Number(record['average']);
    const kktp = Number(record['kktp']);
    const kktpProvenance = this.normalizeText(record['kktpProvenance']);
    if (!subject || !Number.isFinite(average) || !Number.isFinite(kktp) || !kktpProvenance) return null;
    return { subject, average, kktp, kktpProvenance };
  }

  private curriculumTpRef(value: unknown, index: number): { ref: string | null; aliases: string[] } {
    const generatedRef = `TP ${index + 1}`;
    if (typeof value === 'string') {
      const text = this.normalizeText(value);
      return text ? { ref: generatedRef, aliases: [generatedRef.toLowerCase(), text.toLowerCase()] } : { ref: null, aliases: [] };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ref: null, aliases: [] };
    }
    const record = value as Record<string, unknown>;
    const explicitRef = this.normalizeText(record['ref'] ?? record['code'] ?? record['id'] ?? record['tpRef']);
    const text = this.normalizeText(record['text'] ?? record['description'] ?? record['tujuan']);
    const ref = explicitRef || generatedRef;
    const aliases = [ref, generatedRef, explicitRef, text]
      .filter((item): item is string => Boolean(item))
      .map((item) => item.toLowerCase());
    return { ref, aliases };
  }

  private normalizeText(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  private hasNonEmptyValue(value: unknown): boolean {
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value && typeof value === 'object');
  }

  private indicatorCount(value: unknown): number {
    if (typeof value === 'string') return value.trim() ? 1 : 0;
    if (!Array.isArray(value)) return 0;
    return value.filter((item) => {
      if (typeof item === 'string') return item.trim().length > 0;
      return Boolean(item && typeof item === 'object' && !Array.isArray(item));
    }).length;
  }

  private aggregateReadinessItems(items: ReadinessItem[]): ReadinessItem[] {
    const byCode = new Map<string, ReadinessItem>();
    for (const item of items) {
      const existing = byCode.get(item.code);
      if (!existing) {
        byCode.set(item.code, { ...item });
        continue;
      }
      existing.count += item.count;
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  private async assertCanRead(user: AuthUser, target: AcademicPeriodIdentity): Promise<void> {
    if (user.roles.includes('SUPER_ADMIN')) return;
    if (await this.permissions.hasPermission(user.keycloakId, user.roles, 'academic.period.read')) return;
    if (user.roles.includes('GURU')) {
      const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      const assignment = await this.prisma.teachingAssignment.findFirst({
        where: { teacherId, academicYear: target.academicYear },
        select: { id: true },
      });
      if (assignment) return;
    }
    throw new ForbiddenException('Akses readiness penutupan semester ditolak.');
  }

  private async assertCanReadFinalReport(user: AuthUser): Promise<void> {
    if (user.roles.includes('SUPER_ADMIN')) return;
    if (await this.permissions.hasPermission(user.keycloakId, user.roles, 'academic.final-report.read')) return;
    throw new ForbiddenException('Akses laporan akademik final ditolak.');
  }

  private async resolveScope(user: AuthUser, target: AcademicPeriodIdentity): Promise<ReadScope> {
    const activePositionCodes = user.roles.includes('SUPER_ADMIN')
      ? new Set<string>()
      : await this.permissions.getActivePositionCodes(user.keycloakId);
    if (activePositionCodes.has('KEPALA_SEKOLAH') || activePositionCodes.has('WAKA_KURIKULUM')) {
      return { kind: 'school', classWhere: { academicYear: target.academicYear, isActive: true } };
    }
    if (activePositionCodes.has('KAPROG')) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      if (scope.academicYearCode !== target.academicYear) {
        return { kind: 'major', classWhere: { id: EMPTY_UUID }, majorCodes: scope.majorCodes };
      }
      return { kind: 'major', classWhere: kaprogClassWhere(scope), majorCodes: scope.majorCodes };
    }
    if (isKaprogScopedReader(user)) {
      const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
      if (scope.academicYearCode !== target.academicYear) {
        return { kind: 'major', classWhere: { id: EMPTY_UUID }, majorCodes: scope.majorCodes };
      }
      return { kind: 'major', classWhere: kaprogClassWhere(scope), majorCodes: scope.majorCodes };
    }
    if (
      user.roles.includes('GURU') &&
      !user.roles.includes('SUPER_ADMIN') &&
      !user.roles.includes('KEPALA_SEKOLAH') &&
      !user.roles.includes('WAKA_KURIKULUM')
    ) {
      const teacherId = await resolveTeacherId(this.prisma, user.keycloakId);
      return {
        kind: 'teacher',
        teacherId,
        classWhere: {
          academicYear: target.academicYear,
          isActive: true,
          OR: [
            { teacherId },
            { teachingAssignments: { some: { teacherId, academicYear: target.academicYear } } },
          ],
        },
      };
    }
    return { kind: 'school', classWhere: { academicYear: target.academicYear, isActive: true } };
  }

  private async findPeriodBySemesterId(id: string, db: PrismaService | Prisma.TransactionClient): Promise<AcademicPeriodIdentity> {
    const semester = await db.semester.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        startDate: true,
        endDate: true,
        academicYear: { select: { id: true, code: true } },
      },
    });
    if (!semester) throw new NotFoundException('Semester tidak ditemukan.');
    return {
      academicYearId: semester.academicYear.id,
      academicYear: semester.academicYear.code,
      semesterId: semester.id,
      semester: semester.number,
      startDate: semester.startDate,
      endDate: semester.endDate,
    };
  }

  private periodPayload(period: AcademicPeriodIdentity): ReadinessSnapshot['period'] {
    return {
      academicYearId: period.academicYearId,
      academicYear: period.academicYear,
      semesterId: period.semesterId,
      semester: period.semester,
      startDate: period.startDate.toISOString().slice(0, 10),
      endDate: period.endDate.toISOString().slice(0, 10),
    };
  }

  private nextPeriodPayload(period: NextPeriodIdentity): NonNullable<ReadinessSnapshot['nextPeriod']> {
    return {
      academicYearId: period.academicYearId,
      academicYear: period.academicYear,
      semesterId: period.semesterId,
      semester: period.semester,
      startDate: period.startDate.toISOString().slice(0, 10),
      endDate: period.endDate.toISOString().slice(0, 10),
    };
  }

  private toSnapshot(readiness: ReadinessResponse | ReadinessSnapshot): ReadinessSnapshot {
    return {
      readinessVersion: readiness.readinessVersion,
      period: readiness.period,
      nextPeriod: readiness.nextPeriod,
      scope: readiness.scope,
      metrics: readiness.metrics,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      finalReport: readiness.finalReport ?? this.emptyFinalReport(),
    };
  }

  private toPublicClosure<T extends { snapshot: Prisma.JsonValue }>(closure: T): Omit<T, 'snapshot'> & { snapshot: ReadinessSnapshot } {
    const { snapshot, idempotencyKey: _idempotencyKey, ...rest } = closure as T & { idempotencyKey?: string };
    return {
      ...rest,
      snapshot: this.sanitizeSnapshot(snapshot),
    } as Omit<T, 'snapshot'> & { snapshot: ReadinessSnapshot };
  }

  private sanitizeSnapshot(snapshot: Prisma.JsonValue): ReadinessSnapshot {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return {
        readinessVersion: READINESS_VERSION,
        period: {
          academicYearId: '',
          academicYear: '',
          semesterId: '',
          semester: 0,
          startDate: '',
          endDate: '',
        },
        nextPeriod: null,
        scope: { kind: 'school' },
        metrics: [],
        blockers: [],
        warnings: [],
        finalReport: this.emptyFinalReport(),
      };
    }
    return this.toSnapshot(snapshot as unknown as ReadinessSnapshot);
  }

  private emptyFinalReport(): SemesterFinalReport {
    return { classHeatmap: [], majorHeatmap: [], subjectKktp: [], curriculumMap: [] };
  }

  private extractCloseFingerprint(snapshot: Prisma.JsonValue): string | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const closure = (snapshot as Record<string, unknown>).closure;
    if (!closure || typeof closure !== 'object' || Array.isArray(closure)) return null;
    const fingerprint = (closure as Record<string, unknown>).closeRequestFingerprint;
    return typeof fingerprint === 'string' ? fingerprint : null;
  }

  private async filterSnapshotForUser<T extends { snapshot: Prisma.JsonValue }>(closure: T, user: AuthUser): Promise<T> {
    if (user.roles.includes('SUPER_ADMIN')) return closure;
    const activePositionCodes = await this.permissions.getActivePositionCodes(user.keycloakId);
    if (activePositionCodes.has('KEPALA_SEKOLAH') || activePositionCodes.has('WAKA_KURIKULUM')) return closure;
    const shouldUseKaprogScope = activePositionCodes.has('KAPROG') || isKaprogScopedReader(user);
    if (!shouldUseKaprogScope) return closure;
    if (!closure.snapshot || typeof closure.snapshot !== 'object' || Array.isArray(closure.snapshot)) return closure;
    const snapshot = closure.snapshot as StoredClosureSnapshot;
    if (!Array.isArray(snapshot.majorSnapshots)) {
      throw new ForbiddenException('Snapshot jurusan tidak tersedia untuk laporan Kaprog.');
    }
    const scope = await resolveActiveKaprogMajorScope(this.prisma, user);
    const allowed = new Set(scope.majorCodes);
    const majorSnapshots = snapshot.majorSnapshots.filter((item) => (
      item.scope.kind === 'major' &&
      item.scope.majorCodes?.some((code) => allowed.has(code))
    ));
    if (majorSnapshots.length === 0) {
      throw new ForbiddenException('Snapshot jurusan tidak tersedia untuk scope Kaprog ini.');
    }
    return {
      ...closure,
      snapshot: this.combineMajorSnapshots(snapshot, majorSnapshots) as unknown as Prisma.JsonValue,
    };
  }

  private combineMajorSnapshots(base: StoredClosureSnapshot, snapshots: ReadinessSnapshot[]): ReadinessSnapshot {
    const metricMap = new Map<string, ReadinessMetric>();
    for (const snapshot of snapshots) {
      for (const metric of snapshot.metrics) {
        const existing = metricMap.get(metric.code);
        if (!existing) {
          metricMap.set(metric.code, { ...metric });
          continue;
        }
        existing.value += metric.value;
        if (existing.total !== undefined || metric.total !== undefined) {
          existing.total = (existing.total ?? 0) + (metric.total ?? 0);
        }
      }
    }
    return {
      readinessVersion: base.readinessVersion,
      period: base.period,
      nextPeriod: base.nextPeriod,
      scope: {
        kind: 'major',
        majorCodes: [...new Set(snapshots.flatMap((snapshot) => snapshot.scope.majorCodes ?? []))].sort(),
      },
      metrics: [...metricMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
      blockers: snapshots.flatMap((snapshot) => snapshot.blockers).sort((a, b) => a.code.localeCompare(b.code)),
      warnings: snapshots.flatMap((snapshot) => snapshot.warnings).sort((a, b) => a.code.localeCompare(b.code)),
      finalReport: this.combineFinalReports(snapshots.map((snapshot) => snapshot.finalReport)),
    };
  }

  private combineFinalReports(reports: SemesterFinalReport[]): SemesterFinalReport {
    return {
      classHeatmap: reports.flatMap((report) => report.classHeatmap)
        .sort((a, b) => `${a.majorCode ?? ''}|${a.className}`.localeCompare(`${b.majorCode ?? ''}|${b.className}`)),
      majorHeatmap: this.combineMajorHeatmap(reports.flatMap((report) => report.majorHeatmap)),
      subjectKktp: this.combineSubjectKktp(reports.flatMap((report) => report.subjectKktp)),
      curriculumMap: reports.flatMap((report) => report.curriculumMap)
        .sort((a, b) => `${a.className}|${a.subject}`.localeCompare(`${b.className}|${b.subject}`)),
    };
  }

  private combineMajorHeatmap(rows: SemesterFinalReport['majorHeatmap']): SemesterFinalReport['majorHeatmap'] {
    const byMajor = new Map<string, { active: number; reports: number; records: number; scoreTotal: number; below: number }>();
    for (const row of rows) {
      const current = byMajor.get(row.majorCode) ?? { active: 0, reports: 0, records: 0, scoreTotal: 0, below: 0 };
      current.active += row.activeStudents;
      current.reports += row.distributedReports;
      current.records += row.gradeRecords;
      current.scoreTotal += row.averageScore === null ? 0 : row.averageScore * row.gradeRecords;
      current.below += row.belowKktpCount;
      byMajor.set(row.majorCode, current);
    }
    return [...byMajor.entries()].map(([majorCode, row]) => ({
      majorCode,
      activeStudents: row.active,
      distributedReports: row.reports,
      gradeRecords: row.records,
      averageScore: row.records > 0 ? Number((row.scoreTotal / row.records).toFixed(2)) : null,
      belowKktpCount: row.below,
    })).sort((a, b) => a.majorCode.localeCompare(b.majorCode));
  }

  private combineSubjectKktp(rows: SemesterFinalReport['subjectKktp']): SemesterFinalReport['subjectKktp'] {
    const bySubject = new Map<string, { kktp: number | null; provenance: string; records: number; below: number }>();
    for (const row of rows) {
      const current = bySubject.get(row.subject) ?? {
        kktp: row.kktp,
        provenance: row.provenance,
        records: 0,
        below: 0,
      };
      current.records += row.gradeRecords;
      current.below += row.belowKktpCount;
      bySubject.set(row.subject, current);
    }
    return [...bySubject.entries()].map(([subject, row]) => ({
      subject,
      kktp: row.kktp,
      provenance: row.provenance,
      gradeRecords: row.records,
      belowKktpCount: row.below,
      passRate: row.records > 0 ? Number((((row.records - row.below) / row.records) * 100).toFixed(2)) : null,
    })).sort((a, b) => a.subject.localeCompare(b.subject));
  }

  private gradeDistribution(scores: number[]): Record<'A' | 'B' | 'C' | 'D', number> {
    return scores.reduce<Record<'A' | 'B' | 'C' | 'D', number>>((acc, score) => {
      if (score >= 90) acc.A += 1;
      else if (score >= 80) acc.B += 1;
      else if (score >= 70) acc.C += 1;
      else acc.D += 1;
      return acc;
    }, { A: 0, B: 0, C: 0, D: 0 });
  }

  private csvCell(value: string): string {
    const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${protectedValue.replaceAll('"', '""')}"`;
  }
}
