'use client';

interface Props {
  day: number;
  status: string;
  onClose: () => void;
}

export default function DayDetailModal({ day, status, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[560px] animate-[slideUp_.3s_ease] rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-[var(--muted)]">Day Detail Modal — Batch G</p>
        <button onClick={onClose} className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-bold">
          Tutup
        </button>
      </div>
    </div>
  );
}
