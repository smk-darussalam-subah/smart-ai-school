'use client';

import { Target, GraduationCap, CalendarCheck, BookOpenCheck, Clock, PenLine, Info, Code, ListChecks, Users, FileText, ClipboardList, ChevronRight } from 'lucide-react';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ActivityItem, RppItem, TodayClass } from './guru-types';
import { KKTP_DEFAULT } from './guru-types';
import { wibDateLabel, wibTodayISO } from '@/lib/bell-times';

interface Props {
  grades: GradeItem[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  rpp: RppItem[];
  todayClasses: TodayClass[];
  onAbsen: (c: { classId: string; className: string }) => void;
  onJurnal: (c: { classId: string; className: string; subject: string; startLabel: string; jpStart: number }) => void;
}

export default function RingkasanGuru({ grades, attendances, activities, rpp, todayClasses, onAbsen, onJurnal }: Props) {
  const scores = grades.map((g) => Number(g.score)).filter((n) => !Number.isNaN(n));
  const tuntas = scores.length ? Math.round((scores.filter((s) => s >= KKTP_DEFAULT).length / scores.length) * 100) : null;
  const rata = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;

  // ── Perlu Tindakan (data nyata) ──────────────────────────────────────────
  const perStudent = new Map<string, number[]>();
  grades.forEach((g) => { const arr = perStudent.get(g.studentId) ?? []; arr.push(Number(g.score)); perStudent.set(g.studentId, arr); });
  const remedialSiswa = [...perStudent.values()].filter((arr) => arr.length && arr.reduce((a, b) => a + b, 0) / arr.length < KKTP_DEFAULT).length;
  const rppPending = rpp.filter((r) => r.status === 'draft' || r.status === 'revision').length;
  const today = wibTodayISO();
  const absentToday = new Set(attendances.filter((a) => a.date?.slice(0, 10) === today).map((a) => a.class.name));
  const kelasBelumAbsen = new Set(todayClasses.map((c) => c.className)).size - todayClasses.filter((c) => absentToday.has(c.className)).length;
  const tindakan = [
    remedialSiswa > 0 && { icon: Users, color: 'bg-rose-50 text-rose-600', title: `${remedialSiswa} siswa di bawah KKTP`, sub: 'Perlu remedial' },
    kelasBelumAbsen > 0 && { icon: ClipboardList, color: 'bg-amber-50 text-amber-600', title: `${kelasBelumAbsen} kelas hari ini belum diabsen`, sub: 'Catat kehadiran dari kartu kelas' },
    rppPending > 0 && { icon: FileText, color: 'bg-violet-50 text-violet-600', title: `${rppPending} Modul Ajar belum disetujui`, sub: 'Draft/revisi — ajukan ke Wakakur' },
  ].filter(Boolean) as { icon: typeof Users; color: string; title: string; sub: string }[];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Target} label="Ketuntasan KKTP" value={tuntas !== null ? `${tuntas}%` : '—'} />
        <Kpi icon={GraduationCap} label="Rata² Nilai" value={rata !== null ? `${rata}` : '—'} />
        <Kpi icon={CalendarCheck} label="Kehadiran" value={hadirPct !== null ? `${hadirPct}%` : '—'} />
        <Kpi icon={BookOpenCheck} label="Jurnal Pertemuan" value={`${activities.length}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Kelas Hari Ini */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Clock className="h-[18px] w-[18px] text-emerald-600" />Kelas Hari Ini</h3>
            <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
          </div>
          {todayClasses.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada jadwal mengajar hari ini.</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {todayClasses.map((c, i) => (
                <div key={`${c.classId}-${c.jpStart}-${i}`}
                  className="group flex items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_2px_6px_rgba(16,40,33,.06),0_22px_40px_-20px_rgba(16,40,33,.28)]">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Code className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <b className="text-[13.5px] text-[#0f2e25]">{c.subject} · {c.className}</b>
                    <div className="text-[12px] text-[#6b8079]">JP {c.jpStart}{c.jpEnd !== c.jpStart ? `–${c.jpEnd}` : ''} · {c.startLabel} · {c.room ?? 'Ruang —'}{c.isNow ? ' · sedang berlangsung' : ''}</div>
                  </div>
                  {c.isNow && <span className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />LIVE</span>}
                  <button type="button" onClick={() => onAbsen({ classId: c.classId, className: c.className })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><CalendarCheck className="h-4 w-4 text-emerald-600" />Absen</button>
                  <button type="button" onClick={() => onJurnal({ classId: c.classId, className: c.className, subject: c.subject, startLabel: c.startLabel, jpStart: c.jpStart })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><PenLine className="h-4 w-4 text-emerald-600" />Jurnal</button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-[#6b8079]"><Info className="h-3.5 w-3.5" />Klik <b>Absen</b> (default semua hadir) atau <b>Jurnal</b> (terisi otomatis dari konteks &amp; Modul Ajar disetujui — dapat disunting).</p>
        </div>

        {/* Perlu Tindakan */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ListChecks className="h-[18px] w-[18px] text-emerald-600" />Perlu Tindakan</h3>
          {tindakan.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada tindakan tertunda 🎉</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {tindakan.map((t, i) => {
                const Icon = t.icon;
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.color}`}><Icon className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1"><b className="text-[12.5px] text-[#0f2e25]">{t.title}</b><div className="text-[11.5px] text-[#6b8079]">{t.sub}</div></div>
                    <ChevronRight className="h-4 w-4 text-[#9bb0a8]" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]"><Icon className="h-3.5 w-3.5 text-emerald-600" />{label}</div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
    </div>
  );
}
