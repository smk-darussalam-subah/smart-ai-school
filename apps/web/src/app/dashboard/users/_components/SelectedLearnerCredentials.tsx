'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import TemporaryCredentialExports from '@/components/TemporaryCredentialExports';
import type { TemporaryCredential } from '@/lib/temporary-credentials';
import { reissueLearnerPasswordAction } from '../actions';

interface Target {
  id: string;
  fullName: string;
  role: string;
}
export default function SelectedLearnerCredentials({
  targets,
  onClear,
}: {
  targets: Target[];
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [started, setStarted] = useState(false);
  const [results, setResults] = useState<
    Array<{ target: Target; credential?: TemporaryCredential; error?: string }>
  >([]);
  const [snapshot, setSnapshot] = useState<Target[]>([]);
  const running = useRef(false);
  useEffect(() => {
    if (!open || (!busy && !results.some((r) => r.credential))) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [open, busy, results]);
  const issue = async () => {
    if (running.current || started || !snapshot.length || snapshot.length > 5) return;
    running.current = true;
    setBusy(true);
    setStarted(true);
    // No automatic retry: even an ambiguous network result may already have reset
    // the account. Keep all earlier successful credentials available for export.
    for (const target of snapshot) {
      try {
        const result = await reissueLearnerPasswordAction(target.id);
        setResults((previous) => [
          ...previous,
          result.data && !result.error
            ? {
                target,
                credential: {
                  username: result.data.username,
                  tempPassword: result.data.temporaryPassword,
                  role: result.data.role,
                  fullName: result.data.fullName,
                },
              }
            : {
                target,
                error:
                  result.error ??
                  'Hasil belum terkonfirmasi. Periksa akun sebelum menerbitkan ulang.',
              },
        ]);
      } catch {
        setResults((previous) => [
          ...previous,
          { target, error: 'Hasil belum terkonfirmasi. Periksa akun sebelum menerbitkan ulang.' },
        ]);
      }
    }
    running.current = false;
    setBusy(false);
  };
  const close = () => {
    if (running.current) return;
    setOpen(false);
    setResults([]);
    setStarted(false);
    setSnapshot([]);
    onClear();
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!targets.length || targets.length > 5}
        onClick={() => {
          setSnapshot([...new Map(targets.map((t) => [t.id, t])).values()]);
          setOpen(true);
        }}
      >
        Terbitkan password sementara ({targets.length})
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] max-w-xl overflow-y-auto text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          closeDisabled={busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('users-list-heading')?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {started ? 'Hasil penerbitan akun' : 'Terbitkan password sementara baru?'}
            </DialogTitle>
            <DialogDescription className="dark:text-slate-300">
              Hanya akun yang dipilih akan keluar dari sesi dan wajib mengganti password saat masuk
              kembali. Maksimal 5 akun per penerbitan.
            </DialogDescription>
          </DialogHeader>
          {!started ? (
            <ul className="space-y-2">
              {snapshot.map((t) => (
                <li key={t.id} className="rounded-lg border p-3 text-sm">
                  {t.fullName} · {t.role === 'SISWA' ? 'Siswa' : 'Orang Tua/Wali'}
                </li>
              ))}
            </ul>
          ) : (
            <div aria-live="polite" className="space-y-3">
              {results.map((r) => (
                <div
                  key={r.target.id}
                  className="rounded-lg border p-3 text-sm dark:border-slate-600"
                >
                  <p className="font-semibold">{r.credential?.fullName ?? r.target.fullName}</p>
                  {r.credential ? (
                    <p className="mt-1 text-emerald-800 dark:text-emerald-300">
                      Password baru siap diekspor.
                    </p>
                  ) : (
                    <p role="alert" className="mt-1 text-rose-700 dark:text-rose-300">
                      {r.error}
                    </p>
                  )}
                </div>
              ))}
              {busy && (
                <p role="status">
                  Memproses akun {results.length + 1} dari {snapshot.length}…
                </p>
              )}
            </div>
          )}
          {!busy && (
            <TemporaryCredentialExports
              credentials={results.flatMap((r) => (r.credential ? [r.credential] : []))}
            />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              disabled={busy}
              onClick={close}
            >
              {started ? 'Tutup dan hapus tampilan' : 'Batal'}
            </Button>
            {!started && (
              <Button type="button" onClick={() => void issue()}>
                Terbitkan untuk akun terpilih
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
