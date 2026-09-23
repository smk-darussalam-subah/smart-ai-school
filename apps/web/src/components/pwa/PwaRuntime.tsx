'use client';

import { CheckCircle2, RefreshCw, Wrench } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import PwaWelcome from './PwaWelcome';
import {
  registerDiisServiceWorker,
  requestWaitingWorkerReleaseSummary,
  waitingWorkerFromRegistration,
  type PwaReleaseSummary,
} from '@/lib/pwa-runtime';

export default function PwaRuntime() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [releaseSummary, setReleaseSummary] = useState<PwaReleaseSummary | null>(null);
  const [activating, setActivating] = useState(false);
  const reloadRequested = useRef(false);

  useEffect(() => {
    let active = true;
    let registration: ServiceWorkerRegistration | null = null;

    const revealWaitingWorker = () => {
      if (!active || !registration) return;
      const waiting = waitingWorkerFromRegistration(registration);
      if (waiting) {
        setWaitingWorker(waiting);
        void requestWaitingWorkerReleaseSummary(waiting).then((summary) => {
          if (active) setReleaseSummary(summary);
        });
      }
    };

    const onControllerChange = () => {
      if (!reloadRequested.current) return;
      reloadRequested.current = false;
      window.location.reload();
    };

    const register = () => {
      void registerDiisServiceWorker().then((result) => {
        if (!active || !result) return;
        registration = result;
        revealWaitingWorker();
        registration.addEventListener('updatefound', () => {
          registration?.installing?.addEventListener('statechange', revealWaitingWorker);
        });
      });
    };

    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      active = false;
      window.removeEventListener('load', register);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const activateUpdate = useCallback(() => {
    if (!waitingWorker || activating) return;
    setActivating(true);
    reloadRequested.current = true;
    waitingWorker.postMessage({ type: 'DIIS_SKIP_WAITING' });
  }, [activating, waitingWorker]);

  return (
    <>
      <PwaWelcome />
      {waitingWorker && (
        <section
          role="status"
          aria-live="polite"
          aria-label="Pembaruan DIIS tersedia"
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 max-h-[calc(100svh-1.5rem)] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 overflow-y-auto rounded-lg border border-emerald-900/15 bg-white p-4 text-slate-900 shadow-xl motion-reduce:transition-none sm:p-5"
        >
          <div>
            <p className="text-sm font-bold">Pembaruan DIIS tersedia</p>
            {releaseSummary ? (
              <>
                <p className="mt-1 text-xs font-semibold text-emerald-800">
                  {releaseSummary.version} · {releaseSummary.date}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Fitur baru
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-600">
                      {releaseSummary.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold uppercase text-slate-700">
                      <Wrench className="h-4 w-4 text-blue-700" aria-hidden="true" /> Perbaikan
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-600">
                      {releaseSummary.fixes.map((fix) => <li key={fix}>{fix}</li>)}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {releaseSummary.requiresLogin
                    ? 'Setelah pembaruan, Anda perlu masuk kembali.'
                    : 'Sesi Anda tetap dapat dilanjutkan setelah pembaruan.'}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm leading-6 text-slate-600">Muat versi terbaru saat Anda siap.</p>
            )}
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setWaitingWorker(null)}
              className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              Nanti
            </button>
            <button
              type="button"
              onClick={activateUpdate}
              disabled={activating}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
            >
              <RefreshCw className={`h-4 w-4 ${activating ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              {activating ? 'Memperbarui…' : 'Perbarui sekarang'}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
