import type { AiQuestionDraftItem, AiQuestionDraftRequest } from '../actions';

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
  );
}
async function operationKey(prefix: string, payload: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error('Gunakan browser terbaru untuk melanjutkan.');
  const bytes = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(stable(payload))),
  );
  return `${prefix}-${Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
/** Fixed length; identical logical retries reuse the full digest without truncating item IDs. */
export function questionDraftSaveKey(
  generationId: string,
  items: Array<Pick<AiQuestionDraftItem, 'itemKey' | 'question' | 'tpRefs' | 'cognitiveLevel'>>,
) {
  return operationKey('accept', {
    generationId,
    items: [...items]
      .sort((a, b) => (a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0))
      .map((item) => ({ ...item, tpRefs: [...item.tpRefs].sort() })),
  });
}
/** A new teacher-requested batch gets a new nonce; uncertain retries keep it, avoiding duplicate AI work. */
export function questionDraftGenerateKey(
  request: Omit<AiQuestionDraftRequest, 'idempotencyKey'>,
  nonce: string,
) {
  return operationKey('generate', { request, nonce });
}
export function questionDraftRejectKey(generationId: string) {
  return operationKey('reject', { generationId });
}

/** Largest-remainder allocation: keep the chosen ratios, exact integer total, stable tie order. */
export function distributeQuestionCount<K extends string>(
  weights: Record<K, number>,
  count: number,
): Record<K, number> {
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error('Jumlah soal harus 1–20.');
  const keys = Object.keys(weights) as K[];
  const total = keys.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
  if (!Number.isFinite(total) || total <= 0)
    return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  const shares = keys.map((key, index) => ({
    key,
    index,
    raw: (Math.max(0, weights[key]) / total) * count,
  }));
  const result = Object.fromEntries(shares.map(({ key, raw }) => [key, Math.floor(raw)])) as Record<
    K,
    number
  >;
  const remaining = count - keys.reduce((sum, key) => sum + result[key], 0);
  const order = [...shares].sort(
    (a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)) || a.index - b.index,
  );
  for (let index = 0; index < remaining; index++) result[order[index]!.key]++;
  return result;
}
