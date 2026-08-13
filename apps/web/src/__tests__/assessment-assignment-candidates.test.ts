import { buildAssignmentSessionCandidates } from '../app/dashboard/akademik/_components/assessment-assignment-candidates';
import type { AssessmentTeachingAssignment } from '../app/dashboard/akademik/_components/assessment-assignment-candidates';
import type { LmsModuleItem, TodayClass } from '../app/dashboard/akademik/_components/guru-types';

const ACTIVE_YEAR = '2026/2027';
const ACTIVE_SEMESTER = 1;

function assignment(overrides: Partial<AssessmentTeachingAssignment> = {}): AssessmentTeachingAssignment {
  return {
    id: 'assignment-1',
    subject: 'TJKT',
    academicYear: ACTIVE_YEAR,
    class: { id: 'class-1', name: 'X TKJ 1' },
    ...overrides,
  };
}

function module(overrides: Partial<LmsModuleItem> = {}): LmsModuleItem {
  return {
    id: 'module-1',
    rppId: null,
    classId: 'class-1',
    subject: 'TJKT',
    title: 'Jaringan Dasar',
    tp: null,
    jpAllocation: 4,
    kktp: 75,
    content: null,
    orderIndex: 1,
    status: 'draft',
    academicYear: ACTIVE_YEAR,
    semester: ACTIVE_SEMESTER,
    class: { id: 'class-1', name: 'X TKJ 1' },
    ...overrides,
  };
}

function build(
  assignments: AssessmentTeachingAssignment[],
  lmsModules: LmsModuleItem[],
  todayClasses: TodayClass[] = [],
): TodayClass[] {
  return buildAssignmentSessionCandidates({
    assignments,
    lmsModules,
    todayClasses,
    subject: 'all',
    classId: 'all',
    academicYear: ACTIVE_YEAR,
    semester: ACTIVE_SEMESTER,
  });
}

describe('assignment-based assessment session candidates', () => {
  it('exposes an active assignment with a matching LMS module without requiring a schedule', () => {
    expect(build([assignment()], [module()])).toEqual([
      expect.objectContaining({
        classId: 'class-1',
        className: 'X TKJ 1',
        subject: 'TJKT',
        moduleId: 'module-1',
        startLabel: 'Dari penugasan mengajar',
      }),
    ]);
  });

  it('does not expose assignments without a usable LMS module', () => {
    expect(build([assignment()], [])).toEqual([]);
    expect(build([assignment()], [module({ status: 'archived' })])).toEqual([]);
    expect(build([assignment()], [module({ academicYear: '2025/2026' })])).toEqual([]);
    expect(build([assignment()], [module({ semester: 2 })])).toEqual([]);
  });

  it('only exposes active-year assignments and avoids duplicating a scheduled context', () => {
    const scheduled: TodayClass = {
      classId: 'class-1',
      className: 'X TKJ 1',
      subject: 'TJKT',
      room: 'Lab 1',
      jpStart: 1,
      jpEnd: 2,
      startLabel: '07.00',
      isNow: false,
      moduleId: 'module-1',
    };

    expect(build([assignment({ academicYear: '2025/2026' })], [module()])).toEqual([]);
    expect(build([assignment()], [module()], [scheduled])).toEqual([]);
  });

  it('respects the active subject and class filters', () => {
    const input = {
      assignments: [assignment()],
      lmsModules: [module()],
      todayClasses: [],
      academicYear: ACTIVE_YEAR,
      semester: ACTIVE_SEMESTER,
    };

    expect(buildAssignmentSessionCandidates({ ...input, subject: 'Matematika', classId: 'all' })).toEqual([]);
    expect(buildAssignmentSessionCandidates({ ...input, subject: 'TJKT', classId: 'class-2' })).toEqual([]);
  });
});
