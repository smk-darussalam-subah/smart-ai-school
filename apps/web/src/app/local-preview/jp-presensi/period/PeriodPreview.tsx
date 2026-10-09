'use client';
import { useEffect, useState } from 'react';
import JadwalForm from '@/app/dashboard/jadwal/_components/JadwalForm';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
import { Button } from '@/components/ui/button';
import type { BellProfile, BellPeriod } from '@/lib/bell-patterns';

function profile(id: string, from: string, until: string, count: number, duration: number): BellProfile {
  return { id, code: id, name: id, kind: 'NORMAL', provenance: 'synthetic preview', revokedAt: null,
    effectiveFrom: from, effectiveUntil: until,
    segments: Array.from({ length: count }, (_, index) => ({ dayOfWeek: 0, type: 'INSTRUCTION' as const,
      jpNumber: index + 1, label: 'JP ' + (index + 1), startMinute: 420 + index * duration,
      endMinute: 420 + (index + 1) * duration, sortOrder: index + 1 })) };
}
const periods: BellPeriod[] = [
  { number: 1, startDate: '2026-07-13', endDate: '2026-12-19', academicYear: { code: '2026/2027' } },
  { number: 2, startDate: '2027-01-04', endDate: '2027-01-16', academicYear: { code: '2026/2027' } },
];
export default function PeriodPreview() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [mode, setMode] = useState('FULL');
  const [open, setOpen] = useState(true);
  const current = profile('CURRENT-10', '2026-07-13', '2026-12-31', 10, 40);
  const future = profile('FUTURE-12', '2027-01-01', mode === 'FULL' ? '2027-06-30' : '2027-01-09', 12, 30);
  const profiles = [current, future, ...(mode === 'VARIED' ? [profile('SECOND-10', '2027-01-10', '2027-06-30', 10, 45)] : [])];
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-4 bg-slate-50 p-4 sm:p-6" data-period-ready={ready}>
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">PRATINJAU REGRESI LOKAL — formulir produksi dengan profil/semester sintetis. Seluruh mutasi diblokir; bukan sesi autentikasi atau data sekolah nyata.</p>
    <h1 className="text-xl font-semibold text-slate-950 sm:text-2xl">JP semester pilihan</h1>
    <p className="text-sm text-slate-600">Hari ini: 10 JP. Semester 2: 12 JP dengan 30 menit per JP. Uji juga perubahan di tengah semester dan cakupan yang belum lengkap.</p>
    <label className="grid gap-2 text-sm text-slate-700">Cakupan semester sintetis
      <select aria-label="Cakupan semester sintetis" value={mode} onChange={(event) => setMode(event.target.value)} className="min-h-11 w-full min-w-0 max-w-full rounded-lg border bg-white px-3 text-base sm:text-sm">
        <option value="FULL">Lengkap · semester 2 memiliki 12 JP</option>
        <option value="VARIED">Bervariasi · 12 menjadi 10 JP, waktu berubah</option>
        <option value="GAP">Tidak lengkap · profil berakhir di tengah semester</option>
      </select>
    </label>
    <Button className="min-h-11" onClick={() => setOpen(true)}>Buka formulir semester 2</Button>
    <BellPatternProvider profiles={profiles} periods={periods}>
      <JadwalForm key={mode} open={open} onOpenChange={setOpen} previewOnly onSaved={() => {}}
        academicYear="2026/2027" initialSemester={2} schedule={{ id: 'synthetic-schedule', classId: 'synthetic-class', dayOfWeek: 1,
          jpStart: 11, jpEnd: 12, room: 'LAB SINTETIS', academicYear: '2026/2027', semester: 2,
          class: { id: 'synthetic-class', name: 'X SINTETIS', majorCode: 'PRF', grade: 10 },
          teachingAssignment: { id: 'synthetic-assignment', subject: 'Pelajaran sintetis', teacher: { id: 'synthetic-teacher', user: { fullName: 'Guru Sintetis' } } } }} />
    </BellPatternProvider>
  </main>;
}
