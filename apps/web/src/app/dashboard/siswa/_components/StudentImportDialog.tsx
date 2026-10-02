'use client';

import { Fragment, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ImportRowEditor, type ImportField } from '@/components/import/ImportRowEditor';
import { provisionStudentsBulkAction } from '../actions';
import {
  STUDENT_IMPORT_MAX_ROWS,
  escapeCsvReportCell,
  getRetryableStudentImportRows,
  prepareStudentRows,
  STUDENT_CSV_COLUMNS,
  STUDENT_IMPORT_COLUMNS,
  toStudentProvisionRow,
  type ImportClassOption,
  type StudentParsedRow,
} from './student-import-csv';
import {
  downloadCsvTemplate,
  downloadImportBlob,
  downloadImportTemplate,
  isConfirmedImportRejection,
  mapImportResults,
  parseImportFile,
  type ImportIssue,
} from '@/lib/operational-import';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ImportClassOption[];
  bulkAction?: typeof provisionStudentsBulkAction;
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

export default function StudentImportDialog({
  open,
  onOpenChange,
  classes,
  bulkAction = provisionStudentsBulkAction,
}: Props) {
  const router = useRouter();
  const [parsed, setParsed] = useState<StudentParsedRow[]>([]);
  const [validationDirty, setValidationDirty] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dataCount, setDataCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<RowResult[]>([]);
  const [parseIssues, setParseIssues] = useState<ImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [ambiguous, setAmbiguous] = useState(false);
  const generation = useRef(0);
  const submittingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const fields: ImportField[] = [
    { key: 'nis', label: 'NIS' },
    { key: 'namaSiswa', label: 'Nama siswa' },
    {
      key: 'jenisKelamin',
      label: 'Jenis kelamin',
      options: [
        { value: 'L', label: 'Laki-laki' },
        { value: 'P', label: 'Perempuan' },
      ],
    },
    {
      key: 'kelas',
      label: 'Kelas',
      options: classes.map((item) => ({ value: item.name, label: item.name })),
    },
    { key: 'tanggalMasuk', label: 'Tanggal masuk (YYYY-MM-DD)' },
    {
      key: 'status',
      label: 'Status',
      options: ['active', 'inactive', 'graduated', 'dropped'].map((value) => ({
        value,
        label: value,
      })),
    },
    { key: 'namaWali', label: 'Nama wali' },
    { key: 'teleponWali', label: 'Telepon wali' },
    { key: 'emailWali', label: 'Email wali' },
    {
      key: 'reuseWaliByPhone',
      label: 'Pakai wali yang ada',
      options: [
        { value: 'true', label: 'Ya' },
        { value: 'false', label: 'Tidak' },
      ],
    },
    {
      key: 'consentConfirmed',
      label: 'Persetujuan data',
      options: [
        { value: 'true', label: 'Dikonfirmasi' },
        { value: 'false', label: 'Belum' },
      ],
    },
  ];

  const invalidCount = parsed.filter((row) => row.error).length;
  const validCount = parsed.length - invalidCount;
  const okCount = results.filter((row) => row.status === 'ok').length;
  const failCount = results.filter((row) => row.status === 'error').length;
  const retryableRows =
    results.length === 0
      ? parsed.map((row, index) => ({ row, index }))
      : getRetryableStudentImportRows(parsed, results).filter(({ index }) =>
          results.some((result) => result.sourceIndex === index && result.status === 'error'),
        );
  const phase =
    parsed.length === 0
      ? 'Pilih file'
      : submitting
        ? 'Proses'
        : results.length > 0
          ? 'Hasil'
          : 'Validasi';

  const reset = () => {
    generation.current++;
    setParsed([]);
    setFileName('');
    setDataCount(0);
    setSubmitting(false);
    setError('');
    setResults([]);
    setParseIssues([]);
    setParsing(false);
    setAmbiguous(false);
    setValidationDirty(false);
    setEditingIndex(null);
    setConfirmOpen(false);
  };

  const handleFile = async (file: File) => {
    const current = ++generation.current;
    setFileName(file.name);
    setResults([]);
    setParsed([]);
    setDataCount(0);
    setParsing(true);
    setParseIssues([]);
    setAmbiguous(false);
    setValidationDirty(false);
    setEditingIndex(null);
    setConfirmOpen(false);
    setError('');
    const result = await parseImportFile(file, STUDENT_IMPORT_COLUMNS, 'Siswa');
    if (current !== generation.current) return;
    setDataCount(result.dataCount ?? result.rows.length);
    setParsed(prepareStudentRows(result.rows, classes));
    setParseIssues(result.errors);
    setParsing(false);
    if (result.errors.length) requestAnimationFrame(() => errorRef.current?.focus());
  };

  const editRow = (index: number, key: string, value: string) => {
    setParsed((rows) =>
      rows.map((row, i) => (i === index ? { ...row, raw: { ...row.raw, [key]: value } } : row)),
    );
    setValidationDirty(true);
  };

  const revalidate = () => {
    const checked = prepareStudentRows(
      parsed.map(({ raw, sourceRow }) => ({ raw, sourceRow })),
      classes,
    );
    setParsed(checked);
    setValidationDirty(false);
    if (checked.some((row) => row.error)) requestAnimationFrame(() => errorRef.current?.focus());
  };

  const submit = async () => {
    if (
      submittingRef.current ||
      ambiguous ||
      parsing ||
      validationDirty ||
      parseIssues.length ||
      invalidCount ||
      !retryableRows.length ||
      parsed.length > STUDENT_IMPORT_MAX_ROWS
    )
      return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const payload = retryableRows.map((item) => toStudentProvisionRow(item.row.raw, classes));
      const response = await bulkAction(payload);
      if (response.error || !response.data) {
        if (isConfirmedImportRejection(response.status)) {
          setError(
            'Permintaan ditolak sebelum impor diproses. Periksa izin atau data, lalu coba lagi dari preview ini.',
          );
        } else {
          setAmbiguous(true);
          setError(
            'Hasil impor belum pasti. Periksa akun yang mungkin sudah dibuat, lalu reset hanya setelah rekonsiliasi.',
          );
        }
        return;
      }
      const chunkResults = (response.data.results ?? []) as BulkRowResult[];
      const mapped = mapImportResults(chunkResults, retryableRows);
      if (!mapped) {
        setAmbiguous(true);
        setError('Hasil API tidak lengkap. Periksa data siswa sebelum mencoba lagi.');
        return;
      }
      setResults((previous) => [
        ...previous.filter((old) => !mapped.some((item) => item.sourceIndex === old.sourceIndex)),
        ...mapped,
      ]);
      router.refresh();
    } catch {
      setAmbiguous(true);
      setError(
        'Hasil impor belum pasti. Periksa akun yang mungkin sudah dibuat, lalu reset hanya setelah rekonsiliasi.',
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadImportTemplate(STUDENT_IMPORT_COLUMNS, 'Siswa', 'template-import-siswa.xlsx');
    } catch {
      setError('Template XLSX gagal dibuat. Coba unduh ulang.');
    }
  };

  const exportResults = () => {
    const header = 'row,nis,namaSiswa,status,error';
    const lines = results.map((result) => {
      const raw = parsed[result.sourceIndex]?.raw ?? {};
      return [
        String(parsed[result.sourceIndex]?.sourceRow ?? ''),
        raw.nis ?? '',
        raw.namaSiswa ?? '',
        result.status,
        result.error ?? '',
      ]
        .map((cell) => escapeCsvReportCell(String(cell)))
        .join(',');
    });
    const blob = new Blob([[header, ...lines].join('\n'), '\n'], {
      type: 'text/csv;charset=utf-8;',
    });
    downloadImportBlob(blob, 'hasil-import-siswa.csv');
  };

  const exportCredentials = () => {
    const header = 'row,nis,namaSiswa,username,tempPassword';
    const lines = results.flatMap((result) => {
      const raw = parsed[result.sourceIndex]?.raw ?? {};
      return (result.tempCredentials ?? []).map((credential) =>
        [
          String(parsed[result.sourceIndex]?.sourceRow ?? ''),
          raw.nis ?? '',
          raw.namaSiswa ?? '',
          credential.username,
          credential.tempPassword,
        ]
          .map((cell) => escapeCsvReportCell(String(cell)))
          .join(','),
      );
    });
    const blob = new Blob([[header, ...lines].join('\n'), '\n'], {
      type: 'text/csv;charset=utf-8;',
    });
    downloadImportBlob(blob, 'kredensial-import-siswa.csv');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-6xl overflow-x-hidden overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <UploadCloud className="h-5 w-5" />
            </span>
            Import Kolektif Siswa
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            XLSX atau CSV, maksimal {STUDENT_IMPORT_MAX_ROWS} baris per file.
          </p>
        </DialogHeader>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-3 rounded-md border bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Kontrol Import</p>
              <p className="text-xs text-muted-foreground">
                {fileName || 'Belum ada file dipilih'}
              </p>
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
              accept=".xlsx,.csv"
              disabled={submitting || parsing}
              aria-label="Pilih file XLSX atau CSV siswa"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = '';
              }}
            />
            {parsing && (
              <p role="status" className="text-sm">
                Membaca file…
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold">{dataCount}</div>
                Total
              </div>
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold text-emerald-700">
                  {validationDirty ? '—' : validCount}
                </div>
                Valid
              </div>
              <div className="rounded-md border bg-white p-2">
                <div className="text-lg font-semibold text-red-700">
                  {validationDirty ? '—' : invalidCount}
                </div>
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
            <Button
              variant="outline"
              className="min-h-11 w-full justify-start gap-2"
              onClick={() => void downloadTemplate()}
            >
              <Download className="h-4 w-4" />
              Template XLSX
            </Button>
            <Button
              variant="outline"
              className="min-h-11 w-full justify-start gap-2"
              onClick={() => downloadCsvTemplate(STUDENT_CSV_COLUMNS, 'template-import-siswa.csv')}
            >
              <Download className="h-4 w-4" /> Template CSV
            </Button>
            {retryableRows.length > 0 && (
              <Button
                className="min-h-11 w-full justify-start gap-2 bg-smk-blue hover:bg-primary-700"
                disabled={
                  submitting ||
                  parsing ||
                  ambiguous ||
                  validationDirty ||
                  parseIssues.length > 0 ||
                  invalidCount > 0
                }
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                {results.length > 0
                  ? `Coba lagi ${retryableRows.length} gagal`
                  : `Impor ${validCount} siswa`}
              </Button>
            )}
            {results.length > 0 && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={exportResults}
              >
                <Download className="h-4 w-4" />
                Export Hasil
              </Button>
            )}
            {results.some((result) => (result.tempCredentials ?? []).length > 0) && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={exportCredentials}
              >
                <Download className="h-4 w-4" />
                Export Kredensial
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-start gap-2"
              disabled={submitting}
              onClick={reset}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            {validationDirty && (
              <Button variant="outline" className="min-h-11 w-full" onClick={revalidate}>
                Validasi Ulang
              </Button>
            )}
          </aside>

          <div className="min-w-0 space-y-3">
            {(error || parseIssues.length > 0 || (!validationDirty && invalidCount > 0)) && (
              <div
                ref={errorRef}
                tabIndex={-1}
                role="alert"
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
                {parseIssues.length > 0 && (
                  <ul>
                    {parseIssues.map((issue, index) => (
                      <li key={index}>
                        {issue.sourceRow ? `Baris ${issue.sourceRow}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}
                {!validationDirty && invalidCount > 0 && (
                  <span>{invalidCount} baris perlu diperbaiki sebelum impor.</span>
                )}
              </div>
            )}
            {validationDirty && (
              <p role="status" className="text-sm font-medium text-amber-800">
                Perubahan belum divalidasi. Pilih Validasi Ulang sebelum impor.
              </p>
            )}
            <div className="min-w-0 rounded-md border shadow-sm">
              <div className="max-h-[58vh] overflow-auto">
                <Table className="min-w-[720px]">
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
                          Pilih file XLSX atau CSV untuk melihat preview.
                        </TableCell>
                      </TableRow>
                    ) : (
                      parsed.map((row, index) => {
                        const result = results.find((item) => item.sourceIndex === index);
                        const state = validationDirty
                          ? 'dirty'
                          : (result?.status ?? (row.error ? 'error' : 'ready'));
                        return (
                          <Fragment key={row.sourceRow}>
                            <TableRow>
                              <TableCell className="font-mono text-xs">{row.sourceRow}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {row.raw.nis || '-'}
                              </TableCell>
                              <TableCell>{row.raw.namaSiswa || '-'}</TableCell>
                              <TableCell>{row.raw.kelas || '-'}</TableCell>
                              <TableCell>{row.raw.namaWali || '-'}</TableCell>
                              <TableCell>
                                {state === 'ok' ? (
                                  <Badge className="gap-1 bg-emerald-600">
                                    <CheckCircle2 className="h-3 w-3" /> Berhasil
                                  </Badge>
                                ) : state === 'error' ? (
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertCircle className="h-3 w-3" /> Error
                                  </Badge>
                                ) : state === 'dirty' ? (
                                  <Badge variant="outline">Belum divalidasi</Badge>
                                ) : (
                                  <Badge variant="outline">Siap</Badge>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                                {validationDirty
                                  ? 'Periksa ulang seluruh file'
                                  : (result?.error ?? row.error ?? '-')}
                                {results.length === 0 && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="ml-2 min-h-11"
                                    aria-expanded={editingIndex === index}
                                    onClick={() =>
                                      setEditingIndex(editingIndex === index ? null : index)
                                    }
                                  >
                                    Ubah
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {editingIndex === index && results.length === 0 && (
                              <TableRow className="bg-slate-50">
                                <TableCell colSpan={7} className="p-0">
                                  <ImportRowEditor
                                    sourceRow={row.sourceRow}
                                    raw={row.raw}
                                    fields={fields}
                                    onChange={(key, value) => editRow(index, key, value)}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Periksa data sebelum diimpor"
        description="Pastikan data yang diinput sudah benar dan sesuai. Apakah data yang Anda input sudah sesuai?"
        cancelLabel="Cek Lagi"
        confirmLabel="Submit"
        variant="info"
        onConfirm={submit}
      />
    </Dialog>
  );
}
