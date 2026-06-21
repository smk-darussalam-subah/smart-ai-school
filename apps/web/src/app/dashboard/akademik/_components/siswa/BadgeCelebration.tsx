'use client';

interface Props {
  badgeName?: string;
  onClose: () => void;
  go: (screen: any) => void;
}

export default function BadgeCelebration({ badgeName, onClose, go }: Props) {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="relative w-[90%] max-w-[340px] animate-[slideUp_.4s_ease] rounded-[20px] border border-[var(--border)] bg-[var(--bg2)] p-6 text-center shadow-[0_8px_40px_-12px_rgba(0,0,0,.6)]">
        <div className="absolute inset-0 overflow-hidden rounded-[20px] pointer-events-none">
          {/* Confetti */}
          {Array.from({ length: 20 }).map((_, i) => (
            <span
              key={i}
              className="absolute h-2 w-2"
              style={{
                left: `${Math.random() * 100}%`,
                background: ['#10b981', '#f59e0b', '#a78bfa', '#0ea5e9', '#ec4899', '#ea580c'][Math.floor(Math.random() * 6)],
                animationDelay: `${Math.random() * 1.5}s`,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                animation: 'confettiFall 2s ease-out forwards',
              }}
            />
          ))}
        </div>
        <div className="relative z-10">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white">
            <span className="text-3xl">🏅</span>
          </div>
          <div className="text-lg font-extrabold">🎉 Badge Tercapai!</div>
          <div className="mt-1 text-xl font-extrabold">{badgeName || 'Skill Badge'}</div>
          <div className="mt-2 text-xs font-semibold text-[var(--muted)]">Selamat! Anda menguasai kompetensi ini.</div>
          <div className="mt-3 text-3xl font-extrabold text-emerald-500">85</div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12.5px] font-bold text-[var(--text)]"
            >
              Tutup
            </button>
            <button
              onClick={() => {
                onClose();
                go('capaian');
              }}
              className="flex-1 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-700 px-3 py-2.5 text-[12.5px] font-bold text-white"
            >
              Lihat Badge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
