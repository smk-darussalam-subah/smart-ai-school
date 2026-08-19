'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileCheck2,
  FileText,
  GraduationCap,
  Home,
  LoaderCircle,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  type LucideIcon,
  UserRound,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePagination } from '@/components/ui/table-pagination';
import { Textarea } from '@/components/ui/textarea';
import { useQueryState } from '@/hooks/use-query-state';
import { generateReports, recoverReport, transitionReport, updateReportNotes } from '../actions';

interface SubjectSnapshot {
  subject: string;
  count: number;
  average: number;
  byType: Record<string, number>;
  kktp?: number | null;
  kktpProvenance?: string | null;
}
export interface ReportItem {
  id: string;
  studentId: string;
  classId: string;
  academicYear: string;
  semester: number;
  status: 'draft' | 'checked' | 'published' | 'distributed';
  grades: SubjectSnapshot[];
  attendance?: Record<string, number> | null;
  notes?: string | null;
  generatedAt: string;
  updatedAt: string;
  checkedAt?: string | null;
  checkedBy?: string | null;
  checkedByName?: string | null;
  returnedAt?: string | null;
  returnedBy?: string | null;
  returnedByName?: string | null;
  returnReason?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  publishedByName?: string | null;
  distributedAt?: string | null;
  distributedBy?: string | null;
  distributedByName?: string | null;
  canManageDraft: boolean;
  statusEvents?: Array<{
    id: string; action: string; fromStatus: string; toStatus: string;
    actorName: string; reason?: string | null; incidentReference?: string | null; createdAt: string;
  }>;
  student: { id: string; nis: string; user: { fullName: string } };
  class: { id: string; name: string };
}
interface ClassItem { id: string; name: string; canManageDraft: boolean }
interface Props {
  items: ReportItem[];
  total: number;
  classes: ClassItem[];
  query: { page: number; limit: number; classId: string; studentId?: string; status: string; search: string };
  canGenerate: boolean;
  canCheck: boolean;
  canPublish: boolean;
  canDistribute: boolean;
  canRecover: boolean;
  isOperational: boolean;
  learnerShell?: 'student' | 'parent' | null;
  defaultAcademicYear: string;
  defaultSemester: number;
}

const STATUS = {
  draft: { label: 'Draft wali kelas', variant: 'outline' as const },
  checked: { label: 'Diperiksa Waka', variant: 'secondary' as const },
  published: { label: 'Diterbitkan KS', variant: 'default' as const },
  distributed: { label: 'Didistribusikan', variant: 'default' as const },
};

const STATUS_CLASS: Record<ReportItem['status'], string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  checked: 'border-sky-200 bg-sky-50 text-sky-800',
  published: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  distributed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

const STATUS_STEP: Record<ReportItem['status'], number> = {
  draft: 1,
  checked: 2,
  published: 3,
  distributed: 4,
};

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function averageOf(grades: SubjectSnapshot[]): number | null {
  if (grades.length === 0) return null;
  return Math.round((grades.reduce((sum, item) => sum + item.average, 0) / grades.length) * 10) / 10;
}

function periodLabel(report: ReportItem): string {
  return `${report.academicYear} · Semester ${report.semester}`;
}

