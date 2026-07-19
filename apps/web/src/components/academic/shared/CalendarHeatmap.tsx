'use client';

// CalendarHeatmap — kalender kehadiran bulanan (W0b). BUKAN duplikat MonthCalendar
// (yang menangani agenda/event akademik); ini khusus heatmap status kehadiran dari
// generateCalendar() (W0a) memakai data NYATA /attendance. Dipakai bersama Kehadiran
// siswa & ortu. Tema-agnostik: warna status semantik, chrome diwarisi parent.
//
// Kepatuhan layout (spec §7.4): grid-template-columns repeat(7, minmax(0,1fr)) untuk
// cegah overflow; sorot hari ini pakai OUTLINE (bukan box-shadow) — outline-offset
// negatif menggambar di DALAM sel → nol overflow.

import { cn } from '@/lib/utils';
import type { CalendarCell } from '@/lib/academic';
import { ATTENDANCE_CELL_CLASS, ATTENDANCE_LABELS, REAL_ATTENDANCE_STATUSES } from './attendance-status';

// Header Sunday-first: Minggu→Sabtu.
const DOW_HEADERS = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

interface CalendarHeatmapProps {
  /** Sel dari generateCalendar(). */
  cells: CalendarCell[];
  /** Tanggal hari ini untuk disorot (outline). */
  todayDay?: number;
  /** Warna outline hari ini. Default emerald (siswa); ortu set ke biru. */
  accent?: string;
  /** Klik sel berstatus nyata (hadir/izin/sakit/alpha). */
  onDayClick?: (cell: CalendarCell) => void;
  showLegend?: boolean;
  className?: string;
}

export function CalendarHeatmap({
  cells,
  todayDay,
  accent = '#10b981',
  onDayClick,
  showLegend = true,
  className,
}: CalendarHeatmapProps) {
  const clickable = !!onDayClick;

  return (
    <div className={className}>
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {DOW_HEADERS.map((d, i) => (
          <div key={`h${i}`} className="pb-1 text-center text-[10px] font-semibold text-zinc-400">
            {d}
          </div>
        ))}

        {cells.map((cell, i) => {
          if (cell.status === 'empty') {
            return <div key={i} className="aspect-square rounded-[5px] bg-transparent" aria-hidden />;
          }
          const isToday = todayDay != null && cell.inMonth !== false && cell.day === todayDay;
          const interactive = clickable && REAL_ATTENDANCE_STATUSES.includes(cell.status);
          const label = `${cell.day} — ${ATTENDANCE_LABELS[cell.status]}`;
          return (
            <button
              key={i}
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => onDayClick?.(cell) : undefined}
              title={label}
              aria-label={label}
              className={cn(
                'grid aspect-square place-items-center rounded-[5px] text-[11px] font-semibold transition',
                ATTENDANCE_CELL_CLASS[cell.status],
                interactive ? 'cursor-pointer hover:brightness-110' : 'cursor-default',
              )}
              style={isToday ? { outline: `2px solid ${accent}`, outlineOffset: '-3px' } : undefined}
            >
              {cell.day}
            </button>
          );
        })}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {REAL_ATTENDANCE_STATUSES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400">
              <i className={cn('inline-block h-2.5 w-2.5 rounded-sm', ATTENDANCE_CELL_CLASS[s])} />
              {ATTENDANCE_LABELS[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
