'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { detectConflicts } from './conflicts';
import JadwalFormDialog from './JadwalForm';
import { fetchScheduleList } from '../actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/ui/table-pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JP_SLOTS, fmtMin } from '@/lib/bell-times';

export interface ScheduleItem {
  id: string;
  classId: string;
  dayOfWeek: number;
  jpStart: number;
  jpEnd: number;
  room?: string | null;
  academicYear: string;
  semester: number;
  class: { id: string; name: string; majorCode: string; grade: number };
  teachingAssignment: {
    id: string;
    subject: string;
    teacher: { id: string; user: { fullName: string } };
  };
}

interface ClassOption {
  id: string;
  name: string;
  grade: number;
}

interface AcademicYearOption {
  id: string;
  code: string;
  isActive: boolean;
}

interface Props {
  initialSchedules: ScheduleItem[];
  initialTotal: number;
  initialPage: number;
  classes: ClassOption[];
  academicYears: AcademicYearOption[];
  initialAcademicYear: string;
  initialSemester: number;
  isStaff: boolean;
  canManage?: boolean;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const LIST_PAGE_SIZE = 20;
const CLASS_MATRIX_LIMIT = 100;

const SUBJECT_COLORS = [
  'bg-blue-50 border-blue-200 text-blue-900',
  'bg-emerald-50 border-emerald-200 text-emerald-900',
  'bg-amber-50 border-amber-200 text-amber-900',
  'bg-violet-50 border-violet-200 text-violet-900',
  'bg-rose-50 border-rose-200 text-rose-900',
  'bg-cyan-50 border-cyan-200 text-cyan-900',
  'bg-lime-50 border-lime-200 text-lime-900',
  'bg-orange-50 border-orange-200 text-orange-900',
];

function subjectColor(subject: string): string {
  let hash = 0;
  for (let index = 0; index < subject.length; index += 1) {
    hash = (hash * 31 + subject.charCodeAt(index)) >>> 0;
  }
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length]!;
}