export default function RaporHub(props: Props) {
  const { items, total, classes, query, canGenerate, canCheck, canPublish, canDistribute, canRecover, isOperational, learnerShell, defaultAcademicYear, defaultSemester } = props;
  const { setParams, isPending } = useQueryState();
  const [search, setSearch] = useState(query.search);
  const [detail, setDetail] = useState<ReportItem | null>(null);
  const [returning, setReturning] = useState<ReportItem | null>(null);
  const [confirming, setConfirming] = useState<{ report: ReportItem; action: 'publish' | 'distribute' } | null>(null);
  const [recovering, setRecovering] = useState<ReportItem | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, startTransition] = useTransition();

  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => {
    if (search === query.search) return;
    const timer = setTimeout(() => setParams({ search: search || null }), 350);
    return () => clearTimeout(timer);
  }, [query.search, search, setParams]);

  const run = (action: () => Promise<{ success: boolean; error?: string; data?: unknown }>, onSuccess?: () => void) => {
    setError('');
    setInfo('');
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Aksi gagal diproses');
      else onSuccess?.();
    });
  };
  const statusCounts = useMemo(() => {
    return items.reduce<Record<ReportItem['status'], number>>((acc, item) => {
      acc[item.status] += 1;
      return acc;
    }, { draft: 0, checked: 0, published: 0, distributed: 0 });
  }, [items]);
  const activePeriod = `${defaultAcademicYear} · Semester ${defaultSemester}`;

  useEffect(() => {
    if (isOperational) return;
    const storageKey = learnerShell === 'parent' ? 'diis-ortu-theme' : 'diis-theme';
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : 'dark');
  }, [isOperational, learnerShell]);

  if (!isOperational) {
    return (
      <LearnerAppShell
        shell={learnerShell ?? 'student'}
        activePeriod={activePeriod}
        total={total}
        distributed={statusCounts.distributed}
      >
        {info && <p className="text-sm font-semibold text-[var(--em)]" role="status">{info}</p>}
        {error && <p className="text-sm font-semibold text-rose-500" role="alert">{error}</p>}
        <LearnerReportBoard items={items} isPending={isPending} onDetail={setDetail} />
        {total > query.limit && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
            <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
          </div>
        )}
        <ReportDetail report={detail} pending={busy} learnerShell={learnerShell ?? 'student'} onClose={() => setDetail(null)} run={run} />
      </LearnerAppShell>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-md bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Dokumen resmi sekolah</Badge>
              <span className="text-xs font-medium text-slate-500">{activePeriod}</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">Rapor</h1>
              <p className="max-w-2xl text-sm leading-6 text-slate-600">
                {isOperational
                  ? 'Kelola alur rapor dari draft wali kelas sampai distribusi ke siswa dan orang tua.'
                  : 'Lihat rapor resmi yang sudah diterbitkan dan didistribusikan sekolah.'}
              </p>
            </div>
            {canGenerate && (
              <Button onClick={() => setGenerateOpen(true)} className="w-full sm:w-auto">
                <FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Siapkan draft kelas
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-1">
            <MetricTile icon={ClipboardCheck} label="Total rapor" value={String(total)} />
            <MetricTile icon={CheckCircle2} label="Didistribusikan" value={String(statusCounts.distributed)} />
          </div>
        </div>
      </section>

      {canRecover && (
        <div className="flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p><b>Mode bantuan Super Admin.</b> Penerbitan, distribusi, dan pemulihan akan tercatat atas identitas Anda.</p>
        </div>
      )}

      {isOperational && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_200px_200px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS" className="pl-9" aria-label="Cari rapor" />
          </div>
          <Select value={query.classId || 'all'} onValueChange={(value: string) => setParams({ classId: value })}>
            <SelectTrigger aria-label="Filter kelas"><SelectValue placeholder="Semua kelas" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua kelas</SelectItem>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={query.status || 'all'} onValueChange={(value: string) => setParams({ status: value })}>
            <SelectTrigger aria-label="Filter status"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Semua status</SelectItem>{Object.entries(STATUS).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {info && <p className="text-sm text-emerald-700" role="status">{info}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      {isOperational ? (
        <OperationalReportRegistry
          items={items}
          query={query}
          busy={busy}
          isPending={isPending}
          canCheck={canCheck}
          canPublish={canPublish}
          canDistribute={canDistribute}
          canRecover={canRecover}
          onDetail={setDetail}
          onReturn={setReturning}
          onConfirm={setConfirming}
          onRecover={setRecovering}
          run={run}
        />
      ) : (
        <LearnerReportBoard items={items} isPending={isPending} onDetail={setDetail} />
      )}

      <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
      <ReportDetail report={detail} pending={busy} onClose={() => setDetail(null)} run={run} />
      <ReturnDialog report={returning} pending={busy} error={error} onClose={() => setReturning(null)} run={run} />
      <ConfirmTransitionDialog value={confirming} pending={busy} error={error} onClose={() => setConfirming(null)} run={run} />
      <RecoveryDialog report={recovering} pending={busy} error={error} onClose={() => setRecovering(null)} run={run} />
      {canGenerate && <GenerateDialog {...props} open={generateOpen} onOpenChange={setGenerateOpen} onResult={setInfo} />}
    </div>
  );
}

function LearnerAppShell({
  shell,
  activePeriod,
  total,
  distributed,
  children,
}: {
  shell: 'student' | 'parent';
  activePeriod: string;
  total: number;
  distributed: number;
  children: ReactNode;
}) {
  const appClass = shell === 'parent' ? 'ortu-app' : 'siswa-app';
  const brandLabel = shell === 'parent' ? 'Orang Tua' : 'Smart AI School';
  return (
    <div className={`${appClass} relative min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors duration-300`}>
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--topbar-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[560px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-800 text-base font-extrabold text-white shadow-[0_0_20px_rgba(16,185,129,.3)]">
              D
            </div>
            <div>
              <div className="text-sm font-bold">DIIS</div>
              <div className="text-[10px] font-semibold text-[var(--muted)]">{brandLabel}</div>
            </div>
          </div>
          <a
            href="/dashboard/akademik"
            className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--text)] transition-colors hover:bg-[var(--surface2)]"
            aria-label="Kembali ke dashboard akademik"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] space-y-4 px-4 pb-24 pt-4">
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
          <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(16,185,129,.24),rgba(59,130,246,.10))] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--em)]">Rapor resmi</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-normal text-[var(--text)]">Dokumen semester</h1>
                <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{activePeriod}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--em)]">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--border)]">
            <div className="bg-[var(--surface)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Total</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--text)]">{total}</p>
            </div>
            <div className="bg-[var(--surface)] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Dibagikan</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--em)]">{distributed}</p>
            </div>
          </div>
        </section>
        {children}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-[560px] -translate-x-1/2 border-t border-[var(--border)] bg-[var(--nav-bg)] backdrop-blur-2xl">
        <div className="grid grid-cols-3 px-3 py-2">
          <a href="/dashboard/akademik" className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[var(--dim)] transition-colors hover:text-[var(--text)]">
            <Home className="h-5 w-5" aria-hidden="true" />
            <span className="text-[9px] font-bold">Beranda</span>
          </a>
          <a href="/dashboard/akademik" className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[var(--dim)] transition-colors hover:text-[var(--text)]">
            <Bell className="h-5 w-5" aria-hidden="true" />
            <span className="text-[9px] font-bold">Notifikasi</span>
          </a>
          <span className="relative flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[var(--em)]" aria-current="page">
            <span className="absolute left-[30%] right-[30%] top-0 h-[2.5px] rounded-full bg-[var(--em)]" />
            <FileText className="h-5 w-5 drop-shadow-[0_0_6px_rgba(16,185,129,.4)]" aria-hidden="true" />
            <span className="text-[9px] font-bold">Rapor</span>
          </span>
        </div>
      </nav>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
        <span className="block text-2xl font-bold text-slate-950">{value}</span>
      </span>
    </div>
  );
}

