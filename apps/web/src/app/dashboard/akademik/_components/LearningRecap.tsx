'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Filter,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Users,
} from 'lucide-react';
import { fetchLearningContext, fetchLearningRecap } from '../learning-recap-actions';
import {
  startClassSession,
  completeClassSession,
  fetchSchedulingSubjectCatalog,
} from '../../jadwal/actions';
import {
  groupLearningSessions,
  learningCounts,
  learningDate,
  learningStatus,
  learningTime,
  type LearningContext,
  type LearningRead,
  type LearningSession,
} from '@/lib/learning-recap';
import { wibTodayISO } from '@/lib/bell-times';
import {
  surface,
  control,
  button,
  primary,
  muted,
  LearningStatusBadge,
  toTeachingGuide,
  Loading,
  ReadProblem,
  SessionHeader,
  type LearningRecapProps as Props,
} from './learning-recap-ui';
import LearningDetail from './LearningSessionDetail';

export default function LearningRecap(props: Props) {
  const { academicYear, semester, scope, canRead = false, canOperate = false } = props;
  const [from, setFrom] = useState(wibTodayISO),
    [until, setUntil] = useState(wibTodayISO);
  const [teacher, setTeacher] = useState(''),
    [classId, setClassId] = useState(''),
    [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0),
    [filtersOpen, setFiltersOpen] = useState(false),
    [page, setPage] = useState(1);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    read: LearningRead<LearningSession[]>;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [expanded, setExpanded] = useState<Set<string>>(new Set()),
    [detailTab, setDetailTab] = useState('summary');
  const supportingFocus = useRef<{
    sessionId: string;
    action: string;
    refreshToken: number | undefined;
  } | null>(null);
  const [detail, setDetail] = useState<{
    key: string;
    read: LearningRead<{ session: LearningSession; context: LearningContext }>;
  } | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [exportBusy, setExportBusy] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const inFlight = useRef(false),
    keys = useRef(new Map<string, string>()),
    opener = useRef<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement | null>(null),
    uid = useId();
  const key = JSON.stringify({
    academicYear,
    semester,
    scope,
    from,
    until,
    revision,
    refresh: props.refreshToken,
  });
  const detailKey = JSON.stringify({
    selected,
    scope,
    academicYear,
    semester,
    revision,
    refresh: props.refreshToken,
  });
  const read = snapshot?.key === key ? snapshot.read : null;
  const currentDetail = detail?.key === detailKey ? detail.read : null;
  useEffect(() => {
    let active = true;
    if (!canRead) return;
    fetchLearningRecap({ academicYear, semester, scope, from, until })
      .then((value) => {
        if (active) setSnapshot({ key, read: value });
      })
      .catch(() => {
        if (active)
          setSnapshot({
            key,
            read: { state: 'error', message: 'Laporan belum dapat dimuat. Coba muat ulang.' },
          });
      });
    return () => {
      active = false;
    };
  }, [key, canRead, academicYear, semester, scope, from, until]);
  useEffect(() => {
    let active = true;
    if (!canRead) return;
    fetchSchedulingSubjectCatalog()
      .then((value) => {
        if (active && value.success)
          setCodes(Object.fromEntries(value.data.map((x) => [x.name, x.code])));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canRead]);
  useEffect(() => {
    let active = true;
    if (!selected || !canRead) return;
    fetchLearningContext(selected, scope)
      .then((value) => {
        if (active) setDetail({ key: detailKey, read: value });
      })
      .catch(() => {
        if (active)
          setDetail({
            key: detailKey,
            read: { state: 'error', message: 'Rincian belum dapat dimuat. Coba muat ulang.' },
          });
      });
    return () => {
      active = false;
    };
  }, [selected, scope, detailKey, canRead]);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);
  useEffect(() => {
    const pending = supportingFocus.current;
    if (!pending) return;
    if (pending.sessionId !== selected) {
      supportingFocus.current = null;
      return;
    }
    if (pending.refreshToken === props.refreshToken || !currentDetail) return;
    // Closing a supporting dialog refreshes/recreates its trigger. Resolve the new node,
    // not the detached element, and do not steal focus if the user moved on while waiting.
    const frame = requestAnimationFrame(() => {
      supportingFocus.current = null;
      if (document.querySelector('[role="dialog"]')) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== detailHeading.current) return;
      const target = detailHeading.current
        ?.closest('section')
        ?.querySelector<HTMLButtonElement>(`[data-learning-action="${pending.action}"]`);
      if (target && !target.disabled && !target.closest('[hidden]')) target.focus();
      else detailHeading.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [selected, currentDetail, props.refreshToken]);
  const rows = read?.state === 'ready' ? read.data : [];
  const teachers = useMemo(() => groupLearningSessions(rows), [rows]);
  const classes = [...new Map(rows.map((x) => [x.classId, x.classNameSnapshot])).entries()].sort(
    (a, b) => a[1].localeCompare(b[1], 'id'),
  );
  const filtered = rows.filter(
    (x) =>
      (!teacher || x.assignedTeacherId === teacher) &&
      (!classId || x.classId === classId) &&
      (!status || x.status === status),
  );
  if (scope === 'own')
    filtered.sort(
      (a, b) =>
        Number(b.status === 'STARTED') - Number(a.status === 'STARTED') ||
        b.serviceDate.localeCompare(a.serviceDate) ||
        a.scheduledStartAt.localeCompare(b.scheduledStartAt) ||
        a.id.localeCompare(b.id),
    );
  const groups = groupLearningSessions(filtered),
    counts = learningCounts(filtered);
  const pageSize = 10,
    totalPages = Math.max(
      1,
      Math.ceil((scope === 'own' ? filtered.length : groups.length) / pageSize),
    );
  const currentPage = Math.min(page, totalPages);
  const subject = (row: LearningSession) =>
    row.subjectSnapshot + (codes[row.subjectSnapshot] ? ` — ${codes[row.subjectSnapshot]}` : '');
  const refresh = () => {
    setNotice('');
    setRevision((x) => x + 1);
  };
  const openDetail = (row: LearningSession, el: HTMLButtonElement) => {
    opener.current = row.id;
    el.dataset.learningOpen = row.id;
    setSelected(row.id);
    setDetailTab('summary');
    supportingFocus.current = null;
    setNotice('');
  };
  const closeDetail = () => {
    setSelected(null);
    setNotice('');
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(`[data-learning-open="${opener.current}"]`)
        ?.focus(),
    );
  };
  const changeDate = (value: string, end = false) => {
    if (end) setUntil(value);
    else {
      setFrom(value);
      if (value > until) setUntil(value);
    }
    setPage(1);
    setSelected(null);
  };
  const transition = async (row: LearningSession) => {
    if (inFlight.current || scope !== 'own' || !canOperate || !row.canOperate) return;
    inFlight.current = true;
    setBusy(true);
    setNotice('');
    const action = row.status === 'STARTED' ? 'complete' : 'start',
      actionKey = `${row.id}:${action}`;
    const idempotency = keys.current.get(actionKey) ?? crypto.randomUUID();
    keys.current.set(actionKey, idempotency);
    try {
      const result = await (action === 'start' ? startClassSession : completeClassSession)(
        row.id,
        idempotency,
      );
      if (result.success) {
        keys.current.delete(actionKey);
        setRevision((x) => x + 1);
        setNotice(
          action === 'start'
            ? 'Sesi berhasil dimulai.'
            : 'Sesi berhasil diselesaikan. Catatan pendukung dapat diperiksa terpisah.',
        );
      } else {
        setNotice(result.error);
        setRevision((x) => x + 1);
      }
    } catch {
      setNotice(
        'Tindakan belum terkonfirmasi. Muat ulang untuk memeriksa status, lalu coba lagi bila perlu.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const actions = (row: LearningSession) =>
    scope === 'own' &&
    canOperate &&
    row.canOperate &&
    ['SCHEDULED', 'REASSIGNED', 'STARTED'].includes(row.status) ? (
      <button type="button" className={primary} disabled={busy} onClick={() => transition(row)}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : row.status === 'STARTED' ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
        {row.status === 'STARTED' ? 'Selesaikan sesi' : 'Mulai sesi'}
      </button>
    ) : null;
  const exportDocument = async (
    format: 'print' | 'xlsx',
    mono = false,
    target?: LearningSession,
  ) => {
    if ((!target && read?.state !== 'ready') || exportBusy) return;
    setExportBusy(true);
    setNotice('');
    try {
      const doc = await import('@/lib/learning-recap-document');
      const input = {
        academicYear,
        semester,
        from,
        until,
        scopeLabel: scope === 'own' ? 'Pengajaran saya' : 'Sesuai kewenangan pemantauan',
        rows: target ? [target] : filtered,
        codes,
      };
      if (format === 'print') doc.printLearningRecap(input, mono);
      else await doc.downloadLearningRecap(input);
    } catch (e) {
      setNotice(
        e instanceof Error && e.message.includes('pop-up')
          ? e.message
          : 'Dokumen belum dapat dibuat. Muat ulang halaman lalu coba lagi.',
      );
    } finally {
      setExportBusy(false);
    }
  };
  if (!canRead)
    return (
      <div className={`${surface} p-5`}>
        <h2 className="font-semibold">Rekap pembelajaran</h2>
        <p className={muted}>Anda tidak memiliki akses untuk melihat sesi pembelajaran.</p>
      </div>
    );
  if (selected)
    return (
      <section className="space-y-4" aria-labelledby={`${uid}-detail`}>
        <button type="button" className={button} onClick={closeDetail} disabled={busy}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Kembali ke rekap
        </button>
        <div>
          <h2
            ref={detailHeading}
            tabIndex={-1}
            id={`${uid}-detail`}
            className="rounded text-xl font-bold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:text-white"
          >
            {scope === 'own' ? 'Ruang pembelajaran' : 'Rincian pertemuan'}
          </h2>
          <p className={muted}>
            {scope === 'own'
              ? 'Panduan dan catatan pendukung untuk sesi mengajar Anda.'
              : 'Mode pemantauan · informasi guru hanya dapat dibaca.'}
          </p>
        </div>
        {notice && (
          <p
            role="status"
            className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
          >
            {notice}
          </p>
        )}
        {!currentDetail ? (
          <Loading />
        ) : currentDetail.state !== 'ready' ? (
          <ReadProblem read={currentDetail} onRetry={refresh} />
        ) : (
          <>
            <SessionHeader
              row={currentDetail.data.session}
              subject={subject(currentDetail.data.session)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                disabled={exportBusy}
                onClick={() => exportDocument('print', false, currentDetail.data.session)}
              >
                Cetak rincian / PDF
              </button>
              <button
                type="button"
                className={button}
                disabled={exportBusy}
                onClick={() => exportDocument('xlsx', false, currentDetail.data.session)}
              >
                Excel rincian
              </button>
              {scope === 'own' &&
                canOperate &&
                currentDetail.data.session.canOperate &&
                props.onGuide &&
                currentDetail.data.session.serviceDate.slice(0, 10) === wibTodayISO() && (
                  <button
                    type="button"
                    className={button}
                    onClick={() => props.onGuide?.(toTeachingGuide(currentDetail.data.session))}
                  >
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    Buka Panduan Mengajar
                  </button>
                )}
              {actions(currentDetail.data.session)}
            </div>
            <LearningDetail
              key={selected}
              row={currentDetail.data.session}
              context={currentDetail.data.context}
              own={scope === 'own'}
              props={props}
              onRetry={refresh}
              tab={detailTab}
              onTabChange={setDetailTab}
              onBeforeAction={(action) => {
                supportingFocus.current = {
                  sessionId: selected,
                  action,
                  refreshToken: props.refreshToken,
                };
              }}
            />
          </>
        )}
      </section>
    );
  return (
    <section className="space-y-4" aria-labelledby={`${uid}-heading`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${uid}-heading`} className="text-xl font-bold text-slate-900 dark:text-white">
            {scope === 'own' ? 'Pembelajaran Saya' : 'Rekap Pembelajaran'}
          </h2>
          <p className={muted}>
            {scope === 'own'
              ? 'Tinjau sesi Anda dan buka catatan pembelajaran yang diperlukan.'
              : 'Pantau pelaksanaan pembelajaran, dikelompokkan per guru.'}
          </p>
          <p className={`${muted} mt-1`}>
            Tahun ajaran {academicYear} · Semester {semester} ({semester === 1 ? 'Ganjil' : 'Genap'}
            )
          </p>
        </div>
        <button type="button" className={button} onClick={refresh}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Muat ulang
        </button>
      </header>
      <div className={`${surface} p-4`}>
        <button
          type="button"
          className={`${button} w-full justify-between md:hidden`}
          aria-expanded={filtersOpen}
          aria-controls={`${uid}-filters`}
          onClick={() => setFiltersOpen((x) => !x)}
        >
          <span className="inline-flex items-center gap-2">
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filter tanggal dan sesi
          </span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        <div
          id={`${uid}-filters`}
          className={`${filtersOpen ? 'grid' : 'hidden'} mt-3 gap-3 md:mt-0 md:grid md:grid-cols-2 xl:grid-cols-5`}
        >
          <label className="grid gap-1 text-sm font-medium">
            Dari tanggal
            <input
              type="date"
              value={from}
              onChange={(e) => changeDate(e.target.value)}
              className={control}
            />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Sampai tanggal
            <input
              type="date"
              min={from}
              value={until}
              onChange={(e) => changeDate(e.target.value, true)}
              className={control}
            />
          </label>
          {scope !== 'own' && (
            <label className="grid gap-1 text-sm font-medium">
              Guru
              <select
                className={control}
                value={teacher}
                onChange={(e) => {
                  setTeacher(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua guru</option>
                {teachers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-sm font-medium">
            Kelas
            <select
              className={control}
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua kelas</option>
              {classes.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Status sesi
            <select
              className={control}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua status</option>
              {Object.entries(learningStatus).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={`${muted} mt-3`}>
          Rekap tersedia sampai 31 hari per pencarian. Status berasal dari sesi yang tercatat, bukan
          hanya jadwal rencana.
        </p>
      </div>
      {notice && (
        <p role="status" className={`${surface} p-3`}>
          {notice}
        </p>
      )}
      {!read ? (
        <Loading />
      ) : read.state !== 'ready' ? (
        <ReadProblem read={read} onRetry={refresh} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Total sesi', value: counts.total, icon: CalendarDays },
              { label: 'Selesai', value: counts.completed, icon: CheckCircle2 },
              { label: 'Berlangsung', value: counts.started, icon: Play },
              { label: 'Terjadwal', value: counts.planned, icon: Clock3 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className={`${surface} flex items-center gap-3 p-4`}>
                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className={muted}>{label}</p>
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={exportBusy || !filtered.length}
              onClick={() => exportDocument('print')}
            >
              Cetak / Simpan PDF
            </button>
            <button
              type="button"
              className={button}
              disabled={exportBusy || !filtered.length}
              onClick={() => exportDocument('print', true)}
            >
              Cetak hitam-putih
            </button>
            <button
              type="button"
              className={button}
              disabled={exportBusy || !filtered.length}
              onClick={() => exportDocument('xlsx')}
            >
              {exportBusy ? 'Menyiapkan…' : 'Unduh Excel'}
            </button>
            <p className={`${muted} self-center`}>Seluruh hasil filter, bukan hanya halaman ini.</p>
          </div>
          {!filtered.length ? (
            <div className={`${surface} p-6`}>
              <h3 className="font-semibold">Belum ada sesi pada pilihan ini</h3>
              <p className={`${muted} mt-1`}>
                Ubah tanggal atau filter. Jadwal yang belum disiapkan menjadi sesi tetap dapat
                dilihat di menu Jadwal.
              </p>
            </div>
          ) : scope === 'own' ? (
            <div className="space-y-3">
              {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((row) => (
                <div
                  key={row.id}
                  className={`${surface} ${row.status === 'STARTED' ? 'ring-1 ring-emerald-500' : ''} p-4 md:p-5`}
                >
                  <SessionHeader row={row} subject={subject(row)} compact />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={button}
                      data-learning-open={row.id}
                      onClick={(e) => openDetail(row, e.currentTarget)}
                    >
                      Lihat rincian
                    </button>
                    {props.onGuide &&
                      canOperate &&
                      row.canOperate &&
                      row.serviceDate.slice(0, 10) === wibTodayISO() && (
                        <button
                          type="button"
                          className={button}
                          onClick={() => props.onGuide?.(toTeachingGuide(row))}
                        >
                          Buka panduan
                        </button>
                      )}
                    {actions(row)}
                  </div>
                  {row.operationBlockedReason &&
                    ['SCHEDULED', 'REASSIGNED'].includes(row.status) && (
                      <p className={`${muted} mt-3`}>{row.operationBlockedReason}</p>
                    )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((group) => {
                const count = learningCounts(group.sessions),
                  isOpen = expanded.has(group.id);
                return (
                  <article key={group.id} className={`${surface} overflow-hidden`}>
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`${uid}-${group.id}`}
                        className="flex min-h-16 w-full flex-wrap items-center gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600"
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(group.id)) next.delete(group.id);
                            else next.add(group.id);
                            return next;
                          })
                        }
                      >
                        <Users
                          className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 font-bold">{group.name}</span>
                        <span className={muted}>{count.total} sesi</span>
                        <span className="flex flex-wrap gap-2">
                          {count.completed > 0 && (
                            <span className="text-sm text-emerald-800 dark:text-emerald-200">
                              {count.completed} selesai
                            </span>
                          )}
                          {count.started > 0 && (
                            <span className="text-sm text-amber-800 dark:text-amber-200">
                              {count.started} berlangsung
                            </span>
                          )}
                        </span>
                        {isOpen ? (
                          <ChevronDown className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </h3>
                    <div
                      id={`${uid}-${group.id}`}
                      hidden={!isOpen}
                      className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-700 dark:border-slate-700"
                    >
                      {group.sessions.map((row) => (
                        <div
                          key={row.id}
                          className="grid items-center gap-3 p-4 md:grid-cols-[1fr_2fr_1fr_auto]"
                        >
                          <div>
                            <p className="font-semibold tabular-nums">
                              {learningTime(row.scheduledStartAt)} –{' '}
                              {learningTime(row.scheduledEndAt)}
                            </p>
                            <p className={muted}>
                              {learningDate(row.serviceDate)} · JP {row.schedule.jpStart}–
                              {row.schedule.jpEnd}
                            </p>
                          </div>
                          <div className="min-w-0">
                            <p className="break-words font-semibold">{subject(row)}</p>
                            <p className={muted}>{row.classNameSnapshot}</p>
                          </div>
                          <LearningStatusBadge status={row.status} />
                          <button
                            type="button"
                            className={button}
                            data-learning-open={row.id}
                            onClick={(e) => openDetail(row, e.currentTarget)}
                          >
                            Lihat rincian
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={muted}>
              {filtered.length} sesi · {groups.length} guru · Halaman {currentPage} dari{' '}
              {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={button}
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Sebelumnya
              </button>
              <button
                type="button"
                className={button}
                disabled={currentPage === totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
          <p
            className={`${muted} flex gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700`}
          >
            <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
            Sesi selesai tidak otomatis menandakan jurnal, absensi, dan asesmen lengkap. Periksa
            catatan pendukung melalui rincian.
          </p>
        </>
      )}
    </section>
  );
}
