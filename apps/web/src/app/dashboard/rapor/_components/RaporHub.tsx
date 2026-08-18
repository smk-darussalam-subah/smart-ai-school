'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Check, Eye, FileCheck2, LoaderCircle, RotateCcw, Search, Send, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { Textarea } from '@/components/ui/textarea';
import { useQueryState } from '@/hooks/use-query-state';
import { generateReports, recoverReport, transitionReport, updateReportNotes } from '../actions';

interface SubjectSnapshot {
  subject: string;
  count: number;
  average: number;
  byType: Record<string, number>;
  kktp?: number | null;
  kktpProvenance?: string | null;
}
export interface ReportItem {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  semester: number;
  status: 'draft' | 'checked' | 'published' | 'distributed';
  grades: SubjectSnapshot[];
  attendance?: Record<string, number> | null;
  notes?: string | null;
  generatedAt: string;
  updatedAt: string;
  checkedAt?: string | null;
  checkedBy?: string | null;
  checkedByName?: string | null;
  returnedAt?: string | null;
  returnedBy?: string | null;
  returnedByName?: string | null;
  returnReason?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  publishedByName?: string | null;
  distributedAt?: string | null;
  distributedBy?: string | null;
  distributedByName?: string | null;
  canManageDraft: boolean;
  statusEvents?: Array<{
    id: string; action: string; fromStatus: string; toStatus: string;
    actorName: string; reason?: string | null; incidentReference?: string | null; createdAt: string;
  }>;
  student: { id: string; nis: string; user: { fullName: string } };
  class: { id: string; name: string };
}
interface ClassItem { id: string; name: string; canManageDraft: boolean }
interface Props {
  items: ReportItem[];
  total: number;
  classes: ClassItem[];
  query: { page: number; limit: number; classId: string; studentId?: string; status: string; search: string };
  canGenerate: boolean;
  canCheck: boolean;
  canPublish: boolean;
  canDistribute: boolean;
  canRecover: boolean;
  isOperational: boolean;
  defaultAcademicYear: string;
  defaultSemester: number;
}

const STATUS = {
  draft: { label: 'Draft wali kelas', variant: 'outline' as const },
  checked: { label: 'Diperiksa Waka', variant: 'secondary' as const },
  published: { label: 'Diterbitkan KS', variant: 'default' as const },
  distributed: { label: 'Didistribusikan', variant: 'default' as const },
};

