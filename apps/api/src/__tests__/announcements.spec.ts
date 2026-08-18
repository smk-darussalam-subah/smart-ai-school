// =============================================================================
// Announcements — unit tests (service + controller)
// Fokus: visibilitas QUERY-level per role, semantik publish/pin/archive,
// delete aman, RBAC wiring controller.
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '@smk/auth';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AnnouncementsController } from '../announcements/announcements.controller';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificationService } from '../notification/notification.service';
import {
  CreateAnnouncementSchema,
  ListAnnouncementsQuerySchema,
  AnnouncementAudienceSchema,
} from '../announcements/dto/announcement.dto';

const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'kepsek', roles: ['KEPALA_SEKOLAH'] } as AuthUser;
const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;

const ANN = {
  id: 'a1b2c3d4-0000-0000-0000-000000000001',
  title: 'Libur Idul Adha',
  content: 'Sekolah libur tanggal 17.',
  category: 'umum',
  priority: 'penting',
  audience: ['ALL'],
  isPinned: false,
  status: 'published',
  publishedAt: new Date('2026-06-10T00:00:00Z'),
  scheduledAt: null,
  createdBy: 'kc-sa',
  createdByName: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  const mockFindMany = jest.fn();
  const mockFindFirst = jest.fn();
  const mockCount = jest.fn();
  const mockCreate = jest.fn();
  const mockUpdate = jest.fn();
  const mockDelete = jest.fn();
  const mockQueryRaw = jest.fn();
  const mockUserFindMany = jest.fn();
  const mockAppointmentFindMany = jest.fn();
  const mockNotificationCreateMany = jest.fn();
  const mockNotificationFindMany = jest.fn();
  const mockEnqueueCommittedPendingLogs = jest.fn();
  const mockHasPermission = jest.fn();
  const mockGetActivePositionCodes = jest.fn();

  beforeEach(async () => {
    [mockFindMany, mockFindFirst, mockCount, mockCreate, mockUpdate, mockDelete,
      mockQueryRaw, mockUserFindMany, mockAppointmentFindMany, mockNotificationCreateMany,
      mockNotificationFindMany, mockHasPermission, mockGetActivePositionCodes]
      .forEach((m) => m.mockReset());
    mockQueryRaw.mockResolvedValue([]);
    mockUserFindMany.mockResolvedValue([]);
    mockAppointmentFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });
    mockNotificationFindMany.mockResolvedValue([]);
    mockEnqueueCommittedPendingLogs.mockResolvedValue({ queuedCount: 0 });
    mockHasPermission.mockImplementation((_keycloakId: string, roles: string[], permission: string) =>
      permission === 'announcement.manage' && roles.includes('SUPER_ADMIN'));
    mockGetActivePositionCodes.mockResolvedValue([]);

    const tx = {
      announcement: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
        count: mockCount,
        create: mockCreate,
        update: mockUpdate,
        delete: mockDelete,
      },
      user: { findMany: mockUserFindMany },
      appointment: { findMany: mockAppointmentFindMany },
      notificationLog: { createMany: mockNotificationCreateMany, findMany: mockNotificationFindMany },
      $queryRaw: mockQueryRaw,
    };
    const prisma = {
      ...tx,
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PermissionsService,
          useValue: {
            hasPermission: mockHasPermission,
            getActivePositionCodes: mockGetActivePositionCodes,
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationService, useValue: { enqueueCommittedPendingLogs: mockEnqueueCommittedPendingLogs } },
      ],
    }).compile();
    service = module.get(AnnouncementsService);
  });

  it('GURU (non-manager) → where memaksa status=published + audiens di QUERY', async () => {
    mockFindMany.mockResolvedValue([ANN]);
    mockCount.mockResolvedValue(1);

    await service.findAll({ page: 1, limit: 20 }, GURU);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('published');
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { audience: { array_contains: ['ALL'] } },
        { audience: { array_contains: ['GURU'] } },
      ]),
    );
    // scheduledAt: null ATAU sudah lewat
    expect(where.AND[0].OR[0]).toEqual({ scheduledAt: null });
  });

  it('GURU + filter status=draft → status TETAP published (tak bisa intip draft)', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll({ status: 'draft', page: 1, limit: 20 }, GURU);
    expect(mockFindMany.mock.calls[0][0].where.status).toBe('published');
  });

  it('non-manager memakai kode appointment aktif untuk visibilitas audiens jabatan', async () => {
    mockGetActivePositionCodes.mockResolvedValue(['WAKA_HUMAS']);
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 }, GURU);

    expect(mockGetActivePositionCodes).toHaveBeenCalledWith('kc-guru');
    expect(mockFindMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { audience: { array_contains: ['WAKA_HUMAS'] } },
      ]),
    );
  });

  it('SUPER_ADMIN → bebas filter status, tanpa klausa audiens', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll({ status: 'draft', page: 1, limit: 20 }, SA);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('draft');
    expect(where.OR).toBeUndefined();
  });

  it('Urutan list: pinned dulu, lalu publishedAt desc', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 }, GURU);
    const orderBy = mockFindMany.mock.calls[0][0].orderBy;
    expect(orderBy[0]).toEqual({ isPinned: 'desc' });
  });

  it('findOne non-manager: tidak visible → NotFoundException (bukan bocor 403)', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(service.findOne(ANN.id, GURU)).rejects.toThrow(NotFoundException);
  });

  it('create status=published → publishedAt terisi + jejak pembuat', async () => {
    mockCreate.mockResolvedValue(ANN);
    await service.create(
      {
        title: 'Libur', content: 'isi', category: 'umum', priority: 'biasa',
        audience: ['ALL'], isPinned: false, status: 'published', scheduledAt: null,
      },
      KS,
    );
    const data = mockCreate.mock.calls[0][0].data;
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.createdBy).toBe('kc-ks');
    expect(data.createdByName).toBe('kepsek');
  });

  it('create status=draft → publishedAt null', async () => {
    mockCreate.mockResolvedValue({ ...ANN, status: 'draft', publishedAt: null });
    await service.create(
      {
        title: 'Draft', content: 'isi', category: 'umum', priority: 'biasa',
        audience: ['GURU'], isPinned: false, status: 'draft', scheduledAt: null,
      },
      SA,
    );
    expect(mockCreate.mock.calls[0][0].data.publishedAt).toBeNull();
  });

  it('publish → status published; publishedAt pertama TIDAK ditimpa saat re-publish', async () => {
    mockFindFirst.mockResolvedValue(ANN); // sudah punya publishedAt
    mockUpdate.mockResolvedValue(ANN);

    await service.publish(ANN.id, SA);
    const data = mockUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('published');
    expect(data.publishedAt).toEqual(ANN.publishedAt);
  });

  it('archive → status archived + pin dicabut', async () => {
    mockFindFirst.mockResolvedValue({ ...ANN, isPinned: true });
    mockUpdate.mockResolvedValue(ANN);

    await service.archive(ANN.id, SA);
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ status: 'archived', isPinned: false });
  });

  it('remove → hard delete (tabel tanpa FK), respons eksplisit', async () => {
    mockFindFirst.mockResolvedValue(ANN);
    mockDelete.mockResolvedValue(ANN);

    const res = await service.remove(ANN.id, SA);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: ANN.id } });
    expect(res).toEqual({ deleted: true, id: ANN.id });
  });

  it('prepareDueAnnouncements mengklaim deliveryPreparedAt dan membuat pending logs hanya untuk urgent/darurat', async () => {
    mockQueryRaw.mockResolvedValue([{
      id: ANN.id,
      title: 'Kelas dipulangkan lebih awal',
      category: 'darurat',
      priority: 'urgent',
      audience: ['GURU'],
    }]);
    mockUserFindMany.mockResolvedValue([{ phone: '628111111111' }, { phone: null }]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });
    mockNotificationFindMany.mockResolvedValueOnce([{ id: 'existing-announcement-log' }]);
    mockEnqueueCommittedPendingLogs.mockResolvedValueOnce({ queuedCount: 1 });

    const result = await service.prepareDueAnnouncements(10);

    expect(result).toEqual({
      claimedCount: 1,
      notificationCount: 1,
      notificationHandoff: { status: 'queued', requestedCount: 1, queuedCount: 1, pendingRecoveryCount: 0 },
    });
    expect(mockUserFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ['GURU'] } }),
      select: { phone: true },
    }));
    expect(mockNotificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        recipient: '+628111111111',
        status: 'pending',
        refType: 'announcement',
        refId: `${ANN.id}:+628111111111`,
      })],
      skipDuplicates: true,
    }));
    expect(mockEnqueueCommittedPendingLogs).toHaveBeenCalledWith(['existing-announcement-log']);
  });

  it('prepareDueAnnouncements mengambil penerima jabatan dari appointment aktif, bukan role stabil lama', async () => {
    mockQueryRaw.mockResolvedValue([{
      id: ANN.id,
      title: 'Instruksi Kepala Sekolah',
      category: 'umum',
      priority: 'urgent',
      audience: ['KEPALA_SEKOLAH'],
    }]);
    mockAppointmentFindMany.mockResolvedValue([
      { staff: { user: { phone: '081222222222' } } },
    ]);
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });
    mockNotificationFindMany.mockResolvedValueOnce([{ id: 'existing-appointment-announcement-log' }]);
    mockEnqueueCommittedPendingLogs.mockResolvedValueOnce({ queuedCount: 1 });

    const result = await service.prepareDueAnnouncements(10);

    expect(result).toEqual({
      claimedCount: 1,
      notificationCount: 1,
      notificationHandoff: { status: 'queued', requestedCount: 1, queuedCount: 1, pendingRecoveryCount: 0 },
    });
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockAppointmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'ACTIVE',
        academicYear: { isActive: true },
      }),
    }));
    expect(mockNotificationCreateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: [expect.objectContaining({
        recipient: '+6281222222222',
        refType: 'announcement',
        refId: `${ANN.id}:+6281222222222`,
      })],
      skipDuplicates: true,
    }));
    expect(mockEnqueueCommittedPendingLogs).toHaveBeenCalledWith(['existing-appointment-announcement-log']);
  });

  it('menolak perubahan content/audience/schedule setelah pengumuman prepared', async () => {
    mockFindFirst.mockResolvedValue({ ...ANN, deliveryPreparedAt: new Date('2026-08-13T01:00:00.000Z') });

    await expect(service.update(ANN.id, { content: 'ubah isi' }, SA)).rejects.toThrow(ConflictException);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('tetap mengizinkan pin pada pengumuman yang sudah prepared', async () => {
    const prepared = { ...ANN, deliveryPreparedAt: new Date('2026-08-13T01:00:00.000Z') };
    mockFindFirst.mockResolvedValue(prepared);
    mockUpdate.mockResolvedValue({ ...prepared, isPinned: true });

    await service.update(ANN.id, { isPinned: true }, SA);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ANN.id },
      data: { isPinned: true },
    }));
  });
});

