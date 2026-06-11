'use client';

// =============================================================================
// RaporHub — pipeline rapor (KamilEdu M12): draft → diperiksa → terbit → dibagikan
// Staf: generate + kelola transisi · SISWA/ORTU: lihat rapor terbit + detail
// =============================================================================

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { generateReports, transitionReport, updateReportNotes } from '../actions';

interface SubjectSnapshot {
  subject: string;
  count: number;
  average: number;
  byType: Record<string, number>;
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
  student: { id: string; nis: string; user: { fullName: string } };
  class: { id: string; name: string };
}

interface ClassItem { id: string; name: string; }

interface Props {
  items: ReportItem[];
  total: number;
  classes: ClassItem[];
  canGenerate: boolean;
  canReview: boolean;
  canDistribute: boolean;
  isStaf: boolean;
}

const STATUS_BADGE: Record<ReportItem['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  checked: { label: 'Diperiksa', variant: 'secondary' },
  published: { label: 'Terbit', variant: 'default' },
  distributed: { label: '✓ Dibagikan', variant: 'default' },
};

export default function RaporHub({ items, total, classes, canGenerate, canReview, canDistribute, isStaf }: Props) {
  const [classFilter, setClassFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<ReportItem | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = items.filter((r) =>
    (classFilter === 'all' || r.classId === classFilter) &&
    (statusFilter === 'all' || r.status === statusFilter));

  const run = (fn: () => Promise<{ success: boolean; error?: string; data?: unknown }>, onOk?: (d: unknown) => void) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setError(r.error ?? 'Aksi gagal');
      else onOk?.(r.data);
    });
  };

  const actionsFor = (r: ReportItem) => {
    const acts: { label: string; action: string; show: boolean; variant?: 'outline' | 'destructive' }[] = [
      { label: '✓ Periksa', action: 'check', show: canReview && r.status === 'draft' },
      { label: '↩ Kembalikan', action: 'return', show: canReview && r.status === 'checked', variant: 'outline' },
      { label: '📢 Terbitkan', action: 'publish', show: canReview && r.status === 'checked' },
      { label: '📤 Bagikan', action: 'distribute', show: canDistribute && r.status === 'published' },
    ];
    return acts.filter((a) => a.show);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🎓 Rapor</h1>
          <p className="text-sm text-muted-foreground">
            {total} rapor · alur: Draft → Diperiksa → Terbit → Dibagikan
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canGenerate && (
            <Button onClick={() => setGenOpen(true)}>⚙ Generate Rapor Kelas</Button>
          )}
          {isStaf && classes.length > 0 && (
            <Select value={classFilter} onValueChange={(v: string) => setClassFilter(v)}>
              <SelectTrigger className="w-40" aria-label="Filter kelas"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isStaf && (
            <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
              <SelectTrigger className="w-40" aria-label="Filter status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="checked">Diperiksa</SelectItem>
                <SelectItem value="published">Terbit</SelectItem>
                <SelectItem value="distributed">Dibagikan</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {info && <p className="text-sm text-green-600" role="status">{info}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {isStaf ? 'Belum ada rapor — generate dari nilai yang sudah masuk.' : 'Belum ada rapor terbit.'}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Siswa</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>TA / Smt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <button className="text-left underline-offset-2 hover:underline" onClick={() => setDetail(r)}>
                        {r.student.user.fullName}
                      </button>
                      <span className="text-muted-foreground text-xs"> · {r.student.nis}</span>
                    </TableCell>
                    <TableCell>{r.class.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.academicYear} / {r.semester}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setDetail(r)}>Detail</Button>
                        {actionsFor(r).map((a) => (
                          <Button key={a.action} size="sm" variant={a.variant} disabled={pending}
                            onClick={() => run(() => transitionReport(r.id, a.action))}>
                            {a.label}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <DetailDialog report={detail} onClose={() => setDetail(null)} canEditNotes={canGenerate} run={run} pending={pending} />
      {canGenerate && (
        <GenerateDialog open={genOpen} onOpenChange={setGenOpen} classes={classes}
          onResult={(msg) => setInfo(msg)} />
      )}
    </div>
  );
}

// ── Detail rapor ──────────────────────────────────────────────────────────────
function DetailDialog({ report, onClose, canEditNotes, run, pending }: {
  report: ReportItem | null;
  onClose: () => void;
  canEditNotes: boolean;
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
  pending: boolean;
}) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (report) setNotes(report.notes ?? ''); }, [report]);

  const att = report?.attendance;
  return (
    <Dialog open={!!report} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rapor — {report?.student.user.fullName}</DialogTitle>
          <DialogDescription>
            {report?.class.name} · {report?.academicYear} Semester {report?.semester} ·{' '}
            {report ? STATUS_BADGE[report.status].label : ''}
          </DialogDescription>
        </DialogHeader>

        {report && report.grades.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada nilai untuk periode ini.</p>
        )}
        {report && report.grades.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mapel</TableHead>
                <TableHead className="text-right">Rata-rata</TableHead>
                <TableHead>Per Tipe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.grades.map((g) => (
                <TableRow key={g.subject}>
                  <TableCell>{g.subject}</TableCell>
                  <TableCell className="text-right font-semibold">{g.average}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {Object.entries(g.byType).map(([t, v]) => `${t.toUpperCase()}: ${v}`).join(' · ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {att && (
          <p className="text-sm">
            Kehadiran: <strong>{att.hadir ?? 0}</strong> hadir · {att.izin ?? 0} izin ·{' '}
            {att.sakit ?? 0} sakit · {att.alpha ?? 0} alpa
          </p>
        )}

        {canEditNotes && report?.status === 'draft' ? (
          <div className="space-y-1.5">
            <Label htmlFor="rapor-notes">Catatan Wali Kelas</Label>
            <Textarea id="rapor-notes" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" disabled={pending}
              onClick={() => report && run(() => updateReportNotes(report.id, notes.trim() || null))}>
              Simpan Catatan
            </Button>
          </div>
        ) : report?.notes ? (
          <div className="rounded border bg-gray-50 px-3 py-2 text-sm">
            <strong>Catatan:</strong> {report.notes}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ── Generate massal ───────────────────────────────────────────────────────────
function GenerateDialog({ open, onOpenChange, classes, onResult }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  classes: ClassItem[]; onResult: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [semester, setSemester] = useState('1');

  useEffect(() => {
    if (open) { setError(''); setClassId(classes[0]?.id ?? ''); }
  }, [open, classes]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const r = await generateReports({ classId, academicYear, semester: Number(semester) });
    setLoading(false);
    if (r.success) {
      const d = r.data as { created: number; regenerated: number; skipped: number; totalStudents: number };
      onResult(`Generate selesai: ${d.created} baru · ${d.regenerated} diperbarui · ${d.skipped} dilewati (sudah diperiksa+) dari ${d.totalStudents} siswa.`);
      onOpenChange(false);
    } else setError(('error' in r && r.error) || 'Gagal generate');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Rapor per Kelas</DialogTitle>
          <DialogDescription>
            Snapshot nilai & kehadiran dibuat sebagai draft. Rapor yang sudah
            diperiksa/terbit TIDAK akan ditimpa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Kelas</Label>
            <Select value={classId || undefined} onValueChange={(v: string) => setClassId(v)}>
              <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-ta">Tahun Ajaran</Label>
              <Input id="gen-ta" required pattern="\d{4}/\d{4}" value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select value={semester} onValueChange={(v: string) => setSemester(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ganjil (1)</SelectItem>
                  <SelectItem value="2">Genap (2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={loading}
              onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !classId}>
              {loading ? 'Memproses…' : 'Generate'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