function EmptyReports({ operational }: { operational: boolean }) {
  if (!operational) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface2)] text-[var(--muted)]">
          <FileCheck2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-3 font-bold text-[var(--text)]">Belum ada rapor</p>
        <p className="mt-1 text-sm font-medium text-[var(--muted)]">
          Rapor resmi akan muncul setelah sekolah mendistribusikannya.
        </p>
      </div>
    );
  }

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FileCheck2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">Belum ada rapor</p>
          <p className="mt-1 text-sm text-slate-500">
            {operational ? 'Tidak ada rapor yang cocok dengan filter saat ini.' : 'Rapor resmi akan muncul setelah sekolah mendistribusikannya.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LearnerReportBoard({ items, isPending, onDetail }: {
  items: ReportItem[];
  isPending: boolean;
  onDetail: (report: ReportItem) => void;
}) {
  if (items.length === 0) return <EmptyReports operational={false} />;
  return (
    <div className={`space-y-4 transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
      {items.map((item) => (
        <LearnerReportCard key={item.id} report={item} onDetail={onDetail} />
      ))}
    </div>
  );
}

function LearnerReportCard({ report, onDetail }: { report: ReportItem; onDetail: (report: ReportItem) => void }) {
  const average = averageOf(report.grades);
  const attendance = report.attendance ?? {};
  const step = STATUS_STEP[report.status];
  const visibleGrades = report.grades.slice(0, 4);
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(16,185,129,.20),rgba(59,130,246,.10))] p-5 text-[var(--text)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Badge className="w-fit rounded-md border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] hover:bg-[var(--surface2)]">
              {STATUS[report.status].label}
            </Badge>
            <div>
              <h2 className="text-2xl font-extrabold tracking-normal">{report.student.user.fullName}</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">NIS {report.student.nis} · {report.class.name}</p>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Periode</p>
            <p className="mt-1 text-lg font-bold">{periodLabel(report)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 border-b border-[var(--border)] sm:grid-cols-4">
        <SummaryCell icon={GraduationCap} label="Rata-rata" value={average === null ? '-' : String(average)} />
        <SummaryCell icon={ClipboardCheck} label="Mapel" value={String(report.grades.length)} />
        <SummaryCell icon={UserRound} label="Hadir" value={String(attendance.hadir ?? 0)} />
        <SummaryCell icon={CalendarDays} label="Dibagikan" value={formatDate(report.distributedAt)} />
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-3" aria-label="Ringkasan nilai rapor">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold uppercase text-[var(--muted)]">Ringkasan nilai</h3>
            <span className="text-xs font-semibold text-[var(--muted)]">Snapshot resmi</span>
          </div>
          {visibleGrades.length > 0 ? (
            <div className="space-y-2">
              {visibleGrades.map((grade) => (
                <div key={grade.subject} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[var(--text)]">{grade.subject}</p>
                    <p className="mt-0.5 text-xs font-semibold text-[var(--muted)]">KKTP {typeof grade.kktp === 'number' ? grade.kktp : '-'} · {grade.count} komponen</p>
                  </div>
                  <div className="text-right text-2xl font-extrabold text-[var(--text)]">{grade.average}</div>
                </div>
              ))}
              {report.grades.length > visibleGrades.length && (
                <p className="text-xs font-semibold text-[var(--muted)]">{report.grades.length - visibleGrades.length} mata pelajaran lain tersedia di detail.</p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-sm font-semibold text-[var(--muted)]">Belum ada nilai pada snapshot ini.</p>
          )}
        </section>

        <aside className="space-y-4" aria-label="Status dokumen rapor">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
            <h3 className="text-sm font-bold text-[var(--text)]">Status dokumen</h3>
            <div className="mt-4 space-y-3">
              {['Draft', 'Diperiksa', 'Diterbitkan', 'Didistribusikan'].map((label, index) => {
                const done = step >= index + 1;
                return (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]'}`}>
                      {done ? <Check className="h-4 w-4" aria-hidden="true" /> : index + 1}
                    </span>
                    <span className={done ? 'font-bold text-[var(--text)]' : 'font-semibold text-[var(--muted)]'}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm font-semibold text-[var(--em)]">
            Dokumen ini memakai snapshot nilai, KKTP, kehadiran, dan catatan pada saat rapor diterbitkan.
          </div>
          <Button className="w-full rounded-xl bg-emerald-500 font-bold text-white hover:bg-emerald-600" onClick={() => onDetail(report)}>
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
            Lihat rincian rapor
          </Button>
        </aside>
      </div>
    </article>
  );
}

function SummaryCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--surface2)] text-[var(--em)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
        <span className="block truncate text-lg font-extrabold text-[var(--text)]">{value}</span>
      </span>
    </div>
  );
}

function OperationalReportRegistry({
  items,
  query,
  busy,
  isPending,
  canCheck,
  canPublish,
  canDistribute,
  canRecover,
  onDetail,
  onReturn,
  onConfirm,
  onRecover,
  run,
}: {
  items: ReportItem[];
  query: Props['query'];
  busy: boolean;
  isPending: boolean;
  canCheck: boolean;
  canPublish: boolean;
  canDistribute: boolean;
  canRecover: boolean;
  onDetail: (report: ReportItem) => void;
  onReturn: (report: ReportItem) => void;
  onConfirm: (value: { report: ReportItem; action: 'publish' | 'distribute' }) => void;
  onRecover: (report: ReportItem) => void;
  run: (action: () => Promise<{ success: boolean; error?: string; data?: unknown }>, onSuccess?: () => void) => void;
}) {
  if (items.length === 0) return <EmptyReports operational />;
  return (
    <Card className={`overflow-hidden transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
      <CardHeader className="border-b border-slate-200 pb-4">
        <CardTitle className="text-lg">Registry rapor</CardTitle>
        <p className="text-sm text-slate-500">Daftar kerja sesuai filter aktif. Aksi hanya muncul jika status dan kewenangan cocok.</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Siswa</TableHead><TableHead>Kelas</TableHead><TableHead>Periode</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
            <TableBody>{items.map((item) => (
              <TableRow key={item.id}>
                <TableCell><div className="font-medium">{item.student.user.fullName}</div><div className="text-xs text-muted-foreground">NIS {item.student.nis}</div></TableCell>
                <TableCell>{item.class.name}</TableCell>
                <TableCell className="whitespace-nowrap">{item.academicYear} / {item.semester}</TableCell>
                <TableCell><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}>{STATUS[item.status].label}</span></TableCell>
                <TableCell><div className="flex flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => onDetail(item)}><Eye className="mr-2 h-4 w-4" aria-hidden="true" />Detail</Button>
                  {canCheck && item.status === 'draft' && <Button size="sm" disabled={busy} onClick={() => run(() => transitionReport(item.id, 'check'))}><Check className="mr-2 h-4 w-4" aria-hidden="true" />Tandai diperiksa</Button>}
                  {canCheck && item.status === 'checked' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onReturn(item)}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />Kembalikan</Button>}
                  {canPublish && item.status === 'checked' && <Button size="sm" disabled={busy} onClick={() => onConfirm({ report: item, action: 'publish' })}><Send className="mr-2 h-4 w-4" aria-hidden="true" />Terbitkan</Button>}
                  {canDistribute && item.status === 'published' && <Button size="sm" disabled={busy} onClick={() => onConfirm({ report: item, action: 'distribute' })}><Send className="mr-2 h-4 w-4" aria-hidden="true" />Distribusikan</Button>}
                  {canRecover && item.status !== 'draft' && <Button size="sm" variant="outline" disabled={busy} onClick={() => onRecover(item)}><ShieldAlert className="mr-2 h-4 w-4" aria-hidden="true" />Pemulihan</Button>}
                </div></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Halaman {query.page}, maksimal {query.limit} rapor per halaman.</div>
      </CardContent>
    </Card>
  );
}

function ReportDetail({ report, pending, learnerShell, onClose, run }: {
  report: ReportItem | null; pending: boolean; learnerShell?: 'student' | 'parent' | null; onClose: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void;
}) {
  const [notes, setNotes] = useState('');
  useEffect(() => { if (report) setNotes(report.notes ?? ''); }, [report]);
  const attendance = report?.attendance;
  const shellClass = learnerShell ? (learnerShell === 'parent' ? 'ortu-app' : 'siswa-app') : '';
  const dialogTone = learnerShell ? 'border-[var(--border)] bg-[var(--bg2)] text-[var(--text)]' : '';
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && onClose()}>
    <DialogContent className={`${shellClass} max-h-[92vh] overflow-y-auto sm:max-w-3xl ${dialogTone}`}>
      <DialogHeader><DialogTitle>Rapor {report?.student.user.fullName}</DialogTitle><DialogDescription>{report?.class.name} | {report?.academicYear} Semester {report?.semester}</DialogDescription></DialogHeader>
      {report && report.grades.length > 0 ? <div className="overflow-x-auto rounded border"><Table><TableHeader><TableRow><TableHead>Mata pelajaran</TableHead><TableHead className="text-right">Nilai akhir</TableHead><TableHead>KKTP snapshot</TableHead><TableHead>Komponen</TableHead></TableRow></TableHeader><TableBody>{report.grades.map((grade) => <TableRow key={grade.subject}><TableCell>{grade.subject}</TableCell><TableCell className="text-right font-semibold">{grade.average}</TableCell><TableCell className="text-xs">{typeof grade.kktp === 'number' ? `${grade.kktp} (${grade.kktpProvenance ?? 'snapshot'})` : 'Belum tersedia'}</TableCell><TableCell className="text-xs text-muted-foreground">{Object.entries(grade.byType).map(([type, value]) => `${type.toUpperCase()}: ${value}`).join(' | ')}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="text-sm text-muted-foreground">Belum ada nilai pada snapshot ini.</p>}
      {attendance && <p className="text-sm">Kehadiran: <b>{attendance.hadir ?? 0}</b> hadir | {attendance.izin ?? 0} izin | {attendance.sakit ?? 0} sakit | {attendance.alpha ?? 0} alpa</p>}
      {report?.canManageDraft && report.status === 'draft' ? <div className="space-y-2"><Label htmlFor="report-notes">Catatan wali kelas</Label><Textarea id="report-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /><Button size="sm" disabled={pending} onClick={() => run(() => updateReportNotes(report.id, notes.trim() || null, report.updatedAt), onClose)}>Simpan catatan</Button></div> : report?.notes ? <p className="rounded border bg-muted/30 p-3 text-sm"><b>Catatan wali kelas:</b> {report.notes}</p> : null}
      {report?.returnReason && <p className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><b>Alasan pengembalian terakhir:</b> {report.returnReason}</p>}
      {report && <div className="border-t pt-3 text-xs text-muted-foreground"><p>Diperiksa oleh: {report.checkedByName ?? '-'}</p>{report.returnedAt && <p>Dikembalikan oleh: {report.returnedByName ?? '-'}</p>}<p>Diterbitkan oleh: {report.publishedByName ?? '-'}</p><p>Didistribusikan oleh: {report.distributedByName ?? '-'}</p></div>}
      {report?.statusEvents && report.statusEvents.length > 0 && <section className="space-y-2 border-t pt-3" aria-label="Riwayat status rapor"><h3 className="text-sm font-semibold">Riwayat status</h3>{report.statusEvents.map((event) => <div key={event.id} className="text-xs text-muted-foreground"><p><b>{event.actorName}</b>: {event.fromStatus} ke {event.toStatus}</p><p>{new Date(event.createdAt).toLocaleString('id-ID')}{event.incidentReference ? ` | Insiden ${event.incidentReference}` : ''}{event.reason ? ` | ${event.reason}` : ''}</p></div>)}</section>}
    </DialogContent>
  </Dialog>;
}

function ReturnDialog({ report, pending, error, onClose, run }: { report: ReportItem | null; pending: boolean; error: string; onClose: () => void; run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (report) setReason(''); }, [report]);
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Kembalikan ke wali kelas</DialogTitle><DialogDescription>Jelaskan perbaikan yang diperlukan agar wali kelas dapat menindaklanjuti tanpa menebak.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="return-reason">Alasan pengembalian</Label><Textarea id="return-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button variant="destructive" disabled={pending || reason.trim().length < 3} onClick={() => report && run(() => transitionReport(report.id, 'return', reason.trim()), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Kembalikan</Button></div></DialogContent></Dialog>;
}

function RecoveryDialog({ report, pending, error, onClose, run }: { report: ReportItem | null; pending: boolean; error: string; onClose: () => void; run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void }) {
  const [reason, setReason] = useState('');
  const [incidentReference, setIncidentReference] = useState('');
  useEffect(() => {
    if (report) {
      setReason('');
      setIncidentReference('');
    }
  }, [report]);
  return <Dialog open={!!report} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Pemulihan administratif rapor</DialogTitle><DialogDescription>Jalur ini hanya untuk insiden operasional. Rapor akan dikembalikan ke draft dan seluruh tahapan persetujuan harus dijalankan ulang.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="incident-reference">Referensi insiden</Label><Input id="incident-reference" value={incidentReference} onChange={(event) => setIncidentReference(event.target.value)} placeholder="Contoh: INC-2026-0042" maxLength={100} /></div><div className="space-y-2"><Label htmlFor="recovery-reason">Alasan pemulihan</Label><Textarea id="recovery-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Jelaskan insiden dan alasan dokumen perlu dibuka kembali." maxLength={2000} /></div></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button variant="destructive" disabled={pending || reason.trim().length < 10 || incidentReference.trim().length < 3} onClick={() => report && run(() => recoverReport(report.id, reason.trim(), incidentReference.trim()), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Pulihkan ke draft</Button></div></DialogContent></Dialog>;
}

function ConfirmTransitionDialog({ value, pending, error, onClose, run }: {
  value: { report: ReportItem; action: 'publish' | 'distribute' } | null;
  pending: boolean;
  error: string;
  onClose: () => void;
  run: (action: () => Promise<{ success: boolean; error?: string }>, onSuccess?: () => void) => void;
}) {
  const publishing = value?.action === 'publish';
  return <Dialog open={!!value} onOpenChange={(open: boolean) => !open && !pending && onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{publishing ? 'Terbitkan rapor?' : 'Distribusikan rapor?'}</DialogTitle><DialogDescription>{value ? `${value.report.student.user.fullName} | ${value.report.class.name} | ${value.report.academicYear} Semester ${value.report.semester}` : ''}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">{publishing ? 'Rapor akan dikunci sebagai dokumen terbit dan siap didistribusikan oleh petugas.' : 'Rapor akan langsung dapat dilihat oleh siswa dan orang tua. Pastikan identitas, nilai, kehadiran, dan catatan sudah benar.'}</p>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={onClose}>Batal</Button><Button disabled={pending} onClick={() => value && run(() => transitionReport(value.report.id, value.action), onClose)}>{pending && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{publishing ? 'Ya, terbitkan' : 'Ya, distribusikan'}</Button></div></DialogContent></Dialog>;
}

function GenerateDialog({ open, onOpenChange, classes, defaultAcademicYear, defaultSemester, onResult }: Props & { open: boolean; onOpenChange: (open: boolean) => void; onResult: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const manageableClasses = useMemo(() => classes.filter((item) => item.canManageDraft), [classes]);
  useEffect(() => { if (open) { setError(''); setClassId(manageableClasses[0]?.id ?? ''); } }, [manageableClasses, open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('');
    const result = await generateReports({ classId, academicYear: defaultAcademicYear, semester: defaultSemester }); setLoading(false);
    if (!result.success) { setError(result.error ?? 'Draft rapor gagal disiapkan'); return; }
    const data = result.data as { generated: number; refreshed: number; skipped: number; totalStudents: number };
    onResult(`${data.generated} draft baru, ${data.refreshed} draft diperbarui, dan ${data.skipped} rapor terkunci dilewati dari ${data.totalStudents} siswa.`); onOpenChange(false);
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Siapkan draft rapor kelas</DialogTitle><DialogDescription>Snapshot nilai, KKTP, dan kehadiran dibuat hanya untuk periode aktif. Rapor yang telah diperiksa tidak akan ditimpa.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label>Kelas wali</Label><Select value={classId || undefined} onValueChange={setClassId}><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{manageableClasses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-sm"><div><div className="text-xs font-medium text-muted-foreground">Tahun ajaran aktif</div><div className="font-semibold">{defaultAcademicYear}</div></div><div><div className="text-xs font-medium text-muted-foreground">Semester aktif</div><div className="font-semibold">{defaultSemester === 1 ? 'Ganjil' : 'Genap'}</div></div></div>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={loading || !classId}>{loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Siapkan draft</Button></div></form></DialogContent></Dialog>;
}
