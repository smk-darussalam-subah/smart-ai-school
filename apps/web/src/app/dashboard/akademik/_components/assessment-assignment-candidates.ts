import type { LmsModuleItem, TodayClass } from './guru-types';

export interface AssessmentTeachingAssignment {
  id: string;
  subject: string;
  academicYear: string;
  class: { id: string; name: string };
}

interface BuildAssignmentSessionCandidatesInput {
  assignments: AssessmentTeachingAssignment[];
  lmsModules: LmsModuleItem[];
  subject: string;
  classId: string;
  academicYear: string;
  semester: number;
}

function contextKey(classId: string, subject: string): string {
  return `${classId}|${subject}`;
}

export function buildAssignmentSessionCandidates({
  assignments,
  lmsModules,
  subject,
  classId,
  academicYear,
  semester,
}: BuildAssignmentSessionCandidatesInput): TodayClass[] {
  const moduleByContext = new Map<string, LmsModuleItem[]>();

  for (const module of lmsModules) {
    if (
      !module.classId ||
      module.status === 'archived' ||
      module.academicYear !== academicYear ||
      module.semester !== semester
    ) {
      continue;
    }

    const key = contextKey(module.classId, module.subject);
    const candidates = moduleByContext.get(key) ?? [];
    if (!candidates.some(candidate => candidate.id === module.id)) candidates.push(module);
    moduleByContext.set(key, candidates);
  }

  return assignments.flatMap((assignment) => {
    const assignmentClassId = assignment.class.id;
    const key = contextKey(assignmentClassId, assignment.subject);
    if (
      assignment.academicYear !== academicYear ||
      (subject !== 'all' && assignment.subject !== subject) ||
      (classId !== 'all' && assignmentClassId !== classId)
    ) {
      return [];
    }

    const modules = moduleByContext.get(key) ?? [];

    return modules.map(module => ({
      assignmentId: assignment.id,
      classId: assignmentClassId,
      className: assignment.class.name,
      subject: assignment.subject,
      room: null,
      jpStart: 0,
      jpEnd: 0,
      startLabel: 'Dari penugasan mengajar',
      isNow: false,
      moduleId: module.id,
      moduleTitle: module.title,
      moduleCandidates: modules.length,
    }));
  });
}
