'use client';

import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JP_SLOTS } from '@/lib/bell-times';
import {
  createSchedule,
  deleteSchedule,
  searchScheduleAssignments,
  updateSchedule,
} from '../actions';
import type { ScheduleItem } from './JadwalMatrix';
import { jpOptionLabel, normalizeRoomInput } from './schedule-ui';

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
  schedule: ScheduleItem | null;
  academicYear?: string;
  onSaved: () => void;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function JadwalFormDialog({
  open,
  onOpenChange,
  schedule,
  academicYear,
  onSaved,
}: Props) {
  const isEdit = Boolean(schedule);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [jpStart, setJpStart] = useState('1');
  const [jpEnd, setJpEnd] = useState('2');
  const [room, setRoom] = useState('');
  const [semester, setSemester] = useState('1');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOption[]>([]);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentOption | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(false);
    setSelectedAssignment(null);
    setAssignmentSearch('');
    setDayOfWeek(String(schedule?.dayOfWeek ?? 1));
    setJpStart(String(schedule?.jpStart ?? 1));
    setJpEnd(String(schedule?.jpEnd ?? 2));
    setRoom(schedule?.room ?? '');
    setSemester(String(schedule?.semester ?? 1));
  }, [open, schedule]);

  useEffect(() => {
    if (!open || isEdit || selectedAssignment) return;
    const timer = window.setTimeout(async () => {
      setLoadingAssignments(true);
      const result = await searchScheduleAssignments({
        search: assignmentSearch,
        academicYear,
        page: 1,
        limit: 20,
      });
      setLoadingAssignments(false);
      if (!result.success) {
        setAssignmentOptions([]);
        setAssignmentTotal(0);
        setError(result.error || 'Penugasan mengajar gagal dimuat.');
        return;
      }
      const payload = result.data as { data: AssignmentOption[]; total: number };
      setAssignmentOptions(payload.data ?? []);
      setAssignmentTotal(payload.total ?? 0);
      setError('');
    }, 250);
    return () => window.clearTimeout(timer);
  }, [academicYear, assignmentSearch, isEdit, open, selectedAssignment]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const start = Number(jpStart);
    const end = Number(jpEnd);
    if (end < start) {
      setError('JP selesai tidak boleh mendahului JP mulai.');
      return;
    }

    setLoading(true);
    const result = schedule
      ? await updateSchedule(schedule.id, {
          dayOfWeek: Number(dayOfWeek),
          jpStart: start,
          jpEnd: end,
          room: normalizeRoomInput(room),
          semester: Number(semester),
        })
      : selectedAssignment
        ? await createSchedule({
            classId: selectedAssignment.class.id,
            teachingAssignmentId: selectedAssignment.id,
            dayOfWeek: Number(dayOfWeek),
            jpStart: start,
            jpEnd: end,
            room: normalizeRoomInput(room),
            academicYear: selectedAssignment.academicYear,
            semester: Number(semester),
          })
        : { success: false as const, error: 'Pilih penugasan mengajar terlebih dahulu.' };
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Gagal menyimpan jadwal.');
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen: boolean) => {
          if (!loading) onOpenChange(nextOpen);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Slot Jadwal' : 'Tambah Slot Jadwal'}</DialogTitle>
            <DialogDescription>
              {schedule
                ? `${schedule.teachingAssignment.subject} · ${schedule.class.name}. Konflik tetap diperiksa server.`
                : 'Pilih penugasan yang sah, lalu tentukan hari, rentang JP, dan ruang.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="assignment-search">Penugasan (Kelas · Mapel · Guru)</Label>
                {selectedAssignment ? (
                  <div className="flex min-h-12 items-center justify-between gap-3 border border-slate-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {selectedAssignment.class.name} · {selectedAssignment.subject}
                      </p>
                      <p className="text-xs text-slate-500">
                        {selectedAssignment.teacher.user.fullName}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAssignment(null)}
                    >
                      Ganti
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        id="assignment-search"
                        value={assignmentSearch}
                        onChange={(event) => setAssignmentSearch(event.target.value)}
                        className="pl-9 pr-9"
                        placeholder="Cari kelas, mapel, atau nama guru"
                        autoComplete="off"
                      />
                      {loadingAssignments && (
                        <Loader2
                          className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-500"
                          aria-label="Mencari penugasan"
                        />
                      )}
                    </div>
                    <div
                      className="max-h-48 overflow-y-auto border border-slate-200"
                      role="listbox"
                      aria-label="Hasil penugasan mengajar"
                    >
                      {assignmentOptions.map((assignment) => (
                        <button
                          key={assignment.id}
                          type="button"
                          role="option"
                          aria-selected="false"
                          onClick={() => {
                            setSelectedAssignment(assignment);
                            setError('');
                          }}
                          className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                        >
                          <span className="block text-sm font-medium text-slate-900">
                            {assignment.class.name} · {assignment.subject}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {assignment.teacher.user.fullName} · {assignment.academicYear}
                          </span>
                        </button>
                      ))}
                      {!loadingAssignments && assignmentOptions.length === 0 && (
                        <p className="px-3 py-4 text-sm text-slate-500">
                          Tidak ada penugasan yang cocok.
                        </p>
                      )}
                    </div>
                    {assignmentTotal > assignmentOptions.length && (
                      <p className="text-xs text-slate-500">
                        Ketik pencarian yang lebih spesifik untuk menyaring {assignmentTotal}{' '}
                        penugasan.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hari</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index + 1)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Semester</Label>
                <Select value={semester} onValueChange={setSemester}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ganjil (1)</SelectItem>
                    <SelectItem value="2">Genap (2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>JP Mulai</Label>
                <Select
                  value={jpStart}
                  onValueChange={(value: string) => {
                    setJpStart(value);
                    if (Number(jpEnd) < Number(value)) setJpEnd(value);
                  }}
                >
                  <SelectTrigger aria-label="JP mulai">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JP_SLOTS.map((slot) => (
                      <SelectItem key={slot.jp} value={String(slot.jp)}>
                        {jpOptionLabel(slot)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>JP Selesai</Label>
                <Select value={jpEnd} onValueChange={setJpEnd}>
                  <SelectTrigger aria-label="JP selesai">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JP_SLOTS.filter((slot) => slot.jp >= Number(jpStart)).map((slot) => (
                      <SelectItem key={slot.jp} value={String(slot.jp)}>
                        {jpOptionLabel(slot)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room">Ruang</Label>
                <Input
                  id="room"
                  placeholder="Contoh: LAB 1"
                  maxLength={100}
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                  onBlur={() => setRoom(normalizeRoomInput(room) ?? '')}
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-2">
              <div>
                {isEdit && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={loading}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Hapus Slot
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => onOpenChange(false)}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={loading || (!isEdit && !selectedAssignment)}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Tambah'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Hapus slot jadwal?"
        description={
          schedule
            ? `${schedule.teachingAssignment.subject} · ${schedule.class.name}, JP ${schedule.jpStart}–${schedule.jpEnd}.`
            : ''
        }
        confirmLabel="Hapus Slot"
        variant="danger"
        onConfirm={async () => {
          if (!schedule) return;
          setLoading(true);
          const result = await deleteSchedule(schedule.id);
          setLoading(false);
          if (!result.success) {
            setError(result.error || 'Gagal menghapus jadwal.');
            return;
          }
          setConfirmDelete(false);
          onOpenChange(false);
          onSaved();
        }}
      />
    </>
  );
}
