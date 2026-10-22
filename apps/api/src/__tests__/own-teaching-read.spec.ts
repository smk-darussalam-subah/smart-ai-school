import type { AuthUser } from '@smk/auth';
import type { PrismaService } from '../prisma/prisma.service';
import { resolveOwnTeachingRead } from '../common/helpers/own-teaching-read';
import { TeachingAssignmentService } from '../teaching-assignment/teaching-assignment.service';
import { ScheduleService } from '../schedule/schedule.service';
import { ClassSessionService } from '../class-sessions/class-session.service';
import { RppService } from '../rpp/rpp.service';
import { LmsService } from '../lms/lms.service';
import { ClassActivitiesService } from '../class-activities/class-activities.service';
import { AssessmentService } from '../assessment/assessment.service';
import { ListAssignmentsQuerySchema } from '../teaching-assignment/dto/list-assignments.dto';
import { ListScheduleQuerySchema } from '../schedule/dto/list-schedule.dto';
import { ListClassSessionQuerySchema } from '../class-sessions/class-session.dto';
import { ListRppQuerySchema } from '../rpp/dto/rpp.dto';
import { ListLmsModuleQuerySchema } from '../lms/dto/lms.dto';
import { ListActivitiesQuerySchema } from '../class-activities/dto/class-activity.dto';
import { ListAssessmentSessionSchema } from '../assessment/dto/assessment.dto';
import { AnalyticsController } from '../analytics/analytics.controller';
import { AnalyticsService, type StudentAnalyticsService } from '../analytics/analytics.service';
import type { PermissionsService } from '../permissions/permissions.service';

