'use client';

import { useState, useMemo } from 'react';
import { CalendarClock, MapPin, Bell } from 'lucide-react';
import { wibNow, currentJp } from '@/lib/bell-times';
import { JP_LABELS, JP_MAP, resolveSchedule } from './siswa-data';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaKalenderEvent } from './siswa-types';

interface Props {
  schedule: unknown[];
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  kalender: SiswaKalenderEvent[];
}

const HARI: [string, number][] = [['Senin', 1], ['Selasa', 2], ['Rabu', 3], ['Kamis', 4], ['Jumat', 5], ['Sabtu', 6]];

export default function JadwalSiswa({ schedule, showToast: _showToast, go: _go, setModal, kalender }: Props) {
  const now = wibNow();
  const todayDow = now.jsDay; // 0=Sunday → no schedule → shows "Libur"
  const currentJpIdx = currentJp(now.minutes);

  const [selectedDay, setSelectedDay] = useState(todayDow);
  const { schedule: schedData, isSim: isSimSchedule } = resolveSchedule(schedule);
  const daySched = schedData[selectedDay] || {};
  const hasSched = Object.keys(daySched).length > 0;

  const totalSched = useMemo(() => {
    let count = 0;
    for (const day of Object.values(schedData)) {
      count += Object.keys(day).length;
    }
    return count;
  }, [schedData]);

  const totalHours = Math.round((totalSched * 40) / 6) / 10;

  return (
    <div>
      {/* Top Summary */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">Jadwal Pelajaran</h1>
          <span className="rounded-full bg-emerald-500/12 px-3 py-1.5 text-[11px] font-extrabold text-emerald-500">
            {totalSched} JP · {totalHours} jam/minggu
          </span>
        </div>
        {isSimSchedule && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-600">
            <span>📋</span> Jadwal belum tersedia dari server
          </div>
        )}
        <div className="mt-2 flex items-center gap-2 text-sm text-[var(--muted)]">
          <CalendarClock className="h-4 w-4" />
          <span>XI TJKT 1 · SMK Darussalam Subah</span>
        </div>
      </div>

      {/* Day Selector */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {HARI.map(([label, dow]) => {
            const isActive = dow === selectedDay;
            const isToday = dow === todayDow;
            const schedCount = Object.keys(schedData[dow] || {}).length;

            return (
              <button
                key={dow}
                onClick={() => setSelectedDay(dow)}
                className={`relative flex-shrink-0 rounded-xl px-4 py-2.5 text-center transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-white shadow-[0_2px_12px_-2px_rgba(16,185,129,.4)]'
                    : isToday
                    ? 'border-2 border-emerald-500/30 bg-[var(--surface)]'
                    : 'border border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <div className="text-[11px] font-bold">{label}</div>
                <div className="mt-0.5 text-[10px] font-semibold opacity-75">{schedCount} JP</div>
                {isToday && !isActive && (
                  <div className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)] bg-emerald-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="px-5 py-4 space-y-2">
        {hasSched ? (
          JP_MAP.map(([, idx]) => {
            const slot = daySched[idx];
            if (!slot) {
              const jpLabel = JP_LABELS[idx]![0];
              const isBreak = jpLabel === 'Istirahat' || jpLabel === 'Ishoma';
              return (
                <div
                  key={idx}
                  className={`rounded-xl border border-dashed p-4 text-center ${
                    isBreak ? 'border-amber-500/30 bg-amber-500/5 text-amber-500' : 'border-[var(--border)] text-[var(--muted)]'
                  }`}
                >
                  <div className="text-sm font-bold">{jpLabel}</div>
                  <div className="mt-0.5 text-xs opacity-75">{JP_LABELS[idx]![1]}</div>
                </div>
              );
            }

            const isDone = idx < (currentJpIdx === 0 ? -1 : JP_MAP.findIndex(([j]) => j === currentJpIdx));
            const isNow = currentJpIdx > 0 && JP_MAP[currentJpIdx - 1]?.[1] === idx;
            const guruShort = slot.g.split(',')[0] ?? slot.g;

            return (
              <div
                key={idx}
                className={`rounded-xl border p-4 transition-all ${
                  isNow
                    ? 'border-amber-500/40 bg-amber-500/6 shadow-[0_0_24px_-8px_rgba(245,158,11,.25)] cursor-pointer'
                    : isDone
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
                onClick={isNow ? () => setModal({ type: 'lesson', data: { subject: slot.mp, teacher: guruShort, room: slot.ruang, jpIndex: idx } }) : undefined}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-extrabold">{JP_LABELS[idx]![1].split('–')[0]}</div>
                    <div className="text-xs font-semibold text-[var(--muted)]">{JP_LABELS[idx]![0]}</div>
                  </div>
                  <div
                    className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2 border-[var(--bg)] ${
                      isDone ? 'bg-emerald-500 shadow-[0_0_0_2px_var(--em)]' : isNow ? 'bg-amber-500 animate-pulse shadow-[0_0_0_2px_var(--am)]' : 'bg-transparent border-2 border-[var(--dim)]'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-bold">{slot.mp}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[var(--muted)]">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {slot.ruang}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--muted)]">·</span>
                      <span className="text-xs font-semibold text-[var(--muted)]">{guruShort}</span>
                    </div>
                    {isNow && (
                      <div className="mt-2">
                        <span className="rounded bg-amber-500/15 px-2 py-1 text-[10px] font-extrabold text-amber-500">
                          ▶ Sedang berlangsung — klik untuk mulai sesi
                        </span>
                      </div>
                    )}
                    {isDone && (
                      <div className="mt-2">
                        <span className="rounded bg-emerald-500/12 px-2 py-1 text-[10px] font-extrabold text-emerald-500">
                          ✓ Selesai
                        </span>
                      </div>
                    )}
                    {!isNow && !isDone && (
                      <div className="mt-2">
                        <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-extrabold text-[var(--muted)]">
                          Akan datang
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-[var(--dim)]">
            <div className="mx-auto mb-3 h-12 w-12 opacity-50">📅</div>
            <div className="text-lg">Libur — tidak ada jadwal hari ini</div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="mx-5 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        <div className="flex items-start gap-2">
          <Bell className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[var(--text)]">Notifikasi Otomatis</div>
            <div className="mt-1">Sistem akan mengingatkan 5 menit sebelum pelajaran dimulai dan saat sesi aktif.</div>
          </div>
        </div>
      </div>

      {/* Kalender Akademik */}
      <div className="mx-5 mb-4">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--muted)]">
            <CalendarClock className="h-3.5 w-3.5 text-emerald-500" />Kalender Akademik
          </div>
          <div className="space-y-2">
            {kalender.length > 0 ? kalender.map((evt, idx: number) => (
              <div key={idx} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex-shrink-0 w-11 text-center">
                  <div className="text-lg font-extrabold leading-none" style={{ color: evt.color }}>{evt.d}</div>
                  <div className="text-[9px] font-bold uppercase text-[var(--muted)]">{evt.m}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold">{evt.title}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[var(--muted)]">{evt.desc}</div>
                </div>
                <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: evt.color }} />
              </div>
            )) : (
              <div className="py-4 text-center text-[var(--dim)] text-sm">Tidak ada event mendatang</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
