'use client';

// ModulAjarForm — Modul Ajar Kurikulum Merdeka LENGKAP (sesuai mockup yg disetujui,
// tanpa reduksi). Bentuk ber-section + list dinamis (lebih cepat diisi dari wizard
// 11-langkah kaku, semua field tetap ada). Data terstruktur → Rpp.body (JSON);
// identitas (mapel/kelas/judul) tetap di kolom top-level. Tersimpan via /rpp.

import { useState, useTransition } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Save, Send, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import type { RppItem, ModulAjarBody, AtpItem, KegiatanItem } from './guru-types';
import { createRpp, updateRpp, submitRpp } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
  editing: RppItem | null;
}

const FIELD = 'w-full rounded-xl border border-[#e6efea] bg-white px-3 py-2 text-[13px] text-[#0f2e25] outline-none focus:border-emerald-400';
const LBL = 'mb-1 block text-[11px] font-bold uppercase tracking-wide text-[#6b8079]';

const DIMENSI = [
  'Beriman & Berakhlak Mulia', 'Berkebinekaan Global', 'Bergotong Royong',
  'Mandiri', 'Bernalar Kritis', 'Kreatif',
];

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export default function ModulAjarForm({ open, onClose, subjects, classes, academicYear, semester, editing }: Props) {
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [classId, setClassId] = useState(editing?.classId ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState<ModulAjarBody>(editing?.body ?? {});
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ModulAjarBody>(k: K, v: ModulAjarBody[K]) => setBody((b) => ({ ...b, [k]: v }));
  const toggleDimensi = (d: string) => {
    const cur = body.profilDimensi ?? [];
    set('profilDimensi', cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  };

  // List TP (string[])
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

  const save = (submitNow: boolean) => {
    setErr(null);
    if (!subject) return setErr('Pilih mapel terlebih dahulu.');
    if (title.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (!academicYear) return setErr('Tahun ajaran aktif belum tersedia — hubungi admin.');

    // Bersihkan body: buang string kosong & item list kosong.
    const cleanTp = tp.map((x) => x.trim()).filter(Boolean);
    const cleanAtp = atp.filter((x) => (x.tpRef ?? '').trim() || (x.indikator ?? '').trim());
    const cleanKeg = keg.filter((x) => (x.pertemuan ?? '').trim() || (x.deskripsi ?? '').trim());
    const cleaned: ModulAjarBody = {
      ...body,
      tp: cleanTp.length ? cleanTp : undefined,
      atp: cleanAtp.length ? cleanAtp : undefined,
      kegiatan: cleanKeg.length ? cleanKeg : undefined,
      profilDimensi: body.profilDimensi?.length ? body.profilDimensi : undefined,
    };
    const hasBody = Object.values(cleaned).some((v) => (Array.isArray(v) ? v.length : v != null && String(v).trim() !== ''));
    if (!hasBody) return setErr('Isi minimal satu bagian Modul Ajar (mis. CP/TP atau Kegiatan).');

    // Ringkasan teks (utk review KS & daftar) dari bagian kunci.
    const content = [
      cleaned.cp ? `CP: ${cleaned.cp}` : '',
      cleanTp.length ? `TP: ${cleanTp.join(' · ')}` : '',
      cleaned.asesmen ? `Asesmen: ${cleaned.asesmen}` : '',
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

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && !pending && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Modul Ajar' : 'Buat Modul Ajar'}</DialogTitle>
          <DialogDescription>
            Kurikulum Merdeka · TA {academicYear || '—'} · Semester {semester}. Isi bertahap; simpan draft kapan saja.
          </DialogDescription>
        </DialogHeader>

        {editing?.status === 'revision' && editing.reviewNote && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span><b>Catatan revisi:</b> {editing.reviewNote}</span>
          </div>
        )}

        <div className="space-y-5">
          {/* 1. Identitas */}
          <Section title="1. Identitas Modul Ajar">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mapel"><select value={subject} onChange={(e) => setSubject(e.target.value)} className={FIELD}><option value="">— pilih —</option>{subjects.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
              <Field label="Kelas (opsional)"><select value={classId} onChange={(e) => setClassId(e.target.value)} className={FIELD}><option value="">— umum —</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            </div>
            <Field label="Judul Modul Ajar"><input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD} placeholder="cth: Flexbox & Desain Responsif" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fase"><input value={body.fase ?? ''} onChange={(e) => set('fase', e.target.value)} className={FIELD} placeholder="E / F" /></Field>
              <Field label="Pengembang Modul"><input value={body.pengembang ?? ''} onChange={(e) => set('pengembang', e.target.value)} className={FIELD} placeholder="Nama guru" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Alokasi JP"><input value={body.jpAllocation != null ? String(body.jpAllocation) : ''} onChange={(e) => set('jpAllocation', num(e.target.value))} className={FIELD} inputMode="numeric" placeholder="4" /></Field>
              <Field label="KKTP"><input value={body.kktp != null ? String(body.kktp) : ''} onChange={(e) => set('kktp', num(e.target.value))} className={FIELD} inputMode="numeric" placeholder="75" /></Field>
            </div>
          </Section>

          {/* 2. CP & TP */}
          <Section title="2. Capaian & Tujuan Pembelajaran">
            <Field label="Capaian Pembelajaran (CP)"><textarea value={body.cp ?? ''} onChange={(e) => set('cp', e.target.value)} rows={3} className={`${FIELD} resize-y`} /></Field>
            <Field label="Kompetensi Awal"><textarea value={body.kompetensiAwal ?? ''} onChange={(e) => set('kompetensiAwal', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
            <Field label="Tujuan Pembelajaran (TP)">
              <ListAdd onAdd={addTp} label="Tambah TP" />
              {tp.length === 0 && <Empty>Belum ada TP.</Empty>}
              {tp.map((t, i) => (
                <Row key={i} onDel={() => delTp(i)}><input value={t} onChange={(e) => setTp(i, e.target.value)} className={FIELD} placeholder={`TP ${i + 1}`} /></Row>
              ))}
            </Field>
          </Section>

          {/* 3. ATP */}
          <Section title="3. Alur Tujuan Pembelajaran (ATP)">
            <Field label="Uraian Alur"><textarea value={body.atpUraian ?? ''} onChange={(e) => set('atpUraian', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
            <Field label="Indikator per TP">
              <ListAdd onAdd={addAtp} label="Tambah baris" />
              {atp.map((a, i) => (
                <Row key={i} onDel={() => delAtp(i)}>
                  <input value={a.tpRef ?? ''} onChange={(e) => setAtp(i, { tpRef: e.target.value })} className={`${FIELD} w-1/3`} placeholder="TP referensi" />
                  <input value={a.indikator ?? ''} onChange={(e) => setAtp(i, { indikator: e.target.value })} className={FIELD} placeholder="Indikator ketercapaian" />
                </Row>
              ))}
            </Field>
          </Section>

          {/* 4. Profil Pelajar Pancasila */}
          <Section title="4. Profil Pelajar Pancasila">
            <div className="flex flex-wrap gap-2">
              {DIMENSI.map((d) => {
                const on = (body.profilDimensi ?? []).includes(d);
                return (
                  <button type="button" key={d} onClick={() => toggleDimensi(d)}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${on ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-[#e6efea] bg-white text-[#355a4e]'}`}>{d}</button>
                );
              })}
            </div>
            <Field label="Uraian Aktivitas Profil Pelajar"><textarea value={body.profilUraian ?? ''} onChange={(e) => set('profilUraian', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
          </Section>

          {/* 5. Sarana & Target */}
          <Section title="5. Sarana Prasarana & Target Peserta Didik">
            <Field label="Sarana & Prasarana"><textarea value={body.sarana ?? ''} onChange={(e) => set('sarana', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target Peserta Didik"><input value={body.target ?? ''} onChange={(e) => set('target', e.target.value)} className={FIELD} placeholder="Reguler / dst" /></Field>
              <Field label="Model Pembelajaran"><input value={body.model ?? ''} onChange={(e) => set('model', e.target.value)} className={FIELD} placeholder="PBL / PjBL / dst" /></Field>
            </div>
          </Section>

          {/* 6. Kegiatan */}
          <Section title="6. Kegiatan Pembelajaran">
            <ListAdd onAdd={addKeg} label="Tambah pertemuan" />
            {keg.length === 0 && <Empty>Belum ada pertemuan.</Empty>}
            {keg.map((k, i) => (
              <div key={i} className="rounded-xl border border-[#e6efea] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <input value={k.pertemuan ?? ''} onChange={(e) => setKeg(i, { pertemuan: e.target.value })} className={`${FIELD} max-w-xs`} placeholder={`Pertemuan ${i + 1}`} />
                  <button type="button" onClick={() => delKeg(i)} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <textarea value={k.deskripsi ?? ''} onChange={(e) => setKeg(i, { deskripsi: e.target.value })} rows={3} className={`${FIELD} resize-y`} placeholder="Pendahuluan, inti, penutup, pertanyaan pemantik…" />
              </div>
            ))}
          </Section>

          {/* 7. Asesmen */}
          <Section title="7. Asesmen">
            <Field label="Rencana Asesmen (diagnostik/formatif/sumatif)"><textarea value={body.asesmen ?? ''} onChange={(e) => set('asesmen', e.target.value)} rows={3} className={`${FIELD} resize-y`} /></Field>
          </Section>

          {/* 8. Pengayaan & Remedial */}
          <Section title="8. Pengayaan & Remedial">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pengayaan"><textarea value={body.pengayaan ?? ''} onChange={(e) => set('pengayaan', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
              <Field label="Remedial"><textarea value={body.remedial ?? ''} onChange={(e) => set('remedial', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
            </div>
          </Section>

          {/* 9. Refleksi & Lampiran */}
          <Section title="9. Refleksi & Lampiran">
            <Field label="Refleksi"><textarea value={body.refleksi ?? ''} onChange={(e) => set('refleksi', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
            <Field label="Lampiran (LKPD, glosarium, daftar pustaka)"><textarea value={body.lampiran ?? ''} onChange={(e) => set('lampiran', e.target.value)} rows={2} className={`${FIELD} resize-y`} /></Field>
          </Section>

          {err && (
            <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600"><AlertTriangle className="h-4 w-4 shrink-0" />{err}</div>
          )}
        </div>

        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-end gap-2 border-t border-[#e6efea] bg-white px-6 py-3">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-xl border border-[#e6efea] bg-white px-4 py-2 text-[13px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">Batal</button>
          <button type="button" onClick={() => save(false)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Simpan Draft</button>
          <button type="button" onClick={() => save(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Simpan &amp; Ajukan</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="border-b border-[#e6efea] pb-1.5 text-[13px] font-extrabold text-[#0f2e25]">{title}</h3>
      {children}
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className={LBL}>{label}</span>{children}</label>;
}
function Row({ children, onDel }: { children: React.ReactNode; onDel: () => void }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex flex-1 gap-2">{children}</div>
      <button type="button" onClick={onDel} className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );
}
function ListAdd({ onAdd, label }: { onAdd: () => void; label: string }) {
  return <button type="button" onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700 hover:bg-emerald-100"><Plus className="h-3.5 w-3.5" />{label}</button>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[12px] text-[#9bb0a8]">{children}</p>;
}
