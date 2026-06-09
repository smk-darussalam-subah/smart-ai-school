'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { deleteSiswa } from '../actions';

interface Props {
  student: { id: string; nis: string; user: { fullName: string } } | null;
  onClose: () => void;
}

export default function SiswaDeleteDialog({ student, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  if (!student) return null;

  const handleDelete = async () => {
    setLoading(true);
    await deleteSiswa(student.id);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={!!student} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Hapus Siswa</DialogTitle>
          <DialogDescription>
            Yakin hapus <strong>{student.user.fullName}</strong> (NIS: {student.nis})?
            Data akan di-soft-delete dan bisa dipulihkan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Menghapus...' : 'Hapus'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
