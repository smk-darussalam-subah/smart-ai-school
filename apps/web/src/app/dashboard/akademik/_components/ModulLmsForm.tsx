'use client';

// ModulLmsForm — buat/edit Modul LMS dengan 3-tab editor (P21 — L4 scope).
// Tabs: Materi (konten + CP/TP sync), Asesmen (question bank + AI generate), Badge (config).
// Mockup ref: akademik-guru-utuh.html lines 1120-1170 (s-lms-editor).
// Parent me-remount via key={editing?.id ?? 'new'}.

import { useState, useTransition, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, Save, Send, AlertTriangle, Sparkles, BookOpen, ClipboardList, Award,
} from 'lucide-react';
import clsx from 'clsx';
import type { LmsModuleItem } from './guru-types';
import { createLmsModule, updateLmsModule, aiGenerateMaterial, aiGenerateQuestions, fetchBadgeCatalog } from '../actions';
import QuestionBankEditor from './QuestionBankEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: LmsModuleItem | null;
}

type TabName = 'materi' | 'asesmen' | 'badge';

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';

const TABS: { key: TabName; label: string; icon: typeof BookOpen }[] = [
  { key: 'materi', label: 'Materi', icon: BookOpen },
  { key: 'asesmen', label: 'Asesmen', icon: ClipboardList },
  { key: 'badge', label: 'Badge', icon: Award },
];

// Badge catalog shape (T2-03: fetched from /badges API)
type BadgeCatalogItem = {
  id: string; code: string; name: string; description: string | null;
  icon: string; tier: string;
};

