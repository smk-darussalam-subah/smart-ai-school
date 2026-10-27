import { z } from 'zod';
import type { ApiFetchResult } from './api';
import type { SiswaTugas } from '@/app/dashboard/akademik/_components/siswa/siswa-types';
import {
  normalizeSppGroups,
  type SppApiItem,
} from '@/app/dashboard/akademik/_components/ortu/ortu-mappers';

/** Non-ready reads deliberately carry no records, including during a retry. */
export type DashboardRead<T> =
  | { state: 'ready'; data: T[] }
  | { state: 'loading' | 'unavailable' | 'denied'; data?: never };
export type DashboardReadState = DashboardRead<never>['state'];

const text = z.string().min(1);
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const participant = z.object({
  status: z.enum(['assigned', 'in_progress', 'submitted', 'passed', 'needs_retry']),
  assignedAt: date,
  startedAt: date.nullable(),
  submittedAt: date.nullable(),
  finalizedAt: date.nullable(),
});
const task = z.object({
  id: text,
  type: z.enum(['lms', 'assessment']),
  title: text,
  subject: text,
  guru: z.string().nullable(),
  status: z.enum(['pending', 'submitted', 'graded', 'closed']),
  progress: z.number().finite().min(0).max(100).optional(),
  purpose: z.enum(['regular', 'remedial']).optional(),
  sessionStatus: z.string().optional(),
  attemptStarted: z.boolean().optional(),
  dueAt: date.nullable().optional(),
  instructions: z.string().nullable().optional(),
  lateSubmissionStatus: z.enum(['pending', 'accepted', 'rejected']).nullable().optional(),
  remedialParticipant: participant.nullable().optional(),
});
const taskGroups = z.object({
  data: z.array(z.object({ studentId: text, assignments: z.array(task) })),
});
const amount = z
  .union([z.number(), z.string().min(1)])
  .refine(
    (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && String(value).trim() !== '',
  );
const paymentGroups = z.object({
  data: z.array(
    z.object({
      studentId: text,
      studentName: text,
      payments: z.array(
        z.object({
          id: text,
          month: z.number().int().min(1).max(12),
          year: z.number().int().positive(),
          amount,
          status: z.enum(['paid', 'unpaid']),
          paidAt: date.nullable().optional(),
          dueDate: date.nullable().optional(),
          receiptNo: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
});

function failure<T>(result: ApiFetchResult<unknown> | null): DashboardRead<T> | null {
  if (result?.status === 'success') return null;
  return { state: result?.status === 'forbidden' ? 'denied' : 'unavailable' };
}

export function readStudentTasks(
  result: ApiFetchResult<unknown> | null,
  now = new Date(),
): DashboardRead<SiswaTugas> {
  const failed = failure<SiswaTugas>(result);
  if (failed) return failed;
  const parsed = taskGroups.safeParse(result?.status === 'success' ? result.data : null);
  // The own-student endpoint must identify exactly one student, even when tasks are empty.
  if (!parsed.success || parsed.data.data.length !== 1) return { state: 'unavailable' };
  const group = parsed.data.data[0];
  if (!group) return { state: 'unavailable' };
  return {
    state: 'ready',
    data: group.assignments.map((item, index) => {
      const due = item.dueAt ? new Date(item.dueAt) : null;
      const remedialStatus = item.remedialParticipant?.status;
      const status =
        item.purpose !== 'remedial' || !remedialStatus
          ? item.status
          : remedialStatus === 'submitted'
            ? 'submitted'
            : remedialStatus === 'passed'
              ? 'graded'
              : 'pending';
      return {
        id: index + 1,
        uuid: item.id,
        assessmentSessionId: item.type === 'assessment' ? item.id : undefined,
        sourceKind: item.type,
        progress: item.type === 'lms' ? item.progress : undefined,
        attemptStarted: item.attemptStarted,
        purpose: item.purpose,
        sessionStatus: item.sessionStatus,
        dueAt: item.dueAt ?? null,
        remedialParticipant: item.remedialParticipant ?? null,
        mp: item.subject,
        title: item.title,
        type:
          item.purpose === 'remedial'
            ? 'Remedial'
            : item.type === 'assessment'
              ? 'Asesmen'
              : 'Modul LMS',
        deadline: due
          ? new Intl.DateTimeFormat('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Jakarta',
            }).format(due)
          : 'Tanpa tenggat',
        dlDays: due
          ? Math.ceil((due.getTime() - now.getTime()) / 86_400_000)
          : Number.POSITIVE_INFINITY,
        status:
          item.type === 'assessment' &&
          item.purpose !== 'remedial' &&
          item.sessionStatus === 'completed' &&
          item.attemptStarted === false &&
          status === 'pending'
            ? 'closed'
            : status,
        lateSubmissionStatus: item.lateSubmissionStatus ?? null,
        guru: item.guru ?? 'Guru mapel',
        desc:
          item.instructions?.trim() ||
          (item.purpose === 'remedial'
            ? 'Kerjakan remedial sesuai tenggat dan pantau status finalisasi dari guru.'
            : item.type === 'assessment'
              ? 'Kerjakan asesmen sesuai waktu dan kirim jawaban dari sistem.'
              : 'Lanjutkan pembelajaran modul sampai selesai.'),
        score:
          item.type === 'assessment' &&
          item.status === 'graded' &&
          item.lateSubmissionStatus !== 'pending' &&
          item.lateSubmissionStatus !== 'rejected'
            ? item.progress
            : undefined,
        feedback: null,
        submittedFiles: 0,
      };
    }),
  };
}

export function readParentSpp(
  result: ApiFetchResult<unknown> | null,
  childIds: string[],
): DashboardRead<SppApiItem> {
  const failed = failure<SppApiItem>(result);
  if (failed) return failed;
  const parsed = paymentGroups.safeParse(result?.status === 'success' ? result.data : null);
  if (!parsed.success) return { state: 'unavailable' };
  const ids = parsed.data.data.map((group) => group.studentId);
  if (new Set(ids).size !== ids.length) return { state: 'unavailable' };
  // Missing children may mean a relation was revoked after the identity read. Never invent an empty account.
  if (!childIds.length || childIds.some((id) => !ids.includes(id))) return { state: 'denied' };
  return {
    state: 'ready',
    data: normalizeSppGroups(
      parsed.data.data.filter((group) => childIds.includes(group.studentId)),
    ),
  };
}
