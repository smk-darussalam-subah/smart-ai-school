import { wibTodayISO } from '../../apps/web/src/lib/bell-times';
import type {
  LearningSession,
  LearningContext,
  LearningRead,
  RecapQuery,
  LearningScope,
} from '../../apps/web/src/lib/learning-recap';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
declare global {
  interface Window {
    learningQa: {
      mode: string;
      calls: string[];
      mutations: number;
      journals: number;
      pending: Array<() => void>;
    };
  }
}
export function labSession(index = 0): LearningSession {
  const date = wibTodayISO();
  return {
    id: id(index + 1),
    scheduleId: id(20 + index),
    classId: id(30 + (index % 2)),
    teachingAssignmentId: id(40 + index),
    assignedTeacherId: id(50 + Math.floor(index / 2)),
    assignedTeacherName:
      ['Dina Lestari', 'Raka Setiawan', 'Maya Utami'][Math.floor(index / 2)] ?? 'Guru Sintetis',
    subjectSnapshot: 'Bahasa Indonesia',
    classNameSnapshot: index % 2 ? 'X TJKT 1' : 'X AKL',
    roomSnapshot: 'R-01',
    serviceDate: date + 'T00:00:00.000Z',
    scheduledStartAt: date + (index % 2 ? 'T03:25:00.000Z' : 'T00:30:00.000Z'),
    scheduledEndAt: date + (index % 2 ? 'T04:45:00.000Z' : 'T01:50:00.000Z'),
    status: index === 1 ? 'STARTED' : index % 2 ? 'SCHEDULED' : 'COMPLETED',
    startedAt: index === 1 ? date + 'T03:25:00.000Z' : index % 2 ? null : date + 'T00:30:00.000Z',
    completedAt: index % 2 ? null : date + 'T01:50:00.000Z',
    missedAt: null,
    cancelledAt: null,
    reassignedAt: null,
    cancellationReason: null,
    reassignmentReason: null,
    canOperate: index === 1,
    operationBlockedReason: null,
    academicYear: { code: '2026/2027' },
    semester: { number: 1 },
    schedule: { jpStart: index % 2 ? 5 : 1, jpEnd: index % 2 ? 6 : 2 },
  };
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 40));
export async function fetchLearningRecap(
  query: RecapQuery,
): Promise<LearningRead<LearningSession[]>> {
  window.learningQa.calls.push('recap:' + query.from);
  const mode = window.learningQa.mode;
  if (mode === 'slow')
    await new Promise<void>((resolve) => window.learningQa.pending.push(resolve));
  else await delay();
  if (mode === 'error')
    return { state: 'error', message: 'Data belum dapat dimuat. Coba muat ulang.' };
  if (mode === 'denied')
    return { state: 'denied', message: 'Anda tidak memiliki akses ke data ini.' };
  if (mode === 'empty') return { state: 'ready', data: [] };
  const rows = Array.from({ length: 6 }, (_, n) => labSession(n));
  return { state: 'ready', data: query.scope === 'own' ? rows.slice(0, 2) : rows };
}
export async function fetchLearningContext(
  sessionId: string,
  scope: LearningScope,
): Promise<LearningRead<{ session: LearningSession; context: LearningContext }>> {
  window.learningQa.calls.push('context:' + sessionId);
  if (window.learningQa.mode === 'context-slow')
    await new Promise<void>((resolve) => window.learningQa.pending.push(resolve));
  await delay();
  if (window.learningQa.mode === 'detail-error')
    return { state: 'error', message: 'Rincian belum dapat dimuat. Coba muat ulang.' };
  const row = Array.from({ length: 6 }, (_, n) => labSession(n)).find((x) => x.id === sessionId)!;
  return {
    state: 'ready',
    data: {
      session: row,
      context: {
        capabilities: {
          journal: scope === 'own' && window.learningQa.mode !== 'journal-revoked',
          attendance: scope === 'own',
          module: scope === 'own',
          assessment: scope === 'own',
        },
        modules: {
          state: 'ready',
          data: [
            {
              id: id(100),
              teacherId: row.assignedTeacherId,
              classId: row.classId,
              subject: row.subjectSnapshot,
              title: 'Teks Laporan Hasil Observasi',
              content:
                'Baca contoh teks, identifikasi strukturnya, lalu diskusikan hasil pengamatan.',
              status: 'approved',
              academicYear: '2026/2027',
              semester: 1,
            },
          ],
        },
        journals:
          window.learningQa.mode === 'support-error'
            ? { state: 'error', message: 'Jurnal belum dapat dimuat.' }
            : {
                state: 'ready',
                data: window.learningQa.journals
                  ? [
                      {
                        id: id(104),
                        teacherId: row.assignedTeacherId,
                        classId: row.classId,
                        date: row.serviceDate,
                        title: 'Jurnal sintetis tersimpan',
                        description: 'Kegiatan pengamatan dan diskusi kelompok telah dilaksanakan.',
                      },
                    ]
                  : [],
              },
        attendance: {
          state: 'ready',
          data: Array.from({ length: 4 }, (_, n) => ({
            id: id(120 + n),
            classId: row.classId,
            date: row.serviceDate,
            status: (['hadir', 'hadir', 'izin', 'sakit'] as const)[n]!,
            notes: null,
            student: {
              id: id(130 + n),
              user: {
                fullName: [
                  'Siswa Sintetis A',
                  'Siswa Sintetis B',
                  'Siswa Sintetis C',
                  'Siswa Sintetis D',
                ][n]!,
              },
            },
          })),
        },
        assessments: { state: 'ready', data: [] },
      },
    },
  };
}
export async function fetchSchedulingSubjectCatalog() {
  return {
    success: true as const,
    data: [{ id: id(200), name: 'Bahasa Indonesia', code: 'BINDO', isActive: true }],
  };
}
export async function startClassSession() {
  window.learningQa.mutations++;
  await delay();
  return window.learningQa.mode === 'save-error'
    ? { success: false as const, error: 'Sesi ditolak oleh server.' }
    : { success: true as const, data: {} };
}
export const completeClassSession = startClassSession;
export async function createJurnal() {
  window.learningQa.calls.push('save-journal');
  await delay();
  if (window.learningQa.mode === 'save-error')
    return { success: false, error: 'Jurnal ditolak oleh server.' };
  window.learningQa.journals++;
  return { success: true, data: {} };
}