export default function RaporHub(props: Props) {
  const { items, total, classes, query, canGenerate, canCheck, canPublish, canDistribute, canRecover, isOperational } = props;
  const { setParams, isPending } = useQueryState();
  const [search, setSearch] = useState(query.search);
  const [detail, setDetail] = useState<ReportItem | null>(null);
  const [returning, setReturning] = useState<ReportItem | null>(null);
  const [confirming, setConfirming] = useState<{ report: ReportItem; action: 'publish' | 'distribute' } | null>(null);
  const [recovering, setRecovering] = useState<ReportItem | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, startTransition] = useTransition();

  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => setParams({ search: search || null }), 350);
    return () => clearTimeout(timer);
  }, [query.search, search, setParams]);

  const run = (action: () => Promise<{ success: boolean; error?: string; data?: unknown }>, onSuccess?: () => void) => {
    setError('');
    setInfo('');
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Aksi gagal diproses');
      else onSuccess?.();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rapor</h1>
          <p className="text-sm text-muted-foreground">Wali kelas menyiapkan draft, Waka memeriksa, KS menerbitkan, lalu TU mendistribusikan.</p>
        </div>
        {canGenerate && <Button onClick={() => setGenerateOpen(true)}><FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" />Siapkan draft kelas</Button>}
      </div>

      {canRecover && (
        <div className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><b>Mode bantuan Super Admin.</b> Penerbitan, distribusi, dan pemulihan akan tercatat atas identitas Anda.</p>
        </div>
      )}

      {isOperational && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_200px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS" className="pl-9" aria-label="Cari rapor" />
          </div>
          <Select value={query.classId || 'all'} onValueChange={(value: string) => setParams({ classId: value })}>
            <SelectTrigger aria-label="Filter kelas"><SelectValue placeholder="Semua kelas" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua kelas</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={query.status || 'all'} onValueChange={(value: string) => setParams({ status: value })}>
            <SelectTrigger aria-label="Filter status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua status</SelectItem>{Object.entries(STATUS).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {info && <p className="text-sm text-emerald-700" role="status">{info}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {items.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{isOperational ? 'Belum ada rapor pada filter ini.' : 'Belum ada rapor yang dapat ditampilkan.'}</CardContent></Card>
      ) : (
        <div className={`overflow-x-auto rounded-md border transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
          <Table>
            <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Kelas</TableHead><TableHead>Periode</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => (
              <TableRow key={item.id}>
                <TableCell><div className="font-medium">{item.student.user.fullName}</div><div className="text-xs text-muted-foreground">NIS {item.student.nis}</div></TableCell>
                <TableCell>{item.class.name}</TableCell>
                <TableCell className="whitespace-nowrap">{item.academicYear} / {item.semester}</TableCell>
                <TableCell><Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge></TableCell>
                <TableCell><div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetail(item)}><Eye className="mr-2 h-4 w-4" aria-hidden="true" />Detail</Button>
                  {canCheck && item.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => run(() => transitionReport(item.id, 'check'))}><Check className="mr-2 h-4 w-4" aria-hidden="true" />Tandai diperiksa</Button>}
                  {canCheck && item.status === 'checked' && <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturning(item)}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Kembalikan</Button>}
                   {canPublish && item.status === 'checked' && <Button size="sm" disabled={busy} onClick={() => setConfirming({ report: item, action: 'publish' })}><Send className="mr-2 h-4 w-4" aria-hidden="true" />Terbitkan</Button>}
                   {canDistribute && item.status === 'published' && <Button size="sm" disabled={busy} onClick={() => setConfirming({ report: item, action: 'distribute' })}><Send className="mr-2 h-4 w-4" aria-hidden="true" />Distribusikan</Button>}
                  {canRecover && item.status !== 'draft' && <Button size="sm" variant="outline" disabled={busy} onClick={() => setRecovering(item)}><ShieldAlert className="mr-2 h-4 w-4" aria-hidden="true" />Pemulihan</Button>}
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
      )}

      <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
      <ReportDetail report={detail} pending={busy} onClose={() => setDetail(null)} run={run} />
      <ReturnDialog report={returning} pending={busy} error={error} onClose={() => setReturning(null)} run={run} />
      <ConfirmTransitionDialog value={confirming} pending={busy} error={error} onClose={() => setConfirming(null)} run={run} />
      <RecoveryDialog report={recovering} pending={busy} error={error} onClose={() => setRecovering(null)} run={run} />
      {canGenerate && <GenerateDialog {...props} open={generateOpen} onOpenChange={setGenerateOpen} onResult={setInfo} />}
    </div>
  );
}

function ReportDetail({ report, pending, onClose, run }: {
  report: ReportItem | null; pending: boolean; onClose: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void;
}) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (report) setNotes(report.notes ?? ''); }, [report]);
  const attendance = report?.attendance;
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && onClose()}>
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>Rapor {report?.student.user.fullName}</DialogTitle><DialogDescription>{report?.class.name} | {report?.academicYear} Semester {report?.semester}</DialogDescription></DialogHeader>
      {report && report.grades.length > 0 ? <div className="overflow-x-auto rounded border"><Table><TableHeader><TableRow><TableHead>Mata pelajaran</TableHead><TableHead className="text-right">Nilai akhir</TableHead><TableHead>KKTP snapshot</TableHead><TableHead>Komponen</TableHead></TableRow></TableHeader><TableBody>{report.grades.map((grade) => <TableRow key={grade.subject}><TableCell>{grade.subject}</TableCell><TableCell className="text-right font-semibold">{grade.average}</TableCell><TableCell className="text-xs">{typeof grade.kktp === 'number' ? `${grade.kktp} (${grade.kktpProvenance ?? 'snapshot'})` : 'Belum tersedia'}</TableCell><TableCell className="text-xs text-muted-foreground">{Object.entries(grade.byType).map(([type, value]) => `${type.toUpperCase()}: ${value}`).join(' | ')}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="text-sm text-muted-foreground">Belum ada nilai pada snapshot ini.</p>}
      {attendance && <p className="text-sm">Kehadiran: <b>{attendance.hadir ?? 0}</b> hadir | {attendance.izin ?? 0} izin | {attendance.sakit ?? 0} sakit | {attendance.alpha ?? 0} alpa</p>}
      {report?.canManageDraft && report.status === 'draft' ? <div className="space-y-2"><Label htmlFor="report-notes">Catatan wali kelas</Label><Textarea id="report-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /><Button size="sm" disabled={pending} onClick={() => run(() => updateReportNotes(report.id, notes.trim() || null, report.updatedAt), onClose)}>Simpan catatan</Button></div> : report?.notes ? <p className="rounded border bg-muted/30 p-3 text-sm"><b>Catatan wali kelas:</b> {report.notes}</p> : null}
      {report?.returnReason && <p className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><b>Alasan pengembalian terakhir:</b> {report.returnReason}</p>}
      {report && <div className="border-t pt-3 text-xs text-muted-foreground"><p>Diperiksa oleh: {report.checkedByName ?? '-'}</p>{report.returnedAt && <p>Dikembalikan oleh: {report.returnedByName ?? '-'}</p>}<p>Diterbitkan oleh: {report.publishedByName ?? '-'}</p><p>Didistribusikan oleh: {report.distributedByName ?? '-'}</p></div>}
      {report?.statusEvents && report.statusEvents.length > 0 && <section className="space-y-2 border-t pt-3" aria-label="Riwayat status rapor"><h3 className="text-sm font-semibold">Riwayat status</h3>{report.statusEvents.map((event) => <div key={event.id} className="text-xs text-muted-foreground"><p><b>{event.actorName}</b>: {event.fromStatus} ke {event.toStatus}</p><p>{new Date(event.createdAt).toLocaleString('id-ID')}{event.incidentReference ? ` | Insiden ${event.incidentReference}` : ''}{event.reason ? ` | ${event.reason}` : ''}</p></div>)}</section>}
    </DialogContent>
  </Dialog>;
}

function ReturnDialog({ report, pending, error, onClose, run }: { report: ReportItem | null; pending: boolean; error: string; onClose: () => void; run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (report) setReason(''); }, [report]);
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Kembalikan ke wali kelas</DialogTitle><DialogDescription>Jelaskan perbaikan yang diperlukan agar wali kelas dapat menindaklanjuti tanpa menebak.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="return-reason">Alasan pengembalian</Label><Textarea id="return-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => report && run(() => transitionReport(report.id, 'return', reason.trim()), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Kembalikan</Button></div></DialogContent></Dialog>;
}

function RecoveryDialog({ report, pending, error, onClose, run }: { report: ReportItem | null; pending: boolean; error: string; onClose: () => void; run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void }) {
  const [reason, setReason] = useState('');
  const [incidentReference, setIncidentReference] = useState('');
  useEffect(() => {
    if (report) {
      setReason('');
      setIncidentReference('');
    }
  }, [report]);
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Pemulihan administratif rapor</DialogTitle><DialogDescription>Jalur ini hanya untuk insiden operasional. Rapor akan dikembalikan ke draft dan seluruh tahapan persetujuan harus dijalankan ulang.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="incident-reference">Referensi insiden</Label><Input id="incident-reference" value={incidentReference} onChange={(event) => setIncidentReference(event.target.value)} placeholder="Contoh: INC-2026-0042" maxLength={100} /></div><div className="space-y-2"><Label htmlFor="recovery-reason">Alasan pemulihan</Label><Textarea id="recovery-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan insiden dan alasan dokumen perlu dibuka kembali." maxLength={2000} /></div></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button variant="destructive" disabled={pending || reason.trim().length < 10 || incidentReference.trim().length < 3} onClick={() => report && run(() => recoverReport(report.id, reason.trim(), incidentReference.trim()), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Pulihkan ke draft</Button></div></DialogContent></Dialog>;
}

function ConfirmTransitionDialog({ value, pending, error, onClose, run }: {
  value: { report: ReportItem; action: 'publish' | 'distribute' } | null;
  pending: boolean;
  error: string;
  onClose: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void;
}) {
  const publishing = value?.action === 'publish';
  return <Dialog open={!!value} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{publishing ? 'Terbitkan rapor?' : 'Distribusikan rapor?'}</DialogTitle><DialogDescription>{value ? `${value.report.student.user.fullName} | ${value.report.class.name} | ${value.report.academicYear} Semester ${value.report.semester}` : ''}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">{publishing ? 'Rapor akan dikunci sebagai dokumen terbit dan siap didistribusikan oleh petugas.' : 'Rapor akan langsung dapat dilihat oleh siswa dan orang tua. Pastikan identitas, nilai, kehadiran, dan catatan sudah benar.'}</p>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button disabled={pending} onClick={() => value && run(() => transitionReport(value.report.id, value.action), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{publishing ? 'Ya, terbitkan' : 'Ya, distribusikan'}</Button></div></DialogContent></Dialog>;
}

function GenerateDialog({ open, onOpenChange, classes, defaultAcademicYear, defaultSemester, onResult }: Props & { open: boolean; onOpenChange: (open: boolean) => void; onResult: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const manageableClasses = useMemo(() => classes.filter((item) => item.canManageDraft), [classes]);
  useEffect(() => { if (open) { setError(''); setClassId(manageableClasses[0]?.id ?? ''); } }, [manageableClasses, open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    const result = await generateReports({ classId, academicYear: defaultAcademicYear, semester: defaultSemester }); setLoading(false);
    if (!result.success) { setError(result.error ?? 'Draft rapor gagal disiapkan'); return; }
    const data = result.data as { generated: number; refreshed: number; skipped: number; totalStudents: number };
    onResult(`${data.generated} draft baru, ${data.refreshed} draft diperbarui, dan ${data.skipped} rapor terkunci dilewati dari ${data.totalStudents} siswa.`); onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Siapkan draft rapor kelas</DialogTitle><DialogDescription>Snapshot nilai, KKTP, dan kehadiran dibuat hanya untuk periode aktif. Rapor yang telah diperiksa tidak akan ditimpa.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label>Kelas wali</Label><Select value={classId || undefined} onValueChange={setClassId}><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{manageableClasses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-sm"><div><div className="text-xs font-medium text-muted-foreground">Tahun ajaran aktif</div><div className="font-semibold">{defaultAcademicYear}</div></div><div><div className="text-xs font-medium text-muted-foreground">Semester aktif</div><div className="font-semibold">{defaultSemester === 1 ? 'Ganjil' : 'Genap'}</div></div></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={loading || !classId}>{loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Siapkan draft</Button></div></form></DialogContent></Dialog>;
}
