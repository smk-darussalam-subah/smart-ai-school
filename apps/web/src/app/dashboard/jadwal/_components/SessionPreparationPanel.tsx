'use client';

import React, { useRef, useState } from 'react';
import { CalendarCheck2, CheckCircle2, LoaderCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SessionPreparation } from '@/lib/session-preparation';
import { previewClassSessions, prepareClassSessions } from '../session-actions';

export default function SessionPreparationPanel({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [plan, setPlan] = useState<SessionPreparation | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const maxDate = new Date(new Date(today).getTime() + 14 * 86400_000).toISOString().slice(0, 10);

  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setPlan(null);
    try {
      const result = await previewClassSessions(date);
      if (result.error || !result.data)
        setError(result.error ?? 'Kesiapan belum dapat diverifikasi.');
      else setPlan(result.data);
    } catch {
      setError('Kesiapan belum dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const prepare = async () => {
    if (!plan || plan.date !== date || inFlight.current || plan.newCount < 1) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await prepareClassSessions(plan.date, plan.planHash);
      if (result.error || !result.data)
        setError(
          result.error ??
            'Hasil penyiapan belum dapat dipastikan. Periksa sesi sebelum mencoba lagi.',
        );
      else
        setMessage(
          `${result.data.createdCount} sesi disiapkan. Guru dapat memulai sesi miliknya sesuai waktu jadwal.`,
        );
    } catch {
      setError('Hasil belum dapat dipastikan. Muat ulang daftar sesi sebelum mencoba lagi.');
    } finally {
      setPlan(null);
      setConfirming(false);
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      id="session-preparation"
      aria-label="Penyiapan sesi pembelajaran"
      className="space-y-3 border-y border-slate-200 py-4 dark:border-slate-700"
    >
      <h3 className="flex items-center gap-2 font-bold">
        <CalendarCheck2 className="h-5 w-5" aria-hidden="true" />
        Jadwal dan sesi pembelajaran
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="session-preparation-date">Tanggal pembelajaran (WIB)</Label>
          <Input
            id="session-preparation-date"
            type="date"
            className="w-44"
            min={today}
            max={maxDate}
            value={date}
            disabled={busy}
            onChange={(event) => {
              setDate(event.target.value);
              setPlan(null);
              setError(null);
              setMessage(null);
            }}
          />
        </div>
        <Button
          variant="outline"
          className="min-h-11 gap-2"
          disabled={busy || !date}
          onClick={check}
        >
          {busy ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          Periksa kesiapan
        </Button>
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
      {plan && (
        <div className="space-y-2 text-sm" aria-live="polite">
          <p className="font-semibold">
            {plan.academicYear} · Semester {plan.semester} · {plan.date}
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <div>
              <dt>Blok jadwal</dt>
              <dd className="font-bold">{plan.scheduledCount}</dd>
            </div>
            <div>
              <dt>Sesi baru</dt>
              <dd className="font-bold">{plan.newCount}</dd>
            </div>
            <div>
              <dt>Sudah tersedia</dt>
              <dd className="font-bold">{plan.existingCount}</dd>
            </div>
            <div>
              <dt>Waktu mulai terlewat</dt>
              <dd className="font-bold">{plan.skippedStartedCount}</dd>
            </div>
          </dl>
          {plan.skippedExpiredCount > 0 && (
            <p role="status">
              {plan.skippedExpiredCount} blok tidak memenuhi persetujuan jadwal yang berlaku.
            </p>
          )}
          {plan.newCount > 0 ? (
            <Button className="min-h-11 gap-2" disabled={busy} onClick={() => setConfirming(true)}>
              <Play className="h-4 w-4" aria-hidden="true" />
              Siapkan sesi
            </Button>
          ) : (
            <p role="status">
              Tidak ada sesi baru yang perlu disiapkan untuk jadwal mendatang pada tanggal ini.
            </p>
          )}
        </div>
      )}
      <Dialog
        open={confirming}
        onOpenChange={(open: boolean) => {
          if (!busy) setConfirming(open);
        }}
      >
        <DialogContent
          closeDisabled={busy}
          onEscapeKeyDown={(event: { preventDefault(): void }) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event: { preventDefault(): void }) => {
            if (busy) event.preventDefault();
          }}
          className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto bg-white text-slate-950 dark:bg-slate-900 dark:text-slate-100"
        >
          <DialogHeader>
            <DialogTitle>Siapkan sesi pembelajaran?</DialogTitle>
            <DialogDescription>
              {plan?.newCount ?? 0} sesi untuk {plan?.date}. Jadwal yang waktu mulainya sudah lewat
              tidak dibuat. Sesi belum dianggap berlangsung sampai guru memulainya; alert
              keterlambatan mengikuti waktu jadwal.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
              Batal
            </Button>
            <Button className="min-h-11 gap-2" disabled={busy || !plan} onClick={prepare}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Konfirmasi penyiapan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
