'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck2, CheckCircle2, LoaderCircle, Pause, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SessionActivation, SessionActivationPreview } from '@/lib/session-preparation';
import {
  getSessionActivation,
  previewSessionActivation,
  enableSessionActivation,
  disableSessionActivation,
} from '../session-actions';

export default function SessionActivationPanel({ today }: { today: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<SessionActivation | null>(null);
  const [verified, setVerified] = useState(false);
  const [plan, setPlan] = useState<SessionActivationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'enable' | 'disable' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const actionRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async (clearError = true) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setVerified(false);
    if (clearError) {
      setError(null);
      setMessage(null);
    }
    setPlan(null);
    const request = ++generation.current;
    try {
      const result = await getSessionActivation();
      if (generation.current !== request) return;
      if (result.error || !result.data) setError(result.error ?? 'Status otomasi belum tersedia.');
      else {
        setStatus(result.data);
        setVerified(true);
      }
    } catch {
      if (generation.current === request)
        setError('Status belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      if (generation.current === request) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      inFlight.current = false;
    };
  }, [load]);

  async function check() {
    if (!verified || !status || status.enabled || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setPlan(null);
    const request = ++generation.current;
    try {
      const result = await previewSessionActivation(status.date);
      if (generation.current !== request) return;
      if (result.error || !result.data) {
        setError(result.error ?? 'Kesiapan belum dapat diverifikasi.');
        setVerified(false);
      } else if (
        result.data.activation.semesterId !== status.semesterId ||
        result.data.activation.revision !== status.revision ||
        result.data.activation.enabled
      ) {
        setError('Status semester atau otomasi berubah. Muat ulang sebelum melanjutkan.');
        setVerified(false);
      } else {
        setPlan(result.data);
        setDialog('enable');
      }
    } catch {
      if (generation.current === request) {
        setError('Kesiapan belum dapat dimuat. Coba muat ulang.');
        setVerified(false);
      }
    } finally {
      if (generation.current === request) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  async function commit() {
    if (!status || !verified || !dialog || inFlight.current || (dialog === 'enable' && !plan))
      return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const request = ++generation.current;
    try {
      const result =
        dialog === 'enable'
          ? await enableSessionActivation(plan!.date, plan!.planHash)
          : await disableSessionActivation(status.semesterId, status.revision);
      if (generation.current !== request) return;
      if (result.error || !result.data)
        setError(result.error ?? 'Hasil belum dapat dipastikan. Muat ulang status.');
      else {
        setMessage(
          dialog === 'enable'
            ? 'Otomasi aktif. Sesi berikutnya disiapkan setiap hari pembelajaran; guru tetap memulai sesi sendiri.'
            : 'Otomasi nonaktif. Sesi baru dan pengingat dihentikan; sesi yang sudah berjalan tetap dapat diselesaikan.',
        );
        router.refresh();
      }
    } catch {
      if (generation.current === request)
        setError('Hasil belum dapat dipastikan. Muat ulang status sebelum mencoba lagi.');
    } finally {
      if (generation.current === request) {
        setDialog(null);
        setPlan(null);
        setVerified(false);
        inFlight.current = false;
        setBusy(false);
        void load(false);
      }
    }
  }

  return (
    <section
      id="session-preparation"
      aria-label="Otomasi sesi pembelajaran"
      aria-busy={busy}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="flex items-center gap-2 font-bold outline-offset-4"
          >
            <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
            Sesi pembelajaran harian
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Aktifkan satu kali untuk semester ini. Jadwal dan penugasan mengajar tidak berubah.
          </p>
        </div>
        <span
          role="status"
          className={`rounded-full px-3 py-1 text-sm font-semibold ${!verified ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' : status?.enabled ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}
        >
          {!verified
            ? busy
              ? 'Memeriksa status…'
              : 'Status belum terverifikasi'
            : status?.enabled
              ? 'Otomasi aktif'
              : 'Otomasi nonaktif'}
        </span>
      </div>
      {status && verified && (
        <p className="text-sm font-medium">
          {status.academicYear} · Semester {status.semester} ·{' '}
          {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }).format(
            new Date(status.date),
          )}{' '}
          (WIB)
        </p>
      )}
      {!status && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Tanggal halaman {today} (WIB). Status server harus dimuat sebelum mengubah otomasi.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11 gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? (
            <LoaderCircle
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Muat ulang status
        </Button>
        {verified &&
          status &&
          (status.enabled ? (
            <Button
              ref={actionRef}
              variant="outline"
              className="min-h-11 gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              disabled={busy}
              onClick={() => setDialog('disable')}
            >
              <Pause className="h-4 w-4" aria-hidden="true" />
              Nonaktifkan otomasi
            </Button>
          ) : (
            <Button
              ref={actionRef}
              className="min-h-11 gap-2 bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() => void check()}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              Periksa & aktifkan
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">
          {message}
        </p>
      )}
      <details className="text-sm text-slate-600 dark:text-slate-300">
        <summary className="cursor-pointer py-2 font-medium">Cara kerja sesi harian</summary>
        <p className="max-w-3xl pt-2 leading-relaxed">
          Sesi disiapkan mengikuti jadwal dan jam pelajaran yang berlaku, Senin–Sabtu, kecuali hari
          libur. Jam yang sudah lewat tidak dibuat ulang. Guru tetap melakukan presensi pegawai,
          memulai kelas, mengisi kegiatan/kehadiran siswa, lalu menyelesaikan sesi. Sesi yang
          disiapkan bukan bukti kehadiran atau pembelajaran sudah berlangsung.
        </p>
      </details>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open: boolean) => {
          if (!busy && !open) {
            setDialog(null);
            setPlan(null);
          }
        }}
      >
        <DialogContent
          closeDisabled={busy}
          className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto bg-white text-slate-950 dark:bg-slate-900 dark:text-slate-100"
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            if (actionRef.current && !actionRef.current.disabled) actionRef.current.focus();
            else headingRef.current?.focus();
          }}
          onEscapeKeyDown={(event: { preventDefault(): void }) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event: { preventDefault(): void }) => {
            if (busy) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog === 'disable'
                ? 'Nonaktifkan otomasi sesi?'
                : 'Aktifkan sesi harian semester ini?'}
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-300">
              {dialog === 'disable'
                ? 'Sistem berhenti menyiapkan sesi dan mengirim pengingat. Sesi yang belum dimulai tidak dapat dimulai. Guru yang masih berwenang tetap dapat menyelesaikan sesi yang sudah berjalan. Notifikasi yang sudah terkirim tidak dapat ditarik.'
                : `Untuk ${status?.academicYear} · Semester ${status?.semester}. Hari ini tersedia ${plan?.newCount ?? 0} sesi baru dan ${plan?.existingCount ?? 0} sesi yang sudah disiapkan. Otomasi berlanjut pada hari pembelajaran berikutnya sampai dinonaktifkan atau semester berganti.`}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'enable' && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" />
              Guru tetap memulai kelas sendiri. {plan?.skippedStartedCount ?? 0} blok yang waktu
              mulainya terlewat tidak dibuat ulang.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="min-h-11 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              disabled={busy}
              onClick={() => {
                setDialog(null);
                setPlan(null);
              }}
            >
              Batal
            </Button>
            <Button
              className="min-h-11 gap-2 bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy || !verified || (dialog === 'enable' && !plan)}
              onClick={() => void commit()}
            >
              {busy && (
                <LoaderCircle
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              )}
              {dialog === 'disable' ? 'Ya, nonaktifkan' : 'Konfirmasi aktivasi'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
