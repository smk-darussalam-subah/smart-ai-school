'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Loader2, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import {
  createAssignment,
  deleteAssignment,
  fetchTeachingAssignments,
  updateAssignment,
} from '../actions';
import { getScheduleReadiness } from './teaching-assignment-readiness';

export interface TeachingAssignmentItem {
  id: string;
  teacherId: string;
  classId: string;
  subject: string;
  hoursPerWeek: number;
  academicYear: string;
  teacher: {
    id: string;
    user: { fullName: string; email: string; staff: { niy: string | null } | null };
  };
  class: { id: string; name: string; majorCode: string; grade: number };
  schedules: Array<{ id: string; semester: number; jpStart: number; jpEnd: number }>;
}

export interface TeachingAssignmentOptions {
  teachers: Array<{ id: string; user: { fullName: string; staff: { niy: string | null } | null } }>;
  classes: Array<{
    id: string;
    name: string;
    grade: number;
    majorCode: string;
    academicYear: string;
  }>;
  subjects: Array<{ id: string; code: string; name: string }>;
  academicYears: Array<{ id: string; code: string; isActive: boolean }>;
  scope?: { type: 'global' | 'major'; labels: string[] };
}

interface Props {
  initialItems: TeachingAssignmentItem[];
  initialTotal: number;
  options: TeachingAssignmentOptions;
  canManage: boolean;
  canDelete: boolean;
}

interface FormState {
  teacherId: string;
  classId: string;
  subject: string;
  academicYear: string;
  hoursPerWeek: string;
}

const PAGE_SIZE = 20;
const EMPTY_FORM: FormState = {
  teacherId: '',
  classId: '',
  subject: '',
  academicYear: '',
  hoursPerWeek: '2',
};

