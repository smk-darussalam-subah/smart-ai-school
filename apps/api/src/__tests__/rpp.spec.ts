// =============================================================================
// 2F-3: RPP pipeline — state machine, ownership query, review RBAC
// =============================================================================

jest.mock('@smk/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  auditLog: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuthUser } from '@smk/auth';
import { RppController } from '../rpp/rpp.controller';
import { RppService } from '../rpp/rpp.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { ReviewRppSchema, CreateRppSchema } from '../rpp/dto/rpp.dto';

const GURU: AuthUser = { keycloakId: 'kc-guru', username: 'guru1', roles: ['GURU'] } as AuthUser;
const KS: AuthUser = { keycloakId: 'kc-ks', username: 'kepsek', roles: ['KEPALA_SEKOLAH'] } as AuthUser;
const SA: AuthUser = { keycloakId: 'kc-sa', username: 'admin', roles: ['SUPER_ADMIN'] } as AuthUser;
// W3-4: WAKA_KURIKULUM dengan rpp.review kini dapat menyelesaikan review.
const WAKA: AuthUser = { keycloakId: 'kc-waka', username: 'waka', roles: ['WAKA_KURIKULUM'] } as AuthUser;
const KAPROG: AuthUser = { keycloakId: 'kc-kaprog', username: 'kaprog', roles: ['GURU', 'KAPROG'] } as AuthUser;

describe('RppService', () => {
  let service: RppService;
  const teacherFindFirst = jest.fn();
  const teachingAssignmentFindFirst = jest.fn();
  const rppFindFirst = jest.fn();
  const rppFindUnique = jest.fn();
  const rppFindMany = jest.fn();
  const rppCount = jest.fn();
  const rppCreate = jest.fn();
  const rppUpdate = jest.fn();
  const rppUpdateMany = jest.fn();
  const rppDelete = jest.fn();
  const userFindUnique = jest.fn();
  const academicYearFindMany = jest.fn();
  const appointmentFindMany = jest.fn();
  const classFindFirst = jest.fn();
  const hasPermission = jest.fn();

  beforeEach(async () => {
    [teacherFindFirst, teachingAssignmentFindFirst, rppFindFirst, rppFindUnique, rppFindMany, rppCount, rppCreate, rppUpdate, rppUpdateMany, rppDelete, userFindUnique, academicYearFindMany, appointmentFindMany, classFindFirst, hasPermission]
      .forEach((m) => m.mockReset());
    teacherFindFirst.mockResolvedValue({ id: 'teacher-1' });
    // W3-6: by default, the GURU has a matching assignment for class-1 / MTK / 2026/2027.
    teachingAssignmentFindFirst.mockResolvedValue({ id: 'ta-1' });
    rppCreate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'rpp-1', ...a.data }));
    rppUpdate.mockImplementation((a: { data: Record<string, unknown> }) => Promise.resolve({ id: 'rpp-1', ...a.data }));
    rppUpdateMany.mockResolvedValue({ count: 1 });
    rppFindUnique.mockResolvedValue({ id: 'rpp-1' });
    hasPermission.mockResolvedValue(true);

    const prisma = {
      teacher: { findFirst: teacherFindFirst },
      teachingAssignment: { findFirst: teachingAssignmentFindFirst },
      rpp: {
        findFirst: rppFindFirst, findUnique: rppFindUnique, findMany: rppFindMany,
        count: rppCount, create: rppCreate, update: rppUpdate, updateMany: rppUpdateMany, delete: rppDelete,
      },
      user: { findUnique: userFindUnique },
      academicYear: { findMany: academicYearFindMany },
      appointment: { findMany: appointmentFindMany },
      class: { findFirst: classFindFirst },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RppService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: PermissionsService, useValue: { hasPermission } },
      ],
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
      classId: 'class-1', semester: 1, submit: true,
    }, GURU);
    const data = rppCreate.mock.calls[0][0].data;
    expect(data.status).toBe('submitted');
    expect(data.submittedAt).toBeInstanceOf(Date);
  });

  it('create dengan body (tanpa content) → tidak BadRequest + body tersimpan', async () => {
    await service.create({
      subject: 'MTK', title: 'Modul', academicYear: '2026/2027', semester: 1, submit: false,
      classId: 'class-1', body: { cp: 'CP X', tp: ['TP 1.1'] },
    }, GURU);
    expect(rppCreate.mock.calls[0][0].data.body).toEqual({ cp: 'CP X', tp: ['TP 1.1'] });
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

  it('findAll KAPROG dibatasi jurusan appointment aktif dan classId terlarang fail-closed', async () => {
    userFindUnique.mockResolvedValue({ id: 'u-kaprog', isActive: true, deletedAt: null });
    academicYearFindMany.mockResolvedValue([{ id: 'ay-1', code: '2026/2027' }]);
    appointmentFindMany.mockResolvedValue([{ majorId: 'major-1', major: { id: 'major-1', code: 'TKJ' } }]);
    classFindFirst.mockResolvedValue(null);
    rppFindMany.mockResolvedValue([]);
    rppCount.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 }, KAPROG);
    expect(rppFindMany.mock.calls[0][0].where.class).toEqual(expect.objectContaining({
      academicYear: '2026/2027',
      majorCode: { in: ['TKJ'] },
    }));
    await expect(service.findAll({ classId: 'outside', page: 1, limit: 20 }, KAPROG))
      .rejects.toThrow(ForbiddenException);
  });

  it('update: status submitted → 409 (tak bisa edit saat menunggu review)', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'submitted' });
    await expect(service.update('rpp-1', { title: 'X' }, GURU)).rejects.toThrow(ConflictException);
  });

  it('submit: revision → submitted (siklus revisi); approved → 409', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'revision', content: 'isi', fileUrl: null });
    await service.submit('rpp-1', GURU);
    expect(rppUpdateMany.mock.calls[0][0].data.status).toBe('submitted');

    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'approved', content: 'isi', fileUrl: null });
    await expect(service.submit('rpp-1', GURU)).rejects.toThrow(ConflictException);
  });

  it('review final hanya dari rekomendasi kurikulum; jejak reviewer terisi', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null });
    await service.review('rpp-1', { decision: 'approved', note: null }, KS);
    const data = rppUpdateMany.mock.calls[0][0].data;
    expect(data.status).toBe('approved');
    expect(data.reviewerId).toBe('kc-ks');
    expect(data.reviewedAt).toBeInstanceOf(Date);

    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'submitted', archivedAt: null });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, KS))
      .rejects.toThrow(ForbiddenException);
  });

  it('DTO review: revisi tanpa catatan → ditolak Zod', () => {
    expect(ReviewRppSchema.safeParse({ decision: 'revision' }).success).toBe(false);
    expect(ReviewRppSchema.safeParse({ decision: 'revision', note: 'perbaiki KD' }).success).toBe(true);
    expect(ReviewRppSchema.safeParse({ decision: 'approved' }).success).toBe(true);
  });

  it('remove GURU: hanya draft milik sendiri; SA bebas', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'approved' });
    await expect(service.archive('rpp-1', GURU)).rejects.toThrow(ConflictException);

    rppFindUnique.mockResolvedValue({ id: 'rpp-1', archivedAt: null });
    expect(await service.archive('rpp-1', SA)).toEqual({ archived: true, id: 'rpp-1' });
  });

  it('archive gagal tertutup bila status berubah secara bersamaan', async () => {
    rppFindFirst.mockResolvedValue({ id: 'rpp-1', status: 'draft', archivedAt: null });
    rppUpdateMany.mockResolvedValue({ count: 0 });

    await expect(service.archive('rpp-1', GURU))
      .rejects.toThrow('Status Modul Ajar berubah');
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

  // ── W3-1: Modul Ajar body schema parity ─────────────────────────────────
  // Semua field kaya frontend (kegiatan.pendahuluan/inti/penutup/diferensiasi,
  // asesmen per jenis, refleksi guru/siswa, lampiranUrl, durasiMenit) harus
  // survive round-trip create → read.
  it('W3-1: create dengan body lengkap kaya → tersimpan utuh (round-trip)', async () => {
    const fullBody = {
      fase: 'Fase F',
      pengembang: 'Bu Guru',
      jpAllocation: 8,
      kktp: 75,
      cp: 'CP lengkap',
      kompetensiAwal: 'Siswa tahu dasar',
      tp: ['TP 1.1', 'TP 1.2'],
      atpUraian: 'Uraian ATP',
      atp: [{ tpRef: 'TP 1.1', indikator: 'Indikator A' }],
      profilDimensi: ['Bernalar Kritis'],
      profilUraian: 'Uraian profil',
      sarana: 'Proyektor, laptop',
      target: 'Kelas X TKJ',
      model: 'Problem Based Learning',
      kegiatan: [{
        pertemuan: 'Pertemuan 1',
        deskripsi: 'legacy deskripsi',
        pendahuluan: 'Pendahuluan 15 menit',
        inti: 'Inti 60 menit',
        penutup: 'Penutup 15 menit',
        diferensiasi: 'Diferensiasi konten',
      }],
      asesmen: 'legacy asesmen',
      asesmenDiagnostik: 'Diagnostik di awal',
      asesmenFormatif: 'Formatif harian',
      asesmenSumatif: 'Sumatif akhir',
      pengayaan: 'Pengayaan untuk siswa cepat',
      remedial: 'Remedial untuk siswa lambat',
      refleksi: 'legacy refleksi',
      refleksiGuru: 'Apa yang bisa saya tingkatkan?',
      refleksiSiswa: 'Apa yang sudah saya pahami?',
      lampiran: 'Catatan lampiran',
      lampiranUrl: 'https://example.com/materi.pdf',
      durasiMenit: 45,
    };
    await service.create({
      subject: 'MTK', title: 'Modul Lengkap', academicYear: '2026/2027', semester: 1, submit: false,
      classId: 'class-1', body: fullBody,
    }, GURU);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const stored = rppCreate.mock.calls[0][0].data.body as any;
    // Assert SEMUA field kaya bertahan (tidak di-strip).
    expect(stored.kegiatan[0].pendahuluan).toBe('Pendahuluan 15 menit');
    expect(stored.kegiatan[0].inti).toBe('Inti 60 menit');
    expect(stored.kegiatan[0].penutup).toBe('Penutup 15 menit');
    expect(stored.kegiatan[0].diferensiasi).toBe('Diferensiasi konten');
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(stored.asesmenDiagnostik).toBe('Diagnostik di awal');
    expect(stored.asesmenFormatif).toBe('Formatif harian');
    expect(stored.asesmenSumatif).toBe('Sumatif akhir');
    expect(stored.refleksiGuru).toBe('Apa yang bisa saya tingkatkan?');
    expect(stored.refleksiSiswa).toBe('Apa yang sudah saya pahami?');
    expect(stored.lampiranUrl).toBe('https://example.com/materi.pdf');
    expect(stored.durasiMenit).toBe(45);
  });

  // Two-stage review: Waka/Kaprog recommends; KS approves final.
  it('WAKA_KURIKULUM merekomendasikan, bukan menyetujui final', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'submitted', archivedAt: null });
    await service.review('rpp-1', { decision: 'recommended', note: 'Sesuai kurikulum' }, WAKA);
    const data = rppUpdateMany.mock.calls[0][0].data;
    expect(data.status).toBe('curriculum_reviewed');
    expect(data.reviewerId).toBe('kc-waka');
    // W3-4 P2: reviewerName mencakup role tag untuk audit trail.
    expect(data.reviewerName).toBe('waka [WAKA_KURIKULUM]');
  });

  it('W3-4 P2: KS reviewerName mencakup role tag [KEPALA_SEKOLAH]', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null });
    await service.review('rpp-1', { decision: 'approved', note: null }, KS);
    const data = rppUpdateMany.mock.calls[0][0].data;
    expect(data.reviewerName).toBe('kepsek [KEPALA_SEKOLAH]');
  });

  it('SUPER_ADMIN bukan reviewer pedagogis rutin', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'submitted', archivedAt: null });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, SA))
      .rejects.toThrow(ForbiddenException);
  });

  it('permission tahap review tidak dapat saling menggantikan', async () => {
    rppFindUnique.mockResolvedValue({
      id: 'rpp-1', status: 'submitted', archivedAt: null, curriculumReviewerId: null,
    });
    hasPermission.mockResolvedValue(false);
    await expect(service.review('rpp-1', { decision: 'recommended', note: 'Sesuai' }, WAKA))
      .rejects.toThrow("Permission 'rpp.curriculum.review'");
    expect(rppUpdateMany).not.toHaveBeenCalled();

    rppFindUnique.mockResolvedValue({
      id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null,
      curriculumReviewerId: 'kc-waka-lain',
    });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, KS))
      .rejects.toThrow("Permission 'rpp.final.approve'");
    expect(hasPermission).toHaveBeenLastCalledWith(
      'kc-ks', ['KEPALA_SEKOLAH'], 'rpp.final.approve',
    );
  });

  it('review gagal tertutup bila status berubah secara bersamaan', async () => {
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null });
    rppUpdateMany.mockResolvedValue({ count: 0 });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, KS))
      .rejects.toThrow('Status Modul Ajar berubah');
  });

  it('User multi-role SA+KS mengambil keputusan sebagai Kepala Sekolah', async () => {
    const multiRoleUser = {
      keycloakId: 'kc-multi', username: 'multi', roles: ['KEPALA_SEKOLAH', 'SUPER_ADMIN'],
    } as AuthUser;
    rppFindUnique.mockResolvedValue({ id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null });
    await service.review('rpp-1', { decision: 'approved', note: null }, multiRoleUser);
    const data = rppUpdateMany.mock.calls[0][0].data;
    expect(data.reviewerName).toBe('multi [KEPALA_SEKOLAH]');
  });

  it('user multi-appointment mengikuti tahap dan tidak dapat menyetujui rekomendasinya sendiri', async () => {
    const dualReviewer = {
      keycloakId: 'kc-dual', username: 'dual', roles: ['GURU', 'WAKA_KURIKULUM', 'KEPALA_SEKOLAH'],
    } as AuthUser;
    rppFindUnique.mockResolvedValue({
      id: 'rpp-1', status: 'submitted', archivedAt: null, curriculumReviewerId: null,
    });
    await service.review('rpp-1', { decision: 'recommended', note: 'Sesuai' }, dualReviewer);
    expect(rppUpdateMany.mock.calls[0][0].data.reviewerName).toBe('dual [WAKA_KURIKULUM]');

    rppFindUnique.mockResolvedValue({
      id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null, curriculumReviewerId: 'kc-dual',
    });
    await expect(service.review('rpp-1', { decision: 'approved', note: null }, dualReviewer))
      .rejects.toThrow('aktor yang berbeda');

    rppFindUnique.mockResolvedValue({
      id: 'rpp-1', status: 'curriculum_reviewed', archivedAt: null, curriculumReviewerId: 'kc-waka-lain',
    });
    await service.review('rpp-1', { decision: 'approved', note: null }, dualReviewer);
    expect(rppUpdateMany.mock.calls[1][0].data.reviewerName).toBe('dual [KEPALA_SEKOLAH]');
  });

  it('W3-4: WAKA_KURIKULUM dapat melihat semua RPP (findAll isReviewer=true)', async () => {
    rppFindMany.mockResolvedValue([]);
    rppCount.mockResolvedValue(0);
    await service.findAll({ teacherId: 't-9', page: 1, limit: 20 }, WAKA);
    // WAKA tidak dipaksa ke teacherId sendiri — bebas filter seperti KS/SA.
    expect(rppFindMany.mock.calls[0][0].where.teacherId).toBe('t-9');
  });

  // ── W3-6: TeachingAssignment ownership validation ───────────────────────
  it('W3-6: GURU create tanpa classId → BadRequest (class wajib untuk GURU)', async () => {
    await expect(service.create({
      subject: 'MTK', title: 'X', content: 'isi', academicYear: '2026/2027', semester: 1, submit: false,
    }, GURU)).rejects.toThrow(BadRequestException);
  });

  it('W3-6: GURU create dengan triple class+subject+year di luar assignment → Forbidden', async () => {
    teachingAssignmentFindFirst.mockResolvedValue(null); // tidak ada assignment cocok
    await expect(service.create({
      subject: 'FISIKA', title: 'X', content: 'isi', academicYear: '2026/2027',
      classId: 'class-lain', semester: 1, submit: false,
    }, GURU)).rejects.toThrow(ForbiddenException);
    // Pastikan query assignment menggunakan triple yang benar.
    const call = teachingAssignmentFindFirst.mock.calls[0][0];
    expect(call.where).toEqual({
      teacherId: 'teacher-1',
      classId: 'class-lain',
      subject: 'FISIKA',
      academicYear: '2026/2027',
    });
  });

  it('WAKA yang juga GURU tetap wajib memakai assignment mengajarnya', async () => {
    teacherFindFirst.mockResolvedValue({ id: 'teacher-waka' });
    teachingAssignmentFindFirst.mockResolvedValue(null);
    await expect(service.create({
      subject: 'FISIKA', title: 'X', content: 'isi', academicYear: '2026/2027',
      classId: 'class-z', semester: 1, submit: false,
    }, WAKA)).rejects.toThrow(ForbiddenException);
    expect(teachingAssignmentFindFirst).toHaveBeenCalled();
  });
});

describe('RppController appointment-aware reviewer metadata', () => {
  it('GET reviewer paths request WAKA_KURIKULUM so RolesGuard can enrich from active Appointment', () => {
    expect(Reflect.getMetadata('roles', RppController.prototype.findAll))
      .toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG', 'GURU']);
    expect(Reflect.getMetadata('roles', RppController.prototype.findOne))
      .toEqual(['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG', 'GURU']);
    expect(Reflect.getMetadata('roles', RppController.prototype.review))
      .toEqual(['KEPALA_SEKOLAH', 'WAKA_KURIKULUM', 'KAPROG']);
  });
});