describe('Announcement DTOs (Zod)', () => {
  it('audience ALL + role spesifik → ditolak', () => {
    expect(AnnouncementAudienceSchema.safeParse(['ALL', 'GURU']).success).toBe(false);
  });

  it('audience role tidak dikenal → ditolak', () => {
    expect(AnnouncementAudienceSchema.safeParse(['HACKER']).success).toBe(false);
  });

  it('create default: kategori umum, prioritas biasa, draft, audiens ALL', () => {
    const parsed = CreateAnnouncementSchema.parse({ title: 'Halo dunia', content: 'isi' });
    expect(parsed.category).toBe('umum');
    expect(parsed.priority).toBe('biasa');
    expect(parsed.status).toBe('draft');
    expect(parsed.audience).toEqual(['ALL']);
  });

  it('list query: coercion page/limit + cap limit 100', () => {
    const parsed = ListAnnouncementsQuerySchema.parse({ page: '2', limit: '50' });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
    expect(ListAnnouncementsQuerySchema.safeParse({ limit: '999' }).success).toBe(false);
  });
});

describe('AnnouncementsController RBAC wiring', () => {
  let controller: AnnouncementsController;
  const svc = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    publish: jest.fn(),
    archive: jest.fn(),
    setPin: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [{ provide: AnnouncementsService, useValue: svc }],
    }).compile();
    controller = module.get(AnnouncementsController);
  });

  it('DELETE :id → hanya SUPER_ADMIN di metadata @Roles', () => {
    const roles = Reflect.getMetadata('roles', AnnouncementsController.prototype.remove);
    expect(roles).toEqual(['SUPER_ADMIN']);
  });

  it('POST → SUPER_ADMIN + KEPALA_SEKOLAH', () => {
    const roles = Reflect.getMetadata('roles', AnnouncementsController.prototype.create);
    expect(roles).toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI']);
  });

  it('GET list → semua 7 role', () => {
    const roles = Reflect.getMetadata('roles', AnnouncementsController.prototype.findAll);
    expect(roles).toHaveLength(7);
  });

  it('findAll: query invalid → BadRequest, valid → diteruskan ke service', async () => {
    expect(() => controller.findAll({ limit: '999' }, GURU)).toThrow();
    svc.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
    await controller.findAll({ page: '1' }, GURU);
    expect(svc.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
      GURU,
    );
  });
});
