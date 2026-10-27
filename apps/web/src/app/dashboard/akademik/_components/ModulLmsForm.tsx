'use client';

// ModulLmsForm — buat/edit Modul LMS dengan 3-tab editor (P21 — L4 scope).
// Materi persists through LMS actions; Asesmen manages the saved module's question bank.
// Badge is a catalogue, not a module reward configuration.
// Mockup ref: akademik-guru-utuh.html lines 1120-1170 (s-lms-editor).
// Parent me-remount via key={editing?.id ?? 'new'}.

import { useState, useTransition, useEffect, useRef, useId } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, Save, Send, AlertTriangle, BookOpen, ClipboardList, Award } from 'lucide-react';
import clsx from 'clsx';
import type { LmsModuleItem } from './guru-types';
import { createLmsModule, updateLmsModule, fetchBadgeCatalog } from '../actions';
import QuestionBankEditor from './QuestionBankEditor';
import MaterialEditor from '@/components/learning/MaterialEditor';
import MaterialContent from '@/components/learning/MaterialContent';
import { materialHasText, sanitizeMaterialHtml } from '@/lib/material-content';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: LmsModuleItem | null;
  allowGeneralClass?: boolean;
}

type TabName = 'materi' | 'asesmen' | 'badge';

const FIELD =
  'min-h-11 w-full rounded-lg border border-[var(--material-line)] bg-[var(--material-bg)] px-3 py-2 text-base text-[var(--material-ink)] outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600';

const EDITOR_STYLE = `.diis-lms-editor{--material-bg:#fff;--material-soft:#f8fafc;--material-line:#cbd5e1;--material-ink:#0f2e25;--material-muted:#526b62;--material-link:#047857;--material-code:#f1f5f9;color:var(--material-ink)}
:root[data-theme=dark] .diis-lms-editor,:root.dark .diis-lms-editor{--material-bg:#0f172a;--material-soft:#172033;--material-line:#475569;--material-ink:#f1f5f9;--material-muted:#cbd5e1;--material-link:#6ee7b7;--material-code:#1e293b}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .diis-lms-editor{--material-bg:#0f172a;--material-soft:#172033;--material-line:#475569;--material-ink:#f1f5f9;--material-muted:#cbd5e1;--material-link:#6ee7b7;--material-code:#1e293b}}
.diis-lms-editor label>span{color:var(--material-muted);font-size:.875rem;font-weight:600;text-transform:none;letter-spacing:normal}.diis-lms-editor [role=tab]{color:var(--material-muted)}.diis-lms-editor [role=tab][aria-selected=true]{color:var(--material-link)}
`;

const TABS: { key: TabName; label: string; icon: typeof BookOpen }[] = [
  { key: 'materi', label: 'Materi', icon: BookOpen },
  { key: 'asesmen', label: 'Asesmen', icon: ClipboardList },
  { key: 'badge', label: 'Badge', icon: Award },
];

// Badge catalog shape (T2-03: fetched from /badges API)
type BadgeCatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  tier: string;
};

