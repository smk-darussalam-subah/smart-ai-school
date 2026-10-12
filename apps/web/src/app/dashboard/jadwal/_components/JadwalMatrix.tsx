'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock3,
  Building2,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import { detectConflicts } from './conflicts';
import JadwalFormDialog from './JadwalForm';
import { fetchScheduleList, fetchSchedulingAssignments, fetchSchedulingSubjectCatalog } from '../actions';
import { TablePagination } from '@/components/ui/table-pagination';
import { fmtMin } from '@/lib/bell-times';
import { useBellPeriod } from '@/components/providers/BellPatternProvider';
import SchedulingImportPanel from './SchedulingImportPanel';
import SchedulingDisclosure from './SchedulingDisclosure';
import SchedulingSplitView from './SchedulingSplitView';
import SchedulingDocumentActions from './SchedulingDocumentActions';
import {
  allocatedJp,
  coverageStatus,
  coverageSummary,
  normalizedRoom,
  practiceRoomLabels,
  readWorkspacePages,
  timetableGroups,
  WEEK_DAYS,
  WorkspaceAssignmentSchema,
  WorkspaceScheduleSchema,
  type ScheduleItem,
  type WorkspaceAssignment,
} from './scheduling-workspace';
export type { ScheduleItem } from './scheduling-workspace';

interface ClassOption {
  id: string;
  name: string;
  grade: number;
}
interface AcademicYearOption {
  id: string;
  code: string;
  isActive: boolean;
}
interface Props {
  schoolName?: string;
  initialSchedules: ScheduleItem[];
  initialTotal: number;
  initialPage: number;
  classes: ClassOption[];
  academicYears: AcademicYearOption[];
  initialAcademicYear: string;
  initialSemester: number;
  isStaff: boolean;
  canManage?: boolean;
  canApproveConcurrency?: boolean;
  canReadAssignments?: boolean;
  importAccess?: { canEdit: boolean };
  bellConfiguration?: React.ReactNode;
  todaySessions?: React.ReactNode;
}
type View = 'assignments' | 'classes' | 'teachers' | 'rooms';
const surface =
  'rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900';
const field =
  'h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 sm:text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const quiet = 'text-xs leading-relaxed text-slate-600 dark:text-slate-300';
const action =
  'min-h-11 min-w-11 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const SUBJECT_COLORS = [
  'border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100',
  'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100',
  'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
  'border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100',
  'border-cyan-200 bg-cyan-50 text-cyan-950 dark:border-cyan-700 dark:bg-cyan-950 dark:text-cyan-100',
];
function subjectColor(subject: string) {
  let hash = 0;
  for (const char of subject) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}
