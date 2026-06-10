// =============================================================================
// app.e2e-spec.ts — E2E test suite P0 (SMA-50)
//
// Jalur kritikal yang diuji:
//   auth → student CRUD → grade input → attendance → SPP record+approve → AI chat
//   + PPDB public endpoint
//   + negatif: no-token → 401, wrong role → 403, ownership → 403
//
// Isolasi: test DB dari CI service postgres (smk_test).
//          Bukan smk_db produksi/staging (R-05 + N-20).
// Auth: @smk/auth di-mock — tidak butuh Keycloak hidup.
// Ollama: global.fetch di-mock — tidak butuh Ollama hidup.
// =============================================================================

// ── jest.mock harus sebelum semua import (hoisted oleh Jest transform) ────────

jest.mock('@smk/auth', () => {
  const { z } = require('zod');
  const UserRole = z.enum([
    'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA',
    'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI',
  ]);
  return {
    UserRole,
    verifyKeycloakToken: jest.fn(),
    extractAuthUser: jest.fn(),
    hasRole: jest.fn(),
  };
});

jest.mock('@smk/logger', () => ({
  auditLog: jest.fn(),
  logError: jest.fn(),
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock PermissionsService.hasPermission — bypass semua permission check di E2E
// (CI tidak punya data permission ter-seed di DB smk_test)
jest.mock('../src/permissions/permissions.service', () => ({
  PermissionsService: jest.fn().mockImplementation(() => ({
    hasPermission: jest.fn().mockResolvedValue(true),
    getEffectivePermissions: jest.fn().mockResolvedValue(new Set()),
  })),
}));

// ── Set env vars wajib sebelum AppModule diinisialisasi ──────────────────────
process.env['KEYCLOAK_URL'] = process.env['KEYCLOAK_URL'] ?? 'http://localhost:8080';
process.env['KEYCLOAK_REALM'] = process.env['KEYCLOAK_REALM'] ?? 'diis';
process.env['KEYCLOAK_CLIENT_ID'] = process.env['KEYCLOAK_CLIENT_ID'] ?? 'test-client';
process.env['KEYCLOAK_CLIENT_SECRET'] = process.env['KEYCLOAK_CLIENT_SECRET'] ?? 'test-secret';
process.env['AI_PROVIDER'] = 'ollama';
process.env['OLLAMA_URL'] = 'http://ollama-e2e-mock:11434';
process.env['NOTIF_PROVIDER'] = 'log';

import { INestApplication } from '@nestjs/common';
import { NestFastifyApplication, FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { verifyKeycloakToken, extractAuthUser, AuthUser } from '@smk/auth';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

// ── Test IDs — deterministik agar mudah cleanup ──────────────────────────────
// Semua UUID valid format (36 char) — diperlukan oleh @db.Uuid constraint
const IDS = {
  userSA:       'e2e00000-0000-4000-a000-000000000001',
  userKS:       'e2e00000-0000-4000-a000-000000000002',
  userTU:       'e2e00000-0000-4000-a000-000000000003',
  userGuru:     'e2e00000-0000-4000-a000-000000000004',
  userSiswa:    'e2e00000-0000-4000-a000-000000000005',
  userOrtu:     'e2e00000-0000-4000-a000-000000000006',
  // Student milik TU (bukan SISWA) — untuk test ownership 403
  student2:     'e2e00000-0000-4000-b000-000000000005',
  class:        'e2e00000-0000-4000-b000-000000000001',
  teacher:      'e2e00000-0000-4000-b000-000000000002',
  assignment:   'e2e00000-0000-4000-b000-000000000003',
  student:      'e2e00000-0000-4000-b000-000000000004',
  kcSA:         'e2e00000-0000-4000-c000-000000000001',
  kcKS:         'e2e00000-0000-4000-c000-000000000002',
  kcTU:         'e2e00000-0000-4000-c000-000000000003',
  kcGuru:       'e2e00000-0000-4000-c000-000000000004',
  kcSiswa:      'e2e00000-0000-4000-c000-000000000005',
  kcOrtu:       'e2e00000-0000-4000-c000-000000000006',
};

// ── Test tokens → AuthUser mapping ───────────────────────────────────────────
const USERS: Record<string, AuthUser> = {
  'e2e-token-sa':   { keycloakId: IDS.kcSA,    roles: ['SUPER_ADMIN'],    email: 'sa@e2e.test',    username: 'sa-e2e',    fullName: 'SA E2E' },
  'e2e-token-ks':   { keycloakId: IDS.kcKS,    roles: ['KEPALA_SEKOLAH'], email: 'ks@e2e.test',    username: 'ks-e2e',    fullName: 'KS E2E' },
  'e2e-token-tu':   { keycloakId: IDS.kcTU,    roles: ['TATA_USAHA'],     email: 'tu@e2e.test',    username: 'tu-e2e',    fullName: 'TU E2E' },
  'e2e-token-guru': { keycloakId: IDS.kcGuru,  roles: ['GURU'],           email: 'guru@e2e.test',  username: 'guru-e2e',  fullName: 'Guru E2E' },
  'e2e-token-siswa':{ keycloakId: IDS.kcSiswa, roles: ['SISWA'],          email: 'siswa@e2e.test', username: 'siswa-e2e', fullName: 'Siswa E2E' },
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Ollama fetch mock ─────────────────────────────────────────────────────────
const origFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = jest.fn().mockImplementation((url: string) => {
    if (String(url).includes('/api/embeddings')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ embedding: new Array(768).fill(0.1) }),
        text: () => Promise.resolve(''),
      } as Response);
    }
    if (String(url).includes('/api/chat')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: { content: 'Jawaban E2E dari mock Ollama' } }),
        text: () => Promise.resolve(''),
      } as Response);
    }
    return Promise.reject(new Error(`E2E: unhandled fetch url: ${url}`));
  });
});
afterAll(() => {
  globalThis.fetch = origFetch;
});

