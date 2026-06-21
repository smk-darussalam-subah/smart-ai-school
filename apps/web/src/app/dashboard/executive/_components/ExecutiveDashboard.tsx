'use client';

import { useState, useTransition } from 'react';
import { Activity, BarChart3, BookOpen, CalendarDays, Loader2, RefreshCw, ShieldCheck, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { SectionLabel } from './ui';
import { GaugeHealth, KpiStrip } from './HeaderPanels';
import { GradeBoxPlot, KkmHeatmap, ScatterCorrelation } from './AcademicPanels';
import {
  AdoptionCard, AgingBar, AtRiskCard, PpdbFunnel, SdmCard, SppBars,
  SystemStatusCard, TeacherComplianceCard, TrendArea, VisionRibbon,
} from './OpsPanels';
import { fetchExecutiveBundle } from '../actions';
import type { ExecFilters, ExecutiveData } from '../types';

interface Props {
  initial: ExecutiveData;
  years: string[];
}

export default function ExecutiveDashboard({ initial, years }: Props) {
  const [data, setData] = useState<ExecutiveData>(initial);
  const [pending, startTransition] = useTransition();

  const filters: ExecFilters = {
    academicYear: data.filters.academicYear || undefined,
    semester: data.filters.semester,
    majorCode: data.filters.majorCode,
  };

  const apply = (patch: ExecFilters) => {
    const next: ExecFilters = { ...filters, ...patch };
    startTransition(async () => {
      const fresh = await fetchExecutiveBundle(next);
      setData(fresh);
    });
  };

  const yearList = years.length ? years : data.filters.academicYear ? [data.filters.academicYear] : [];

  return (
    <div className="space-y-4">
      {/* Header + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-[0_8px_18px_-6px_rgba(5,150,105,.5)]">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-[19px] font-bold tracking-tight text-[#0f2e25]">Dasbor Eksekutif</h1>
            <p className="text-[12.5px] font-medium text-[#6b8079]">Intelijen strategis sekolah — analisis &amp; grafik</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={data.filters.academicYear} onChange={(v) => apply({ academicYear: v })} icon={CalendarDays}>
            {yearList.map((y) => (
              <option key={y} value={y}>{`TA ${y}`}</option>
            ))}
          </Select>
          <Select value={String(data.filters.semester)} onChange={(v) => apply({ semester: Number(v) })} icon={BookOpen}>
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </Select>
          <Select value={data.filters.majorCode ?? ''} onChange={(v) => apply({ majorCode: v || undefined })} icon={Users}>
            <option value="">Semua Jurusan</option>
            {data.majors.map((m) => (
              <option key={m.code} value={m.code}>{m.code}</option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => apply({})}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#e3ece8] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#355a4e] shadow-[0_1px_2px_rgba(16,40,33,.04)] hover:bg-[#f4f7f5]"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : <RefreshCw className="h-4 w-4 text-emerald-600" />}
            Segarkan
          </button>
        </div>
      </div>

      {/* Legend kejujuran data */}
      <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#6b8079]">
        <b className="text-[#355a4e]">Keterangan data:</b>
        <Dot color="#10b981">Nyata (siap)</Dot>
        <Dot color="#d97706">Segera (butuh agregat)</Dot>
        <Dot color="#94a3b8">Visi (modul menyusul)</Dot>
      </div>

      {/* Bento */}
      <div className={clsx('grid grid-cols-12 gap-4 transition-opacity', pending && 'pointer-events-none opacity-60')}>
        <SectionLabel icon={Activity}>Ikhtisar Strategis</SectionLabel>
        <GaugeHealth health={data.health} />
        <KpiStrip kpi={data.kpi} />

        <SectionLabel icon={BookOpen}>Kualitas Akademik</SectionLabel>
        <GradeBoxPlot grades={data.grades} />
        <ScatterCorrelation grades={data.grades} />
        <KkmHeatmap grades={data.grades} />

        <SectionLabel icon={CalendarDays}>Kehadiran &amp; Kedisiplinan</SectionLabel>
        <TrendArea tren={data.tren} />
        <AtRiskCard atRisk={data.atRisk} />

        <SectionLabel icon={Users}>Guru &amp; SDM</SectionLabel>
        <TeacherComplianceCard teacher={data.teacher} />
        <SdmCard teacher={data.teacher} studentsActive={data.studentsActive} />
        <PpdbFunnel ppdb={data.ppdb} />

        <SectionLabel icon={Wallet}>Keuangan</SectionLabel>
        <SppBars spp={data.spp} />
        <AgingBar aging={data.aging} />

        <SectionLabel icon={ShieldCheck}>Operasional &amp; Sistem</SectionLabel>
        <SystemStatusCard system={data.system} />
        <AdoptionCard />

        <VisionRibbon />
      </div>
    </div>
  );
}

function Select({
  value, onChange, icon: Icon, children,
}: {
  value: string;
  onChange: (v: string) => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <div className="relative inline-flex items-center">
      <Icon className="pointer-events-none absolute left-3 h-[15px] w-[15px] text-emerald-600" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-[#e3ece8] bg-white py-2 pl-9 pr-7 text-[12.5px] font-semibold text-[#355a4e] shadow-[0_1px_2px_rgba(16,40,33,.04)] outline-none focus:border-emerald-400"
      >
        {children}
      </select>
    </div>
  );
}

function Dot({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold">
      <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}
