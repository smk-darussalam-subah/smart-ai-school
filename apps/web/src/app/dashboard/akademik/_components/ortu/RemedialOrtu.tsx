'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, RefreshCcw } from 'lucide-react';
import {
  buildFamilyRemedialCardEntries,
  remedialDueState,
  shouldApplyOrtuRemedialResponse,
  type FamilyRemedialItem,
} from './ortu-remedial-ui';
import { fetchFamilyRemedials } from '../../actions';

interface RemedialOrtuProps {
  studentId?: string;
}

function statusLabel(item: FamilyRemedialItem): string {
  const outcome = item.participant?.outcome;
  if (outcome === 'passed') return 'Tuntas';
  if (outcome === 'needs_retry') return 'Perlu tindak lanjut';
  if (outcome === 'submitted') return 'Menunggu finalisasi guru';
  return 'Perlu dikerjakan';
}

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return 'Tanpa tenggat';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dueAt));
}

export default function RemedialOrtu({ studentId }: RemedialOrtuProps) {
  const [items, setItems] = useState<FamilyRemedialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const cardEntries = useMemo(() => buildFamilyRemedialCardEntries(items), [items]);

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    if (!studentId) {
      requestRef.current += 1;
      setItems([]);
      setLoading(false);
      setError('');
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const result = await fetchFamilyRemedials({ studentId, limit: 5 });
      if (!result.success) throw new Error(result.error ?? 'Remedial belum dapat dimuat.');
      if (!shouldApplyOrtuRemedialResponse({
        requestId,
        currentRequestId: requestRef.current,
        studentId,
        currentStudentId: studentId,
        aborted: controller.signal.aborted,
        mounted: mountedRef.current,
      })) return;
      setItems(result.data?.data ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!shouldApplyOrtuRemedialResponse({
        requestId,
        currentRequestId: requestRef.current,
        studentId,
        currentStudentId: studentId,
        aborted: controller.signal.aborted,
        mounted: mountedRef.current,
      })) return;
      setError(err instanceof Error ? err.message : 'Remedial belum dapat dimuat.');
      setItems([]);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (shouldApplyOrtuRemedialResponse({
        requestId,
        currentRequestId: requestRef.current,
        studentId,
        currentStudentId: studentId,
        aborted: controller.signal.aborted,
        mounted: mountedRef.current,
      })) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  return (
    <section className="mb-3.5 rounded-[var(--r)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide text-[var(--muted)]">
          <RefreshCcw className="h-[15px] w-[15px] text-[var(--pri)]" />
          Remedial
        </div>
        {error && (
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 text-[11px] font-bold text-[var(--pril)]"
          >
            Coba lagi <RefreshCcw className="h-3 w-3" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-5 text-center text-[12px] font-semibold text-[var(--dim)]">Memuat remedial...</div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-[var(--r-sm)] border border-red-500/20 bg-red-500/10 p-3 text-[12px] font-semibold text-red-500">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-5 text-center text-[12px] font-semibold text-[var(--dim)]">Tidak ada remedial aktif untuk anak ini</div>
      ) : (
        <div className="space-y-2">
          {cardEntries.map(({ item, key }) => {
            const dueState = remedialDueState(item.dueAt);
            const passed = item.participant?.outcome === 'passed';
            return (
              <article key={key} className="rounded-[var(--r-sm)] border border-[var(--border)] p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block truncate text-[13px]">{item.title}</b>
                    <small className="text-[10px] font-semibold text-[var(--muted)]">
                      {item.subject ?? 'Mapel'} · Percobaan {item.participant?.attemptNumber ?? 1}
                    </small>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold"
                    style={{
                      background: passed ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)',
                      color: passed ? 'var(--em)' : 'var(--amber)',
                    }}
                  >
                    {statusLabel(item)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-[var(--muted)]">
                  {passed ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--em)]" /> : <Clock className="h-3.5 w-3.5" />}
                  <span className={dueState === 'overdue' ? 'text-red-500' : ''}>{dueLabel(item.dueAt)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
