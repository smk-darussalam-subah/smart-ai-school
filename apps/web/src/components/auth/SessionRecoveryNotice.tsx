/** Public, identity-free recovery surface. Plain anchors intentionally leave the
 * App Router before entering the writable authentication boundary. */
export function SessionRecoveryNotice({
  message,
  retryHref = '/api/auth/refresh?callbackUrl=%2Fdashboard',
  onRetry,
  busy = false,
}: {
  message: string;
  retryHref?: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-5 text-slate-900">
      <section
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        aria-labelledby="session-recovery-title"
      >
        <p className="text-sm font-semibold text-smk-emerald">DIIS</p>
        <h1 id="session-recovery-title" className="mt-2 text-xl font-bold">
          Sesi belum dapat digunakan
        </h1>
        <p role="status" className="mt-3 text-sm leading-6 text-slate-600">
          {message}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="mt-5 flex min-h-11 w-full items-center justify-center rounded-lg bg-smk-emerald px-4 text-sm font-semibold text-white hover:bg-smk-emerald-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? 'Memulihkan sesi…' : 'Coba muat ulang'}
          </button>
        ) : (
          <a
            href={retryHref}
            className="mt-5 flex min-h-11 items-center justify-center rounded-lg bg-smk-emerald px-4 text-sm font-semibold text-white hover:bg-smk-emerald-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2"
          >
            Coba muat ulang
          </a>
        )}
        <a
          href="/login?reason=session"
          className="mt-2 flex min-h-11 items-center justify-center rounded-lg text-sm font-medium text-smk-emerald hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2"
        >
          Masuk kembali
        </a>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Status izin dan data sekolah belum dapat dipastikan. Halaman ini tidak berarti izin Anda
          dicabut.
        </p>
      </section>
    </main>
  );
}
