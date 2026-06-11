// =============================================================================
// 2F-3: RPP pipeline — state machine, ownership query, review RBAC
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '@smk/auth';
import { RppService } from '../rpp/rpp.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewRppSchema, CreateRppSchema } from '../rpp/dto/rpp.dto';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'kepsek', roles: ['KEPALA_SEKOLAH'] } as AuthUser;
const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;

describe('RppService', () => {
  let service: RppService;
  const teacherFindFirst = jest.fn();
  const rppFindFirst = jest.fn();
  const rppFindUnique = jest.fn();
  const rppFindMany = jest.fn();
  const rppCount = jest.fn();
  const rppCreate = jest.fn();
  const rppUpdate = jest.fn();
  const rppDelete = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, rppFindFirst, rppFindUnique, rppFindMany, rppCount, rppCreate, rppUpdate, rppDelete]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    rppCreate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'rpp-1', ...a.data }));
    rppUpdate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'rpp-1', ...a.data }));

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      rpp: {
        findFirst: rppFindFirst, findUnique: rppFindUnique, findMany: rppFindMany,
        count: rppCount, create: rppCreate, update: rppUpdate, delete: rppDelete,
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RppService, { provide: PrismaService, useValue: prisma }, { provide: EventEmitter2, useValue: { emit: jest.fn() } }],
    }).compile();
    service = module.get(RppService);
  });

  it('create tanpa content & fileUrl → BadRequest', async () => {
    await expect(service.create({
      subject: 'MTK', title: 'Bab 1', academicYear: '2026/2027', semester: 1, submit: false,
    }, GURU)).rejects.toThrow(BadRequestException);
  });

  it('create submit=true → status submitted + submittedAt terisi', async () => {
    await service.create({
      subject: 'MTK', title: 'Bab 1', content: 'isi', academicYear: '2026/2027',
      semester: 1, submit: true,
    }, GURU);
    const data = rppCreate.mock.calls[0][0].data;
    expect(data.status).toBe('submitted');
    expect(data.submittedAt).toBeInstanceOf(Date);
  });

  it('findAll GURU → teacherId dipaksa milik sendiri DI QUERY (filter teacherId diabaikan)', async () => {
    rppFindMany.mockResolvedValue([]);
    rppCount.mockResolvedValue(0);
    await service.findAll({ teacherId: 'teacher-LAIN', page: 1, limit: 20 }, GURU);
    expect(rppFindMany.mock.calls[0][0].where.teacherId).toBe('teacher-1');
  });

  it('findAll KS → bebas filter; SISWA → Forbidden', async () => {
    rppFindMany.mockResolvedValue([]);
    rppCount.mockResolvedValue(0);
    await service.findAll({ teacherId: 't-9', status: 'submitted', page: 1, limit: 20 }, KS);
    expect(rppFindMany.mock.calls[0][0].where.teacherId).toBe('t-9');
    const siswa = { keycloakId: 'kc-s', username: 's', roles: ['SISWA'] } as AuthUser;
    await expect(service.findAll({ page: 1, limit: 20 }, siswa)).rejects.toThrow(ForbiddenException);
  });

  it('update: status submitted → 409 (tak bisa edit saat menunggu review)', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'submitted' });
    await expect(service.update('rpp-1', { title: 'X' }, GURU)).rejects.toThrow(ConflictException);
  });

  it('submit: revision → submitted (siklus revisi); approved → 409', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'revision', content: 'isi', fileUrl: null });
    await service.submit('rpp-1', GURU);
    expect(rppUpdate.mock.calls[0][0].data.status).toBe('submitted');

    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'approved', content: 'isi', fileUrl: null });
    await expect(service.submit('rpp-1', GURU)).rejects.toThrow(ConflictException);
  });

  it('review: hanya status submitted; jejak reviewer terisi', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'submitted' });
    await service.review('rpp-1', { decision: 'approved', note: null }, KS);
    const data = rppUpdate.mock.calls[0][0].data;
    expect(data.status).toBe('approved');
    expect(data.reviewerId).toBe('kc-ks');
    expect(data.reviewedAt).toBeInstanceOf(Date);

    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'draft' });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, KS))
      .rejects.toThrow(ConflictException);
  });

  it('DTO review: revisi tanpa catatan → ditolak Zod', () => {
    expect(ReviewRppSchema.safeParse({ decision: 'revision' }).success).toBe(false);
    expect(ReviewRppSchema.safeParse({ decision: 'revision', note: 'perbaiki KD' }).success).toBe(true);
    expect(ReviewRppSchema.safeParse({ decision: 'approved' }).success).toBe(true);
  });

  it('remove GURU: hanya draft milik sendiri; SA bebas', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'approved' });
    await expect(service.remove('rpp-1', GURU)).rejects.toThrow(ConflictException);

    rppFindUnique.mockResolvedValue({ id: 'rpp-1' });
    rppDelete.mockResolvedValue({});
    expect(await service.remove('rpp-1', SA)).toEqual({ deleted: true, id: 'rpp-1' });
  });

  it('DTO create: default draft + validasi tahun ajaran', () => {
    const ok = CreateRppSchema.parse({
      subject: 'MTK', title: 'Bab 1', content: 'x', academicYear: '2026/2027', semester: '1',
    });
    expect(ok.submit).toBe(false);
    expect(ok.semester).toBe(1);
    expect(CreateRppSchema.safeParse({
      subject: 'MTK', title: 'Bab 1', academicYear: '2026-2027', semester: 1,
    }).success).toBe(false);
  });
});
