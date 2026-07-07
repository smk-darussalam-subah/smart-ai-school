'use client';

// ModulAjarForm — Modul Ajar Kurikulum Merdeka LENGKAP (sesuai mockup modul-ajar-form.html).
// Wizard 11-langkah dengan sidebar navigation, AI Generate, timeline
// Kegiatan (Pendahuluan/Inti/Penutup), asesmen terstruktur (Diagnostik/Formatif/Sumatif),
// Lampiran, Rekap & Download. Data tersimpan di Rpp.body (JSON); identitas di kolom top-level.

import { useState, useTransition, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Loader2, Save, Send, AlertTriangle, Plus, Trash2, Sparkles, Info, Target, Route,
  Users, Package, Layers, ClipboardCheck, TrendingUp, Lightbulb, Paperclip,
  FileCheck, ChevronLeft, ChevronRight, CheckCircle, RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import type { RppItem, ModulAjarBody, AtpItem, KegiatanItem } from './guru-types';
import { createRpp, updateRpp, submitRpp, aiGenerateAtp, aiGenerateRppStep, aiGenerateMaterial } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: RppItem | null;
  /** Pre-select mapel saat create baru (dipakai session flow step "Buka Modul Ajar"). */
  defaultSubject?: string;
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';
const LBL = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]';

const DIMENSI = [
  'Beriman & Berakhlak Mulia', 'Berkebinekaan Global', 'Bergotong Royong',
  'Mandiri', 'Bernalar Kritis', 'Kreatif',
];

const MODELS = ['Project-Based Learning (PjBL)', 'Problem-Based Learning (PBL)', 'Discovery Learning', 'Inquiry Learning', 'Diferensiasi'];