const actor = (roles: string[]) => ({ keycloakId: 'own-kc', roles }) as AuthUser;
function fixture() {
  const table = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  });
  const prisma = {
    teacher: { findFirst: jest.fn().mockResolvedValue({ id: 'own-teacher' }) },
    teachingAssignment: table(),
    schedule: table(),
    classSession: table(),
    rpp: table(),
    lmsModule: table(),
    classActivity: table(),
    assessmentSession: table(),
  };
  return { prisma, db: prisma as unknown as PrismaService };
}
describe('explicit own-teaching scope', () => {
  it('CP-progress production query keeps own-teacher filtering for Guru with a leadership role', async () => {
    const { prisma } = fixture();
    const analyticsDb = {
      ...prisma,
      semester: { findFirst: jest.fn().mockResolvedValue({ id: 'semester' }) },
      grade: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new AnalyticsService(
      analyticsDb as unknown as PrismaService,
      {} as ConstructorParameters<typeof AnalyticsService>[1],
      {} as ConstructorParameters<typeof AnalyticsService>[2],
    );
    await service.cpProgress(
      { scope: 'own', academicYear: '2026/2027', semester: 1 },
      actor(['GURU', 'KEPALA_SEKOLAH']),
    );
    expect(analyticsDb.grade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academicYear: '2026/2027',
          semester: 1,
          assignment: { teacherId: 'own-teacher' },
        }),
      }),
    );
  });
  it('CP-progress HTTP parsing retains the personal scope and still checks the grade grant', async () => {
    const service = { cpProgress: jest.fn().mockResolvedValue({}) };
    const permissions = {
      getEffectivePermissions: jest.fn().mockResolvedValue(new Set(['academic.grade.read'])),
    };
    const controller = new AnalyticsController(
      service as unknown as AnalyticsService,
      {} as StudentAnalyticsService,
      permissions as unknown as PermissionsService,
    );
    const user = actor(['GURU', 'KEPALA_SEKOLAH']);
    await controller.cpProgress({ scope: 'own', academicYear: '2026/2027', semester: '1' }, user);
    expect(service.cpProgress).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'own', semester: 1 }),
      user,
    );
    permissions.getEffectivePermissions.mockResolvedValue(new Set());
    await expect(controller.cpProgress({ scope: 'own' }, user)).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['KEPALA_SEKOLAH', 'KAPROG', 'WAKA_KURIKULUM', 'WAKA_KESISWAAN'])(
    '%s can retain own teaching without pretending to be a global reader',
    async (code) => {
      const { db, prisma } = fixture();
      await expect(resolveOwnTeachingRead(db, actor(['GURU', code]), 'own')).resolves.toBe(
        'own-teacher',
      );
      expect(prisma.teacher.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            user: expect.objectContaining({
              keycloakId: 'own-kc',
              role: 'GURU',
              isActive: true,
              deletedAt: null,
              staff: { is: { deletedAt: null } },
            }),
          }),
        }),
      );
    },
  );
  it('default read does not change appointment scope or resolve an identity', async () => {
    const { db, prisma } = fixture();
    await expect(resolveOwnTeachingRead(db, actor(['GURU', 'KAPROG']))).resolves.toBeNull();
    expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
  });
  it.each([['SISWA'], ['ORANG_TUA'], ['TATA_USAHA'], ['SUPER_ADMIN'], ['KEPALA_SEKOLAH']])(
    'rejects a retained profile without Guru identity: %j',
    async (...roles) => {
      const { db, prisma } = fixture();
      await expect(resolveOwnTeachingRead(db, actor(roles), 'own')).rejects.toMatchObject({
        status: 403,
      });
      expect(prisma.teacher.findFirst).not.toHaveBeenCalled();
    },
  );
  it('denies missing/ineligible profile and arbitrary teacherId', async () => {
    const { db, prisma } = fixture();
    await expect(
      resolveOwnTeachingRead(db, actor(['GURU', 'KAPROG']), 'own', 'foreign'),
    ).rejects.toMatchObject({ status: 403 });
    prisma.teacher.findFirst.mockResolvedValue(null);
    await expect(resolveOwnTeachingRead(db, actor(['GURU']), 'own')).rejects.toMatchObject({
      status: 403,
    });
  });
  it.each(['assignments', 'schedule', 'sessions', 'rpp', 'lms', 'journal', 'assessment'] as const)(
    '%s enforces own teacher at the production query, not client filtering',
    async (domain) => {
      const { db, prisma } = fixture();
      const user = actor(['GURU', 'KAPROG']);
      const period = {} as ConstructorParameters<typeof ScheduleService>[1];
      const bells = {} as ConstructorParameters<typeof ScheduleService>[2];
      const emitter = {} as ConstructorParameters<typeof AssessmentService>[1];
      switch (domain) {
        case 'assignments':
          await new TeachingAssignmentService(db).findAll(
            ListAssignmentsQuerySchema.parse({ scope: 'own' }),
            user,
          );
          expect(prisma.teachingAssignment.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teacherId: 'own-teacher' }),
            }),
          );
          break;
        case 'schedule':
          await new ScheduleService(db, period, bells).findAll(
            ListScheduleQuerySchema.parse({ scope: 'own' }),
            user,
          );
          expect(prisma.schedule.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teachingAssignment: { teacherId: 'own-teacher' } }),
            }),
          );
          break;
        case 'sessions':
          await new ClassSessionService(db, bells).list(
            ListClassSessionQuerySchema.parse({ scope: 'own' }),
            user,
          );
          expect(prisma.classSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ assignedTeacherId: 'own-teacher' }),
            }),
          );
          break;
        case 'rpp':
          await new RppService(
            db,
            emitter,
            {} as ConstructorParameters<typeof RppService>[2],
            period,
          ).findAll(ListRppQuerySchema.parse({ scope: 'own' }), user);
          expect(prisma.rpp.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teacherId: 'own-teacher' }),
            }),
          );
          break;
        case 'lms':
          await new LmsService(db, period).findAll(
            ListLmsModuleQuerySchema.parse({ scope: 'own' }),
            user,
          );
          expect(prisma.lmsModule.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teacherId: 'own-teacher' }),
            }),
          );
          break;
        case 'journal':
          await new ClassActivitiesService(
            db,
            {} as ConstructorParameters<typeof ClassActivitiesService>[1],
          ).findAll(ListActivitiesQuerySchema.parse({ scope: 'own' }), user);
          expect(prisma.classActivity.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teacherId: 'own-teacher' }),
            }),
          );
          break;
        case 'assessment':
          await new AssessmentService(db, emitter, period).findAll(
            ListAssessmentSessionSchema.parse({ scope: 'own' }),
            user,
          );
          expect(prisma.assessmentSession.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({ teacherId: 'own-teacher' }),
            }),
          );
          break;
      }
    },
  );
});
