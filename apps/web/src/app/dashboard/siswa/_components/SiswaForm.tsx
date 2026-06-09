'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createSiswa, updateSiswa } from '../actions';

interface Student {
  id: string; nis: string; status: string;
  user: { fullName: string };
  class?: { id: string; name: string } | null;
  joinedAt?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  classes: { id: string; name: string }[];
}

interface FormState {
  nis: string;
  userId: string;
  classId: string;
  status: string;
  joinedAt: string;
}

export default function SiswaFormDialog({ open, onOpenChange, student, classes }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState>({
    nis: student?.nis ?? '',
    userId: '',
    classId: student?.class?.id ?? '',
    status: student?.status ?? 'active',
    joinedAt: student?.joinedAt?.split('T')[0] ?? '',
  });
  const isEdit = !!student;

  const update = (key: keyof FormState, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const body: Record<string, unknown> = {
      nis: form.nis,
      status: form.status || 'active',
    };
    if (form.classId) body.classId = form.classId;
    if (form.joinedAt) body.joinedAt = new Date(form.joinedAt).toISOString();
    if (!isEdit && form.userId) body.userId = form.userId;

    const result = isEdit
      ? await updateSiswa(student!.id, body)
      : await createSiswa(body);

    setLoading(false);

    if (result?.success) {
      onOpenChange(false);
    } else {
      setError(result?.error || 'Gagal menyimpan data');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Siswa' : 'Tambah Siswa'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Ubah data siswa yang sudah ada.' : 'Isi data untuk menambahkan siswa baru.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nis">NIS</Label>
            <Input id="nis" value={form.nis} onChange={e => update('nis', e.target.value)} required minLength={5} maxLength={20} />
          </div>
          <div>
            <Label htmlFor="userId">User ID (Keycloak UUID)</Label>
            <Input id="userId" value={form.userId} onChange={e => update('userId', e.target.value)} placeholder="UUID dari Keycloak" disabled={isEdit} />
          </div>
          <div>
            <Label>Kelas</Label>
            <Select value={form.classId || 'none'} onValueChange={(v: string) => update('classId', v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Pilih kelas (opsional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Tidak ada --</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v: string) => update('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
                <SelectItem value="graduated">Lulus</SelectItem>
                <SelectItem value="dropped">DO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="joinedAt">Tanggal Masuk</Label>
            <Input id="joinedAt" type="date" value={form.joinedAt} onChange={e => update('joinedAt', e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">
              {loading ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Tambah'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
