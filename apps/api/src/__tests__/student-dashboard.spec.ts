import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@smk/auth';
import { StudentDashboardService } from '../student-dashboard/student-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;
const ORTU: AuthUser = { keycloakId: 'kc-ortu', username: 'ortu1', roles: ['ORANG_TUA'] } as AuthUser;

describe('StudentDashboardService remedial visibility', () => {
  it('membatasi remedial assignment ke peserta remedial yang terikat ke siswa', async () => {
    const assessmentFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-siswa' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'student-1',
          nis: '26001',
          classId: 'class-1',
          user: { fullName: 'Siswa Aman' },
          class: { name: 'X TKJ 1' },
        }),
      },
      lmsModule: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentSession: { findMany: assessmentFindMany },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        StudentDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = moduleRef.get(StudentDashboardService);

    await service.getAssignments(SISWA);

    expect(assessmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ purpose: 'regular', classId: 'class-1' }),
          expect.objectContaining({
            purpose: 'remedial',
            remedialParticipants: { some: { studentId: 'student-1', status: { not: 'cancelled' } } },
          }),
        ]),
      }),
      select: expect.not.objectContaining({ questions: true }),
    }));
  });

  it('returns participant-bound remedial lifecycle and deadline without question content', async () => {
    const dueAt = new Date('2026-09-01T03:00:00.000Z');
    const assignedAt = new Date('2026-08-28T03:00:00.000Z');
    const startedAt = new Date('2026-08-29T03:00:00.000Z');
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-siswa' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'student-1',
          nis: '26001',
          classId: 'class-1',
          user: { fullName: 'Siswa Aman' },
          class: { name: 'X TKJ 1' },
        }),
      },
      lmsModule: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentSession: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'remedial-1',
          title: 'Remedial Aljabar',
          type: 'formatif',
          status: 'active',
          purpose: 'remedial',
          academicYear: '2026/2027',
          semester: 1,
          dueAt,
          instructions: 'Kerjakan satu kali sebelum tenggat.',
          module: null,
          teachingAssignment: { subject: 'Matematika' },
          remedialParticipants: [{
            status: 'in_progress',
            assignedAt,
            startedAt,
            submittedAt: null,
            finalizedAt: null,
            kktpValue: 78,
            kktpProvenance: 'subject',
          }],
          responses: [],
        }]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StudentDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = moduleRef.get(StudentDashboardService);

    const result = await service.getAssignments(SISWA);

    expect(result.data[0]?.assignments).toEqual([expect.objectContaining({
      id: 'remedial-1',
      purpose: 'remedial',
      sessionStatus: 'active',
      dueAt: dueAt.toISOString(),
      instructions: 'Kerjakan satu kali sebelum tenggat.',
      remedialParticipant: {
        status: 'in_progress',
        assignedAt: assignedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        submittedAt: null,
        finalizedAt: null,
      },
    })]);
    expect(JSON.stringify(result)).not.toContain('questions');
  });

  it('does not broaden the generic multi-child parent projection with remedial lifecycle metadata', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'parent-1' }) },
      student: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'student-1', nis: '26001', classId: 'class-1',
          user: { fullName: 'Siswa Aman' }, class: { name: 'X TKJ 1' },
        }]),
      },
      lmsModule: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentSession: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'remedial-1', title: 'Remedial Aljabar', type: 'formatif', status: 'active',
          purpose: 'remedial', academicYear: '2026/2027', semester: 1,
          dueAt: new Date('2026-09-01T03:00:00.000Z'), instructions: 'Instruksi privat',
          module: null, teachingAssignment: { subject: 'Matematika' },
          remedialParticipants: [{
            status: 'assigned', assignedAt: new Date('2026-08-28T03:00:00.000Z'),
            startedAt: null, submittedAt: null, finalizedAt: null,
            kktpValue: 78, kktpProvenance: 'subject',
          }],
          responses: [],
        }]),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        StudentDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const service = moduleRef.get(StudentDashboardService);

    const result = await service.getAssignments(ORTU);
    const assignment = result.data[0]?.assignments[0];

    expect(assignment).toEqual(expect.objectContaining({ id: 'remedial-1', purpose: 'remedial' }));
    expect(assignment).not.toHaveProperty('dueAt');
    expect(assignment).not.toHaveProperty('instructions');
    expect(assignment).not.toHaveProperty('remedialParticipant');
  });
});
