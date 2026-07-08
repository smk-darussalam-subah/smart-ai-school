// =============================================================================
// pii-strip.utils.ts — R-03/R-14 PII strip sebelum teks dikirim ke LLM eksternal
//
// PENTING (UU PDP — gerbang regulasi SMA-48):
//   Fungsi ini WAJIB dipanggil sebelum SETIAP request ke AI provider eksternal
//   (OpenAI gpt-4.1-mini ATAU Anthropic Claude).
//   Regex SOURCE identik dengan sentry.utils.ts PII_PATTERNS — konsisten,
//   tidak divergen. Perbedaan: replacement berlabel (bukan [REDACTED]) agar
//   LLM tetap memahami konteks tanpa mendapat data nyata.
//
// Decision tree di AiService.chatWithRag():
//   hasPii(input) → Ollama (lokal, data tidak keluar VPS)
//   !hasPii(input) → OpenAI dengan strip (belt-and-suspenders)
//
// Limitasi yang disadari (R-14 audit):
//   - Nama Indonesia tanpa label TIDAK bisa dideteksi tanpa false positive tinggi.
//     Mitigasi: hasPii() gate + stripPiiForLlm() di adapter = lapis ganda.
//   - NISN tanpa label (10 digit) ditambal dengan pattern baru di bawah.
//
// stripPiiForLlm("Email: siswa@smk.id, NIS: 12345") → "Email: [EMAIL], [NIS]"
// hasPii("Nama: Ahmad Fauzi") → true
// =============================================================================

/**
 * Pola PII untuk LLM strip — SOURCE regex identik dengan sentry.utils.ts PII_PATTERNS.
 * Replacement berlabel agar LLM mengerti tipe data tanpa mendapat nilai nyata.
 */
const PII_STRIP_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly replacement: string;
}> = [
  // Email addresses → [EMAIL]
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[EMAIL]',
  },
  // Nomor HP Indonesia (+62xxx / 62xxx / 08xxx) → [HP]
  {
    pattern: /(?:\+62|62|0)[0-9]{8,12}\b/g,
    replacement: '[HP]',
  },
  // NIS berlabel: "NIS: 12345678" → [NIS]
  {
    pattern: /\bNIS\s*:?\s*\d{5,20}\b/gi,
    replacement: '[NIS]',
  },
  // R-14: NISN tanpa label — 10 digit standalone, tidak diawali 0/62 (bukan HP).
  // NISN = Nomor Induk Siswa Nasional, format resmi: tepat 10 digit.
  // Risiko false positive rendah: angka 10-digit di konteks sekolah hampir selalu NISN.
  {
    pattern: /\b(?!62|0)\d{10}\b/g,
    replacement: '[NISN]',
  },
  // Nama berlabel: "nama: Ahmad", "fullName: Budi" → [NAMA]
  {
    pattern: /\b(?:nama|fullname|full_name|full name|nama_siswa)\s*[:=]?\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,48}/gi,
    replacement: '[NAMA]',
  },
];

/**
 * Strip PII dari teks sebelum dikirim ke LLM eksternal (R-03).
 * Ganti dengan placeholder berlabel agar LLM mengerti konteks tanpa nilai nyata.
 * Pure function — tidak mengubah input.
 */
export function stripPiiForLlm(text: string): string {
  return PII_STRIP_PATTERNS.reduce(
    (result, { pattern, replacement }) =>
      result.replace(new RegExp(pattern.source, pattern.flags), replacement),
    text,
  );
}

/**
 * Deteksi apakah teks mengandung PII.
 * true → PAKSA routing ke Ollama (lokal), JANGAN kirim ke provider eksternal.
 * false → boleh ke OpenAI/Claude setelah strip (belt-and-suspenders).
 */
export function hasPii(text: string): boolean {
  return PII_STRIP_PATTERNS.some(({ pattern }) =>
    new RegExp(pattern.source, pattern.flags).test(text),
  );
}
