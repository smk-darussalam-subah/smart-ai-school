// =============================================================================
// 2H: ReportCards (M12) + ClassActivities (M9) — pipeline, snapshot, ownership
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { ReportCardsService } from '../report-cards/report-cards.service';
import { ReportCardsController } from '../report-cards/report-cards.controller';
import { ClassActivitiesService } from '../class-activities/class-activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificationService } from '../notification/notification.service';
import { PrivateObjectStorageService } from '../storage/private-object-storage.service';
import { EVENTS } from '../events/events.types';
import { TransitionSchema, UpdateNotesSchema } from '../report-cards/dto/report-card.dto';

const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;
const SA_GURU: AuthUser = { keycloakId: 'kc-sa-guru', username: 'admin-guru', roles: ['SUPER_ADMIN', 'GURU'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 's1', roles: ['SISWA'] } as AuthUser;
const ORTU: AuthUser = { keycloakId: 'kc-ortu', username: 'o1', roles: ['ORANG_TUA'] } as AuthUser;
const WAKA_KURIKULUM: AuthUser = { keycloakId: 'kc-waka-kur', username: 'wk', roles: ['GURU', 'WAKA_KURIKULUM'] } as AuthUser;
const WAKA_KESISWAAN: AuthUser = { keycloakId: 'kc-waka-sis', username: 'ws', roles: ['GURU', 'WAKA_KESISWAAN'] } as AuthUser;
const KAPROG: AuthUser = { keycloakId: 'kc-kaprog', username: 'kaprog', roles: ['GURU', 'KAPROG'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'kepsek', roles: ['KEPALA_SEKOLAH'] } as AuthUser;

describe('ReportCardsService', () => {
  let service: ReportCardsService;
  const emit = jest.fn();
  const rcFindMany = jest.fn();
  const rcFindFirst = jest.fn();
  const rcFindUnique = jest.fn();
  const rcCount = jest.fn();
  const rcCreate = jest.fn();
  const rcUpdate = jest.fn();
  const rcUpdateMany = jest.fn();
  const statusEventCreate = jest.fn();
  const executeRaw = jest.fn();
  const queryRaw = jest.fn();
  const classFindUnique = jest.fn();
  const classFindMany = jest.fn();
  const gradeFindMany = jest.fn();
  const gradeFindFirst = jest.fn();
  const attGroupBy = jest.fn();
  const teacherFindFirst = jest.fn();
  const teacherFindUnique = jest.fn();
  const teachingAssignmentFindMany = jest.fn();
  const studentFindFirst = jest.fn();
  const studentFindUnique = jest.fn();
  const userFindUnique = jest.fn();
  const kktpConfigFindUnique = jest.fn();
  const notificationLogCreateMany = jest.fn();
  const notificationLogFindMany = jest.fn();
  const academicYearFindFirst = jest.fn();
  const academicYearFindMany = jest.fn();
  const appointmentFindMany = jest.fn();
  const classFindFirst = jest.fn();
  const serviceHasPermission = jest.fn();
  const serviceGetActivePositionCodes = jest.fn();
  const enqueueCommittedPendingLogs = jest.fn();

  beforeEach(async () => {
    [emit, rcFindMany, rcFindFirst, rcFindUnique, rcCount, rcCreate, rcUpdate, rcUpdateMany, statusEventCreate,
      executeRaw, queryRaw, classFindUnique,
      classFindMany, gradeFindMany, gradeFindFirst, attGroupBy, teacherFindFirst, teacherFindUnique,
      teachingAssignmentFindMany, studentFindFirst, studentFindUnique, userFindUnique, kktpConfigFindUnique,
      notificationLogCreateMany, notificationLogFindMany, academicYearFindMany, appointmentFindMany, classFindFirst]
      .forEach((m) => m.mockReset());
    [serviceHasPermission, serviceGetActivePositionCodes, enqueueCommittedPendingLogs].forEach((m) => m.mockReset());
    rcUpdate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'rc-1', ...a.data }));
    rcUpdateMany.mockResolvedValue({ count: 1 });
    classFindMany.mockResolvedValue([]);
    gradeFindFirst.mockResolvedValue(null);
    academicYearFindFirst.mockResolvedValue({ code: '2025/2026' });
    academicYearFindMany.mockResolvedValue([{ id: 'ay-active', code: '2026/2027', semesters: [{ number: 1 }] }]);
    kktpConfigFindUnique.mockResolvedValue(null);
    notificationLogCreateMany.mockResolvedValue({ count: 3 });
    notificationLogFindMany.mockResolvedValue([{ id: 'nl-1' }, { id: 'nl-2' }, { id: 'nl-3' }]);
    studentFindUnique.mockResolvedValue({ userId: 'user-s1', parentId: 'parent-s1', parent: { phone: '08123456789' } });
    enqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 3 });
    serviceHasPermission.mockResolvedValue(true);
    serviceGetActivePositionCodes.mockResolvedValue(new Set(['WAKA_KURIKULUM']));

    const prisma = {
      reportCard: {
        findMany: rcFindMany, findFirst: rcFindFirst, findUnique: rcFindUnique, count: rcCount,
        create: rcCreate, update: rcUpdate, updateMany: rcUpdateMany,
      },
      class: { findUnique: classFindUnique, findMany: classFindMany, findFirst: classFindFirst },
      grade: { findMany: gradeFindMany, findFirst: gradeFindFirst },
      attendance: { groupBy: attGroupBy },
      teacher: { findFirst: teacherFindFirst, findUnique: teacherFindUnique },
      teachingAssignment: { findMany: teachingAssignmentFindMany },
      student: { findFirst: studentFindFirst, findUnique: studentFindUnique },
      user: { findUnique: userFindUnique },
      kktpConfig: { findUnique: kktpConfigFindUnique },
      notificationLog: { createMany: notificationLogCreateMany, findMany: notificationLogFindMany },
      academicYear: { findFirst: academicYearFindFirst, findMany: academicYearFindMany },
      appointment: { findMany: appointmentFindMany },
      reportCardStatusEvent: { create: statusEventCreate },
      $executeRaw: executeRaw,
      $queryRaw: queryRaw,
    };
    const transaction = jest.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    Object.assign(prisma, { $transaction: transaction });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit } },
        {
          provide: PermissionsService,
          useValue: {
            hasPermission: serviceHasPermission,
            getActivePositionCodes: serviceGetActivePositionCodes,
          },
        },
        { provide: NotificationService, useValue: { enqueueCommittedPendingLogs } },
      ],
    }).compile();
    service = module.get(ReportCardsService);
  });

  it('generate: snapshot per mapel (count/average/byType) + idempoten skip existing', async () => {
    classFindUnique.mockResolvedValue({
      id: 'c1', name: 'XI TKJ 1', academicYear: '2026/2027', isActive: true, teacher: null,
      students: [
        { id: 's1', nis: '1001', user: { fullName: 'Siswa Satu' } },
        { id: 's2', nis: '1002', user: { fullName: 'Siswa Dua' } },
      ],
    });
    rcFindMany.mockResolvedValue([{ id: 'rc-s2', studentId: 's2', status: 'checked' }]);
    gradeFindMany.mockResolvedValue([
      { score: '80', type: 'uh', assignment: { subject: 'Matematika' } },
      { score: '90', type: 'uts', assignment: { subject: 'Matematika' } },
      { score: '70', type: 'uh', assignment: { subject: 'Fisika' } },
    ]);
    attGroupBy.mockResolvedValue([
      { status: 'hadir', _count: { _all: 90 } },
      { status: 'sakit', _count: { _all: 2 } },
    ]);
    rcCreate.mockResolvedValue({ id: 'rc-new' });

    const res = await service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 });

    expect(res).toEqual({ generated: 1, refreshed: 0, skipped: 1, totalStudents: 2 });
    const data = rcCreate.mock.calls[0][0].data;
    const mtk = (data.grades as { subject: string; average: number; byType: Record<string, number> }[])
      .find((g) => g.subject === 'Matematika')!;
    expect(mtk.average).toBe(85);
    expect(mtk.byType).toEqual({ uh: 80, uts: 90 });
    expect(mtk).toEqual(expect.objectContaining({ kktp: 75, kktpProvenance: 'system_default' }));
    expect(data.attendance).toEqual({ hadir: 90, izin: 0, sakit: 2, alpha: 0 });
    expect(data).toEqual(expect.objectContaining({
      studentNameSnapshot: 'Siswa Satu',
      studentNisSnapshot: '1001',
      classNameSnapshot: 'XI TKJ 1',
      homeroomTeacherNameSnapshot: null,
    }));
  });

  it('generate memakai NA berbobot yang dinormalisasi, bukan rata-rata mentah', async () => {
    classFindUnique.mockResolvedValue({
      id: 'c1', name: 'XI TKJ 1', academicYear: '2026/2027', isActive: true, teacher: null,
      students: [{ id: 's1', nis: '1001', user: { fullName: 'Siswa Satu' } }],
    });
    rcFindMany.mockResolvedValue([]);
    gradeFindMany.mockResolvedValue([
      { score: '100', type: 'uh', assignment: { subject: 'Produktif' } },
      { score: '0', type: 'praktik', assignment: { subject: 'Produktif' } },
    ]);
    attGroupBy.mockResolvedValue([]);
    rcCreate.mockResolvedValue({ id: 'rc-new' });

    await service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 });

    const grades = rcCreate.mock.calls[0][0].data.grades as Array<{ average: number }>;
    expect(grades[0]?.average).toBe(44.4);
  });

  it('generate menyimpan KKTP config berbeda per mapel pada snapshot', async () => {
    classFindUnique.mockResolvedValue({
      id: 'c1', name: 'XI TKJ 1', academicYear: '2026/2027', isActive: true, teacher: null,
      students: [{ id: 's1', nis: '1001', user: { fullName: 'Siswa Satu' } }],
    });
    rcFindMany.mockResolvedValue([]);
    gradeFindMany.mockResolvedValue([
      { score: '80', type: 'uh', assignment: { subject: 'Matematika' } },
      { score: '85', type: 'uh', assignment: { subject: 'Produktif TKJ' } },
    ]);
    kktpConfigFindUnique.mockImplementation(({ where }: { where: { subject_academicYear_semester: { subject: string } } }) =>
      Promise.resolve(where.subject_academicYear_semester.subject === 'Matematika'
        ? { kktp: 72 }
        : { kktp: 80 }));
    attGroupBy.mockResolvedValue([]);
    rcCreate.mockResolvedValue({ id: 'rc-new' });

    await service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 });

    const grades = rcCreate.mock.calls[0][0].data.grades as Array<{ subject: string; kktp: number; kktpProvenance: string }>;
    expect(grades).toEqual([
      expect.objectContaining({ subject: 'Matematika', kktp: 72, kktpProvenance: 'config' }),
      expect.objectContaining({ subject: 'Produktif TKJ', kktp: 80, kktpProvenance: 'config' }),
    ]);
  });

  it('generate menolak periode non-aktif sebelum membaca kelas', async () => {
    academicYearFindMany.mockResolvedValue([{ id: 'ay-active', code: '2026/2027', semesters: [{ number: 2 }] }]);

    await expect(service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow('periode aktif 2026/2027 semester 2');
    expect(classFindUnique).not.toHaveBeenCalled();
  });

  it('generate fail-closed bila periode aktif ambigu', async () => {
    academicYearFindMany.mockResolvedValue([
      { id: 'ay-1', code: '2026/2027', semesters: [{ number: 1 }] },
      { id: 'ay-2', code: '2027/2028', semesters: [{ number: 1 }] },
    ]);

    await expect(service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow('harus tepat satu');
    expect(classFindUnique).not.toHaveBeenCalled();

    academicYearFindMany.mockResolvedValue([{ id: 'ay-1', code: '2026/2027', semesters: [{ number: 1 }, { number: 2 }] }]);
    await expect(service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow('harus tepat satu');
    expect(classFindUnique).not.toHaveBeenCalled();
  });

  it('generate: kelas tanpa siswa aktif → BadRequest; kelas tak ada → NotFound', async () => {
    classFindUnique.mockResolvedValue({ id: 'c1', name: 'XI TKJ 1', academicYear: '2026/2027', isActive: true, teacher: null, students: [] });
    await expect(service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow(BadRequestException);
    classFindUnique.mockResolvedValue(null);
    await expect(service.generate({ classId: 'cX', academicYear: '2026/2027', semester: 1 }))
      .rejects.toThrow(NotFoundException);
  });

  it('generate menyegarkan draft yang sudah ada tanpa mengubah rapor non-draft', async () => {
    classFindUnique.mockResolvedValue({
      id: 'c1', name: 'XI TKJ 1', academicYear: '2026/2027', isActive: true, teacher: null,
      students: [{ id: 's1', nis: '1001', user: { fullName: 'Siswa Satu' } }],
    });
    rcFindMany.mockResolvedValue([{ id: 'rc-1', studentId: 's1', status: 'draft' }]);
    gradeFindMany.mockResolvedValue([]);
    attGroupBy.mockResolvedValue([]);

    const result = await service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 });

    expect(result).toEqual({ generated: 0, refreshed: 1, skipped: 0, totalStudents: 1 });
    expect(rcUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rc-1', status: 'draft' },
    }));
    expect(rcCreate).not.toHaveBeenCalled();
  });

  it('generate menolak tahun ajaran yang berbeda dari kelas', async () => {
    classFindUnique.mockResolvedValue({
      id: 'c1', name: 'XI TKJ 1', academicYear: '2025/2026', isActive: true, teacher: null,
      students: [{ id: 's1', nis: '1001', user: { fullName: 'Siswa Satu' } }],
    });

    await expect(
      service.generate({ classId: 'c1', academicYear: '2026/2027', semester: 1 }),
    ).rejects.toThrow('Tahun ajaran rapor harus sama dengan tahun ajaran kelas');
    expect(rcCreate).not.toHaveBeenCalled();
  });

  it('pipeline: check draft→checked; publish butuh checked (draft → 409)', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Waka Kurikulum' });
    rcFindUnique.mockResolvedValue({
      id: 'rc-1',
      status: 'draft',
      studentId: 's1',
      classId: 'c1',
      academicYear: '2026/2027',
      semester: 1,
      generatedAt: new Date('2026-08-13T00:00:00.000Z'),
      grades: [{ subject: 'Matematika', count: 1, average: 80, byType: { uh: 80 }, kktp: 75, kktpProvenance: 'config' }],
    });
    await service.transition('rc-1', { action: 'check' }, WAKA_KURIKULUM);
    expect(executeRaw).toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
    expect(rcUpdateMany.mock.calls[0][0].data.status).toBe('checked');
    expect(rcUpdateMany.mock.calls[0][0].data.checkedAt).toBeInstanceOf(Date);
    expect(rcUpdateMany.mock.calls[0][0].data.checkedByName).toBe('Waka Kurikulum');
    expect(statusEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'check', fromStatus: 'draft', toStatus: 'checked' }),
    }));
    expect(rcFindUnique.mock.calls.at(-1)?.[0].select.statusEvents).toBeDefined();

    await expect(service.transition('rc-1', { action: 'publish' }, SA))
      .rejects.toThrow(ConflictException); // masih draft di mock
  });

  it('menolak check draft jika Grade berubah setelah draft rapor dibuat', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Waka Kurikulum' });
    rcFindUnique.mockResolvedValue({
      id: 'rc-1',
      status: 'draft',
      studentId: 's1',
      classId: 'c1',
      academicYear: '2026/2027',
      semester: 1,
      generatedAt: new Date('2026-08-13T01:00:00.000Z'),
      grades: [{ subject: 'Matematika', count: 1, average: 80, byType: { uh: 80 }, kktp: 75, kktpProvenance: 'config' }],
    });
    gradeFindFirst.mockResolvedValue({ id: 'grade-1', updatedAt: new Date('2026-08-13T01:05:00.000Z') });

    await expect(service.transition('rc-1', { action: 'check' }, WAKA_KURIKULUM))
      .rejects.toThrow(ConflictException);
    expect(rcUpdateMany).not.toHaveBeenCalled();
  });

  it('menolak check draft legacy yang belum memiliki snapshot KKTP', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Waka Kurikulum' });
    rcFindUnique.mockResolvedValue({
      id: 'rc-1',
      status: 'draft',
      studentId: 's1',
      classId: 'c1',
      academicYear: '2026/2027',
      semester: 1,
      generatedAt: new Date('2026-08-13T01:00:00.000Z'),
      grades: [{ subject: 'Matematika', count: 1, average: 80, byType: { uh: 80 } }],
    });

    await expect(service.transition('rc-1', { action: 'check' }, WAKA_KURIKULUM))
      .rejects.toThrow('Snapshot KKTP belum lengkap');
    expect(gradeFindFirst).not.toHaveBeenCalled();
    expect(rcUpdateMany).not.toHaveBeenCalled();
  });

  it('distribute: published→distributed + durable notification handoff + event observer', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    const result = await service.transition('rc-1', { action: 'distribute' }, SA);
    expect(rcUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'distributed',
        distributedBy: 'kc-sa',
        distributedByName: 'Administrator Sekolah',
      }),
    }));
    expect(statusEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'distribute', actorId: 'kc-sa', actorName: 'Administrator Sekolah',
      }),
    }));
    expect(emit).toHaveBeenCalledWith(EVENTS.REPORT_DISTRIBUTED, expect.objectContaining({
      reportCardId: 'rc-1', studentId: 's1',
    }));
    expect(notificationLogCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ channel: 'push', recipient: 'user-s1', body: expect.not.stringContaining('Siswa') }),
        expect.objectContaining({ channel: 'push', recipient: 'parent-s1' }),
        expect.objectContaining({ channel: 'whatsapp', recipient: '+628123456789' }),
      ]),
      skipDuplicates: true,
    }));
    expect(enqueueCommittedPendingLogs).toHaveBeenCalledWith(['nl-1', 'nl-2', 'nl-3']);
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'queued', intentCount: 3, queuedCount: 3 },
    }));
  });

  it('distribute tetap mengembalikan recovery handoff ketika queue belum siap', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    enqueueCommittedPendingLogs.mockRejectedValue(new Error('queue down'));

    const result = await service.transition('rc-1', { action: 'distribute' }, SA);

    expect(notificationLogCreateMany).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'pending_recovery', intentCount: 3, queuedCount: 0 },
    }));
  });

  it('distribute melaporkan pending_recovery ketika antrean hanya menerima sebagian intent', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    enqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 2 });

    const result = await service.transition('rc-1', { action: 'distribute' }, SA);

    expect(notificationLogCreateMany).toHaveBeenCalled();
    expect(enqueueCommittedPendingLogs).toHaveBeenCalledWith(['nl-1', 'nl-2', 'nl-3']);
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'pending_recovery', intentCount: 3, queuedCount: 2 },
    }));
  });

  it('distribute parent tanpa nomor tetap mendapat push intent tanpa WhatsApp', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    studentFindUnique.mockResolvedValue({ userId: 'user-s1', parentId: 'parent-s1', parent: { phone: null } });
    notificationLogFindMany.mockResolvedValue([{ id: 'nl-student' }, { id: 'nl-parent' }]);
    enqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 2 });

    const result = await service.transition('rc-1', { action: 'distribute' }, SA);

    const rows = notificationLogCreateMany.mock.calls[0][0].data as Array<{ channel: string; recipient: string }>;
    expect(rows).toEqual([
      expect.objectContaining({ channel: 'push', recipient: 'user-s1' }),
      expect.objectContaining({ channel: 'push', recipient: 'parent-s1' }),
    ]);
    expect(rows.some((row) => row.channel === 'whatsapp')).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'queued', intentCount: 2, queuedCount: 2 },
    }));
  });

  it.each([
    ['format lokal 08', '0812 3456 7890', '+6281234567890'],
    ['format E.164', '+6281234567890', '+6281234567890'],
  ])('distribute menormalisasi nomor WhatsApp wali %s', async (_label, inputPhone, expectedPhone) => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    studentFindUnique.mockResolvedValue({ userId: 'user-s1', parentId: 'parent-s1', parent: { phone: inputPhone } });

    await service.transition('rc-1', { action: 'distribute' }, SA);

    const rows = notificationLogCreateMany.mock.calls[0][0].data as Array<{ channel: string; recipient: string }>;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'whatsapp', recipient: expectedPhone }),
    ]));
    expect(rows.filter((row) => row.channel === 'whatsapp' && row.recipient === expectedPhone)).toHaveLength(1);
  });

  it('distribute memakai recipient normal yang sama untuk nomor ekuivalen sehingga duplicate lama di-skip', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    studentFindUnique.mockResolvedValue({ userId: 'user-s1', parentId: 'parent-s1', parent: { phone: '08 12-3456-7890' } });
    notificationLogCreateMany.mockResolvedValue({ count: 2 });
    notificationLogFindMany.mockResolvedValue([{ id: 'nl-student' }, { id: 'nl-parent' }, { id: 'existing-whatsapp' }]);
    enqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 3 });

    const result = await service.transition('rc-1', { action: 'distribute' }, SA);

    expect(notificationLogCreateMany.mock.calls[0][0]).toEqual(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ channel: 'whatsapp', recipient: '+6281234567890' }),
      ]),
      skipDuplicates: true,
    }));
    expect(enqueueCommittedPendingLogs).toHaveBeenCalledWith(['nl-student', 'nl-parent', 'existing-whatsapp']);
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'queued', intentCount: 3, queuedCount: 3 },
    }));
  });

  it('distribute mengabaikan nomor WhatsApp wali invalid tanpa membatalkan push/in-app', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    studentFindUnique.mockResolvedValue({ userId: 'user-s1', parentId: 'parent-s1', parent: { phone: '0812ABC' } });
    notificationLogFindMany.mockResolvedValue([{ id: 'nl-student' }, { id: 'nl-parent' }]);
    enqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 2 });

    const result = await service.transition('rc-1', { action: 'distribute' }, SA);

    const rows = notificationLogCreateMany.mock.calls[0][0].data as Array<{ channel: string; recipient: string }>;
    expect(rows).toEqual([
      expect.objectContaining({ channel: 'push', recipient: 'user-s1' }),
      expect.objectContaining({ channel: 'push', recipient: 'parent-s1' }),
    ]);
    expect(rows.some((row) => row.channel === 'whatsapp')).toBe(false);
    expect(result).toEqual(expect.objectContaining({
      notificationHandoff: { status: 'queued', intentCount: 2, queuedCount: 2 },
    }));
  });

  it('return: checked ke draft menyimpan alasan dan audit actor', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Waka Kurikulum' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'checked', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    await service.transition('rc-1', { action: 'return', reason: 'Perbaiki catatan wali kelas' }, WAKA_KURIKULUM);
    expect(rcUpdateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({
      status: 'draft',
      returnedBy: 'kc-waka-kur',
      returnedByName: 'Waka Kurikulum',
      returnReason: 'Perbaiki catatan wali kelas',
    }));
    expect(emit).not.toHaveBeenCalled();
  });

  it('service menolak SA dan SA+GURU mengambil tugas check/return Waka', async () => {
    await expect(service.transition('rc-1', { action: 'check' }, SA))
      .rejects.toThrow('hanya untuk Waka Kurikulum');
    await expect(service.transition(
      'rc-1', { action: 'return', reason: 'Perbaiki catatan wali kelas' }, SA_GURU,
    )).rejects.toThrow('hanya untuk Waka Kurikulum');
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(rcFindUnique).not.toHaveBeenCalled();
  });

  it('service mengizinkan bantuan publish SA+GURU dan mencatat identitas SA sebenarnya', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Super Admin Aktual' });
    rcFindUnique.mockResolvedValue({
      id: 'rc-1', status: 'checked', studentId: 's1', academicYear: '2026/2027', semester: 1,
    });

    await service.transition('rc-1', { action: 'publish' }, SA_GURU);

    expect(rcUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'published',
        publishedBy: 'kc-sa-guru',
        publishedByName: 'Super Admin Aktual',
      }),
    }));
    expect(statusEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'publish', actorId: 'kc-sa-guru', actorName: 'Super Admin Aktual',
      }),
    }));
    expect(serviceHasPermission).toHaveBeenCalledWith(
      'kc-sa-guru', ['SUPER_ADMIN', 'GURU'], 'report.publish',
    );
    expect(serviceGetActivePositionCodes).not.toHaveBeenCalled();
  });

  it('service menolak guru biasa melakukan publish meski memiliki permission grant', async () => {
    serviceGetActivePositionCodes.mockResolvedValue(new Set());

    await expect(service.transition('rc-1', { action: 'publish' }, GURU))
      .rejects.toThrow("Aktor tidak berwenang menjalankan aksi 'publish'");
    expect(rcFindUnique).not.toHaveBeenCalled();
  });

  it('DTO return menolak alasan kosong', () => {
    expect(TransitionSchema.safeParse({ action: 'return' }).success).toBe(false);
    expect(TransitionSchema.safeParse({ action: 'return', reason: 'Perbaiki nilai' }).success).toBe(true);
  });

  it('transisi gagal tertutup bila status rapor berubah secara bersamaan', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'checked', studentId: 's1', academicYear: '2026/2027', semester: 1 });
    rcUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.transition('rc-1', { action: 'publish' }, SA))
      .rejects.toThrow('Status rapor berubah');
  });

  it('recovery SA mengembalikan rapor ke draft dengan referensi insiden', async () => {
    userFindUnique.mockResolvedValue({ fullName: 'Administrator Sekolah' });
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'distributed' });

    await service.recover('rc-1', {
      reason: 'Dokumen dibuka kembali setelah koreksi data terverifikasi.',
      incidentReference: 'INC-2026-0042',
    }, SA);

    expect(rcUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rc-1', status: 'distributed' },
      data: expect.objectContaining({ status: 'draft', publishedAt: null, distributedAt: null }),
    }));
    expect(statusEventCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'recover',
        fromStatus: 'distributed',
        toStatus: 'draft',
        actorId: 'kc-sa',
        actorName: 'Administrator Sekolah',
        incidentReference: 'INC-2026-0042',
      }),
    }));
  });

  it('recovery menolak aktor non-SA dan konflik perubahan bersamaan', async () => {
    await expect(service.recover('rc-1', {
      reason: 'Alasan pemulihan operasional yang dapat diaudit.',
      incidentReference: 'INC-2026-0043',
    }, GURU)).rejects.toThrow(ForbiddenException);

    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'published' });
    rcUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.recover('rc-1', {
      reason: 'Alasan pemulihan operasional yang dapat diaudit.',
      incidentReference: 'INC-2026-0043',
    }, SA)).rejects.toThrow('Status rapor berubah');
  });

  it('bagian rapor resmi hanya membaca snapshot dan tidak menghitung ulang data hidup', async () => {
    rcFindFirst.mockResolvedValue({
      id: 'rc-historis',
      status: 'distributed',
      studentNameSnapshot: 'Nama Saat Terbit',
      studentNisSnapshot: '1001',
      classNameSnapshot: 'XI TKJ 1',
      homeroomTeacherNameSnapshot: 'Wali Saat Terbit',
      publishedAt: new Date('2026-06-20T08:00:00.000Z'),
      publishedByName: 'Kepala Sekolah Saat Terbit',
      grades: [
        { subject: 'Muatan Lokal Jawa', count: 2, average: 88.8, byType: { uh: 100, praktik: 80 }, kktp: 80, kktpProvenance: 'config' },
        { subject: 'Matematika', count: 2, average: 76.5, byType: { uh: 80, uas: 75 }, kktp: 78, kktpProvenance: 'config' },
      ],
      attendance: { hadir: 90, izin: 2, sakit: 1, alpha: 0 },
    });

    const result = await service.findOfficialSections('s1', '2025/2026', 2, SA);

    expect(result.muatanLokal.subjects).toEqual([expect.objectContaining({
      name: 'Muatan Lokal Jawa', na: 88.8, kktp: 80, kktpProvenance: 'config', predikat: 'Tuntas',
    })]);
    expect(result.attendance).toEqual({ hadir: 90, izin: 2, sakit: 1, alpha: 0, total: 93 });
    expect(result.approval).toEqual(expect.objectContaining({
      homeroomTeacher: 'Wali Saat Terbit',
      principal: 'Kepala Sekolah Saat Terbit',
      className: 'XI TKJ 1',
    }));
    expect(gradeFindMany).not.toHaveBeenCalled();
    expect(attGroupBy).not.toHaveBeenCalled();
    expect(appointmentFindMany).not.toHaveBeenCalled();
    expect(classFindUnique).not.toHaveBeenCalled();
  });

  it('bagian resmi snapshot legacy tidak memalsukan KKTP 75', async () => {
    rcFindFirst.mockResolvedValue({
      id: 'rc-legacy',
      status: 'distributed',
      studentNameSnapshot: 'Nama Saat Terbit',
      studentNisSnapshot: '1001',
      classNameSnapshot: 'XI TKJ 1',
      homeroomTeacherNameSnapshot: 'Wali Saat Terbit',
      publishedAt: new Date('2026-06-20T08:00:00.000Z'),
      publishedByName: 'Kepala Sekolah Saat Terbit',
      grades: [
        { subject: 'Muatan Lokal Jawa', count: 2, average: 88.8, byType: { uh: 100, praktik: 80 } },
      ],
      attendance: {},
    });

    const result = await service.findOfficialSections('s1', '2025/2026', 2, SA);

    expect(result.muatanLokal.subjects).toEqual([expect.objectContaining({
      name: 'Muatan Lokal Jawa',
      kktp: null,
      predikat: 'Snapshot KKTP tidak tersedia',
    })]);
  });

  it('bagian rapor keluarga wajib berasal dari snapshot berstatus distributed', async () => {
    studentFindFirst.mockResolvedValue({ id: 's1' });
    rcFindFirst.mockResolvedValue(null);

    await expect(service.findOfficialSections('s1', '2025/2026', 2, SISWA))
      .rejects.toThrow('Rapor belum dibagikan');
    expect(rcFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { studentId: 's1' },
          expect.objectContaining({ studentId: 's1', status: 'distributed' }),
        ],
      },
    }));
  });

  it('bagian rapor siswa menginterseksikan studentId route dengan ownership', async () => {
    studentFindFirst.mockResolvedValue({ id: 's1' });
    rcFindFirst.mockResolvedValue(null);

    await expect(service.findOfficialSections('s2', '2025/2026', 2, SISWA))
      .rejects.toThrow('Rapor belum dibagikan');
    expect(rcFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { studentId: 's1' },
          expect.objectContaining({ studentId: 's2', status: 'distributed' }),
        ],
      },
    }));
  });

  it('bagian rapor orang tua menginterseksikan studentId route dengan daftar anak', async () => {
    userFindUnique.mockResolvedValue({ parent: [{ id: 'anak-1' }, { id: 'anak-2' }] });
    rcFindFirst.mockResolvedValue(null);

    await expect(service.findOfficialSections('anak-lain', '2025/2026', 2, ORTU))
      .rejects.toThrow('Rapor belum dibagikan');
    expect(rcFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        AND: [
          { studentId: { in: ['anak-1', 'anak-2'] }, status: 'distributed' },
          expect.objectContaining({ studentId: 'anak-lain', status: 'distributed' }),
        ],
      },
    }));
  });

  it('ownership: SISWA hanya rapor sendiri + status distributed DI QUERY', async () => {
    studentFindFirst.mockResolvedValue({ id: 'stu-1' });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 100, status: 'draft' }, SISWA);
    const where = rcFindMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { studentId: 'stu-1' },
      { status: 'distributed' },
    ]));
  });

  it('ownership: ORTU → anak-anaknya + distributed; GURU → kelas ampuannya', async () => {
    userFindUnique.mockResolvedValue({ parent: [{ id: 'anak-1' }, { id: 'anak-2' }] });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 100 }, ORTU);
    let where = rcFindMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(expect.arrayContaining([
      { studentId: { in: ['anak-1', 'anak-2'] }, status: 'distributed' },
      { status: 'distributed' },
    ]));

    userFindUnique.mockResolvedValue({ id: 'guru-user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c1' }, { classId: 'c1' }]);
    classFindMany.mockResolvedValue([{ id: 'c2' }]);
    await service.findAll({ page: 1, limit: 100 }, GURU);
    where = rcFindMany.mock.calls[1][0].where;
    expect(where.AND).toEqual([{ classId: { in: ['c1', 'c2'] } }]);
  });

  it('ownership: selected child filter parent tetap diinterseksi dengan ownership dan distributed', async () => {
    userFindUnique.mockResolvedValue({ parent: [{ id: 'anak-1' }, { id: 'anak-2' }] });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20, studentId: 'anak-2', status: 'draft' }, ORTU);

    expect(rcFindMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([
      { studentId: { in: ['anak-1', 'anak-2'] }, status: 'distributed' },
      { studentId: 'anak-2' },
      { status: 'distributed' },
    ]));
  });

  it('ownership: filter classId guru diinterseksi dan class luar ditolak', async () => {
    userFindUnique.mockResolvedValue({ id: 'guru-user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c1' }]);
    classFindMany.mockResolvedValue([{ id: 'c2' }]);
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20, classId: 'c1' }, GURU);
    expect(rcFindMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([
      { classId: { in: ['c1', 'c2'] } },
      { classId: 'c1' },
    ]));

    await expect(service.findAll({ page: 1, limit: 20, classId: 'outside' }, GURU))
      .rejects.toThrow('Kelas berada di luar scope guru aktif');
  });

  it('SUPER_ADMIN + GURU tidak menerima metadata pengelola draft', async () => {
    rcFindMany.mockResolvedValue([{ id: 'rc-1', classId: 'c1' }]);
    rcCount.mockResolvedValue(1);

    const result = await service.findAll({ page: 1, limit: 20 }, SA_GURU);

    expect(result.data).toEqual([expect.objectContaining({ id: 'rc-1', canManageDraft: false })]);
    expect(teacherFindUnique).not.toHaveBeenCalled();
    expect(classFindMany).not.toHaveBeenCalled();
  });

  it('pilihan kelas SUPER_ADMIN + GURU tidak menandai kelas sebagai draft-manageable', async () => {
    classFindMany.mockResolvedValue([
      { id: 'c1', name: 'XI TKJ 1', teacherId: 'teacher-1' },
    ]);

    const result = await service.listReadableClasses(SA_GURU);

    expect(result.data).toEqual([{ id: 'c1', name: 'XI TKJ 1', canManageDraft: false }]);
    expect(teacherFindUnique).not.toHaveBeenCalled();
  });

  it('notes: hanya draft (checked → 409)', async () => {
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'checked' });
    await expect(service.updateNotes('rc-1', {
      notes: 'x', expectedUpdatedAt: new Date('2026-08-13T01:00:00.000Z'),
    })).rejects.toThrow(ConflictException);
  });

  it('notes gagal tertutup bila rapor meninggalkan draft secara bersamaan', async () => {
    const expectedUpdatedAt = new Date('2026-08-13T01:00:00.000Z');
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'draft', classId: 'c1' });
    rcUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.updateNotes('rc-1', { notes: 'x', expectedUpdatedAt }))
      .rejects.toThrow('Rapor telah berubah');
    expect(rcUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rc-1', status: 'draft', updatedAt: expectedUpdatedAt },
    }));
  });

  it('notes memakai version CAS sehingga hanya satu penulis dengan versi sama yang berhasil', async () => {
    const expectedUpdatedAt = new Date('2026-08-13T01:00:00.000Z');
    rcFindUnique.mockResolvedValue({ id: 'rc-1', status: 'draft', classId: 'c1' });
    rcUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(service.updateNotes('rc-1', { notes: 'Penulis pertama', expectedUpdatedAt }))
      .resolves.toBeDefined();
    await expect(service.updateNotes('rc-1', { notes: 'Penulis kedua', expectedUpdatedAt }))
      .rejects.toThrow('Rapor telah berubah');

    expect(rcUpdateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { id: 'rc-1', status: 'draft', updatedAt: expectedUpdatedAt },
      data: expect.objectContaining({
        notes: 'Penulis pertama',
        updatedAt: expect.any(Date),
      }),
    }));
    expect((rcUpdateMany.mock.calls[0][0].data.updatedAt as Date).getTime())
      .toBeGreaterThan(expectedUpdatedAt.getTime());
  });

  it('menolak SUPER_ADMIN + GURU dari generate dan catatan pada service boundary', async () => {
    await expect(service.generate({
      classId: 'c1', academicYear: '2026/2027', semester: 1,
    }, SA_GURU)).rejects.toThrow('Super Admin hanya dapat memakai jalur pemulihan');
    await expect(service.updateNotes('rc-1', {
      notes: 'Tidak boleh', expectedUpdatedAt: new Date('2026-08-13T01:00:00.000Z'),
    }, SA_GURU)).rejects.toThrow('Super Admin hanya dapat memakai jalur pemulihan');
    expect(classFindUnique).not.toHaveBeenCalled();
    expect(rcFindUnique).not.toHaveBeenCalled();
  });

  it('guru wali biasa tetap dapat menyimpan catatan dengan versi terbaru', async () => {
    const expectedUpdatedAt = new Date('2026-08-13T01:00:00.000Z');
    userFindUnique.mockResolvedValue({ id: 'guru-user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    classFindFirst.mockResolvedValue({ id: 'c1' });
    rcFindUnique.mockResolvedValue({
      id: 'rc-1', status: 'draft', classId: 'c1', updatedAt: expectedUpdatedAt,
    });
    rcUpdateMany.mockResolvedValue({ count: 1 });

    await expect(service.updateNotes('rc-1', {
      notes: 'Perkembangan belajar baik.', expectedUpdatedAt,
    }, GURU)).resolves.toBeDefined();
    expect(classFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1', teacherId: 'teacher-1', isActive: true },
    }));
  });

  it('DTO catatan mewajibkan versi dokumen yang valid', () => {
    expect(UpdateNotesSchema.safeParse({ notes: 'Catatan' }).success).toBe(false);
    expect(UpdateNotesSchema.safeParse({
      notes: 'Catatan', expectedUpdatedAt: '2026-08-13T01:00:00.000Z',
    }).success).toBe(true);
    expect(UpdateNotesSchema.safeParse({ notes: 'Catatan', expectedUpdatedAt: null }).success).toBe(false);
  });
  it('WAKA_KURIKULUM membaca seluruh pipeline rapor, bukan scope guru', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-waka' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-waka' });
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 20 }, WAKA_KURIKULUM);
    expect(rcFindMany.mock.calls[0][0].where).toEqual({});
    expect(teachingAssignmentFindMany).not.toHaveBeenCalled();
  });

  it('KAPROG hanya membaca rapor pada jurusan appointment aktif', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-kaprog', isActive: true, deletedAt: null });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-kaprog' });
    academicYearFindMany.mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }]);
    appointmentFindMany.mockResolvedValue([{ majorId: 'major-1', major: { id: 'major-1', code: 'TKJ' } }]);
    rcFindMany.mockResolvedValue([]);
    rcCount.mockResolvedValue(0);
    await service.findAll({ page: 1, limit: 20 }, KAPROG);
    expect(rcFindMany.mock.calls[0][0].where.AND[0].class).toEqual(expect.objectContaining({
      academicYear: '2026/2027', majorCode: { in: ['TKJ'] },
    }));
  });

  it('pilihan kelas KAPROG mengikuti jurusan appointment dan tidak dapat dikelola', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-kaprog', isActive: true, deletedAt: null });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-kaprog' });
    academicYearFindMany.mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }]);
    appointmentFindMany.mockResolvedValue([{ majorId: 'major-1', major: { id: 'major-1', code: 'TKJ' } }]);
    classFindMany.mockResolvedValue([{ id: 'c-tkj', name: 'XI TKJ 1', teacherId: 'teacher-other' }]);

    const result = await service.listReadableClasses(KAPROG);

    expect(classFindMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      academicYear: '2026/2027', majorCode: { in: ['TKJ'] },
    }));
    expect(result.data).toEqual([{ id: 'c-tkj', name: 'XI TKJ 1', canManageDraft: false }]);
  });

  it('pilihan kelas GURU menandai hanya kelas wali sebagai pengelola draft', async () => {
    userFindUnique.mockResolvedValue({ id: 'guru-user-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c-ajar' }]);
    classFindMany
      .mockResolvedValueOnce([{ id: 'c-wali' }])
      .mockResolvedValueOnce([
        { id: 'c-ajar', name: 'XI TKJ 1', teacherId: 'teacher-other' },
        { id: 'c-wali', name: 'X TKJ 1', teacherId: 'teacher-1' },
      ]);

    const result = await service.listReadableClasses(GURU);

    expect(result.data).toEqual([
      { id: 'c-ajar', name: 'XI TKJ 1', canManageDraft: false },
      { id: 'c-wali', name: 'X TKJ 1', canManageDraft: true },
    ]);
  });
});

