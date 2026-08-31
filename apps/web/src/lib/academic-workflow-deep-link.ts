export const ACADEMIC_WORKFLOW_VIEWS = [
  'overview',
  'teaching',
  'module-authoring',
  'question-bank',
  'assessment',
  'remedial',
  'remedial-status',
  'assessment-overview',
] as const;

export type AcademicWorkflowView = (typeof ACADEMIC_WORKFLOW_VIEWS)[number];
export type AcademicWorkflowPersona = 'teacher' | 'principal' | 'student' | 'parent';

const VIEW_SET = new Set<string>(ACADEMIC_WORKFLOW_VIEWS);
const PERSONA_VIEWS: Record<AcademicWorkflowPersona, ReadonlySet<AcademicWorkflowView>> = {
  teacher: new Set(['overview', 'teaching', 'module-authoring', 'question-bank', 'remedial']),
  principal: new Set(['overview', 'module-authoring', 'assessment-overview']),
  student: new Set(['overview', 'assessment', 'remedial-status']),
  parent: new Set(['overview', 'remedial-status']),
};

export interface AcademicWorkflowPresentation {
  teacherScreen: 'ringkasan' | 'pembelajaran' | 'penilaian';
  teacherAssessmentPanel: 'nilai' | 'bank' | 'remedial';
  leadershipScreen: 'beranda' | 'modul' | 'sumatif';
  studentScreen: 'beranda' | 'tugas' | 'nilai';
  studentTaskFilter: 'all' | 'assessment' | 'remedial';
  studentGradeFilter: 'all' | 'remedial';
  parentScreen: 'beranda';
  parentFocus: 'remedial' | null;
}

const DEFAULT_PRESENTATION: AcademicWorkflowPresentation = {
  teacherScreen: 'ringkasan',
  teacherAssessmentPanel: 'nilai',
  leadershipScreen: 'beranda',
  studentScreen: 'beranda',
  studentTaskFilter: 'all',
  studentGradeFilter: 'all',
  parentScreen: 'beranda',
  parentFocus: null,
};

export function isAcademicWorkflowView(value: string): value is AcademicWorkflowView {
  return VIEW_SET.has(value);
}

export function resolveAcademicWorkflowView(
  value: string | string[] | undefined,
  persona: AcademicWorkflowPersona,
): AcademicWorkflowView | null {
  if (typeof value !== 'string' || !isAcademicWorkflowView(value)) return null;
  return PERSONA_VIEWS[persona].has(value) ? value : null;
}

export function academicWorkflowHref(view: AcademicWorkflowView): string {
  return `/dashboard/akademik?view=${encodeURIComponent(view)}`;
}

export function academicWorkflowPresentation(
  view: AcademicWorkflowView | null,
): AcademicWorkflowPresentation {
  if (!view || view === 'overview' || view === 'teaching') return DEFAULT_PRESENTATION;
  if (view === 'module-authoring') {
    return {
      ...DEFAULT_PRESENTATION,
      teacherScreen: 'pembelajaran',
      leadershipScreen: 'modul',
    };
  }
  if (view === 'question-bank') {
    return {
      ...DEFAULT_PRESENTATION,
      teacherScreen: 'penilaian',
      teacherAssessmentPanel: 'bank',
    };
  }
  if (view === 'assessment') {
    return {
      ...DEFAULT_PRESENTATION,
      studentScreen: 'tugas',
      studentTaskFilter: 'assessment',
    };
  }
  if (view === 'remedial') {
    return {
      ...DEFAULT_PRESENTATION,
      teacherScreen: 'penilaian',
      teacherAssessmentPanel: 'remedial',
    };
  }
  if (view === 'remedial-status') {
    return {
      ...DEFAULT_PRESENTATION,
      studentScreen: 'tugas',
      studentTaskFilter: 'remedial',
      parentFocus: 'remedial',
    };
  }
  return { ...DEFAULT_PRESENTATION, leadershipScreen: 'sumatif' };
}

export function filterStudentTasksForWorkflow<T extends {
  assessmentSessionId?: string | null;
  purpose?: 'regular' | 'remedial';
}>(
  tasks: readonly T[],
  filter: AcademicWorkflowPresentation['studentTaskFilter'],
): T[] {
  if (filter === 'all') return [...tasks];
  if (filter === 'remedial') return tasks.filter((task) => task.purpose === 'remedial');
  return tasks.filter((task) => Boolean(task.assessmentSessionId) && task.purpose !== 'remedial');
}
