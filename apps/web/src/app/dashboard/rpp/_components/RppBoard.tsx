'use client';

import { useEffect, useState, useTransition } from 'react';
import { Archive, Check, Eye, LoaderCircle, RotateCcw, Search, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { Textarea } from '@/components/ui/textarea';
import ModulAjarView from '@/components/academic/ModulAjarView';
import type { ModulAjarBody } from '@/app/dashboard/akademik/_components/guru-types';
import { useQueryState } from '@/hooks/use-query-state';
import { archiveRpp, reviewRpp } from '../actions';

export type RppStatus = 'draft' | 'submitted' | 'curriculum_reviewed' | 'approved' | 'revision';

export interface RppItem {
  id: string;
  subject: string;
  title: string;
  content?: string | null;
  body?: ModulAjarBody | null;
  fileUrl?: string | null;
  status: RppStatus;
  reviewerName?: string | null;
  reviewNote?: string | null;
  curriculumReviewerName?: string | null;
  curriculumReviewNote?: string | null;
  curriculumReviewedAt?: string | null;
  finalReviewerName?: string | null;
  finalReviewNote?: string | null;
  finalApprovedAt?: string | null;
  submittedAt?: string | null;
  academicYear: string;
  semester: number;
  updatedAt: string;
  teacher: { id: string; user: { fullName: string } };
  class?: { id: string; name: string } | null;
}

interface Props {
  items: RppItem[];
  total: number;
  query: { page: number; limit: number; status: string; search: string };
  canCurriculumReview: boolean;
  canFinalApprove: boolean;
  canArchive: boolean;
}

const STATUS: Record<RppStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  submitted: { label: 'Menunggu review kurikulum', variant: 'secondary' },
  curriculum_reviewed: { label: 'Direkomendasikan ke KS', variant: 'secondary' },
  approved: { label: 'Disetujui final', variant: 'default' },
  revision: { label: 'Perlu revisi', variant: 'destructive' },
};

