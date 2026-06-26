'use client';

import {
  CalendarCheck, CalendarClock, Wallet, TrendingUp, Megaphone,
  MessageCircle, ChevronRight, TrendingDown,
} from 'lucide-react';
import { KKTP_DEFAULT, fmtRupiahExact, daysUntil, fmtDateShort } from '@/lib/academic';
import { scheduleDayOfWeek, wibNow } from '@/lib/bell-times';
import type { AttendanceItem } from '@/lib/api';
import type { OrtuScreen, ModalState } from './OrtuWorkspace';
import type { OrtuChild, OrtuNilai } from './ortu-types';
import type { ScheduleItem } from '../guru-types';
import {
  mpColor, gradeCls, avgNa, initials, jpTimeRange,
} from './ortu-data';
import {
  mapSppToPembayaran, mapWaLog, mapTodaySchedule, computeAttStats,
  type SppApiItem, type WaLogApiItem,
} from './ortu-mappers';

interface BerandaOrtuProps {
  showToast: (msg: string) => void;
  go: (screen: OrtuScreen) => void;
  setModal: (modal: ModalState) => void;
  grades?: unknown[];
  announcements?: { id: string; title: string; createdAt: string }[];
  // T1-02 (audit v2): data real menggantikan SIM_*
  children: OrtuChild[];
  activeChildIndex: number;
  schedule: ScheduleItem[];
  spp: SppApiItem[];
  waLog: WaLogApiItem[];
  attendance: AttendanceItem[];
}

