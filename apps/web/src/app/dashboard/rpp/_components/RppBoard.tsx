'use client';

// =============================================================================
// RppBoard — pipeline RPP (KamilEdu M11)
// GURU: kelola milik sendiri (draft → submit → revisi → submit ulang).
// KS/SA: antrian review (approve / minta revisi + catatan wajib).
// =============================================================================

import { useEffect, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { createRpp, deleteRpp, reviewRpp, submitRpp, updateRpp } from '../actions';
import ModulAjarView from '@/components/academic/ModulAjarView';
import type { ModulAjarBody } from '@/app/dashboard/akademik/_components/guru-types';

export interface RppItem {
  id: string;
  subject: string;
  title: string;
  content?: string | null;
  body?: ModulAjarBody | null;
  fileUrl?: string | null;
  status: 'draft' | 'submitted' | 'approved' | 'revision';
  reviewerName?: string | null;
  reviewNote?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  academicYear: string;
  semester: number;
  updatedAt: string;
  teacher: { id: string; user: { fullName: string } };
  class?: { id: string; name: string } | null;
}

interface Props {
  items: RppItem[];
  total: number;
  isGuru: boolean;
  isReviewer: boolean;
  canDelete: boolean;
  /**
   * W3-4 P2: Role reviewer utama untuk kustomisasi label UI.
   * 'KEPALA_SEKOLAH' / 'SUPER_ADMIN' → tombol 'Setujui' (final approval)
   * 'WAKA_KURIKULUM' → tombol 'Review' / 'Setujui (delegasi KS)'
   * Null/non-reviewer → label default.
   */
  userRole?: string | null;
  defaultAcademicYear?: string;
  defaultSemester?: number;
}

const STATUS_BADGE: Record<RppItem['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Menunggu Review', variant: 'secondary' },
  approved: { label: '✓ Disetujui', variant: 'default' },
  revision: { label: '↩ Perlu Revisi', variant: 'destructive' },
};

