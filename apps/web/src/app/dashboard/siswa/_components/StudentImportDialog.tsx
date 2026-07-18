'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, RotateCcw, UploadCloud } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { provisionStudentsBulkAction } from '../actions';
import {
  STUDENT_IMPORT_CHUNK_SIZE,
  STUDENT_IMPORT_MAX_ROWS,
  STUDENT_TEMPLATE_BODY,
  STUDENT_TEMPLATE_HEADER,
  countStudentCsvRows,
  escapeCsvReportCell,
  getRetryableStudentImportRows,
  isStudentImportOverLimit,
  parseStudentImport,
  toStudentProvisionRow,
  type ImportClassOption,
  type StudentParsedRow,
} from './student-import-csv';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ImportClassOption[];
}

interface BulkRowResult {
  index: number;
  status: 'ok' | 'error';
  error?: string;
  user?: { fullName: string; email: string };
  tempCredentials?: Array<{ username: string; tempPassword: string }>;
}

interface RowResult extends BulkRowResult {
  sourceIndex: number;
}

export default function StudentImportDialog({ open, onOpenChange, classes }: Props) {
  const router = useRouter();
  const [parsed, setParsed] = useState<StudentParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileWarning, setFileWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<RowResult[]>([]);

  const invalidCount = parsed.filter((row) => row.error).length;
  const validCount = parsed.length - invalidCount;
  const okCount = results.filter((row) => row.status === 'ok').length;
  const failCount = results.filter((row) => row.status === 'error').length;
  const retryableRows = getRetryableStudentImportRows(parsed, results);
  const phase = parsed.length === 0
    ? 'Pilih file'
    : submitting
      ? 'Proses'
      : results.length > 0
        ? 'Hasil'
        : 'Validasi';

  const reset = () => {
    setParsed([]);
    setFileName('');
    setFileWarning('');
    setSubmitting(false);
    setError('');
    setResults([]);
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setResults([]);
    setError('');
    setFileWarning('');
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rawCount = countStudentCsvRows(text);
      if (isStudentImportOverLimit(text)) {
        setError(`File berisi ${rawCount} baris. Maksimal ${STUDENT_IMPORT_MAX_ROWS} baris per import; pecah file menjadi beberapa batch.`);
        setParsed([]);
        return;
      }
      setParsed(parseStudentImport(text, classes));
    };
    reader.readAsText(file);
  };

  const submit = async () => {
    setSubmitting(true);
    setError('');
    const validRows = getRetryableStudentImportRows(parsed, results);
    const nextResults: RowResult[] = [...results];

    for (let i = 0; i < validRows.length; i += STUDENT_IMPORT_CHUNK_SIZE) {
      const chunk = validRows.slice(i, i + STUDENT_IMPORT_CHUNK_SIZE);
      const payload = chunk.map((item) => toStudentProvisionRow(item.row.raw, classes));
      const response = await provisionStudentsBulkAction(payload);
      if (response.error) {
        setError(response.error);
        setSubmitting(false);
        return;
      }
      const chunkResults = (response.data?.results ?? []) as BulkRowResult[];
      chunkResults.forEach((result) => {
        const sourceIndex = chunk[result.index]?.index ?? result.index;
        const resultIndex = nextResults.findIndex((item) => item.sourceIndex === sourceIndex);
        const nextResult = { ...result, sourceIndex };
        if (resultIndex >= 0) nextResults[resultIndex] = nextResult;
        else nextResults.push(nextResult);
      });
      setResults([...nextResults]);
    }

    setSubmitting(false);
    router.refresh();
  };

  const downloadTemplate = () => {
    const blob = new Blob([`${STUDENT_TEMPLATE_HEADER}\n${STUDENT_TEMPLATE_BODY}\n`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-import-siswa.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportResults = () => {
    const header = 'row,nis,namaSiswa,status,error';
    const lines = results.map((result) => {
      const raw = parsed[result.sourceIndex]?.raw ?? {};
      return [
        String(result.sourceIndex + 2),
        raw.nis ?? '',
        raw.namaSiswa ?? '',
        result.status,
        result.error ?? '',
      ].map((cell) => escapeCsvReportCell(String(cell))).join(',');
    });
    const blob = new Blob([[header, ...lines].join('\n'), '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hasil-import-siswa.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCredentials = () => {
    const header = 'row,nis,namaSiswa,username,tempPassword';
    const lines = results.flatMap((result) => {
      const raw = parsed[result.sourceIndex]?.raw ?? {};
      return (result.tempCredentials ?? []).map((credential) => [
        String(result.sourceIndex + 2),
        raw.nis ?? '',
        raw.namaSiswa ?? '',
        credential.username,
        credential.tempPassword,
      ].map((cell) => escapeCsvReportCell(String(cell))).join(','));
    });
    const blob = new Blob([[header, ...lines].join('\n'), '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kredensial-import-siswa.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <UploadCloud className="h-5 w-5" />
            </span>
            Import Kolektif Siswa
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Maksimal {STUDENT_IMPORT_MAX_ROWS} baris per file. Submit dikirim bertahap {STUDENT_IMPORT_CHUNK_SIZE} baris per request.
          </p>
        </DialogHeader>

        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-3 rounded-md border bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Kontrol Import</p>
              <p className="text-xs text-muted-foreground">{fileName || 'Belum ada file dipilih'}</p>
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-semibold">
              {['Pilih file', 'Validasi', 'Proses', 'Hasil'].map((item) => (
                <div
                  key={item}
                  className={`rounded-md border px-2 py-1 ${phase === item ? 'border-smk-blue bg-blue-50 text-smk-blue' : 'bg-white text-muted-foreground'}`}
                >
                  {item}
                </div>
              ))}
            </div>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold">{parsed.length}</div>
                Total
              </div>
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold text-emerald-700">{validCount}</div>
                Valid
              </div>
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold text-red-700">{invalidCount}</div>
                Error
              </div>
            </div>
            {results.length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-md border bg-white p-2">
                  <div className="text-lg font-semibold text-emerald-700">{okCount}</div>
                  Berhasil
                </div>
                <div className="rounded-md border bg-white p-2">
                  <div className="text-lg font-semibold text-red-700">{failCount}</div>
                  Gagal
                </div>
              </div>
            )}
            <Button variant="outline" className="w-full justify-start gap-2" onClick={downloadTemplate}>
              <Download className="h-4 w-4" />
              Unduh Template
            </Button>
            <Button
              className="w-full justify-start gap-2 bg-smk-blue hover:bg-primary-700"
              disabled={submitting || retryableRows.length === 0}
              onClick={submit}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {results.length > 0 ? `Lanjutkan ${retryableRows.length} Baris` : 'Submit Baris Valid'}
            </Button>
            {results.length > 0 && (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={exportResults}>
                <Download className="h-4 w-4" />
                Export Hasil
              </Button>
            )}
            {results.some((result) => (result.tempCredentials ?? []).length > 0) && (
              <Button variant="outline" className="w-full justify-start gap-2" onClick={exportCredentials}>
                <Download className="h-4 w-4" />
                Export Kredensial
              </Button>
            )}
            <Button variant="ghost" className="w-full justify-start gap-2" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </aside>

          <div className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {fileWarning && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {fileWarning}
              </div>
            )}

            <div className="rounded-md border shadow-sm">
              <div className="max-h-[58vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Wali</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                          Pilih file CSV untuk melihat preview.
                        </TableCell>
                      </TableRow>
                    ) : parsed.map((row, index) => {
                      const result = results.find((item) => item.sourceIndex === index);
                      const state = result?.status ?? (row.error ? 'error' : 'ready');
                      return (
                        <TableRow key={`${row.raw.nis}-${index}`}>
                          <TableCell className="font-mono text-xs">{index + 2}</TableCell>
                          <TableCell className="font-mono text-sm">{row.raw.nis || '-'}</TableCell>
                          <TableCell>{row.raw.namaSiswa || '-'}</TableCell>
                          <TableCell>{row.raw.kelas || '-'}</TableCell>
                          <TableCell>{row.raw.namaWali || '-'}</TableCell>
                          <TableCell>
                            {state === 'ok' ? (
                              <Badge className="gap-1 bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> Berhasil</Badge>
                            ) : state === 'error' ? (
                              <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>
                            ) : (
                              <Badge variant="outline">Siap</Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                            {result?.error ?? row.error ?? '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
