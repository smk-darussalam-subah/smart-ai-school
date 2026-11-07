'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  Loader2,
  List,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { SectionLabel } from './ui';
import { GaugeHealth, KpiStrip } from './HeaderPanels';
import { GradeBoxPlot, KkmHeatmap, ScatterCorrelation } from './AcademicPanels';
import {
  AdoptionCard,
  AgingBar,
  AtRiskCard,
  PpdbFunnel,
  SdmCard,
  SppBars,
  SystemStatusCard,
  TeacherComplianceCard,
  TrendArea,
  VisionRibbon,
} from './OpsPanels';
import { fetchExecutiveBundle } from '../actions';
import type { ExecFilters, ExecutiveData } from '../types';

interface Props {
  initial: ExecutiveData;
  years: string[];
}

const AttendanceDetailDialog = dynamic(() => import('./AttendanceDetailDialog'), {
  ssr: false,
  loading: () => (
    <p role="status" className="col-span-12 text-sm text-slate-600 dark:text-slate-300">
      Memuat rincian absensi…
    </p>
  ),
});

export default function ExecutiveDashboard({ initial, years }: Props) {
  const [data, setData] = useState<ExecutiveData>(initial);
  const [selection, setSelection] = useState(initial.filters);
  const selectionRef = useRef(initial.filters);
  const request = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const attendanceTrigger = useRef<HTMLButtonElement | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    request.current++;
    selectionRef.current = initial.filters;
    setSelection(initial.filters);
    setData(initial);
    setError(null);
    setAttendanceOpen(false);
    return () => {
      request.current++;
    };
  }, [initial]);

  const apply = (patch: ExecFilters) => {
    setAttendanceOpen(false);
    const next = { ...selectionRef.current, ...patch };
    selectionRef.current = next;
    setSelection(next);
    setError(null);
    const generation = ++request.current;
    startTransition(async () => {
      try {
        const fresh = await fetchExecutiveBundle(next);
        if (generation !== request.current) return;
        if (!sameFilters(fresh.filters, next)) throw Error('Mismatched executive filters');
        setData(fresh);
      } catch {
        if (generation === request.current)
          setError('Data pilihan belum dapat dimuat. Coba Segarkan.');
      }
    });
  };
  const current = !error && sameFilters(data.filters, selection);

  const yearList = years.length
    ? years
    : data.filters.academicYear
      ? [data.filters.academicYear]
      : [];

  return (
    <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
      {/* Header + filter */}
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white shadow-[0_8px_18px_-6px_rgba(5,150,105,.35)] dark:bg-emerald-600 dark:shadow-none">
            <BarChart3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950 dark:text-slate-100">
              Dasbor Eksekutif
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Ringkasan kehadiran, akademik, dan operasional sekolah.
            </p>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-2 items-end gap-3 lg:flex lg:w-auto lg:flex-wrap">
          <Select
            label="Tahun ajaran"
            value={selection.academicYear}
            onChange={(v) => apply({ academicYear: v })}
            icon={CalendarDays}
          >
            {yearList.map((y) => (
              <option key={y} value={y}>{`TA ${y}`}</option>
            ))}
          </Select>
          <Select
            label="Semester"
            value={String(selection.semester)}
            onChange={(v) => apply({ semester: Number(v) })}
            icon={BookOpen}
          >
            <option value="1">Semester 1</option>
            <option value="2">Semester 2</option>
          </Select>
          <Select
            label="Jurusan"
            value={selection.majorCode ?? ''}
            onChange={(v) => apply({ majorCode: v || undefined })}
            icon={Users}
          >
            <option value="">Semua Jurusan</option>
            {data.majors.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={() => apply({})}
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d5e2dc] bg-white px-3 py-2 text-sm font-semibold text-[#355a4e] shadow-sm transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:hover:bg-emerald-950 dark:focus-visible:outline-emerald-400"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            Segarkan
          </button>
        </div>
      </div>

      {/* Legend kejujuran data */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
        <b className="text-slate-700 dark:text-slate-200">Keterangan data:</b>
        <Dot color="#10b981">Nyata (siap)</Dot>
        <Dot color="#d97706">Segera (butuh agregat)</Dot>
        <Dot color="#94a3b8">Visi (modul menyusul)</Dot>
      </div>

      {/* Bento */}
      {!current ? (
        <p
          role={error ? 'alert' : 'status'}
          className="min-h-48 border-y border-slate-200 py-6 text-sm dark:border-slate-700"
        >
          {error ?? 'Memuat data periode dan jurusan pilihan…'}
        </p>
      ) : (
        <div
          aria-busy={pending}
          className={clsx('grid min-w-0 grid-cols-12 gap-4', pending && 'opacity-70')}
        >
          <SectionLabel icon={Activity}>Ikhtisar Strategis</SectionLabel>
          <GaugeHealth health={data.health} />
          <KpiStrip kpi={data.kpi} attendance={data.attendance} />

          <SectionLabel icon={BookOpen}>Kualitas Akademik</SectionLabel>
          <GradeBoxPlot grades={data.grades} />
          <ScatterCorrelation grades={data.grades} />
          <KkmHeatmap grades={data.grades} />

          <SectionLabel icon={CalendarDays}>Kehadiran &amp; Kedisiplinan</SectionLabel>
          <TrendArea
            tren={data.tren}
            detailControl={
              <button
                type="button"
                aria-label="Rincian absensi siswa"
                aria-haspopup="dialog"
                aria-expanded={attendanceOpen}
                onClick={(event) => {
                  attendanceTrigger.current = event.currentTarget;
                  setAttendanceOpen(true);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-950 dark:focus-visible:outline-emerald-400"
              >
                <List className="h-4 w-4" aria-hidden="true" />
                Rincian
              </button>
            }
          />
          {attendanceOpen && (
            <AttendanceDetailDialog
              data={data.attendance ?? null}
              onClose={() => setAttendanceOpen(false)}
              returnFocusTo={attendanceTrigger.current}
            />
          )}
          <AtRiskCard atRisk={data.atRisk} />

          <SectionLabel icon={Users}>Guru &amp; SDM</SectionLabel>
          <TeacherComplianceCard teacher={data.teacher} />
          <SdmCard teacher={data.teacher} studentsActive={data.studentsActive} />
          <PpdbFunnel ppdb={data.ppdb} />

          <SectionLabel icon={Wallet}>Keuangan</SectionLabel>
          <SppBars spp={data.spp} state={data.sppState} />
          <AgingBar aging={data.aging} majorCode={data.filters.majorCode} />

          <SectionLabel icon={ShieldCheck}>Operasional &amp; Sistem</SectionLabel>
          <SystemStatusCard system={data.system} />
          <AdoptionCard />

          <VisionRibbon />
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">
      <span>{label}</span>
      <span className="relative mt-1.5 block">
        <Icon
          className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-emerald-700 dark:text-emerald-400"
          aria-hidden="true"
        />
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 w-full min-w-0 rounded-xl border border-[#d5e2dc] bg-white py-2 pl-9 pr-2 text-sm font-medium text-[#355a4e] shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:shadow-none dark:focus-visible:outline-emerald-400"
        >
          {children}
        </select>
      </span>
    </label>
  );
}

function sameFilters(left: ExecFilters, right: ExecFilters) {
  return (
    left.academicYear === right.academicYear &&
    left.semester === right.semester &&
    (left.majorCode ?? '') === (right.majorCode ?? '')
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
