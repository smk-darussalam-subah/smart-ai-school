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
import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '@smk/auth';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AnnouncementsController } from '../announcements/announcements.controller';
import { PrismaService } from '../prisma/prisma.service';
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

  beforeEach(async () => {
    [mockFindMany, mockFindFirst, mockCount, mockCreate, mockUpdate, mockDelete]
      .forEach((m) => m.mockReset());

    const prisma = {
      announcement: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
        count: mockCount,
        create: mockCreate,
        update: mockUpdate,
        delete: mockDelete,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
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
    expect(roles).toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH']);
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
