'use client';

// =============================================================================
// JadwalForm — dialog tambah/edit slot jadwal (SA/TU)
// Create: pilih penugasan (kelas+mapel+guru) → hari/JP/ruang/semester.
// Edit: hanya atribut slot (hari/JP/ruang/semester) — sesuai kontrak API.
// Konflik (409) dari API ditampilkan apa adanya (sumber kebenaran = server).
// =============================================================================

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { createSchedule, deleteSchedule, updateSchedule } from '../actions';
import type { ScheduleItem } from './JadwalMatrix';

export interface AssignmentOption {
  id: string;
  subject: string;
  academicYear: string;
  teacher: { user: { fullName: string } };
  class: { id: string; name: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ScheduleItem | null; // null = create
  assignments: AssignmentOption[];
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function JadwalFormDialog({ open, onOpenChange, schedule, assignments }: Props) {
  const isEdit = !!schedule;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [jpStart, setJpStart] = useState('1');
  const [jpEnd, setJpEnd] = useState('2');
  const [room, setRoom] = useState('');
  const [semester, setSemester] = useState('1');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setError('');
      setConfirmDelete(false);
      setAssignmentId('');
      setDayOfWeek(String(schedule?.dayOfWeek ?? 1));
      setJpStart(String(schedule?.jpStart ?? 1));
      setJpEnd(String(schedule?.jpEnd ?? 2));
      setRoom(schedule?.room ?? '');
      setSemester(String(schedule?.semester ?? 1));
    }
  }, [open, schedule]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let r;
    if (isEdit) {
      r = await updateSchedule(schedule!.id, {
        dayOfWeek: Number(dayOfWeek),
        jpStart: Number(jpStart),
        jpEnd: Number(jpEnd),
        room: room.trim() || null,
        semester: Number(semester),
      });
    } else {
      const asg = assignments.find((a) => a.id === assignmentId);
      if (!asg) {
        setError('Pilih penugasan (kelas + mapel + guru) dulu.');
        setLoading(false);
        return;
      }
      r = await createSchedule({
        classId: asg.class.id,
        teachingAssignmentId: asg.id,
        dayOfWeek: Number(dayOfWeek),
        jpStart: Number(jpStart),
        jpEnd: Number(jpEnd),
        room: room.trim() || null,
        academicYear: asg.academicYear,
        semester: Number(semester),
      });
    }

    setLoading(false);
    if (r.success) onOpenChange(false);
    else setError(('error' in r && r.error) || 'Gagal menyimpan jadwal');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Slot Jadwal' : 'Tambah Slot Jadwal'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `${schedule!.teachingAssignment.subject} · ${schedule!.class.name} — ubah hari/JP/ruang.`
              : 'Konflik guru/kelas/ruang dicek otomatis oleh server.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Penugasan (Kelas · Mapel · Guru)</Label>
              <Select value={assignmentId || undefined} onValueChange={(v: string) => setAssignmentId(v)}>
                <SelectTrigger><SelectValue placeholder="Pilih penugasan" /></SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.class.name} · {a.subject} · {a.teacher.user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {assignments.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Belum ada penugasan mengajar — buat dulu di modul Penugasan.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hari</Label>
              <Select value={dayOfWeek} onValueChange={(v: string) => setDayOfWeek(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select value={semester} onValueChange={(v: string) => setSemester(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ganjil (1)</SelectItem>
                  <SelectItem value="2">Genap (2)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="jp-start">JP Mulai</Label>
              <Input id="jp-start" type="number" min={1} max={12} required
                value={jpStart} onChange={(e) => setJpStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jp-end">JP Selesai</Label>
              <Input id="jp-end" type="number" min={1} max={12} required
                value={jpEnd} onChange={(e) => setJpEnd(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room">Ruang</Label>
              <Input id="room" placeholder="opsional"
                value={room} onChange={(e) => setRoom(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <div>
              {isEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={loading}
                  onClick={async () => {
                    if (!confirmDelete) { setConfirmDelete(true); return; }
                    setLoading(true);
                    const r = await deleteSchedule(schedule!.id);
                    setLoading(false);
                    if (r.success) onOpenChange(false);
                    else setError(('error' in r && r.error) || 'Gagal menghapus');
                  }}
                >
                  {confirmDelete ? 'Yakin? Hapus Permanen' : 'Hapus Slot'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={loading}
                onClick={() => onOpenChange(false)}>Batal</Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
