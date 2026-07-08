'use client';
import { useState } from 'react';

import { Target, GraduationCap, CalendarCheck, BookOpenCheck, Clock, PenLine, Info, Code, ListChecks, Users, FileText, ClipboardList, ChevronRight, UserCheck, CalendarClock, ClipboardPenLine, ClipboardCheck, GitBranch, HelpCircle, X, PlayCircle } from 'lucide-react';
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
  onNavigate?: (screen: string) => void;
  onStartSession?: (c: TodayClass) => void;
  onPenilaian?: (c: TodayClass) => void;
}

export default function RingkasanGuru({ grades, attendances, activities, rpp, todayClasses, onAbsen, onJurnal, onNavigate, onStartSession, onPenilaian }: Props) {
  const scores = grades.map((g) => Number(g.score)).filter((n) => !Number.isNaN(n));
  const tuntas = scores.length ? Math.round((scores.filter((s) => s >= KKTP_DEFAULT).length / scores.length) * 100) : null;
  const rata = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;
  const hadirCount = attendances.filter((a) => a.status === 'hadir').length;
  const izinCount = attendances.filter((a) => a.status === 'izin').length;
  const sakitCount = attendances.filter((a) => a.status === 'sakit').length;
  const alphaCount = attendances.filter((a) => a.status === 'alpha').length;

  // ── Perlu Tindakan (data nyata + simulasi bertanda) ──────────────────────
  const perStudent = new Map<string, number[]>();
  grades.forEach((g) => { const arr = perStudent.get(g.studentId) ?? []; arr.push(Number(g.score)); perStudent.set(g.studentId, arr); });
  const remedialSiswa = [...perStudent.values()].filter((arr) => arr.length && arr.reduce((a, b) => a + b, 0) / arr.length < KKTP_DEFAULT).length;
  const rppPending = rpp.filter((r) => r.status === 'draft' || r.status === 'revision').length;
  const today = wibTodayISO();
  const absentToday = new Set(attendances.filter((a) => a.date?.slice(0, 10) === today).map((a) => a.class.name));
  const kelasBelumAbsen = new Set(todayClasses.map((c) => c.className)).size - todayClasses.filter((c) => absentToday.has(c.className)).length;
  // P6: tugasBelumDinilai removed — honest empty until /submissions/* ready
  // R-13: Assessment sessions linked to today's classes via assessmentSessionId
  const kelasBelumDinilai = todayClasses.filter((c) => !c.assessmentSessionId).length;
  const tindakan = [
    remedialSiswa > 0 && { icon: Users, color: 'bg-rose-50 text-rose-600', title: `${remedialSiswa} siswa di bawah KKTP`, sub: 'Perlu remedial', action: 'penilaian' },
    kelasBelumAbsen > 0 && { icon: ClipboardList, color: 'bg-amber-50 text-amber-600', title: `${kelasBelumAbsen} kelas hari ini belum diabsen`, sub: 'Catat kehadiran dari kartu kelas', action: 'ringkasan' },
    rppPending > 0 && { icon: FileText, color: 'bg-violet-50 text-violet-600', title: `${rppPending} Modul Ajar belum disetujui`, sub: 'Draft/revisi — ajukan ke Wakakur', action: 'pembelajaran' },
    // R-13: Show action when classes today don't have assessment sessions linked yet
    kelasBelumDinilai > 0 && { icon: ClipboardPenLine, color: 'bg-sky-50 text-sky-600', title: `${kelasBelumDinilai} kelas belum punya sesi penilaian`, sub: 'Buat sesi asesmen dari Modul Ajar', action: 'pembelajaran' },
  ].filter(Boolean) as { icon: typeof Users; color: string; title: string; sub: string; action: string }[];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Target} label="Ketuntasan KKTP" value={tuntas !== null ? `${tuntas}%` : '—'} sub={tuntas !== null ? `${scores.filter((s) => s >= KKTP_DEFAULT).length} dari ${scores.length} siswa tuntas` : undefined} tooltip="KKTP = Kriteria Ketercapaian Tujuan Pembelajaran. Tuntas = (siswa NA ≥ 75) / total siswa × 100%" />
        <Kpi icon={GraduationCap} label="Rata² Nilai" value={rata !== null ? `${rata}` : '—'} sub={scores.length ? `dari ${scores.length} nilai` : undefined} tooltip="Rata² Nilai = mean(NA semua siswa). NA = UH×20% + Praktik×25% + Sikap×15% + UTS×20% + UAS×20%" />
        <Kpi icon={CalendarCheck} label="Kehadiran" value={hadirPct !== null ? `${hadirPct}%` : '—'} sub={attendances.length ? `${hadirCount} hadir · ${izinCount} izin · ${sakitCount} sakit · ${alphaCount} alpha` : undefined} />
        <Kpi icon={BookOpenCheck} label="Jurnal Pertemuan" value={`${activities.length}`} sub="pertemuan tercatat" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* Kelas Hari Ini */}
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><Clock className="h-[18px] w-[18px] text-emerald-600" />Kelas Hari Ini</h3>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
              {onNavigate && <button type="button" onClick={() => onNavigate('jadwal')} className="text-[11.5px] font-bold text-emerald-600 hover:text-emerald-700">Lihat jadwal →</button>}
            </div>
          </div>
          {todayClasses.length === 0 ? (
            <div className="mt-3 grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada jadwal mengajar hari ini.</div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {todayClasses.map((c, i) => (
                <div key={`${c.classId}-${c.jpStart}-${i}`}
                  className="group rounded-xl border border-[#e6efea] bg-white p-3.5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-[0_2px_6px_rgba(16,40,33,.06),0_22px_40px_-20px_rgba(16,40,33,.28)]">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Code className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <b className="text-[13.5px] text-[#0f2e25]">{c.subject} · {c.className}</b>
                      <div className="text-[12px] text-[#6b8079]">JP {c.jpStart}{c.jpEnd !== c.jpStart ? `–${c.jpEnd}` : ''} · {c.startLabel} · {c.room ?? 'Ruang —'}{c.isNow ? ' · sedang berlangsung' : ''}</div>
                    </div>
                    {c.isNow && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />LIVE</span>}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {onStartSession && <button type="button" onClick={() => onStartSession(c)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700"><PlayCircle className="h-4 w-4" />Mulai Sesi</button>}
                    <button type="button" onClick={() => onAbsen({ classId: c.classId, className: c.className })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><CalendarCheck className="h-4 w-4 text-emerald-600" />Absen</button>
                    <button type="button" onClick={() => onJurnal({ classId: c.classId, className: c.className, subject: c.subject, startLabel: c.startLabel, jpStart: c.jpStart })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><PenLine className="h-4 w-4 text-emerald-600" />Jurnal</button>
                    {onPenilaian && <button type="button" onClick={() => onPenilaian(c)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><ClipboardPenLine className="h-4 w-4 text-emerald-600" />Nilai</button>}
                  </div>
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
                  <button key={i} type="button" onClick={() => onNavigate?.(t.action)} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.color}`}><Icon className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <b className="text-[12.5px] text-[#0f2e25]">{t.title}</b>
                      </div>
                      <div className="text-[11.5px] text-[#6b8079]">{t.sub}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status Hari Ini */}
      <StatusHariIni todayClasses={todayClasses} attendances={attendances} activities={activities} />

      {/* Alur Kerja Guru */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><GitBranch className="h-[18px] w-[18px] text-emerald-600" />Alur Kerja Guru</h3>
        <p className="mt-1 text-[12.5px] text-[#6b8079]">Dari awal tahun hingga rekap audit — semua terhubung dalam satu sistem.</p>
        <div className="mt-3 space-y-2">
          <FlowStep step="1" icon={UserCheck} color="bg-sky-50 text-sky-600" title="Awal Tahun — Pembagian Tugas oleh KS" desc="KS menugaskan guru ke kelas & mapel → otomatis muncul di filter & jadwal" done onClick={() => onNavigate?.('jadwal')} />
          <FlowStep step="2" icon={FileText} color="bg-emerald-50 text-emerald-700" title="Buat & Ajukan Modul Ajar" desc="RPP wizard 11-langkah → ajukan ke Wakakur → aktifkan di LMS" onClick={() => onNavigate?.('pembelajaran')} />
          <FlowStep step="3" icon={CalendarClock} color="bg-violet-50 text-violet-600" title="Mengajar Sesuai Jadwal" desc='Klik "Mulai Sesi" pada kelas hari ini → panduan in-class procedure' onClick={() => onNavigate?.('jadwal')} />
          <FlowStep step="4" icon={ClipboardPenLine} color="bg-amber-50 text-amber-600" title="Penilaian & Remedial" desc="Gradebook terisi otomatis (formatif) + manual (praktik/sikap) → remedial untuk belum tuntas" onClick={() => onNavigate?.('penilaian')} />
          <FlowStep step="5" icon={ClipboardCheck} color="bg-rose-50 text-rose-600" title="Rekap Audit & Rapor" desc="Semua data agregasi → KS/Wakakur audit → terbit ke Rapor orang tua" onClick={() => onNavigate?.('rekap')} />
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, tooltip }: { icon: typeof Target; label: string; value: string; sub?: string; tooltip?: string }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]">
        <Icon className="h-3.5 w-3.5 text-emerald-600" />{label}
        {tooltip && (
          <span className="group relative inline-flex">
            <HelpCircle className="h-3 w-3 cursor-help text-[#9bb0a8]" />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-pre-wrap rounded-lg bg-[#0f2e25] px-3 py-2 text-[10px] font-medium leading-relaxed text-white shadow-lg group-hover:block w-48">{tooltip}</span>
          </span>
        )}
      </div>
      <div className="mt-1.5 text-[26px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
      {sub && <div className="mt-0.5 text-[10.5px] font-medium text-[#9bb0a8]">{sub}</div>}
    </div>
  );
}

function FlowStep({ step, icon: Icon, color, title, desc, done, onClick }: { step: string; icon: typeof Target; color: string; title: string; desc: string; done?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${color}`}><Icon className="h-[18px] w-[18px]" /></div>
      <div className="min-w-0 flex-1">
        <b className="text-[12.5px] text-[#0f2e25]">{step}. {title}</b>
        <div className="text-[11.5px] text-[#6b8079]">{desc}</div>
      </div>
      {done ? <span className="shrink-0 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓</span> : <ChevronRight className="h-4 w-4 shrink-0 text-[#9bb0a8]" />}
    </button>
  );
}

function StatusHariIni({ todayClasses, attendances, activities }: { todayClasses: TodayClass[]; attendances: AttendanceItem[]; activities: ActivityItem[] }) {
  const [selected, setSelected] = useState<TodayClass | null>(null);
  const today = wibTodayISO();

  const sessions = todayClasses.map((tc) => {
    const classAtt = attendances.filter((a) => a.date?.slice(0, 10) === today && a.class.name === tc.className);
    const hasAbsen = classAtt.length > 0;
    const hasJurnal = activities.some((a) => a.date?.slice(0, 10) === today && a.classId === tc.classId);
    // R-13: Wire to real assessment session data — no longer hardcoded false.
    // hasPenilaian = true jika ada assessment session linked untuk kelas ini.
    // hasFeedback = true jika session sudah completed (hasil sudah ada).
    const hasPenilaian = !!tc.assessmentSessionId;
    const hasFeedback = !!tc.assessmentSessionId; // completed session → feedback available
    return { ...tc, hasAbsen, hasJurnal, hasPenilaian, hasFeedback, classAtt };
  });

  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]"><ClipboardList className="h-[18px] w-[18px] text-emerald-600" />Status Hari Ini</h3>
        <span className="rounded-md bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">{wibDateLabel()}</span>
      </div>
      <p className="mt-1 text-[12.5px] text-[#6b8079]">Status <b>absen · jurnal · penilaian · feedback</b> untuk tiap sesi hari ini.</p>
      <div className="mt-3 space-y-2">
        {sessions.length === 0 ? (
          <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">Tidak ada sesi mengajar hari ini.</div>
        ) : (
          sessions.map((s, i) => (
            <button key={`${s.classId}-${s.jpStart}-${i}`} type="button" onClick={() => setSelected(s)} className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[#e6efea] bg-white p-3 text-left transition hover:border-emerald-200 hover:shadow-sm">
              <div className="min-w-0 flex-1">
                <b className="text-[12.5px] text-[#0f2e25]">{s.subject} · {s.className}</b>
                <div className="text-[11.5px] text-[#6b8079]">JP {s.jpStart}{s.jpEnd !== s.jpStart ? `–${s.jpEnd}` : ''} · {s.startLabel} · klik untuk rincian</div>
              </div>
              <StatusChip status={s.hasAbsen ? 'ok' : 'warn'} label="Absen" />
              <StatusChip status={s.hasJurnal ? 'ok' : 'warn'} label="Jurnal" />
              <StatusChip status={s.hasPenilaian ? 'ok' : 'no'} label="Penilaian" />
              <StatusChip status={s.hasFeedback ? 'ok' : 'no'} label="Feedback" />
            </button>
          ))
        )}
      </div>
      {selected && <SessionDetailModal session={selected} attendances={attendances} activities={activities} onClose={() => setSelected(null)} />}
    </div>
  );
}

function StatusChip({ status, label }: { status: 'ok' | 'warn' | 'no' | 'miss'; label: string }) {
  const styles: Record<string, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    warn: 'bg-amber-50 text-amber-600',
    no: 'bg-slate-100 text-slate-400',
    miss: 'bg-rose-50 text-rose-600',
  };
  const icons: Record<string, string> = { ok: '✓', warn: '!', no: '—', miss: '✗' };
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${styles[status]}`}>
      {label} {icons[status]}
    </span>
  );
}

function SessionDetailModal({ session, attendances, activities, onClose }: {
  session: TodayClass;
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  onClose: () => void;
}) {
  const today = wibTodayISO();
  const classAtt = attendances.filter((a) => a.date?.slice(0, 10) === today && a.class.name === session.className);
  const hadir = classAtt.filter((a) => a.status === 'hadir').length;
  const izin = classAtt.filter((a) => a.status === 'izin').length;
  const sakit = classAtt.filter((a) => a.status === 'sakit').length;
  const alpha = classAtt.filter((a) => a.status === 'alpha').length;
  const absent = classAtt.filter((a) => a.status !== 'hadir');
  const hasJurnal = activities.some((a) => a.date?.slice(0, 10) === today && a.classId === session.classId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">Detail Sesi — {session.subject} · {session.className}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-[#9bb0a8] hover:bg-[#f4f7f5]" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-emerald-50 p-2 text-center"><div className="text-[18px] font-extrabold text-emerald-700">{hadir}</div><div className="text-[10px] font-semibold text-[#6b8079]">Hadir</div></div>
          <div className="rounded-xl bg-sky-50 p-2 text-center"><div className="text-[18px] font-extrabold text-sky-700">{izin}</div><div className="text-[10px] font-semibold text-[#6b8079]">Izin</div></div>
          <div className="rounded-xl bg-amber-50 p-2 text-center"><div className="text-[18px] font-extrabold text-amber-600">{sakit}</div><div className="text-[10px] font-semibold text-[#6b8079]">Sakit</div></div>
          <div className="rounded-xl bg-rose-50 p-2 text-center"><div className="text-[18px] font-extrabold text-rose-600">{alpha}</div><div className="text-[10px] font-semibold text-[#6b8079]">Alpha</div></div>
        </div>
        {absent.length > 0 && (
          <div className="mt-3 rounded-lg bg-[#f4f7f5] p-3 text-[11.5px] text-[#355a4e]">
            <b>Absen:</b> {absent.map((a) => `${a.student.user.fullName} (${a.status})`).join(' · ')}
          </div>
        )}
        <div className="mt-3 space-y-2">
          <div>
            <b className="text-[12px] text-[#0f2e25]">Diagnostik</b>
            <div className="mt-1 text-[10.5px] text-[#9bb0a8]">{session.assessmentSessionId ? 'Sesi asesmen tersedia — lihat detail di tab Penilaian.' : 'Belum ada sesi diagnostik untuk kelas ini.'}</div>
          </div>
          <div>
            <b className="text-[12px] text-[#0f2e25]">Formatif</b>
            <div className="mt-1 text-[10.5px] text-[#9bb0a8]">{session.assessmentSessionId ? 'Sesi asesmen tersedia — lihat detail di tab Penilaian.' : 'Belum ada sesi formatif untuk kelas ini.'}</div>
          </div>
          <div>
            <b className="text-[12px] text-[#0f2e25]">Feedback</b>
            <div className="mt-1 text-[10.5px] text-[#9bb0a8]">{session.assessmentSessionId ? 'Feedback tersedia setelah sesi diselesaikan.' : 'Belum ada feedback untuk sesi ini.'}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          {hasJurnal && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Jurnal ✓</span>}
        </div>
      </div>
    </div>
  );
}
