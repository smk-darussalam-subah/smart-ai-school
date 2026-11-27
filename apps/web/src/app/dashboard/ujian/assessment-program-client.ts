const line = 'border-[var(--border,var(--staff-line,#cbd5e1))]';
export const programPanel = `min-w-0 space-y-3 rounded-xl border p-4 ${line}`;
export const programField = `min-h-11 w-full rounded-lg border bg-[var(--surface,var(--staff-panel,#fff))] px-3 py-2 text-sm ${line}`;
export const programButton = `min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${line}`;
export const programPrimary = 'min-h-11 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

export class AssessmentRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'AssessmentRequestError';
  }
}

export async function assessmentRequest<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch('/api/backend/' + path, { method, cache: 'no-store',
    ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) });
  if (response.redirected) throw new AssessmentRequestError(401, 'Masuk kembali untuk melanjutkan.');
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AssessmentRequestError(response.status, typeof body?.message === 'string' ? body.message : 'Permintaan belum berhasil.');
  }
  return body as T;
}
