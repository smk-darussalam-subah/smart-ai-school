'use client';
import { useEffect, useState } from 'react';
import { fetchClassRoster, type RosterStudent } from '../actions';

/** Invalidates old class/read responses. Failed reads never become an empty successful roster. */
export function useClassRoster(classId: string) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{
    classId: string;
    attempt: number;
    status: 'loading' | 'ready' | 'error';
    data: RosterStudent[];
    error: string;
  }>({ classId, attempt, status: 'loading', data: [], error: '' });
  useEffect(() => {
    let active = true;
    setRead({ classId, attempt, status: 'loading', data: [], error: '' });
    fetchClassRoster(classId)
      .then((result) => {
        if (!active) return;
        setRead(
          result.success
            ? { classId, attempt, status: 'ready', data: result.data, error: '' }
            : { classId, attempt, status: 'error', data: [], error: result.error },
        );
      })
      .catch(() => {
        if (active)
          setRead({
            classId,
            attempt,
            status: 'error',
            data: [],
            error: 'Daftar siswa belum dapat dimuat. Coba lagi.',
          });
      });
    return () => {
      active = false;
    };
  }, [classId, attempt]);
  const current = read.classId === classId && read.attempt === attempt;
  return {
    roster: current ? read.data : [],
    status: current ? read.status : 'loading',
    error: current ? read.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