export default function ModulLmsForm({ open, onClose, subjects, classes, academicYear, semester, editing }: Props) {
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
  const [aiLoading, startAi] = useTransition();
  const [qbOpen, setQbOpen] = useState(false);
  const [assessmentType, setAssessmentType] = useState<'formative' | 'summative'>('formative');
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [badgeThreshold, setBadgeThreshold] = useState('75');

  // T2-03: Badge catalog dari /badges API (real data)
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeCatalogItem[]>([]);
  const [badgeLoading, setBadgeLoading] = useState(false);
  const [badgeError, setBadgeError] = useState<string | null>(null);

  // Fetch badge catalog when Badge tab is activated
  useEffect(() => {
    if (activeTab === 'badge' && badgeCatalog.length === 0 && !badgeLoading) {
      setBadgeLoading(true);
      setBadgeError(null);
      fetchBadgeCatalog().then((res) => {
        if (res.success && res.data) {
          setBadgeCatalog(res.data);
        } else {
          setBadgeError(res.error ?? 'Gagal memuat katalog badge');
        }
      }).finally(() => setBadgeLoading(false));
    }
  }, [activeTab, badgeCatalog.length, badgeLoading]);

  const save = (publish: boolean) => {
    setErr(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (content.trim().length === 0) return setErr('Isi materi wajib diisi.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    const jpNum = jp.trim() ? Number(jp) : null;
    const kktpNum = kktp.trim() ? Number(kktp) : 75;
    if (jpNum != null && (Number.isNaN(jpNum) || jpNum < 1 || jpNum > 40)) return setErr('Alokasi JP harus 1-40.');
    if (Number.isNaN(kktpNum) || kktpNum < 0 || kktpNum > 100) return setErr('KKTP harus 0-100.');

    startTransition(async () => {
      const payload = {
        subject, title, tp: tp.trim() || null, jpAllocation: jpNum, kktp: kktpNum,
        content, classId: classId || null,
      };
      const res = editing
        ? await updateLmsModule(editing.id, payload)
        : await createLmsModule({ ...payload, academicYear, semester, publish });
      if (!res.success) return setErr(res.error ?? 'Gagal menyimpan Modul LMS.');
      onClose();
    });
  };

  const handleGenerateMaterial = () => {
    if (!subject) { setErr('Pilih mapel sebelum generate AI.'); return; }
    setErr(null);
    startAi(async () => {
      const res = await aiGenerateMaterial({ rppBody: content || title, subject });
      if (!res.success) {
        const msg = res.error ?? 'Gagal generate AI.';
        setErr(msg.includes('429') ? 'Rate limit tercapai (10/menit). Coba lagi nanti.' : msg);
        return;
      }
      const data = res.data as { output?: string };
      if (data?.output) setContent(data.output);
    });
  };

  const handleGenerateQuestions = () => {
    if (!subject) { setErr('Pilih mapel sebelum generate AI.'); return; }
    setErr(null);
    startAi(async () => {
      const res = await aiGenerateQuestions({ rppBody: content || title, subject, count: 5, type: 'multiple_choice' });
      if (!res.success) {
        const msg = res.error ?? 'Gagal generate AI.';
        setErr(msg.includes('429') ? 'Rate limit tercapai (10/menit). Coba lagi nanti.' : msg);
        return;
      }
      // AI generated questions — open question bank to review
      setQbOpen(true);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? 'Edit Modul LMS' : 'Buat Modul LMS'}
            {editing && (
              <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold',
                editing.status === 'published' ? 'bg-emerald-50 text-emerald-700'
                  : editing.status === 'archived' ? 'bg-zinc-100 text-zinc-500'
                  : 'bg-slate-100 text-slate-600'
              )}>
                {editing.status === 'published' ? 'Terbit' : editing.status === 'archived' ? 'Arsip' : 'Draft'}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            TA {academicYear || '-'} · Semester {semester}. Materi yang dipublikasikan akan terlihat siswa kelas terkait.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b border-[#e6efea]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 border-b-2 px-4 py-2 text-[12.5px] font-bold transition-colors',
                  activeTab === tab.key
                    ? 'border-emerald-500 text-emerald-700'
                    : 'border-transparent text-[#9bb0a8] hover:text-[#355a4e]'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="space-y-3">
          {/* ── MATERI TAB ── */}
          {activeTab === 'materi' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Mapel</span>
                  <select value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD}>
                    <option value="">- pilih -</option>
                    {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Kelas (opsional)</span>
                  <select value={classId} onChange={(e) => setClassId(e.target.value)} className={FIELD}>
                    <option value="">- umum -</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Judul Modul</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD}
                  placeholder="mis. Flexbox & Layout Responsif" />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">TP (opsional)</span>
                  <input value={tp} onChange={(e) => setTp(e.target.value)} className={FIELD} placeholder="TP 2.1" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Alokasi JP</span>
                  <input value={jp} onChange={(e) => setJp(e.target.value)} className={FIELD} inputMode="numeric" placeholder="4" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">KKTP</span>
                  <input value={kktp} onChange={(e) => setKktp(e.target.value)} className={FIELD} inputMode="numeric" placeholder="75" />
                </label>
              </div>

              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
                Konten di bawah tersinkron dari Modul Ajar yang disetujui. Edit materi akan langsung tampil di LMS siswa.
              </div>

              <label className="block">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Isi Materi</span>
                  <button
                    type="button"
                    onClick={handleGenerateMaterial}
                    disabled={aiLoading || !subject}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10.5px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Generate Materi AI
                  </button>
                </div>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={7}
                  className={`${FIELD} resize-y`} placeholder="Materi pembelajaran (teks/markdown)..." />
              </label>
            </>
          )}

          {/* ── ASESMEN TAB ── */}
          {activeTab === 'asesmen' && (
            <>
              <div className="rounded-lg bg-amber-50 px-3 py-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
                <AlertTriangle className="h-3 w-3" /> Konfigurasi asesmen tersimpan saat Simpan Draft/Publikasikan (SIMULASI)
              </div>

              <div>
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Tipe Asesmen</span>
                <div className="flex gap-2">
                  {(['formative', 'summative'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAssessmentType(t)}
                      className={clsx(
                        'rounded-xl border px-4 py-2 text-[12.5px] font-bold transition-colors',
                        assessmentType === t
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-[#e6efea] bg-white text-[#6b8079] hover:bg-[#f4f7f5]'
                      )}
                    >
                      {t === 'formative' ? 'Formatif (Auto-grade PG)' : 'Sumatif (Essay + Rubrik)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setQbOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"
                >
                  <ClipboardList className="h-4 w-4 text-emerald-600" />
                  Pilih dari Bank Soal
                </button>
                <button
                  type="button"
                  onClick={handleGenerateQuestions}
                  disabled={aiLoading || !subject}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-[12.5px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate Soal AI
                </button>
              </div>

              <div className="rounded-xl border border-[#e6efea] bg-[#f4f7f5] p-4">
                <p className="text-[12px] font-medium text-[#6b8079]">
                  {assessmentType === 'formative'
                    ? 'Formatif: Soal pilihan ganda dengan auto-grade. Hasil langsung masuk ke kolom UH di Gradebook.'
                    : 'Sumatif: Soal essay + rubrik penilaian. Guru menilai manual.'}
                </p>
              </div>
            </>
          )}

          {/* ── BADGE TAB ── */}
          {activeTab === 'badge' && (
            <>
              <div>
                <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Pilih Badge untuk Modul Ini</span>

                {badgeLoading && (
                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-4 text-[12px] font-medium text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Memuat katalog badge...
                  </div>
                )}

                {badgeError && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> {badgeError}
                  </div>
                )}

                {!badgeLoading && !badgeError && badgeCatalog.length === 0 && (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-[12px] font-medium text-slate-500">
                    Belum ada badge tersedia. Hubungi admin untuk membuat badge.
                  </div>
                )}

                {!badgeLoading && badgeCatalog.length > 0 && (
                  <div className="space-y-2">
                    {badgeCatalog.map((badge) => (
                      <button
                        key={badge.id}
                        type="button"
                        onClick={() => setSelectedBadge(selectedBadge === badge.code ? null : badge.code)}
                        className={clsx(
                          'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                          selectedBadge === badge.code
                            ? 'border-emerald-300 bg-emerald-50'
                            : 'border-[#e6efea] bg-white hover:bg-[#f4f7f5]'
                        )}
                      >
                        <div className={clsx(
                          'flex h-10 w-10 items-center justify-center rounded-full text-lg',
                          badge.tier === 'gold' ? 'bg-yellow-100' :
                          badge.tier === 'silver' ? 'bg-gray-100' :
                          badge.tier === 'platinum' ? 'bg-blue-100' : 'bg-orange-100'
                        )}>
                          {badge.icon || (
                            <Award className={clsx(
                              'h-5 w-5',
                              badge.tier === 'gold' ? 'text-yellow-600' :
                              badge.tier === 'silver' ? 'text-gray-500' :
                              badge.tier === 'platinum' ? 'text-blue-600' : 'text-orange-600'
                            )} />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] font-bold text-[#0f2e25]">{badge.name}</div>
                          <div className="text-[11px] text-[#6b8079]">{badge.description || 'Tidak ada deskripsi'}</div>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">{badge.tier}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedBadge && (
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]">Threshold Nilai untuk Badge</span>
                  <input
                    value={badgeThreshold}
                    onChange={(e) => setBadgeThreshold(e.target.value)}
                    className={FIELD}
                    inputMode="numeric"
                    placeholder="75"
                  />
                  <p className="mt-1 text-[10.5px] text-[#9bb0a8]">Siswa yang menyelesaikan modul dengan nilai di atas threshold akan mendapat badge.</p>
                </label>
              )}
            </>
          )}

          {/* Error display (shared) */}
          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600">
              <AlertTriangle className="h-4 w-4 shrink-0" />{err}
            </div>
          )}
        </div>

        {/* Save buttons (shared across tabs) */}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending}
            className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">
            Batal
          </button>
          <button type="button" onClick={() => save(false)} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan Draft
          </button>
          {!editing && (
            <button type="button" onClick={() => save(true)} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Simpan &amp; Publikasikan
            </button>
          )}
        </div>
      </DialogContent>

      {/* Question Bank Editor overlay (opened from Asesmen tab) */}
      {qbOpen && (
        <QuestionBankEditor subject={subject} onClose={() => setQbOpen(false)} />
      )}
    </Dialog>
  );
}
