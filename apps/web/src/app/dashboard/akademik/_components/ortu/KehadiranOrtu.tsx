'use client';

import { Calendar, BarChart3, MessageCircle } from 'lucide-react';
import type { OrtuScreen, ModalState } from './OrtuWorkspace';
import type { AttendanceCellStatus } from '@/lib/academic';
import {
  SIM_KEH_STATS, SIM_ATT_TREND, SIM_WA_HISTORY,
  simAttCalendar, currentMonthYear, ATT_STATUS_LABELS,
} from './ortu-data';

interface KehadiranOrtuProps {
  go: (screen: OrtuScreen) => void;
  setModal: (modal: ModalState) => void;
  attendance?: unknown[];
}

/** Ring chart circumference (r=38 → 2πr ≈ 238.76). */
const RING_R = 38;
const RING_CIRC = 2 * Math.PI * RING_R;

/** Status → CSS color variable for calendar cells. */
function statusBg(status: AttendanceCellStatus): string {
  switch (status) {
    case 'hadir': return 'rgba(16,185,129,.25)';
    case 'izin': return 'rgba(14,165,233,.2)';
    case 'sakit': return 'rgba(245,158,11,.2)';
    case 'alpha': return 'rgba(239,68,68,.2)';
    default: return 'var(--empty-cell)';
  }
}
function statusText(status: AttendanceCellStatus): string {
  switch (status) {
    case 'hadir': return 'var(--em)';
    case 'izin': return 'var(--sky)';
    case 'sakit': return 'var(--amber)';
    case 'alpha': return 'var(--rose)';
    default: return 'var(--dim)';
  }
}

/** WA history icon name → lucide component mapping done in JSX. */
function waIcon(status: string): string {
  if (status === 'izin') return 'mail';
  if (status === 'sakit') return 'thermometer';
  return 'alert-triangle';
}
function waColor(status: string): string {
  if (status === 'izin') return 'var(--sky)';
  if (status === 'sakit') return 'var(--amber)';
  return 'var(--rose)';
}
function waBg(status: string): string {
  if (status === 'izin') return 'rgba(14,165,233,.15)';
  if (status === 'sakit') return 'rgba(245,158,11,.15)';
  return 'rgba(239,68,68,.15)';
}

