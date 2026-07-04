'use client';

// AssessmentTimer — U2 Wave 1: countdown timer untuk siswa saat mengerjakan asesmen.
// Menerima durationMinutes + startedAt (ISO string), menampilkan sisa waktu MM:SS.
// Memanggil onExpire() ketika waktu habis (trigger auto-submit).
// Visual: amber < 5 menit, merah < 1 menit.

import { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  durationMinutes: number;
  startedAt: string; // ISO string
  onExpire: () => void;
}

export default function AssessmentTimer({ durationMinutes, startedAt, onExpire }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, durationMinutes * 60 - elapsed);
  });
  const expiredRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onExpire]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = secondsLeft <= 60;
  const isWarning = secondsLeft <= 300 && !isUrgent;

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold tabular-nums',
        isUrgent
          ? 'bg-rose-50 text-rose-700 animate-pulse'
          : isWarning
            ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700',
      )}
      role="timer"
      aria-label={`Sisa waktu ${minutes} menit ${seconds} detik`}
    >
      <Clock className="h-4 w-4" />
      {display}
    </div>
  );
}
