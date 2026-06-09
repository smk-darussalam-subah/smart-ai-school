'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { createGrade, createAttendance } from '../actions';

interface Grade {
  id: string; studentId: string; semester: number; academicYear: string;
  score: string; type: string; notes: string | null;
  student: { nis: string; user: { fullName: string } };
  assignment: { subject: string; class: { name: string } };
}

interface Attendance {
  id: string; date: string; status: string; notes: string | null;
  student: { nis: string; user: { fullName: string } };
  class: { name: string };
}

interface Props {
  grades: Grade[]; attendances: Attendance[];
  classes: { id: string; name: string }[];
  assignments: { id: string; subject: string }[];
  canManage: boolean;
}

const SCORE_COLOR = (s: number) => s >= 85 ? 'text-green-700' : s >= 70 ? 'text-blue-700' : 'text-red-600';
const TYPE_LABEL: Record<string, string> = { uts: 'UTS', uh: 'UH', uas: 'UAS', praktik: 'Praktik', sikap: 'Sikap' };
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  hadir: { label: 'Hadir', variant: 'default' }, izin: { label: 'Izin', variant: 'secondary' },
  sakit: { label: 'Sakit', variant: 'outline' }, alpha: { label: 'Alpha', variant: 'destructive' },
};

export default function AkademikClient({ grades, attendances, classes, assignments, canManage }: Props) {
  const [tab, setTab] = useState<'grades' | 'attendance'>('grades');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [gradeOpen, setGradeOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submitGrade = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setLoading(true); setError('');
    const f = new FormData(e.currentTarget);
    const r = await createGrade({
      studentId: f.get('studentId') as string, assignmentId: f.get('assignmentId') as string,
      semester: Number(f.get('semester')), academicYear: f.get('academicYear') as string,
      score: Number(f.get('score')), type: f.get('type') as string,
      notes: (f.get('notes') as string) || undefined,
    });
    setLoading(false); if (r?.success) setGradeOpen(false); else setError(r?.error || 'Gagal');
  };

  const submitAttendance = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setLoading(true); setError('');
    const f = new FormData(e.currentTarget);
    const studentIds = (f.get('studentIds') as string).split(',').map(s => s.trim()).filter(Boolean);
    const status = f.get('status') as string;
    const r = await createAttendance({
      classId: f.get('classId') as string, date: f.get('date') as string,
      records: studentIds.map(sid => ({ studentId: sid, status })),
    });
    setLoading(false); if (r?.success) setAttendanceOpen(false); else setError(r?.error || 'Gagal');
  };

  const filteredGrades = grades.filter(g => {
    const matchSearch = !search || g.student.user.fullName.toLowerCase().includes(search.toLowerCase()) || g.student.nis.includes(search);
    const matchClass = classFilter === 'all' || g.assignment.class.name === classFilter;
    return matchSearch && matchClass;
  });

  const filteredAttendance = attendances.filter(a => {
    const matchSearch = !search || a.student.user.fullName.toLowerCase().includes(search.toLowerCase());
    const matchClass = classFilter === 'all' || a.class.name === classFilter;
    return matchSearch && matchClass;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Akademik</h1>

      <div className="flex gap-2 border-b pb-2">
        {(['grades', 'attendance'] as const).map(t => (
          <Button key={t} variant={tab === t ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t)}
            className={tab === t ? 'bg-smk-blue hover:bg-primary-700' : ''}>
            {t === 'grades' ? '📝 Nilai' : '📅 Absensi'}
          </Button>
        ))}
        {canManage && <div className="ml-auto">
          <Button size="sm" className="bg-smk-blue hover:bg-primary-700" onClick={() => tab === 'grades' ? setGradeOpen(true) : setAttendanceOpen(true)}>
            + {tab === 'grades' ? 'Input Nilai' : 'Input Absensi'}
          </Button>
        </div>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input placeholder="Cari siswa..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Semua Kelas" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kelas</SelectItem>
            {classes.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {tab === 'grades' ? (
        <div className="rounded-xl border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Siswa</TableHead><TableHead>Mapel</TableHead><TableHead className="hidden sm:table-cell">Kelas</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Nilai</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredGrades.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Belum ada data nilai</TableCell></TableRow>
              ) : filteredGrades.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.student.user.fullName}</TableCell>
                  <TableCell>{g.assignment.subject}</TableCell>
                  <TableCell className="hidden sm:table-cell">{g.assignment.class.name}</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABEL[g.type] ?? g.type}</Badge></TableCell>
                  <TableCell className={`text-right font-bold ${SCORE_COLOR(Number(g.score))}`}>{g.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Siswa</TableHead><TableHead className="hidden sm:table-cell">Kelas</TableHead><TableHead>Tanggal</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filteredAttendance.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Belum ada data absensi</TableCell></TableRow>
              ) : filteredAttendance.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.student.user.fullName}</TableCell>
                  <TableCell className="hidden sm:table-cell">{a.class.name}</TableCell>
                  <TableCell>{new Date(a.date).toLocaleDateString('id')}</TableCell>
                  <TableCell><Badge variant={STATUS_MAP[a.status]?.variant ?? 'secondary'}>{STATUS_MAP[a.status]?.label ?? a.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Input Nilai</DialogTitle></DialogHeader>
          <form onSubmit={submitGrade} className="space-y-3">
            <div><Label htmlFor="studentId">Student ID</Label><Input id="studentId" name="studentId" required /></div>
            <div><Label htmlFor="assignmentId">Mapel</Label>
              <Select name="assignmentId">
                <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                <SelectContent>{assignments.map(a => <SelectItem key={a.id} value={a.id}>{a.subject}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="type">Tipe</Label>
                <Select name="type" defaultValue="uh">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label htmlFor="score">Nilai</Label><Input id="score" name="score" type="number" min={0} max={100} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="semester">Semester</Label>
                <Select name="semester" defaultValue="1"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select>
              </div>
              <div><Label htmlFor="academicYear">TA</Label><Input id="academicYear" name="academicYear" defaultValue="2026/2027" required /></div>
            </div>
            <div><Label htmlFor="notes">Catatan</Label><Input id="notes" name="notes" /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setGradeOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Input Absensi</DialogTitle></DialogHeader>
          <form onSubmit={submitAttendance} className="space-y-3">
            <div><Label htmlFor="classId">Kelas</Label>
              <Select name="classId"><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label htmlFor="date">Tanggal</Label><Input id="date" name="date" type="date" required /></div>
            <div><Label htmlFor="status">Status</Label>
              <Select name="status" defaultValue="hadir"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label htmlFor="studentIds">Student IDs (koma)</Label><Input id="studentIds" name="studentIds" placeholder="uuid1, uuid2, ..." required /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setAttendanceOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
