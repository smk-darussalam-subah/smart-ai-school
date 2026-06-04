# SMA-48 — ClaudeAdapter + R-03 strip-PII (Gerbang Regulasi) — DONE

**Branch:** `feat/SMA-48-claude-adapter`
**Tanggal selesai:** 2026-06-05
**Model:** Sonnet 4.6
**Status regulasi:** R-03 ditutup — tidak ada jalur egress data nyata ke Claude tanpa strip

---

## Deliverable

### File baru

| File | Keterangan |
|------|-----------|
| `apps/api/src/ai/adapters/pii-strip.utils.ts` | `stripPiiForLlm()` + `hasPii()` — R-03 strip util |
| `apps/api/src/ai/adapters/claude.adapter.ts` | `ClaudeAdapter implements AIGateway` |
| `.tasks/done/SMA-48-claude-adapter-DONE.md` | Laporan ini |

### File dimodifikasi

| File | Perubahan |
|------|-----------|
| `apps/api/src/ai/ai.module.ts` | Tambah `CLAUDE_GATEWAY` factory (null jika tidak dikonfigurasi) |
| `apps/api/src/ai/ai.service.ts` | Inject `CLAUDE_GATEWAY` + decision tree R-03 di `chatWithRag` |
| `apps/api/src/config/env.validation.ts` | Tambah `ANTHROPIC_API_KEY` optional |
| `apps/api/package.json` | Tambah `@anthropic-ai/sdk` dependency |
| 4 test files (`ai-chatbot`, `ai-chat-history`, `ai-knowledge-crud`, `ai-gateway`) | Tambah `CLAUDE_GATEWAY: null` ke test modules |

---

## Arsitektur R-03 (UU PDP)

### Decision tree di `AiService.chatWithRag()` (gate §6)

```
Input: dto.message + context chunks
         │
         ▼
   hasPii(message + context)?
         │
    YES  │  NO
         │
   ┌─────┴───────────┐
   │                 │
   ▼                 ▼
Ollama (lokal)   claudeGateway ada?
(data tidak          │
 keluar)         YES │  NO
                     │
              ┌──────┴──────┐
              │             │
              ▼             ▼
         stripPiiForLlm  Ollama
         lalu Claude     (fallback)
         (belt-and-
          suspenders)
```

**DEFAULT AMAN = Ollama. Bila ragu → Ollama.**

### PII Strip untuk LLM (`pii-strip.utils.ts`)

Regex SOURCE identik dengan `sentry.utils.ts PII_PATTERNS` — tidak divergen.
Replacement berlabel agar LLM mengerti konteks tanpa nilai nyata:

| Pattern | Sentry replacement | LLM replacement |
|---------|-------------------|-----------------|
| Email | `[REDACTED]` | `[EMAIL]` |
| HP Indonesia | `[REDACTED]` | `[HP]` |
| NIS berlabel | `[REDACTED]` | `[NIS]` |
| Nama berlabel | `[REDACTED]` | `[NAMA]` |

### Env-gating (double lock)

1. `AI_PROVIDER` default = `ollama` → factory `buildClaudeGateway()` return `null`
2. Tanpa `ANTHROPIC_API_KEY` → factory return `null` (bahkan jika `AI_PROVIDER=claude`)
3. `claudeGateway null` → decision tree selalu Ollama
4. **Hasil:** tidak ada jalur ke Claude API tanpa kedua env set secara eksplisit

### Belt-and-suspenders (double strip)

1. **Service** (`AiService`): `stripPiiForLlm(message)` + `stripPiiForLlm(context[].content)` sebelum memanggil `claudeGateway.chat()`
2. **Adapter** (`ClaudeAdapter.chat()`): `stripPiiForLlm(prompt)` + `stripPiiForLlm(context content)` lagi sebelum kirim ke Anthropic SDK

Idempoten: `stripPiiForLlm("[EMAIL]")` = `"[EMAIL]"` — double-strip aman.

### Embedding tetap Ollama

`ClaudeAdapter.embed()` melempar `Error` — safeguard agar tidak ada embedding yang dikirim ke Claude (embedding via Ollama adalah lokal, aman).

---

## Bukti Runtime

### tsc --noEmit
```
apps/api → exit 0 (0 errors)
```

### eslint --max-warnings=0
```
pii-strip.utils.ts, claude.adapter.ts, ai.module.ts, ai.service.ts,
sma48-claude-adapter.spec.ts → exit 0
```

### jest (full suite)
```
Test Suites: 27 passed, 27 total
Tests:       474 passed, 474 total
```

### jest (SMA-48 adapter+util — coverage)
```
pii-strip.utils.ts:  100% stmts | 100% branch | 100% funcs | 100% lines
claude.adapter.ts:   100% stmts | 100% branch | 100% funcs | 100% lines
```

### Skenario wajib

- **(a)** `stripPiiForLlm("fullName: Budi Santoso, NIS: 9876543210, budi@smk.id, 081298765432")`
  → `"[NAMA], [NIS], [EMAIL], [HP]"` ✅
- **(b)** `hasPii("email test@test.id")` true → Ollama dipanggil, Claude TIDAK dipanggil ✅
- **(b)** Context chunk mengandung email → paksa Ollama meski pesan bersih ✅
- **(c)** `CLAUDE_GATEWAY = null` → chat selalu ke Ollama ✅
- **(d)** Claude aktif (mock) + pesan non-PII → `claudeGateway.chat()` dipanggil dengan teks ter-strip ✅
- **Safeguard:** `ClaudeAdapter.embed()` → throw Error ✅

---

## Keputusan Desain

1. **`CLAUDE_GATEWAY` token terpisah dari `AI_GATEWAY`** — OllamaAdapter selalu disuntik sebagai `AI_GATEWAY` (untuk embed + fallback); ClaudeAdapter hanya untuk chat path non-PII. Tidak ada perubahan pada module exports downstream.

2. **Decision tree di service, bukan di adapter** — AiService tahu konteks penuh (message + RAG chunks). Adapter tidak tahu apakah input sudah di-filter.

3. **`hasPii` cek kombinasi message + context** — Potensi PII di context chunks (mis. nama siswa di dokumen yang ter-embed) juga mencegah routing ke Claude.

4. **`AI_PROVIDER=claude` default tidak di-set di env mana pun** — Sesuai constraint task. Test berjalan tanpa key, CI hijau.

---

## ⚠️ Catatan untuk Review Keamanan Cowork

Hal-hal yang WAJIB diverifikasi sebelum merge:

1. **Audit egress path:** Tidak ada jalur lain di codebase yang memanggil Claude SDK secara langsung (selain via `ClaudeAdapter` yang sudah ter-strip).

2. **Regex coverage:** Apakah `PII_STRIP_PATTERNS` sudah cukup untuk semua format PII yang mungkin muncul di sekolah ini? Nama tanpa label (`Ahmad` saja) TIDAK ter-strip — ini by design (false positive terlalu tinggi).

3. **`hasPii` false negative:** Jika PII muncul tanpa label (mis. angka NIS tanpa kata "NIS"), `hasPii` tidak mendeteksinya. Default safe = jika ada keraguan, tambahkan pola atau routing ke Ollama.

4. **`ANTHROPIC_API_KEY` tidak di-commit:** Verifikasi tidak ada key yang ter-commit di env files.

5. **`AI_PROVIDER=claude` tidak di-set di production env saat ini** — Aman: deployment saat ini Ollama-only.

---

*Menunggu review keamanan Cowork (egress PII audit) sebelum merge ke develop.*
