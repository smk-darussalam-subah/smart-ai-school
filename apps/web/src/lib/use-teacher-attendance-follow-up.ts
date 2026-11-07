'use client';
import { useEffect, useState } from 'react';
import type { TodayClass } from '@/app/dashboard/akademik/_components/guru-types';
import { fetchSessionAttendanceOverview } from '@/app/dashboard/akademik/session-attendance-actions';
import type { JpOverviewQuery } from './session-attendance';
import {
  teacherAttendanceFollowUp,
  type AttendanceFollowUpClass,
} from './teacher-attendance-follow-up';

export function useTeacherAttendanceFollowUp(
  classes: TodayClass[],
  date: string,
  query: JpOverviewQuery | undefined,
  enabled: boolean,
  refreshToken: number,
) {
  const key = JSON.stringify({
    classes: classes.map(({ classSessionId, scheduleId, classId, subject, jpStart, jpEnd }) => ({
      classSessionId,
      scheduleId,
      classId,
      subject,
      jpStart,
      jpEnd,
    })),
    date,
    academicYear: query?.academicYear,
    semester: query?.semester,
    enabled,
    refreshToken,
  });
  const [result, setResult] = useState<{
    key: string;
    state: 'ready' | 'error' | 'denied';
    pending: number;
    unverified: number;
    pendingSessions: { sessionId: string; scheduleId: string | null }[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    const input = JSON.parse(key) as {
      classes: AttendanceFollowUpClass[];
      date: string;
      academicYear?: string;
      semester?: number;
      enabled: boolean;
    };
    if (!input.enabled || !input.classes.length) return;
    if (!input.academicYear || !input.semester) {
      setResult({
        key,
        state: 'error',
        pending: 0,
        unverified: input.classes.length,
        pendingSessions: [],
      });
      return;
    }
    fetchSessionAttendanceOverview({
      academicYear: input.academicYear,
      semester: input.semester,
      from: input.date,
      to: input.date,
      scope: 'own',
    })
      .then((read) => {
        if (!active) return;
        setResult({
          key,
          state: read.state,
          ...(read.state === 'ready'
            ? teacherAttendanceFollowUp(input.classes, input.date, read.data)
            : { pending: 0, unverified: input.classes.length, pendingSessions: [] }),
        });
      })
      .catch(() => {
        if (active)
          setResult({
            key,
            state: 'error',
            pending: 0,
            unverified: input.classes.length,
            pendingSessions: [],
          });
      });
    return () => {
      active = false;
    };
  }, [key]);
  if (!classes.length)
    return { state: 'ready' as const, pending: 0, unverified: 0, pendingSessions: [] };
  if (!enabled)
    return {
      state: 'denied' as const,
      pending: 0,
      unverified: classes.length,
      pendingSessions: [],
    };
  return result?.key === key
    ? result
    : { state: 'loading' as const, pending: 0, unverified: classes.length, pendingSessions: [] };
}
