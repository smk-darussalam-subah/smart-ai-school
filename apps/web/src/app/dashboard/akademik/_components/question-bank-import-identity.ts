export interface QuestionImportIdentityRow<TData = unknown> {
  rowNumber: number;
  data: TData;
}

export interface QuestionImportIdentity {
  batchKey: string;
  rowKeys: Map<number, string>;
}

export async function buildQuestionImportIdentity(
  subject: string,
  rows: QuestionImportIdentityRow[],
): Promise<QuestionImportIdentity> {
  const canonicalRows = rows.map((row) => ({
    rowNumber: row.rowNumber,
    data: stableValue(row.data),
  }));
  const batchDigest = await sha256Hex(stableJson({ subject, rows: canonicalRows.map((row) => row.data) }));
  const rowEntries = await Promise.all(canonicalRows.map(async (row) => {
    const digest = await sha256Hex(stableJson({ subject, rowNumber: row.rowNumber, data: row.data }));
    return [row.rowNumber, `row-${row.rowNumber}-${digest.slice(0, 24)}`] as const;
  }));
  return {
    batchKey: `sha256-${batchDigest}`,
    rowKeys: new Map(rowEntries),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = stableValue((value as Record<string, unknown>)[key]);
    return acc;
  }, {});
}

async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Browser tidak mendukung SHA-256 untuk identitas import.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
