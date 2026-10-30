'use client';
import React from 'react';

import {
  Activity,
  Backpack,
  BarChart3,
  Brain,
  Briefcase,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { attendanceDayLabel, attendanceNumber } from '@/lib/attendance-presentation';
import { Card, EmptyState, SectionLabel, fmtRupiah, yScale } from './ui';
import type {
  Aging,
  AtRisk,
  PpdbStats,
  SppMonth,
  SystemStatus,
  TeacherCompliance,
  TrenSeries,
} from '../types';

// ── Tren kehadiran (overall, recent) ─────────────────────────────────────────
export function TrendArea({
  tren,
  detailControl,
}: {
  tren: TrenSeries;
  detailControl?: React.ReactNode;
}) {
  const pts = tren.pcts,
    W = 720,
    H = 180,
    y = yScale(0, 100, H, 12);
  const x = (i: number) => (pts.length <= 1 ? 10 : 10 + (i * (W - 20)) / (pts.length - 1));
  const line = pts
    .map((p, i) =>
      p === null
        ? ''
        : `${i === 0 || pts[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(p).toFixed(1)}`,
    )
    .join(' ');
  const axis = [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])].filter(
    (i) => i >= 0,
  );
  return (
    <Card
      title="Tren Kehadiran Siswa per JP"
      subtitle={`${pts.length} tanggal sesi · periode dan jurusan pilihan`}
      icon={Activity}
      level="real"
      className="col-span-12 lg:col-span-8"
      right={detailControl}
    >
      {pts.filter((p) => p !== null).length < 2 ? (
        <EmptyState label="Data kehadiran belum cukup" />
      ) : (
        <div>
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
            <div
              aria-hidden="true"
              className="flex h-44 flex-col justify-between py-2 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300"
            >
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </div>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-44 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label="Tren persentase kehadiran per JP; data belum lengkap tidak dihubungkan"
            >
              {[100, 50, 0].map((g) => (
                <line
                  key={g}
                  x1={10}
                  y1={y(g)}
                  x2={W - 10}
                  y2={y(g)}
                  className="stroke-slate-200 dark:stroke-slate-700"
                />
              ))}
              <path
                d={line}
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-emerald-700 dark:stroke-emerald-400"
              />
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="ml-12 mt-2 flex justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"
          >
            {axis.map((i) => (
              <span key={i}>{attendanceDayLabel(tren.labels[i] ?? '')}</span>
            ))}
          </div>
        </div>
      )}
      {pts.length > 0 && (
        <details className="mt-3 border-t border-slate-200 dark:border-slate-700">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-200 dark:focus-visible:outline-emerald-400">
            Lihat data tren
          </summary>
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Persentase kehadiran siswa per JP per tanggal</caption>
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th scope="col" className="py-2 font-semibold">
                  Tanggal
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Kehadiran
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((pct, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <th scope="row" className="py-2 font-normal">
                    {attendanceDayLabel(tren.labels[i] ?? '')}
                  </th>
                  <td className="py-2 text-right tabular-nums">
                    {pct === null ? 'Belum lengkap' : `${attendanceNumber(pct)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Card>
  );
}

// ── Siswa berisiko ────────────────────────────────────────────────────────────
export function AtRiskCard({ atRisk }: { atRisk: AtRisk | null }) {
  return (
    <Card
      title="Siswa Berisiko"
      subtitle="Catatan harian: Alpha ≥ 3× / 30 hari, bukan JP"
      icon={ShieldCheck}
      level="real"
      className="col-span-12 lg:col-span-4"
    >
      {!atRisk ? (
        <EmptyState />
      ) : (
        <>
          <div className="text-[46px] font-extrabold leading-none tracking-normal text-rose-700 dark:text-rose-300">
            {atRisk.total}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {atRisk.byClass.slice(0, 4).map((c) => (
              <div
                key={c.className}
                className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"
              >
                <span>{c.className}</span>
                <b className="text-rose-700 dark:text-rose-300">{c.count} siswa</b>
              </div>
            ))}
            {atRisk.total > 0 && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                → Rekomendasi intervensi BK
              </div>
            )}
            {atRisk.total === 0 && (
              <div className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Tidak ada siswa berisiko
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Kepatuhan guru ────────────────────────────────────────────────────────────
function Bar({ label, pct, value }: { label: string; pct: number | null; value: string }) {
  const warn = pct !== null && pct < 80;
  return (
    <div className="mb-2.5 grid grid-cols-[110px_1fr_42px] items-center gap-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span>{label}</span>
      <span className="h-[9px] overflow-hidden rounded-md bg-[#eef3f0]">
        <span
          className="block h-full rounded-md"
          style={{
            width: `${pct ?? 0}%`,
            background:
              pct === null
                ? '#cbd5e1'
                : warn
                  ? 'linear-gradient(90deg,#fbbf24,#d97706)'
                  : 'linear-gradient(90deg,#34d399,#059669)',
          }}
        />
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

export function TeacherComplianceCard({ teacher }: { teacher: TeacherCompliance | null }) {
  return (
    <Card
      title="Presensi & Modul Ajar Guru"
      subtitle="Presensi harian kanonik · kewajiban sesuai jadwal"
      icon={ClipboardCheck}
      level="real"
      className="col-span-12 lg:col-span-5"
    >
      {!teacher ? (
        <EmptyState />
      ) : (
        <>
          <Bar
            label="Presensi wajib guru"
            pct={teacher.attendancePct ?? null}
            value={teacher.attendancePct != null ? `${teacher.attendancePct}%` : '—'}
          />
          <Bar
            label="Lokasi di area / presensi tercatat"
            pct={teacher.gpsPct}
            value={teacher.gpsPct !== null ? `${teacher.gpsPct}%` : '—'}
          />
          {teacher.attendance?.dueRequired != null && (
            <p className="mb-2 text-xs text-slate-700 dark:text-slate-200">
              {teacher.attendance.presentRequired ?? 0} dari {teacher.attendance.dueRequired}{' '}
              kewajiban hadir sudah tercatat. Kewajiban yang belum jatuh tempo dan belum tercatat
              tidak dihitung.
            </p>
          )}
          {teacher.rpp.state === 'denied' ? (
            <p className="text-xs">Modul ajar: akses tidak tersedia.</p>
          ) : (
            <Bar
              label="RPP disetujui / non-draft"
              pct={teacher.rpp.approvalRate}
              value={teacher.rpp.approvalRate !== null ? `${teacher.rpp.approvalRate}%` : '—'}
            />
          )}
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950 px-2.5 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
            <ClipboardCheck className="h-3.5 w-3.5" />
            {teacher.presentToday} presensi guru tercatat · {teacher.totalTeachers} guru aktif
          </div>
          {teacher.attendance && (
            <p className="mt-2 text-xs text-slate-700 dark:text-slate-200">
              Wajib: {teacher.attendance.required} · Terlambat: {teacher.attendance.late} · Belum
              jatuh tempo: {teacher.attendance.notDue} · Tidak diwajibkan:{' '}
              {teacher.attendance.notRequired} · Tidak terjadwal: {teacher.attendance.notScheduled}{' '}
              · Perlu review: {teacher.attendance.review} · Belum terverifikasi:{' '}
              {teacher.attendance.unknown}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ── Komposisi SDM (rasio) ─────────────────────────────────────────────────────
export function SdmCard({
  teacher,
  studentsActive,
}: {
  teacher: TeacherCompliance | null;
  studentsActive: number | null;
}) {
  const ratio =
    teacher && teacher.totalTeachers > 0 && studentsActive !== null
      ? Math.round(studentsActive / teacher.totalTeachers)
      : null;
  return (
    <Card
      title="Komposisi SDM"
      subtitle="Guru & siswa operasional pada cakupan pilihan"
      icon={Users}
      level="real"
      className="col-span-12 lg:col-span-3"
    >
      <div className="flex items-baseline gap-2">
        <div className="text-[40px] font-extrabold leading-none tracking-normal text-slate-950 dark:text-slate-100">
          {teacher?.totalTeachers ?? '—'}
        </div>
        <span className="text-[12px] font-semibold text-slate-600 dark:text-slate-300">
          guru aktif
        </span>
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-[12px] font-bold text-slate-700 dark:text-slate-200">
        Rasio guru : siswa{' '}
        <b className="text-emerald-700 dark:text-emerald-300">
          {ratio !== null ? `1 : ${ratio}` : '—'}
        </b>
      </div>
      <div className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
        Status kepegawaian (GTY/GTT/PTY/PTT) menyusul.
      </div>
    </Card>
  );
}

// ── Kolektibilitas SPP per bulan ─────────────────────────────────────────────
export function SppBars({ spp, state = 'unavailable' }: { spp: SppMonth[]; state?: 'ready' | 'denied' | 'unavailable' }) {
  const W = 720,
    H = 160,
    y = yScale(0, 100, H, 12);
  const months = [
    '',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const width = spp.length ? Math.max(2, Math.min(40, (W - 30) / spp.length - 12)) : 0;
  return (
    <Card
      title="Kolektibilitas SPP — Realisasi"
      subtitle="Semua tahun dan jurusan · % lunas per bulan"
      icon={Wallet}
      level="real"
      className="col-span-12 lg:col-span-8"
    >
      {state !== 'ready' ? (
        <p role={state === 'denied' ? 'status' : 'alert'} className="py-6 text-sm text-slate-700 dark:text-slate-200">
          {state === 'denied' ? 'Akses data SPP tidak tersedia.' : 'Data SPP belum dapat dimuat. Gunakan Segarkan.'}
        </p>
      ) : !spp.length ? (
        <EmptyState label="Belum ada data SPP yang dapat ditampilkan" />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="Persentase pelunasan SPP per bulan; rincian tersedia pada tabel"
          >
            {[0, 50, 100].map((pct) => (
              <line
                key={pct}
                x1={10}
                x2={W - 10}
                y1={y(pct)}
                y2={y(pct)}
                className="stroke-slate-200 dark:stroke-slate-700"
              />
            ))}
            {spp.map((month, i) => (
              <rect
                key={`${month.year}-${month.month}`}
                x={20 + (i * (W - 40)) / spp.length}
                y={y(month.pct)}
                width={width}
                height={Math.max(0, y(0) - y(month.pct))}
                rx={2}
                className={
                  month.pct >= 80
                    ? 'fill-emerald-700 dark:fill-emerald-400'
                    : 'fill-amber-700 dark:fill-amber-400'
                }
              />
            ))}
          </svg>
          <details className="mt-3 border-t border-slate-200 dark:border-slate-700">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:text-emerald-200 dark:focus-visible:outline-emerald-400">
              Lihat data SPP
            </summary>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Pelunasan SPP menurut bulan</caption>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th scope="col" className="py-2">
                    Bulan
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Lunas / total
                  </th>
                  <th scope="col" className="py-2 text-right">
                    Persentase
                  </th>
                </tr>
              </thead>
              <tbody>
                {spp.map((month) => (
                  <tr
                    key={`${month.year}-${month.month}`}
                    className="border-b border-slate-100 dark:border-slate-800"
                  >
                    <th scope="row" className="py-2 font-normal">
                      {months[month.month]} {month.year}
                    </th>
                    <td className="py-2 text-right tabular-nums">
                      {attendanceNumber(month.paid)} / {attendanceNumber(month.total)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{attendanceNumber(month.pct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

// ── Aging tunggakan ───────────────────────────────────────────────────────────
const AGING_COLORS = ['#10b981', '#f59e0b', '#d97706', '#e11d48'];
export function AgingBar({ aging, majorCode, classId }: { aging: Aging | null; majorCode?: string; classId?: string }) {
  const total = aging?.totalAmount ?? 0;
  const mismatchedScope = aging?.scope && (aging.scope.period !== 'all_years' ||
    aging.scope.majorCode !== (majorCode || null) || aging.scope.classId !== (classId || null));
  const scopeLabel = classId ? 'Kelas pilihan' : majorCode ? `Jurusan ${majorCode}` : 'Semua jurusan';
  return (
    <Card
      title="Aging Tunggakan"
      subtitle={`Piutang SPP semua tahun · ${scopeLabel}`}
      icon={Wallet}
      level="real"
      className="col-span-12 lg:col-span-4"
    >
      {mismatchedScope ? (
        <EmptyState label="Cakupan piutang tidak sesuai pilihan. Gunakan Segarkan." />
      ) : !aging ? (
        <EmptyState label="Data tunggakan belum tersedia" />
      ) : total === 0 ? (
        <EmptyState label="Tidak ada tunggakan pada cakupan ini" />
      ) : (
        <>
          <div aria-hidden="true" className="flex h-3 overflow-hidden rounded">
            {aging.buckets.map(
              (b, i) =>
                b.amount > 0 && (
                  <span
                    key={b.key}
                    style={{
                      width: `${(b.amount / total) * 100}%`,
                      background: AGING_COLORS[i % AGING_COLORS.length],
                    }}
                  />
                ),
            )}
          </div>
          <dl className="mt-4 space-y-3">
            {aging.buckets.map((b, i) => (
              <div
                key={b.key}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <dt className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <i
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: AGING_COLORS[i % AGING_COLORS.length] }}
                  />
                  {b.label}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {fmtRupiah(b.amount)} · {attendanceNumber(Math.round((b.amount / total) * 100))}%
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
            Total tunggakan{' '}
            <strong className="text-rose-700 dark:text-rose-300">{fmtRupiah(total)}</strong> ·{' '}
            {attendanceNumber(aging.totalStudents)} siswa
          </p>
        </>
      )}
    </Card>
  );
}

// ── Funnel PPDB ───────────────────────────────────────────────────────────────
export function PpdbFunnel({ ppdb }: { ppdb: PpdbStats | null }) {
  const sum = (keys: string[]) => keys.reduce((s, k) => s + (ppdb?.byStatus[k] ?? 0), 0);
  const stages = ppdb
    ? [
        { label: 'Leads', value: ppdb.total },
        {
          label: 'Diproses',
          value: sum(['contacted', 'interested', 'registered', 'paid', 'accepted']),
        },
        { label: 'Mendaftar', value: sum(['registered', 'paid', 'accepted']) },
        { label: 'Diterima', value: sum(['accepted']) },
      ]
    : [];
  return (
    <Card
      title="Funnel PPDB"
      subtitle="Penerimaan siswa baru · seluruh data"
      icon={Megaphone}
      level="real"
      className="col-span-12 lg:col-span-4"
    >
      {!ppdb ? (
        <EmptyState label="Data PPDB belum tersedia" />
      ) : ppdb.total === 0 ? (
        <EmptyState label="Belum ada lead PPDB" />
      ) : (
        <>
          <dl className="space-y-4">
            {stages.map((s) => (
              <div key={s.label}>
                <div className="flex justify-between gap-3 text-sm">
                  <dt className="text-slate-700 dark:text-slate-200">{s.label}</dt>
                  <dd className="font-semibold tabular-nums">{attendanceNumber(s.value)}</dd>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1.5 h-2 overflow-hidden rounded bg-slate-100 dark:bg-slate-800 dark:bg-slate-800"
                >
                  <div
                    className="h-full rounded bg-emerald-700 dark:bg-emerald-400"
                    style={{ width: `${Math.min(100, (s.value / ppdb.total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm">
            Konversi total{' '}
            <strong className="text-emerald-800 dark:text-emerald-200 dark:text-emerald-200">
              {attendanceNumber(ppdb.conversionRate)}%
            </strong>
          </p>
        </>
      )}
    </Card>
  );
}

// ── Status sistem ─────────────────────────────────────────────────────────────
export function SystemStatusCard({ system }: { system: SystemStatus }) {
  return (
    <Card
      title="Status Sistem"
      subtitle="Keterjangkauan layanan"
      icon={ShieldCheck}
      level="real"
      className="col-span-12 lg:col-span-5"
    >
      {!system.services.length && <EmptyState label="Status layanan belum tersedia" />}
      <div className="grid grid-cols-2 gap-2.5">
        {system.services.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-[12px] font-bold text-slate-950 dark:text-slate-100"
          >
            <span
              className={clsx(
                'h-2.5 w-2.5 rounded-full',
                s.ok
                  ? 'bg-emerald-500 shadow-[0_0_0_3px_#d1fae5]'
                  : 'bg-rose-500 shadow-[0_0_0_3px_#ffe4e6]',
              )}
            />
            {s.label}
            <span className="ml-auto text-xs font-semibold text-slate-600 dark:text-slate-300">
              {s.ok ? 'OK' : 'Gangguan'}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Adopsi platform (placeholder jujur) ──────────────────────────────────────
export function AdoptionCard() {
  return (
    <Card
      title="Adopsi Platform"
      subtitle="Pengguna aktif per peran"
      icon={Activity}
      level="soon"
      className="col-span-12 lg:col-span-7"
    >
      <EmptyState label="Analitik adopsi (dari audit log) menyusul" />
    </Card>
  );
}

// ── Pita visi modul SMK ───────────────────────────────────────────────────────
const VISION = [
  {
    icon: Briefcase,
    title: 'Tracer Study & BKK',
    desc: 'Keterserapan lulusan (Bekerja/Melanjutkan/Wirausaha).',
    target: '% keterserapan/jurusan',
  },
  {
    icon: Users,
    title: 'DUDI & Kemitraan',
    desc: 'CRM industri, MoU aktif, kelas industri.',
    target: 'MoU aktif & kontribusi',
  },
  {
    icon: Backpack,
    title: 'PKL / Prakerin',
    desc: 'Penempatan, jurnal, presensi, nilai industri.',
    target: 'konversi PKL → kerja',
  },
  {
    icon: GraduationCap,
    title: 'UKK & Sertifikasi',
    desc: 'Uji kompetensi & sertifikat LSP/BNSP.',
    target: '% siswa tersertifikasi',
  },
  {
    icon: BarChart3,
    title: 'Teaching Factory',
    desc: 'Unit produksi: omzet & keterlibatan siswa.',
    target: 'omzet TeFa/jurusan',
  },
  {
    icon: Brain,
    title: 'Student 360 / AI',
    desc: 'Profil terpadu → risiko & talent scoring.',
    target: 'prediksi & rekomendasi',
  },
];

export function VisionRibbon() {
  return (
    <>
      <SectionLabel icon={Sparkles}>
        Visi Intelijen SMK — Modul Menyusul (Link &amp; Match)
      </SectionLabel>
      <div className="col-span-12 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {VISION.map((v) => {
          const Icon = v.icon;
          return (
            <div
              key={v.title}
              className="min-w-0 border-t border-dashed border-slate-300 py-4 dark:border-slate-700"
            >
              <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <CalendarDays className="h-3 w-3" />
                Roadmap
              </div>
              <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300">
                <Icon className="h-4 w-4" />
              </div>
              <h4 className="text-sm font-extrabold tracking-normal text-slate-950 dark:text-slate-100">
                {v.title}
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {v.desc}
              </p>
              <div className="mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                Target: {v.target}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
