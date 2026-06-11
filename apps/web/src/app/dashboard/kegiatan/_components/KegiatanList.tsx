'use client';

// =============================================================================
// KegiatanList — Jurnal Kegiatan Kelas (KamilEdu M9)
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
import { createActivity, deleteActivity, updateActivity } from '../actions';

export interface ActivityItem {
  id: string;
  classId: string;
  date: string;
  title: string;
  description?: string | null;
  category: 'pembelajaran' | 'ulangan' | 'praktikum' | 'kegiatan' | 'lainnya';
  photoUrl?: string | null;
  class: { id: string; name: string };
  teacher: { id: string; user: { fullName: string } };
}

interface ClassItem { id: string; name: string; }

interface Props {
  items: ActivityItem[];
  total: number;
  classes: ClassItem[];
  isGuru: boolean;
  canDelete: boolean;
}

const CATEGORY_LABEL: Record<ActivityItem['category'], string> = {
  pembelajaran: '📖 Pembelajaran', ulangan: '📝 Ulangan', praktikum: '🔬 Praktikum',
  kegiatan: '🎉 Kegiatan', lainnya: '📌 Lainnya',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

export default function KegiatanList({ items, total, classes, isGuru, canDelete }: Props) {
  const [classFilter, setClassFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = items.filter((a) =>
    (classFilter === 'all' || a.classId === classFilter) &&
    (categoryFilter === 'all' || a.category === categoryFilter));

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
          <h1 className="text-2xl font-bold">🎒 Kegiatan Kelas</h1>
          <p className="text-sm text-muted-foreground">{total} catatan kegiatan</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isGuru && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }}>+ Catat Kegiatan</Button>
          )}
          {classes.length > 0 && (
            <Select value={classFilter} onValueChange={(v: string) => setClassFilter(v)}>
              <SelectTrigger className="w-40" aria-label="Filter kelas"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={categoryFilter} onValueChange={(v: string) => setCategoryFilter(v)}>
            <SelectTrigger className="w-44" aria-label="Filter kategori"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Belum ada kegiatan pada filter ini.
          </CardContent>
        </Card>
      ) : (
        filtered.map((a) => (
          <Card key={a.id}>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <CardTitle className="text-base">{a.title}</CardTitle>
                <Badge variant="outline">{CATEGORY_LABEL[a.category]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {a.class.name} · {fmtDate(a.date)} · {a.teacher.user.fullName}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.description && <p className="text-sm whitespace-pre-wrap">{a.description}</p>}
              {a.photoUrl && (
                <a className="text-sm text-primary underline" href={a.photoUrl} target="_blank" rel="noreferrer">
                  🖼️ Foto kegiatan
                </a>
              )}
              {(isGuru || canDelete) && (
                <div className="flex gap-2">
                  {isGuru && (
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => { setEditing(a); setFormOpen(true); }}>Edit</Button>
                  )}
                  {canDelete && (
                    <Button size="sm" variant="destructive" disabled={pending}
                      onClick={() => run(() => deleteActivity(a.id))}>Hapus</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {isGuru && (
        <KegiatanFormDialog open={formOpen} onOpenChange={setFormOpen}
          activity={editing} classes={classes} />
      )}
    </div>
  );
}

function KegiatanFormDialog({ open, onOpenChange, activity, classes }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  activity: ActivityItem | null; classes: ClassItem[];
}) {
  const isEdit = !!activity;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('pembelajaran');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setClassId(activity?.classId ?? classes[0]?.id ?? '');
      setDate(activity?.date ? activity.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setTitle(activity?.title ?? '');
      setCategory(activity?.category ?? 'pembelajaran');
      setDescription(activity?.description ?? '');
      setPhotoUrl(activity?.photoUrl ?? '');
    }
  }, [open, activity, classes]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const body = {
      classId, date, title, category,
      description: description.trim() || null,
      photoUrl: photoUrl.trim() || null,
    };
    const r = isEdit ? await updateActivity(activity!.id, body) : await createActivity(body);
    setLoading(false);
    if (r.success) onOpenChange(false);
    else setError(('error' in r && r.error) || 'Gagal menyimpan');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Kegiatan' : 'Catat Kegiatan'}</DialogTitle>
          <DialogDescription>Jurnal kegiatan kelas — terlihat oleh siswa & orang tua kelas tsb.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kelas</Label>
              <Select value={classId || undefined} onValueChange={(v: string) => setClassId(v)}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="act-date">Tanggal</Label>
              <Input id="act-date" type="date" required value={date}
                onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-title">Judul</Label>
            <Input id="act-title" required minLength={3} value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="cth. Praktikum konfigurasi router" />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <Select value={category} onValueChange={(v: string) => setCategory(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pembelajaran">Pembelajaran</SelectItem>
                <SelectItem value="ulangan">Ulangan</SelectItem>
                <SelectItem value="praktikum">Praktikum</SelectItem>
                <SelectItem value="kegiatan">Kegiatan</SelectItem>
                <SelectItem value="lainnya">Lainnya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-desc">Deskripsi (opsional)</Label>
            <Textarea id="act-desc" rows={3} value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="act-photo">URL Foto (opsional)</Label>
            <Input id="act-photo" type="url" value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://…" />
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={loading}
              onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !classId}>
              {loading ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