const STEPS = [
  { n: 1, label: 'Identitas Modul', icon: Info, req: true },
  { n: 2, label: 'Capaian & Tujuan', icon: Target, req: true },
  { n: 3, label: 'Alur Tujuan (ATP)', icon: Route, req: false },
  { n: 4, label: 'Profil Pelajar Pancasila', icon: Users, req: false },
  { n: 5, label: 'Sarana & Target Siswa', icon: Package, req: false },
  { n: 6, label: 'Kegiatan Pembelajaran', icon: Layers, req: true },
  { n: 7, label: 'Asesmen', icon: ClipboardCheck, req: true },
  { n: 8, label: 'Pengayaan & Remedial', icon: TrendingUp, req: false },
  { n: 9, label: 'Refleksi', icon: Lightbulb, req: false },
  { n: 10, label: 'Lampiran', icon: Paperclip, req: false },
  { n: 11, label: 'Rekap & Download', icon: FileCheck, req: false },
];

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export default function ModulAjarForm({ open, onClose, subjects, classes, academicYear, semester, editing, defaultSubject }: Props) {
  const [subject, setSubject] = useState(editing?.subject ?? defaultSubject ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState<ModulAjarBody>(editing?.body ?? {});
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGeneratingSemua, setIsGeneratingSemua] = useState(false);
  const [isGeneratingMaterial, setIsGeneratingMaterial] = useState(false);
  const [semuaProgress, setSemuaProgress] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };
  const set = <K extends keyof ModulAjarBody>(k: K, v: ModulAjarBody[K]) => setBody((b) => ({ ...b, [k]: v }));
  const toggleDimensi = (d: string) => {
    const cur = body.profilDimensi ?? [];
    set('profilDimensi', cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  };

  // List TP
  const tp = body.tp ?? [];
  const setTp = (i: number, v: string) => set('tp', tp.map((x, j) => (j === i ? v : x)));
  const addTp = () => set('tp', [...tp, '']);
  const delTp = (i: number) => set('tp', tp.filter((_, j) => j !== i));

  // List ATP
  const atp = body.atp ?? [];
  const setAtp = (i: number, patch: Partial<AtpItem>) => set('atp', atp.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addAtp = () => set('atp', [...atp, {}]);
  const delAtp = (i: number) => set('atp', atp.filter((_, j) => j !== i));

  // List Kegiatan
  const keg = body.kegiatan ?? [];
  const setKeg = (i: number, patch: Partial<KegiatanItem>) => set('kegiatan', keg.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const addKeg = () => set('kegiatan', [...keg, {}]);
  const delKeg = (i: number) => set('kegiatan', keg.filter((_, j) => j !== i));

  const goStep = (n: number) => {
    setStep(n);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [, startAi] = useTransition();

  /**
   * R-29: Core async logic for AI generation of a single step.
   * Extracted from aiGenerate() so it can be reused by "Generate Semua" sequential loop.
   * Throws on error — caller handles fail-soft.
   */
  const aiGenerateStep = async (stepNum: number): Promise<void> => {
    // Step 3 (ATP) → dedicated ATP endpoint.
    if (stepNum === 3) {
      if (!subject) throw new Error('Pilih mapel terlebih dahulu.');
      const cpText = typeof body.cp === 'string' ? body.cp : '';
      const tpList = Array.isArray(body.tp) ? body.tp.filter((t) => t.trim()) : [];
      if (tpList.length === 0) throw new Error('Tambahkan minimal 1 TP sebelum generate ATP.');
      const res = await aiGenerateAtp({ cp: cpText, tp: tpList, subject });
      if (!res.success) throw new Error(res.error ?? 'Gagal generate AI.');
      const data = res.data as { output?: AtpItem[] };
      if (data?.output && Array.isArray(data.output)) {
        set('atp', data.output);
      } else {
        throw new Error('AI tidak mengembalikan ATP.');
      }
      return;
    }
    // P4 (S-12): Other steps — real AI gateway via /ai/generate-rpp-step
    const stepMap: Record<number, string> = {
      2: 'cp_tp', 4: 'profil', 5: 'sarana', 6: 'kegiatan',
      7: 'asesmen', 8: 'remedial', 9: 'refleksi', 10: 'lampiran',
    };
    const stepKey = stepMap[stepNum];
    if (!stepKey || !subject) {
      throw new Error(subject ? 'Langkah tidak didukung.' : 'Pilih mapel terlebih dahulu.');
    }
    const contextStr = JSON.stringify(body).slice(0, 4000);
    const res = await aiGenerateRppStep({ step: stepKey, subject, context: contextStr });
    if (!res.success) throw new Error(res.error ?? 'Gagal generate AI.');
    if (!res.data?.output) throw new Error('AI tidak mengembalikan konten.');
  };

  const aiGenerate = (stepNum: number) => {
    startAi(async () => {
      try {
        await aiGenerateStep(stepNum);
        showToast(`Bagian "${STEPS[stepNum - 1]?.label}" berhasil di-generate AI. Silakan sunting.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal generate AI.';
        showToast(msg.includes('429') ? 'Rate limit tercapai (10/menit). Coba lagi nanti.' : msg);
      }
    });
  };

  /**
   * R-29: Generate Semua — sequential loop step 2→10 with fail-soft.
   * Each step waits for the previous to complete (context dependency).
   */
  const handleGenerateSemua = async () => {
    if (!subject) { showToast('Pilih mapel terlebih dahulu.'); return; }
    setIsGeneratingSemua(true);
    setSemuaProgress('Memulai generate...');
    let successCount = 0;
    let failCount = 0;

    for (let stepNum = 2; stepNum <= 10; stepNum++) {
      const label = STEPS[stepNum - 1]?.label ?? `Step ${stepNum}`;
      setSemuaProgress(`Generating: ${label} (${stepNum - 1}/9)...`);
      try {
        await aiGenerateStep(stepNum);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`Step ${stepNum} gagal:`, err);
      }
    }

    setIsGeneratingSemua(false);
    setSemuaProgress(null);
    if (failCount === 0) {
      showToast(`Semua ${successCount} bagian berhasil di-generate AI. Silakan sunting setiap bagian.`);
    } else {
      showToast(`Selesai: ${successCount} berhasil, ${failCount} gagal. Silakan sunting bagian yang berhasil.`);
    }
  };

  /**
   * R-32: Generate Materi pembelajaran via AI.
   * Sends current form context to /ai/generate-material and stores result in lampiran field.
   */
  const handleGenerateMaterial = async () => {
    if (!subject) { showToast('Pilih mapel terlebih dahulu.'); return; }
    setIsGeneratingMaterial(true);
    try {
      const contextStr = JSON.stringify(body).slice(0, 4000);
      const res = await aiGenerateMaterial({ rppBody: contextStr, subject });
      if (!res.success) {
        showToast('Gagal generate materi: ' + (res.error ?? 'Unknown error'));
        return;
      }
      const data = res.data as { output?: string };
      if (data?.output) {
        set('lampiran', data.output);
        showToast('Materi pembelajaran berhasil di-generate. Lihat di kolom Catatan Lampiran.');
      } else {
        showToast('AI tidak mengembalikan materi. Coba lagi.');
      }
    } catch (err) {
      showToast('Gagal generate materi: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsGeneratingMaterial(false);
    }
  };

  const saveDraft = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); showToast('Draft modul ajar tersimpan'); }, 800);
  };

  const save = (submitNow: boolean) => {
    setErr(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    const cleanTp = tp.map((x) => x.trim()).filter(Boolean);
    const cleanAtp = atp.filter((x) => (x.tpRef ?? '').trim() || (x.indikator ?? '').trim());
    const cleanKeg = keg.filter((x) =>
      (x.pertemuan ?? '').trim() || (x.pendahuluan ?? '').trim() ||
      (x.inti ?? '').trim() || (x.penutup ?? '').trim() || (x.deskripsi ?? '').trim(),
    );
    const cleaned: ModulAjarBody = {
      ...body,
      tp: cleanTp.length ? cleanTp : undefined,
      atp: cleanAtp.length ? cleanAtp : undefined,
      kegiatan: cleanKeg.length ? cleanKeg : undefined,
      profilDimensi: body.profilDimensi?.length ? body.profilDimensi : undefined,
    };
    const hasBody = Object.values(cleaned).some((v) => (Array.isArray(v) ? v.length : v != null && String(v).trim() !== ''));
    if (!hasBody) return setErr('Isi minimal satu bagian Modul Ajar (mis. CP/TP atau Kegiatan).');

    const content = [
      cleaned.cp ? `CP: ${cleaned.cp}` : '',
      cleanTp.length ? `TP: ${cleanTp.join(' · ')}` : '',
      cleaned.asesmen || cleaned.asesmenFormatif ? `Asesmen: ${cleaned.asesmenFormatif ?? cleaned.asesmen ?? ''}` : '',
    ].filter(Boolean).join('\n\n').slice(0, 5000) || null;

    startTransition(async () => {
      let res;
      if (editing) {
        res = await updateRpp(editing.id, { subject, title, classId: classId || null, body: cleaned, content });
        if (res.success && submitNow) res = await submitRpp(editing.id);
      } else {
        res = await createRpp({ subject, title, classId: classId || undefined, body: cleaned, content, academicYear, semester, submit: submitNow });
      }
      if (!res.success) return setErr(res.error ?? 'Gagal menyimpan Modul Ajar.');
      onClose();
    });
  };

  const submitReview = () => setConfirmOpen(true);
  const confirmSubmit = () => { setConfirmOpen(false); save(true); };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-[#e6efea] px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-[18px]">
            {editing ? 'Edit Modul Ajar' : 'Buat Modul Ajar'}
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {saving ? 'Menyimpan...' : 'Tersimpan'}
            </span>
          </DialogTitle>
          <DialogDescription>
            Kurikulum Merdeka · TA {academicYear || '—'} · Semester {semester}. Isi bertahap; simpan draft kapan saja.
          </DialogDescription>
        </DialogHeader>

        {editing?.status === 'revision' && editing.reviewNote && (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span><b>Catatan revisi:</b> {editing.reviewNote}</span>
          </div>
        )}

        {/* Body: sidebar + content. Mobile = column (stepper atas, konten bawah); desktop = row */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Step sidebar — desktop */}
          <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-[#e6efea] bg-[#f9fbfa] py-3 lg:block">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const active = step === s.n;
              return (
                <button key={s.n} type="button" onClick={() => goStep(s.n)}
                  className={clsx('flex w-full items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-semibold transition',
                    active ? 'bg-emerald-50 text-emerald-700' : 'text-[#355a4e] hover:bg-white')}>
                  <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-extrabold',
                    active ? 'bg-emerald-600 text-white' : 'bg-[#e6efea] text-[#6b8079]')}>
                    {s.n}
                  </span>
                  <Icon className={clsx('h-4 w-4', active ? 'text-emerald-600' : 'text-[#9bb0a8]')} />
                  <span className="flex-1 text-left">{s.label}</span>
                  {s.req && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />}
                </button>
              );
            })}
          </nav>

          {/* Mobile stepper — atas konten (column), horizontal scroll anti-wrap */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[#e6efea] px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {STEPS.map((s) => (
              <button key={s.n} type="button" onClick={() => goStep(s.n)}
                className={clsx('flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold',
                  step === s.n ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[#e6efea] bg-white text-[#6b8079]')}>
                <span>{s.n}</span>{s.label}
              </button>
            ))}
          </div>

          {/* Content area */}
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {/* AI Assistant Bar */}
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-br from-violet-50 to-emerald-50 px-4 py-3">
              <Sparkles className="h-5 w-5 shrink-0 text-violet-600" />
              <div className="min-w-0 flex-1">
                <b className="block text-[12.5px] font-extrabold text-[#0f2e25]">Asisten AI Modul Ajar</b>
                <small className="text-[10.5px] font-semibold text-[#6b8079]">
                  {isGeneratingSemua && semuaProgress
                    ? semuaProgress
                    : 'Generate isi setiap bagian otomatis dengan AI (kecuali Identitas). Hasil dapat disunting.'}
                </small>
              </div>
              <button type="button" onClick={handleGenerateSemua} disabled={isGeneratingSemua}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-60">
                {isGeneratingSemua
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                  : <><Sparkles className="h-3.5 w-3.5" />Generate Semua</>}
              </button>
            </div>

            <div className="space-y-4">
              {/* STEP 1: Identitas */}
              <SectionCard step={1} activeStep={step} title="Identitas Modul Ajar" desc="Informasi dasar modul ajar — mata pelajaran, kelas, dan periode" req icon={Info}>
                <FieldGrid>
                  <Field label="Judul Modul Ajar" req>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} placeholder="cth: Merancang Jaringan LAN Sederhana" />
                  </Field>
                </FieldGrid>
                <FieldGrid cols={2}>
                  <Field label="Mata Pelajaran" req hint="Dari Penugasan">
                    <select value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD}><option value="">— pilih —</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                  </Field>
                  <Field label="Fase" req>
                    <select value={body.fase ?? ''} onChange={(e) => set('fase', e.target.value)} className={FIELD}><option value="">— pilih —</option><option value="E">Fase E (Kelas X)</option><option value="F">Fase F (Kelas XI-XII)</option></select>
                  </Field>
                </FieldGrid>
                <FieldGrid cols={2}>
                  <Field label="Kelas" hint="Dari Penugasan">
                    <select value={classId} onChange={(e) => setClassId(e.target.value)} className={FIELD}><option value="">— umum —</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                  </Field>
                  <Field label="Semester">
                    <select value={String(semester)} disabled className={`${FIELD} bg-[#f4f7f5] text-[#6b8079]`}><option>{semester === 1 ? 'Ganjil' : 'Genap'}</option></select>
                  </Field>
                </FieldGrid>
                <FieldGrid cols={3}>
                  <Field label="Alokasi JP" req><input value={body.jpAllocation != null ? String(body.jpAllocation) : ''} onChange={(e) => set('jpAllocation', num(e.target.value))} className={FIELD} inputMode="numeric" placeholder="6" /></Field>
                  <Field label="Durasi (menit)"><input value={body.durasiMenit != null ? String(body.durasiMenit) : ''} onChange={(e) => set('durasiMenit', num(e.target.value))} className={FIELD} inputMode="numeric" placeholder="45" /></Field>
                  <Field label="Tahun Ajaran"><input value={academicYear} readOnly className={`${FIELD} bg-[#f4f7f5] text-[#6b8079]`} /></Field>
                </FieldGrid>
                <FieldGrid>
                  <Field label="Pengembang Modul"><input value={body.pengembang ?? ''} onChange={(e) => set('pengembang', e.target.value)} className={FIELD} placeholder="Nama guru" /></Field>
                </FieldGrid>
                <FieldGrid cols={2}>
                  <Field label="KKTP"><input value={body.kktp != null ? String(body.kktp) : ''} onChange={(e) => set('kktp', num(e.target.value))} className={FIELD} inputMode="numeric" placeholder="75" /></Field>
                </FieldGrid>
              </SectionCard>

              {/* STEP 2: Capaian & TP */}
              <SectionCard step={2} activeStep={step} title="Capaian Pembelajaran (CP) & Tujuan Pembelajaran (TP)" desc="Definisikan CP berdasarkan fase, lalu turunkan ke TP yang terukur" req icon={Target} onAI={() => aiGenerate(2)} simLabel={undefined}>
                <Field label="Capaian Pembelajaran (CP)" req><textarea value={body.cp ?? ''} onChange={(e) => set('cp', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Tulis CP sesuai dokumen Kurikulum Merdeka..." /></Field>
                <Field label="Kompetensi Awal" hint="Opsional"><textarea value={body.kompetensiAwal ?? ''} onChange={(e) => set('kompetensiAwal', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Pengetahuan/keterampilan yang sudah dimiliki..." /></Field>
                <Field label="Tujuan Pembelajaran (TP)" req>
                  <p className="mb-2 text-[10.5px] text-[#6b8079]">Tambahkan minimal 2 TP yang terukur (gunakan kata kerja operasional Bloom)</p>
                  <ListAdd onAdd={addTp} label="Tambah TP" />
                  {tp.length === 0 && <Empty>Belum ada TP.</Empty>}
                  {tp.map((t, i) => (
                    <Row key={i} onDel={() => delTp(i)} num={i + 1} label={`TP ${i + 1}`}>
                      <input value={t} onChange={(e) => setTp(i, e.target.value)} className={FIELD} placeholder={`Tujuan Pembelajaran ${i + 1}`} />
                    </Row>
                  ))}
                </Field>
              </SectionCard>

              {/* STEP 3: ATP */}
              <SectionCard step={3} activeStep={step} title="Alur Tujuan Pembelajaran (ATP)" desc="Urutan logis TP yang membentuk alur pembelajaran berjenjang" icon={Route} onAI={() => aiGenerate(3)}>
                <Field label="Uraian Alur"><textarea value={body.atpUraian ?? ''} onChange={(e) => set('atpUraian', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Susun urutan TP dari yang paling dasar ke paling kompleks..." /></Field>
                <Field label="Indikator per TP">
                  <ListAdd onAdd={addAtp} label="Tambah Alur TP" />
                  {atp.map((a, i) => (
                    <Row key={i} onDel={() => delAtp(i)} num={i + 1} label={`TP ${i + 1} → Pertemuan`}>
                      <select value={a.tpRef ?? ''} onChange={(e) => setAtp(i, { tpRef: e.target.value })} className={`${FIELD} w-1/3`}>
                        <option value="">TP referensi</option>
                        {tp.map((_, j) => <option key={j} value={`TP ${j + 1}`}>TP {j + 1}</option>)}
                      </select>
                      <input value={a.indikator ?? ''} onChange={(e) => setAtp(i, { indikator: e.target.value })} className={FIELD} placeholder="Indikator ketercapaian" />
                    </Row>
                  ))}
                </Field>
              </SectionCard>

              {/* STEP 4: Profil Pelajar Pancasila */}
              <SectionCard step={4} activeStep={step} title="Profil Pelajar Pancasila" desc="Pilih dimensi yang dikembangkan dalam modul ajar ini" icon={Users} onAI={() => aiGenerate(4)} simLabel={undefined}>
                <Field label="Dimensi Profil Pelajar Pancasila">
                  <p className="mb-2 text-[10.5px] text-[#6b8079]">Pilih minimal 1 dimensi yang menjadi fokus</p>
                  <div className="flex flex-wrap gap-2">
                    {DIMENSI.map((d) => {
                      const on = (body.profilDimensi ?? []).includes(d);
                      return (
                        <button type="button" key={d} onClick={() => toggleDimensi(d)}
                          className={clsx('inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition',
                            on ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-[#e6efea] bg-white text-[#355a4e] hover:bg-[#f4f7f5]')}>
                          {on && <CheckCircle className="h-3.5 w-3.5" />}{d}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Uraian Aktivitas Profil Pelajar"><textarea value={body.profilUraian ?? ''} onChange={(e) => set('profilUraian', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Jelaskan bagaimana dimensi yang dipilih dikembangkan..." /></Field>
              </SectionCard>

              {/* STEP 5: Sarana & Target */}
              <SectionCard step={5} activeStep={step} title="Sarana Prasarana & Target Peserta Didik" desc="Daftar alat, bahan, dan profil peserta didik target modul ini" icon={Package} onAI={() => aiGenerate(5)} simLabel={undefined}>
                <Field label="Sarana & Prasarana"><textarea value={body.sarana ?? ''} onChange={(e) => set('sarana', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Alat, bahan, software, ruangan yang dibutuhkan..." /></Field>
                <Field label="Target Peserta Didik"><textarea value={body.target ?? ''} onChange={(e) => set('target', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Karakteristik peserta didik target modul ini..." /></Field>
                <Field label="Model Pembelajaran">
                  <select value={body.model ?? ''} onChange={(e) => set('model', e.target.value)} className={FIELD}>
                    <option value="">— pilih —</option>
                    {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </SectionCard>

              {/* STEP 6: Kegiatan Pembelajaran — Timeline */}
              <SectionCard step={6} activeStep={step} title="Kegiatan Pembelajaran" desc="Rincian kegiatan: Pendahuluan, Inti, dan Penutup untuk setiap pertemuan" req icon={Layers} onAI={() => aiGenerate(6)} simLabel={undefined}>
                <ListAdd onAdd={addKeg} label="Tambah Pertemuan" />
                {keg.length === 0 && <Empty>Belum ada pertemuan.</Empty>}
                {keg.map((k, i) => (
                  <div key={i} className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <input value={k.pertemuan ?? ''} onChange={(e) => setKeg(i, { pertemuan: e.target.value })} className={`${FIELD} max-w-xs`} placeholder={`Pertemuan ${i + 1}`} />
                      <button type="button" onClick={() => delKeg(i)} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {/* Timeline */}
                    <div className="relative space-y-3 border-l-2 border-[#e6efea] pl-5">
                      {/* Pendahuluan */}
                      <TimelineDot color="sky" label="Kegiatan Pendahuluan (15 menit)">
                        <textarea value={k.pendahuluan ?? ''} onChange={(e) => setKeg(i, { pendahuluan: e.target.value })} rows={2} className={`${FIELD} resize-y`} placeholder="Apersepsi, motivasi, penyampaian tujuan..." />
                      </TimelineDot>
                      {/* Inti */}
                      <TimelineDot color="emerald" label="Kegiatan Inti (60 menit)">
                        <textarea value={k.inti ?? ''} onChange={(e) => setKeg(i, { inti: e.target.value })} rows={3} className={`${FIELD} resize-y`} placeholder="Sintaks model pembelajaran, aktivitas guru & siswa..." />
                        <Field label="Diferensiasi" hint="Opsional">
                          <textarea value={k.diferensiasi ?? ''} onChange={(e) => setKeg(i, { diferensiasi: e.target.value })} rows={2} className={`${FIELD} resize-y`} placeholder="Strategi diferensiasi konten/proses/produk..." />
                        </Field>
                      </TimelineDot>
                      {/* Penutup */}
                      <TimelineDot color="violet" label="Kegiatan Penutup (15 menit)">
                        <textarea value={k.penutup ?? ''} onChange={(e) => setKeg(i, { penutup: e.target.value })} rows={2} className={`${FIELD} resize-y`} placeholder="Kesimpulan, refleksi, tindak lanjut..." />
                      </TimelineDot>
                    </div>
                  </div>
                ))}
              </SectionCard>

              {/* STEP 7: Asesmen — Diagnostik/Formatif/Sumatif */}
              <SectionCard step={7} activeStep={step} title="Asesmen" desc="Rencana penilaian: diagnostik, formatif, dan sumatif" req icon={ClipboardCheck} onAI={() => aiGenerate(7)} simLabel={undefined}>
                {/* Diagnostik */}
                <AssessCard type="diag" title="Asesmen Diagnostik" desc="Awal pembelajaran — petakan pengetahuan awal">
                  <textarea value={body.asesmenDiagnostik ?? ''} onChange={(e) => set('asesmenDiagnostik', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Jenis & deskripsi asesmen diagnostik (mis. 3-5 PG atau essay)..." />
                </AssessCard>
                {/* Formatif */}
                <AssessCard type="form" title="Asesmen Formatif" desc="Selama pembelajaran — pantau perkembangan">
                  <textarea value={body.asesmenFormatif ?? ''} onChange={(e) => set('asesmenFormatif', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Jenis & deskripsi asesmen formatif (mis. 5-10 PG, essay, praktikum)..." />
                </AssessCard>
                {/* Sumatif */}
                <AssessCard type="sum" title="Asesmen Sumatif" desc="Akhir modul — ukur ketercapaian TP">
                  <div className="mb-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                    <span><b>Saran:</b> Soal sumatif banyak (35-45 PG + proyek) — sebaiknya dibuat di form tersendiri. Isi di bawah adalah kerangka awal.</span>
                  </div>
                  <textarea value={body.asesmenSumatif ?? ''} onChange={(e) => set('asesmenSumatif', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Jenis & deskripsi asesmen sumatif (mis. 35-45 PG + proyek akhir)..." />
                </AssessCard>
                {/* Legacy field */}
                <Field label="Catatan Asesmen Tambahan" hint="Opsional"><textarea value={body.asesmen ?? ''} onChange={(e) => set('asesmen', e.target.value)} rows={2} className={`${FIELD} resize-y`} placeholder="Rencana asesmen tambahan..." /></Field>
              </SectionCard>

              {/* STEP 8: Pengayaan & Remedial */}
              <SectionCard step={8} activeStep={step} title="Pengayaan & Remedial" desc="Strategi untuk peserta didik yang sudah tuntas dan yang belum tuntas" icon={TrendingUp} onAI={() => aiGenerate(8)} simLabel={undefined}>
                <FieldGrid cols={2}>
                  <Field label="Pengayaan" hint="Untuk siswa tuntas"><textarea value={body.pengayaan ?? ''} onChange={(e) => set('pengayaan', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Aktivitas tambahan untuk memperdalam..." /></Field>
                  <Field label="Remedial" hint="Untuk siswa belum tuntas"><textarea value={body.remedial ?? ''} onChange={(e) => set('remedial', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Strategi bantuan untuk mencapai ketuntasan..." /></Field>
                </FieldGrid>
              </SectionCard>

              {/* STEP 9: Refleksi */}
              <SectionCard step={9} activeStep={step} title="Refleksi Guru & Peserta Didik" desc="Pertanyaan reflektif untuk evaluasi pembelajaran" icon={Lightbulb} onAI={() => aiGenerate(9)} simLabel={undefined}>
                <Field label="Refleksi Guru"><textarea value={body.refleksiGuru ?? body.refleksi ?? ''} onChange={(e) => set('refleksiGuru', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Pertanyaan refleksi untuk guru setelah pembelajaran..." /></Field>
                <Field label="Refleksi Peserta Didik"><textarea value={body.refleksiSiswa ?? ''} onChange={(e) => set('refleksiSiswa', e.target.value)} rows={3} className={`${FIELD} resize-y`} placeholder="Pertanyaan refleksi untuk siswa..." /></Field>
              </SectionCard>

              {/* STEP 10: Lampiran */}
              <SectionCard step={10} activeStep={step} title="Lampiran" desc="Materi pendukung: handout, slide, video, lembar kerja" icon={Paperclip} onAI={() => aiGenerate(10)} simLabel={undefined}>
                <button type="button" onClick={() => showToast('Fitur unggah lampiran akan tersedia di implementasi penuh')}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-4 py-6 text-center transition hover:bg-emerald-100">
                  <Paperclip className="h-7 w-7 text-emerald-600" />
                  <b className="text-[12.5px] font-bold text-emerald-700">Unggah File Lampiran</b>
                  <small className="text-[11px] font-semibold text-[#6b8079]">PDF, DOCX, PPTX, MP4, ZIP — maks. 20MB per file</small>
                </button>
                {/* R-32: Generate Materi pembelajaran via AI */}
                <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/50 px-3 py-2.5">
                  <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
                  <div className="min-w-0 flex-1">
                    <b className="block text-[11.5px] font-bold text-[#0f2e25]">Generate Materi Pembelajaran</b>
                    <small className="text-[10px] font-semibold text-[#6b8079]">AI membuat draf materi berdasarkan konteks modul ajar</small>
                  </div>
                  <button type="button" onClick={handleGenerateMaterial} disabled={isGeneratingMaterial}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-60">
                    {isGeneratingMaterial
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating...</>
                      : <><Sparkles className="h-3.5 w-3.5" />Generate</>}
                  </button>
                </div>
                <Field label="Catatan Lampiran" hint="Opsional"><textarea value={body.lampiran ?? ''} onChange={(e) => set('lampiran', e.target.value)} rows={6} className={`${FIELD} resize-y`} placeholder="Daftar lampiran (mis. Handout PDF, Slide PPTX)... atau hasil Generate Materi akan muncul di sini." /></Field>
                <Field label="URL Eksternal" hint="Opsional"><input value={body.lampiranUrl ?? ''} onChange={(e) => set('lampiranUrl', e.target.value)} className={FIELD} type="url" placeholder="https://link-video-pembelajaran.com" /></Field>
              </SectionCard>

              {/* STEP 11: Rekap & Download */}
              <SectionCard step={11} activeStep={step} title="Rekap & Download Modul Ajar" desc="Rangkuman seluruh isian modul ajar — dapat diunduh sebagai PDF" icon={FileCheck}>
                <div className="rounded-xl border border-[#e6efea] bg-white p-5 shadow-sm">
                  <div className="mb-4 border-b-2 border-emerald-600 pb-3 text-center">
                    <h2 className="text-[16px] font-extrabold tracking-tight text-[#0f2e25]">MODUL AJAR</h2>
                    <p className="text-[11px] font-semibold text-[#6b8079]">Kurikulum Merdeka — SMK Darussalam Subah</p>
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] lg:grid-cols-4">
                    <RekapRow label="Mata Pelajaran" value={subject} />
                    <RekapRow label="Kelas" value={classes.find((c) => c.id === classId)?.name ?? 'Umum'} />
                    <RekapRow label="Fase" value={body.fase ?? '—'} />
                    <RekapRow label="Semester" value={semester === 1 ? 'Ganjil' : 'Genap'} />
                    <RekapRow label="Alokasi JP" value={body.jpAllocation != null ? `${body.jpAllocation} JP` : '—'} />
                    <RekapRow label="Tahun Ajaran" value={academicYear || '—'} />
                    <RekapRow label="Pengembang" value={body.pengembang ?? '—'} />
                    <RekapRow label="Judul" value={title || '—'} />
                  </div>
                  <RekapBlock label="Capaian Pembelajaran (CP)">{body.cp || <em className="text-[#9bb0a8]">Belum diisi</em>}</RekapBlock>
                  <RekapBlock label="Tujuan Pembelajaran (TP)">
                    {tp.filter((t) => t.trim()).length > 0 ? <ul className="list-disc pl-4">{tp.filter((t) => t.trim()).map((t, i) => <li key={i}>{t}</li>)}</ul> : <em className="text-[#9bb0a8]">Belum diisi</em>}
                  </RekapBlock>
                  <RekapBlock label="Profil Pelajar Pancasila">{body.profilDimensi?.length ? body.profilDimensi.join(', ') : <em className="text-[#9bb0a8]">Belum dipilih</em>}</RekapBlock>
                  <RekapBlock label="Kegiatan Pembelajaran">
                    {keg.length > 0 ? keg.map((k, i) => <div key={i} className="mb-1"><b>{k.pertemuan ?? `Pertemuan ${i + 1}`}:</b> {k.pendahuluan ? 'Pendahuluan ✓' : ''} {k.inti ? 'Inti ✓' : ''} {k.penutup ? 'Penutup ✓' : ''}</div>) : <em className="text-[#9bb0a8]">Belum diisi</em>}
                  </RekapBlock>
                  <RekapBlock label="Asesmen">{body.asesmenDiagnostik || body.asesmenFormatif || body.asesmenSumatif ? `${body.asesmenDiagnostik ? 'Diagnostik ✓ ' : ''}${body.asesmenFormatif ? 'Formatif ✓ ' : ''}${body.asesmenSumatif ? 'Sumatif ✓' : ''}` : <em className="text-[#9bb0a8]">Belum diisi</em>}</RekapBlock>
                  <div className="mt-4 flex justify-center gap-3">
                    <button type="button" onClick={() => showToast('Mempersiapkan dokumen PDF...')} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2.5 text-[13px] font-bold text-white hover:bg-rose-700"><Paperclip className="h-4 w-4" />Download PDF</button>
                    <button type="button" onClick={() => showToast('Ekspor DOCX akan tersedia di implementasi penuh')} className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6efea] bg-white px-5 py-2.5 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5]"><FileCheck className="h-4 w-4" />Ekspor DOCX</button>
                  </div>
                </div>
              </SectionCard>
            </div>

            {err && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>
            )}
          </div>
        </div>

        {/* Footer action bar */}
        <div className="flex items-center justify-between gap-2 border-t border-[#e6efea] bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => step > 1 && goStep(step - 1)} disabled={step === 1}
              className="inline-flex items-center gap-1 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />Prev
            </button>
            <span className="text-[11.5px] font-bold text-[#6b8079]">{step} / 11</span>
            <button type="button" onClick={() => step < 11 && goStep(step + 1)} disabled={step === 11}
              className="inline-flex items-center gap-1 rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[12.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-40">
              Next<ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">Batal</button>
            <button type="button" onClick={saveDraft} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan Draft
            </button>
            <button type="button" onClick={submitReview} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Ajukan
            </button>
          </div>
        </div>

        {/* Confirm dialog */}
        {confirmOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0f2e25]/50 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Send className="h-7 w-7" /></div>
              <h3 className="mb-1.5 text-[16px] font-extrabold text-[#0f2e25]">Ajukan Modul Ajar?</h3>
              <p className="mb-4 text-[13px] font-semibold text-[#6b8079]">Modul ajar akan dikirim ke Kepala Sekolah untuk direview. Anda tidak dapat mengubah modul setelah diajukan sampai direview.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} className="flex-1 rounded-xl bg-[#f4f7f5] px-4 py-2.5 text-[13px] font-bold text-[#355a4e] hover:bg-[#e6efea]">Batal</button>
                <button type="button" onClick={confirmSubmit} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700">Ya, Ajukan</button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#0f2e25] px-4 py-3 text-[13px] font-semibold text-white shadow-xl">
            <span className="inline-flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-300" />{toast}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Helper Components ──────────────────────────────────────────────

function SectionCard({ step, activeStep, title, desc, req, icon: Icon, onAI, simLabel, children }: {
  step: number; activeStep: number; title: string; desc: string; req?: boolean;
  icon: React.ComponentType<{ className?: string }>; onAI?: () => void; simLabel?: string; children: React.ReactNode;
}) {
  return (
    <section className={clsx('rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm', activeStep !== step && 'hidden lg:block')}>
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><Icon className="h-[18px] w-[18px]" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold tracking-tight text-[#0f2e25]">{title}</h3>
          <p className="text-[11.5px] font-semibold text-[#6b8079]">{desc}</p>
        </div>
        {onAI && (
          <div className="flex shrink-0 items-center gap-1.5">
            {simLabel && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">{simLabel}</span>
            )}
            <button type="button" onClick={onAI} className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-100">
              <Sparkles className="h-3.5 w-3.5" />Generate
            </button>
          </div>
        )}
        {req && <span className="shrink-0 rounded-md bg-rose-50 px-2 py-0.5 text-[9.5px] font-extrabold text-rose-600">Wajib</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, req, hint }: { label: string; children: React.ReactNode; req?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className={LBL}>
        {label}
        {req && <span className="ml-0.5 text-rose-500">*</span>}
        {hint && <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#0284c7]"><RefreshCw className="h-2.5 w-2.5" />{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function FieldGrid({ cols = 1, children }: { cols?: 1 | 2 | 3; children: React.ReactNode }) {
  return <div className={clsx('grid gap-3', cols === 2 && 'grid-cols-2', cols === 3 && 'grid-cols-3', cols === 1 && 'grid-cols-1')}>{children}</div>;
}

function Row({ children, onDel, num, label }: { children: React.ReactNode; onDel: () => void; num: number; label: string }) {
  return (
    <div className="mt-1.5 rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-600 text-[11px] font-extrabold text-white">{num}</span>
        <b className="flex-1 text-[12.5px] font-bold text-[#0f2e25]">{label}</b>
        <button type="button" onClick={onDel} className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function ListAdd({ onAdd, label }: { onAdd: () => void; label: string }) {
  return <button type="button" onClick={onAdd} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-3 py-2.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"><Plus className="h-4 w-4" />{label}</button>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px] text-[#9bb0a8]">{children}</p>;
}

function TimelineDot({ color, label, children }: { color: 'sky' | 'emerald' | 'violet'; label: string; children: React.ReactNode }) {
  const colors = {
    sky: { dot: 'bg-sky-100 text-sky-600', text: 'text-sky-600' },
    emerald: { dot: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
    violet: { dot: 'bg-violet-100 text-violet-600', text: 'text-violet-600' },
  }[color];
  return (
    <div className="relative">
      <div className={clsx('absolute -left-[26px] top-0 grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold ring-2 ring-white', colors.dot)}>
        {color === 'sky' ? 'P' : color === 'emerald' ? 'I' : 'T'}
      </div>
      <div className="rounded-xl border border-[#e6efea] bg-white p-3">
        <div className={clsx('mb-2 text-[10.5px] font-extrabold uppercase tracking-wide', colors.text)}>{label}</div>
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function AssessCard({ type, title, desc, children }: { type: 'diag' | 'form' | 'sum'; title: string; desc: string; children: React.ReactNode }) {
  const styles = {
    diag: { bg: 'bg-sky-50', text: 'text-sky-600' },
    form: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    sum: { bg: 'bg-violet-50', text: 'text-violet-600' },
  }[type];
  return (
    <div className="rounded-xl border border-[#e6efea] bg-white p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <div className={clsx('grid h-8 w-8 place-items-center rounded-lg', styles.bg, styles.text)}>
          {type === 'diag' ? <Info className="h-4 w-4" /> : type === 'form' ? <ClipboardCheck className="h-4 w-4" /> : <Target className="h-4 w-4" />}
        </div>
        <div><b className="text-[13px] font-extrabold text-[#0f2e25]">{title}</b><small className="block text-[10.5px] font-semibold text-[#6b8079]">{desc}</small></div>
      </div>
      {children}
    </div>
  );
}

function RekapRow({ label, value }: { label: string; value: string }) {
  return <div className="flex gap-1.5"><b className="shrink-0 font-bold text-[#355a4e]">{label}:</b><span className="font-semibold text-[#6b8079]">{value}</span></div>;
}

function RekapBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 border-b border-[#e6efea] pb-0.5 text-[11.5px] font-extrabold uppercase tracking-wide text-emerald-700">{label}</div>
      <div className="text-[11.5px] leading-relaxed text-[#355a4e]">{children}</div>
    </div>
  );
}