export default function JadwalMatrix({
  initialSchedules,
  initialTotal,
  initialPage,
  classes,
  academicYears,
  initialAcademicYear,
  initialSemester,
  isStaff,
  canManage = false,
}: Props) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [classFilter, setClassFilter] = useState('all');
  const [academicYear, setAcademicYear] = useState(initialAcademicYear || 'all');
  const [semester, setSemester] = useState(String(initialSemester));
  const [classSearch, setClassSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const hydratedInitialList = useRef(true);

  const filteredClasses = useMemo(() => {
    const needle = classSearch.trim().toLocaleLowerCase('id-ID');
    return classes
      .filter((kelas) => !needle || kelas.name.toLocaleLowerCase('id-ID').includes(needle))
      .sort((left, right) => left.name.localeCompare(right.name, 'id-ID'));
  }, [classSearch, classes]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const matrixMode = classFilter !== 'all';
    const result = await fetchScheduleList({
      page: matrixMode ? 1 : page,
      limit: matrixMode ? CLASS_MATRIX_LIMIT : LIST_PAGE_SIZE,
      classId: matrixMode ? classFilter : undefined,
      academicYear: academicYear === 'all' ? undefined : academicYear,
      semester: semester === 'all' ? undefined : Number(semester),
    });
    setLoading(false);
    if (!result.success) {
      setLoadError(result.error || 'Jadwal gagal dimuat.');
      return;
    }
    const payload = result.data as { data: ScheduleItem[]; total: number; page: number };
    setSchedules(payload.data ?? []);
    setTotal(payload.total ?? 0);
  }, [academicYear, classFilter, page, semester]);

  useEffect(() => {
    if (hydratedInitialList.current) {
      hydratedInitialList.current = false;
      return;
    }
    void reload();
  }, [reload]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (item: ScheduleItem) => {
    if (!canManage) return;
    setEditing(item);
    setFormOpen(true);
  };
  const updateClassFilter = (value: string) => {
    setClassFilter(value);
    setPage(1);
  };
  const conflicts = useMemo(() => detectConflicts(schedules), [schedules]);
  const totalConflicts = conflicts.size;
  const matrixMode = classFilter !== 'all';
  const matrixComplete = !matrixMode || total <= CLASS_MATRIX_LIMIT;

  const cellOf = (day: number, jp: number): ScheduleItem | undefined =>
    schedules.find(
      (schedule) => schedule.dayOfWeek === day && jp >= schedule.jpStart && jp <= schedule.jpEnd,
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-emerald-700">Operasional Akademik</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950">
            <CalendarDays className="h-6 w-6" /> Jadwal Pelajaran
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {total} slot sesuai filter
            {totalConflicts > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-medium text-rose-700">
                <AlertTriangle className="h-3.5 w-3.5" /> {totalConflicts} konflik pada tampilan
              </span>
            )}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Slot
          </Button>
        )}
      </header>

      <section
        aria-label="Filter jadwal"
        className="grid gap-3 border-b border-slate-200 pb-5 md:grid-cols-2 xl:grid-cols-4"
      >
        {isStaff && classes.length > 0 && (
          <div className="space-y-2 md:col-span-2 xl:col-span-1">
            {classes.length > 10 && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={classSearch}
                  onChange={(event) => setClassSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Cari kelas"
                  aria-label="Cari pilihan kelas"
                />
              </div>
            )}
            <Select value={classFilter} onValueChange={updateClassFilter}>
              <SelectTrigger aria-label="Filter kelas">
                <SelectValue placeholder="Pilih kelas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kelas</SelectItem>
                {filteredClasses.map((kelas) => (
                  <SelectItem key={kelas.id} value={kelas.id}>
                    {kelas.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Select
          value={academicYear}
          onValueChange={(value: string) => {
            setAcademicYear(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter tahun ajaran">
            <SelectValue placeholder="Tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua tahun ajaran</SelectItem>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.code}>
                {year.code}
                {year.isActive ? ' (aktif)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={semester}
          onValueChange={(value: string) => {
            setSemester(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter semester">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua semester</SelectItem>
            <SelectItem value="1">Semester 1 · Ganjil</SelectItem>
            <SelectItem value="2">Semester 2 · Genap</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {loadError && (
        <div
          className="flex flex-col gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {loadError}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Muat Ulang
          </Button>
        </div>
      )}
      {!matrixComplete && (
        <div
          className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          role="status"
        >
          Kelas ini memiliki lebih dari {CLASS_MATRIX_LIMIT} slot. Gunakan filter tahun ajaran dan
          semester agar matriks lengkap.
        </div>
      )}

      <div className="relative" aria-busy={loading}>
        {loading && (
          <div className="absolute inset-x-0 top-0 z-10 h-1 animate-pulse bg-emerald-600" />
        )}
        {schedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-600">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-slate-400" />
              <p className="font-medium text-slate-800">Belum ada jadwal untuk filter ini</p>
              {canManage && (
                <p className="mt-1 text-sm">Tambahkan slot dari penugasan mengajar yang aktif.</p>
              )}
            </CardContent>
          </Card>
        ) : !matrixMode ? (
          <ListView
            items={schedules}
            conflicts={conflicts}
            onEdit={canManage ? openEdit : undefined}
          />
        ) : (
          <Card>
            <CardContent className="overflow-x-auto pt-4">
              <table className="w-full border-separate text-xs" style={{ borderSpacing: 3 }}>
                <thead>
                  <tr>
                    <th scope="col" className="w-24 text-left font-medium text-slate-500">
                      Jam
                    </th>
                    {DAYS.map((day) => (
                      <th key={day} scope="col" className="min-w-32 font-semibold text-slate-700">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {JP_SLOTS.map((slot) => (
                    <tr key={slot.jp}>
                      <th scope="row" className="align-top text-left font-medium text-slate-500">
                        <span className="block">JP {slot.jp}</span>
                        <span className="block text-[10px] font-normal">
                          {fmtMin(slot.startMin)}–{fmtMin(slot.endMin)}
                        </span>
                      </th>
                      {DAYS.map((_, dayIndex) => {
                        const day = dayIndex + 1;
                        const item = cellOf(day, slot.jp);
                        if (!item)
                          return (
                            <td
                              key={day}
                              className="h-11 rounded bg-slate-50"
                              aria-label={`${DAYS[dayIndex]} JP ${slot.jp} kosong`}
                            />
                          );
                        if (item.jpStart !== slot.jp) return null;
                        const conflict = conflicts.get(item.id);
                        const span = item.jpEnd - item.jpStart + 1;
                        const details = `${item.teachingAssignment.subject} · ${item.teachingAssignment.teacher.user.fullName}${item.room ? ` · ${item.room}` : ''}`;
                        const content = (
                          <>
                            <p className="font-semibold leading-tight">
                              {conflict && (
                                <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />
                              )}
                              {item.teachingAssignment.subject}
                            </p>
                            <p className="text-[11px] leading-tight opacity-80">
                              {item.teachingAssignment.teacher.user.fullName}
                            </p>
                            {item.room && (
                              <p className="text-[10px] leading-tight opacity-70">{item.room}</p>
                            )}
                            {conflict && (
                              <p className="mt-0.5 text-[10px] font-medium leading-tight">
                                BENTROK
                              </p>
                            )}
                          </>
                        );
                        const itemClass = `block h-full w-full rounded border px-2 py-1.5 text-left ${
                          conflict
                            ? 'border-rose-300 bg-rose-50 text-rose-900'
                            : subjectColor(item.teachingAssignment.subject)
                        }`;
                        return (
                          <td key={day} rowSpan={span} className="p-0 align-top">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => openEdit(item)}
                                aria-label={`Edit jadwal ${item.teachingAssignment.subject}, ${DAYS[dayIndex]}, JP ${item.jpStart}–${item.jpEnd}, kelas ${item.class.name}${conflict ? `. Bentrok: ${conflict.join('; ')}` : ''}`}
                                title={details}
                                className={`${itemClass} cursor-pointer hover:ring-2 hover:ring-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2`}
                                style={{ minHeight: `${Math.max(2.75, span * 2.5)}rem` }}
                              >
                                {content}
                              </button>
                            ) : (
                              <div
                                title={details}
                                className={itemClass}
                                style={{ minHeight: `${Math.max(2.75, span * 2.5)}rem` }}
                              >
                                {content}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                Pemeriksaan konflik final dilakukan server saat jadwal disimpan.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {!matrixMode && (
        <TablePagination page={page} limit={LIST_PAGE_SIZE} total={total} onPage={setPage} />
      )}

      {canManage && (
        <JadwalFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          schedule={editing}
          academicYear={academicYear === 'all' ? undefined : academicYear}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}

function ListView({
  items,
  conflicts,
  onEdit,
}: {
  items: ScheduleItem[];
  conflicts: Map<string, string[]>;
  onEdit?: (item: ScheduleItem) => void;
}) {
  const byDay = DAYS.map((label, index) => ({
    label,
    items: items
      .filter((schedule) => schedule.dayOfWeek === index + 1)
      .sort(
        (left, right) =>
          left.jpStart - right.jpStart || left.class.name.localeCompare(right.class.name, 'id-ID'),
      ),
  })).filter((day) => day.items.length > 0);

  return (
    <div className="space-y-4">
      {byDay.map((day) => (
        <Card key={day.label}>
          <CardContent className="pt-4">
            <h2 className="mb-2 font-semibold text-slate-800">{day.label}</h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {day.items.map((schedule) => {
                const conflict = conflicts.get(schedule.id);
                const content = (
                  <>
                    <div>
                      <span className="font-semibold">{schedule.class.name}</span>
                      <span className="text-slate-500">
                        {' '}
                        · JP {schedule.jpStart}–{schedule.jpEnd} ·{' '}
                      </span>
                      <span>{schedule.teachingAssignment.subject}</span>
                      <span className="text-slate-500">
                        {' '}
                        ({schedule.teachingAssignment.teacher.user.fullName})
                      </span>
                      {schedule.room && (
                        <span className="block text-[11px] text-slate-500">{schedule.room}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {conflict && (
                        <Badge variant="destructive">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          Bentrok
                        </Badge>
                      )}
                      {onEdit && (
                        <Pencil className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      )}
                    </div>
                  </>
                );
                const className = `flex w-full items-center justify-between gap-2 rounded border px-2.5 py-2 text-left text-xs ${
                  conflict
                    ? 'border-rose-300 bg-rose-50 text-rose-900'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`;
                return onEdit ? (
                  <button
                    key={schedule.id}
                    type="button"
                    title={conflict?.join('; ')}
                    aria-label={`Edit jadwal ${schedule.teachingAssignment.subject}, ${day.label}, JP ${schedule.jpStart}–${schedule.jpEnd}, kelas ${schedule.class.name}${conflict ? `. Bentrok: ${conflict.join('; ')}` : ''}`}
                    onClick={() => onEdit(schedule)}
                    className={`${className} hover:ring-2 hover:ring-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2`}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={schedule.id} title={conflict?.join('; ')} className={className}>
                    {content}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
