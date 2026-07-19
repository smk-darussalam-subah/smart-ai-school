'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createKelas, createSiswa, updateSiswa } from '../actions';
import { toSiswaFormState, type SiswaFormState } from './siswa-form-state';

interface Student {
  id: string; nis: string; status: string;
  userId?: string;
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
  defaultAcademicYear?: string;
}

export default function SiswaFormDialog({ open, onOpenChange, student, classes: initialClasses, defaultAcademicYear }: Props) {
  // Compute active TA from date if not provided (Indonesian school year starts July).
  const computedTA = (() => { const y = new Date().getUTCFullYear(); return new Date().getUTCMonth() >= 6 ? `${y}/${y+1}` : `${y-1}/${y}`; })();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>(initialClasses);
  const [form, setForm] = useState<SiswaFormState>(() => toSiswaFormState(student));
  const isEdit = !!student;

  // Kelas mini-form
  const [kelasOpen, setKelasOpen] = useState(false);
  const [kelasName, setKelasName] = useState('');
  const [kelasMajor, setKelasMajor] = useState('TKRO');
  const [kelasGrade, setKelasGrade] = useState('10');
  const [kelasTA, setKelasTA] = useState(defaultAcademicYear || computedTA);
  const [kelasLoading, setKelasLoading] = useState(false);
  const [kelasError, setKelasError] = useState('');

  useEffect(() => {
    setClasses(initialClasses);
  }, [initialClasses]);

  useEffect(() => {
    if (!open) return;
    setForm(toSiswaFormState(student));
    setError('');
  }, [open, student]);

  const update = (key: keyof SiswaFormState, value: string) => setForm(p => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const body: Record<string, unknown> = { nis: form.nis, status: form.status || 'active' };
    if (isEdit) body.classId = form.classId || null;
    else if (form.classId) body.classId = form.classId;
    if (form.joinedAt) body.joinedAt = new Date(form.joinedAt).toISOString();
    if (!isEdit && form.userId) body.userId = form.userId;
    const r = isEdit ? await updateSiswa(student!.id, body) : await createSiswa(body);
    setLoading(false);
    if (r?.success) onOpenChange(false); else setError(r?.error || 'Gagal');
  };

  const handleTambahKelas = async (e: React.FormEvent) => {
    e.preventDefault(); setKelasLoading(true); setKelasError('');
    try {
      const r = await createKelas({
        name: kelasName, majorCode: kelasMajor, grade: Number(kelasGrade),
        academicYear: kelasTA, capacity: 36,
      });
      if (!r.success) throw new Error(('error' in r && r.error) || 'Gagal membuat kelas');
      const newClass = r.data as { id: string; name: string };
      const newItem = { id: newClass.id, name: newClass.name || kelasName };
      setClasses(p => [...p, newItem]);
      setForm(p => ({ ...p, classId: newItem.id }));
      setKelasOpen(false);
      setKelasName('');
    } catch (err) {
      setKelasError(err instanceof Error ? err.message : 'Gagal membuat kelas');
    }
    setKelasLoading(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b px-6 pb-4 pt-6 pr-12">
          <DialogTitle>{isEdit ? 'Edit Siswa' : 'Tambah Siswa'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Ubah data siswa.' : 'Isi data siswa baru.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="min-h-0 space-y-4 overflow-y-auto px-6 py-5">
          {isEdit && student && (
            <div className="mb-4 rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <p><span className="text-slate-500">Nama siswa:</span> <span className="font-medium">{student.user.fullName}</span></p>
              <p><span className="text-slate-500">Wali:</span> <span className="font-medium">{student.parent?.fullName ?? '-'}</span></p>
              <p><span className="text-slate-500">Email akun:</span> <span className="font-medium">{student.user.email ?? '-'}</span></p>
            </div>
          )}
          <div><Label htmlFor="nis">NIS</Label><Input id="nis" value={form.nis} onChange={e => update('nis', e.target.value)} required minLength={5} maxLength={20} /></div>
          <div><Label htmlFor="userId">User ID (Keycloak UUID)</Label><Input id="userId" value={form.userId} onChange={e => update('userId', e.target.value)} placeholder="UUID dari Keycloak" disabled={isEdit} /></div>
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>Kelas</Label>
                <Select value={form.classId || 'none'} onValueChange={(v: string) => update('classId', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kelas (opsional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Tanpa Kelas --</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 mb-0.5" onClick={() => setKelasOpen(true)}>+ Kelas</Button>
            </div>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v: string) => update('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem><SelectItem value="inactive">Nonaktif</SelectItem>
                <SelectItem value="graduated">Lulus</SelectItem><SelectItem value="dropped">DO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="joinedAt">Tanggal Masuk</Label><Input id="joinedAt" type="date" value={form.joinedAt} onChange={e => update('joinedAt', e.target.value)} /></div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="sticky bottom-0 -mx-6 mt-4 flex justify-end gap-3 border-t bg-white px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : isEdit ? 'Simpan' : 'Tambah'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={kelasOpen} onOpenChange={setKelasOpen}>
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Tambah Kelas Baru</DialogTitle>
          <DialogDescription>Buat kelas untuk tahun ajaran {kelasTA}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleTambahKelas} className="space-y-3">
          <div><Label htmlFor="kn">Nama Kelas</Label><Input id="kn" value={kelasName} onChange={e => setKelasName(e.target.value)} placeholder="XII RPL 1" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Jurusan</Label>
              <Select value={kelasMajor} onValueChange={(v: string) => setKelasMajor(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TKRO">TKRO</SelectItem><SelectItem value="TBSM">TBSM</SelectItem>
                  <SelectItem value="AKL">AKL</SelectItem><SelectItem value="TJKT">TJKT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Kelas</Label>
              <Select value={kelasGrade} onValueChange={(v: string) => setKelasGrade(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem><SelectItem value="11">11</SelectItem><SelectItem value="12">12</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label htmlFor="kta">Tahun Ajaran</Label><Input id="kta" value={kelasTA} onChange={e => setKelasTA(e.target.value)} required /></div>
          {kelasError && <p className="text-sm text-red-600">{kelasError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setKelasOpen(false)}>Batal</Button>
            <Button type="submit" disabled={kelasLoading} className="bg-smk-blue hover:bg-primary-700">{kelasLoading ? 'Menyimpan...' : 'Tambah Kelas'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
