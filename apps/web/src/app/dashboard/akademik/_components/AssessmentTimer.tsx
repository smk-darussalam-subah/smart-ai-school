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
  deadlineAt?: string;
  serverNow?: string;
  onExpire: () => void;
  onTick?: (remainingSeconds: number) => void;
}

export default function AssessmentTimer({ durationMinutes, startedAt, deadlineAt, serverNow, onExpire, onTick }: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const expiredRef = useRef(false);
  const callback = useRef(onExpire);
  callback.current = onExpire;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  useEffect(() => {
    expiredRef.current = false;
    const cutoff = deadlineAt ? Date.parse(deadlineAt) : Date.parse(startedAt) + durationMinutes * 60_000;
    const origin = serverNow ? Date.parse(serverNow) : Date.now();
    const mountedAt = performance.now();
    function tick() {
      const remaining = Math.max(0, Math.ceil((cutoff - origin - (performance.now() - mountedAt)) / 1000));
      setSecondsLeft(remaining);
      onTickRef.current?.(remaining);
      if (!remaining && !expiredRef.current) {
        expiredRef.current = true;
        callback.current();
      }
    }
    const interval = setInterval(tick, 1000);
    tick();
    return () => clearInterval(interval);
  }, [durationMinutes, startedAt, deadlineAt, serverNow]);

  const minutes = Math.floor((secondsLeft ?? 0) / 60);
  const seconds = (secondsLeft ?? 0) % 60;
  const display = secondsLeft === null ? '—' : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = secondsLeft !== null && secondsLeft <= 60;
  const isWarning = secondsLeft !== null && secondsLeft <= 300 && !isUrgent;

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