describe('ReportCardsController action permissions', () => {
  let controller: ReportCardsController;
  const transition = jest.fn();
  const recover = jest.fn();
  const generate = jest.fn();
  const updateNotes = jest.fn();
  const hasPermission = jest.fn();
  const getActivePositionCodes = jest.fn();

  beforeEach(async () => {
    [transition, recover, generate, updateNotes, hasPermission, getActivePositionCodes]
      .forEach((mock) => mock.mockReset());
    transition.mockResolvedValue({ id: 'rc-1' });
    recover.mockResolvedValue({ id: 'rc-1', status: 'draft' });
    hasPermission.mockResolvedValue(true);
    getActivePositionCodes.mockResolvedValue(new Set<string>());
    const module = await Test.createTestingModule({
      controllers: [ReportCardsController],
      providers: [
        { provide: ReportCardsService, useValue: { transition, recover, generate, updateNotes } },
        { provide: PermissionsService, useValue: { hasPermission, getActivePositionCodes } },
      ],
    }).compile();
    controller = module.get(ReportCardsController);
  });

  it('menolak aksi saat permission spesifik tidak dimiliki', async () => {
    hasPermission.mockResolvedValue(false);
    getActivePositionCodes.mockResolvedValue(new Set(['KEPALA_SEKOLAH']));

    await expect(controller.transition('rc-1', { action: 'publish' }, KS))
      .rejects.toThrow("Permission 'report.publish'");
    expect(hasPermission).toHaveBeenCalledWith('kc-ks', ['KEPALA_SEKOLAH'], 'report.publish');
    expect(transition).not.toHaveBeenCalled();
  });

  it('tidak mengizinkan otoritas Waka dipakai untuk publish', async () => {
    getActivePositionCodes.mockResolvedValue(new Set(['WAKA_KURIKULUM']));

    await expect(controller.transition('rc-1', { action: 'publish' }, WAKA_KURIKULUM))
      .rejects.toThrow("Aksi 'publish' hanya untuk KEPALA_SEKOLAH");
    expect(hasPermission).toHaveBeenCalledWith(
      'kc-waka-kur', ['GURU', 'WAKA_KURIKULUM'], 'report.publish',
    );
    expect(transition).not.toHaveBeenCalled();
  });

  it('meneruskan publish setelah permission dan appointment KS cocok', async () => {
    getActivePositionCodes.mockResolvedValue(new Set(['KEPALA_SEKOLAH']));

    await controller.transition('rc-1', { action: 'publish' }, KS);

    expect(transition).toHaveBeenCalledWith('rc-1', { action: 'publish' }, KS);
  });

  it('mengizinkan SA/SA+GURU membantu publish dan distribute tanpa appointment KS', async () => {
    await controller.transition('rc-1', { action: 'publish' }, SA);
    await controller.transition('rc-2', { action: 'distribute' }, SA_GURU);

    expect(transition).toHaveBeenNthCalledWith(1, 'rc-1', { action: 'publish' }, SA);
    expect(transition).toHaveBeenNthCalledWith(2, 'rc-2', { action: 'distribute' }, SA_GURU);
    expect(hasPermission).toHaveBeenNthCalledWith(1, 'kc-sa', ['SUPER_ADMIN'], 'report.publish');
    expect(hasPermission).toHaveBeenNthCalledWith(
      2, 'kc-sa-guru', ['SUPER_ADMIN', 'GURU'], 'report.distribute',
    );
  });

  it('menolak SA/SA+GURU mengambil check dan return milik Waka', async () => {
    getActivePositionCodes.mockResolvedValue(new Set(['WAKA_KURIKULUM']));

    await expect(controller.transition('rc-1', { action: 'check' }, SA))
      .rejects.toThrow("Aksi 'check' hanya untuk WAKA_KURIKULUM");
    await expect(controller.transition(
      'rc-2', { action: 'return', reason: 'Perbaiki catatan' }, SA_GURU,
    )).rejects.toThrow("Aksi 'return' hanya untuk WAKA_KURIKULUM");
    expect(transition).not.toHaveBeenCalled();
  });

  it('menolak SUPER_ADMIN + GURU dari generate dan catatan sebelum service dipanggil', () => {
    const notesDto = {
      notes: 'Tidak boleh', expectedUpdatedAt: new Date('2026-08-13T01:00:00.000Z'),
    };
    expect(() => controller.generate({
      classId: '00000000-0000-0000-0000-000000000001',
      academicYear: '2026/2027', semester: 1,
    }, SA_GURU)).toThrow('Super Admin hanya dapat memakai jalur pemulihan');
    expect(() => controller.updateNotes(
      '00000000-0000-0000-0000-000000000002', notesDto, SA_GURU,
    )).toThrow('Super Admin hanya dapat memakai jalur pemulihan');
    expect(generate).not.toHaveBeenCalled();
    expect(updateNotes).not.toHaveBeenCalled();
  });

  it('meneruskan generate dan catatan untuk guru biasa', () => {
    const generateDto = {
      classId: '00000000-0000-0000-0000-000000000001',
      academicYear: '2026/2027', semester: 1,
    };
    const notesDto = {
      notes: 'Catatan wali', expectedUpdatedAt: new Date('2026-08-13T01:00:00.000Z'),
    };

    controller.generate(generateDto, GURU);
    controller.updateNotes('00000000-0000-0000-0000-000000000002', notesDto, GURU);

    expect(generate).toHaveBeenCalledWith(generateDto, GURU);
    expect(updateNotes).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000002', notesDto, GURU,
    );
  });

  it('meneruskan recovery SA melalui endpoint terpisah', async () => {
    const dto = {
      reason: 'Pemulihan diperlukan setelah insiden data terverifikasi.',
      incidentReference: 'INC-2026-0042',
    };

    await controller.recover('rc-1', dto, SA);

    expect(recover).toHaveBeenCalledWith('rc-1', dto, SA);
    expect(transition).not.toHaveBeenCalled();
  });
});

