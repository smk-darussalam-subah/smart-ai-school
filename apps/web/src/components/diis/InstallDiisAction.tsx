'use client';

import { Download, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isInstalled() {
  if (typeof window === 'undefined') return false;
  const standaloneNavigator = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    standaloneNavigator.standalone === true
  );
}

export function InstallDiisAction() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      setShowGuidance(false);
    };

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed) return;
    if (!promptEvent) {
      setShowGuidance((current) => !current);
      return;
    }

    await promptEvent['prompt']();
    const result = await promptEvent.userChoice;
    if (result.outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <div className="flex flex-col items-start">
      <button
        type="button"
        onClick={handleInstall}
        aria-expanded={showGuidance}
        className="inline-flex min-h-12 items-center justify-center gap-2 bg-smk-lime px-5 py-3 text-sm font-bold text-smk-ink transition-colors hover:bg-[#d5f778] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-smk-emerald-deep"
      >
        {installed ? (
          <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
        ) : (
          <Download aria-hidden="true" className="h-5 w-5" />
        )}
        {installed ? 'DIIS sudah terpasang' : 'Pasang DIIS'}
      </button>
      {showGuidance && !installed && (
        <p className="mt-3 max-w-sm text-sm leading-6 text-white/75" role="status">
          Buka menu browser, lalu pilih <strong className="text-white">Pasang aplikasi</strong> atau{' '}
          <strong className="text-white">Tambahkan ke Layar Utama</strong>. Opsi dapat berbeda
          menurut perangkat.
        </p>
      )}
    </div>
  );
}
