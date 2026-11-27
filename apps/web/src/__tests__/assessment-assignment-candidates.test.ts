import { buildAssignmentSessionCandidates } from '../app/dashboard/akademik/_components/assessment-assignment-candidates';
import type { AssessmentTeachingAssignment } from '../app/dashboard/akademik/_components/assessment-assignment-candidates';
import type { LmsModuleItem, TodayClass } from '../app/dashboard/akademik/_components/guru-types';
import { lessonLinks } from '../lib/academic-scheduling';

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
): TodayClass[] {
  return buildAssignmentSessionCandidates({
    assignments,
    lmsModules,
    subject: 'all',
    classId: 'all',
    academicYear: ACTIVE_YEAR,
    semester: ACTIVE_SEMESTER,
  });
}

describe('assignment-based assessment session candidates', () => {
  it('exposes every matching module as an explicit choice rather than first-wins',()=>{
    const candidates=build([assignment()],[module(),module({id:'module-2',title:'Pilihan kedua',status:'published'})]);
    expect(candidates.map(c=>c.moduleId)).toEqual(['module-1','module-2']);
    expect(candidates.map(c=>c.moduleCandidates)).toEqual([2,2]);
    expect(candidates[1]?.moduleTitle).toBe('Pilihan kedua');
  });
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

  it('keeps explicit choices when the KBM shortcut links only a published module', () => {
    const draft = module({ teacherId: 'teacher-1' });
    const published = module({ id: 'published-1', teacherId: 'teacher-1', status: 'published' });
    const period = { academicYear: ACTIVE_YEAR, semester: ACTIVE_SEMESTER };
    const schedule = {
      id: 'schedule-1', classId: 'class-1', academicYear: ACTIVE_YEAR, semester: ACTIVE_SEMESTER,
      dayOfWeek: 4, jpStart: 1, jpEnd: 2, class: { id: 'class-1', name: 'X TKJ 1' },
      teachingAssignment: { id: 'assignment-1', subject: 'TJKT', teacher: { id: 'teacher-1', user: { fullName: 'Guru sintetis' } } },
    };

    expect(lessonLinks(schedule, period, [draft], [])).toMatchObject({ moduleId: undefined });
    expect(lessonLinks(schedule, period, [draft, published], [])).toMatchObject({ moduleId: 'published-1' });
    expect(build([assignment()], [draft, published]).map(({ moduleId }) => moduleId)).toEqual(['module-1', 'published-1']);
    expect(build([assignment({ academicYear: '2025/2026' })], [draft])).toEqual([]);
  });

  it('respects the active subject and class filters', () => {
    const input = {
      assignments: [assignment()],
      lmsModules: [module()],
      academicYear: ACTIVE_YEAR,
      semester: ACTIVE_SEMESTER,
    };

    expect(buildAssignmentSessionCandidates({ ...input, subject: 'Matematika', classId: 'all' })).toEqual([]);
    expect(buildAssignmentSessionCandidates({ ...input, subject: 'TJKT', classId: 'class-2' })).toEqual([]);
  });
});