export default function ModulLmsForm({
  open,
  onClose,
  subjects,
  classes,
  academicYear,
  semester,
  editing,
  allowGeneralClass = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabName>('materi');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [tp, setTp] = useState(editing?.tp ?? '');
  const [jp, setJp] = useState(editing?.jpAllocation != null ? String(editing.jpAllocation) : '');
  const [kktp, setKktp] = useState(editing?.kktp != null ? String(editing.kktp) : '75');
  const [content, setContent] = useState(editing?.content ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [qbOpen, setQbOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const classErrorId = useId(),
    tabsId = useId();
  const opener = useRef<HTMLElement | null>(null);
  const classSelect = useRef<HTMLSelectElement>(null);
  const [classError, setClassError] = useState<string | null>(null);
  useEffect(() => {
    if (classError && activeTab === 'materi') classSelect.current?.focus();
  }, [classError, activeTab]);
  // Preserve the existing public audience only while its validated context is unchanged.
  const generalAllowed =
    allowGeneralClass || (editing?.classId === null && subject === editing.subject);

  // T2-03: Badge catalog dari /badges API (real data)
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogItem[]>([]);
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const badgeLoaded = useRef(false);
  const [badgeRetry, setBadgeRetry] = useState(0);

  // Fetch badge catalog when Badge tab is activated
  useEffect(() => {
    let active = true;
    if (activeTab === 'badge' && !badgeLoaded.current) {
      setBadgeLoading(true);
      setBadgeError(null);
      fetchBadgeCatalog()
        .then((res) => {
          if (!active) return;
          if (res.success && res.data) {
            setBadgeCatalog(res.data);
            badgeLoaded.current = true;
          } else {
            setBadgeError(res.error ?? 'Gagal memuat katalog badge');
          }
        })
        .catch(() => {
          if (active) setBadgeError('Katalog badge belum dapat dimuat. Coba lagi.');
        })
        .finally(() => {
          if (active) setBadgeLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [activeTab, badgeRetry]);

  const save = (publish: boolean) => {
    setErr(null);
    setClassError(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (!classId && !generalAllowed) {
      setActiveTab('materi');
      setClassError('Pilih kelas sesuai penugasan mengajar Anda.');
      classSelect.current?.focus();
      return;
    }
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    const safeContent = sanitizeMaterialHtml(content);
    if (!materialHasText(safeContent)) return setErr('Isi materi wajib diisi.');
    if (safeContent.length > 200_000)
      return setErr('Materi terlalu panjang. Ringkas hingga maksimal 200.000 karakter.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    const jpNum = jp.trim() ? Number(jp) : null;
    const kktpNum = kktp.trim() ? Number(kktp) : 75;
    if (jpNum != null && (!Number.isInteger(jpNum) || jpNum < 1 || jpNum > 40))
      return setErr('Alokasi JP harus berupa angka bulat 1–40.');
    if (Number.isNaN(kktpNum) || kktpNum < 0 || kktpNum > 100) return setErr('KKTP harus 0-100.');

    startTransition(async () => {
      const payload = {
        subject,
        title,
        tp: tp.trim() || null,
        jpAllocation: jpNum,
        kktp: kktpNum,
        content: safeContent,
        classId: classId || null,
      };
      try {
        const res = editing
          ? await updateLmsModule(editing.id, payload)
          : await createLmsModule({ ...payload, academicYear, semester, publish });
        if (!res.success) return setErr(res.error ?? 'Gagal menyimpan Modul LMS.');
        onClose();
      } catch {
        setErr('Penyimpanan belum terkonfirmasi. Periksa daftar modul sebelum mencoba lagi.');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent
        className="diis-lms-editor flex h-[92dvh] max-h-[58rem] w-[calc(100%-1rem)] max-w-6xl flex-col gap-0 overflow-hidden border-[var(--material-line)] bg-[var(--material-bg)] p-0 sm:w-[calc(100%-3rem)]"
        closeDisabled={pending}
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
      >
        <style>{EDITOR_STYLE}</style>
        <DialogHeader className="shrink-0 border-b border-[var(--material-line)] px-5 py-5 pr-14 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            {editing ? 'Edit Modul LMS' : 'Buat Modul LMS'}
            {editing && (
              <span
                className={clsx(
                  'rounded-md px-2 py-0.5 text-[11px] font-bold',
                  editing.status === 'published'
                    ? 'bg-emerald-50 text-emerald-700'
                    : editing.status === 'archived'
                      ? 'bg-zinc-100 text-zinc-500'
                      : 'bg-slate-100 text-slate-600',
                )}
              >
                {editing.status === 'published'
                  ? 'Terbit'
                  : editing.status === 'archived'
                    ? 'Arsip'
                    : 'Draft'}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-[var(--material-muted)]">
            TA {academicYear || '-'} · Semester {semester}. Materi yang dipublikasikan akan terlihat
            siswa kelas terkait.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Bar */}
        <div
          role="tablist"
          aria-label="Bagian Modul LMS"
          className="flex shrink-0 gap-1 border-b border-[var(--material-line)] px-4"
          onKeyDown={(event) => {
            if (pending || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const current = TABS.findIndex((tab) => tab.key === activeTab);
            const index =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? TABS.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
            const next = TABS[index]!;
            setActiveTab(next.key);
            document.getElementById(`${tabsId}-${next.key}`)?.focus();
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`${tabsId}-${tab.key}`}
                aria-selected={activeTab === tab.key}
                tabIndex={activeTab === tab.key ? 0 : -1}
                disabled={pending}
                aria-controls={`${tabsId}-panel`}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 border-b-2 px-4 py-2 text-[12.5px] font-bold transition-colors',
                  activeTab === tab.key
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-[#9bb0a8] hover:text-[#355a4e]',
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <fieldset
          disabled={pending}
          id={`${tabsId}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-${activeTab}`}
          className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6"
        >
          {/* ── MATERI TAB ── */}
          {activeTab === 'materi' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span
                    id={`${tabsId}-subject-label`}
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]"
                  >
                    Mapel
                  </span>
                  <select
                    value={subject}
                    aria-labelledby={`${tabsId}-subject-label`}
                    onChange={(e) => setSubject(e.target.value)}
                    className={FIELD}
                  >
                    <option value="">- pilih -</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span
                    id={`${classErrorId}-label`}
                    className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]"
                  >
                    {generalAllowed ? 'Kelas (opsional)' : 'Kelas *'}
                  </span>
                  <select
                    ref={classSelect}
                    value={classId}
                    aria-labelledby={`${classErrorId}-label`}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setClassError(null);
                    }}
                    required={!generalAllowed}
                    aria-invalid={!!classError}
                    aria-describedby={classError ? classErrorId : undefined}
                    className={FIELD}
                  >
                    <option value="">{generalAllowed ? 'Umum' : 'Pilih kelas'}</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {classError && (
                    <span
                      id={classErrorId}
                      role="alert"
                      className="mt-1 block text-sm text-rose-700 dark:text-rose-300"
                    >
                      {classError}
                    </span>
                  )}
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">
                  Judul Modul
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={FIELD}
                  placeholder="mis. Flexbox & Layout Responsif"
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">
                    TP (opsional)
                  </span>
                  <input
                    value={tp}
                    onChange={(e) => setTp(e.target.value)}
                    className={FIELD}
                    placeholder="TP 2.1"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">
                    Alokasi JP
                  </span>
                  <input
                    value={jp}
                    onChange={(e) => setJp(e.target.value)}
                    className={FIELD}
                    inputMode="numeric"
                    placeholder="4"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">
                    KKTP
                  </span>
                  <input
                    value={kktp}
                    onChange={(e) => setKktp(e.target.value)}
                    className={FIELD}
                    inputMode="numeric"
                    placeholder="75"
                  />
                </label>
              </div>

              <p className="text-sm leading-6 text-[var(--material-muted)]">
                Materi draft belum terlihat siswa. Perubahan pada modul terbit akan terlihat setelah
                disimpan.
              </p>
              <div className="flex gap-2 lg:hidden" role="group" aria-label="Tampilan materi">
                <button
                  type="button"
                  aria-pressed={!preview}
                  onClick={() => setPreview(false)}
                  className="min-h-11 rounded-lg border border-[var(--material-line)] px-4 text-sm font-semibold aria-pressed:bg-emerald-700 aria-pressed:text-white"
                >
                  Editor
                </button>
                <button
                  type="button"
                  aria-pressed={preview}
                  onClick={() => setPreview(true)}
                  className="min-h-11 rounded-lg border border-[var(--material-line)] px-4 text-sm font-semibold aria-pressed:bg-emerald-700 aria-pressed:text-white"
                >
                  Pratinjau siswa
                </button>
              </div>
              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <section
                  aria-label="Editor materi"
                  className={`min-w-0 ${preview ? 'hidden lg:block' : ''}`}
                >
                  <h2 className="mb-3 text-sm font-semibold">Isi materi</h2>
                  <MaterialEditor value={content} onChange={setContent} disabled={pending} />
                </section>
                <aside
                  aria-label="Pratinjau tampilan siswa"
                  className={`min-w-0 rounded-xl border border-[var(--material-line)] bg-[var(--material-soft)] p-5 ${preview ? '' : 'hidden lg:block'}`}
                >
                  <p className="mb-4 text-sm font-semibold text-[var(--material-muted)]">
                    Pratinjau siswa
                  </p>
                  <h2 className="mb-5 break-words text-xl font-bold">{title || 'Judul modul'}</h2>
                  {materialHasText(content) ? (
                    <MaterialContent content={content} />
                  ) : (
                    <p className="text-sm text-[var(--material-muted)]">
                      Isi materi akan tampil di sini.
                    </p>
                  )}
                </aside>
              </div>
            </>
          )}

          {/* ── ASESMEN TAB ── */}
          {activeTab === 'asesmen' && (
            <section aria-label="Soal dan asesmen" className="max-w-2xl space-y-4">
              <h2 className="text-lg font-bold">Soal dan asesmen</h2>
              <p className="text-sm leading-6 text-[var(--material-muted)]">
                Bank Soal menggunakan materi yang sudah disimpan. Menyimpan modul tidak otomatis
                membuat atau menjalankan asesmen.
              </p>
              <button
                type="button"
                disabled={!editing || pending}
                onClick={() => setQbOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:opacity-50"
              >
                <ClipboardList className="h-4 w-4" aria-hidden="true" />
                Buka Bank Soal
              </button>
              {!editing && (
                <p className="text-sm text-[var(--material-muted)]">
                  Simpan draft terlebih dahulu, lalu buka kembali modul untuk mengelola soal.
                </p>
              )}
              <p className="text-sm leading-6 text-[var(--material-muted)]">
                Pelaksanaan, jenis, dan penilaian asesmen diatur melalui menu Penilaian → Sesi
                Asesmen.
              </p>
            </section>
          )}

          {activeTab === 'badge' && (
            <section aria-label="Katalog badge" className="max-w-2xl space-y-4">
              <h2 className="text-lg font-bold">Katalog badge</h2>
              <p className="text-sm leading-6 text-[var(--material-muted)]">
                Lihat badge yang tersedia. Editor materi ini belum mengatur pemberian badge.
              </p>
              {badgeLoading && (
                <p role="status" className="text-sm">
                  Memuat katalog badge…
                </p>
              )}
              {badgeError && (
                <div role="alert" className="space-y-2 text-sm">
                  <p>{badgeError}</p>
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-[var(--material-line)] px-4"
                    onClick={() => setBadgeRetry((value) => value + 1)}
                  >
                    Coba lagi
                  </button>
                </div>
              )}
              {!badgeLoading && !badgeError && badgeCatalog.length === 0 && (
                <p className="text-sm text-[var(--material-muted)]">Belum ada badge tersedia.</p>
              )}
              {!badgeLoading && !badgeError && badgeCatalog.length > 0 && (
                <ul className="divide-y divide-[var(--material-line)] rounded-xl border border-[var(--material-line)]">
                  {badgeCatalog.map((badge) => (
                    <li key={badge.id} className="p-4">
                      <p className="font-semibold">{badge.name}</p>
                      {badge.description && (
                        <p className="mt-1 text-sm leading-6 text-[var(--material-muted)]">
                          {badge.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {/* Error display (shared) */}
          {err && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {err}
            </div>
          )}
        </fieldset>

        {/* Save buttons (shared across tabs) */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--material-line)] bg-[var(--material-soft)] px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-11 rounded-lg border border-[var(--material-line)] bg-[var(--material-bg)] px-4 py-2 text-sm font-semibold text-[var(--material-ink)] hover:bg-[var(--material-soft)] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => save(false)}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {editing?.status === 'published' ? 'Simpan Perubahan' : 'Simpan Draft'}
          </button>
          {!editing && (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={pending}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Simpan &amp; Publikasikan
            </button>
          )}
        </div>
      </DialogContent>

      {/* Question Bank Editor overlay (opened from Asesmen tab) */}
      {qbOpen && (
        <QuestionBankEditor
          subject={editing?.subject ?? subject}
          moduleId={editing?.id}
          classId={editing?.classId ?? undefined}
          academicYear={academicYear}
          semester={semester}
          onClose={() => setQbOpen(false)}
        />
      )}
    </Dialog>
  );
}
