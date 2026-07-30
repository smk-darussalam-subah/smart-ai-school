import type { AtpItem, ModulAjarBody } from './guru-types';

export type AiSection =
  | 'cp_tp'
  | 'atp'
  | 'profil'
  | 'sarana'
  | 'kegiatan'
  | 'asesmen'
  | 'remedial'
  | 'refleksi'
  | 'lampiran';

export type AiSaveState = 'dirty' | 'saving' | 'saved' | 'error';

export const AI_STEP_SECTION: Record<number, AiSection> = {
  2: 'cp_tp',
  3: 'atp',
  4: 'profil',
  5: 'sarana',
  6: 'kegiatan',
  7: 'asesmen',
  8: 'remedial',
  9: 'refleksi',
  10: 'lampiran',
};

export function hasTeacherConfirmedTp(body: ModulAjarBody): boolean {
  return (body.tp ?? []).some((item) => item.trim().length > 0);
}

export function deriveAiButtonState(input: {
  section: AiSection;
  savedVersion: AiSaveState;
  rppId: string | null;
  editingId?: string | null;
  body: ModulAjarBody;
  isGenerating: boolean;
}): { label: string; disabled: boolean; reason: 'ready' | 'saving' | 'missing_tp' } {
  if (input.isGenerating) {
    return { label: 'Menyiapkan bantuan...', disabled: true, reason: 'saving' };
  }
  if (input.section === 'atp' && !hasTeacherConfirmedTp(input.body)) {
    return { label: 'Isi dan simpan TP', disabled: false, reason: 'missing_tp' };
  }

  const hasSavedId = Boolean(input.rppId ?? input.editingId);
  if (!hasSavedId || input.savedVersion !== 'saved') {
    return { label: 'Simpan & bantu isi bagian ini', disabled: false, reason: 'ready' };
  }
  return { label: 'Bantu isi bagian ini', disabled: false, reason: 'ready' };
}

export function mapAiErrorToTeacherCopy(codeOrMessage?: string): string {
  const value = codeOrMessage ?? '';
  const map: Record<string, string> = {
    AI_FOUNDATION_INCOMPLETE: 'Isi dan simpan CP/TP terlebih dahulu.',
    AI_CONTEXT_PII_BLOCKED: 'Hapus data pribadi dari bagian ini, lalu coba lagi.',
    AI_PROVIDER_TIMEOUT: 'Bantuan AI belum merespons. Draf Anda tetap tersimpan.',
    AI_PROVIDER_AUTH_FAILED: 'Layanan AI belum tersedia. Hubungi administrator.',
    AI_OUTPUT_INVALID: 'Hasil AI belum dapat digunakan. Isi bagian ini secara manual atau coba lagi nanti.',
    AI_ENDPOINT_DISABLED: 'Bantuan AI lama sudah ditutup. Gunakan tombol bantuan per bagian pada Modul Ajar tersimpan.',
    AI_PROVIDER_UNAVAILABLE: 'Layanan AI belum tersedia. Draf Anda tetap tersimpan.',
  };
  const mapped = map[value];
  if (mapped) return mapped;
  if (value.includes('AI_PROVIDER_RATE_LIMITED') || value.includes('429')) {
    return 'Batas bantuan AI tercapai. Coba lagi nanti.';
  }
  if (value.includes('timeout')) return 'Bantuan AI belum merespons. Draf Anda tetap tersimpan.';
  return value.trim() || 'Bantuan AI gagal. Draf Anda tetap tersimpan.';
}

export function createAiSingleFlightGuard(): {
  tryStart: () => boolean;
  finish: () => void;
  isActive: () => boolean;
} {
  let active = false;
  return {
    tryStart: () => {
      if (active) return false;
      active = true;
      return true;
    },
    finish: () => {
      active = false;
    },
    isActive: () => active,
  };
}

export type ContainedAiFlowResult =
  | { status: 'applied'; rppId: string; patch: Partial<ModulAjarBody> }
  | { status: 'missing_foundation'; code: 'AI_FOUNDATION_INCOMPLETE' }
  | { status: 'duplicate' }
  | { status: 'failed'; codeOrMessage: string; rppId?: string };

export async function runContainedAiSectionFlow(input: {
  section: AiSection;
  body: ModulAjarBody;
  guard: ReturnType<typeof createAiSingleFlightGuard>;
  ensureSaved: () => Promise<string>;
  generate: (request: { rppId: string; section: AiSection }) => Promise<{
    success: boolean;
    data?: { output: unknown };
    error?: string;
    errorCode?: string;
  }>;
}): Promise<ContainedAiFlowResult> {
  if (input.section === 'atp' && !hasTeacherConfirmedTp(input.body)) {
    return { status: 'missing_foundation', code: 'AI_FOUNDATION_INCOMPLETE' };
  }
  if (!input.guard.tryStart()) return { status: 'duplicate' };

  let savedRppId: string | undefined;
  try {
    savedRppId = await input.ensureSaved();
    const response = await input.generate({ rppId: savedRppId, section: input.section });
    if (!response.success) {
      return {
        status: 'failed',
        codeOrMessage: response.errorCode ?? response.error ?? 'Bantuan AI gagal.',
        rppId: savedRppId,
      };
    }
    const parsed = parseAiSectionOutput(input.section, response.data?.output, input.body);
    if (!parsed.ok) {
      return { status: 'failed', codeOrMessage: parsed.code, rppId: savedRppId };
    }
    return { status: 'applied', rppId: savedRppId, patch: parsed.patch };
  } catch (err) {
    return {
      status: 'failed',
      codeOrMessage: err instanceof Error ? err.message : 'Bantuan AI gagal.',
      rppId: savedRppId,
    };
  } finally {
    input.guard.finish();
  }
}