export default function KehadiranOrtu({ setModal }: KehadiranOrtuProps) {
  const today = new Date().getDate();
  const { month, year } = currentMonthYear();
  const calCells = simAttCalendar(today);

  const statBoxes = [
    { label: 'Hadir', value: SIM_KEH_STATS.hadir, color: 'var(--em)' },
    { label: 'Izin', value: SIM_KEH_STATS.izin, color: 'var(--sky)' },
    { label: 'Sakit', value: SIM_KEH_STATS.sakit, color: 'var(--amber)' },
    { label: 'Alpha', value: SIM_KEH_STATS.alpha, color: 'var(--rose)' },
  ];

  return (
    <div className="px-4 pb-4">
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">Kehadiran</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Rekap {month} {year}</p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-500">
          <span>🧪</span> Data Simulasi — Kehadiran belum tersedia dari server
        </div>
      </div>

      {/* 1. Summary ring + 4 stat boxes */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="flex items-center gap-4">
          {/* Ring chart (larger) */}
          <div className="relative inline-block">
            <svg width="90" height="90">
              <circle cx="45" cy="45" r={RING_R} strokeWidth="7" fill="none" stroke="var(--ring-bg)" />
              <circle
                cx="45" cy="45" r={RING_R} strokeWidth="7" fill="none"
                stroke="var(--pril)" strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC - (RING_CIRC * SIM_KEH_STATS.pct / 100)}
                transform="rotate(-90 45 45)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[20px] font-extrabold">{SIM_KEH_STATS.pct}%</div>
                <div className="text-[8px] font-bold uppercase tracking-wide text-[var(--muted)]">Hadir</div>
              </div>
            </div>
          </div>
          {/* 4 stat boxes */}
          <div className="grid flex-1 grid-cols-2 gap-1.5">
            {statBoxes.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-[var(--border)] p-2 text-center"
              >
                <div className="text-[16px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Calendar grid */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Calendar className="h-[15px] w-[15px] text-[var(--pri)]" />
            Kalender Kehadiran
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            {SIM_KEH_STATS.total} hari recorded
          </span>
        </div>
        <div className="mb-2 flex items-center justify-between">
          <b className="text-[13px]">{month} {year}</b>
        </div>
        {/* Calendar grid — Sunday-first, minmax(0,1fr) (§6.5) */}
        <div className="cal-wrap overflow-hidden pb-1">
          <div className="grid w-full gap-[3px]" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
            {/* Headers */}
            {['M', 'S', 'S', 'R', 'K', 'J', 'S'].map((d, i) => (
              <div key={i} className="py-0.5 text-center text-[10px] font-extrabold text-[var(--dim)]">{d}</div>
            ))}
            {/* Cells */}
            {calCells.map((cell, i) => {
              if (cell.day === 0) {
                return <div key={i} className="aspect-square rounded-[5px] border border-[var(--border)] bg-[var(--empty-cell)]" />;
              }
              if (cell.status === 'future') {
                return (
                  <div
                    key={i}
                    className="aspect-square grid place-items-center rounded-[5px] border border-[var(--border)] bg-[var(--empty-cell)] text-[11px] font-extrabold opacity-40"
                  >
                    {cell.day}
                  </div>
                );
              }
              const isToday = cell.day === today;
              const bg = statusBg(cell.status);
              const txt = statusText(cell.status);
              return (
                <div
                  key={i}
                  onClick={() => setModal({ type: 'day', data: { day: cell.day, status: cell.status, month, year } })}
                  className="aspect-square grid cursor-pointer place-items-center rounded-[5px] text-[11px] font-extrabold transition-transform hover:scale-110"
                  style={{
                    background: bg,
                    color: txt,
                    border: `1px solid ${bg}`,
                    outline: isToday ? '2px solid var(--pri)' : undefined,
                    outlineOffset: isToday ? '-3px' : undefined,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${cell.day} ${month} — ${ATT_STATUS_LABELS[cell.status] ?? cell.status}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ type: 'day', data: { day: cell.day, status: cell.status, month, year } }); } }}
                >
                  {cell.day}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div className="mt-2.5 flex flex-wrap justify-center gap-2.5">
            {[
              { label: 'Hadir', bg: 'rgba(16,185,129,.25)' },
              { label: 'Izin', bg: 'rgba(14,165,233,.2)' },
              { label: 'Sakit', bg: 'rgba(245,158,11,.2)' },
              { label: 'Alpha', bg: 'rgba(239,68,68,.2)' },
            ].map((l) => (
              <span key={l.label} className="flex items-center gap-1 text-[9px] font-semibold text-[var(--muted)]">
                <i className="inline-block h-2.5 w-2.5 rounded" style={{ background: l.bg }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 3. 3-month trend */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <BarChart3 className="h-[15px] w-[15px] text-[var(--pri)]" />
          Tren 3 Bulan
        </div>
        {SIM_ATT_TREND.map((t) => (
          <div key={t.month} className="mb-2 flex items-center gap-2.5 last:mb-0">
            <span className="w-8 text-[11px] font-bold text-[var(--muted)]">{t.month}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded bg-[var(--bar-bg)]">
              <div
                className="h-full rounded"
                style={{
                  width: `${t.pct}%`,
                  background: t.pct >= 93 ? 'var(--em)' : 'var(--amber)',
                }}
              />
            </div>
            <span className="w-[42px] text-right text-[12px] font-extrabold">{t.pct}%</span>
          </div>
        ))}
      </div>

      {/* 4. WA History */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <MessageCircle className="h-[15px] w-[15px] text-[var(--pri)]" />
          Riwayat Notifikasi WA
        </div>
        {SIM_WA_HISTORY.length === 0 ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            Tidak ada notifikasi absence
          </div>
        ) : (
          SIM_WA_HISTORY.map((w, i) => {
            const ic = waIcon(w.status);
            const icC = waColor(w.status);
            const bgC = waBg(w.status);
            return (
              <div key={i} className="mb-1.5 flex items-center gap-2.5 rounded-[var(--r-sm)] border border-[var(--border)] p-2.5 last:mb-0">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: bgC }}
                >
                  {ic === 'mail' && <span style={{ color: icC }}>✉</span>}
                  {ic === 'thermometer' && <span style={{ color: icC }}>🌡</span>}
                  {ic === 'alert-triangle' && <span style={{ color: icC }}>⚠</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block text-[12px]">{w.date} · {w.session}</b>
                  <small className="text-[9.5px] font-semibold text-[var(--muted)]">
                    Dikirim {w.time} ke {w.sentTo} — {w.note}
                  </small>
                </div>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold"
                  style={{ background: bgC, color: icC }}
                >
                  {w.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
