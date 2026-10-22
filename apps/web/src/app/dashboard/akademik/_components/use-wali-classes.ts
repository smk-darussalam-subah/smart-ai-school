'use client';
import { useEffect, useState } from 'react';
import { fetchWaliClasses, type WaliClassItem } from '../actions';

export function useWaliClasses(enabled: boolean, context: string) {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'error';
    data: WaliClassItem[];
    error: string;
  }>({ key: '', status: 'loading', data: [], error: '' });
  const key = `${context}|${attempt}|${enabled}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchWaliClasses()
      .then((result) => {
        if (!active) return;
        setRead(
          result.success && result.data
            ? { key, status: 'ready', data: result.data.classes, error: '' }
            : {
                key,
                status: 'error',
                data: [],
                error: result.error || 'Informasi wali kelas belum dapat dimuat.',
              },
        );
      })
      .catch(() => {
        if (active)
          setRead({
            key,
            status: 'error',
            data: [],
            error: 'Informasi wali kelas belum dapat dimuat. Coba lagi.',
          });
      });
    return () => {
      active = false;
    };
  }, [enabled, key]);
  return {
    classes: enabled && read.key === key ? read.data : [],
    status: !enabled ? 'ready' : read.key === key ? read.status : 'loading',
    error: read.key === key ? read.error : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
