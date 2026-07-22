'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { generateCalendar } from '@/lib/academic';
import type { AttendanceCellStatus, CalendarCell } from '@/lib/academic';
import { fetchStudentAttendanceMonth } from '../../actions';
import type { SiswaScreen, ModalState } from './SiswaWorkspace';
import type { SiswaKehadiranStats } from './siswa-types';

export interface AttendanceEntry {
  date: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
}

export interface SchoolCalendarEvent {
  name?: string | null;
  start?: string | null;
  end?: string | null;
  type?: string | null;
  description?: string | null;
}

interface Props {
  showToast: (msg: string) => void;
  go: (screen: SiswaScreen) => void;
  setModal: (modal: ModalState) => void;
  stats: SiswaKehadiranStats;
  attendance: AttendanceEntry[];
  calendarEvents?: SchoolCalendarEvent[];
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ATTENDANCE_STATUSES = new Set(['hadir', 'izin', 'sakit', 'alpha']);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isHolidayCalendarEvent(event: SchoolCalendarEvent): boolean {
  const type = event.type?.toLowerCase();
  const text = `${event.name ?? ''} ${event.description ?? ''}`.toLowerCase();
  return type === 'holiday' || type === 'break' || text.includes('libur') || text.includes('holiday') || text.includes('cuti');
}

function toDateKey(value: string | null | undefined): string | null {
  const key = value?.slice(0, 10);
  return key && DATE_KEY_RE.test(key) ? key : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAttendanceEntries(rows: unknown[] | undefined): AttendanceEntry[] {
  return (rows ?? []).flatMap((row) => {
    if (!isRecord(row)) return [];
    const date = toDateKey(readString(row.date));
    const status = readString(row.status);
    if (!date || !status || !ATTENDANCE_STATUSES.has(status)) return [];
    return [{ date, status: status as AttendanceEntry['status'] }];
  });
}

export default function KehadiranSiswa({ showToast: _showToast, go: _go, setModal, stats: _stats, attendance, calendarEvents = [] }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [monthAttendance, setMonthAttendance] = useState<AttendanceEntry[]>(() => normalizeAttendanceEntries(attendance));
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');

  useEffect(() => {
    setMonthAttendance(normalizeAttendanceEntries(attendance));
  }, [attendance]);

  useEffect(() => {
    let cancelled = false;
    setAttendanceLoading(true);
    setAttendanceError('');
    fetchStudentAttendanceMonth(viewYear, viewMonth)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setMonthAttendance(normalizeAttendanceEntries(result.data));
        } else {
          setMonthAttendance([]);
          setAttendanceError(result.error ?? 'Presensi bulan ini gagal dimuat.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMonthAttendance([]);
        setAttendanceError('Presensi bulan ini gagal dimuat.');
      })
      .finally(() => {
        if (!cancelled) setAttendanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth]);

  // Generate calendar grid — pass todayDay only for current month so future days are marked
  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const holidayRanges = useMemo(
    () => calendarEvents
      .filter((event) => event.start && isHolidayCalendarEvent(event))
      .map((event) => ({ start: event.start!, end: event.end ?? event.start!, name: event.name ?? 'Libur' })),
    [calendarEvents],
  );
  const statusByDate = useMemo(
    () => monthAttendance.reduce((acc: Record<string, AttendanceCellStatus>, a: AttendanceEntry) => {
      acc[a.date] = a.status;
      return acc;
    }, {} as Record<string, AttendanceCellStatus>),
    [monthAttendance],
  );
  const calendar = generateCalendar(viewYear, viewMonth, {
    todayDay: isCurrentMonth ? now.getDate() : undefined,
    statusByDate,
    holidays: holidayRanges,
  });

  // Stats
  const hadirCount = monthAttendance.filter((a) => a.status === 'hadir').length;
  const sakitCount = monthAttendance.filter((a) => a.status === 'sakit').length;
  const izinCount = monthAttendance.filter((a) => a.status === 'izin').length;
  const alphaCount = monthAttendance.filter((a) => a.status === 'alpha').length;
  const totalDays = monthAttendance.length;
  const persentase = totalDays > 0 ? Math.round((hadirCount / totalDays) * 1000) / 10 : 0;
  const isSimData = totalDays === 0;

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  return (
    <div>
      {/* Header Stats */}
      <div className="px-5 py-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Kehadiran</h1>

        {/* Empty-state badge — shown when no server data */}
        {isSimData && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] font-bold text-sky-600">
            <span>📋</span> Data kehadiran belum tersedia dari server
          </div>
        )}
        {attendanceLoading && (
          <div className="mt-2 rounded-lg border border-slate-500/20 bg-slate-500/10 px-3 py-2 text-[11px] font-bold text-[var(--muted)]">
            Memuat presensi {BULAN[viewMonth]} {viewYear}...
          </div>
        )}
        {attendanceError && (
          <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-500">
            {attendanceError}
          </div>
        )}

        {/* Ring + Statpills */}
        <div className="mt-4 flex items-center gap-4">
          {/* SVG Ring (100px) */}
          <div className="relative h-[100px] w-[100px] flex-shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bar-bg)" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#10b981"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - persentase / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold text-emerald-500">{persentase}%</span>
              <span className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-wider">Kehadiran</span>
            </div>
          </div>

          {/* 4 Statpills */}
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="text-lg font-extrabold text-emerald-500">{hadirCount}</div>
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Hadir</div>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2">
              <div className="text-lg font-extrabold text-blue-500">{izinCount}</div>
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Izin</div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <div className="text-lg font-extrabold text-amber-500">{sakitCount}</div>
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Sakit</div>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <div className="text-lg font-extrabold text-rose-500">{alphaCount}</div>
              <div className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Alpha</div>
            </div>
          </div>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="sticky top-[57px] z-10 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex items-center justify-between">
          <button onClick={prevMonth} className="rounded-lg p-2 hover:bg-[var(--surface2)] transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-base font-bold">
            {BULAN[viewMonth]} {viewYear}
          </div>
          <button onClick={nextMonth} className="rounded-lg p-2 hover:bg-[var(--surface2)] transition-colors">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="px-5 py-4">
        {/* Day headers */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {HARI.map((hari, index) => (
            <div key={hari} className={`py-2 text-center text-[10px] font-bold uppercase tracking-wider ${index === 0 ? 'text-rose-400' : 'text-[var(--muted)]'}`}>
              {hari}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendar.map((cell: CalendarCell, idx: number) => {
            const isToday = isCurrentMonth && cell.inMonth !== false && cell.day === now.getDate();
            const isEmpty = cell.status === 'empty';
            const isFuture = cell.status === 'future';
            const isOutside = cell.status === 'outside';
            const isHoliday = cell.status === 'holiday';
            const status = cell.status;

            let statusColor = 'bg-[var(--surface)]';
            let statusBorder = 'border-[var(--border)]';
            let statusText = '';
            let dayText = 'text-[var(--text)]';

            if (status === 'hadir') {
              statusColor = 'bg-emerald-500/15';
              statusBorder = 'border-emerald-500/40';
              statusText = '✓';
            } else if (status === 'sakit') {
              statusColor = 'bg-amber-500/15';
              statusBorder = 'border-amber-500/40';
              statusText = 'S';
            } else if (status === 'izin') {
              statusColor = 'bg-blue-500/15';
              statusBorder = 'border-blue-500/40';
              statusText = 'I';
            } else if (status === 'alpha') {
              statusColor = 'bg-rose-500/15';
              statusBorder = 'border-rose-500/40';
              statusText = 'A';
            } else if (isHoliday) {
              statusColor = 'bg-rose-500/10';
              statusBorder = 'border-rose-500/30';
              statusText = cell.holidayName === 'Minggu' ? 'Min' : 'Libur';
              dayText = 'text-rose-400';
            } else if (isOutside) {
              statusColor = 'bg-slate-500/[0.05]';
              statusBorder = 'border-slate-500/10';
              dayText = 'text-[var(--muted)] opacity-45';
            } else if (isFuture) {
              statusColor = 'bg-[var(--surface)] opacity-40';
            } else if (isEmpty) {
              statusColor = 'bg-transparent';
            }
            const interactive = status === 'hadir' || status === 'sakit' || status === 'izin' || status === 'alpha';
            const disabled = !interactive;

            return (
              <button
                key={idx}
                disabled={disabled}
                onClick={() => {
                  if (interactive) {
                    setModal({ type: 'day', data: { day: cell.day, status: cell.status } });
                  }
                }}
                title={isHoliday ? cell.holidayName ?? 'Libur' : undefined}
                className={`relative aspect-square rounded-lg border text-center transition-all ${
                  isEmpty ? 'pointer-events-none border-transparent' : interactive ? `${statusColor} ${statusBorder} hover:-translate-y-0.5 cursor-pointer` : `${statusColor} ${statusBorder} cursor-default`
                } ${isToday ? 'ring-2 ring-emerald-500' : ''}`}
              >
                <div className="absolute inset-0 grid place-items-center">
                  <div>
                    <div className={`text-sm font-bold ${isEmpty ? 'text-transparent' : isFuture ? 'text-[var(--muted)]' : dayText}`}>
                      {cell.day}
                    </div>
                    {status && !isFuture && !isEmpty && !isOutside && (
                      <div className={`text-[8px] font-extrabold ${
                        status === 'hadir' ? 'text-emerald-500' :
                        status === 'sakit' ? 'text-amber-500' :
                        status === 'izin' ? 'text-blue-500' :
                        'text-rose-500'
                      }`}>
                        {statusText}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mx-5 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="text-[11px] font-bold text-[var(--muted)] uppercase tracking-wider mb-3">Keterangan</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-emerald-500/15 border border-emerald-500/40 grid place-items-center">
              <span className="text-[8px] font-extrabold text-emerald-500">✓</span>
            </div>
            <span className="text-xs font-semibold">Hadir ({hadirCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-amber-500/15 border border-amber-500/40 grid place-items-center">
              <span className="text-[8px] font-extrabold text-amber-500">S</span>
            </div>
            <span className="text-xs font-semibold">Sakit ({sakitCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-blue-500/15 border border-blue-500/40 grid place-items-center">
              <span className="text-[8px] font-extrabold text-blue-500">I</span>
            </div>
            <span className="text-xs font-semibold">Izin ({izinCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-rose-500/15 border border-rose-500/40 grid place-items-center">
              <span className="text-[8px] font-extrabold text-rose-500">A</span>
            </div>
            <span className="text-xs font-semibold">Alpha ({alphaCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-rose-500/30 bg-rose-500/10 grid place-items-center">
              <span className="text-[7px] font-extrabold text-rose-400">L</span>
            </div>
            <span className="text-xs font-semibold">Minggu/libur</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded border border-slate-500/10 bg-slate-500/[0.05]" />
            <span className="text-xs font-semibold">Luar bulan</span>
          </div>
        </div>
      </div>

      {/* Warning if low attendance */}
      {persentase < 75 && (
        <div className="mx-5 mb-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs text-[var(--muted)]">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-rose-500" />
            <div>
              <div className="font-bold text-rose-500">Perhatian: Kehadiran Rendah</div>
              <div className="mt-1">Persentase kehadiran Anda di bawah 75%. Harap tingkatkan kehadiran untuk memenuhi syarat ujian.</div>
            </div>
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="mx-5 mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        <div className="flex items-start gap-2">
          <CalendarIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[var(--text)]">Kehadiran Per Session</div>
            <div className="mt-1">Absensi dihitung per jam pelajaran (JP). Klik tanggal untuk melihat detail kehadiran hari tersebut.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
