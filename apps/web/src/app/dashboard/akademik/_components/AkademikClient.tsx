'use client';

import { useState, useRef, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { createGrade, createAttendance, createAssignment, createSubject } from '../actions';
import type { SubjectItem } from '../page';

interface Grade { id: string; studentId: string; semester: number; academicYear: string; score: string; type: string; notes: string | null; student: { nis: string; user: { fullName: string } }; assignment: { subject: string; class: { name: string } }; }
interface Attendance { id: string; date: string; status: string; notes: string | null; student: { nis: string; user: { fullName: string } }; class: { name: string }; }
interface Assignment { id: string; subject: string; class: { name: string }; }
interface Props {
  grades: Grade[];
  attendances: Attendance[];
  classes: { id: string; name: string }[];
  assignments: Assignment[];
  subjects: SubjectItem[];
  canManage: boolean;
  canEditAssignment: boolean;
}

const SCORE_COLOR = (s: number) => s >= 85 ? 'text-green-700' : s >= 70 ? 'text-blue-700' : 'text-red-600';
const TYPE_LABEL: Record<string, string> = { uts: 'UTS', uh: 'UH', uas: 'UAS', praktik: 'Praktik', sikap: 'Sikap' };
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  hadir: { label: 'Hadir', variant: 'default' }, izin: { label: 'Izin', variant: 'secondary' }, sakit: { label: 'Sakit', variant: 'outline' }, alpha: { label: 'Alpha', variant: 'destructive' },
};

interface GradeForm { studentId: string; assignmentId: string; type: string; score: string; semester: string; academicYear: string; notes: string; }
interface AttForm { classId: string; date: string; status: string; studentIds: string; }
interface AsgForm { teacherId: string; classId: string; subject: string; hoursPerWeek: string; academicYear: string; }

const emptyGrade: GradeForm = { studentId: '', assignmentId: '', type: 'uh', score: '', semester: '1', academicYear: '2026/2027', notes: '' };
const emptyAtt: AttForm = { classId: '', date: '', status: 'hadir', studentIds: '' };
const emptyAsg: AsgForm = { teacherId: '', classId: '', subject: '', hoursPerWeek: '2', academicYear: '2026/2027' };

// ── SubjectCombobox ─────────────────────────────────────────────────────────
// Dropdown + free-type. Bila teks tidak ada di list → prompt "Tambahkan?".

