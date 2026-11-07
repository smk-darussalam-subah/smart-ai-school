'use client';
import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  temporaryCredentialsHtml,
  temporaryCredentialSheets,
  type TemporaryCredential,
} from '@/lib/temporary-credentials';

/** Export only the in-memory result. No API call, reset, storage or analytics. */
export default function TemporaryCredentialExports({
  credentials,
}: {
  credentials: readonly TemporaryCredential[];
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!credentials.length) return null;
  const excel = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const sheets = temporaryCredentialSheets(credentials, location.origin);
      await writeXlsxFile(
        sheets.map((s) => ({
          ...s,
          columns: [
            { width: 28 },
            { width: 20 },
            { width: 24 },
            { width: 24 },
            { width: 48 },
            { width: 32 },
          ],
        })),
      ).toFile('DIIS-akses-sementara.xlsx');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Berkas belum dapat dibuat. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };
  const pdf = () => {
    setError('');
    try {
      const html = temporaryCredentialsHtml(credentials, location.origin);
      const popup = window.open('', '_blank');
      if (!popup) throw Error('Izinkan pop-up untuk membuka dokumen PDF.');
      popup.opener = null;
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      const button = popup.document.createElement('button');
      button.textContent = 'Cetak / Simpan PDF';
      button.type = 'button';
      button.addEventListener('click', () => popup.print());
      popup.document.querySelector('.toolbar')?.append(button);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Dokumen belum dapat dibuka.');
    }
  };
  return (
    <div className="space-y-2 rounded-xl bg-white p-3 text-slate-950 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          disabled={busy}
          onClick={() => void excel()}
        >
          <Download className="h-4 w-4" aria-hidden />
          {busy ? 'Menyiapkan…' : 'Ekspor XLSX'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          onClick={pdf}
        >
          <Printer className="h-4 w-4" aria-hidden />
          Cetak / Simpan PDF
        </Button>
      </div>
      <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
        Unduh sebelum menutup hasil. Mengunduh ulang tidak mengubah password.
      </p>
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