export default function TeachingAssignmentManager({
  initialItems,
  initialTotal,
  options,
  canManage,
  canDelete,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('all');
  const [classId, setClassId] = useState('all');
  const [loadingList, setLoadingList] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TeachingAssignmentItem | null>(null);
  const [deleting, setDeleting] = useState<TeachingAssignmentItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const hydratedInitialList = useRef(true);

  const reload = useCallback(
    async (nextPage: number, nextSearch: string, nextYear: string, nextClass: string) => {
      setLoadingList(true);
      const result = await fetchTeachingAssignments({
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch.trim() || undefined,
        academicYear: nextYear === 'all' ? undefined : nextYear,
        classId: nextClass === 'all' ? undefined : nextClass,
      });
      setLoadingList(false);
      if (!result.success) {
        toast.error(result.error ?? 'Daftar penugasan gagal dimuat.');
        return;
      }
      const payload = result.data as { data: TeachingAssignmentItem[]; total: number };
      setItems(payload.data ?? []);
      setTotal(payload.total ?? 0);
    },
    [],
  );

  useEffect(() => {
    if (hydratedInitialList.current) {
      hydratedInitialList.current = false;
      return;
    }
    const timer = window.setTimeout(() => void reload(page, search, year, classId), 250);
    return () => window.clearTimeout(timer);
  }, [classId, page, reload, search, year]);

  const activeYear = options.academicYears.find((item) => item.isActive)?.code ?? '';
  const selectedClass = useMemo(
    () => options.classes.find((item) => item.id === form.classId),
    [form.classId, options.classes],
  );

  const openCreate = () => {
    setEditing(null);
    setError('');
    setForm({ ...EMPTY_FORM, academicYear: activeYear });
    setDialogOpen(true);
  };

  const openEdit = (item: TeachingAssignmentItem) => {
    setEditing(item);
    setError('');
    setForm({
      teacherId: item.teacherId,
      classId: item.classId,
      subject: item.subject,
      academicYear: item.academicYear,
      hoursPerWeek: String(item.hoursPerWeek),
    });
    setDialogOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const hoursPerWeek = Number(form.hoursPerWeek);
    if (!form.teacherId || !form.classId || !form.subject || !form.academicYear) {
      setError('Guru, kelas, mata pelajaran, dan tahun ajaran wajib dipilih.');
      return;
    }
    if (!Number.isInteger(hoursPerWeek) || hoursPerWeek < 1 || hoursPerWeek > 40) {
      setError('JP per minggu harus berupa angka 1 sampai 40.');
      return;
    }
    setSaving(true);
    const result = editing
      ? await updateAssignment(editing.id, {
          subject: form.subject,
          academicYear: form.academicYear,
          hoursPerWeek,
        })
      : await createAssignment({
          teacherId: form.teacherId,
          classId: form.classId,
          subject: form.subject,
          academicYear: form.academicYear,
          hoursPerWeek,
        });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Penugasan gagal disimpan.');
      return;
    }
    setDialogOpen(false);
    toast.success(editing ? 'Penugasan diperbarui.' : 'Penugasan mengajar dibuat.');
    await reload(page, search, year, classId);
  };

  return (
    <section className="space-y-4" aria-labelledby="teaching-assignment-heading">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="teaching-assignment-heading" className="text-xl font-semibold text-slate-950">
            Penugasan Mengajar
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Guru, kelas, mata pelajaran, tahun ajaran, dan JP mingguan.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="shrink-0">
            <Plus className="mr-2 h-4 w-4" /> Tambah Penugasan
          </Button>
        )}
      </div>

      <div className="grid gap-3 border-y border-slate-200 py-4 md:grid-cols-[minmax(14rem,1fr)_12rem_14rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="pl-9"
            placeholder="Cari guru, kelas, atau mapel"
            aria-label="Cari penugasan"
          />
        </div>
        <Select
          value={year}
          onValueChange={(value: string) => {
            setYear(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter tahun ajaran">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tahun</SelectItem>
            {options.academicYears.map((item) => (
              <SelectItem key={item.id} value={item.code}>
                {item.code}
                {item.isActive ? ' (aktif)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={classId}
          onValueChange={(value: string) => {
            setClassId(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter kelas">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kelas</SelectItem>
            {options.classes.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative overflow-x-auto rounded-md border border-slate-200">
        {loadingList && (
          <div
            className="absolute inset-x-0 top-0 z-10 flex h-1 items-center bg-slate-100"
            aria-label="Memuat daftar"
          >
            <div className="h-1 w-1/3 animate-pulse bg-emerald-600" />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guru</TableHead>
              <TableHead>Mata Pelajaran</TableHead>
              <TableHead>Kelas</TableHead>
              <TableHead>Tahun Ajaran</TableHead>
              <TableHead className="text-center">JP/Minggu</TableHead>
              <TableHead>Kesiapan Jadwal</TableHead>
              <TableHead className="w-24 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                  <p className="font-medium text-slate-800">Belum ada penugasan untuk filter ini</p>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const readiness = getScheduleReadiness(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <p className="font-medium text-slate-900">{item.teacher.user.fullName}</p>
                      <p className="text-xs text-slate-500">
                        NIY {item.teacher.user.staff?.niy ?? 'belum tersedia'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-slate-400" />
                        {item.subject}
                      </span>
                    </TableCell>
                    <TableCell>{item.class.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.academicYear}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{item.hoursPerWeek}</TableCell>
                    <TableCell>
                      <p className={`font-medium ${readiness.tone}`}>{readiness.label}</p>
                      <p className="text-xs text-slate-500">{readiness.detail}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(item)}
                            title="Edit penugasan"
                            aria-label={`Edit penugasan ${item.teacher.user.fullName}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleting(item)}
                            title="Hapus penugasan"
                            aria-label={`Hapus penugasan ${item.teacher.user.fullName}`}
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} limit={PAGE_SIZE} total={total} onPage={setPage} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open: boolean) => {
          if (!saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit Penugasan Mengajar' : 'Tambah Penugasan Mengajar'}
            </DialogTitle>
            <DialogDescription>
              Guru dan kelas tidak dapat diganti setelah dibuat. Perubahan konteks ditolak jika
              sudah dipakai data akademik.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Guru</Label>
              <Select
                value={form.teacherId}
                disabled={Boolean(editing)}
                onValueChange={(value: string) =>
                  setForm((current) => ({ ...current, teacherId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih guru aktif" />
                </SelectTrigger>
                <SelectContent>
                  {options.teachers.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.user.fullName} - NIY {teacher.user.staff?.niy ?? 'belum tersedia'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kelas</Label>
              <Select
                value={form.classId}
                disabled={Boolean(editing)}
                onValueChange={(value: string) => {
                  const kelas = options.classes.find((item) => item.id === value);
                  setForm((current) => ({
                    ...current,
                    classId: value,
                    academicYear: kelas?.academicYear ?? current.academicYear,
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kelas aktif" />
                </SelectTrigger>
                <SelectContent>
                  {options.classes.map((kelas) => (
                    <SelectItem key={kelas.id} value={kelas.id}>
                      {kelas.name} - {kelas.academicYear}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mata Pelajaran</Label>
              <Select
                value={form.subject}
                onValueChange={(value: string) =>
                  setForm((current) => ({ ...current, subject: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih mapel aktif" />
                </SelectTrigger>
                <SelectContent>
                  {options.subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.name}>
                      {subject.code} - {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignment-year">Tahun Ajaran</Label>
              <Input
                id="assignment-year"
                value={selectedClass?.academicYear ?? form.academicYear}
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignment-hours">JP per Minggu</Label>
              <Input
                id="assignment-hours"
                type="number"
                min={1}
                max={40}
                value={form.hoursPerWeek}
                onChange={(event) =>
                  setForm((current) => ({ ...current, hoursPerWeek: event.target.value }))
                }
              />
            </div>
            {error && (
              <p className="text-sm text-rose-700 sm:col-span-2" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarDays className="mr-2 h-4 w-4" />
                )}
                {editing ? 'Simpan Perubahan' : 'Buat Penugasan'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Hapus penugasan mengajar?"
        description={
          deleting
            ? `${deleting.teacher.user.fullName} - ${deleting.subject} - ${deleting.class.name}. Penghapusan akan ditolak bila sudah dipakai data akademik.`
            : ''
        }
        confirmLabel="Hapus Penugasan"
        variant="danger"
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteAssignment(deleting.id);
          if (!result.success) {
            toast.error(result.error ?? 'Penugasan gagal dihapus.');
            return;
          }
          toast.success('Penugasan dihapus.');
          setDeleting(null);
          await reload(page, search, year, classId);
        }}
      />
    </section>
  );
}
