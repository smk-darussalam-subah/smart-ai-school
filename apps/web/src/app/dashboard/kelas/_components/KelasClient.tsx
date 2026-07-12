'use client';

import { useState, useEffect } from 'react';
import {
  School, Plus, Edit3, Trash2, Power, AlertCircle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/ui/table-pagination';
import { createClassAction, updateClassAction, deleteClassAction } from '../actions';
import type { ClassRow, Major, StaffCandidate } from '../page';

interface Props {
  classes: ClassRow[];
  majors: Major[];
  teachers: StaffCandidate[];
  isSuperAdmin: boolean;
}

interface ClassForm {
  name: string;
  majorCode: string;
  grade: string;
  academicYear: string;
  capacity: string;
  teacherId: string;
}

const EMPTY_FORM: ClassForm = {
  name: '', majorCode: '', grade: '10', academicYear: '', capacity: '36', teacherId: '',
};

const GRADES = [10, 11, 12];
const PAGE_SIZE = 10;

export default function KelasClient({ classes, majors, teachers, isSuperAdmin }: Props) {
  const [busy, setBusy] = useState(false);
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClassForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ClassRow | null>(null);

  const filtered = filterGrade === 'all'
    ? classes
    : classes.filter((c) => c.grade === Number(filterGrade));

  // Reset ke halaman 1 saat filter berubah
  useEffect(() => { setCurrentPage(1); }, [filterGrade]);

  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (c: ClassRow) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      majorCode: c.majorCode,
      grade: String(c.grade),
      academicYear: c.academicYear,
      capacity: String(c.capacity),
      teacherId: c.teacherId ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = {
      name: form.name.trim(),
      majorCode: form.majorCode.trim().toUpperCase(),
      grade: Number(form.grade),
      academicYear: form.academicYear.trim(),
      capacity: Number(form.capacity) || 36,
      teacherId: form.teacherId || null,
    };
    const result = editingId
      ? await updateClassAction(editingId, body)
      : await createClassAction(body);
    setBusy(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success(editingId ? 'Kelas berhasil diperbarui.' : 'Kelas berhasil dibuat.');
    setShowForm(false);
  };

  const handleToggleActive = async (c: ClassRow) => {
    setBusy(true);
    const result = await updateClassAction(c.id, { isActive: !c.isActive });
    setBusy(false);
    if (result.error) { toast.error(result.error); return; }
    toast.success(`Kelas ${c.name} ${!c.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  const handleAssignAdvisor = async (classId: string, teacherId: string) => {
    const result = await updateClassAction(classId, { teacherId: teacherId || null });
    if (result.error) { toast.error(result.error); return; }
    toast.success('Wali kelas berhasil diperbarui.');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    const result = await deleteClassAction(deleteTarget.id);
    setBusy(false);
    const deletedName = deleteTarget.name;
    setDeleteTarget(null);
    if (result.error) { toast.error(result.error); return; }
    toast.success(`Kelas ${deletedName} dihapus.`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#0f2e25]">
            <School className="h-6 w-6 text-emerald-600" />Manajemen Kelas
          </h1>
          <p className="mt-1 text-sm text-[#6b8079]">Kelola kelas, wali kelas, dan kapasitas rombel.</p>
        </div>
        <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4" />Tambah Kelas
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-[#6b8079]">Filter Tingkat:</span>
        <Select value={filterGrade} onValueChange={(v: string) => setFilterGrade(v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua</SelectItem>
            {GRADES.map((g) => (<SelectItem key={g} value={String(g)}>Kelas {g}</SelectItem>))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-[#9bb0a8]">{filtered.length} kelas</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#e6efea] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e6efea] bg-[#f9fbfa] text-left text-xs uppercase tracking-wide text-[#6b8079]">
              <th className="px-4 py-3">Nama Kelas</th>
              <th className="px-4 py-3">Jurusan</th>
              <th className="px-4 py-3 text-center">Tingkat</th>
              <th className="px-4 py-3">Tahun Ajaran</th>
              <th className="px-4 py-3 text-center">Kapasitas</th>
              <th className="px-4 py-3">Wali Kelas</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#9bb0a8]">
                  Tidak ada kelas. Klik &quot;Tambah Kelas&quot; untuk membuat baru.
                </td>
              </tr>
            ) : (
              paginated.map((c) => (
                <tr key={c.id} className="border-b border-[#f0f4f2] hover:bg-[#f9fbfa]">
                  <td className="px-4 py-3 font-semibold text-[#0f2e25]">{c.name}</td>
                  <td className="px-4 py-3 text-[#355a4e]">{c.majorCode}</td>
                  <td className="px-4 py-3 text-center text-[#355a4e]">{c.grade}</td>
                  <td className="px-4 py-3 text-[#6b8079]">{c.academicYear}</td>
                  <td className="px-4 py-3 text-center text-[#6b8079]">{c.studentCount}/{c.capacity}</td>
                  <td className="px-4 py-3">
                    <Select
                      value={c.teacherId ?? ''}
                      onValueChange={(v: string) => handleAssignAdvisor(c.id, v)}
                    >
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue placeholder="— pilih wali —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">— kosongkan —</SelectItem>
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                      {c.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5] hover:text-emerald-600" title="Edit">
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleToggleActive(c)} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-[#f4f7f5] hover:text-amber-600" title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                        <Power className="h-4 w-4" />
                      </button>
                      {isSuperAdmin && (
                        <button onClick={() => setDeleteTarget(c)} className="rounded-lg p-1.5 text-[#6b8079] hover:bg-rose-50 hover:text-rose-600" title="Hapus">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TablePagination page={currentPage} limit={PAGE_SIZE} total={filtered.length} onPage={setCurrentPage} />

      {/* Create/Edit Modal */}
      <Dialog open={showForm} onOpenChange={(v: boolean) => !v && setShowForm(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Kelas' : 'Tambah Kelas Baru'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nama Kelas</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis: X TJKT 1" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="majorCode">Jurusan</Label>
                <Select value={form.majorCode} onValueChange={(v: string) => setForm({ ...form, majorCode: v })}>
                  <SelectTrigger id="majorCode"><SelectValue placeholder="Pilih jurusan" /></SelectTrigger>
                  <SelectContent>
                    {majors.map((m) => (<SelectItem key={m.code} value={m.code}>{m.code} — {m.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="grade">Tingkat</Label>
                <Select value={form.grade} onValueChange={(v: string) => setForm({ ...form, grade: v })}>
                  <SelectTrigger id="grade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (<SelectItem key={g} value={String(g)}>Kelas {g}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="academicYear">Tahun Ajaran</Label>
                <Input id="academicYear" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="2026/2027" required />
              </div>
              <div>
                <Label htmlFor="capacity">Kapasitas</Label>
                <Input id="capacity" type="number" min={1} max={60} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label htmlFor="teacherId">Wali Kelas (opsional)</Label>
              <Select value={form.teacherId} onValueChange={(v: string) => setForm({ ...form, teacherId: v })}>
                <SelectTrigger id="teacherId"><SelectValue placeholder="— pilih wali kelas —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— kosongkan —</SelectItem>
                  {teachers.map((t) => (<SelectItem key={t.id} value={t.id}>{t.fullName}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
              <Button type="submit" disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? 'Simpan' : 'Buat Kelas'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(v: boolean) => !v && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" />Konfirmasi Hapus
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#355a4e]">
            Hapus kelas <b>{deleteTarget?.name}</b>? Tindakan ini tidak bisa dibatalkan.
            Jika kelas masih memiliki siswa/absensi/jadwal, hapus akan ditolak — gunakan
            tombol Nonaktifkan sebagai gantinya.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>Batal</Button>
            <Button type="button" onClick={handleDelete} disabled={busy} className="bg-rose-600 hover:bg-rose-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Hapus Permanen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
