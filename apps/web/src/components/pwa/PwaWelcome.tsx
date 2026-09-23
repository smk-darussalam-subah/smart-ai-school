'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Image from 'next/image';
import {
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  Network,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  completePwaOnboarding,
  isInstalledExperience,
  needsPwaOnboarding,
} from '@/lib/pwa-preferences';

const SLIDE_COUNT = 3;

function BrandMark({ animated = false }: { animated?: boolean }) {
  return (
    <div className={`relative grid h-28 w-28 place-items-center sm:h-32 sm:w-32 ${animated ? 'pwa-brand-arrive' : ''}`}>
      <span className="pwa-brand-ring absolute inset-0 rounded-full border border-emerald-200/35" aria-hidden="true" />
      <span className="pwa-brand-ring pwa-brand-ring-delayed absolute inset-3 rounded-full border border-blue-200/30" aria-hidden="true" />
      <Image
        src="/icon-192.png"
        alt=""
        width={96}
        height={96}
        priority
        className="relative h-20 w-20 rounded-[1.25rem] shadow-2xl sm:h-24 sm:w-24"
      />
    </div>
  );
}

function SlideContent({ step }: { step: number }) {
  if (step === 0) {
    return (
      <>
        <Network className="h-12 w-12 text-emerald-300" aria-hidden="true" />
        <p className="mt-7 text-xs font-bold uppercase text-emerald-200">Mengenal DIIS</p>
        <Dialog.Title className="mt-2 font-jakarta text-3xl font-bold text-white sm:text-4xl">
          Satu ruang kerja sekolah yang terhubung
        </Dialog.Title>
        <Dialog.Description className="mt-4 max-w-xl text-base leading-7 text-emerald-50/80">
          DIIS menyatukan kegiatan akademik, administrasi, komunikasi, dan pemantauan tanpa
          menghilangkan batas kewenangan setiap pengguna.
        </Dialog.Description>
      </>
    );
  }
  if (step === 1) {
    return (
      <>
        <LayoutDashboard className="h-12 w-12 text-blue-300" aria-hidden="true" />
        <p className="mt-7 text-xs font-bold uppercase text-blue-200">Sesuai tanggung jawab</p>
        <Dialog.Title className="mt-2 font-jakarta text-3xl font-bold text-white sm:text-4xl">
          Setiap orang melihat pekerjaan yang relevan
        </Dialog.Title>
        <Dialog.Description className="mt-4 max-w-xl text-base leading-7 text-slate-200">
          Guru, siswa, orang tua, pimpinan, tenaga administrasi, dan mitra sekolah mendapatkan
          tampilan serta tindakan sesuai peran dan penugasan yang sah.
        </Dialog.Description>
      </>
    );
  }
  return (
    <>
      <ShieldCheck className="h-12 w-12 text-amber-300" aria-hidden="true" />
      <p className="mt-7 text-xs font-bold uppercase text-amber-200">Privasi perangkat</p>
      <Dialog.Title className="mt-2 font-jakarta text-3xl font-bold text-white sm:text-4xl">
        Aplikasi pribadi, browser aman untuk PC laboratorium
      </Dialog.Title>
      <Dialog.Description className="mt-4 max-w-xl text-base leading-7 text-slate-200">
        DIIS yang dipasang sebagai aplikasi dapat menerima notifikasi setelah Anda mengizinkannya.
        Pada komputer bersama, gunakan browser dan selalu keluar setelah selesai; state privat akan
        dibersihkan tanpa menyimpan data sekolah untuk penggunaan offline.
      </Dialog.Description>
    </>
  );
}

export default function PwaWelcome() {
  const [phase, setPhase] = useState<'hidden' | 'splash' | 'slides'>('hidden');
  const [step, setStep] = useState(0);

  const finish = useCallback(() => {
    completePwaOnboarding(typeof window !== 'undefined' ? window.localStorage : undefined);
    setPhase('hidden');
  }, []);

  useEffect(() => {
    if (!isInstalledExperience() || !needsPwaOnboarding(window.localStorage)) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setPhase(reducedMotion ? 'slides' : 'splash');
    if (reducedMotion) return;
    const timer = window.setTimeout(() => setPhase('slides'), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  if (phase === 'hidden') return null;

  return (
    <Dialog.Root open onOpenChange={(open: boolean) => { if (!open) finish(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[#042d24]" />
        <Dialog.Content
          className="fixed inset-0 z-[81] overflow-y-auto bg-[#064534] text-white focus:outline-none"
        >
          {phase === 'splash' ? (
            <div className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
              <button
                type="button"
                onClick={finish}
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] min-h-11 rounded-lg px-4 text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-8"
              >
                Lewati pengantar
              </button>
              <BrandMark animated />
              <Dialog.Title className="pwa-wordmark-arrive mt-8 font-jakarta text-5xl font-extrabold tracking-normal sm:text-6xl">
                DIIS
              </Dialog.Title>
              <Dialog.Description className="pwa-school-arrive mt-3 text-sm font-semibold uppercase tracking-normal text-emerald-100 sm:text-base">
                SMK Darussalam Subah
              </Dialog.Description>
            </div>
          ) : (
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Image src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-lg" />
                  <div>
                    <p className="font-jakarta text-base font-bold">DIIS</p>
                    <p className="text-xs text-emerald-100/75">SMK Darussalam Subah</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={finish}
                  className="min-h-11 rounded-lg px-4 text-sm font-semibold text-emerald-50 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Lewati
                </button>
              </header>

              <main className="flex flex-1 flex-col justify-center py-12 sm:py-16">
                <div key={step} className="pwa-slide-arrive">
                  <SlideContent step={step} />
                </div>
              </main>

              <footer className="flex flex-col gap-5 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2" aria-label={`Langkah ${step + 1} dari ${SLIDE_COUNT}`}>
                  {Array.from({ length: SLIDE_COUNT }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2 rounded-full transition-all motion-reduce:transition-none ${index === step ? 'w-8 bg-white' : 'w-2 bg-white/35'}`}
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <div className="flex gap-3">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={() => setStep((current) => current - 1)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 px-4 text-sm font-bold hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { if (step === SLIDE_COUNT - 1) finish(); else setStep((current) => current + 1); }}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-bold text-[#064534] hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#064534] sm:flex-none"
                  >
                    {step === SLIDE_COUNT - 1 ? 'Mulai DIIS' : 'Berikutnya'}
                    {step < SLIDE_COUNT - 1 && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </footer>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
