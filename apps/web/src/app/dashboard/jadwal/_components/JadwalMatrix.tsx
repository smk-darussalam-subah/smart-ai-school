'use client';

// =============================================================================
// JadwalMatrix — Jadwal Pelajaran tampilan matrix JP × Hari
// (referensi KamilEdu Modul 6: Jadwal List & Matrix + deteksi bentrok)
//
// Desain (ui-ux-pro-max): data-dense + minimalism; warna lembut per mapel
// (hash deterministik), bentrok = merah + ikon + teks (bukan warna saja, a11y);
// matrix per kelas (staf memilih kelas; GURU melihat jadwal sendiri lintas kelas).
// =============================================================================

import { useMemo, useState } from 'react';
import { detectConflicts } from './conflicts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export interface ScheduleItem {
  id: string;
  classId: string;
  dayOfWeek: number; // 1=Senin .. 6=Sabtu
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

interface Props {
  schedules: ScheduleItem[];
  classes: ClassOption[];
  isStaf: boolean;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Palet lembut deterministik per mapel (kontras teks gelap — WCAG-friendly)
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
  let h = 0;
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!;
}

export default function JadwalMatrix({ schedules, classes, isStaf }: Props) {
  const classOptions = useMemo<ClassOption[]>(() => {
    if (classes.length > 0) return classes;
    // non-staf: turunkan opsi dari jadwal yang visible
    const seen = new Map<string, ClassOption>();
    for (const s of schedules) {
      if (!seen.has(s.classId)) {
        seen.set(s.classId, { id: s.classId, name: s.class.name, grade: s.class.grade });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [classes, schedules]);

  const semesters = useMemo(
    () => [...new Set(schedules.map((s) => s.semester))].sort(),
    [schedules],
  );

  const [classFilter, setClassFilter] = useState<string>(classOptions[0]?.id ?? 'all');
  const [semesterFilter, setSemesterFilter] = useState<string>('all');

  const conflicts = useMemo(() => detectConflicts(schedules), [schedules]);
  const totalConflicts = conflicts.size;

  const visible = schedules.filter(
    (s) =>
      (classFilter === 'all' || s.classId === classFilter) &&
      (semesterFilter === 'all' || String(s.semester) === semesterFilter),
  );

  const maxJp = Math.max(8, ...visible.map((s) => s.jpEnd));
  const jpRows = Array.from({ length: maxJp }, (_, i) => i + 1);

  // (hari|jp) → item yang MENUTUPI slot tsb (untuk rowSpan, render hanya di jpStart)
  const cellOf = (day: number, jp: number): ScheduleItem | undefined =>
    visible.find((s) => s.dayOfWeek === day && jp >= s.jpStart && jp <= s.jpEnd);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">📅 Jadwal Pelajaran</h1>
          <p className="text-sm text-muted-foreground">
            {schedules.length} slot jadwal
            {totalConflicts > 0 && (
              <span className="text-destructive font-medium"> · ⚠ {totalConflicts} slot bentrok</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={classFilter} onValueChange={(v: string) => setClassFilter(v)}>
            <SelectTrigger className="w-44" aria-label="Filter kelas">
              <SelectValue placeholder="Pilih kelas" />
            </SelectTrigger>
            <SelectContent>
              {isStaf && <SelectItem value="all">Semua Kelas (list)</SelectItem>}
              {classOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {semesters.length > 1 && (
            <Select value={semesterFilter} onValueChange={(v: string) => setSemesterFilter(v)}>
              <SelectTrigger className="w-36" aria-label="Filter semester">
                <SelectValue placeholder="Semester" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Semester</SelectItem>
                {semesters.map((s) => (
                  <SelectItem key={s} value={String(s)}>Semester {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Belum ada jadwal untuk filter ini.
          </CardContent>
        </Card>
      ) : classFilter === 'all' ? (
        <ListView items={visible} conflicts={conflicts} />
      ) : (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            <table className="w-full text-xs border-separate" style={{ borderSpacing: 3 }}>
              <thead>
                <tr>
                  <th scope="col" className="w-10 text-gray-400 font-medium">JP</th>
                  {DAYS.map((d) => (
                    <th key={d} scope="col" className="font-semibold text-gray-600 min-w-[7.5rem]">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jpRows.map((jp) => (
                  <tr key={jp}>
                    <th scope="row" className="text-gray-400 font-medium text-center align-top pt-2">{jp}</th>
                    {DAYS.map((_, di) => {
                      const day = di + 1;
                      const item = cellOf(day, jp);
                      if (!item) {
                        return <td key={day} className="rounded bg-gray-50 h-9" aria-label="kosong" />;
                      }
                      if (item.jpStart !== jp) return null; // dicakup rowSpan
                      const conflict = conflicts.get(item.id);
                      const span = item.jpEnd - item.jpStart + 1;
                      return (
                        <td
                          key={day}
                          rowSpan={span}
                          title={conflict ? conflict.join('; ') : `${item.teachingAssignment.subject} · ${item.teachingAssignment.teacher.user.fullName}${item.room ? ` · ${item.room}` : ''}`}
                          className={`rounded border px-2 py-1.5 align-top ${
                            conflict
                              ? 'bg-red-50 border-red-300 text-red-900'
                              : subjectColor(item.teachingAssignment.subject)
                          }`}
                        >
                          <p className="font-semibold leading-tight">
                            {conflict && <span aria-label="bentrok">⚠ </span>}
                            {item.teachingAssignment.subject}
                          </p>
                          <p className="text-[11px] opacity-80 leading-tight">
                            {item.teachingAssignment.teacher.user.fullName}
                          </p>
                          {item.room && (
                            <p className="text-[10px] opacity-60 leading-tight">{item.room}</p>
                          )}
                          {conflict && (
                            <p className="text-[10px] font-medium leading-tight mt-0.5">BENTROK</p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-400 mt-2">
              JP = jam pelajaran (template mingguan). Sel merah = bentrok guru/kelas — arahkan kursor untuk detail.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── List view (Semua Kelas, staf): kompak per hari ───────────────────────────
function ListView({ items, conflicts }: { items: ScheduleItem[]; conflicts: Map<string, string[]> }) {
  const byDay = DAYS.map((label, i) => ({
    label,
    items: items
      .filter((s) => s.dayOfWeek === i + 1)
      .sort((a, b) => a.jpStart - b.jpStart || a.class.name.localeCompare(b.class.name)),
  })).filter((d) => d.items.length > 0);

  return (
    <div className="space-y-4">
      {byDay.map((day) => (
        <Card key={day.label}>
          <CardContent className="pt-4">
            <h2 className="font-semibold text-gray-700 mb-2">{day.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {day.items.map((s) => {
                const conflict = conflicts.get(s.id);
                return (
                  <div
                    key={s.id}
                    title={conflict?.join('; ')}
                    className={`rounded border px-2.5 py-1.5 text-xs flex items-center justify-between gap-2 ${
                      conflict ? 'bg-red-50 border-red-300 text-red-900' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div>
                      <span className="font-semibold">{s.class.name}</span>
                      <span className="opacity-70"> · JP {s.jpStart}–{s.jpEnd} · </span>
                      <span>{s.teachingAssignment.subject}</span>
                      <span className="opacity-60"> ({s.teachingAssignment.teacher.user.fullName})</span>
                    </div>
                    {conflict && <Badge variant="destructive">⚠ Bentrok</Badge>}
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