describe('ClassActivitiesService', () => {
  let service: ClassActivitiesService;
  const teacherFindFirst = jest.fn();
  const teacherFindUnique = jest.fn();
  const teachingAssignmentFindMany = jest.fn();
  const userFindUnique = jest.fn();
  const actFindUnique = jest.fn();
  const actCreate = jest.fn();
  const actUpdate = jest.fn();
  const actUpdateMany = jest.fn();
  const actDelete = jest.fn();
  const actFindMany = jest.fn();
  const actCount = jest.fn();
  const classFindUnique = jest.fn();
  const classFindMany = jest.fn();
  const studentFindMany = jest.fn();
  const studentFindUnique = jest.fn();
  const academicYearFindFirst = jest.fn();
  const academicYearFindMany = jest.fn();
  const appointmentFindMany = jest.fn();
  const storagePutObject = jest.fn();
  const storageGetObject = jest.fn();
  const storageDeleteObject = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, teacherFindUnique, teachingAssignmentFindMany, userFindUnique,
      actFindUnique, actCreate, actUpdate, actUpdateMany, actDelete, actFindMany, actCount,
      classFindUnique, classFindMany, studentFindMany, studentFindUnique,
      storagePutObject, storageGetObject, storageDeleteObject, academicYearFindMany,
      appointmentFindMany]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    teacherFindUnique.mockResolvedValue({ id: 'teacher-1' });
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c1' }]);
    userFindUnique.mockResolvedValue({ id: 'guru-user-1' });
    classFindUnique.mockResolvedValue({ id: 'c1', isActive: true, academicYear: '2025/2026' });
    classFindMany.mockResolvedValue([]);
    academicYearFindFirst.mockResolvedValue({ code: '2025/2026' });
    actFindMany.mockResolvedValue([]);
    actCount.mockResolvedValue(0);
    actCreate.mockImplementation((a: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'act-1', ...a.data }));
    actUpdateMany.mockResolvedValue({ count: 1 });

    const prisma = {
      user: { findUnique: userFindUnique },
      teacher: { findFirst: teacherFindFirst, findUnique: teacherFindUnique },
      teachingAssignment: { findMany: teachingAssignmentFindMany },
      class: { findUnique: classFindUnique, findMany: classFindMany },
      student: { findMany: studentFindMany, findUnique: studentFindUnique },
      classActivity: {
        findUnique: actFindUnique, findMany: actFindMany,
        count: actCount, create: actCreate,
        update: actUpdate, updateMany: actUpdateMany, delete: actDelete,
      },
      academicYear: { findFirst: academicYearFindFirst, findMany: academicYearFindMany },
      appointment: { findMany: appointmentFindMany },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassActivitiesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PrivateObjectStorageService,
          useValue: {
            putObject: storagePutObject,
            getObject: storageGetObject,
            deleteObject: storageDeleteObject,
          },
        },
      ],
    }).compile();
    service = module.get(ClassActivitiesService);
  });

  it('create: teacherId dari TOKEN (bukan body) + kelas divalidasi', async () => {
    await service.create({
      classId: 'c1', date: '2026-06-12', title: 'Praktikum jaringan', category: 'praktikum',
    }, GURU);
    expect(actCreate.mock.calls[0][0].data.teacherId).toBe('teacher-1');
  });

  it('findAll: GURU boleh membaca kelas assignment atau wali', async () => {
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c1' }]);
    classFindMany.mockResolvedValue([{ id: 'c-wali' }]);

    await service.findAll({ classId: 'c-wali', page: 1, limit: 20 }, GURU);

    expect(actFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classId: 'c-wali' }),
      }),
    );
  });

  it('findAll: GURU forbidden classId fail closed', async () => {
    teachingAssignmentFindMany.mockResolvedValue([{ classId: 'c1' }]);
    classFindMany.mockResolvedValue([{ id: 'c-wali' }]);

    await expect(
      service.findAll({ classId: 'c-other', page: 1, limit: 20 }, GURU),
    ).rejects.toThrow(ForbiddenException);
    expect(actFindMany).not.toHaveBeenCalled();
    expect(actCount).not.toHaveBeenCalled();
  });

  it('findAll: SISWA hanya membaca kelas sendiri dan forbidden classId ditolak', async () => {
    userFindUnique.mockResolvedValue({ id: 'siswa-user-1' });
    studentFindUnique.mockResolvedValue({ classId: 'c-siswa' });

    await service.findAll({ page: 1, limit: 20 }, SISWA);

    expect(actFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classId: { in: ['c-siswa'] } }),
      }),
    );
    await expect(
      service.findAll({ classId: 'c-other', page: 1, limit: 20 }, SISWA),
    ).rejects.toThrow(ForbiddenException);
  });

  it('findAll: ORANG_TUA hanya membaca kelas anak-anaknya', async () => {
    userFindUnique.mockResolvedValue({ id: 'ortu-user-1' });
    studentFindMany.mockResolvedValue([{ classId: 'c-child' }, { classId: 'c-child' }]);

    await service.findAll({ page: 1, limit: 20 }, ORTU);

    expect(actFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ classId: { in: ['c-child'] } }),
      }),
    );
    await expect(
      service.findAll({ classId: 'c-other', page: 1, limit: 20 }, ORTU),
    ).rejects.toThrow(ForbiddenException);
  });

  it('update guru lain → Forbidden; SA bebas', async () => {
    actFindUnique.mockResolvedValue({ teacherId: 'teacher-LAIN' });
    await expect(service.update('act-1', { title: 'X' }, GURU)).rejects.toThrow(ForbiddenException);

    actUpdate.mockResolvedValue({ id: 'act-1' });
    await service.update('act-1', { title: 'X' }, SA); // SUPER_ADMIN bypass ownership
    expect(actUpdate).toHaveBeenCalled();
  });

  it('delete pemilik → sukses dgn respons eksplisit', async () => {
    actFindUnique.mockResolvedValue({ teacherId: 'teacher-1' });
    actDelete.mockResolvedValue({});
    expect(await service.remove('act-1', GURU)).toEqual({ deleted: true, id: 'act-1' });
  });

  it('findAll menandai aksi hanya untuk guru pencatat', async () => {
    actFindMany.mockResolvedValue([
      {
        id: 'act-own',
        teacher: { id: 'teacher-1', user: { fullName: 'Guru Satu' } },
      },
      {
        id: 'act-other',
        teacher: { id: 'teacher-2', user: { fullName: 'Guru Dua' } },
      },
    ]);
    actCount.mockResolvedValue(2);

    const result = await service.findAll({ page: 1, limit: 20 }, GURU);

    expect(result.data).toEqual([
      expect.objectContaining({ id: 'act-own', canManage: true }),
      expect.objectContaining({ id: 'act-other', canManage: false }),
    ]);
  });

  it('findAll tidak mengekspos object key privat dan mempertahankan URL historis', async () => {
    actFindMany.mockResolvedValue([
      {
        id: 'act-private',
        photoUrl: 'class-activities/v1/123e4567-e89b-42d3-a456-426614174000.jpg',
        teacher: { id: 'teacher-1', user: { fullName: 'Guru Satu' } },
      },
      {
        id: 'act-legacy',
        photoUrl: 'https://legacy.example.test/activity.jpg',
        teacher: { id: 'teacher-1', user: { fullName: 'Guru Satu' } },
      },
    ]);
    actCount.mockResolvedValue(2);

    const result = await service.findAll({ page: 1, limit: 20 }, GURU);

    expect(result.data[0]).toEqual(expect.objectContaining({
      id: 'act-private',
      photoUrl: null,
      mediaUrl: '/api/v1/class-activities/act-private/media',
    }));
    expect(result.data[1]).toEqual(expect.objectContaining({
      id: 'act-legacy',
      photoUrl: 'https://legacy.example.test/activity.jpg',
      mediaUrl: null,
    }));
  });

  it('WAKA_KESISWAAN membaca dan mengelola kegiatan lintas kelas', async () => {
    await service.findAll({ classId: 'c-other', page: 1, limit: 20 }, WAKA_KESISWAAN);
    expect(actFindMany.mock.calls[0][0].where.classId).toBe('c-other');

    actFindUnique.mockResolvedValue({ teacherId: 'teacher-LAIN' });
    actUpdate.mockResolvedValue({ id: 'act-1' });
    await service.update('act-1', { title: 'Terverifikasi' }, WAKA_KESISWAAN);
    expect(actUpdate).toHaveBeenCalled();
  });

  it('KAPROG hanya membaca kegiatan dari kelas jurusan appointment aktif', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-kaprog', isActive: true, deletedAt: null });
    academicYearFindMany.mockResolvedValue([{ id: 'ay-1', code: '2025/2026' }]);
    appointmentFindMany.mockResolvedValue([{ majorId: 'major-1', major: { id: 'major-1', code: 'TKJ' } }]);
    classFindMany.mockResolvedValue([{ id: 'c-tkj' }]);
    await service.findAll({ page: 1, limit: 20 }, KAPROG);
    expect(actFindMany.mock.calls[0][0].where.classId).toEqual({ in: ['c-tkj'] });
    await expect(service.findAll({ classId: 'c-other', page: 1, limit: 20 }, KAPROG))
      .rejects.toThrow(ForbiddenException);
  });

  it('media privat menolak pembaca lintas kelas sebelum membaca object storage', async () => {
    userFindUnique.mockResolvedValue({ id: 'siswa-user-1' });
    studentFindUnique.mockResolvedValue({ classId: 'c-siswa' });
    actFindUnique.mockResolvedValue({
      classId: 'c-other',
      photoUrl: 'class-activities/v1/123e4567-e89b-42d3-a456-426614174000.jpg',
    });

    await expect(service.getMedia('act-1', SISWA)).rejects.toThrow(ForbiddenException);
    expect(storageGetObject).not.toHaveBeenCalled();
  });

  it('URL historis tidak pernah di-fetch oleh proxy media privat', async () => {
    actFindUnique.mockResolvedValue({
      classId: 'c1',
      photoUrl: 'http://169.254.169.254/latest/meta-data',
    });

    await expect(service.getMedia('act-1', GURU)).rejects.toThrow(NotFoundException);
    expect(storageGetObject).not.toHaveBeenCalled();
  });

  it('upload media menyimpan referensi opaque dan bukan nama/URL pengguna', async () => {
    actFindUnique.mockResolvedValue({
      id: 'act-1', classId: 'c1', teacherId: 'teacher-1', photoUrl: null,
    });
    storagePutObject.mockResolvedValue(undefined);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    const result = await service.uploadMedia('act-1', jpeg, 'image/jpeg', GURU);

    const key = storagePutObject.mock.calls[0][0] as string;
    expect(key).toMatch(/^class-activities\/v1\/[0-9a-f-]+\.jpg$/);
    expect(key).not.toContain('guru');
    expect(key).not.toContain('/c1/');
    expect(actUpdateMany).toHaveBeenCalledWith({
      where: { id: 'act-1', photoUrl: null },
      data: { photoUrl: key },
    });
    expect(result.mediaUrl).toBe('/api/v1/class-activities/act-1/media');
  });

  it('upload media guru lain ditolak sebelum object storage dipanggil', async () => {
    actFindUnique.mockResolvedValue({
      id: 'act-1', classId: 'c1', teacherId: 'teacher-other', photoUrl: null,
    });

    await expect(service.uploadMedia(
      'act-1',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      'image/jpeg',
      GURU,
    )).rejects.toThrow(ForbiddenException);
    expect(storagePutObject).not.toHaveBeenCalled();
  });

  it('upload bersamaan memakai compare-and-set dan membersihkan object yang kalah', async () => {
    actFindUnique.mockResolvedValue({
      id: 'act-1', classId: 'c1', teacherId: 'teacher-1', photoUrl: null,
    });
    actUpdateMany.mockResolvedValue({ count: 0 });
    storagePutObject.mockResolvedValue(undefined);
    storageDeleteObject.mockResolvedValue(undefined);

    await expect(service.uploadMedia(
      'act-1',
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      'image/jpeg',
      GURU,
    )).rejects.toThrow(ConflictException);
    expect(storageDeleteObject).toHaveBeenCalledTimes(1);
  });

  it('hapus URL historis hanya membersihkan referensi DB dan tidak mengakses URL', async () => {
    actFindUnique.mockResolvedValue({
      id: 'act-1', classId: 'c1', teacherId: 'teacher-1',
      photoUrl: 'https://legacy.example.test/activity.jpg',
    });
    await expect(service.removeMedia('act-1', GURU)).resolves.toEqual({
      deleted: true,
      id: 'act-1',
    });
    expect(storageDeleteObject).not.toHaveBeenCalled();
    expect(actUpdateMany).toHaveBeenCalledWith({
      where: { id: 'act-1', photoUrl: 'https://legacy.example.test/activity.jpg' },
      data: { photoUrl: null },
    });
  });

  it('hapus kegiatan ikut membersihkan media privat secara fail-soft', async () => {
    actFindUnique.mockResolvedValue({
      id: 'act-1', classId: 'c1', teacherId: 'teacher-1',
      photoUrl: 'class-activities/v1/123e4567-e89b-42d3-a456-426614174000.jpg',
    });

    actDelete.mockResolvedValue({ id: 'act-1' });
    storageDeleteObject.mockRejectedValue(new Error('storage unavailable'));
    await expect(service.remove('act-1', GURU)).resolves.toEqual({ deleted: true, id: 'act-1' });
    expect(actDelete).toHaveBeenCalledWith({ where: { id: 'act-1' } });
    expect(storageDeleteObject).toHaveBeenCalledTimes(1);
  });
});
