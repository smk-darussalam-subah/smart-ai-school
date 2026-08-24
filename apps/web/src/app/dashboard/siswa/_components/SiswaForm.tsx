'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateSiswa } from '../actions';
import { toSiswaFormState, type SiswaFormState } from './siswa-form-state';

interface Student {
  id: string; nis: string; status: string;
  user: { id?: string; fullName: string; email?: string };
  parent?: { id: string; fullName: string } | null;
  class?: { id: string; name: string } | null;
  joinedAt?: string | null;
}

interface ClassItem { id: string; name: string; }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  classes: ClassItem[];
}

export default function SiswaFormDialog({ open, onOpenChange, student, classes }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<SiswaFormState | null>(student ? toSiswaFormState(student) : null);

  useEffect(() => {
    if (!open || !student) return;
    setForm(toSiswaFormState(student));
    setError('');
  }, [open, student]);

  if (!student || !form) return null;

  const update = (key: keyof SiswaFormState, value: string) => setForm((current) => current ? { ...current, [key]: value } : current);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const body: Record<string, unknown> = {
      nis: form.nis,
      status: form.status || 'active',
      classId: form.classId || null,
    };
    if (form.joinedAt) body.joinedAt = new Date(form.joinedAt).toISOString();
    const result = await updateSiswa(student.id, body);
    setLoading(false);
    if (result?.success) {
      onOpenChange(false);
    } else {
      setError(result?.error || 'Data siswa gagal disimpan.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b px-6 pb-4 pt-6 pr-12">
          <DialogTitle>Edit Siswa</DialogTitle>
          <DialogDescription>Ubah registry siswa yang sudah dibuat melalui jalur resmi.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          <div className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p><span className="text-slate-500">Nama siswa:</span> <span className="font-medium">{student.user.fullName}</span></p>
            <p><span className="text-slate-500">Wali:</span> <span className="font-medium">{student.parent?.fullName ?? '-'}</span></p>
            <p><span className="text-slate-500">Email akun:</span> <span className="font-medium">{student.user.email ?? '-'}</span></p>
          </div>
          <div>
            <Label htmlFor="nis">NIS</Label>
            <Input id="nis" value={form.nis} onChange={(event) => update('nis', event.target.value)} required minLength={5} maxLength={20} />
          </div>
          <div>
            <Label>Kelas</Label>
            <Select value={form.classId || 'none'} onValueChange={(value: string) => update('classId', value === 'none' ? '' : value)}>
              <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Tanpa Kelas --</SelectItem>
                {classes.map((kelas) => <SelectItem key={kelas.id} value={kelas.id}>{kelas.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(value: string) => update('status', value)}>
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
            <Input id="joinedAt" type="date" value={form.joinedAt} onChange={(event) => update('joinedAt', event.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="sticky bottom-0 -mx-6 mt-4 flex justify-end gap-3 border-t bg-white px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
