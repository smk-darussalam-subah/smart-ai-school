import type { Prisma } from '@prisma/client';
import type { AcademicPeriodService } from '../../academic-period/academic-period.service';
import type { BellScheduleService } from '../../bell-schedule/bell-schedule.service';

/** Explicit active-period/config fixtures for pre-existing lifecycle unit tests.
 * The activation contract itself is proved against real PostgreSQL separately. */
export function sessionActivationFixture(row: {
  id: string;
  assignedTeacherId: string;
  serviceDate: Date;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  semesterId?: string;
  academicYearId?: string;
  bellScheduleProfileId?: string;
  classId?: string;
  teachingAssignmentId?: string;
}) {
  const year = {
    isActive: true,
    id: row.academicYearId ?? 'year',
    code: '2026/2027',
    startDate: new Date('2026-07-01'),
    endDate: new Date('2027-06-30'),
  };
  const semester = {
    id: row.semesterId ?? 'semester',
    number: 1,
    academicYearId: year.id,
    startDate: year.startDate,
    endDate: new Date('2026-12-31'),
    closure: null,
    academicYear: year,
  };
  return {
    queryRaw: async (query: Prisma.Sql) =>
      query.strings.join('').includes('class_session_activations')
        ? [{ enabled: true, revision: 1, semesterId: semester.id }]
        : [{ id: row.id }, { id: row.assignedTeacherId }, { id: 'replacement' }],
    binding: (arg: { where: { eventKey: string } }) =>
      Promise.resolve(
        arg.where.eventKey.startsWith('class-session:activation:') ? { id: 'binding' } : null,
      ),
    domain: {
      academicYear: {
        findMany: jest.fn().mockResolvedValue([year]),
        count: jest.fn().mockResolvedValue(1),
      },
      semester: { findMany: jest.fn().mockResolvedValue([semester]) },
      academicCalendar: { findFirst: jest.fn().mockResolvedValue(null) },
      schedule: {
        findUnique: jest.fn().mockResolvedValue({
          classId: row.classId,
          teachingAssignmentId: row.teachingAssignmentId,
          academicYear: year.code,
          semester: 1,
          jpStart: 1,
          jpEnd: 1,
          concurrencyGroup: null,
        }),
      },
    },
    period: {
      acquireCutoverLock: jest.fn(),
      assertWritableSemesterId: jest.fn(),
    } as unknown as AcademicPeriodService,
    bells: {
      resolveForDate: jest.fn().mockResolvedValue({ id: row.bellScheduleProfileId, segments: [] }),
      resolveInstructionWindow: jest
        .fn()
        .mockReturnValue({ startAt: row.scheduledStartAt, endAt: row.scheduledEndAt }),
    } as unknown as BellScheduleService,
  };
}
