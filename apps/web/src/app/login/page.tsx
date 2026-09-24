'use client';

import Image from 'next/image';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CircleHelp,
  LoaderCircle,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { resolveLoginNotice, safeLoginCallback } from './login-ui';

function LoginContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const callbackUrl = useMemo(
    () => safeLoginCallback(searchParams.get('callbackUrl')),
    [searchParams],
  );
  const notice = resolveLoginNotice(searchParams.get('reason'), searchParams.get('error'));

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  async function handleLogin() {
    if (!isOnline || isLoading) return;
    setRuntimeError(null);
    setIsLoading(true);
    try {
      const result = await signIn('keycloak', { callbackUrl });
      if (result?.error) {
        setRuntimeError('Layanan akun sekolah menolak permintaan masuk. Silakan coba lagi.');
        setIsLoading(false);
      }
    } catch {
      setRuntimeError('Layanan masuk belum dapat dihubungi. Periksa koneksi lalu coba lagi.');
      setIsLoading(false);
    }
  }

  const currentNotice = !isOnline
    ? {
        tone: 'warning' as const,
        message: 'Perangkat sedang offline. Sambungkan internet untuk masuk.',
      }
    : runtimeError
      ? { tone: 'error' as const, message: runtimeError }
      : notice;

  return (
    <main className="grid min-h-dvh bg-white text-slate-950 lg:grid-cols-[minmax(0,1.25fr)_minmax(26rem,0.75fr)]">
      <section className="relative min-h-52 overflow-hidden bg-smk-emerald-deep lg:min-h-dvh">
        <Image
          src="/landing/school-front.jpg"
          alt="Gerbang SMK Darussalam Subah"
          fill
          sizes="(min-width: 1024px) 62vw, 100vw"
          className="object-cover object-[center_58%] lg:object-center"
          priority
        />
        <div className="absolute inset-0 bg-smk-emerald-deep/15" aria-hidden="true" />

        <div className="absolute inset-x-0 bottom-0 bg-smk-emerald-deep/90 px-5 py-4 text-white sm:px-8 lg:px-12 lg:py-10">
          <p className="font-jakarta text-lg font-bold sm:text-xl lg:max-w-xl lg:text-4xl lg:leading-tight">
            Ruang digital untuk keseharian sekolah.
          </p>
          <p className="mt-1 hidden max-w-xl text-sm leading-6 text-emerald-50 sm:block lg:mt-3 lg:text-base lg:leading-7">
            Akses pembelajaran, layanan, dan pekerjaan sekolah dari satu tempat yang mengikuti peran
            Anda.
          </p>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-13rem)] items-center justify-center bg-[#f7faf8] px-5 py-10 sm:px-10 lg:min-h-dvh lg:px-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3.5">
            <Image
              src="/icon-192.png"
              alt="Logo DIIS"
              width={52}
              height={52}
              className="h-[52px] w-[52px] rounded-xl shadow-soft-sm"
              priority
            />
            <div>
              <p className="font-jakarta text-xl font-bold leading-tight text-smk-ink">DIIS</p>
              <p className="mt-0.5 text-sm text-smk-ink-soft">SMK Darussalam Subah</p>
            </div>
          </div>

          <div className="mt-10">
            <h1 className="max-w-sm font-jakarta text-3xl font-bold leading-tight text-smk-ink sm:text-4xl">
              Senang melihat Anda kembali.
            </h1>
            <p className="mt-3 max-w-sm text-base leading-7 text-smk-ink-soft">
              Masuk untuk melanjutkan aktivitas sekolah Anda di DIIS.
            </p>

            {currentNotice && (
              <div
                role="alert"
                className={`mt-6 flex gap-3 rounded-lg px-4 py-3 text-sm leading-6 ${
                  currentNotice.tone === 'error'
                    ? 'bg-red-50 text-red-900 ring-1 ring-inset ring-red-200'
                    : 'bg-amber-50 text-amber-950 ring-1 ring-inset ring-amber-200'
                }`}
              >
                {isOnline ? (
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                ) : (
                  <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <span>{currentNotice.message}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoading || !isOnline}
              className="mt-7 inline-flex min-h-12 w-full touch-manipulation items-center justify-center gap-2 rounded-lg bg-smk-emerald px-5 text-base font-semibold text-white shadow-soft-sm transition-[background-color,box-shadow,transform] duration-200 hover:bg-smk-emerald-deep hover:shadow-soft-md active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <LoaderCircle
                    className="h-5 w-5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />{' '}
                  Menghubungkan...
                </>
              ) : (
                <>
                  Lanjut dengan akun sekolah
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>

            <div className="mt-5 flex items-start gap-2.5 text-sm leading-6 text-smk-ink-soft">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-smk-emerald"
                aria-hidden="true"
              />
              <p>Satu akun sekolah untuk akses yang sesuai dengan peran dan tugas Anda.</p>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-emerald-900/10 pt-5">
              <p className="text-sm text-slate-600">Jaga kata sandi dan kode masuk Anda.</p>
              <Link
                href="/login/bantuan"
                className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-md text-sm font-semibold text-smk-emerald underline-offset-4 hover:text-smk-emerald-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-smk-emerald focus-visible:ring-offset-2"
              >
                <CircleHelp className="h-4 w-4" aria-hidden="true" />
                Bantuan masuk
              </Link>
            </div>
          </div>

          <p className="mt-10 text-xs text-slate-500">
            &copy; {new Date().getFullYear()} SMK Darussalam Subah
          </p>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50" aria-busy="true" />}>
      <LoginContent />
    </Suspense>
  );
}