export function parseAiSectionOutput(
  section: AiSection,
  output: unknown,
  currentBody: ModulAjarBody,
): { ok: true; patch: Partial<ModulAjarBody> } | { ok: false; code: 'AI_OUTPUT_INVALID' } {
  if (section === 'atp') {
    const parsed = parseAtpOutput(output);
    return parsed.length > 0 ? { ok: true, patch: { atp: parsed } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
  }

  if (typeof output !== 'string' || output.trim().length < 3) {
    return { ok: false, code: 'AI_OUTPUT_INVALID' };
  }
  const text = output.trim();

  switch (section) {
    case 'cp_tp':
      return { ok: true, patch: parseCpTp(text) };
    case 'profil':
      return { ok: true, patch: { profilUraian: text } };
    case 'sarana': {
      const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
      return {
        ok: true,
        patch: paragraphs.length >= 2
          ? { sarana: paragraphs[0], target: paragraphs.slice(1).join('\n\n') }
          : { sarana: text },
      };
    }
    case 'kegiatan':
      return {
        ok: true,
        patch: {
          kegiatan: currentBody.kegiatan?.length
            ? currentBody.kegiatan.map((item, index) => (index === 0 ? { ...item, inti: text } : item))
            : [{ pertemuan: 'Pertemuan 1', inti: text }],
        },
      };
    case 'asesmen':
      return { ok: true, patch: parseAsesmen(text) };
    case 'remedial':
      return { ok: true, patch: parseDualSection(text, 'pengayaan', 'remedial', { remedial: text }) };
    case 'refleksi':
      return { ok: true, patch: parseDualSection(text, 'guru', 'siswa', { refleksiGuru: text }) };
    case 'lampiran':
      return { ok: true, patch: { lampiran: text } };
  }
}

function parseAtpOutput(output: unknown): AtpItem[] {
  const rawItems = Array.isArray(output) ? output : tryParseArray(output);
  const parsed: AtpItem[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const tpRef = firstString(record['tpRef'], record['code'], record['tp']);
      const indikator = firstString(record['indikator'], record['indicator'], record['atp']);
    if (!tpRef && !indikator) continue;
    parsed.push({ tpRef, indikator });
  }
  return parsed;
}

function tryParseArray(output: unknown): unknown[] {
  if (typeof output !== 'string') return [];
  try {
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.filter((item): item is string => typeof item === 'string').join('; ').trim();
      if (joined) return joined;
    }
  }
  return undefined;
}

function parseCpTp(output: string): Partial<ModulAjarBody> {
  const lines = output.split('\n').map((line) => line.trim()).filter(Boolean);
  const cpText: string[] = [];
  const tpText: string[] = [];
  let inTp = false;
  for (const line of lines) {
    const tpMatch = line.match(/^(?:[-*]\s*)?(?:TP\s*)?\d+[.):\- ]+(.*)$/i);
    if (tpMatch?.[1]) {
      inTp = true;
      tpText.push(tpMatch[1].trim());
      continue;
    }
    if (/tujuan pembelajaran|^tp\b/i.test(line)) {
      inTp = true;
      continue;
    }
    if (/capaian pembelajaran|^cp\b/i.test(line)) continue;
    if (inTp) tpText.push(line);
    else cpText.push(line);
  }
  return {
    cp: cpText.length ? cpText.join('\n') : output,
    ...(tpText.length ? { tp: tpText } : {}),
  };
}

function parseAsesmen(output: string): Partial<ModulAjarBody> {
  const diagnostik = splitNamedSection(output, 'diagnostik', ['formatif', 'sumatif']);
  const formatif = splitNamedSection(output, 'formatif', ['diagnostik', 'sumatif']);
  const sumatif = splitNamedSection(output, 'sumatif', ['diagnostik', 'formatif']);
  if (diagnostik || formatif || sumatif) {
    return {
      ...(diagnostik ? { asesmenDiagnostik: diagnostik } : {}),
      ...(formatif ? { asesmenFormatif: formatif } : {}),
      ...(sumatif ? { asesmenSumatif: sumatif } : {}),
    };
  }
  return { asesmen: output };
}

function parseDualSection(
  output: string,
  first: string,
  second: string,
  fallback: Partial<ModulAjarBody>,
): Partial<ModulAjarBody> {
  const firstText = splitNamedSection(output, first, [second]);
  const secondText = splitNamedSection(output, second, [first]);
  if (!firstText && !secondText) return fallback;
  if (first === 'pengayaan') {
    return {
      ...(firstText ? { pengayaan: firstText } : {}),
      ...(secondText ? { remedial: secondText } : {}),
    };
  }
  return {
    ...(firstText ? { refleksiGuru: firstText } : {}),
    ...(secondText ? { refleksiSiswa: secondText } : {}),
  };
}

function splitNamedSection(output: string, keyword: string, stopKeywords: string[]): string {
  const stop = stopKeywords.join('|');
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,6}\\s*)?${keyword}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,6}\\s*)?(?:${stop})|$)`,
    'i',
  );
  return output.match(re)?.[1]?.trim() ?? '';
}
