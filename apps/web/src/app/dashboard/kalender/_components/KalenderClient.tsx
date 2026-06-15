'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { CalendarDays, CalendarPlus, Pencil, Trash2, X, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import MonthCalendar from '../../_components/MonthCalendar';
import { EVENT_META, MONTH_NAMES, ymd, type KaldikEvent } from '@/lib/kiosk';
import {
  createCalendarEventAction, updateCalendarEventAction, deleteCalendarEventAction,
} from '../actions';
import type { CalendarEvent } from '../page';

const TYPE_OPTIONS: { value: KaldikEvent['type']; label: string }[] = [
  { value: 'exam', label: 'Ujian' },
  { value: 'event', label: 'Acara' },
  { value: 'holiday', label: 'Libur' },
  { value: 'break', label: 'Jeda' },
];

interface Props {
  events: CalendarEvent[];
  academicYear: { id: string; code: string } | null;
}

function toKaldik(e: CalendarEvent): KaldikEvent {
  return { id: e.id, name: e.name, date: e.startDate.slice(0, 10), endDate: e.endDate.slice(0, 10), type: e.type };
}

export default function KalenderClient({ events, academicYear }: Props) {
  const router = useRouter();
  const today = new Date();
  const [cal, setCal] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // form dialog
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<KaldikEvent['type']>('event');
  const [startDate, setStartDate] = useState(ymd(today));
  const [endDate, setEndDate] = useState(ymd(today));
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const kaldik = useMemo(() => events.map(toKaldik), [events]);
  const sorted = useMemo(() => [...events].sort((a, b) => a.startDate.localeCompare(b.startDate)), [events]);

  const openNew = () => {
    setEditId(null); setName(''); setType('event');
    setStartDate(ymd(today)); setEndDate(ymd(today)); setDescription(''); setErr(''); setOpen(true);
  };
  const openEdit = (e: CalendarEvent) => {
    setEditId(e.id); setName(e.name); setType(e.type);
    setStartDate(e.startDate.slice(0, 10)); setEndDate(e.endDate.slice(0, 10)); setDescription(e.description ?? ''); setErr(''); setOpen(true);
  };

  const submit = async () => {
    setErr('');
    if (!academicYear) { setErr('Belum ada tahun ajaran aktif.'); return; }
    if (!name.trim()) { setErr('Nama agenda wajib diisi.'); return; }
    if (endDate < startDate) { setErr('Tanggal selesai tidak boleh sebelum tanggal mulai.'); return; }
    setBusy(true);
    const body = { academicYearId: academicYear.id, name: name.trim(), startDate, endDate, type, description: description.trim() || null };
    const res = editId ? await updateCalendarEventAction(editId, body) : await createCalendarEventAction(body);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOpen(false); setMsg(editId ? 'Agenda diperbarui.' : 'Agenda ditambahkan.'); router.refresh();
  };

  const remove = async (e: CalendarEvent) => {
    if (!confirm(`Hapus agenda "${e.name}"?`)) return;
    setMsg(''); setErr('');
    const res = await deleteCalendarEventAction(e.id);
    if (res.error) { setMsg(`Gagal: ${res.error}`); return; }
    setMsg('Agenda dihapus.'); router.refresh();
  };

  const fmtRange = (e: CalendarEvent) => {
    const s = new Date(e.startDate); const en = new Date(e.endDate);
    const m3 = (d: Date) => (MONTH_NAMES[d.getMonth()] ?? '').slice(0, 3);
    if (e.startDate.slice(0, 10) === e.endDate.slice(0, 10)) return `${s.getDate()} ${m3(s)} ${s.getFullYear()}`;
    return `${s.getDate()} ${m3(s)} – ${en.getDate()} ${m3(en)} ${en.getFullYear()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><CalendarDays className="h-5 w-5" /></span>
            Kalender & Agenda Sekolah
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kelola agenda, ujian, dan hari libur (kaldik). Tampil otomatis di Beranda. Hari libur tidak dihitung sebagai hari aktif.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">T.A. {academicYear?.code ?? '—'}</span>
          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={!academicYear} onClick={openNew}><CalendarPlus className="h-4 w-4" /> Tambah Agenda</Button>
        </div>
      </div>

      {msg && <div className={clsx('rounded-lg px-4 py-2 text-sm', msg.startsWith('Gagal') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <MonthCalendar year={cal.y} month0={cal.m} onNav={(d) => setCal((c) => { const x = new Date(c.y, c.m + d, 1); return { y: x.getFullYear(), m: x.getMonth() }; })} onJump={(y, m0) => setCal({ y, m: m0 })} events={kaldik} todayStr={ymd(today)} accent="#059669" />
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-gray-500">
            {(['exam', 'event', 'holiday', 'break'] as const).map((t) => (
              <span key={t} className="flex items-center gap-1"><i className="w-2 h-2 rounded-full inline-block" style={{ background: EVENT_META[t].dot }} />{EVENT_META[t].label}</span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3.5 border-b border-gray-100"><h2 className="font-semibold text-gray-800 text-sm">Daftar Agenda — T.A. {academicYear?.code ?? '—'}</h2></div>
          {sorted.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-400">Belum ada agenda. Klik “Tambah Agenda”.</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {sorted.map((e) => {
                const meta = EVENT_META[e.type];
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="shrink-0 w-1.5 h-9 rounded-full" style={{ background: meta.dot }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 flex items-center gap-2 flex-wrap">{e.name}
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: meta.soft, color: meta.text }}>{meta.label}</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtRange(e)}{e.description ? ` · ${e.description}` : ''}</p>
                    </div>
                    <button onClick={() => openEdit(e)} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-emerald-700" title="Edit"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => remove(e)} className="w-8 h-8 grid place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600" title="Hapus"><Trash2 className="w-4 h-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit Agenda' : 'Tambah Agenda'}</DialogTitle></DialogHeader>
          {err && <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><X className="mt-0.5 h-4 w-4 shrink-0" /> {err}</div>}
          <div className="space-y-4">
            <div>
              <Label>Nama Agenda *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: Penilaian Akhir Semester (PAS)" />
            </div>
            <div>
              <Label>Jenis *</Label>
              <Select value={type} onValueChange={(v: string) => setType(v as KaldikEvent['type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tanggal Mulai *</Label><Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }} /></div>
              <div><Label>Tanggal Selesai *</Label><Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>
            <div><Label>Keterangan</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="opsional" rows={2} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Batal</Button>
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={submit}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</> : <><Save className="h-4 w-4" /> Simpan</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
