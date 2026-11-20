'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import {
  completeAssessmentSession,
  fetchAssessmentResults,
  fetchAssessmentSession,
  type AssessmentSessionData,
} from '../actions';
import { assessmentCompletionReadiness } from './assessment-completion-readiness';
import { assessmentCompletionLabel } from './assessment-completion-feedback';

type Readiness = NonNullable<ReturnType<typeof assessmentCompletionReadiness>>;

export default function AssessmentCompletionDialog({
  sessionId,
  session,
  onClose,
  onCompleted,
}: {
  sessionId: string;
  session: AssessmentSessionData | null;
  onClose: () => void;
  onCompleted: (session: AssessmentSessionData) => void;
}) {
  const returnFocus = useDialogReturnFocus();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const mounted = useRef(false);
  const flight = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmsGradebook =
    session?.purpose !== 'remedial' &&
    (session?.gradeTarget === 'uh' ||
      session?.gradeTarget === 'uts' ||
      session?.gradeTarget === 'uas');

  const readReadiness = async () => {
    const result = await fetchAssessmentResults(sessionId);
    if (!result.success) throw new Error(result.error ?? 'Ringkasan peserta belum dapat dimuat.');
    if (result.data?.session.id === sessionId && result.data.session.status === 'completed') {
      const current = await fetchAssessmentSession(sessionId);
      if (
        !current.success ||
        current.data?.id !== sessionId ||
        current.data.status !== 'completed'
      ) {
        throw new Error('Sesi sudah ditutup. Muat ulang untuk melihat hasilnya.');
      }
      if (mounted.current) onCompleted(current.data);
      return null;
    }
    const fresh = assessmentCompletionReadiness(result.data, sessionId);
    if (!fresh)
      throw new Error(
        'Kesiapan sesi belum dapat dipastikan. Muat ulang ringkasan sebelum menutup.',
      );
    return fresh;
  };

  const refresh = async () => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      const fresh = await readReadiness();
      if (mounted.current && fresh) setReadiness(fresh);
    } catch (failure) {
      if (mounted.current) {
        setReadiness(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Ringkasan peserta belum dapat dimuat. Coba lagi.',
        );
      }
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [sessionId]);

  const complete = async () => {
    if (flight.current || !readiness) return;
    flight.current = true;
    setBusy(true);
    setClosing(true);
    setError(null);
    let checkedReadiness = false;
    try {
      const fresh = await readReadiness();
      if (!mounted.current || !fresh) return;
      checkedReadiness = true;
      if (JSON.stringify(fresh) !== JSON.stringify(readiness)) {
        setReadiness(fresh);
        setError('Status peserta berubah. Periksa ringkasan terbaru, lalu konfirmasikan kembali.');
        return;
      }
      const result = await completeAssessmentSession(sessionId);
      if (!mounted.current) return;
      if (!result.success || result.data?.id !== sessionId || result.data.status !== 'completed') {
        setError(result.error ?? 'Sesi belum dapat diselesaikan. Periksa kembali lalu coba lagi.');
        return;
      }
      onCompleted(result.data);
    } catch (failure) {
      if (mounted.current) {
        if (!checkedReadiness) setReadiness(null);
        setError(
          failure instanceof Error
            ? failure.message
            : 'Permintaan belum berhasil. Periksa status sesi sebelum mencoba lagi.',
        );
      }
    } finally {
      flight.current = false;
      if (mounted.current) {
        setBusy(false);
        setClosing(false);
      }
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !closing) onClose();
      }}
    >
      <DialogContent
        {...returnFocus}
        className="z-[90] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-white p-5"
        closeDisabled={closing}
        onEscapeKeyDown={(event) => {
          if (closing) event.preventDefault();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          returnFocus.onOpenAutoFocus();
          event.preventDefault();
          cancelButton.current?.focus();
        }}
      >
        <DialogTitle>Tutup sesi asesmen?</DialogTitle>
        <DialogDescription className="text-sm leading-relaxed text-slate-600">
          Setelah ditutup, siswa tidak dapat mulai atau melanjutkan pengerjaan biasa. Kiriman
          terlambat memerlukan keputusan Guru.
        </DialogDescription>
        {busy && !readiness && (
          <p role="status" className="text-sm text-slate-600">
            Memeriksa status peserta…
          </p>
        )}
        {readiness && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            {[
              ['Peserta aktif saat ini', readiness.total],
              ['Sudah mengirim', readiness.submitted],
              ['Perkiraan belum mulai', readiness.notStarted],
              ['Sedang mengerjakan', readiness.inProgress],
              ['Menunggu koreksi', readiness.pendingManual],
              ['Perlu keputusan', readiness.pendingLate],
              ...(readiness.rejectedLate
                ? [['Kiriman terlambat ditolak', readiness.rejectedLate]]
                : []),
            ].map(([title, value]) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-sm text-slate-600">
          {session?.purpose === 'remedial'
            ? 'Setelah sesi selesai, tinjau hasil peserta untuk menetapkan nilai remedial.'
            : confirmsGradebook
              ? `Nilai final yang siap akan disimpan sebagai ${session?.gradeTarget?.toUpperCase()} di Gradebook.`
              : 'Setelah sesi selesai, hasil tersedia di tab Analisis.'}{' '}
          Koreksi dan keputusan yang tertunda tetap perlu dituntaskan.
        </p>
        {error && (
          <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            ref={cancelButton}
            type="button"
            disabled={closing}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            Kembali ke sesi
          </button>
          {!readiness && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="min-h-11 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
            >
              Muat ulang ringkasan
            </button>
          )}
          <button
            type="button"
            disabled={busy || !readiness}
            onClick={() => void complete()}
            className="min-h-11 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            {closing ? 'Memproses…' : assessmentCompletionLabel(session)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
