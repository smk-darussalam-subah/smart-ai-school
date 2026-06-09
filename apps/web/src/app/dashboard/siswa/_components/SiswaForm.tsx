'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export default function SiswaFormDialog({ open, onOpenChange, student, classes }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!student;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = new FormData(e.currentTarget);
    const result = isEdit
      ? await updateSiswa(student!.id, form)
      : await createSiswa(form);

    setLoading(false);

    if (result?.success) {
      onOpenChange(false);
    } else {
      setError(result?.error || 'Gagal menyimpan data');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Siswa' : 'Tambah Siswa'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="nis">NIS</Label>
            <Input id="nis" name="nis" defaultValue={student?.nis ?? ''} required minLength={5} maxLength={20} />
          </div>
          <div>
            <Label htmlFor="userId">User ID (Keycloak UUID)</Label>
            <Input id="userId" name="userId" placeholder="UUID dari Keycloak" disabled={isEdit} />
          </div>
          <div>
            <Label htmlFor="classId">Kelas</Label>
            <Select name="classId" defaultValue={student?.class?.id ?? ''}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih kelas (opsional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">-- Tidak ada --</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select name="status" defaultValue={student?.status ?? 'active'}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
            <Input id="joinedAt" name="joinedAt" type="date" defaultValue={student?.joinedAt?.split('T')[0] ?? ''} />
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
