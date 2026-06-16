'use client';

import { ArrowLeft, ClipboardCheck, FileText, BookOpenCheck, Target, GraduationCap, PenLine } from 'lucide-react';
import type { GradeItem, AttendanceItem } from '@/lib/api';
import type { ActivityItem, RppItem } from './guru-types';
import { KKTP_DEFAULT } from './guru-types';

interface Props {
  subject: string;
  grades: GradeItem[];
  attendances: AttendanceItem[];
  activities: ActivityItem[];
  approvedRpp: RppItem[];
  onBack: () => void;
}

export default function RekapPembelajaran({ subject, grades, attendances, activities, approvedRpp, onBack }: Props) {
  const g = grades.filter((x) => x.assignment.subject === subject);
  const scores = g.map((x) => Number(x.score)).filter((n) => !Number.isNaN(n));
  const rata = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const tuntas = scores.filter((s) => s >= KKTP_DEFAULT).length;
  const remedial = scores.length - tuntas;
  const tuntasPct = scores.length ? Math.round((tuntas / scores.length) * 100) : null;
  const modulCount = approvedRpp.filter((r) => r.subject === subject).length;
  const hadirPct = attendances.length ? Math.round((attendances.filter((a) => a.status === 'hadir').length / attendances.length) * 100) : null;
  const lastJurnal = activities[0];

  if (!subject) {
    return <div className="rounded-2xl border border-[#e6efea] bg-white p-6 text-center text-[13px] text-[#9bb0a8]">Pilih mapel di bar atas untuk melihat rekap.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]"><ClipboardCheck className="h-[18px] w-[18px] text-emerald-600" />Rekap Pembelajaran — {subject}</h2>
          <p className="text-[12.5px] text-[#6b8079]">Ringkasan ketercapaian, nilai, kehadiran &amp; jurnal mapel ini.</p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><ArrowLeft className="h-4 w-4" />Kembali</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={FileText} label="Modul Ajar disetujui" value={`${modulCount}`} />
        <Kpi icon={BookOpenCheck} label="Jurnal tercatat" value={`${activities.length}`} />
        <Kpi icon={Target} label="Tuntas KKTP" value={tuntasPct !== null ? `${tuntasPct}%` : '—'} />
        <Kpi icon={GraduationCap} label="Rata² nilai" value={rata !== null ? `${rata}` : '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[14px] font-bold text-[#0f2e25]">Rekap Nilai</h3>
          <div className="space-y-2.5 text-[12.5px] font-semibold text-[#355a4e]">
            <Row label="Entri nilai" value={`${scores.length}`} />
            <Row label="Tuntas / Remedial" value={<span><b className="text-emerald-700">{tuntas}</b> / <b className="text-rose-600">{remedial}</b></span>} />
            <Row label="Rata-rata" value={rata !== null ? `${rata}` : '—'} />
            <Row label="Kehadiran (kelas)" value={hadirPct !== null ? `${hadirPct}%` : '—'} />
          </div>
          <p className="mt-3 text-[11px] text-[#9bb0a8]">Progres TP terstruktur (ATP) menyusul di modul Pembelajaran.</p>
        </div>

        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#0f2e25]"><PenLine className="h-4 w-4 text-emerald-600" />Jurnal Terakhir</h3>
          {lastJurnal ? (
            <div className="rounded-xl bg-[#f4f7f5] p-3 text-[12.5px]">
              <b className="text-[#0f2e25]">{lastJurnal.title}</b>
              <div className="mt-1 text-[#6b8079]">{lastJurnal.class?.name ?? '—'} · {new Date(lastJurnal.date).toLocaleDateString('id')}</div>
              {lastJurnal.description && <p className="mt-2 line-clamp-3 text-[#355a4e]">{lastJurnal.description}</p>}
            </div>
          ) : (
            <div className="grid h-20 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] text-[#9bb0a8]">Belum ada jurnal</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e6efea] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-[#6b8079]"><Icon className="h-3.5 w-3.5 text-emerald-600" />{label}</div>
      <div className="mt-1.5 text-[24px] font-extrabold tracking-tight text-[#0f2e25]">{value}</div>
    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span>{label}</span><span>{value}</span></div>;
}
