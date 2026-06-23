'use client';

interface Props {
  subject: string;
  teacher: string;
  room: string;
  jpIndex: number;
  onClose: () => void;
  openModulDetail: (id: number) => void;
}

export default function LessonSessionModal({ subject: _subject, teacher: _teacher, room: _room, jpIndex: _jpIndex, onClose, openModulDetail: _openModulDetail }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[560px] animate-[slideUp_.3s_ease] rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[var(--muted)]">Lesson Session Modal — Batch C</p>
        <button onClick={onClose} className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold">
          Tutup
        </button>
      </div>
    </div>
  );
}
