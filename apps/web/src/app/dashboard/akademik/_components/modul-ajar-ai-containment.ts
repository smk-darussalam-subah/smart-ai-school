import type { AtpItem, KegiatanItem, ModulAjarBody } from './guru-types';

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

export function hasTeacherConfirmedCp(body: ModulAjarBody): boolean {
  return Boolean(body.cp?.trim());
}

function missingFoundation(section: AiSection, body: ModulAjarBody): boolean {
  if (section === 'cp_tp') return !hasTeacherConfirmedCp(body);
  if (section === 'atp' || section === 'kegiatan' || section === 'asesmen') {
    return !hasTeacherConfirmedCp(body) || !hasTeacherConfirmedTp(body);
  }
  return false;
}

export function deriveAiButtonState(input: {
  section: AiSection;
  savedVersion: AiSaveState;
  rppId: string | null;
  editingId?: string | null;
  body: ModulAjarBody;
  isGenerating: boolean;
}): { label: string; disabled: boolean; reason: 'ready' | 'saving' | 'missing_foundation' } {
  if (input.isGenerating) {
    return { label: 'Menyiapkan bantuan...', disabled: true, reason: 'saving' };
  }
  if (missingFoundation(input.section, input.body)) {
    return { label: input.section === 'cp_tp' ? 'Isi dan simpan CP' : 'Isi dan simpan CP/TP', disabled: false, reason: 'missing_foundation' };
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
  if (missingFoundation(input.section, input.body)) {
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
  if (!isRecord(output)) return { ok: false, code: 'AI_OUTPUT_INVALID' };

  switch (section) {
    case 'cp_tp': {
      if (!hasOnlyKeys(output, ['tp'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const tp = readStringArray(output['tp']);
      return tp.length > 0 ? { ok: true, patch: { tp } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'atp': {
      if (!hasOnlyKeys(output, ['atp'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const atp = readAtpArray(output['atp']);
      return atp.length > 0 ? { ok: true, patch: { atp } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'profil': {
      if (!hasOnlyKeys(output, ['profilDimensi', 'profilUraian'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const profilDimensi = readStringArray(output['profilDimensi']);
      const profilUraian = readString(output['profilUraian']);
      if (!profilUraian || profilDimensi.length === 0) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      return { ok: true, patch: { profilDimensi, profilUraian } };
    }
    case 'sarana': {
      if (!hasOnlyKeys(output, ['sarana', 'target'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const sarana = readString(output['sarana']);
      const target = readString(output['target']);
      return sarana && target ? { ok: true, patch: { sarana, target } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'kegiatan': {
      if (!hasOnlyKeys(output, ['kegiatan'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const kegiatan = readKegiatanArray(output['kegiatan']);
      return kegiatan.length > 0
        ? { ok: true, patch: { kegiatan: mergeKegiatanPatch(currentBody.kegiatan ?? [], kegiatan) } }
        : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'asesmen': {
      if (!hasOnlyKeys(output, ['asesmenDiagnostik', 'asesmenFormatif', 'asesmenSumatif'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const asesmenDiagnostik = readString(output['asesmenDiagnostik']);
      const asesmenFormatif = readString(output['asesmenFormatif']);
      const asesmenSumatif = readString(output['asesmenSumatif']);
      return asesmenDiagnostik && asesmenFormatif && asesmenSumatif
        ? { ok: true, patch: { asesmenDiagnostik, asesmenFormatif, asesmenSumatif } }
        : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'remedial': {
      if (!hasOnlyKeys(output, ['pengayaan', 'remedial'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const pengayaan = readString(output['pengayaan']);
      const remedial = readString(output['remedial']);
      return pengayaan && remedial ? { ok: true, patch: { pengayaan, remedial } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'refleksi': {
      if (!hasOnlyKeys(output, ['refleksiGuru', 'refleksiSiswa'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const refleksiGuru = readString(output['refleksiGuru']);
      const refleksiSiswa = readString(output['refleksiSiswa']);
      return refleksiGuru && refleksiSiswa ? { ok: true, patch: { refleksiGuru, refleksiSiswa } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
    case 'lampiran': {
      if (!hasOnlyKeys(output, ['lampiran'])) return { ok: false, code: 'AI_OUTPUT_INVALID' };
      const lampiran = readString(output['lampiran']);
      return lampiran ? { ok: true, patch: { lampiran } } : { ok: false, code: 'AI_OUTPUT_INVALID' };
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readString).filter((item): item is string => Boolean(item));
}

function readAtpArray(value: unknown): AtpItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ['tpRef', 'indikator'])) return [];
    const tpRef = readString(item['tpRef']);
    const indikator = readString(item['indikator']);
    return tpRef && indikator ? [{ tpRef, indikator }] : [];
  });
}

function readKegiatanArray(value: unknown): KegiatanItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ['pertemuan', 'pendahuluan', 'inti', 'penutup', 'diferensiasi'])) return [];
    const row: KegiatanItem = {};
    const pertemuan = readString(item['pertemuan']);
    const pendahuluan = readString(item['pendahuluan']);
    const inti = readString(item['inti']);
    const penutup = readString(item['penutup']);
    const diferensiasi = readString(item['diferensiasi']);
    if (!pertemuan || !pendahuluan || !inti || !penutup) return [];
    if (pertemuan) row.pertemuan = pertemuan;
    if (pendahuluan) row.pendahuluan = pendahuluan;
    if (inti) row.inti = inti;
    if (penutup) row.penutup = penutup;
    if (diferensiasi) row.diferensiasi = diferensiasi;
    return [row];
  });
}

function mergeKegiatanPatch(current: KegiatanItem[], generated: KegiatanItem[]): KegiatanItem[] {
  if (current.length === 0) return generated;
  const next = [...current];
  generated.forEach((row, index) => {
    next[index] = { ...(next[index] ?? {}), ...row };
  });
  return next;
}
