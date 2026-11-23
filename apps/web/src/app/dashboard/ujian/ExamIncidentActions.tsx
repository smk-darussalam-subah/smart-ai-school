'use client';

import { useState, type FormEvent } from 'react';

type Person = { studentId: string; student: { user: { fullName: string } } };
type Incident = { id: string; kind: string; reason: string; decision: string | null; resolvedAt: string | null };
type Decision = 'resume' | 'extra_time' | 'makeup' | 'transfer';

const decisions: Record<Decision, string> = {
  resume: 'Lanjutkan dengan waktu yang tersisa',
  extra_time: 'Tambahkan waktu',
  makeup: 'Rekomendasikan ujian susulan',
  transfer: 'Pindahkan perangkat',
};
const field = 'min-h-11 w-full rounded-lg border border-[var(--staff-line,#cbd5e1)] bg-[var(--staff-panel,#fff)] px-3 py-2 text-sm';
const action = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

export function ExamIncidentActions({ canReport, canDecide, allowRoomReport = true, incidents, participants, save }: {
  allowRoomReport?: boolean;
  canReport: boolean;
  canDecide: boolean;
  incidents: Incident[];
  participants: Person[];
  save: (path: string, payload: object) => Promise<void>;
}) {
  const [mode, setMode] = useState<'report' | Incident | null>(null);
  const [kind, setKind] = useState('device');
  const [reason, setReason] = useState('');
  const [choice, setChoice] = useState<Decision>('resume');
  const [ids, setIds] = useState<string[]>([]);
  const [minutes, setMinutes] = useState('');
  const [device, setDevice] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function open(next: typeof mode) {
    setMode(next); setReason(''); setKind('device'); setChoice('resume');
    setIds([]); setMinutes(''); setDevice(''); setError(''); setNotice('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode || busy || (mode === 'report' ? !canReport : !canDecide)) return;
    if (reason.trim().length < 8 || (mode !== 'report' && (!ids.length || (choice === 'transfer' && ids.length !== 1)))) {
      setError('Isi alasan dan pilih peserta sesuai keputusan.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'report') await save('/incidents', { kind, reason });
      else {
        await save(`/incidents/${mode.id}/decision`, {
          decision: choice, reason, studentIds: ids,
          ...(choice === 'extra_time' ? { extraMinutes: Number(minutes) } : {}),
          ...(choice === 'transfer' ? { newDeviceId: device.trim() } : {}),
        });
      }
      open(null);
      setNotice('Catatan tersimpan.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catatan belum dapat disimpan.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3">
    <h3 className="font-bold">Catatan insiden</h3>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!incidents.length && <p className="text-sm text-[var(--staff-muted,#475569)]">Belum ada catatan insiden.</p>}
    {incidents.map((incident) => <div key={incident.id} className="rounded-lg border border-[var(--staff-line,#cbd5e1)] p-3 text-sm">
      <p>{incident.reason}</p>
      <p className="text-[var(--staff-muted,#475569)]">{incident.decision
        ? decisions[incident.decision as Decision] ?? 'Sudah diputuskan' : 'Menunggu keputusan'}</p>
      {canDecide && !incident.resolvedAt && <button type="button" className={field}
        disabled={busy} onClick={() => open(incident)}>Tentukan tindak lanjut</button>}
    </div>)}
    {canReport && !mode && <button type="button" className={action} onClick={() => open('report')}>Catat insiden</button>}
    {mode && <form onSubmit={(event) => void submit(event)} className="space-y-3 rounded-lg border border-[var(--staff-line,#cbd5e1)] p-3">
      {mode === 'report' ? <label className="block text-sm font-semibold">Cakupan gangguan
        <select className={field} value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="device">Perangkat atau siswa</option>
          {allowRoomReport && <option value="room">Satu ruang</option>}
          {canDecide && <option value="school">Sekolah</option>}
        </select>
      </label> : <>
        <label className="block text-sm font-semibold">Tindak lanjut
          <select className={field} value={choice} onChange={(event) => {
            setChoice(event.target.value as Decision); setIds([]); setError('');
          }}>{Object.entries(decisions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Peserta terdampak</legend>
          <div className="max-h-44 overflow-y-auto">
            {participants.map((person) => <label key={person.studentId} className="flex min-h-10 items-center gap-2 text-sm">
              <input type={choice === 'transfer' ? 'radio' : 'checkbox'} name="affected-participant" checked={ids.includes(person.studentId)}
                onChange={(event) => setIds(choice === 'transfer' ? [person.studentId] :
                  event.target.checked ? [...ids, person.studentId] : ids.filter((id) => id !== person.studentId))} />
              {person.student.user.fullName}
            </label>)}
          </div>
        </fieldset>
        {choice === 'extra_time' && <label className="block text-sm font-semibold">Tambahan menit
          <input className={field} required type="number" min={1} max={120} step={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
        </label>}
        {choice === 'transfer' && <label className="block text-sm font-semibold">Kode perangkat baru
          <input className={field} required value={device} maxLength={36} pattern="[a-fA-F0-9-]{36}" onChange={(event) => setDevice(event.target.value)} />
          <span className="block text-xs text-[var(--staff-muted,#475569)]">Cocokkan identitas siswa dengan daftar peserta sebelum memasukkan kode.</span>
        </label>}
      </>}
      <label className="block text-sm font-semibold">{mode === 'report' ? 'Keterangan' : 'Alasan keputusan'}
        <textarea autoFocus className={field} required minLength={8} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={action} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan catatan'}</button>
        <button type="button" className="min-h-11 px-3 text-sm" disabled={busy} onClick={() => open(null)}>Batal</button>
      </div>
    </form>}
  </section>;
}