export default function RppBoard({ items, total, query, canCurriculumReview, canFinalApprove, canArchive }: Props) {
  const { setParams, isPending } = useQueryState();
  const [search, setSearch] = useState(query.search);
  const [detail, setDetail] = useState<RppItem | null>(null);
  const [reviewing, setReviewing] = useState<RppItem | null>(null);
  const [archiving, setArchiving] = useState<RppItem | null>(null);
  const [error, setError] = useState('');
  const [busy, startTransition] = useTransition();

  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => setParams({ search: search || null }), 350);
    return () => clearTimeout(timer);
  }, [query.search, search, setParams]);

  const run = (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => {
    setError('');
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Aksi gagal diproses');
      else onSuccess?.();
    });
  };

  const canReview = (item: RppItem) =>
    (canCurriculumReview && item.status === 'submitted') ||
    (canFinalApprove && item.status === 'curriculum_reviewed');

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review Modul Ajar</h1>
          <p className="text-sm text-muted-foreground">Review kurikulum, rekomendasi, dan persetujuan final dalam dua tahap.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <div className="relative min-w-0 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul, mapel, atau guru" className="pl-9" aria-label="Cari Modul Ajar" />
          </div>
          <Select value={query.status || 'all'} onValueChange={(value: string) => setParams({ status: value })}>
            <SelectTrigger className="sm:w-56" aria-label="Filter status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              <SelectItem value="submitted">Menunggu kurikulum</SelectItem>
              <SelectItem value="curriculum_reviewed">Menunggu KS</SelectItem>
              <SelectItem value="approved">Disetujui final</SelectItem>
              <SelectItem value="revision">Perlu revisi</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className={`grid gap-3 transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
        {items.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Tidak ada Modul Ajar pada filter ini.</CardContent></Card>
        ) : items.map((item) => (
          <Card key={item.id}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base leading-6">{item.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{item.subject} | {item.class?.name ?? 'Tanpa kelas'} | {item.teacher.user.fullName}</p>
                </div>
                <Badge variant={STATUS[item.status].variant}>{STATUS[item.status].label}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">{item.academicYear} | Semester {item.semester}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setDetail(item)}>
                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />Detail
                </Button>
                {canReview(item) && (
                  <Button size="sm" onClick={() => { setError(''); setReviewing(item); }}>
                    <Send className="mr-2 h-4 w-4" aria-hidden="true" />Ambil keputusan
                  </Button>
                )}
                 {canArchive && (
                   <Button size="sm" variant="outline" disabled={busy} onClick={() => setArchiving(item)}>
                    <Archive className="mr-2 h-4 w-4" aria-hidden="true" />Arsipkan
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
      <RppDetailDialog item={detail} onClose={() => setDetail(null)} />
      <ReviewDialog
        item={reviewing}
        canCurriculumReview={canCurriculumReview}
        onClose={() => setReviewing(null)}
        pending={busy}
        error={error}
        run={run}
      />
      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(open) => !open && setArchiving(null)}
        title="Arsipkan Modul Ajar?"
        description={archiving ? `${archiving.title} akan disembunyikan dari antrean aktif. Riwayat audit tetap dipertahankan.` : ''}
        confirmLabel="Arsipkan"
        variant="warning"
        onConfirm={async () => {
          if (!archiving) return false;
          const result = await archiveRpp(archiving.id);
          if (!result.success) { setError(result.error ?? 'Modul Ajar gagal diarsipkan'); return false; }
          return true;
        }}
      />
    </div>
  );
}

function RppBody({ item }: { item: RppItem }) {
  return item.body ? (
    <ModulAjarView body={item.body} academicYear={item.academicYear} />
  ) : item.content ? (
    <div className="whitespace-pre-wrap rounded border bg-muted/30 p-4 text-sm">{item.content}</div>
  ) : (
    <p className="text-sm text-muted-foreground">Isi terstruktur tidak tersedia. Periksa lampiran dokumen.</p>
  );
}

function RppDetailDialog({ item, onClose }: { item: RppItem | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{item?.title}</DialogTitle>
          <DialogDescription>{item?.subject} | {item?.teacher.user.fullName} | {item?.academicYear} Semester {item?.semester}</DialogDescription>
        </DialogHeader>
        {item && <RppBody item={item} />}
        {item?.fileUrl && <Button asChild variant="outline"><a href={item.fileUrl} target="_blank" rel="noreferrer">Buka lampiran</a></Button>}
        {item && (item.curriculumReviewerName || item.finalReviewerName || item.reviewNote) && (
          <section className="space-y-2 border-t pt-4" aria-label="Riwayat keputusan">
            <h2 className="text-sm font-semibold">Riwayat keputusan</h2>
            {item.curriculumReviewerName && <p className="text-sm"><b>Review kurikulum:</b> {item.curriculumReviewerName}{item.curriculumReviewNote ? ` - ${item.curriculumReviewNote}` : ''}</p>}
            {item.finalReviewerName && <p className="text-sm"><b>Persetujuan final:</b> {item.finalReviewerName}{item.finalReviewNote ? ` - ${item.finalReviewNote}` : ''}</p>}
            {item.status === 'revision' && item.reviewNote && <p className="text-sm text-destructive"><b>Revisi terakhir:</b> {item.reviewNote}</p>}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ item, canCurriculumReview, onClose, run, pending, error }: {
  item: RppItem | null;
  canCurriculumReview: boolean;
  onClose: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void;
  pending: boolean;
  error: string;
}) {
  const [note, setNote] = useState('');
  const isCurriculumStage = item?.status === 'submitted' && canCurriculumReview;
  useEffect(() => { if (item) setNote(''); }, [item]);
  const decide = (decision: 'recommended' | 'approved' | 'revision') => {
    if (!item) return;
    run(() => reviewRpp(item.id, decision, note.trim() || undefined), onClose);
  };

  return (
    <Dialog open={!!item} onOpenChange={(open: boolean) => !open && !pending && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isCurriculumStage ? 'Review kurikulum' : 'Persetujuan final'}: {item?.title}</DialogTitle>
          <DialogDescription>{isCurriculumStage ? 'Waka/Kaprog memberi rekomendasi. Persetujuan final tetap oleh Kepala Sekolah.' : 'Kepala Sekolah memeriksa rekomendasi dan mengambil keputusan final.'}</DialogDescription>
        </DialogHeader>
        {item && <RppBody item={item} />}
        {item?.curriculumReviewerName && <p className="rounded border bg-muted/30 p-3 text-sm"><b>Rekomendasi {item.curriculumReviewerName}:</b> {item.curriculumReviewNote || 'Tanpa catatan tambahan'}</p>}
        <div className="space-y-1.5">
          <Label htmlFor="rpp-review-note">Catatan keputusan</Label>
          <Textarea id="rpp-review-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tuliskan masukan yang spesifik dan dapat ditindaklanjuti" />
          <p className="text-xs text-muted-foreground">Catatan minimal 3 karakter wajib untuk permintaan revisi.</p>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button>
          <Button variant="destructive" disabled={pending || note.trim().length < 3} onClick={() => decide('revision')}>
            {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}Minta revisi
          </Button>
          <Button disabled={pending} onClick={() => decide(isCurriculumStage ? 'recommended' : 'approved')}>
            {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {isCurriculumStage ? 'Rekomendasikan ke KS' : 'Setujui final'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
