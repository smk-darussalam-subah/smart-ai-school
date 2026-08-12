import type { AssessmentSessionData } from '../actions';
import type { LmsModuleItem, RppItem, TodayClass } from './guru-types';
import type { QuestionSourceOption } from './question-bank-ai-request';

export function buildAssessmentSessionCards(input: {
  assessmentSessions: AssessmentSessionData[];
  subject: string;
  classId: string;
}): TodayClass[] {
  return input.assessmentSessions
    .filter((session) => input.subject === 'all' || session.module?.subject === input.subject)
    .filter((session) => input.classId === 'all' || session.classId === input.classId)
    .map((session) => ({
      classId: session.classId ?? '',
      className: session.class?.name ?? 'Tanpa kelas',
      subject: session.module?.subject ?? 'Mapel',
      room: null,
      jpStart: 0,
      jpEnd: 0,
      startLabel: `${session.title} · ${session.status}`,
      isNow: false,
      moduleId: session.moduleId ?? session.module?.id,
      assessmentSessionId: session.id,
    }));
}

export function mergeAssessmentSessionRegistry(
  current: AssessmentSessionData[],
  next: AssessmentSessionData[],
): AssessmentSessionData[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of next) byId.set(item.id, item);
  return [...byId.values()];
}

export function assessmentSessionQueryKey(input: {
  subject: string;
  classId: string;
  academicYear: string;
  semester: number;
  limit: number;
}): string {
  return [
    input.subject || 'all',
    input.classId || 'all',
    input.academicYear || '',
    String(input.semester),
    String(input.limit),
  ].join('|');
}

export function isAssessmentSessionResponseCurrent(input: {
  requestId: number;
  latestRequestId: number;
  requestKey: string;
  currentKey: string;
}): boolean {
  return input.requestId === input.latestRequestId && input.requestKey === input.currentKey;
}

export function canStartAssessmentSessionPageRequest(input: {
  loading: boolean;
  hasMore: boolean;
  inFlight?: boolean;
}): boolean {
  return !input.inFlight && !input.loading && input.hasMore;
}

export function createAssessmentSessionRequestGate() {
  const inFlightKeys = new Set<string>();
  return {
    isInFlight(key: string): boolean {
      return inFlightKeys.has(key);
    },
    async run<T>(key: string, task: () => Promise<T>): Promise<{ started: true; value: T } | { started: false }> {
      if (inFlightKeys.has(key)) return { started: false };
      inFlightKeys.add(key);
      try {
        return { started: true, value: await task() };
      } finally {
        inFlightKeys.delete(key);
      }
    },
  };
}

export function assessmentSessionPanelState(input: {
  hasSavedSessions: boolean;
  hasTodayCandidates: boolean;
  loading: boolean;
  error: string | null;
}): 'content' | 'loading' | 'error' | 'empty' {
  if (input.hasSavedSessions || input.hasTodayCandidates) return 'content';
  if (input.error) return 'error';
  if (input.loading) return 'loading';
  return 'empty';
}

export function buildQuestionSourceOptions(input: {
  subject: string;
  classId: string;
  lmsModules: LmsModuleItem[];
  rpp: RppItem[];
}): QuestionSourceOption[] {
  if (input.subject === 'all') return [];
  const moduleSources = input.lmsModules
    .filter((module) => module.subject === input.subject && module.status !== 'archived')
    .filter((module) => input.classId === 'all' || module.classId === input.classId)
    .map((module) => ({
      sourceType: 'module' as const,
      id: module.id,
      label: `Modul LMS: ${module.title}${module.class?.name ? ` · ${module.class.name}` : ''}`,
      tpRefs: module.tp ? ['TP 1'] : [],
      tpOptions: module.tp ? [{ ref: 'TP 1', text: module.tp }] : [],
    }));
  const rppSources = input.rpp
    .filter((item) => item.subject === input.subject)
    .filter((item) => input.classId === 'all' || item.classId === input.classId)
    .map((item) => ({
      sourceType: 'rpp' as const,
      id: item.id,
      label: `Modul Ajar: ${item.title}${item.class?.name ? ` · ${item.class.name}` : ''}`,
      tpRefs: item.body?.tp && item.body.tp.length > 0 ? item.body.tp.map((_, index) => `TP ${index + 1}`) : [],
      tpOptions: item.body?.tp && item.body.tp.length > 0
        ? item.body.tp.map((text, index) => ({ ref: `TP ${index + 1}`, text }))
        : [],
    }));
  return [...moduleSources, ...rppSources];
}
