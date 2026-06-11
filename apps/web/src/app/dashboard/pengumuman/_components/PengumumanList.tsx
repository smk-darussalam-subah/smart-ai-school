'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import PengumumanFormDialog from './PengumumanForm';
import {
  archiveAnnouncement, deleteAnnouncement, pinAnnouncement, publishAnnouncement,
} from '../actions';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'umum' | 'akademik' | 'keuangan' | 'kegiatan' | 'darurat';
  priority: 'biasa' | 'penting' | 'urgent';
  audience: string[];
  isPinned: boolean;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string | null;
  scheduledAt?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

interface Props {
  announcements: Announcement[];
  total: number;
  canManage: boolean;
  canDelete: boolean;
}

const CATEGORY_LABEL: Record<Announcement['category'], string> = {
  umum: 'Umum', akademik: 'Akademik', keuangan: 'Keuangan',
  kegiatan: 'Kegiatan', darurat: 'Darurat',
};

const PRIORITY_BADGE: Record<Announcement['priority'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  biasa: { label: 'Biasa', variant: 'secondary' },
  penting: { label: 'Penting', variant: 'default' },
  urgent: { label: 'URGENT', variant: 'destructive' },
};

const STATUS_BADGE: Record<Announcement['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  published: { label: 'Terbit', variant: 'default' },
  archived: { label: 'Arsip', variant: 'secondary' },
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function PengumumanList({ announcements, total, canManage, canDelete }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [actionError, setActionError] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = announcements.filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || a.category === categoryFilter;
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchCategory && matchStatus;
  });

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setActionError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setActionError(r.error ?? 'Aksi gagal');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📢 Pengumuman Sekolah</h1>
          <p className="text-sm text-muted-foreground">{total} pengumuman</p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            + Buat Pengumuman
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Cari judul…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Terbit</SelectItem>
              <SelectItem value="archived">Arsip</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {actionError && (
        <p className="text-sm text-destructive" role="alert">{actionError}</p>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Belum ada pengumuman yang cocok dengan filter.
          </CardContent>
        </Card>
      ) : (
        filtered.map((a) => (
          <Card key={a.id} className={a.isPinned ? 'border-primary' : undefined}>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {a.isPinned && <span title="Disematkan">📌</span>}
                  {a.title}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{CATEGORY_LABEL[a.category]}</Badge>
                  <Badge variant={PRIORITY_BADGE[a.priority].variant}>
                    {PRIORITY_BADGE[a.priority].label}
                  </Badge>
                  {canManage && (
                    <Badge variant={STATUS_BADGE[a.status].variant}>
                      {STATUS_BADGE[a.status].label}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {a.status === 'published'
                  ? `Terbit ${formatDate(a.publishedAt)}`
                  : a.scheduledAt
                    ? `Terjadwal ${formatDate(a.scheduledAt)}`
                    : `Dibuat ${formatDate(a.createdAt)}`}
                {a.createdByName ? ` · oleh ${a.createdByName}` : ''}
                {canManage && a.audience.length > 0
                  ? ` · audiens: ${a.audience.join(', ')}`
                  : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm whitespace-pre-wrap">{a.content}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pending}
                    onClick={() => { setEditing(a); setFormOpen(true); }}>
                    Edit
                  </Button>
                  {a.status !== 'published' && (
                    <Button size="sm" disabled={pending}
                      onClick={() => run(() => publishAnnouncement(a.id))}>
                      Terbitkan
                    </Button>
                  )}
                  {a.status === 'published' && (
                    <>
                      <Button size="sm" variant="outline" disabled={pending}
                        onClick={() => run(() => pinAnnouncement(a.id, !a.isPinned))}>
                        {a.isPinned ? 'Lepas Sematan' : 'Sematkan'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={pending}
                        onClick={() => run(() => archiveAnnouncement(a.id))}>
                        Arsipkan
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => setDeleting(a)}>
                      Hapus
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {canManage && (
        <PengumumanFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          announcement={editing}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(o: boolean) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Pengumuman?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleting?.title}&rdquo; akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (!deleting) return;
                run(async () => {
                  const r = await deleteAnnouncement(deleting.id);
                  if (r.success) setDeleting(null);
                  return r;
                });
              }}
            >
              {pending ? 'Menghapus…' : 'Hapus Permanen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
