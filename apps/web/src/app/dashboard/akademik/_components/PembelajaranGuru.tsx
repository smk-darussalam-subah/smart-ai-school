'use client';

// PembelajaranGuru — layar Pembelajaran Dashboard Guru (W1). Modul Ajar NYATA:
// daftar dari /rpp + buat/edit/ajukan/hapus (tersimpan, pipeline review Wakakur).
// Aturan backend dihormati: edit hanya draft/revision, hapus hanya draft.
// Editor konten LMS interaktif = placeholder jujur (backend LMS dibangun berikutnya).

import { useState, useTransition } from 'react';
import { FileText, Plus, Pencil, Send, Trash2, AlertTriangle, BookOpen, Loader2, Eye, EyeOff, Archive, Users, Activity, TrendingUp, GitBranch, ArrowRight, Maximize2 } from 'lucide-react';
import clsx from 'clsx';
import type { RppItem, LmsModuleItem } from './guru-types';
import { submitRpp, deleteRpp, setLmsModuleStatus, deleteLmsModule } from '../actions';
import ModulAjarForm from './ModulAjarForm';
import ModulLmsForm from './ModulLmsForm';
import LmsMonitorModal from './LmsMonitorModal';
import LmsPreviewModal from './LmsPreviewModal';
import LmsPreviewScreen from './LmsPreviewScreen';

interface Props {
  rpp: RppItem[];
  lmsModules: LmsModuleItem[];
  subjects: string[];
  classes: { id: string; name: string }[];
  academicYear: string;
  semester: number;
}

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  submitted: 'bg-sky-50 text-sky-700',
  revision: 'bg-amber-50 text-amber-700',
  draft: 'bg-slate-100 text-slate-600',
};
const STATUS_LABEL: Record<string, string> = {
  approved: 'Disetujui', submitted: 'Diajukan', revision: 'Revisi', draft: 'Draft',
};
const EDITABLE = new Set(['draft', 'revision']);

const LMS_BADGE: Record<string, string> = {
  published: 'bg-emerald-50 text-emerald-700', draft: 'bg-slate-100 text-slate-600', archived: 'bg-zinc-100 text-zinc-500',
};
const LMS_LABEL: Record<string, string> = { published: 'Terbit', draft: 'Draft', archived: 'Arsip' };

// SIMULASI: Progres ketercapaian per mapel (backend /cp-progress belum tersedia)
const MAPEL_PROG = [
  { mapel: 'Pemrograman Web', progres: 64, tp: '5/8 TP' },
  { mapel: 'Basis Data', progres: 48, tp: '3/7 TP' },
  { mapel: 'PBO', progres: 72, tp: '6/9 TP' },
];

// SIMULASI: Ketercapaian per CP (Capaian Pembelajaran)
const CP_DATA = [
  { cp: 'CP 1', desc: 'Antarmuka web fungsional', progres: 88 },
  { cp: 'CP 2', desc: 'Layout responsif', progres: 74 },
  { cp: 'CP 3', desc: 'Form & validasi', progres: 35 },
  { cp: 'CP 4', desc: 'Interaktivitas dasar', progres: 0 },
];