// ── App + DB setup ────────────────────────────────────────────────────────────
let app: INestApplication;
let prisma: PrismaService;

async function seedTestData() {
  // Hapus data sebelumnya (idempoten) — urutan terbalik
  await prisma.chatMessage.deleteMany({ where: { session: { userId: IDS.userSiswa } } });
  await prisma.chatSession.deleteMany({ where: { userId: { in: Object.values(IDS).filter(id => id.startsWith('e2e00000-0000-4000-a')) } } });
  await prisma.sppPayment.deleteMany({ where: { studentId: IDS.student } });
  await prisma.attendance.deleteMany({ where: { classId: IDS.class } });
  await prisma.grade.deleteMany({ where: { assignmentId: IDS.assignment } });
  await prisma.student.deleteMany({ where: { id: { in: [IDS.student, IDS.student2] } } });
  await prisma.teachingAssignment.deleteMany({ where: { id: IDS.assignment } });
  await prisma.teacher.deleteMany({ where: { id: IDS.teacher } });
  await prisma.class.deleteMany({ where: { id: IDS.class } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e.test' } } });

  // Users
  await prisma.user.createMany({
    data: [
      { id: IDS.userSA,    keycloakId: IDS.kcSA,    email: 'sa@e2e.test',    fullName: 'SA E2E',    role: 'SUPER_ADMIN',    isActive: true },
      { id: IDS.userKS,    keycloakId: IDS.kcKS,    email: 'ks@e2e.test',    fullName: 'KS E2E',    role: 'KEPALA_SEKOLAH', isActive: true },
      { id: IDS.userTU,    keycloakId: IDS.kcTU,    email: 'tu@e2e.test',    fullName: 'TU E2E',    role: 'TATA_USAHA',     isActive: true },
      { id: IDS.userGuru,  keycloakId: IDS.kcGuru,  email: 'guru@e2e.test',  fullName: 'Guru E2E',  role: 'GURU',           isActive: true },
      { id: IDS.userSiswa, keycloakId: IDS.kcSiswa, email: 'siswa@e2e.test', fullName: 'Siswa E2E', role: 'SISWA',          isActive: true },
      { id: IDS.userOrtu,  keycloakId: IDS.kcOrtu,  email: 'ortu@e2e.test',  fullName: 'Ortu E2E',  role: 'ORANG_TUA',      isActive: true },
    ],
  });

  // Class
  await prisma.class.create({
    data: { id: IDS.class, name: 'X RPL E2E', majorCode: 'RPL', grade: 10, academicYear: '2025/2026', capacity: 36 },
  });

  // Teacher
  await prisma.teacher.create({
    data: { id: IDS.teacher, userId: IDS.userGuru, isWaliKelas: false },
  });

  // TeachingAssignment
  await prisma.teachingAssignment.create({
    data: {
      id: IDS.assignment,
      teacherId: IDS.teacher,
      classId: IDS.class,
      subject: 'Matematika E2E',
      hoursPerWeek: 4,
      academicYear: '2025/2026',
    },
  });

  // Student 1 — milik SISWA
  await prisma.student.create({
    data: {
      id: IDS.student,
      userId: IDS.userSiswa,
      nis: 'E2E00001',
      classId: IDS.class,
      parentId: IDS.userOrtu,
      status: 'active',
      joinedAt: new Date('2025-07-14'),
    },
  });

  // Student 2 — milik TU (dipakai untuk test ownership 403 oleh SISWA)
  await prisma.student.create({
    data: {
      id: IDS.student2,
      userId: IDS.userTU,
      nis: 'E2E00002',
      classId: IDS.class,
      status: 'active',
      joinedAt: new Date('2025-07-14'),
    },
  });
}

async function cleanupTestData() {
  await prisma.chatMessage.deleteMany({ where: { session: { userId: IDS.userSiswa } } });
  await prisma.chatSession.deleteMany({ where: { userId: { in: [IDS.userSA, IDS.userGuru, IDS.userSiswa, IDS.userTU, IDS.userKS] } } });
  await prisma.sppPayment.deleteMany({ where: { studentId: IDS.student } });
  await prisma.attendance.deleteMany({ where: { classId: IDS.class } });
  await prisma.grade.deleteMany({ where: { assignmentId: IDS.assignment } });
  await prisma.student.deleteMany({ where: { id: { in: [IDS.student, IDS.student2] } } });
  await prisma.teachingAssignment.deleteMany({ where: { id: IDS.assignment } });
  await prisma.teacher.deleteMany({ where: { id: IDS.teacher } });
  await prisma.class.deleteMany({ where: { id: IDS.class } });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@e2e.test' } } });
}

beforeAll(async () => {
  // Konfigurasi auth mock
  (verifyKeycloakToken as jest.Mock).mockImplementation((token: string) => {
    const user = USERS[token];
    if (!user) return Promise.reject(new Error('Invalid E2E token'));
    return Promise.resolve({ sub: user.keycloakId });
  });
  (extractAuthUser as jest.Mock).mockImplementation((payload: { sub: string }) => {
    const user = Object.values(USERS).find((u) => u.keycloakId === payload.sub);
    if (!user) throw new Error(`Unknown keycloakId in E2E: ${payload.sub}`);
    return user;
  });

  // Boot NestJS app
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] });
  await app.init();
  await (app.getHttpAdapter() as unknown as { getInstance(): { ready(): Promise<void> } }).getInstance().ready();

  prisma = app.get(PrismaService);
  await seedTestData();
}, 60_000);

