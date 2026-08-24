'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  KeyRound,
  LoaderCircle,
  MonitorCheck,
  ShieldCheck,
} from 'lucide-react';

export default function DisplayPairing({
  reason,
  initialDeviceId = '',
}: {
  reason?: string;
  initialDeviceId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [deviceId, setDeviceId] = useState(initialDeviceId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const pairingCode = code.trim();
    if (!/^[0-9a-f-]{36}$/i.test(deviceId.trim()) || !/^[A-Za-z0-9_-]{10,32}$/.test(pairingCode)) {
      setError('Masukkan ID perangkat dan kode pairing dari administrator.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/display/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId.trim(), pairingCode }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(
          payload?.message ?? 'Pairing belum berhasil. Minta kode baru kepada administrator.',
        );
        setPending(false);
        return;
      }
      router.replace('/display/room');
      router.refresh();
    } catch {
      setError('Layanan pairing tidak dapat dihubungi. Periksa koneksi lalu coba lagi.');
      setPending(false);
    }
  }

  const guidance =
    reason === 'legacy'
      ? 'Tautan Ruang Guru lama sudah dihentikan. Gunakan kode pairing perangkat yang baru.'
      : reason === 'credential'
        ? 'Akses perangkat telah berakhir atau dicabut. Minta administrator membuat kode pairing baru.'
        : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 py-10 text-slate-100">
      <section
        className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-6 shadow-xl sm:p-8"
        aria-labelledby="pair-title"
      >
        <div className="flex items-center gap-3 border-b border-slate-700 pb-5">
          <Image
            src="/icon-192.png"
            alt="Mark DIIS"
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg"
            priority
          />
          <div>
            <p className="font-bold">DIIS Display</p>
            <p className="text-sm text-slate-400">SMK Darussalam Subah</p>
          </div>
        </div>
        <div className="py-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-700 bg-emerald-950 text-emerald-300">
            <MonitorCheck className="h-6 w-6" />
          </div>
          <h1 id="pair-title" className="mt-4 text-2xl font-bold">
            Pasangkan display ruangan
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Kode sekali pakai menentukan profil Ruang Guru atau Tata Usaha. Display tidak memakai
            akun maupun sesi pengguna.
          </p>
        </div>
        {guidance && (
          <div
            className="mb-4 flex gap-3 rounded-lg border border-amber-700 bg-amber-950/60 p-4 text-sm text-amber-100"
            role="status"
          >
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {guidance}
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="device-id" className="text-sm font-semibold text-slate-200">
              ID perangkat
            </label>
            <input
              id="device-id"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={36}
              placeholder="UUID perangkat"
              className="h-12 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 font-mono text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="pairing-code" className="text-sm font-semibold text-slate-200">
              Kode pairing
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" />
              <input
                ref={inputRef}
                id="pairing-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                minLength={10}
                maxLength={32}
                placeholder="10–32 karakter"
                className="h-12 w-full rounded-lg border border-slate-600 bg-slate-950 pl-11 pr-3 font-mono text-lg tracking-widest text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          {error && (
            <p
              className="rounded-lg border border-red-800 bg-red-950/70 p-3 text-sm text-red-100"
              role="alert"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending || !deviceId.trim() || !code.trim()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" />{' '}
                Memverifikasi...
              </>
            ) : (
              <>
                Pasangkan perangkat <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>
        <div className="mt-6 flex gap-2 border-t border-slate-700 pt-5 text-xs leading-5 text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <p>
            Kredensial disimpan sebagai cookie aman dan tidak dapat dibaca JavaScript, URL, maupun
            tampilan ini.
          </p>
        </div>
      </section>
    </main>
  );
}
