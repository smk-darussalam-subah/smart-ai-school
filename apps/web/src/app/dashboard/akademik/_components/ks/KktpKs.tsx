'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Target, Save, Info, RefreshCw } from 'lucide-react';
import { KKTP_DEFAULT } from '@/lib/academic';
import { kktpConfigSnapshot, validKktpDraft } from '@/lib/grade-consumers';
import { fetchKktpConfigs, saveKktpConfig } from '../../actions';

interface Props {
  kelasMapel: { mapel: string }[];
  subjects: { id: string; code: string; name: string; isActive: boolean }[];
  showToast: (message: string) => void;
  academicYear: string;
  semester: number;
}

/** A period switch retires the entire read/draft/save instance, not just its label. */
export default function KktpKs(props: Props) {
  return <KktpPeriodEditor key={`${props.academicYear}|${props.semester}`} {...props} />;
}

function KktpPeriodEditor({ kelasMapel, subjects, showToast, academicYear, semester }: Props) {
  const mapels = useMemo(
    () =>
      [
        ...new Set([
          ...subjects.filter((row) => row.isActive).map((row) => row.name),
          ...kelasMapel.map((row) => row.mapel),
        ]),
      ].sort(),
    [subjects, kelasMapel],
  );
  const [snapshot, setSnapshot] = useState<{
    state: 'loading' | 'ready' | 'denied' | 'unavailable';
    values: Record<string, number>;
  }>({ state: 'loading', values: {} });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(true),
    savePending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    setSnapshot({ state: 'loading', values: {} });
    setDraft({});
    setSaveError(null);
    fetchKktpConfigs(academicYear, semester)
      .then((result) => {
        if (current) setSnapshot(kktpConfigSnapshot(result, academicYear, semester));
      })
      .catch(() => {
        if (current) setSnapshot({ state: 'unavailable', values: {} });
      });
    return () => {
      current = false;
    };
  }, [academicYear, semester, retry]);
  const changes = Object.entries(draft).filter(
    ([subject, raw]) => validKktpDraft(raw) !== (snapshot.values[subject] ?? KKTP_DEFAULT),
  );
  const invalid = changes.some(([, raw]) => validKktpDraft(raw) === null);
  const canSave = snapshot.state === 'ready' && !saving && !invalid && changes.length > 0;
  async function handleSave() {
    if (!canSave || savePending.current || !mounted.current) return;
    savePending.current = true;
    setSaving(true);
    setSaveError(null);
    let saved = 0,
      failed = 0;
    try {
      for (const [subject, raw] of changes) {
        if (!mounted.current) return;
        const kktp = validKktpDraft(raw);
        if (kktp === null) continue;
        try {
          const result = await saveKktpConfig({ subject, kktp, academicYear, semester });
          if (!mounted.current) return;
          if (result.success) {
            saved++;
            setSnapshot((previous) => ({
              ...previous,
              values: { ...previous.values, [subject]: kktp },
            }));
            setDraft((previous) => {
              const next = { ...previous };
              delete next[subject];
              return next;
            });
          } else failed++;
        } catch {
          if (!mounted.current) return;
          failed++;
        }
      }
      if (failed)
        setSaveError(
          `${failed} konfigurasi belum tersimpan. Perubahan tetap tersedia untuk dicoba lagi.`,
        );
      if (saved)
        showToast(
          `${saved} konfigurasi KKTP tersimpan pada ${academicYear}, semester ${semester}.`,
        );
    } finally {
      savePending.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <section className="space-y-4" aria-busy={snapshot.state === 'loading' || saving}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-[17px] font-bold text-[#0f2e25]">
            <Target className="h-5 w-5 text-emerald-700" />
            Manajemen KKTP
          </h3>
          <p className="text-[12.5px] text-[#526b62]">
            Batas ketuntasan tiap mapel · {academicYear} · Semester {semester}
          </p>
        </div>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-700 px-3 text-[12.5px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </button>
      </div>
      {snapshot.state !== 'ready' ? (
        <div role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            {snapshot.state === 'loading'
              ? 'Memuat konfigurasi KKTP...'
              : snapshot.state === 'denied'
                ? 'Anda tidak memiliki izin membaca konfigurasi KKTP.'
                : 'Konfigurasi KKTP belum dapat dimuat. Tidak ada nilai yang dianggap sudah terverifikasi.'}
          </p>
          {snapshot.state !== 'loading' && (
            <button
              type="button"
              onClick={() => {
                setSnapshot({ state: 'loading', values: {} });
                setDraft({});
                setRetry((value) => value + 1);
              }}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-900"
            >
              <RefreshCw className="h-4 w-4" />
              Coba muat ulang
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#e6efea] bg-white p-5 shadow-sm">
          <p className="mb-3 rounded-lg bg-sky-50 px-3 py-2 text-[11.5px] text-sky-800">
            <Info className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            Mapel tanpa konfigurasi pada periode ini mengikuti nilai bawaan {KKTP_DEFAULT}. Ubah
            hanya mapel yang diperlukan; perubahan disimpan untuk periode di atas.
          </p>
          {mapels.map((subject, index) => {
            const raw = draft[subject] ?? String(snapshot.values[subject] ?? KKTP_DEFAULT),
              value = validKktpDraft(raw),
              id = `kktp-value-${index}`;
            return (
              <div
                key={subject}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 border-b border-[#e6efea] py-3"
              >
                <div className="min-w-0">
                  <label
                    htmlFor={id}
                    className="block break-words text-[12.5px] font-bold text-[#0f2e25]"
                  >
                    {subject}
                  </label>
                  <p className="text-[11px] text-[#526b62]">
                    {kelasMapel.filter((row) => row.mapel === subject).length} kelas terdampak ·{' '}
                    {snapshot.values[subject] === undefined
                      ? 'Nilai bawaan'
                      : 'Konfigurasi periode ini'}
                  </p>
                </div>
                <input
                  id={id}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={raw}
                  disabled={saving}
                  aria-invalid={value === null}
                  aria-describedby={value === null ? `${id}-error` : undefined}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, [subject]: event.target.value }))
                  }
                  className="min-h-11 w-full rounded-lg border border-[#d5e2dc] bg-white px-2 text-center text-base font-bold tabular-nums text-[#0f2e25] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                />
                {value === null && (
                  <p id={`${id}-error`} role="alert" className="col-span-2 text-xs text-rose-700">
                    Masukkan bilangan bulat 0–100 untuk {subject}.
                  </p>
                )}
              </div>
            );
          })}
          {!mapels.length && (
            <p className="py-4 text-sm text-[#526b62]">
              Belum ada mata pelajaran aktif atau penugasan pada daftar ini.
            </p>
          )}
        </div>
      )}
      {saveError && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
          {saveError}
        </p>
      )}
    </section>
  );
}
