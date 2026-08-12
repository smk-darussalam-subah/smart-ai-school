'use client';

import { BookOpen, CalendarClock, MapPin, UserRound, X } from 'lucide-react';
import type { SiswaModul } from './siswa-types';

interface Props {
  subject: string;
  teacher: string;
  room: string;
  jpIndex: number;
  modules: SiswaModul[];
  onClose: () => void;
  openModulDetail: (id: number) => void;
}

export default function LessonSessionModal({ subject, teacher, room, jpIndex, modules, onClose, openModulDetail }: Props) {
  const matchingModule = modules.find((module) => module.mapel === subject && module.status !== 'Terkunci')
    ?? modules.find((module) => module.mapel === subject)
    ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[560px] animate-[slideUp_.3s_ease] rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detail sesi pelajaran"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-500">Sesi Pelajaran</div>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--text)]">{subject}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface)]" aria-label="Tutup">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          <InfoRow icon={CalendarClock} label="Jam pelajaran" value={`JP ${jpIndex}`} />
          <InfoRow icon={UserRound} label="Guru" value={teacher || 'Guru mapel'} />
          <InfoRow icon={MapPin} label="Ruang" value={room || '-'} />
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 text-emerald-500" />
            <div>
              <div className="text-sm font-bold text-[var(--text)]">Modul terkait</div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {matchingModule
                  ? matchingModule.judul
                  : 'Belum ada modul aktif untuk mapel ini pada akun siswa.'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold text-[var(--text)]"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={!matchingModule}
            onClick={() => {
              if (!matchingModule) return;
              onClose();
              openModulDetail(matchingModule.id);
            }}
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            Buka Modul
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof CalendarClock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
      <Icon className="h-4 w-4 text-emerald-500" />
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</div>
        <div className="text-sm font-bold text-[var(--text)]">{value}</div>
      </div>
    </div>
  );
}
