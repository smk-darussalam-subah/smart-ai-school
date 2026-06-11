'use client';

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createAnnouncement, updateAnnouncement } from '../actions';
import type { Announcement } from './PengumumanList';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement: Announcement | null;
}

const ROLES = [
  'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'SISWA', 'ORANG_TUA', 'INDUSTRI',
] as const;

const ROLE_LABEL: Record<string, string> = {
  KEPALA_SEKOLAH: 'Kepala Sekolah', TATA_USAHA: 'Tata Usaha', GURU: 'Guru',
  SISWA: 'Siswa', ORANG_TUA: 'Orang Tua', INDUSTRI: 'Industri',
};

interface FormState {
  title: string;
  content: string;
  category: string;
  priority: string;
  audienceAll: boolean;
  audienceRoles: string[];
  scheduledAt: string;
}

const EMPTY: FormState = {
  title: '', content: '', category: 'umum', priority: 'biasa',
  audienceAll: true, audienceRoles: [], scheduledAt: '',
};

function toFormState(a: Announcement | null): FormState {
  if (!a) return EMPTY;
  const isAll = a.audience.includes('ALL');
  return {
    title: a.title,
    content: a.content,
    category: a.category,
    priority: a.priority,
    audienceAll: isAll,
    audienceRoles: isAll ? [] : a.audience,
    scheduledAt: a.scheduledAt ? a.scheduledAt.slice(0, 10) : '',
  };
}

export default function PengumumanFormDialog({ open, onOpenChange, announcement }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>(toFormState(announcement));
  const isEdit = !!announcement;

  useEffect(() => {
    if (open) {
      setForm(toFormState(announcement));
      setError('');
    }
  }, [open, announcement]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const toggleRole = (role: string) =>
    setForm((p) => ({
      ...p,
      audienceRoles: p.audienceRoles.includes(role)
        ? p.audienceRoles.filter((r) => r !== role)
        : [...p.audienceRoles, role],
    }));

  const submit = async (publishNow: boolean) => {
    setLoading(true);
    setError('');

    const audience = form.audienceAll ? ['ALL'] : form.audienceRoles;
    if (audience.length === 0) {
      setError('Pilih minimal satu audiens, atau gunakan "Semua".');
      setLoading(false);
      return;
    }

    const body: Record<string, unknown> = {
      title: form.title,
      content: form.content,
      category: form.category,
      priority: form.priority,
      audience,
      scheduledAt: form.scheduledAt
        ? new Date(`${form.scheduledAt}T00:00:00+07:00`).toISOString()
        : null,
    };
    if (!isEdit) body.status = publishNow ? 'published' : 'draft';
    else if (publishNow) body.status = 'published';

    const r = isEdit
      ? await updateAnnouncement(announcement!.id, body)
      : await createAnnouncement(body);

    setLoading(false);
    if (r?.success) onOpenChange(false);
    else setError(r?.error || 'Gagal menyimpan pengumuman');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Pengumuman' : 'Buat Pengumuman'}</DialogTitle>
          <DialogDescription>
            Pengumuman tampil untuk audiens terpilih setelah diterbitkan.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); void submit(false); }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Judul</Label>
            <Input
              id="ann-title" required minLength={3} maxLength={255}
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="cth. Libur Hari Raya Idul Adha"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-content">Isi Pengumuman</Label>
            <Textarea
              id="ann-content" required rows={5}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder="Tulis isi pengumuman…"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v: string) => update('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="umum">Umum</SelectItem>
                  <SelectItem value="akademik">Akademik</SelectItem>
                  <SelectItem value="keuangan">Keuangan</SelectItem>
                  <SelectItem value="kegiatan">Kegiatan</SelectItem>
                  <SelectItem value="darurat">Darurat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioritas</Label>
              <Select value={form.priority} onValueChange={(v: string) => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="biasa">Biasa</SelectItem>
                  <SelectItem value="penting">Penting</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Audiens</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button" size="sm"
                variant={form.audienceAll ? 'default' : 'outline'}
                onClick={() => update('audienceAll', !form.audienceAll)}
              >
                Semua
              </Button>
              {!form.audienceAll && ROLES.map((role) => (
                <Button
                  key={role} type="button" size="sm"
                  variant={form.audienceRoles.includes(role) ? 'default' : 'outline'}
                  onClick={() => toggleRole(role)}
                >
                  {ROLE_LABEL[role]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ann-scheduled">Jadwalkan Tampil (opsional)</Label>
            <Input
              id="ann-scheduled" type="date"
              value={form.scheduledAt}
              onChange={(e) => update('scheduledAt', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Bila diisi, pengumuman terbit baru tampil mulai tanggal ini.
            </p>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={loading}
              onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" variant="secondary" disabled={loading}>
              {loading ? 'Menyimpan…' : 'Simpan Draft'}
            </Button>
            <Button type="button" disabled={loading} onClick={() => void submit(true)}>
              {loading ? 'Menyimpan…' : isEdit ? 'Simpan & Terbitkan' : 'Terbitkan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