/** WIB-based greeting prefix. */
function greetPrefix(): string {
  const { minutes } = wibNow();
  const h = Math.floor(minutes / 60);
  if (h >= 5 && h < 11) return 'Selamat pagi';
  if (h >= 11 && h < 15) return 'Selamat siang';
  if (h >= 15 && h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** Ring chart circumference constant (r=28 → 2πr ≈ 175.93). */
const RING_R = 28;
const RING_CIRC = 2 * Math.PI * RING_R;

const EMPTY_CHILD: OrtuChild = { id: 0, name: 'Anak', kelas: '—', active: false, avg: 0, att: 0, wali: '—' };

export default function BerandaOrtu({ showToast: _showToast, go, setModal, grades, announcements, children, activeChildIndex, schedule, spp, waLog, attendance }: BerandaOrtuProps) {
  // T1-02: sumber data 100% real. Tidak ada lagi fallback ke SIM_*.
  const child = children[activeChildIndex] ?? EMPTY_CHILD;
  const nilai: OrtuNilai[] = grades?.length ? (grades as OrtuNilai[]) : [];
  const avg = avgNa(nilai);
  const stats = computeAttStats(attendance);           // ganti SIM_KEH_STATS
  const dow = scheduleDayOfWeek();
  const todaySched = mapTodaySchedule(schedule, dow);   // ganti SIM_SCHEDULE
  const isLibur = dow === 0 || todaySched.length === 0;

  // Pembayaran real
  const pembayaran = mapSppToPembayaran(spp);
  const unpaidItems = pembayaran.filter((p) => p.status === 'unpaid');
  const totalUnpaid = unpaidItems.reduce((s, p) => s + p.amount, 0);
  const nextDue = unpaidItems.length > 0
    ? [...unpaidItems].sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime())[0]
    : null;
  const dd = nextDue ? daysUntil(nextDue.due) : 0;

  // WA notifikasi real
  const recentWa = mapWaLog(waLog)[0] ?? null;

  // Pengumuman real (API {id,title,createdAt} → display {id,title,tag,date})
  const pengumuman = (announcements ?? []).map((a) => ({
    id: a.id, title: a.title, tag: 'Info',
    date: a.createdAt ? fmtDateShort(a.createdAt) : '—',
  }));

  // Ranking tidak tersedia (leaderboard ortu belum di-fetch). null = sembunyikan.
  const rank: number | null = null;

  return (
    <div className="px-4 pb-4">
      {/* 1. Greeting */}
      <div className="mb-3.5">
        <h1 className="text-xl font-extrabold">{greetPrefix()}, Ayah!</h1>
        <p className="mt-0.5 text-[12px] font-medium text-[var(--muted)]">Pantau perkembangan putra Anda</p>
      </div>

      {/* 2. Student card */}
      <div
        className="relative mb-3.5 overflow-hidden rounded-[var(--r-lg)] p-4.5 text-white"
        style={{ background: 'var(--grad)', padding: '18px' }}
      >
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-[18px] font-extrabold">
            {initials(child.name)}
          </div>
          <div>
            <b className="block text-[17px]">{child.name}</b>
            <small className="text-[12px] font-medium opacity-85">{child.kelas} · SMK Darussalam Subah</small>
          </div>
        </div>
        <div className="relative z-10 mt-3.5 flex gap-3">
          <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold">{avg || '—'}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide opacity-75">Rata²</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold">{stats.total > 0 ? `${stats.pct}%` : '—'}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide opacity-75">Hadir</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-[18px] font-extrabold">{rank != null ? `#${rank}` : '—'}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide opacity-75">Ranking</div>
          </div>
        </div>
      </div>

      {/* 3. Attendance snapshot */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <CalendarCheck className="h-[15px] w-[15px] text-[var(--pri)]" />
            Kehadiran
            {stats.total === 0 && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] text-sky-500">Belum ada data</span>}
          </div>
          <button
            onClick={() => go('kehadiran')}
            className="flex cursor-pointer items-center gap-0.5 text-[11px] font-bold text-[var(--pril)]"
          >
            Detail <ChevronRight className="h-[13px] w-[13px]" />
          </button>
        </div>
        <div className="flex items-center gap-3.5">
          {/* Ring chart */}
          <div className="relative inline-block">
            <svg width="70" height="70">
              <circle cx="35" cy="35" r={RING_R} strokeWidth="6" fill="none" stroke="var(--ring-bg)" />
              <circle
                cx="35" cy="35" r={RING_R} strokeWidth="6" fill="none"
                stroke="var(--pril)" strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={RING_CIRC - (RING_CIRC * (stats.total > 0 ? stats.pct : 0) / 100)}
                transform="rotate(-90 35 35)"
                style={{ transition: 'stroke-dashoffset 0.5s ease' }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div className="text-[14px] font-extrabold">{stats.total > 0 ? `${stats.pct}%` : '—'}</div>
            </div>
          </div>
          <div className="flex-1">
            <b
              className="text-[13px]"
              style={{ color: isLibur ? 'var(--muted)' : 'var(--em)' }}
            >
              {isLibur ? 'Libur' : stats.total > 0 ? 'Tercatat' : 'Belum ada data'}
            </b>
            <p className="mt-0.5 text-[10.5px] text-[var(--muted)]">
              Bulan ini: {stats.hadir} hadir · {stats.izin} izin · {stats.sakit} sakit · {stats.alpha} alpha
            </p>
          </div>
        </div>
      </div>

      {/* 4. WA notification (latest absence) */}
      {recentWa && (
        <div
          className="mb-3.5 rounded-[var(--r)] border p-3.5"
          style={{ borderColor: 'rgba(245,158,11,.2)', background: 'rgba(245,158,11,.04)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: 'rgba(245,158,11,.15)' }}
            >
              <MessageCircle className="h-[18px] w-[18px] text-[var(--amber)]" />
            </div>
            <div className="min-w-0 flex-1">
              <b className="text-[12px]">Notifikasi WA Terakhir</b>
              <small className="block text-[10px] text-[var(--muted)]">
                {recentWa.date} · {recentWa.session} — {recentWa.status.toUpperCase()}
              </small>
            </div>
            <span
              className="rounded-md bg-[rgba(245,158,11,.15)] px-2 py-1 text-[9px] font-extrabold text-[var(--amber)]"
            >
              {recentWa.status}
            </span>
          </div>
        </div>
      )}

      {/* 5. Today's schedule */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <CalendarClock className="h-[15px] w-[15px] text-[var(--pri)]" />
            Jadwal Hari Ini
          </div>
          <span className="text-[10px] font-semibold text-[var(--muted)]">
            {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dow]}
          </span>
        </div>
        {isLibur ? (
          <div className="py-6 text-center text-[12px] font-semibold text-[var(--dim)]">
            Libur — tidak ada jadwal
          </div>
        ) : (
          todaySched.map((slot, i) => {
            const c = mpColor(slot.mapel);
            return (
              <div key={i} className="flex gap-2.5 border-b border-[var(--border)] py-2 last:border-0">
                <div className="min-w-[80px] pt-0.5 text-right text-[10px] font-bold text-[var(--muted)]">
                  {jpTimeRange(slot.jp)}
                </div>
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold">{slot.mapel}</div>
                  <div className="text-[10.5px] font-medium text-[var(--muted)]">
                    {slot.guru.split(',')[0]} · {slot.room}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Payment summary */}
      {unpaidItems.length > 0 && nextDue && (
        <div
          className="mb-3.5 rounded-[var(--r)] border p-3.5"
          style={{ borderColor: 'rgba(245,158,11,.2)' }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
              <Wallet className="h-[15px] w-[15px] text-[var(--pri)]" />
              Ringkasan Pembayaran
            </div>
            <button
              onClick={() => go('pembayaran')}
              className="flex cursor-pointer items-center gap-0.5 text-[11px] font-bold text-[var(--pril)]"
            >
              Detail <ChevronRight className="h-[13px] w-[13px]" />
            </button>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="flex-1">
              <div className="text-[22px] font-extrabold text-[var(--amber)]">
                {fmtRupiahExact(totalUnpaid)}
              </div>
              <small className="text-[11px] font-semibold text-[var(--muted)]">
                {unpaidItems.length} item belum dibayar
              </small>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-bold text-[var(--text)]">{nextDue.jenis}</div>
              <small
                className="text-[10px] font-bold"
                style={{ color: dd < 0 ? 'var(--rose)' : 'var(--amber)' }}
              >
                {dd < 0 ? `Terlewat ${Math.abs(dd)} hari` : `Jatuh tempo ${dd} hari`}
              </small>
            </div>
          </div>
        </div>
      )}

      {/* 7. Recent grades */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <TrendingUp className="h-[15px] w-[15px] text-[var(--pri)]" />
            Nilai Terbaru
            {nilai.length === 0 && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] text-sky-500">Belum ada data</span>}
          </div>
          <button
            onClick={() => go('nilai')}
            className="flex cursor-pointer items-center gap-0.5 text-[11px] font-bold text-[var(--pril)]"
          >
            Detail <ChevronRight className="h-[13px] w-[13px]" />
          </button>
        </div>
        {nilai.length === 0 ? (
          <div className="py-5 text-center text-[12px] font-semibold text-[var(--dim)]">
            Belum ada nilai yang diinput guru
          </div>
        ) : (
          nilai.slice(0, 3).map((n) => {
          const c = mpColor(n.mp);
          const cls = gradeCls(n.na);
          return (
            <div
              key={n.mp}
              onClick={() => setModal({ type: 'grade', data: { nilai: n } })}
              className="mb-2 flex cursor-pointer items-center gap-2.5 rounded-[var(--r-sm)] border border-[var(--border)] p-2.5 transition-colors hover:border-[var(--border2)] hover:bg-[var(--surface2)] last:mb-0"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setModal({ type: 'grade', data: { nilai: n } }); } }}
            >
              <div className="h-10 w-1 shrink-0 rounded" style={{ background: c }} />
              <div className="min-w-0 flex-1">
                <b className="block text-[13px]">{n.mp}</b>
                <small className="text-[10px] font-semibold text-[var(--muted)]">
                  {n.na >= KKTP_DEFAULT ? 'Tuntas' : 'Remedial'} · KKTP {KKTP_DEFAULT}
                </small>
              </div>
              <div
                className="shrink-0 text-[18px] font-extrabold"
                style={{ color: cls === 'ok' ? 'var(--em)' : cls === 'warn' ? 'var(--amber)' : 'var(--rose)' }}
              >
                {n.na}
              </div>
              <div className="shrink-0" style={{ color: n.trend === 'up' ? 'var(--em)' : 'var(--rose)' }}>
                {n.trend === 'up'
                  ? <TrendingUp className="h-[14px] w-[14px]" />
                  : <TrendingDown className="h-[14px] w-[14px]" />}
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* 8. Announcements */}
      <div className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
            <Megaphone className="h-[15px] w-[15px] text-[var(--pri)]" />
            Pengumuman
          </div>
          <button
            onClick={() => setModal({ type: 'pengumuman' })}
            className="cursor-pointer text-[11px] font-bold text-[var(--pril)]"
          >
            Semua
          </button>
        </div>
        {pengumuman.slice(0, 2).map((p) => (
          <div
            key={p.id}
            onClick={() => setModal({ type: 'pengumuman' })}
            className="cursor-pointer border-b border-[var(--border)] py-2 last:border-0"
          >
            <b className="text-[12px]">{p.title}</b>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="rounded-md bg-[var(--surface2)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--pri)]">
                {p.tag}
              </span>
              <small className="text-[9.5px] text-[var(--muted)]">{p.date}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
