'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookOpen, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  createSubjectAction,
  updateSubjectAction,
  toggleSubjectActiveAction,
  type SubjectRow,
} from '../actions';

interface Props {
  subjects: SubjectRow[];
  isEditor: boolean;
}

interface SubjectForm {
  code: string;
  name: string;
}

const emptyForm: SubjectForm = { code: '', name: '' };

export default function SubjectClient({ subjects, isEditor }: Props) {
  const router = useRouter();
  const [subjectsList, setSubjectsList] = useState<SubjectRow[]>(subjects);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<SubjectRow | null>(null);
  const [form, setForm] = useState<SubjectForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Toggle confirmation state
  const [toggleTarget, setToggleTarget] = useState<SubjectRow | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModal(true);
  };

  const openEdit = (s: SubjectRow) => {
    setEditing(s);
    setForm({ code: s.code, name: s.name });
    setModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    let res;
    if (editing) {
      res = await updateSubjectAction(editing.id, {
        code: form.code.toUpperCase(),
        name: form.name,
      });
    } else {
      res = await createSubjectAction({
        code: form.code.toUpperCase(),
        name: form.name,
      });
    }
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
    } else {
      setModal(false);
      toast.success(editing ? 'Mata pelajaran diperbarui.' : 'Mata pelajaran ditambahkan.');
      router.refresh();
    }
  };

  const handleConfirmToggle = async () => {
    if (!toggleTarget) return;
    const { id, name, isActive } = toggleTarget;
    setToggleBusy(true);
    const res = await toggleSubjectActiveAction(id, !isActive);
    setToggleBusy(false);
    setToggleTarget(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setSubjectsList((prev) => prev.map((x) => (x.id === id ? { ...x, isActive: !isActive } : x)));
    toast.success(`Mapel ${name} ${isActive ? 'dinonaktifkan' : 'diaktifkan'}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
              <BookOpen className="h-5 w-5" />
            </span>
            Mata Pelajaran
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Kelola katalog mata pelajaran. Mapel yang dinonaktifkan tidak muncul di form dropdown.
          </p>
        </div>
        {isEditor && (
          <Button onClick={openCreate} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Tambah Mapel
          </Button>
        )}
      </div>

      {subjectsList.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-gray-400">
          Belum ada mata pelajaran terdaftar.
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Kode</TableHead>
                <TableHead>Nama Mata Pelajaran</TableHead>
                <TableHead className="w-28">Status</TableHead>
                {isEditor && <TableHead className="w-20">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subjectsList.map((s) => (
                <TableRow key={s.id} className="hover:bg-gray-50">
                  <TableCell>
                    <span className="font-mono text-sm bg-gray-100 px-1.5 py-0.5 rounded">{s.code}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  </TableCell>
                  <TableCell>
                    {isEditor ? (
                      <button type="button" onClick={() => setToggleTarget(s)} className="cursor-pointer">
                        <Badge variant={s.isActive ? 'default' : 'secondary'} className={s.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                          {s.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </button>
                    ) : (
                      <Badge variant={s.isActive ? 'default' : 'secondary'} className={s.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                        {s.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    )}
                  </TableCell>
                  {isEditor && (
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* CRUD Modal */}
      <Dialog open={modal} onOpenChange={(v: boolean) => setModal(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Mata Pelajaran' : 'Tambah Mata Pelajaran'}</DialogTitle>
            <DialogDescription>
              {editing ? `Mengubah data mapel ${editing.code}.` : 'Isi data mapel baru.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="subj-code">Kode *</Label>
                <Input
                  id="subj-code"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  placeholder="MTK"
                  maxLength={20}
                />
              </div>
              <div>
                <Label htmlFor="subj-name">Nama *</Label>
                <Input
                  id="subj-name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Matematika"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setModal(false)}>Batal</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.code.trim() || !form.name.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toggle Confirmation Dialog */}
      <Dialog open={!!toggleTarget} onOpenChange={(v: boolean) => !v && setToggleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-gray-800">
              {toggleTarget?.isActive ? 'Nonaktifkan Mata Pelajaran' : 'Aktifkan Mata Pelajaran'}
            </DialogTitle>
            <DialogDescription>
              {toggleTarget?.isActive
                ? `Mapel "${toggleTarget?.name}" akan dinonaktifkan dan tidak muncul di form dropdown.`
                : `Mapel "${toggleTarget?.name}" akan diaktifkan kembali.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setToggleTarget(null)}>Batal</Button>
            <Button
              onClick={handleConfirmToggle}
              disabled={toggleBusy}
              variant={toggleTarget?.isActive ? 'destructive' : 'default'}
            >
              {toggleBusy ? 'Memproses...' : toggleTarget?.isActive ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