afterAll(async () => {
  await cleanupTestData();
  await app.close();
}, 30_000);

// ── Helpers ───────────────────────────────────────────────────────────────────
function req() {
  return supertest(app.getHttpServer());
}

// =============================================================================
// JALUR P0
// =============================================================================

// ── Health (smoke test) ───────────────────────────────────────────────────────
describe('GET /health', () => {
  it('200 — DB dan memory healthy', async () => {
    const res = await req().get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
describe('Auth — GET /api/v1/auth/me', () => {
  it('SA terautentikasi → 200 dengan data user', async () => {
    const res = await req().get('/api/v1/auth/me').set(auth('e2e-token-sa')).expect(200);
    expect(res.body).toHaveProperty('email', 'sa@e2e.test');
    expect(res.body).toHaveProperty('role', 'SUPER_ADMIN');
  });

  it('tanpa token → 401', async () => {
    await req().get('/api/v1/auth/me').expect(401);
  });
});

// ── Student CRUD ──────────────────────────────────────────────────────────────
describe('Student CRUD', () => {
  it('GET /api/v1/students/:id — SA melihat student → 200', async () => {
    const res = await req()
      .get(`/api/v1/students/${IDS.student}`)
      .set(auth('e2e-token-sa'))
      .expect(200);
    expect(res.body.nis).toBe('E2E00001');
  });

  it('GET /api/v1/students/:id — SISWA melihat data diri sendiri → 200', async () => {
    const res = await req()
      .get(`/api/v1/students/${IDS.student}`)
      .set(auth('e2e-token-siswa'))
      .expect(200);
    expect(res.body.id).toBe(IDS.student);
  });

  it('GET /api/v1/students/:id — SISWA akses student lain (milik TU) → 403', async () => {
    // student2 ada di DB tapi userId-nya = TU, bukan SISWA → ownership check → 403
    await req()
      .get(`/api/v1/students/${IDS.student2}`)
      .set(auth('e2e-token-siswa'))
      .expect(403);
  });

  it('GET /api/v1/students — SISWA tidak ada di @Roles → 403', async () => {
    await req().get('/api/v1/students').set(auth('e2e-token-siswa')).expect(403);
  });

  it('POST /api/v1/students — SA buat student baru → 201', async () => {
    // Student baru dengan userId lain (userOrtu yang belum punya student)
    const res = await req()
      .post('/api/v1/students')
      .set(auth('e2e-token-sa'))
      .send({
        userId: IDS.userOrtu,
        nis: 'E2E-TMP-002',
        classId: IDS.class,
        status: 'active',
        joinedAt: '2025-07-14',
      })
      .expect(201);
    expect(res.body.nis).toBe('E2E-TMP-002');

    // Cleanup student temporary
    await prisma.student.delete({ where: { id: res.body.id } });
  });
});

// ── Grade input ───────────────────────────────────────────────────────────────
describe('Grade input', () => {
  let createdGradeId: string;

  it('POST /api/v1/grades — GURU input nilai → 201', async () => {
    const res = await req()
      .post('/api/v1/grades')
      .set(auth('e2e-token-guru'))
      .send({
        studentId:    IDS.student,
        assignmentId: IDS.assignment,
        semester:     1,
        score:        85,
        type:         'uh',
        notes:        'E2E test nilai',
      })
      .expect(201);
    expect(res.body.score).toBe('85');
    expect(res.body.submittedBy).toBe(IDS.userGuru);
    createdGradeId = res.body.id;
  });

  it('GET /api/v1/grades — GURU melihat nilai dari assignment sendiri → 200', async () => {
    const res = await req().get('/api/v1/grades').set(auth('e2e-token-guru')).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Semua nilai harus dari assignment GURU ini
    res.body.data.forEach((g: { assignment: { teacherId: string } }) => {
      expect(g.assignment.teacherId).toBe(IDS.teacher);
    });
  });

  it('GET /api/v1/grades — SISWA melihat nilai diri sendiri → 200', async () => {
    const res = await req().get('/api/v1/grades').set(auth('e2e-token-siswa')).expect(200);
    res.body.data.forEach((g: { studentId: string }) => {
      expect(g.studentId).toBe(IDS.student);
    });
  });

  it('POST /api/v1/grades — SISWA tidak ada di @Roles → 403', async () => {
    await req()
      .post('/api/v1/grades')
      .set(auth('e2e-token-siswa'))
      .send({ studentId: IDS.student, assignmentId: IDS.assignment, semester: 1, score: 90, type: 'uh' })
      .expect(403);
  });

  afterAll(async () => {
    if (createdGradeId) {
      await prisma.grade.deleteMany({ where: { assignmentId: IDS.assignment } });
    }
  });
});

// ── Attendance ────────────────────────────────────────────────────────────────
describe('Attendance', () => {
  it('POST /api/v1/attendance — GURU bulk input → 201', async () => {
    const res = await req()
      .post('/api/v1/attendance')
      .set(auth('e2e-token-guru'))
      .send({
        classId: IDS.class,
        date: '2026-01-15',
        records: [{ studentId: IDS.student, status: 'hadir' }],
      })
      .expect(201);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].status).toBe('hadir');
  });

  it('GET /api/v1/attendance — SISWA melihat absensi diri sendiri → 200', async () => {
    const res = await req().get('/api/v1/attendance').set(auth('e2e-token-siswa')).expect(200);
    res.body.data.forEach((a: { studentId: string }) => {
      expect(a.studentId).toBe(IDS.student);
    });
  });

  it('POST /api/v1/attendance — SISWA tidak ada di @Roles → 403', async () => {
    await req()
      .post('/api/v1/attendance')
      .set(auth('e2e-token-siswa'))
      .send({ classId: IDS.class, date: '2026-01-16', records: [{ studentId: IDS.student, status: 'hadir' }] })
      .expect(403);
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({ where: { classId: IDS.class } });
  });
});

// ── Finance SPP ───────────────────────────────────────────────────────────────
describe('Finance SPP', () => {
  let sppId: string;

  it('POST /api/v1/finance/spp — TU catat pembayaran → 201', async () => {
    const res = await req()
      .post('/api/v1/finance/spp')
      .set(auth('e2e-token-tu'))
      .send({
        studentId: IDS.student,
        month:  1,
        year:   2026,
        amount: 500000,
        status: 'paid',
      })
      .expect(201);
    expect(res.body.studentId).toBe(IDS.student);
    expect(String(res.body.amount)).toBe('500000');
    sppId = res.body.id;
  });

  it('POST /api/v1/finance/spp/:id/approve — KS approve pembayaran → 200', async () => {
    const res = await req()
      .post(`/api/v1/finance/spp/${sppId}/approve`)
      .set(auth('e2e-token-ks'))
      .expect(200);
    expect(res.body.approvedBy).toBe(IDS.userKS);
  });

  it('GET /api/v1/finance/spp — SISWA melihat SPP diri sendiri → 200', async () => {
    const res = await req().get('/api/v1/finance/spp').set(auth('e2e-token-siswa')).expect(200);
    res.body.data.forEach((p: { studentId: string }) => {
      expect(p.studentId).toBe(IDS.student);
    });
  });

  it('GET /api/v1/finance/spp/:id/history — KS melihat histori siswa → 200 (F-1 fix)', async () => {
    const res = await req()
      .get(`/api/v1/finance/spp/${IDS.student}/history`)
      .set(auth('e2e-token-ks'))
      .expect(200);
    expect(res.body.payments.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/finance/spp — GURU tidak ada di @Roles → 403', async () => {
    await req()
      .post('/api/v1/finance/spp')
      .set(auth('e2e-token-guru'))
      .send({ studentId: IDS.student, month: 2, year: 2026, amount: 500000 })
      .expect(403);
  });

  afterAll(async () => {
    await prisma.sppPayment.deleteMany({ where: { studentId: IDS.student } });
  });
});

// ── PPDB — public endpoint ────────────────────────────────────────────────────
describe('PPDB — POST /api/v1/ppdb/leads (public)', () => {
  it('form publik tanpa token → 201 { id, status }', async () => {
    const res = await req()
      .post('/api/v1/ppdb/leads')
      .send({
        fullName: 'Calon Siswa E2E',
        phone: '081234567890',
        source: 'website',
      })
      .expect(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('status', 'new');
    // Response publik tidak boleh mengandung data lead lain
    expect(res.body).not.toHaveProperty('fullName');
    expect(res.body).not.toHaveProperty('phone');

    // Cleanup lead yang dibuat
    await prisma.ppdbLead.deleteMany({ where: { id: res.body.id } });
  });

  it('GURU GET /api/v1/ppdb/stats → 200 (F-2: agregat tanpa PII)', async () => {
    const res = await req().get('/api/v1/ppdb/stats').set(auth('e2e-token-guru')).expect(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('conversionRate');
  });

  it('GURU GET /api/v1/ppdb/leads → 403 (data individual calon siswa = PII)', async () => {
    await req().get('/api/v1/ppdb/leads').set(auth('e2e-token-guru')).expect(403);
  });
});

// ── AI Chat ───────────────────────────────────────────────────────────────────
describe('AI Chat', () => {
  it('POST /api/v1/ai/chat — user terautentikasi → 200 dengan answer + sessionId', async () => {
    const res = await req()
      .post('/api/v1/ai/chat')
      .set(auth('e2e-token-siswa'))
      .send({ message: 'Apa jadwal sekolah hari ini?' })
      .expect(200);
    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('sessionId');
    expect(typeof res.body.sessionId).toBe('string');
    expect(res.body.answer).toBe('Jawaban E2E dari mock Ollama');
  });

  it('POST /api/v1/ai/chat — session lanjutan → sessionId sama', async () => {
    // Chat pertama buat session
    const first = await req()
      .post('/api/v1/ai/chat')
      .set(auth('e2e-token-guru'))
      .send({ message: 'Pertanyaan pertama' })
      .expect(200);

    const sid = first.body.sessionId;

    // Chat kedua append ke session yang sama
    const second = await req()
      .post('/api/v1/ai/chat')
      .set(auth('e2e-token-guru'))
      .send({ message: 'Pertanyaan lanjutan', sessionId: sid })
      .expect(200);

    expect(second.body.sessionId).toBe(sid);
  });

  it('GET /api/v1/ai/chat/:sessionId/history — pemilik melihat history → 200', async () => {
    // Buat session dulu
    const chat = await req()
      .post('/api/v1/ai/chat')
      .set(auth('e2e-token-siswa'))
      .send({ message: 'Pertanyaan untuk history test' })
      .expect(200);

    const sid = chat.body.sessionId;

    const res = await req()
      .get(`/api/v1/ai/chat/${sid}/history`)
      .set(auth('e2e-token-siswa'))
      .expect(200);

    expect(res.body.sessionId).toBe(sid);
    expect(res.body.messages.length).toBeGreaterThanOrEqual(2);
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('assistant');
  });

  it('POST /api/v1/ai/chat — SA akses history SISWA → 200 (SA bypass ownership)', async () => {
    const chat = await req()
      .post('/api/v1/ai/chat')
      .set(auth('e2e-token-siswa'))
      .send({ message: 'Pertanyaan SA bypass test' })
      .expect(200);

    await req()
      .get(`/api/v1/ai/chat/${chat.body.sessionId}/history`)
      .set(auth('e2e-token-sa'))
      .expect(200);
  });

  it('POST /api/v1/ai/chat — tanpa token → 401', async () => {
    await req()
      .post('/api/v1/ai/chat')
      .send({ message: 'test tanpa auth' })
      .expect(401);
  });
});
