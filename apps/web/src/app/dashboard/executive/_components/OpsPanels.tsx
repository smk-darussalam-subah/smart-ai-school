'use client';

import {
  Activity, Backpack, BarChart3, Brain, Briefcase, CalendarDays, ClipboardCheck,
  GraduationCap, Megaphone, ShieldCheck, Sparkles, Users, Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, EmptyState, SectionLabel, fmtRupiah, yScale } from './ui';
import type { Aging, AtRisk, PpdbStats, SppMonth, SystemStatus, TeacherCompliance, TrenSeries } from '../types';

// ── Tren kehadiran (overall, recent) ─────────────────────────────────────────
export function TrendArea({ tren }: { tren: TrenSeries }) {
  const pts = tren.pcts;
  const W = 720;
  const H = 200;
  const y = yScale(70, 100, H - 30, 16);
  const x = (i: number) => (pts.length <= 1 ? 10 : 10 + (i * (W - 20)) / (pts.length - 1));
  const poly = pts.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const area = pts.length ? `${poly} ${x(pts.length - 1)},${H - 14} ${x(0)},${H - 14}` : '';
  return (
    <Card title="Tren Kehadiran Siswa" subtitle={`${pts.length} hari terakhir · keseluruhan`} icon={Activity} level="real" className="col-span-12 lg:col-span-8">
      {pts.length < 2 ? (
        <EmptyState label="Data kehadiran belum cukup" />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="trenG" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="1" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[100, 90, 80, 70].map((g) => (
            <line key={g} x1={10} y1={y(g)} x2={W - 10} y2={y(g)} stroke="#eef2f0" />
          ))}
          <polygon points={area} fill="url(#trenG)" />
          <polyline points={poly} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </Card>
  );
}

// ── Siswa berisiko ────────────────────────────────────────────────────────────
export function AtRiskCard({ atRisk }: { atRisk: AtRisk | null }) {
  return (
    <Card title="Siswa Berisiko" subtitle="Alpha kronis ≥ 3× / 30 hari" icon={ShieldCheck} level="soon" className="col-span-12 lg:col-span-4">
      {!atRisk ? (
        <EmptyState />
      ) : (
        <>
          <div className="text-[46px] font-extrabold leading-none tracking-tighter text-rose-600">{atRisk.total}</div>
          <div className="mt-3 flex flex-col gap-2">
            {atRisk.byClass.slice(0, 4).map((c) => (
              <div key={c.className} className="flex items-center justify-between rounded-lg bg-[#f4f7f5] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#355a4e]">
                <span>{c.className}</span>
                <b className="text-rose-600">{c.count} siswa</b>
              </div>
            ))}
            {atRisk.total > 0 && (
              <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-emerald-700">→ Rekomendasi intervensi BK</div>
            )}
            {atRisk.total === 0 && <div className="text-[12px] font-medium text-[#9bb0a8]">Tidak ada siswa berisiko 🎉</div>}
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
    <div className="mb-2.5 grid grid-cols-[110px_1fr_42px] items-center gap-2.5 text-[11.5px] font-semibold text-[#355a4e]">
      <span>{label}</span>
      <span className="h-[9px] overflow-hidden rounded-md bg-[#eef3f0]">
        <span
          className="block h-full rounded-md"
          style={{ width: `${pct ?? 0}%`, background: pct === null ? '#cbd5e1' : warn ? 'linear-gradient(90deg,#fbbf24,#d97706)' : 'linear-gradient(90deg,#34d399,#059669)' }}
        />
      </span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

export function TeacherComplianceCard({ teacher }: { teacher: TeacherCompliance | null }) {
  return (
    <Card title="Kepatuhan Guru" subtitle="Kehadiran GPS · RPP" icon={ClipboardCheck} level="soon" className="col-span-12 lg:col-span-5">
      {!teacher ? (
        <EmptyState />
      ) : (
        <>
          <Bar label="Kehadiran GPS" pct={teacher.gpsPct} value={teacher.gpsPct !== null ? `${teacher.gpsPct}%` : '—'} />
          <Bar label="RPP disetujui" pct={teacher.rpp.approvalRate} value={teacher.rpp.approvalRate !== null ? `${teacher.rpp.approvalRate}%` : '—'} />
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-700">
            <ClipboardCheck className="h-3.5 w-3.5" />
            {teacher.presentToday}/{teacher.totalTeachers} guru hadir hari ini · {teacher.rpp.total} RPP semester ini
          </div>
        </>
      )}
    </Card>
  );
}

// ── Komposisi SDM (rasio) ─────────────────────────────────────────────────────
export function SdmCard({ teacher, studentsActive }: { teacher: TeacherCompliance | null; studentsActive: number | null }) {
  const ratio = teacher && teacher.totalTeachers > 0 && studentsActive ? Math.round(studentsActive / teacher.totalTeachers) : null;
  return (
    <Card title="Komposisi SDM" subtitle="Guru & rasio terhadap siswa" icon={Users} level="real" className="col-span-12 lg:col-span-3">
      <div className="flex items-baseline gap-2">
        <div className="text-[40px] font-extrabold leading-none tracking-tighter text-[#0f2e25]">{teacher?.totalTeachers ?? '—'}</div>
        <span className="text-[12px] font-semibold text-[#6b8079]">guru aktif</span>
      </div>
      <div className="mt-3 rounded-lg bg-[#f4f7f5] px-3 py-2 text-[12px] font-bold text-[#355a4e]">
        Rasio guru : siswa <b className="text-emerald-700">{ratio !== null ? `1 : ${ratio}` : '—'}</b>
      </div>
      <div className="mt-2 text-[11px] font-medium text-[#9bb0a8]">Status kepegawaian (GTY/GTT/PTY/PTT) menyusul.</div>
    </Card>
  );
}

// ── Kolektibilitas SPP per bulan ─────────────────────────────────────────────
export function SppBars({ spp }: { spp: SppMonth[] }) {
  const W = 720;
  const H = 190;
  const y = yScale(0, 100, H - 30, 16);
  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const bw = spp.length ? Math.min(40, (W - 30) / spp.length - 12) : 0;
  return (
    <Card title="Kolektibilitas SPP — Realisasi" subtitle="% lunas per bulan" icon={Wallet} level="real" className="col-span-12 lg:col-span-8">
      {spp.length === 0 ? (
        <EmptyState label="Belum ada data pembayaran SPP" />
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          <line x1={20} y1={y(100)} x2={W - 10} y2={y(100)} stroke="#d97706" strokeWidth={1.2} strokeDasharray="5 4" />
          {spp.map((m, i) => {
            const cx = 30 + i * ((W - 50) / spp.length);
            const top = y(m.pct);
            return (
              <g key={`${m.year}-${m.month}`}>
                <rect x={cx} y={top} width={bw} height={Math.max(2, y(0) - top)} rx={4} fill={m.pct >= 80 ? '#059669' : '#d97706'} />
                <text x={cx + bw / 2} y={H - 12} textAnchor="middle" className="fill-[#6b8079] text-[10px] font-semibold">{MONTHS[m.month]}</text>
              </g>
            );
          })}
        </svg>
      )}
    </Card>
  );
}

// ── Aging tunggakan ───────────────────────────────────────────────────────────
const AGING_COLORS = ['#10b981', '#f59e0b', '#d97706', '#e11d48'];
export function AgingBar({ aging }: { aging: Aging | null }) {
  const total = aging?.totalAmount ?? 0;
  return (
    <Card title="Aging Tunggakan" subtitle="Umur piutang SPP" icon={Wallet} level="soon" className="col-span-12 lg:col-span-4">
      {!aging || total === 0 ? (
        <EmptyState label="Tidak ada tunggakan 🎉" />
      ) : (
        <>
          <div className="mt-1 flex h-9 overflow-hidden rounded-lg">
            {aging.buckets.map((b, i) => {
              const w = total ? (b.amount / total) * 100 : 0;
              if (w === 0) return null;
              return <span key={b.key} style={{ width: `${w}%`, background: AGING_COLORS[i] }} title={`${b.label}: ${fmtRupiah(b.amount)}`} />;
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {aging.buckets.map((b, i) => (
              <span key={b.key} className="flex items-center gap-1.5 text-[11px] font-semibold text-[#6b8079]">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: AGING_COLORS[i] }} />
                {b.label} · {total ? Math.round((b.amount / total) * 100) : 0}%
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-lg bg-[#f4f7f5] px-3 py-2 text-[11.5px] font-bold text-[#355a4e]">
            Total tunggakan <b className="text-rose-600">{fmtRupiah(total)}</b> · {aging.totalStudents} siswa
          </div>
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
        { label: 'Leads', value: ppdb.total, color: '#047857', w: 200 },
        { label: 'Diproses', value: sum(['contacted', 'interested', 'registered', 'paid', 'accepted']), color: '#059669', w: 156 },
        { label: 'Mendaftar', value: sum(['registered', 'paid', 'accepted']), color: '#10b981', w: 112 },
        { label: 'Diterima', value: sum(['accepted']), color: '#34d399', w: 72 },
      ]
    : [];
  return (
    <Card title="Funnel PPDB" subtitle="Penerimaan siswa baru" icon={Megaphone} level="real" className="col-span-12 lg:col-span-4">
      {!ppdb || ppdb.total === 0 ? (
        <EmptyState label="Belum ada lead PPDB" />
      ) : (
        <>
          <div className="flex flex-col items-center gap-1.5">
            {stages.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ width: s.w, height: 32, background: s.color }}
              >
                {s.label} · {s.value}
              </div>
            ))}
          </div>
          <div className="mt-2 text-center text-[11.5px] font-bold text-[#355a4e]">
            Konversi total <b className="text-emerald-700">{ppdb.conversionRate}%</b>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Status sistem ─────────────────────────────────────────────────────────────
export function SystemStatusCard({ system }: { system: SystemStatus }) {
  return (
    <Card title="Status Sistem" subtitle="Keterjangkauan layanan" icon={ShieldCheck} level="real" className="col-span-12 lg:col-span-5">
      <div className="grid grid-cols-2 gap-2.5">
        {system.services.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 rounded-xl bg-[#f4f7f5] px-3 py-2.5 text-[12px] font-bold text-[#0f2e25]">
            <span
              className={clsx('h-2.5 w-2.5 rounded-full', s.ok ? 'bg-emerald-500 shadow-[0_0_0_3px_#d1fae5]' : 'bg-rose-500 shadow-[0_0_0_3px_#ffe4e6]')}
            />
            {s.label}
            <span className="ml-auto text-[11px] font-semibold text-[#6b8079]">{s.ok ? 'OK' : 'Gangguan'}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Adopsi platform (placeholder jujur) ──────────────────────────────────────
export function AdoptionCard() {
  return (
    <Card title="Adopsi Platform" subtitle="Pengguna aktif per peran" icon={Activity} level="soon" className="col-span-12 lg:col-span-7">
      <EmptyState label="Analitik adopsi (dari audit log) menyusul" />
    </Card>
  );
}

// ── Pita visi modul SMK ───────────────────────────────────────────────────────
const VISION = [
  { icon: Briefcase, title: 'Tracer Study & BKK', desc: 'Keterserapan lulusan (Bekerja/Melanjutkan/Wirausaha).', target: '% keterserapan/jurusan' },
  { icon: Users, title: 'DUDI & Kemitraan', desc: 'CRM industri, MoU aktif, kelas industri.', target: 'MoU aktif & kontribusi' },
  { icon: Backpack, title: 'PKL / Prakerin', desc: 'Penempatan, jurnal, presensi, nilai industri.', target: 'konversi PKL → kerja' },
  { icon: GraduationCap, title: 'UKK & Sertifikasi', desc: 'Uji kompetensi & sertifikat LSP/BNSP.', target: '% siswa tersertifikasi' },
  { icon: BarChart3, title: 'Teaching Factory', desc: 'Unit produksi: omzet & keterlibatan siswa.', target: 'omzet TeFa/jurusan' },
  { icon: Brain, title: 'Student 360 / AI', desc: 'Profil terpadu → risiko & talent scoring.', target: 'prediksi & rekomendasi' },
];

export function VisionRibbon() {
  return (
    <>
      <SectionLabel icon={Sparkles}>Visi Intelijen SMK — Modul Menyusul (Link &amp; Match)</SectionLabel>
      <div className="col-span-12 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {VISION.map((v) => {
          const Icon = v.icon;
          return (
            <div key={v.title} className="relative rounded-2xl border border-dashed border-[#cdd9d3] bg-gradient-to-b from-[#fbfdfc] to-[#f2f7f4] p-3.5">
              <div className="absolute right-3 top-3 flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide text-slate-400">
                <CalendarDays className="h-3 w-3" />
                Roadmap
              </div>
              <div className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg border border-[#e3ece8] bg-white text-emerald-700">
                <Icon className="h-4 w-4" />
              </div>
              <h4 className="text-[12.5px] font-extrabold tracking-tight text-[#0f2e25]">{v.title}</h4>
              <p className="mt-1 text-[10.8px] font-medium leading-snug text-[#6b8079]">{v.desc}</p>
              <div className="mt-2 rounded-md border border-[#e3ece8] bg-white px-2 py-1.5 text-[10px] font-bold text-[#355a4e]">Target: {v.target}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
