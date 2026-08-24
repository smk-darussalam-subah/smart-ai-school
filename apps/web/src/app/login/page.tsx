'use client';

import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowRight, LoaderCircle, ShieldCheck, WifiOff } from 'lucide-react';
import { resolveLoginNotice, safeLoginCallback } from './login-ui';

function LoginContent() {
  const searchParams = useSearchParams();
  const buttonRef = useRef<HTMLButtonElement>(null);
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
    buttonRef.current?.focus();
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
    <main className="grid min-h-screen bg-slate-50 text-slate-950 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section className="hidden border-r border-slate-200 bg-white px-10 py-12 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/icon-192.png"
            alt="Mark DIIS"
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg"
            priority
          />
          <div>
            <p className="font-jakarta text-lg font-bold">DIIS</p>
            <p className="text-sm text-slate-600">SMK Darussalam Subah</p>
          </div>
        </div>
        <div className="max-w-xl">
          <p className="mb-3 text-xs font-semibold uppercase text-emerald-800">
            Ruang kerja sekolah
          </p>
          <h1 className="font-jakarta text-4xl font-bold leading-tight text-slate-950">
            Satu akses untuk pekerjaan sekolah yang terotorisasi.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
            Gunakan akun sekolah. Menu dan data akan mengikuti peran identitas, Appointment aktif,
            serta penugasan akademik Anda.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          Sesi dilindungi oleh akun sekolah dan kebijakan privasi DIIS.
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/icon-192.png"
              alt="Mark DIIS"
              width={44}
              height={44}
              className="h-11 w-11 rounded-lg"
              priority
            />
            <div>
              <p className="font-jakarta text-lg font-bold">DIIS</p>
              <p className="text-sm text-slate-600">SMK Darussalam Subah</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase text-emerald-800">Akun sekolah</p>
            <h2 className="mt-2 font-jakarta text-2xl font-bold">Masuk ke DIIS</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Anda akan diarahkan ke layanan akun SMK Darussalam Subah.
            </p>

            {currentNotice && (
              <div
                role="alert"
                className={`mt-5 flex gap-3 rounded-lg border px-4 py-3 text-sm ${
                  currentNotice.tone === 'error'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
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
              ref={buttonRef}
              type="button"
              onClick={handleLogin}
              disabled={isLoading || !isOnline}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
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
                  Masuk dengan akun sekolah <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </>
              )}
            </button>

            <p className="mt-5 text-sm leading-6 text-slate-600">
              Akun bermasalah? Hubungi Tata Usaha. Jangan membagikan kata sandi atau kode masuk.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">
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