function SubjectCombobox({
  subjects, value, onChange,
}: {
  subjects: SubjectItem[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = subjects.filter(
    (s) => s.isActive && s.name.toLowerCase().includes(query.toLowerCase()),
  );
  const exactMatch = subjects.some((s) => s.name.toLowerCase() === query.toLowerCase());
  const showAdd = query.trim().length >= 2 && !exactMatch;

  const select = (name: string) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  const handleAddNew = async () => {
    const name = query.trim();
    const code = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'MAP';
    const r = await createSubject({ code, name });
    if (r.success) {
      select(name);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Ketik atau pilih mapel..."
        autoComplete="off"
      />
      {open && (filtered.length > 0 || showAdd) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
              onClick={() => select(s.name)}
            >
              <span>{s.name}</span>
              <span className="text-xs text-gray-400">{s.code}</span>
            </button>
          ))}
          {showAdd && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-smk-blue hover:bg-blue-50 border-t"
              onClick={handleAddNew}
            >
              + Tambahkan &quot;{query}&quot; sebagai mapel baru
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AkademikClient({ grades, attendances, classes, assignments, subjects, canManage, canEditAssignment }: Props) {
  const [tab, setTab] = useState<'grades' | 'attendance' | 'penugasan'>('grades');
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [gradeOpen, setGradeOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [gf, setGf] = useState<GradeForm>(emptyGrade);
  const [af, setAf] = useState<AttForm>(emptyAtt);
  const [asf, setAsf] = useState<AsgForm>(emptyAsg);

  const ug = (k: keyof GradeForm, v: string) => setGf(p => ({ ...p, [k]: v }));
  const ua = (k: keyof AttForm, v: string) => setAf(p => ({ ...p, [k]: v }));
  const uas = (k: keyof AsgForm, v: string) => setAsf(p => ({ ...p, [k]: v }));

  const submitGrade = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const r = await createGrade({ studentId: gf.studentId, assignmentId: gf.assignmentId, semester: Number(gf.semester), academicYear: gf.academicYear, score: Number(gf.score), type: gf.type, notes: gf.notes || undefined });
    setLoading(false); if (r?.success) { setGradeOpen(false); setGf(emptyGrade); } else setError(r?.error || 'Gagal');
  };

  const submitAttendance = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const ids = af.studentIds.split(',').map(s => s.trim()).filter(Boolean);
    const r = await createAttendance({ classId: af.classId, date: af.date, records: ids.map(sid => ({ studentId: sid, status: af.status })) });
    setLoading(false); if (r?.success) { setAttendanceOpen(false); setAf(emptyAtt); } else setError(r?.error || 'Gagal');
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const r = await createAssignment({ teacherId: asf.teacherId, classId: asf.classId, subject: asf.subject, hoursPerWeek: Number(asf.hoursPerWeek), academicYear: asf.academicYear });
    setLoading(false); if (r?.success) { setAssignmentOpen(false); setAsf(emptyAsg); } else setError(r?.error || 'Gagal');
  };

  const filteredGrades = grades.filter(g => { const m = !search || g.student.user.fullName.toLowerCase().includes(search.toLowerCase()) || g.student.nis.includes(search); const c = classFilter === 'all' || g.assignment.class.name === classFilter; return m && c; });
  const filteredAttendance = attendances.filter(a => { const m = !search || a.student.user.fullName.toLowerCase().includes(search.toLowerCase()); const c = classFilter === 'all' || a.class.name === classFilter; return m && c; });

  const addBtnLabel = tab === 'grades' ? 'Input Nilai' : tab === 'attendance' ? 'Input Absensi' : 'Tambah Penugasan';
  const canShowAddBtn = (tab === 'grades' || tab === 'attendance') ? canManage : canEditAssignment;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Akademik</h1>
      <div className="flex gap-2 border-b pb-2">
        <Button variant={tab === 'grades' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('grades')} className={tab === 'grades' ? 'bg-smk-blue hover:bg-primary-700' : ''}>📝 Nilai</Button>
        <Button variant={tab === 'attendance' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('attendance')} className={tab === 'attendance' ? 'bg-smk-blue hover:bg-primary-700' : ''}>📅 Absensi</Button>
        <Button variant={tab === 'penugasan' ? 'default' : 'ghost'} size="sm" onClick={() => setTab('penugasan')} className={tab === 'penugasan' ? 'bg-smk-blue hover:bg-primary-700' : ''}>📋 Penugasan</Button>
        {canShowAddBtn && (
          <div className="ml-auto">
            <Button size="sm" className="bg-smk-blue hover:bg-primary-700" onClick={() => { setError(''); tab === 'grades' ? setGradeOpen(true) : tab === 'attendance' ? setAttendanceOpen(true) : setAssignmentOpen(true); }}>
              + {addBtnLabel}
            </Button>
          </div>
        )}
      </div>

      {tab !== 'penugasan' && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Cari siswa..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Semua Kelas" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua Kelas</SelectItem>{classes.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {tab === 'grades' ? (
        <div className="rounded-xl border shadow-sm overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Mapel</TableHead><TableHead className="hidden sm:table-cell">Kelas</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Nilai</TableHead></TableRow></TableHeader>
          <TableBody>{filteredGrades.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">Belum ada data nilai</TableCell></TableRow>) : filteredGrades.map(g => (<TableRow key={g.id}><TableCell className="font-medium">{g.student.user.fullName}</TableCell><TableCell>{g.assignment.subject}</TableCell><TableCell className="hidden sm:table-cell">{g.assignment.class.name}</TableCell><TableCell><Badge variant="outline">{TYPE_LABEL[g.type] ?? g.type}</Badge></TableCell><TableCell className={`text-right font-bold ${SCORE_COLOR(Number(g.score))}`}>{g.score}</TableCell></TableRow>))}</TableBody></Table>
        </div>
      ) : tab === 'attendance' ? (
        <div className="rounded-xl border shadow-sm overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead className="hidden sm:table-cell">Kelas</TableHead><TableHead>Tanggal</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{filteredAttendance.length === 0 ? (<TableRow><TableCell colSpan={4} className="text-center h-24 text-muted-foreground">Belum ada data absensi</TableCell></TableRow>) : filteredAttendance.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{a.student.user.fullName}</TableCell><TableCell className="hidden sm:table-cell">{a.class.name}</TableCell><TableCell>{new Date(a.date).toLocaleDateString('id')}</TableCell><TableCell><Badge variant={STATUS_MAP[a.status]?.variant ?? 'secondary'}>{STATUS_MAP[a.status]?.label ?? a.status}</Badge></TableCell></TableRow>))}</TableBody></Table>
        </div>
      ) : (
        <div className="rounded-xl border shadow-sm overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Mapel</TableHead><TableHead>Kelas</TableHead></TableRow></TableHeader>
          <TableBody>{assignments.length === 0 ? (<TableRow><TableCell colSpan={2} className="text-center h-24 text-muted-foreground">Belum ada penugasan</TableCell></TableRow>) : assignments.map(a => (<TableRow key={a.id}><TableCell className="font-medium">{a.subject}</TableCell><TableCell>{a.class?.name ?? '-'}</TableCell></TableRow>))}</TableBody></Table>
        </div>
      )}

      <Dialog open={gradeOpen} onOpenChange={setGradeOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Input Nilai</DialogTitle><DialogDescription>Masukkan data nilai siswa.</DialogDescription></DialogHeader>
          <form onSubmit={submitGrade} className="space-y-3">
            <div><Label htmlFor="gsi">Student ID</Label><Input id="gsi" value={gf.studentId} onChange={e => ug('studentId', e.target.value)} required /></div>
            <div><Label>Mapel</Label>
              <Select value={gf.assignmentId} onValueChange={(v: string) => ug('assignmentId', v)}><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{assignments.map(a => <SelectItem key={a.id} value={a.id}>{a.subject}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipe</Label><Select value={gf.type} onValueChange={(v: string) => ug('type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="gsc">Nilai</Label><Input id="gsc" type="number" min={0} max={100} value={gf.score} onChange={e => ug('score', e.target.value)} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Semester</Label><Select value={gf.semester} onValueChange={(v: string) => ug('semester', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1</SelectItem><SelectItem value="2">2</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="gay">TA</Label><Input id="gay" value={gf.academicYear} onChange={e => ug('academicYear', e.target.value)} required /></div>
            </div>
            <div><Label htmlFor="gno">Catatan</Label><Input id="gno" value={gf.notes} onChange={e => ug('notes', e.target.value)} /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setGradeOpen(false)}>Batal</Button><Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Input Absensi</DialogTitle><DialogDescription>Masukkan data absensi untuk sekelompok siswa.</DialogDescription></DialogHeader>
          <form onSubmit={submitAttendance} className="space-y-3">
            <div><Label>Kelas</Label><Select value={af.classId} onValueChange={(v: string) => ua('classId', v)}><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="adate">Tanggal</Label><Input id="adate" type="date" value={af.date} onChange={e => ua('date', e.target.value)} required /></div>
            <div><Label>Status</Label><Select value={af.status} onValueChange={(v: string) => ua('status', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="asids">Student IDs (koma)</Label><Input id="asids" placeholder="uuid1, uuid2, ..." value={af.studentIds} onChange={e => ua('studentIds', e.target.value)} required /></div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setAttendanceOpen(false)}>Batal</Button><Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Tambah Penugasan — SubjectCombobox */}
      <Dialog open={assignmentOpen} onOpenChange={setAssignmentOpen}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Tambah Penugasan</DialogTitle><DialogDescription>Assign guru ke mapel dan kelas.</DialogDescription></DialogHeader>
          <form onSubmit={submitAssignment} className="space-y-3">
            <div><Label htmlFor="astid">Teacher ID</Label><Input id="astid" value={asf.teacherId} onChange={e => uas('teacherId', e.target.value)} placeholder="UUID guru" required /></div>
            <div><Label>Kelas</Label>
              <Select value={asf.classId} onValueChange={(v: string) => uas('classId', v)}>
                <SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger>
                <SelectContent>{classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mapel</Label>
              <SubjectCombobox subjects={subjects} value={asf.subject} onChange={(v) => uas('subject', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="ashpw">JP/Minggu</Label><Input id="ashpw" type="number" min={1} max={40} value={asf.hoursPerWeek} onChange={e => uas('hoursPerWeek', e.target.value)} required /></div>
              <div><Label htmlFor="asay">Tahun Ajaran</Label><Input id="asay" value={asf.academicYear} onChange={e => uas('academicYear', e.target.value)} placeholder="2026/2027" required /></div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setAssignmentOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading} className="bg-smk-blue hover:bg-primary-700">{loading ? 'Menyimpan...' : 'Simpan'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
