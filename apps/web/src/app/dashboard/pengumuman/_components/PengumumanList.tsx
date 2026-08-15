'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { TablePagination } from '@/components/ui/table-pagination';
import PengumumanFormDialog from './PengumumanForm';
import {
  archiveAnnouncement, deleteAnnouncement, pinAnnouncement, publishAnnouncement,
} from '../actions';
import { getAnnouncementDisplayStatus, normalizeAnnouncementAudience, type AnnouncementAudienceInput } from '../pengumuman-ui';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: 'umum' | 'akademik' | 'keuangan' | 'kegiatan' | 'darurat';
  priority: 'biasa' | 'penting' | 'urgent';
  audience: AnnouncementAudienceInput;
  isPinned: boolean;
  status: 'draft' | 'published' | 'archived';
  publishedAt?: string | null;
  scheduledAt?: string | null;
  deliveryPreparedAt?: string | null;
  createdByName?: string | null;
  createdAt: string;
}

interface Props {
  announcements: Announcement[];
  total: number;
  page: number;
  limit: number;
  filters: { search: string; category: string; status: string };
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
  urgent: { label: 'Urgent', variant: 'destructive' },
};

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export default function PengumumanList({
  announcements,
  total,
  page,
  limit,
  filters,
  canManage,
  canDelete,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(filters.search);
  const [categoryFilter, setCategoryFilter] = useState(filters.category);
  const [statusFilter, setStatusFilter] = useState(filters.status);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [actionError, setActionError] = useState('');
  const [pending, startTransition] = useTransition();

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    startNavigation(() => router.replace(query ? `${pathname}?${query}` : pathname));
  };

  useEffect(() => {
    setSearch(filters.search);
    setCategoryFilter(filters.category);
    setStatusFilter(filters.status);
  }, [filters.search, filters.category, filters.status]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search === filters.search) return;
      setQuery({ search: search.trim() || null, page: '1' });
    }, 350);
    return () => clearTimeout(timer);
  }, [search, filters.search]);

  const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setActionError('');
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setActionError(r.error ?? 'Aksi gagal');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pengumuman Sekolah</h1>
          <p className="text-sm text-muted-foreground">
            {isNavigating ? 'Memuat...' : `${announcements.length} tampil dari ${total} pengumuman`}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            Buat Pengumuman
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Cari judul..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select
          value={categoryFilter}
          onValueChange={(value: string) => {
            setCategoryFilter(value);
            setQuery({ category: value === 'all' ? null : value, page: '1' });
          }}
        >
          <SelectTrigger className="sm:w-44"><SelectValue placeholder="Kategori" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Select
            value={statusFilter}
            onValueChange={(value: string) => {
              setStatusFilter(value);
              setQuery({ status: value === 'all' ? null : value, page: '1' });
            }}
          >
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

      {announcements.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Belum ada pengumuman yang cocok dengan filter.
          </CardContent>
        </Card>
      ) : (
        announcements.map((announcement) => {
          const audience = normalizeAnnouncementAudience(announcement.audience);
          return (
          <Card key={announcement.id} className={announcement.isPinned ? 'border-primary' : undefined}>
            <CardHeader className="pb-2">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <CardTitle className="flex items-center gap-2 text-base">
                  {announcement.isPinned && <Badge variant="outline">Disematkan</Badge>}
                  {announcement.title}
                </CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{CATEGORY_LABEL[announcement.category]}</Badge>
                  <Badge variant={PRIORITY_BADGE[announcement.priority].variant}>
                    {PRIORITY_BADGE[announcement.priority].label}
                  </Badge>
                  {canManage && (
                    <Badge variant={getAnnouncementDisplayStatus(announcement).variant}>
                      {getAnnouncementDisplayStatus(announcement).label}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {announcement.status === 'published'
                  ? `Terbit ${formatDateTime(announcement.publishedAt)}`
                  : announcement.scheduledAt
                    ? `Terjadwal ${formatDateTime(announcement.scheduledAt)}`
                    : `Dibuat ${formatDateTime(announcement.createdAt)}`}
                {announcement.createdByName ? ` | oleh ${announcement.createdByName}` : ''}
                {canManage && audience.length > 0 ? ` | audiens: ${audience.join(', ')}` : ''}
                {canManage && announcement.deliveryPreparedAt ? ` | disiapkan ${formatDateTime(announcement.deliveryPreparedAt)}` : ''}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="whitespace-pre-wrap text-sm">{announcement.content}</p>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pending}
                    onClick={() => { setEditing(announcement); setFormOpen(true); }}>
                    Edit
                  </Button>
                  {announcement.status !== 'published' && (
                    <Button size="sm" disabled={pending}
                      onClick={() => run(() => publishAnnouncement(announcement.id))}>
                      Terbitkan
                    </Button>
                  )}
                  {announcement.status === 'published' && (
                    <>
                      <Button size="sm" variant="outline" disabled={pending}
                        onClick={() => run(() => pinAnnouncement(announcement.id, !announcement.isPinned))}>
                        {announcement.isPinned ? 'Lepas Sematan' : 'Sematkan'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={pending}
                        onClick={() => run(() => archiveAnnouncement(announcement.id))}>
                        Arsipkan
                      </Button>
                    </>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => setDeleting(announcement)}>
                      Hapus
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          );
        })
      )}

      <TablePagination page={page} limit={limit} total={total} onPage={(nextPage) => setQuery({ page: String(nextPage) })} />

      {canManage && (
        <PengumumanFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          announcement={editing}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(open: boolean) => !open && setDeleting(null)}>
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
                  const result = await deleteAnnouncement(deleting.id);
                  if (result.success) setDeleting(null);
                  return result;
                });
              }}
            >
              {pending ? 'Menghapus...' : 'Hapus Permanen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