function CoverageBadge({ target, actual }: { target: number; actual: number }) {
  const variants = {
    complete: [
      'Lengkap',
      'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
    ],
    partial: ['Parsial', 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'],
    empty: ['Belum dijadwalkan', 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'],
    excess: ['Melebihi target', 'bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200'],
  }[coverageStatus(target, actual)]!;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${variants[1]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {variants[0]}
    </span>
  );
}

export default function JadwalMatrix({
  schoolName,
  initialSchedules,
  initialTotal,
  classes,
  academicYears,
  initialAcademicYear,
  initialSemester,
  isStaff,
  canManage = false,
  canApproveConcurrency = false,
  canReadAssignments = false,
  importAccess,
  bellConfiguration,
  todaySessions,
}: Props) {
  const [academicYear, setAcademicYear] = useState(initialAcademicYear);
  const [semester, setSemester] = useState(String(initialSemester));
  const periodKey = `${academicYear}:${semester}`;
  const [schedules, setSchedules] = useState(initialSchedules);
  const [loadedPeriod, setLoadedPeriod] = useState(
    initialSchedules.length === initialTotal ? periodKey : '',
  );
  const [assignments, setAssignments] = useState<WorkspaceAssignment[]>([]);
  const [assignmentPeriod, setAssignmentPeriod] = useState('');
  const [loadError, setLoadError] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [subjectCatalog, setSubjectCatalog] = useState<{ name: string; code: string }[]>([]);
  const [subjectCatalogError, setSubjectCatalogError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(canReadAssignments ? 'assignments' : 'classes');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const requestVersion = useRef(0);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const bell = useBellPeriod(academicYear, Number(semester));
  const ready = loadedPeriod === periodKey && !loadError && !loading;
  const assignmentReady = assignmentPeriod === periodKey && !assignmentError && !loading;
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError('');
    setAssignmentError('');
    setSubjectCatalogError('');
    const [scheduleResult, assignmentResult, subjectResult] = await Promise.allSettled([
      readWorkspacePages(
        (page, limit) =>
          fetchScheduleList({ page, limit, academicYear, semester: Number(semester) }),
        WorkspaceScheduleSchema,
      ),
      canReadAssignments
        ? readWorkspacePages(
            (page, limit) => fetchSchedulingAssignments({ page, limit, academicYear }),
            WorkspaceAssignmentSchema,
          )
        : Promise.resolve<WorkspaceAssignment[]>([]),
      isStaff ? fetchSchedulingSubjectCatalog() : Promise.resolve({ success: true as const, data: [] }),
    ]);
    if (version !== requestVersion.current) return;
    if (scheduleResult.status === 'fulfilled') {
      setSchedules(scheduleResult.value);
      setLoadedPeriod(`${academicYear}:${semester}`);
    } else {
      setSchedules([]);
      setLoadedPeriod('');
      setLoadError(
        scheduleResult.reason instanceof Error
          ? scheduleResult.reason.message
          : 'Jadwal belum dapat dimuat.',
      );
    }
    if (assignmentResult.status === 'fulfilled') {
      setAssignments(assignmentResult.value);
      setAssignmentPeriod(`${academicYear}:${semester}`);
    } else {
      setAssignments([]);
      setAssignmentPeriod('');
      setAssignmentError(
        assignmentResult.reason instanceof Error
          ? assignmentResult.reason.message
          : 'Penugasan belum dapat dimuat.',
      );
    }
    if (subjectResult.status === 'fulfilled' && subjectResult.value.success) {
      setSubjectCatalog(subjectResult.value.data);
    } else {
      setSubjectCatalog([]);
      setSubjectCatalogError('Katalog Mata Pelajaran belum dapat dimuat. Dokumen memakai nama lengkap tanpa kode. Coba muat ulang.');
    }
    setLoading(false);
  }, [academicYear, semester, canReadAssignments, isStaff]);
  useEffect(() => {
    void reload();
    return () => {
      requestVersion.current++;
    };
  }, [reload]);
  const items = useMemo(() => (ready ? schedules : []), [ready, schedules]);
  const currentAssignments = useMemo(
    () => (assignmentReady ? assignments : []),
    [assignmentReady, assignments],
  );
  const conflicts = useMemo(() => detectConflicts(items), [items]);
  const coverage = coverageSummary(currentAssignments, items);
  const allClasses = useMemo(
    () =>
      [
        ...new Map(
          [
            ...(academicYear === initialAcademicYear ? classes : []),
            ...items.map((s) => s.class),
            ...currentAssignments.map((a) => a.class),
          ].map((k) => [k.id, k]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name, 'id-ID')),
    [academicYear, initialAcademicYear, classes, items, currentAssignments],
  );
  const teachers = [
    ...new Map(
      [
        ...items.map((s) => s.teachingAssignment.teacher),
        ...currentAssignments.map((a) => a.teacher),
      ].map((t) => [t.id, t]),
    ).values(),
  ].sort((a, b) => a.user.fullName.localeCompare(b.user.fullName, 'id-ID'));
  const rooms = practiceRoomLabels(items);
  const needle = search.trim().toLocaleLowerCase('id-ID');
  const matches = (text: string) => !needle || text.toLocaleLowerCase('id-ID').includes(needle);
  const rows =
    view === 'assignments'
      ? currentAssignments
          .filter((a) => matches(`${a.subject} ${a.class.name} ${a.teacher.user.fullName}`))
          .map((a) => ({
            id: a.id,
            title: a.teacher.user.fullName,
            subtitle: a.subject,
            className: a.class.name,
            target: a.hoursPerWeek,
            actual: allocatedJp(items, a.id),
          }))
      : view === 'classes'
        ? allClasses
            .filter((k) => matches(k.name))
            .map((k) => ({
              id: k.id,
              title: k.name,
              subtitle: 'Jadwal mingguan kelas',
              className: '',
              target: currentAssignments
                .filter((a) => a.class.id === k.id)
                .reduce((n, a) => n + a.hoursPerWeek, 0),
              actual: items
                .filter((s) => s.classId === k.id)
                .reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0),
            }))
        : view === 'teachers'
          ? teachers
              .filter((t) => matches(t.user.fullName))
              .map((t) => ({
                id: t.id,
                title: t.user.fullName,
                subtitle: 'Guru pengampu',
                className: '',
                target: currentAssignments
                  .filter((a) => a.teacher.id === t.id)
                  .reduce((n, a) => n + a.hoursPerWeek, 0),
                actual: items
                  .filter((s) => s.teachingAssignment.teacher.id === t.id)
                  .reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0),
              }))
          : rooms.filter(matches).map((room) => ({
              id: room,
              title: room,
              subtitle: 'Label RPS/LAB pada jadwal',
              className: '',
              target: 0,
              actual: items
                .filter((s) => normalizedRoom(s.room) === room)
                .reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0),
            }));
  const selectedRow = rows.find((row) => row.id === selected) ?? rows[0];
  const preview = selectedRow
    ? items.filter((s) =>
        view === 'assignments'
          ? s.teachingAssignment.id === selectedRow.id
          : view === 'classes'
            ? s.classId === selectedRow.id
            : view === 'teachers'
              ? s.teachingAssignment.teacher.id === selectedRow.id
              : normalizedRoom(s.room) === selectedRow.id,
      )
    : [];
  const shownRows = rows.slice((page - 1) * 10, page * 10);
  const distribution = WEEK_DAYS.map((day, i) => ({
    day,
    jp: items.filter((s) => s.dayOfWeek === i + 1).reduce((n, s) => n + s.jpEnd - s.jpStart + 1, 0),
  })).filter((d, i) => i < 6 || d.jp > 0);
  const maximum = Math.max(1, ...distribution.map((d) => d.jp));
  const statsAvailable = ready && (!canReadAssignments || assignmentReady);
  const documentInput = { view, schoolName, academicYear, semester: Number(semester), schedules: items, assignments: currentAssignments, classes: allClasses, subjects: subjectCatalog, bell };
  const metricValues = [
    new Set(
      canReadAssignments
        ? currentAssignments.map((a) => a.subject)
        : items.map((s) => s.teachingAssignment.subject),
    ).size,
    canReadAssignments
      ? currentAssignments.length
      : new Set(items.map((s) => s.teachingAssignment.id)).size,
    teachers.length,
    allClasses.length,
    rooms.length,
    items.length,
  ];
  const metricDefinitions = [
    {
      label: 'Mata pelajaran',
      note: 'pada periode pilihan',
      icon: BookOpen,
      color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
    },
    {
      label: 'Penugasan',
      note: canReadAssignments ? 'penugasan mengajar' : 'dengan jadwal terbaca',
      icon: Layers3,
      color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    },
    {
      label: 'Guru',
      note: 'dalam cakupan akses',
      icon: Users,
      color: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200',
    },
    {
      label: 'Kelas',
      note: 'dalam cakupan akses',
      icon: CalendarDays,
      color: 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    },
    {
      label: 'RPS/LAB terjadwal',
      note: 'berdasarkan label lokasi',
      icon: Building2,
      color: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
    },
    {
      label: 'Slot tersimpan',
      note: 'bukan draft impor',
      icon: Clock3,
      color: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    },
  ];
  const tabs: { id: View; label: string; icon: typeof BookOpen }[] = [
    ...(canReadAssignments
      ? [{ id: 'assignments' as const, label: 'Penugasan Mengajar', icon: BookOpen }]
      : []),
    { id: 'classes', label: 'Jadwal Per Kelas', icon: CalendarDays },
    { id: 'teachers', label: 'Jadwal Per Guru', icon: Users },
    ...(isStaff ? [{ id: 'rooms' as const, label: 'Jadwal RPS/LAB', icon: Building2 }] : []),
  ];
  function changePeriod(year: string, term: string) {
    requestVersion.current++;
    setAcademicYear(year);
    setSemester(term);
    setSelected('');
    setPage(1);
    setSearch('');
    setShowImport(false);
  }
  function chooseView(next: View) {
    setDetailsOpen(false);
    setView(next);
    setSelected('');
    setPage(1);
    setSearch('');
  }
  function openEdit(item: ScheduleItem) {
    if (!canManage || !ready) return;
    setEditing(item);
    setFormOpen(true);
  }
  function revealImport() {
    setShowImport(true);
  }

  return (
    <div className="min-w-0 space-y-3 text-sm text-slate-900 selection:bg-blue-100 dark:text-slate-100 dark:selection:bg-blue-900 [&_button]:min-h-11 [&_button]:min-w-11">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <CalendarDays className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Penjadwalan Mapel</h1>
            <p className={`mt-1 ${quiet}`}>
              Susun dan tinjau jadwal mengajar, kelas, serta ruang praktik siswa.
            </p>
          </div>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-72">
          <label className={quiet}>
            Tahun ajaran
            <select
              aria-label="Tahun ajaran"
              className={`${field} mt-1`}
              value={academicYear}
              onChange={(e) => changePeriod(e.target.value, semester)}
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.code}>
                  {year.code}
                  {year.isActive ? ' (aktif)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className={quiet}>
            Semester
            <select
              aria-label="Semester"
              className={`${field} mt-1`}
              value={semester}
              onChange={(e) => changePeriod(academicYear, e.target.value)}
            >
              <option value="1">Ganjil (1)</option>
              <option value="2">Genap (2)</option>
            </select>
          </label>
        </div>
      </header>
      <section
        aria-label="Aksi penjadwalan"
        className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 xl:flex-row xl:items-center xl:justify-between dark:border-blue-800 dark:bg-blue-950/40"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-blue-600 p-3 text-white">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold">DIIS Smart Scheduling</h2>
            <p className={`mt-1 ${quiet}`}>
              Mulai dari penugasan yang sah. Impor menghasilkan draft untuk ditinjau.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <button
              type="button"
              disabled
              aria-label="Generate Otomatis"
              title="Solver belum tersedia; wave lanjutan"
              className="flex min-h-11 w-full flex-col items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-2 leading-4">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Generate Otomatis
              </span>
              <span className="text-[11px] font-normal leading-4">Solver: wave lanjutan</span>
            </button>
          </div>
          {importAccess && (
            <button
              type="button"
              onClick={revealImport}
              ref={importTriggerRef}
              aria-haspopup="dialog"
              className={`${action} flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800`}
            >
              <Upload className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              Impor Jadwal
            </button>
          )}
          {canManage && (
            <button
              type="button"
              disabled={!bell.available || !ready}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className={`${action} flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:hover:bg-slate-800`}
            >
              <Plus className="h-4 w-4 text-blue-600 dark:text-blue-300" aria-hidden="true" />
              Tambah Slot
            </button>
          )}
        </div>
      </section>
      {bellConfiguration && (
        <SchedulingDisclosure summary="Atur jumlah dan durasi JP setiap hari; konfigurasi tidak harus selalu terbuka.">
          {bellConfiguration}
        </SchedulingDisclosure>
      )}
      {importAccess && (
          <SchedulingImportPanel
            key={periodKey}
            academicYearId={academicYears.find((y) => y.code === academicYear)?.id ?? ''}
            academicYearLabel={academicYear}
            semesterNumber={Number(semester)}
            classes={allClasses}
            canEdit={importAccess.canEdit}
            open={showImport}
            onOpenChange={setShowImport}
            onCloseAutoFocus={(event) => { event.preventDefault(); importTriggerRef.current?.focus(); }}
          />
      )}
      {(loadError || assignmentError) && (
        <div
          className="flex flex-col items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800 sm:flex-row sm:items-center sm:justify-between dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200"
          role="alert"
        >
          <p>
            <AlertCircle className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {loadError || `Penugasan: ${assignmentError}`} Data gagal tidak dihitung sebagai nol.
          </p>
          <button
            className={`${action} shrink-0 border border-current`}
            onClick={() => void reload()}
            type="button"
          >
            Muat ulang
          </button>
        </div>
      )}
      <section
        aria-label="Ringkasan periode"
        aria-busy={loading}
        className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"
      >
        {metricDefinitions.map((metric, index) => (
          <div key={metric.label} className={`${surface} flex min-w-0 items-start gap-2 p-2.5`}>
            <span className={`rounded-lg p-2 ${metric.color}`}>
              <metric.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium leading-snug text-slate-600 dark:text-slate-300">
                {metric.label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {statsAvailable ? metricValues[index] : '—'}
              </p>
              <p className="mt-0.5 text-xs leading-4 text-slate-600 dark:text-slate-300">
                {metric.note}
              </p>
            </div>
          </div>
        ))}
      </section>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <section className={`${surface} p-3`} aria-label="Progres penjadwalan">
          <h2 className="font-semibold">Progres Penjadwalan</h2>
          <p className={`mt-1 ${quiet}`}>
            {canReadAssignments
              ? 'Cakupan JP dari seluruh penugasan periode pilihan.'
              : 'Target JP penugasan tidak tersedia pada cakupan akses ini.'}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div
              className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
              role={
                statsAvailable && canReadAssignments && coverage.percentage !== null
                  ? 'progressbar'
                  : undefined
              }
              aria-label="Cakupan target JP"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                statsAvailable && canReadAssignments
                  ? (coverage.percentage ?? undefined)
                  : undefined
              }
            >
              <div
                className="h-full rounded-full bg-blue-600"
                style={{
                  width: `${statsAvailable && canReadAssignments ? (coverage.percentage ?? 0) : 0}%`,
                }}
              />
            </div>
            <span className="font-bold tabular-nums">
              {statsAvailable && canReadAssignments && coverage.percentage !== null
                ? `${coverage.percentage}%`
                : '—'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <span className="text-emerald-800 dark:text-emerald-200">
              Lengkap: {statsAvailable && canReadAssignments ? coverage.complete : '—'}
            </span>
            <span className="text-amber-800 dark:text-amber-200">
              Parsial: {statsAvailable && canReadAssignments ? coverage.partial : '—'}
            </span>
            <span className="text-rose-800 dark:text-rose-200">
              Belum: {statsAvailable && canReadAssignments ? coverage.empty : '—'}
            </span>
            <span className="text-rose-800 dark:text-rose-200">
              Melebihi target: {statsAvailable && canReadAssignments ? coverage.excess : '—'}
            </span>
          </div>
        </section>
        <section className={`${surface} p-3`} aria-label="Distribusi JP per hari">
          <h2 className="font-semibold">Distribusi JP per Hari</h2>
          <p className={`mt-1 ${quiet}`}>Akumulasi JP kelas, bukan durasi kerja guru.</p>
          <div className="mt-2 flex h-12 items-end gap-2">
            {distribution.map((d) => (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className="shrink-0 text-xs font-medium leading-4 tabular-nums">
                  {ready ? d.jp : '—'}
                </span>
                <div
                  className="w-full max-w-8 shrink-0 rounded-t bg-blue-500 dark:bg-blue-400"
                  style={{ height: ready ? `${(d.jp / maximum) * 16}px` : '0px' }}
                  aria-hidden="true"
                />
                <span className="shrink-0 text-xs leading-4 text-slate-600 dark:text-slate-300">
                  {d.day.slice(0, 3)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className={surface} aria-label="Workspace jadwal">
        <div
          className="grid grid-cols-2 border-b border-slate-200 sm:flex dark:border-slate-700"
          role="tablist"
          aria-label="Tampilan penjadwalan"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              id={`schedule-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              aria-controls="schedule-workspace-panel"
              tabIndex={view === tab.id ? 0 : -1}
              onKeyDown={(e) => {
                const index = tabs.findIndex((t) => t.id === tab.id);
                const next =
                  e.key === 'ArrowRight'
                    ? tabs[(index + 1) % tabs.length]
                    : e.key === 'ArrowLeft'
                      ? tabs[(index + tabs.length - 1) % tabs.length]
                      : e.key === 'Home'
                        ? tabs[0]
                        : e.key === 'End'
                          ? tabs[tabs.length - 1]
                          : undefined;
                if (next) {
                  e.preventDefault();
                  chooseView(next.id);
                  document.getElementById(`schedule-tab-${next.id}`)?.focus();
                }
              }}
              onClick={() => chooseView(tab.id)}
              className={`flex min-h-12 flex-1 items-center justify-center gap-2 border-b-2 px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 sm:text-sm ${view === tab.id ? 'border-blue-600 bg-blue-50/50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' : 'border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
        <SchedulingSplitView
          id="schedule-workspace-panel"
          labelledBy={`schedule-tab-${view}`}
          busy={loading}
        >
          <div className="min-w-0 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">
                  {view === 'assignments'
                    ? 'Daftar Penugasan Mengajar'
                    : view === 'classes'
                      ? 'Daftar Jadwal per Kelas'
                      : view === 'teachers'
                        ? 'Daftar Jadwal per Guru'
                        : 'Daftar RPS/LAB'}
                </h2>
                <p className={`mt-1 ${quiet}`}>
                  {view === 'rooms'
                    ? 'RPS berarti Ruang Praktik Siswa. Daftar berasal dari label lokasi jadwal.'
                    : 'Pilih satu baris untuk melihat rincian dan jadwal mingguannya.'}
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <div className="min-w-0">
                  <SchedulingDocumentActions input={documentInput} disabled={!statsAvailable} />
                  {subjectCatalogError && <p role="status" className={`${quiet} mt-1 max-w-sm`}>{subjectCatalogError}</p>}
                </div>
              <button
                type="button"
                className={`${action} flex shrink-0 items-center gap-2 border border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800`}
                disabled={loading}
                onClick={() => void reload()}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Muat ulang</span>
              </button>
              </div>
            </div>
            <label className="relative mb-2 block">
              <span className="sr-only">
                Cari{' '}
                {view === 'assignments'
                  ? 'guru, kelas, atau mapel'
                  : view === 'classes'
                    ? 'kelas'
                    : view === 'teachers'
                      ? 'guru'
                      : 'RPS/LAB'}
              </span>
              <Search
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500 dark:text-slate-300"
                aria-hidden="true"
              />
              <input
                className={`${field} pl-9`}
                value={search}
                placeholder={
                  view === 'assignments'
                    ? 'Cari guru, kelas, atau mapel…'
                    : view === 'classes'
                      ? 'Cari kelas…'
                      : view === 'teachers'
                        ? 'Cari guru…'
                        : 'Cari RPS/LAB…'
                }
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                  setSelected('');
                }}
              />
            </label>
            {loading || !ready || (view === 'assignments' && !assignmentReady) ? (
              <p
                className="rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                role="status"
              >
                {loading
                  ? 'Memuat jadwal dan penugasan…'
                  : 'Data belum tersedia. Muat ulang sebelum meninjau.'}
              </p>
            ) : rows.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-6 text-center dark:bg-slate-800">
                <CalendarDays className="mx-auto mb-2 h-6 w-6 text-slate-500" aria-hidden="true" />
                <p className="font-medium">
                  {view === 'rooms'
                    ? 'Belum ada label RPS/LAB terjadwal'
                    : search
                      ? 'Tidak ada hasil yang sesuai'
                      : 'Belum ada data pada periode ini'}
                </p>
                <p className={`mt-1 ${quiet}`}>
                  {view === 'rooms'
                    ? 'Isi lokasi RPS, LAB, bengkel atau workshop pada slot yang sesuai.'
                    : 'Periksa periode atau tambahkan slot dari penugasan yang sah.'}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <tr>
                        <th className="px-3 py-3 font-medium" scope="col">
                          {view === 'assignments'
                            ? 'Guru / Mata pelajaran'
                            : view === 'classes'
                              ? 'Kelas'
                              : view === 'teachers'
                                ? 'Guru'
                                : 'RPS/LAB'}
                        </th>
                        {view === 'assignments' && (
                          <th className="px-3 py-3 font-medium" scope="col">
                            Kelas
                          </th>
                        )}
                        <th className="px-3 py-3 font-medium" scope="col">
                          {view === 'rooms' ? 'JP kelas' : 'JP / Target'}
                        </th>
                        <th className="px-3 py-3 font-medium" scope="col">
                          {view === 'rooms' ? 'Jadwal' : 'Cakupan'}
                        </th>
                        <th className="px-2 py-3 font-medium" scope="col">
                          <span className="sr-only">Aksi</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {shownRows.map((row) => (
                        <tr
                          key={row.id}
                          className={
                            selectedRow?.id === row.id ? 'bg-blue-50/60 dark:bg-blue-950/50' : ''
                          }
                        >
                          <td className="max-w-64 px-3 py-2">
                            <p className="font-semibold leading-relaxed">{row.title}</p>
                            <p className={`mt-0.5 ${quiet}`}>{row.subtitle}</p>
                          </td>
                          {view === 'assignments' && <td className="px-3 py-2">{row.className}</td>}
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                            {row.actual}
                            {view !== 'rooms' && assignmentReady && canReadAssignments
                              ? ` / ${row.target}`
                              : ''}{' '}
                            JP
                          </td>
                          <td className="px-3 py-2">
                            {view === 'rooms' ? (
                              <span className="text-slate-600 dark:text-slate-300">Tersimpan</span>
                            ) : assignmentReady && canReadAssignments ? (
                              <CoverageBadge target={row.target} actual={row.actual} />
                            ) : (
                              <span className={quiet}>Target belum tersedia</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              aria-label={`Lihat jadwal ${row.title}${view === 'assignments' ? `, ${row.subtitle}, ${row.className}` : ''}`}
                              aria-pressed={selectedRow?.id === row.id}
                              onClick={() => setSelected(row.id)}
                              className={`${action} border border-slate-300 text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-300 dark:hover:bg-slate-800`}
                            >
                              <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-2 sm:hidden">
                  {shownRows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      aria-pressed={selectedRow?.id === row.id}
                      onClick={() => setSelected(row.id)}
                      className={`${action} w-full border p-3 text-left ${selectedRow?.id === row.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block font-semibold">{row.title}</span>
                          <span className={`mt-1 block ${quiet}`}>
                            {row.subtitle}
                            {row.className ? ` · ${row.className}` : ''}
                          </span>
                        </span>
                        <ArrowRight
                          className="mt-1 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs tabular-nums">
                          {row.actual}
                          {view !== 'rooms' && assignmentReady && canReadAssignments
                            ? ` / ${row.target}`
                            : ''}{' '}
                          JP
                        </span>
                        {view !== 'rooms' && assignmentReady && canReadAssignments && (
                          <CoverageBadge target={row.target} actual={row.actual} />
                        )}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 dark:[&_button]:border-slate-600 dark:[&_button]:bg-slate-800 dark:[&_button]:text-slate-100 dark:[&_button:hover]:bg-slate-700 dark:[&_b]:text-slate-100">
                  <TablePagination page={page} limit={10} total={rows.length} onPage={setPage} />
                </div>
              </>
            )}
            {view === 'rooms' && (
              <p className={`mt-3 ${quiet}`}>
                Belum merupakan inventaris fasilitas atau bukti kapasitas. Pemakaian bersama bengkel
                dan rotasi perlu aturan fasilitas pada wave lanjutan.
              </p>
            )}
          </div>
          <aside
            className="min-w-0 border-t border-slate-200 bg-slate-50/60 p-4 xl:border-l xl:border-t-0 dark:border-slate-700 dark:bg-slate-950/30"
            aria-label="Pratinjau jadwal terpilih"
          >
            <div className="mb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold">
                {view === 'rooms'
                  ? 'Jadwal RPS/LAB'
                  : view === 'teachers'
                    ? 'Jadwal Guru'
                    : view === 'assignments'
                      ? 'Jadwal Penugasan'
                      : 'Jadwal Kelas'}
              </h2>
                <SchedulingDocumentActions input={{ ...documentInput, selectedId: selectedRow?.id }} selected disabled={!statsAvailable || !selectedRow} />
              </div>
              <p className="mt-2 font-semibold text-blue-800 dark:text-blue-200">
                {ready ? (selectedRow?.title ?? 'Pilih data jadwal') : 'Pratinjau belum tersedia'}
              </p>
              {selectedRow && ready && (
                <p className={`mt-1 ${quiet}`}>
                  {view === 'assignments'
                    ? `${selectedRow.subtitle} · ${selectedRow.className}`
                    : `${selectedRow.actual} JP kelas terjadwal pada minggu reguler`}
                </p>
              )}
            </div>
            <p className={`mb-3 ${quiet}`} role="status">
              {bell.problem ||
                (bell.varies
                  ? 'Waktu JP bervariasi pada periode ini; periksa tanggal pelaksanaan.'
                  : 'Waktu mengikuti pola JP setiap hari pada periode pilihan.')}
            </p>
            {ready && (
              <WeeklyTimetable
                items={preview}
                bell={bell}
                conflicts={conflicts}
                onEdit={canManage ? openEdit : undefined}
                onInspect={() => {
                  setDetailsOpen(true);
                  requestAnimationFrame(() =>
                    detailsRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }),
                  );
                }}
              />
            )}
            {ready && preview.length > 0 && (
              <details
                ref={detailsRef}
                open={detailsOpen}
                onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
                className="group mt-3 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                  Rincian {preview.length} slot · semua sesi
                  <ChevronDown className="h-4 w-4 group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div
                  className="max-h-96 space-y-2 overflow-y-auto border-t border-slate-200 p-2 dark:border-slate-700"
                  tabIndex={0}
                  role="region"
                  aria-label="Semua rincian slot terpilih"
                >
                  {[...preview]
                    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.jpStart - b.jpStart)
                    .map((item) => (
                      <ScheduleEntry
                        key={item.id}
                        item={item}
                        conflicts={conflicts.get(item.id)}
                        timeLabel={scheduleTimeLabel(item, bell)}
                        onEdit={canManage ? openEdit : undefined}
                      />
                    ))}
                </div>
              </details>
            )}
          </aside>
        </SchedulingSplitView>
      </section>
      {ready && conflicts.size > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {conflicts.size} slot memiliki bentrok pada data terbaca. Pengecualian resmi tetap
          dibedakan; keputusan validasi final berada di server.
        </p>
      )}
      {todaySessions && (
        <details className={`${surface} group`}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 p-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Sesi Kelas Hari Ini
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-slate-200 p-3 dark:border-slate-700">{todaySessions}</div>
        </details>
      )}
      {canManage && (
        <JadwalFormDialog
          canApproveConcurrency={canApproveConcurrency}
          open={formOpen}
          onOpenChange={setFormOpen}
          schedule={editing}
          academicYear={academicYear}
          initialSemester={Number(semester)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}

function ScheduleEntry({
  item,
  conflicts,
  timeLabel,
  onEdit,
}: {
  item: ScheduleItem;
  conflicts?: string[];
  timeLabel?: string;
  onEdit?: (item: ScheduleItem) => void;
}) {
  const content = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="font-medium">{item.teachingAssignment.subject}</span>
        {onEdit && <Pencil className="h-4 w-4 shrink-0" aria-hidden="true" />}
      </span>
      <span className="mt-1 block text-xs">
        {WEEK_DAYS[item.dayOfWeek - 1]} · JP {item.jpStart}–{item.jpEnd} · {item.class.name}
      </span>
      {timeLabel && <span className="mt-1 block text-xs tabular-nums">{timeLabel}</span>}
      <span className="mt-1 block text-xs">
        {item.teachingAssignment.teacher.user.fullName}
        {item.room ? ` · ${item.room}` : ''}
      </span>
      {item.concurrencyGroup && (
        <span className="mt-1 block text-xs font-medium">
          {item.concurrencyGroup.mode === 'JOINT_CLASS'
            ? 'Kelas gabungan resmi'
            : 'Pengecualian sementara'}
          {item.concurrencyGroup.expiresOn
            ? ` · s.d. ${item.concurrencyGroup.expiresOn.slice(0, 10)}`
            : ''}
        </span>
      )}
      {conflicts && (
        <span className="mt-1 block text-xs font-semibold">Bentrok: {conflicts.join('; ')}</span>
      )}
    </>
  );
  const style = `block min-h-11 w-full rounded-lg border p-3 text-left text-xs ${conflicts ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100' : subjectColor(item.teachingAssignment.subject)}`;
  return onEdit ? (
    <button
      type="button"
      onClick={() => onEdit(item)}
      aria-label={`Edit jadwal ${item.teachingAssignment.subject}, ${WEEK_DAYS[item.dayOfWeek - 1]}, JP ${item.jpStart}–${item.jpEnd}, kelas ${item.class.name}`}
      className={`${style} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
    >
      {content}
    </button>
  ) : (
    <div className={style}>{content}</div>
  );
}

function scheduleTimeLabel(item: ScheduleItem, bell: ReturnType<typeof useBellPeriod>): string {
  const slots = bell.slotsForDay(item.dayOfWeek);
  const first = slots.find((slot) => slot.jp === item.jpStart);
  const last = slots.find((slot) => slot.jp === item.jpEnd);
  if (!first || !last) return 'Waktu JP belum tersedia';
  if (slots.some((slot) => slot.jp >= item.jpStart && slot.jp <= item.jpEnd && slot.timingVaries))
    return 'Waktu bervariasi; periksa tanggal pelaksanaan';
  return `${fmtMin(first.startMin)}–${fmtMin(last.endMin)} WIB · jeda mengikuti pola JP`;
}

function WeeklyTimetable({
  items,
  bell,
  conflicts,
  onEdit,
  onInspect,
}: {
  items: ScheduleItem[];
  bell: ReturnType<typeof useBellPeriod>;
  conflicts: Map<string, string[]>;
  onEdit?: (item: ScheduleItem) => void;
  onInspect: () => void;
}) {
  const jpMax = Math.max(
    0,
    ...bell.weeklySlots.map((jp) => jp),
    ...items.map((item) => item.jpEnd),
  );
  const days = WEEK_DAYS.map((name, index) => ({ name, index })).filter(
    (day) => day.index < 6 || items.some((s) => s.dayOfWeek === 7),
  );
  if (!items.length)
    return (
      <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300">
        Belum ada slot pada pilihan ini.
      </p>
    );
  return (
    <>
      <div
        className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        tabIndex={0}
        role="region"
        aria-label="Tabel jadwal mingguan, geser horizontal untuk melihat semua hari"
      >
        <div
          className="grid min-w-[420px]"
          style={{ gridTemplateColumns: `36px repeat(${days.length},minmax(0,1fr))` }}
        >
          <div className="border-r border-slate-200 dark:border-slate-700">
            <p className="h-9 px-2 py-2 text-xs font-semibold">JP</p>
            {Array.from({ length: jpMax }, (_, i) => (
              <div
                key={i}
                className="flex h-12 items-center justify-center border-t border-slate-100 text-xs font-medium tabular-nums dark:border-slate-700"
              >
                {i + 1}
              </div>
            ))}
          </div>
          {days.map(({ name, index }) => {
            const groups = timetableGroups(items.filter((s) => s.dayOfWeek === index + 1));
            return (
              <div
                key={name}
                className="min-w-0 border-r border-slate-200 last:border-r-0 dark:border-slate-700"
              >
                <p className="h-9 px-1 py-2 text-center text-xs font-semibold">{name}</p>
                <div
                  className="relative grid"
                  style={{
                    gridTemplateColumns: 'minmax(0,1fr)',
                    gridTemplateRows: `repeat(${jpMax},3rem)`,
                  }}
                >
                  {Array.from({ length: jpMax }, (_, i) => {
                    const slot = bell.slotsForDay(index + 1).find((t) => t.jp === i + 1);
                    return (
                      <div
                        key={i}
                        className="col-span-full border-t border-slate-100 px-1 py-1 text-center text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
                        style={{ gridColumn: '1 / -1', gridRow: i + 1 }}
                      >
                        {slot
                          ? slot.timingVaries
                            ? 'Bervariasi'
                            : `${fmtMin(slot.startMin)}–${fmtMin(slot.endMin)}`
                          : 'Tidak tersedia'}
                      </div>
                    );
                  })}
                  {groups.map((group) => {
                    const item = group[0];
                    if (!item) return null;
                    const start = Math.min(...group.map((slot) => slot.jpStart));
                    const end = Math.max(...group.map((slot) => slot.jpEnd));
                    const overlapping = group.length > 1;
                    const conflicted = group.some((slot) => conflicts.has(slot.id));
                    const subjectShort = item.teachingAssignment.subject
                      .split(/\s+/)
                      .filter(Boolean)
                      .slice(0, 4)
                      .map((word) => word[0])
                      .join('')
                      .toLocaleUpperCase('id-ID');
                    const content = (
                      <>
                        <span className="block truncate font-semibold">
                          {overlapping ? `${group.length} slot` : item.class.name}
                        </span>
                        <span className="mt-0.5 block truncate leading-snug" aria-hidden="true">
                          {overlapping ? 'Lihat rincian' : subjectShort}
                        </span>
                        {end > start && (
                          <span className="mt-1 block">
                            JP {start}–{end}
                          </span>
                        )}
                        {end > start && conflicted && (
                          <span className="mt-1 block font-bold">Bentrok</span>
                        )}
                        {end > start && !overlapping && item.concurrencyGroup && (
                          <span className="mt-1 block truncate">
                            {item.concurrencyGroup.mode === 'JOINT_CLASS'
                              ? 'Gabungan resmi'
                              : 'Pengecualian'}
                          </span>
                        )}
                      </>
                    );
                    const style = `m-0.5 min-h-11 overflow-hidden rounded-md border px-1 py-0.5 text-left text-[11px] ${conflicted ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100' : subjectColor(item.teachingAssignment.subject)}`;
                    const title = group
                      .map(
                        (slot) =>
                          `${slot.class.name} · ${slot.teachingAssignment.subject} · ${slot.teachingAssignment.teacher.user.fullName} · ${slot.room ?? ''} · ${scheduleTimeLabel(slot, bell)}${slot.concurrencyGroup ? ` · ${slot.concurrencyGroup.mode === 'JOINT_CLASS' ? 'Kelas gabungan resmi' : 'Pengecualian sementara'}` : ''}`,
                      )
                      .join('\n');
                    return overlapping || onEdit ? (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => (overlapping ? onInspect() : onEdit?.(item))}
                        title={title}
                        aria-label={
                          overlapping
                            ? `Lihat seluruh ${group.length} slot bertumpuk, ${name}, JP ${start}–${end}`
                            : `Edit jadwal ${item.teachingAssignment.subject}, ${name}, JP ${start}–${end}, kelas ${item.class.name}`
                        }
                        className={`${style} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600`}
                        style={{
                          gridColumn: 1,
                          gridRow: `${start} / span ${end - start + 1}`,
                        }}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        key={item.id}
                        className={style}
                        title={title}
                        style={{
                          gridColumn: 1,
                          gridRow: `${start} / span ${end - start + 1}`,
                        }}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className={`mt-2 ${quiet}`}>
        Klik jumlah slot untuk membuka semua sesi bertumpuk. Di layar kecil, geser tabel untuk semua
        hari. Waktu jeda mengikuti pola JP.
      </p>
    </>
  );
}
