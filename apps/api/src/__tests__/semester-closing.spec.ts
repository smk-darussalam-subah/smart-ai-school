import { ConflictException, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthUser } from '@smk/auth';
import { AcademicPeriodService } from '../academic-period/academic-period.service';
import { CloseSemesterSchema } from '../semester-closing/dto/semester-closing.dto';
import { SemesterClosingService } from '../semester-closing/semester-closing.service';
import { SchoolConfigService } from '../school-config/school-config.service';

function academicPeriodService(activePositions: string[] = []) {
  return new AcademicPeriodService(
    {} as never,
    {
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(activePositions)),
    } as never,
  );
}

const user = {
  keycloakId: 'kc-1',
  roles: ['SUPER_ADMIN'],
} as AuthUser;

describe('Wave 7 semester closing contract', () => {
  it('keeps close DTO strict and idempotency-keyed', () => {
    expect(CloseSemesterSchema.safeParse({
      semesterId: '11111111-1111-4111-8111-111111111111',
      nextSemesterId: null,
      readinessVersion: 'wave7.v1',
      readinessHash: 'a'.repeat(64),
      idempotencyKey: 'semester-close:11111111',
      confirmation: 'TUTUP SEMESTER',
    }).success).toBe(true);

    expect(CloseSemesterSchema.safeParse({
      semesterId: '11111111-1111-4111-8111-111111111111',
      nextSemesterId: null,
      readinessVersion: 'wave7.v1',
      readinessHash: 'a'.repeat(64),
      idempotencyKey: 'semester-close:11111111',
      confirmation: 'TUTUP SEMESTER',
      force: true,
    }).success).toBe(false);
  });

  it('requires exactly one active academic year and one active semester bound together', async () => {
    const service = academicPeriodService();
    await expect(service.getActivePeriod({
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }, { id: 'ay-2', code: '2027/2028' }]) },
      semester: { findMany: jest.fn().mockResolvedValue([{ id: 's-1', academicYearId: 'ay-1', number: 1, startDate: new Date(), endDate: new Date() }]) },
    } as never)).rejects.toBeInstanceOf(ConflictException);

    await expect(service.getActivePeriod({
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }]) },
      semester: { findMany: jest.fn().mockResolvedValue([{ id: 's-1', academicYearId: 'other-ay', number: 1, startDate: new Date(), endDate: new Date() }]) },
    } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not let stable SUPER_ADMIN close without an active Kepala Sekolah appointment', async () => {
    await expect(academicPeriodService().assertPrincipalCloseAuthority(user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(academicPeriodService(['KEPALA_SEKOLAH']).assertPrincipalCloseAuthority(user)).resolves.toBeUndefined();
  });

  it('replays an exact idempotency key even after active semester moved forward', async () => {
    const dto = {
      semesterId: '11111111-1111-4111-8111-111111111111',
      nextSemesterId: '22222222-2222-4222-8222-222222222222',
      readinessVersion: 'wave7.v1',
      readinessHash: 'b'.repeat(64),
      idempotencyKey: 'semester-close:11111111:bbbb',
      confirmation: 'TUTUP SEMESTER' as const,
    };
    const payloadFingerprint = JSON.stringify({
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash,
      confirmation: dto.confirmation,
    });
    const existingClosure = {
      id: 'closure-1',
      idempotencyKey: dto.idempotencyKey,
      snapshot: { closure: { closeRequestFingerprint: payloadFingerprint } },
      closedAt: new Date('2026-08-20T01:00:00.000Z'),
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash,
    };
    const tx = {
      semesterClosure: {
        findUnique: jest.fn().mockResolvedValue(existingClosure),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      $transaction: jest.fn((callback: (delegate: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const period = {
      assertPrincipalCloseAuthority: jest.fn().mockResolvedValue(undefined),
      sha256: jest.fn((value: unknown) => (typeof value === 'string' ? `hash:${value}` : JSON.stringify(value))),
      acquireCutoverLock: jest.fn().mockResolvedValue(undefined),
      getActivePeriod: jest.fn().mockRejectedValue(new Error('active period must not be read for exact replay')),
    };
    const permissions = { invalidateAll: jest.fn() };

    const service = new SemesterClosingService(prisma as never, period as never, permissions as never);

    const result = await service.close(dto, user);
    expect(result).toMatchObject({
      id: existingClosure.id,
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash,
    });
    expect(result).not.toHaveProperty('idempotencyKey');
    expect(result.snapshot).not.toHaveProperty('closure');
    expect(period.getActivePeriod).not.toHaveBeenCalled();
    expect(permissions.invalidateAll).toHaveBeenCalled();
  });

  it('recovers exact idempotency replay after a concurrent stale-read conflict', async () => {
    const dto = {
      semesterId: '11111111-1111-4111-8111-111111111111',
      nextSemesterId: '22222222-2222-4222-8222-222222222222',
      readinessVersion: 'wave7.v1',
      readinessHash: 'c'.repeat(64),
      idempotencyKey: 'semester-close:11111111:cccc',
      confirmation: 'TUTUP SEMESTER' as const,
    };
    const payloadFingerprint = JSON.stringify({
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash,
      confirmation: dto.confirmation,
    });
    const existingClosure = {
      id: 'closure-concurrent',
      snapshot: { closure: { closeRequestFingerprint: payloadFingerprint } },
      closedAt: new Date('2026-08-20T01:00:00.000Z'),
      semesterId: dto.semesterId,
      nextSemesterId: dto.nextSemesterId,
      readinessVersion: dto.readinessVersion,
      readinessHash: dto.readinessHash,
    };
    const tx = {
      semesterClosure: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
      semesterClosure: { findUnique: jest.fn().mockResolvedValue(existingClosure) },
      $transaction: jest.fn(async (callback: (delegate: typeof tx) => Promise<unknown>) => {
        await callback(tx);
      }),
    };
    const period = {
      assertPrincipalCloseAuthority: jest.fn().mockResolvedValue(undefined),
      sha256: jest.fn((value: unknown) => (typeof value === 'string' ? `hash:${value}` : JSON.stringify(value))),
      acquireCutoverLock: jest.fn().mockResolvedValue(undefined),
      getActivePeriod: jest.fn().mockResolvedValue({
        semesterId: 'already-moved',
        academicYearId: 'ay-1',
        academicYear: '2026/2027',
        semester: 2,
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-06-30'),
      }),
    };
    const permissions = { invalidateAll: jest.fn() };

    const service = new SemesterClosingService(prisma as never, period as never, permissions as never);

    const result = await service.close(dto, user);
    expect(result).toMatchObject({ id: existingClosure.id, semesterId: dto.semesterId });
    expect(result).not.toHaveProperty('idempotencyKey');
    expect(result.snapshot).not.toHaveProperty('closure');
    expect(prisma.semesterClosure.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idempotencyKey: dto.idempotencyKey } }),
    );
  });

  it('rejects generic active academic-year and semester status mutation, including true-to-true no-op', async () => {
    const tx = {
      academicYear: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ay-1', isActive: true }),
      },
      semester: {
        findUnique: jest.fn().mockResolvedValue({ id: 'sem-1', academicYearId: 'ay-1', number: 1, isActive: true }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (delegate: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new SchoolConfigService(
      prisma as never,
      { invalidateAll: jest.fn(), invalidateUser: jest.fn() } as never,
      { acquireActivationLock: jest.fn(), applyAcademicYearActivation: jest.fn() } as never,
      {
        assertWritableSemesterId: jest.fn().mockResolvedValue(undefined),
        assertInitialSemesterActivationAllowed: jest.fn().mockResolvedValue(undefined),
        assertAcademicYearActivationAllowed: jest.fn().mockResolvedValue(undefined),
      } as never,
    );

    await expect(service.updateAcademicYear('ay-1', { isActive: true })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateAcademicYear('ay-1', { isActive: false })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSemester('sem-1', { isActive: true })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateSemester('sem-1', { isActive: false })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects direct academic-year and semester activation bypasses', async () => {
    const service = academicPeriodService();
    await expect(service.assertAcademicYearActivationAllowed({
      semester: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'sem-2', closure: null }),
      },
    } as never, 'ay-1')).rejects.toBeInstanceOf(ConflictException);

    await expect(service.assertInitialSemesterActivationAllowed({
      semester: {
        findMany: jest.fn().mockResolvedValue([{ id: 'active-semester' }]),
      },
    } as never, {
      semesterId: 'other-semester',
      academicYearId: 'ay-1',
      number: 2,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('builds final report statistics from distributed ReportCard snapshots, not live Grade rows', () => {
    const service = new SemesterClosingService({} as never, {} as never, {} as never) as unknown as {
      buildFinalReport: (input: unknown) => {
        classHeatmap: Array<{ averageScore: number | null; belowKktpCount: number; gradeRecords: number }>;
        subjectKktp: Array<{ subject: string; kktp: number | null; provenance: string; passRate: number | null }>;
      };
    };

    const report = service.buildFinalReport({
      classes: [{ id: 'class-1', name: 'X TKJ 1', majorCode: 'TKJ', _count: { students: 1 } }],
      activeStudents: [{ id: 'student-1', classId: 'class-1' }],
      reportRows: [{
        studentId: 'student-1',
        classId: 'class-1',
        status: 'distributed',
        grades: [{ subject: 'Matematika', average: 92, kktp: 80, kktpProvenance: 'config', byType: { uh: 10 } }],
      }],
      subjects: ['Matematika'],
      kktpBySubject: new Map([['Matematika', { value: 75, provenance: 'system_default' }]]),
      finalGradeEntries: [{
        studentId: 'student-1',
        classId: 'class-1',
        subject: 'Matematika',
        score: 92,
        kktp: 80,
        kktpProvenance: 'config',
      }],
      curriculumRows: [],
    });

    expect(report.classHeatmap[0]).toMatchObject({ averageScore: 92, belowKktpCount: 0, gradeRecords: 1 });
    expect(report.subjectKktp[0]).toMatchObject({ subject: 'Matematika', kktp: 80, provenance: 'config', passRate: 100 });
  });

  it('blocks readiness for orphan sources, cross-year overlap, and invalid CP/TP/ATP mapping', async () => {
    const target = {
      academicYearId: 'ay-1',
      academicYear: '2026/2027',
      semesterId: 'sem-1',
      semester: 2,
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-06-30T00:00:00.000Z'),
    };
    const activeClass = { id: 'class-1', name: 'X TKJ 1', majorCode: 'TKJ', isActive: true, _count: { students: 0 } };
    const inactiveClass = { id: 'class-old', name: 'X TKJ Old', majorCode: 'TKJ', isActive: false, _count: { students: 0 } };
    const db = {
      class: {
        findMany: jest.fn()
          .mockResolvedValueOnce([activeClass])
          .mockResolvedValueOnce([activeClass, inactiveClass]),
      },
      semesterClosure: { findUnique: jest.fn().mockResolvedValue(null) },
      semester: { count: jest.fn().mockResolvedValue(1) },
      teachingAssignment: {
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      },
      rpp: {
        findMany: jest.fn().mockResolvedValue([{
          teacherId: 'teacher-1',
          classId: null,
          subject: 'Produktif',
          academicYear: '2026/2027',
          body: { cp: '', tp: ['TP Subnet'], atp: [{ tpRef: 'TP 9', indikator: '' }], kompetensiDasar: 'legacy' },
          class: null,
        }]),
        count: jest.fn().mockResolvedValue(0),
      },
      lmsModule: {
        findMany: jest.fn().mockResolvedValue([{
          teacherId: 'teacher-1',
          classId: 'class-old',
          subject: 'Produktif',
          academicYear: '2026/2027',
          status: 'archived',
        }]),
        count: jest.fn().mockResolvedValue(0),
      },
      assessmentSession: {
        findMany: jest.fn().mockResolvedValue([{
          teacherId: 'teacher-1',
          classId: 'class-1',
          academicYear: '2026/2027',
          module: null,
          teachingAssignment: null,
        }]),
        count: jest.fn().mockResolvedValue(0),
      },
      lmsModuleProgress: { count: jest.fn().mockResolvedValue(0) },
      assessmentResponse: { count: jest.fn().mockResolvedValue(0) },
      remedialParticipant: { count: jest.fn().mockResolvedValue(0) },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      reportCard: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { groupBy: jest.fn().mockResolvedValue([]) },
      kktpConfig: { findUnique: jest.fn().mockResolvedValue({ kktp: 75 }) },
    };
    const period = {
      findNextPeriodForClose: jest.fn().mockResolvedValue(null),
      sha256: jest.fn((value: unknown) => JSON.stringify(value)),
    };
    const service = new SemesterClosingService(db as never, period as never, {} as never) as unknown as {
      computeReadiness: (period: typeof target, scope: unknown, delegate: typeof db, next: null) => Promise<{ ready: boolean; blockers: Array<{ code: string }> }>;
    };

    const readiness = await service.computeReadiness(
      target,
      { kind: 'school', classWhere: { academicYear: '2026/2027', isActive: true } },
      db,
      null,
    );
    const blockerCodes = readiness.blockers.map((item) => item.code);

    expect(readiness.ready).toBe(false);
    expect(blockerCodes).toEqual(expect.arrayContaining([
      'PERIOD_DATE_OVERLAP',
      'CURRICULUM_MAPPING_INVALID',
      'ASSIGNMENT_SOURCE_MISSING_CLASS',
      'ASSIGNMENT_SOURCE_INACTIVE_CLASS',
      'ASSIGNMENT_SOURCE_MISSING_SUBJECT',
    ]));
  });

  it('filters final snapshot to active KAPROG major even when the stable base role is Tata Usaha', async () => {
    const baseSnapshot = {
      readinessVersion: 'wave7.v1',
      period: {
        academicYearId: 'ay-1',
        academicYear: '2026/2027',
        semesterId: 'sem-1',
        semester: 1,
        startDate: '2026-07-01',
        endDate: '2026-12-31',
      },
      nextPeriod: null,
      scope: { kind: 'school' },
      metrics: [],
      blockers: [],
      warnings: [],
      finalReport: { classHeatmap: [], majorHeatmap: [], subjectKktp: [], curriculumMap: [] },
      majorSnapshots: [
        {
          readinessVersion: 'wave7.v1',
          period: {
            academicYearId: 'ay-1',
            academicYear: '2026/2027',
            semesterId: 'sem-1',
            semester: 1,
            startDate: '2026-07-01',
            endDate: '2026-12-31',
          },
          nextPeriod: null,
          scope: { kind: 'major', majorCodes: ['TKJ'] },
          metrics: [{ code: 'active_students', label: 'Siswa aktif', value: 1 }],
          blockers: [],
          warnings: [],
          finalReport: {
            classHeatmap: [{ className: 'X TKJ 1', majorCode: 'TKJ', activeStudents: 1, distributedReports: 1, gradeRecords: 1, averageScore: 80, belowKktpCount: 0 }],
            majorHeatmap: [{ majorCode: 'TKJ', activeStudents: 1, distributedReports: 1, gradeRecords: 1, averageScore: 80, belowKktpCount: 0 }],
            subjectKktp: [],
            curriculumMap: [],
          },
        },
        {
          readinessVersion: 'wave7.v1',
          period: {
            academicYearId: 'ay-1',
            academicYear: '2026/2027',
            semesterId: 'sem-1',
            semester: 1,
            startDate: '2026-07-01',
            endDate: '2026-12-31',
          },
          nextPeriod: null,
          scope: { kind: 'major', majorCodes: ['AKL'] },
          metrics: [{ code: 'active_students', label: 'Siswa aktif', value: 1 }],
          blockers: [],
          warnings: [],
          finalReport: {
            classHeatmap: [{ className: 'X AKL 1', majorCode: 'AKL', activeStudents: 1, distributedReports: 1, gradeRecords: 1, averageScore: 90, belowKktpCount: 0 }],
            majorHeatmap: [{ majorCode: 'AKL', activeStudents: 1, distributedReports: 1, gradeRecords: 1, averageScore: 90, belowKktpCount: 0 }],
            subjectKktp: [],
            curriculumMap: [],
          },
        },
      ],
    };
    const prisma = {
      semesterClosure: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'closure-1',
          snapshot: baseSnapshot,
          closedAt: new Date('2026-08-20T01:00:00.000Z'),
          readinessVersion: 'wave7.v1',
          readinessHash: 'hash',
          semester: { number: 1, academicYear: { code: '2026/2027' } },
          closedBy: { fullName: 'Kepala Sekolah' },
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1', isActive: true, deletedAt: null }) },
      academicYear: { findMany: jest.fn().mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }]) },
      appointment: {
        findMany: jest.fn().mockResolvedValue([{ majorId: 'major-tkj', major: { id: 'major-tkj', code: 'TKJ' } }]),
      },
    };
    const permissions = {
      hasPermission: jest.fn().mockResolvedValue(true),
      getActivePositionCodes: jest.fn().mockResolvedValue(new Set(['KAPROG'])),
    };
    const service = new SemesterClosingService(prisma as never, {} as never, permissions as never);

    const detail = await service.closureDetail('closure-1', {
      keycloakId: 'kc-tu-kaprog',
      roles: ['TATA_USAHA', 'KAPROG'],
    } as AuthUser);
    const snapshot = detail.snapshot as { scope: { kind: string; majorCodes?: string[] }; finalReport: { classHeatmap: Array<{ majorCode: string | null }> } };

    expect(snapshot.scope).toEqual({ kind: 'major', majorCodes: ['TKJ'] });
    expect(snapshot.finalReport.classHeatmap).toHaveLength(1);
    expect(snapshot.finalReport.classHeatmap.at(0)?.majorCode).toBe('TKJ');
  });

  it('defines the additive migration constraints and permissions expected by Wave 7', () => {
    const sql = readFileSync(
      join(process.cwd(), '../../packages/database/prisma/migrations/20260820000001_wave7_semester_closing/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "school"."semester_closures"');
    expect(sql).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? "semester_closures_semester_id_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? "semester_closures_idempotency_key_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? "academic_years_single_active_idx"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX(?: IF NOT EXISTS)? "semesters_single_active_idx"/);
    expect(sql).toContain('"semesters_number_check"');
    expect(sql).toContain('"semesters_date_order_check"');
    expect(sql).toContain('academic.period.read');
    expect(sql).toContain('academic.period.manage');
    expect(sql).toContain('academic.semester.close');
    expect(sql).toContain('academic.final-report.read');
    expect(sql.toLowerCase()).not.toContain('keycloak');
  });
});