export default function PembelajaranGuru({ rpp, lmsModules, subjects, classes, academicYear, semester }: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RppItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [lmsFormOpen, setLmsFormOpen] = useState(false);
  const [lmsEditing, setLmsEditing] = useState<LmsModuleItem | null>(null);
  const [monitorM, setMonitorM] = useState<LmsModuleItem | null>(null);
  const [previewM, setPreviewM] = useState<LmsModuleItem | null>(null);
  const [previewScreenM, setPreviewScreenM] = useState<LmsModuleItem | null>(null);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: RppItem) => { setEditing(r); setFormOpen(true); };

  const openLmsCreate = () => { setLmsEditing(null); setLmsFormOpen(true); };
  const openLmsEdit = (m: LmsModuleItem) => { setLmsEditing(m); setLmsFormOpen(true); };

  const lmsAction = (id: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
    setErr(null); setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      setBusyId(null);
      if (!res.success) setErr(res.error ?? 'Aksi Modul LMS gagal.');
    });
  };
  const doLmsStatus = (m: LmsModuleItem, action: 'publish' | 'unpublish' | 'archive') => {
    if (action === 'publish' && !window.confirm(`Publikasikan modul "${m.title}" ke siswa kelas terkait?`)) return;
    if (action === 'archive' && !window.confirm(`Arsipkan modul "${m.title}"? Modul tak lagi tampil aktif bagi siswa.`)) return;
    lmsAction(m.id, () => setLmsModuleStatus(m.id, action));
  };
  const doLmsDelete = (m: LmsModuleItem) => {
    if (!window.confirm(`Hapus Modul LMS "${m.title}"? Progres siswa untuk modul ini ikut terhapus.`)) return;
    lmsAction(m.id, () => deleteLmsModule(m.id));
  };

  const doSubmit = (r: RppItem) => {
    if (!window.confirm(`Ajukan Modul Ajar "${r.title}" ke Wakakur untuk direview? Modul tak bisa diedit selama menunggu review.`)) return;
    setErr(null); setBusyId(r.id);
    startTransition(async () => {
      const res = await submitRpp(r.id);
      setBusyId(null);
      if (!res.success) setErr(res.error ?? 'Gagal mengajukan Modul Ajar.');
    });
  };

  const doDelete = (r: RppItem) => {
    if (!window.confirm(`Hapus Modul Ajar "${r.title}"? Tindakan ini tak bisa dibatalkan.`)) return;
    setErr(null); setBusyId(r.id);
    startTransition(async () => {
      const res = await deleteRpp(r.id);
      setBusyId(null);
      if (!res.success) setErr(res.error ?? 'Gagal menghapus Modul Ajar.');
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <FileText className="h-[18px] w-[18px] text-emerald-600" />Modul Ajar{subjects.length > 0 && <span className="text-[#6b8079]"> — {subjects[0]}</span>}
          </h3>
          <button type="button" onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />Buat Modul Ajar
          </button>
        </div>

        {/* CP→TP→ATP flow bar */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11.5px] font-bold text-emerald-800">
          <GitBranch className="h-3.5 w-3.5 text-emerald-600" /> Alur Kurikulum Merdeka:
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">CP</span>
          <ArrowRight className="h-3 w-3 text-emerald-500" />
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">TP</span>
          <ArrowRight className="h-3 w-3 text-emerald-500" />
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">ATP</span>
          <ArrowRight className="h-3 w-3 text-emerald-500" />
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">Modul Ajar</span>
          <ArrowRight className="h-3 w-3 text-emerald-500" />
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">LMS</span>
          <ArrowRight className="h-3 w-3 text-emerald-500" />
          <span className="rounded-lg border border-emerald-200 bg-white px-2 py-0.5">Rapor</span>
        </div>

        {err && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />{err}
          </div>
        )}

        {rpp.length === 0 ? (
          <div className="mt-3 grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ada Modul Ajar. Klik <b className="mx-1">Buat Modul Ajar</b> untuk memulai.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Judul / TP</th>
                  <th className="py-2 pr-3">Mapel</th>
                  <th className="py-2 pr-3">Kelas</th>
                  <th className="py-2 pr-3 text-center">JP</th>
                  <th className="py-2 pr-3 text-center">KKTP</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rpp.map((r) => {
                  const editable = EDITABLE.has(r.status);
                  const rowBusy = pending && busyId === r.id;
                  return (
                    <tr key={r.id} className="border-b border-[#f0f4f2] align-top">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#0f2e25]">{r.title}</div>
                        {r.status === 'revision' && r.reviewNote && (
                          <div className="mt-1 flex items-start gap-1 text-[11px] font-medium text-amber-700">
                            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />Revisi: {r.reviewNote}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-[#355a4e]">{r.subject}</td>
                      <td className="py-2.5 pr-3 text-[#355a4e]">{r.class?.name ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-center text-[#355a4e]">{r.body?.jpAllocation ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-center text-[#355a4e]">{r.body?.kktp ?? '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold', STATUS_BADGE[r.status] ?? 'bg-slate-100 text-slate-600')}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {editable && (
                            <button type="button" onClick={() => openEdit(r)} disabled={rowBusy} title="Edit"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1.5 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">
                              <Pencil className="h-3.5 w-3.5" />Edit
                            </button>
                          )}
                          {editable && (
                            <button type="button" onClick={() => doSubmit(r)} disabled={rowBusy} title="Ajukan ke Wakakur"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                              {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Ajukan
                            </button>
                          )}
                          {r.status === 'draft' && (
                            <button type="button" onClick={() => doDelete(r)} disabled={rowBusy} title="Hapus"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11.5px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!editable && r.status !== 'draft' && (
                            <span className="text-[11px] text-[#9bb0a8]">{r.status === 'submitted' ? 'Menunggu review' : '—'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modul LMS — materi belajar siswa (NYATA via /lms/modules) */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
            <BookOpen className="h-[18px] w-[18px] text-emerald-600" />Modul LMS
            <span className="text-[11px] font-medium text-[#9bb0a8]">materi belajar siswa</span>
          </h3>
          <button type="button" onClick={openLmsCreate}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12.5px] font-bold text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" />Buat Modul LMS
          </button>
        </div>

        {lmsModules.length === 0 ? (
          <div className="mt-3 grid h-24 place-items-center rounded-xl bg-[#f4f7f5] text-[12.5px] font-medium text-[#9bb0a8]">
            Belum ada Modul LMS. Buat materi lalu <b className="mx-1">publikasikan</b> agar terlihat siswa.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-[#e6efea] text-left text-[11px] uppercase tracking-wide text-[#6b8079]">
                  <th className="py-2 pr-3">Modul</th>
                  <th className="py-2 pr-3">Mapel</th>
                  <th className="py-2 pr-3">Kelas</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-center">Siswa</th>
                  <th className="py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {lmsModules.map((m) => {
                  const rowBusy = pending && busyId === m.id;
                  return (
                    <tr key={m.id} className="border-b border-[#f0f4f2]">
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-[#0f2e25]">{m.title}</div>
                        <div className="text-[11px] text-[#9bb0a8]">{m.tp ? `${m.tp} · ` : ''}{m.jpAllocation ? `${m.jpAllocation} JP · ` : ''}KKTP {m.kktp}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-[#355a4e]">{m.subject}</td>
                      <td className="py-2.5 pr-3 text-[#355a4e]">{m.class?.name ?? 'Umum'}</td>
                      <td className="py-2.5 pr-3">
                        <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold', LMS_BADGE[m.status] ?? 'bg-slate-100 text-slate-600')}>
                          {LMS_LABEL[m.status] ?? m.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-center text-[#355a4e]">
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-[#9bb0a8]" />{m._count?.progress ?? 0}</span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => setPreviewM(m)} disabled={rowBusy} title="Pratinjau (tampilan siswa)"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1.5 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">
                            <BookOpen className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setPreviewScreenM(m)} disabled={rowBusy} title="Pratinjau Lengkap (progress matrix)"
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                            <Maximize2 className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setMonitorM(m)} disabled={rowBusy} title="Monitor progres siswa"
                            className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11.5px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
                            <Activity className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => openLmsEdit(m)} disabled={rowBusy} title="Edit"
                            className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1.5 text-[11.5px] font-bold text-[#355a4e] hover:bg-[#f4f7f5] disabled:opacity-50">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {m.status === 'published' ? (
                            <button type="button" onClick={() => doLmsStatus(m, 'unpublish')} disabled={rowBusy} title="Tarik dari siswa"
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11.5px] font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                              {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <button type="button" onClick={() => doLmsStatus(m, 'publish')} disabled={rowBusy} title="Publikasikan ke siswa"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11.5px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                              {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Publikasi
                            </button>
                          )}
                          {m.status !== 'archived' && (
                            <button type="button" onClick={() => doLmsStatus(m, 'archive')} disabled={rowBusy} title="Arsipkan"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#e6efea] bg-white px-2 py-1.5 text-[11.5px] font-bold text-[#6b8079] hover:bg-[#f4f7f5] disabled:opacity-50">
                              <Archive className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button type="button" onClick={() => doLmsDelete(m)} disabled={rowBusy} title="Hapus"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11.5px] font-bold text-rose-600 hover:bg-rose-100 disabled:opacity-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-[#6b8079]">
          Modul yang <b>Terbit</b> tampil di LMS siswa kelas terkait; progres belajar terlacak otomatis. Kuis diagnostik &amp; bank soal menyusul.
        </p>
      </div>

      {/* Progres Ketercapaian — SIMULASI */}
      <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
        <h3 className="mb-1 flex items-center gap-2 text-[15px] font-bold text-[#0f2e25]">
          <TrendingUp className="h-[18px] w-[18px] text-emerald-600" />Progres Ketercapaian
        </h3>
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">
          <AlertTriangle className="h-3 w-3" /> SIMULASI — backend /cp-progress belum tersedia
        </div>

        {/* Per Mapel */}
        <div className="space-y-2.5">
          {MAPEL_PROG.map((m) => (
            <div key={m.mapel} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[12px] font-semibold text-[#0f2e25]">{m.mapel}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f0f4f2]">
                <div className={`h-full rounded-full ${m.progres >= 60 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${m.progres}%` }} />
              </div>
              <span className="w-10 text-right text-[12px] font-extrabold text-[#0f2e25]">{m.progres}%</span>
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${m.progres >= 60 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{m.tp}</span>
            </div>
          ))}
        </div>

        {/* CP Grid */}
        <div className="mb-2 mt-4 text-[12px] font-extrabold text-[#355a4e]">Ketercapaian per CP</div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CP_DATA.map((c) => (
            <div key={c.cp} className="rounded-xl border border-[#e6efea] bg-[#f9fbfa] p-3">
              <b className="text-[11px] text-[#0f2e25]">{c.cp}</b>
              <div className="text-[10px] text-[#9bb0a8]">{c.desc}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0f4f2]">
                <div className={`h-full rounded-full ${c.progres >= 75 ? 'bg-emerald-500' : c.progres > 0 ? 'bg-amber-400' : 'bg-slate-200'}`} style={{ width: `${c.progres}%` }} />
              </div>
              <small className={`mt-1 block text-[10px] font-bold ${c.progres >= 75 ? 'text-emerald-700' : 'text-amber-600'}`}>
                {c.progres > 0 ? `${c.progres}%` : 'belum mulai'}
              </small>
            </div>
          ))}
        </div>
      </div>

      {formOpen && (
        <ModulAjarForm
          key={editing?.id ?? 'new'}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          subjects={subjects}
          classes={classes}
          academicYear={academicYear}
          semester={semester}
          editing={editing}
        />
      )}
      {lmsFormOpen && (
        <ModulLmsForm
          key={lmsEditing?.id ?? 'new-lms'}
          open={lmsFormOpen}
          onClose={() => setLmsFormOpen(false)}
          subjects={subjects}
          classes={classes}
          academicYear={academicYear}
          semester={semester}
          editing={lmsEditing}
        />
      )}
      {monitorM && <LmsMonitorModal module={monitorM} onClose={() => setMonitorM(null)} />}
      {previewM && <LmsPreviewModal module={previewM} onClose={() => setPreviewM(null)} />}
      {previewScreenM && <LmsPreviewScreen module={previewScreenM} onClose={() => setPreviewScreenM(null)} />}
    </div>
  );
}
