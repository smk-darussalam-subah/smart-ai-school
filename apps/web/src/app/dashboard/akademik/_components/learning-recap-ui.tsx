'use client';
import React from 'react';
import { CheckCircle2, Play, Clock3, Loader2 } from 'lucide-react';
import {
  learningDate,
  learningTime,
  learningStatus,
  type LearningSession,
  type LearningScope,
  type LearningStatus,
  type LearningRead,
} from '@/lib/learning-recap';
import type { TodayClass } from './guru-types';
export const surface =
  'rounded-2xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
export const control =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
export const button = `${control} inline-flex items-center justify-center gap-2 font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-slate-800`;
export const primary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2';
export const muted = 'text-sm text-slate-600 dark:text-slate-300';
const statusTone: Record<LearningStatus, string> = {
  COMPLETED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  STARTED: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  MISSED: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  SCHEDULED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  REASSIGNED: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
  CANCELLED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  SUPERSEDED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};
export function LearningStatusBadge({ status }: { status: LearningStatus }) {
  const Icon = status === 'COMPLETED' ? CheckCircle2 : status === 'STARTED' ? Play : Clock3;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone[status]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {learningStatus[status]}
    </span>
  );
}

export interface LearningRecapProps {
  academicYear: string;
  semester: number;
  scope: LearningScope;
  canRead?: boolean;
  canOperate?: boolean;
  refreshToken?: number;
  onGuide?: (session: TodayClass) => void;
  onJournal?: (session: TodayClass) => void;
  onAttendance?: (session: TodayClass) => void;
  onModule?: (session: TodayClass) => void;
  onAssessment?: (session: TodayClass) => void;
}
export function toTeachingGuide(row: LearningSession): TodayClass {
  return {
    classSessionId: row.id,
    serviceDate: row.serviceDate.slice(0,10),
    scheduleId: row.scheduleId,
    assignmentId: row.teachingAssignmentId,
    classId: row.classId,
    className: row.classNameSnapshot,
    subject: row.subjectSnapshot,
    room: row.roomSnapshot,
    jpStart: row.schedule.jpStart,
    jpEnd: row.schedule.jpEnd,
    startLabel: learningTime(row.scheduledStartAt),
    isNow: row.status === 'STARTED',
  };
}

export function Loading() {
  return (
    <p role="status" className={`${surface} flex items-center gap-2 p-5`}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      Memuat data pembelajaran…
    </p>
  );
}
export function ReadProblem({
  read,
  onRetry,
}: {
  read: Exclude<LearningRead<unknown>, { state: 'ready' }>;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className={`${surface} p-4`}>
      <p>{read.message}</p>
      {read.state === 'error' && (
        <button type="button" className={`${button} mt-3`} onClick={onRetry}>
          Coba muat ulang
        </button>
      )}
    </div>
  );
}
export function SessionHeader({
  row,
  subject,
  compact = false,
}: {
  row: LearningSession;
  subject: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : `${surface} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 break-words text-lg font-bold">{subject}</h3>
        <LearningStatusBadge status={row.status} />
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Guru', row.assignedTeacherName],
          ['Kelas', row.classNameSnapshot],
          ['Tanggal', learningDate(row.serviceDate)],
          [
            'Waktu',
            `${learningTime(row.scheduledStartAt)} – ${learningTime(row.scheduledEndAt)} WIB · JP ${row.schedule.jpStart}–${row.schedule.jpEnd}`,
          ],
        ].map(([name, value]) => (
          <div key={name}>
            <dt className={muted}>{name}</dt>
            <dd className="mt-1 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
