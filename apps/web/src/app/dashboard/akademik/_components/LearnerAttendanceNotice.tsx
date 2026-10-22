'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Info, RefreshCw } from 'lucide-react';
import { attendanceMessage, type LearnerAttendanceState } from '@/lib/learner-attendance';

export default function LearnerAttendanceNotice({
  state,
  empty = false,
}: {
  state: LearnerAttendanceState;
  empty?: boolean;
}) {
  if (state === 'ready' && !empty) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] p-3 text-xs leading-5 text-[var(--text)]"
    >
      <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{attendanceMessage(state)}</span>
      {state === 'unavailable' && <Retry />}
    </div>
  );
}

function Retry() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-bold focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <RefreshCw aria-hidden="true" className="h-4 w-4" />
      Muat ulang
    </button>
  );
}
