import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@smk/auth';
import { StudentDashboardService } from '../student-dashboard/student-dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

const SISWA: AuthUser = { keycloakId: 'kc-siswa', username: 'siswa1', roles: ['SISWA'] } as AuthUser;

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
});