export default function RppBoard({ items, total, isGuru, isReviewer, canDelete, userRole, defaultAcademicYear, defaultSemester }: Props) {
  const [statusFilter, setStatusFilter] = useState(isReviewer ? 'submitted' : 'all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RppItem | null>(null);
  const [reviewing, setReviewing] = useState<RppItem | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  // W3-4 P2: Role-aware UI labels.
  // WAKA_KURIKULUM: primary action = Review (catatan + revisi), secondary = approve as KS delegate.
  // KS/SA: primary action = Final Approval.
  const isWaka = userRole === 'WAKA_KURIKULUM';
  const isFinalApprover = userRole === 'KEPALA_SEKOLAH' || userRole === 'SUPER_ADMIN';
  const reviewButtonLabel = isWaka ? 'Review Sekarang' : isFinalApprover ? 'Review & Approve' : 'Review Sekarang';

  const filtered = items.filter((r) => statusFilter === 'all' || r.status === statusFilter);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setError(r.error ?? 'Aksi gagal');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📄 RPP</h1>
          <p className="text-sm text-muted-foreground">
            {total} dokumen · {isReviewer ? 'mode review' : 'milik Anda'}
          </p>
        </div>
        <div className="flex gap-2">
          {isGuru && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ Buat RPP</Button>
          )}
          <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v)}>
            <SelectTrigger className="w-44" aria-label="Filter status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Menunggu Review</SelectItem>
              <SelectItem value="approved">Disetujui</SelectItem>
              <SelectItem value="revision">Perlu Revisi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Tidak ada RPP pada filter ini.
          </CardContent>
        </Card>
      ) : (
        filtered.map((r) => (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">{r.title}</CardTitle>
                <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {r.subject} · {r.academicYear} Smt {r.semester}
                {r.class ? ` · ${r.class.name}` : ''}
                {isReviewer ? ` · oleh ${r.teacher.user.fullName}` : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {r.content && <p className="text-sm whitespace-pre-wrap line-clamp-4">{r.content}</p>}
              {r.fileUrl && (
                <a className="text-sm text-primary underline" href={r.fileUrl} target="_blank" rel="noreferrer">
                  📎 Lampiran RPP
                </a>
              )}
              {r.status === 'revision' && r.reviewNote && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  <strong>Catatan reviewer{r.reviewerName ? ` (${r.reviewerName})` : ''}:</strong> {r.reviewNote}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {isGuru && (r.status === 'draft' || r.status === 'revision') && (
                  <>
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => { setEditing(r); setFormOpen(true); }}>Edit</Button>
                    <Button size="sm" disabled={pending}
                      onClick={() => run(() => submitRpp(r.id))}>Ajukan Review</Button>
                  </>
                )}
                {isReviewer && r.status === 'submitted' && (
                  <Button size="sm" disabled={pending} onClick={() => setReviewing(r)}>
                    {reviewButtonLabel}
                  </Button>
                )}
                {canDelete && (r.status === 'draft' || !isGuru) && (
                  <Button size="sm" variant="destructive" disabled={pending}
                    onClick={() => run(() => deleteRpp(r.id))}>Hapus</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {isGuru && (
        <RppFormDialog open={formOpen} onOpenChange={setFormOpen} rpp={editing} defaultAcademicYear={defaultAcademicYear} defaultSemester={defaultSemester} />
      )}
      <ReviewDialog rpp={reviewing} onClose={() => setReviewing(null)} run={run} pending={pending} userRole={userRole} />
    </div>
  );
}

// ── Form Guru ─────────────────────────────────────────────────────────────────
function RppFormDialog({ open, onOpenChange, rpp, defaultAcademicYear, defaultSemester }: {
  open: boolean; onOpenChange: (o: boolean) => void; rpp: RppItem | null; defaultAcademicYear?: string; defaultSemester?: number;
}) {
  const isEdit = !!rpp;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear || '2026/2027');
  const [semester, setSemester] = useState(String(defaultSemester ?? 1));

  useEffect(() => {
    if (open) {
      setError('');
      setSubject(rpp?.subject ?? '');
      setTitle(rpp?.title ?? '');
      setContent(rpp?.content ?? '');
      setFileUrl(rpp?.fileUrl ?? '');
      setAcademicYear(rpp?.academicYear ?? defaultAcademicYear ?? '2026/2027');
      setSemester(String(rpp?.semester ?? defaultSemester ?? 1));
    }
  }, [open, rpp]);

  const save = async (submit: boolean) => {
    setLoading(true);
    setError('');
    const body: Record<string, unknown> = {
      subject, title,
      content: content.trim() || null,
      fileUrl: fileUrl.trim() || null,
      academicYear, semester: Number(semester),
    };
    let r;
    if (isEdit) {
      r = await updateRpp(rpp!.id, body);
      if (r.success && submit) r = await submitRpp(rpp!.id);
    } else {
      r = await createRpp({ ...body, submit });
    }
    setLoading(false);
    if (r.success) onOpenChange(false);
    else setError(('error' in r && r.error) || 'Gagal menyimpan');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit RPP' : 'Buat RPP'}</DialogTitle>
          <DialogDescription>Isi konten langsung atau tautkan lampiran.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rpp-subject">Mata Pelajaran</Label>
              <Input id="rpp-subject" required minLength={2} value={subject}
                onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rpp-title">Judul</Label>
              <Input id="rpp-title" required minLength={3} value={title}
                onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rpp-ta">Tahun Ajaran</Label>
              <Input id="rpp-ta" required pattern="\d{4}/\d{4}" value={academicYear}
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
          <div className="space-y-1.5">
            <Label htmlFor="rpp-content">Isi RPP</Label>
            <Textarea id="rpp-content" rows={8} value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tujuan pembelajaran, kegiatan, asesmen…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rpp-file">URL Lampiran (opsional)</Label>
            <Input id="rpp-file" type="url" value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://drive.google.com/…" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={loading}
              onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" variant="secondary" disabled={loading}>
              {loading ? 'Menyimpan…' : 'Simpan Draft'}
            </Button>
            <Button type="button" disabled={loading} onClick={() => void save(true)}>
              {loading ? 'Menyimpan…' : 'Simpan & Ajukan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog Review (WAKA/KS/SA) ────────────────────────────────────────────────
function ReviewDialog({ rpp, onClose, run, pending, userRole }: {
  rpp: RppItem | null;
  onClose: () => void;
  run: (fn: () => Promise<{ success: boolean; error?: string }>) => void;
  pending: boolean;
  userRole?: string | null;
}) {
  const [note, setNote] = useState('');
  useEffect(() => { if (rpp) setNote(''); }, [rpp]);

  // W3-4 P2: Role-aware dialog title, button labels, dan hint.
  const isWaka = userRole === 'WAKA_KURIKULUM';
  const isFinalApprover = userRole === 'KEPALA_SEKOLAH' || userRole === 'SUPER_ADMIN';
  const dialogTitle = isFinalApprover
    ? `Final Approval: ${rpp?.title ?? ''}`
    : `Review: ${rpp?.title ?? ''}`;
  const approveLabel = isWaka ? '✓ Setujui (delegasi KS)' : '✓ Setujui';
  const revisionLabel = '↩ Minta Revisi';
  const roleHint = isWaka
    ? 'Anda melakukan review sebagai WAKA_KURIKULUM. KS dapat mendisposisikan approval final kepada Anda.'
    : isFinalApprover
      ? 'Anda melakukan final approval sebagai KEPALA_SEKOLAH/SUPER_ADMIN.'
      : '';

  return (
    <Dialog open={!!rpp} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {rpp?.subject} · {rpp?.teacher.user.fullName} · {rpp?.academicYear} Smt {rpp?.semester}
          </DialogDescription>
        </DialogHeader>
        {roleHint && (
          <div className={`rounded-md px-3 py-2 text-xs ${isWaka ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {roleHint}
          </div>
        )}
        {rpp?.body ? (
          <ModulAjarView body={rpp.body} />
        ) : rpp?.content ? (
          <div className="rounded border bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
            {rpp.content}
          </div>
        ) : null}
        {rpp?.fileUrl && (
          <a className="text-sm text-primary underline" href={rpp.fileUrl} target="_blank" rel="noreferrer">
            📎 Buka lampiran
          </a>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="review-note">Catatan (wajib bila minta revisi)</Label>
          <Textarea id="review-note" rows={3} value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Masukan untuk guru…" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button>
          <Button variant="destructive" disabled={pending || note.trim().length < 3}
            onClick={() => { if (rpp) { run(() => reviewRpp(rpp.id, 'revision', note.trim())); onClose(); } }}>
            {revisionLabel}
          </Button>
          <Button disabled={pending}
            onClick={() => { if (rpp) { run(() => reviewRpp(rpp.id, 'approved', note.trim() || undefined)); onClose(); } }}>
            {approveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
