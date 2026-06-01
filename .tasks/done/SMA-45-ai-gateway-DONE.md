# Done Report — SMA-45: AIGateway + OllamaAdapter

**Tanggal:** 2026-06-01
**Branch:** `feat/SMA-45-ai-gateway`
**Model:** Claude Sonnet 4.6
**Deps:** SMA-44 ✅ (RagChunk + RagService skeleton)

---

## Deliverable yang Selesai

### A. Interface `AIGateway` + `RagContext` di `@smk/types`

File: `packages/types/src/index.ts`

```typescript
export interface RagContext { title: string; content: string; }
export interface AIGateway {
  chat(prompt: string, context?: RagContext[]): Promise<string>;
  embed(text: string): Promise<number[]>;
}
```

- Export dari `@smk/types`, build `dist/` disinkronkan via `npm run build`.

### B. `OllamaAdapter implements AIGateway`

File: `apps/api/src/ai/adapters/ollama.adapter.ts`

- `embed(text)` → POST `${OLLAMA_URL}/api/embeddings` → validasi dimensi (gate §2.1: `embedding.length !== OLLAMA_EMBED_DIMENSIONS` → throw Error)
- `chat(prompt, context?)` → susun system + context chunks + user message → POST `${OLLAMA_URL}/api/chat` (stream: false) → return `message.content`
- Timeout: embed = 15 dtk, chat = 30 dtk via `AbortController`
- Semua model/URL/dimensi dari env — tidak ada hardcode
- Pakai `fetch` bawaan Node 20 — tidak ada dependency tambahan

### C. Provider `AI_GATEWAY` + `AiModule`

File: `apps/api/src/ai/ai.module.ts`

- Factory `buildAiGateway()` pilih implementasi via `AI_PROVIDER` env
- `ollama` (default) → `OllamaAdapter`
- `claude` → throw Error (Sprint 4, SMA-48 — R-03 gerbang keras)
- `AiModule` export `AI_GATEWAY` + `AiService`
- Import di `app.module.ts`

### D. Pipeline embed + backfill

File: `apps/api/src/ai/ai.service.ts`

- `backfillEmbeddings()`: query `rag_chunks WHERE embedding IS NULL AND is_active = true` via `$queryRaw`
- Embed tiap chunk → tulis via `$executeRaw` (format `'[a,b,c]'::vector`)
- Idempoten: chunk yang sudah ada embedding di-skip (tidak di-select dari awal)
- Fail-soft per chunk: gagal dicatat, chunk berikutnya tetap diproses
- Return `EmbedChunkResult[]` dengan status per chunk

### E. Script standalone backfill

File: `apps/api/src/ai/scripts/embed-faq.ts`

- Minimal init: `PrismaClient` + `OllamaAdapter` langsung (tanpa NestJS bootstrap)
- Output progress: chunk per-baris dengan status ✅/❌
- Exit code 1 jika ada kegagalan
- Dijalankan via `npm run db:embed-faq` di VPS

### F. Env Zod (`env.validation.ts`)

```
AI_PROVIDER             → z.enum(['ollama','claude']).default('ollama')
OLLAMA_URL              → z.string().url().default('http://ollama:11434')
OLLAMA_CHAT_MODEL       → z.string().default('qwen2.5:7b')
OLLAMA_EMBED_MODEL      → z.string().default('nomic-embed-text')
OLLAMA_EMBED_DIMENSIONS → z.coerce.number().int().positive().default(768)
```

### G. Dokumentasi

File: `docs/deployment/env-variables.md` — Seksi 11b AIGateway/OllamaAdapter ditambahkan.

---

## Bukti Runtime

```
tsc --noEmit     → 0 errors
eslint src/ai    → 0 errors, 0 warnings (--max-warnings=0)
jest --coverage  → 361/361 passed, coverage total 83.81%
```

### Test coverage `src/ai`

```
src/ai/ai.module.ts       → 100% Stmts / 100% Branch / 100% Funcs / 100% Lines
src/ai/ai.service.ts      → 100% Stmts / 50% Branch / 100% Funcs / 100% Lines
src/ai/adapters/ollama.adapter.ts → 90.9% Stmts / 100% Branch / 50% Funcs / 100% Lines
```

(`embed-faq.ts` = standalone script, dikecualikan dari coverage unit test secara wajar)

### Test skenario wajib (15 tests di `ai-gateway.spec.ts`)

- ✅ `embed()` panjang != 768 → throw dengan pesan "Dimensi embedding tidak cocok" (gate §2.1)
- ✅ `embed()` 768 → kembalikan array number
- ✅ `embed()` HTTP non-200 → throw
- ✅ `embed()` embedding kosong → throw
- ✅ `chat()` tanpa context → return string
- ✅ `chat()` dengan context chunk → susun system context + return string
- ✅ `chat()` HTTP non-200 → throw
- ✅ `chat()` respons tanpa `message.content` → throw
- ✅ factory `AI_PROVIDER` unset → OllamaAdapter
- ✅ factory `AI_PROVIDER=ollama` → OllamaAdapter
- ✅ factory `AI_PROVIDER=claude` → throw (Sprint 4 belum tersedia)
- ✅ `backfillEmbeddings()` panggil embed per chunk NULL + `$executeRaw` UPDATE
- ✅ `backfillEmbeddings()` query kosong (semua sudah punya embedding) → tidak embed
- ✅ `backfillEmbeddings()` embed gagal satu chunk → dicatat, chunk lain tetap diproses
- ✅ `backfillEmbeddings()` tidak throw meski ada kegagalan

**Catatan:** Ollama nyata tidak tersedia di dev — semua test pakai mock `fetch` / mock adapter.

---

## Instruksi Backfill di VPS (untuk Director/Kang Sholah)

### Prasyarat

```bash
# 1. Pastikan Ollama jalan
docker compose ps ollama   # → status Up

# 2. Pull model embed (jika belum)
docker exec ollama ollama pull nomic-embed-text

# 3. Verifikasi model tersedia
docker exec ollama ollama list   # → nomic-embed-text ada di list
```

### Jalankan Backfill

```bash
# Di VPS, dari direktori smart-ai-school/apps/api
cd /path/to/smart-ai-school

# Pastikan DATABASE_URL dan OLLAMA_URL tersedia di env
# (bisa dari .env atau di-export manual)

cd apps/api && npm run db:embed-faq
```

**Output yang diharapkan:**
```
🔧 Embed FAQ — model: nomic-embed-text, dimensi: 768
   Ollama URL: http://ollama:11434
📦 Ditemukan 10 chunk tanpa embedding

  Embed "Apa itu SMK Darussalam Subah?" (abc12345...)... ✅ (768d)
  Embed "Jurusan apa saja yang tersedia?" (def67890...)... ✅ (768d)
  ... (10 baris total)

📊 Backfill selesai: 10 berhasil, 0 gagal
```

**Verifikasi setelah backfill:**
```bash
# Cek embedding sudah terisi (dari psql atau prisma studio)
docker exec postgres psql -U smk_admin -d smk_db -c \
  "SELECT COUNT(*) FROM ai_knowledge.rag_chunks WHERE embedding IS NOT NULL;"
# Expected: 10
```

**Script idempoten** — aman dijalankan ulang; chunk yang sudah ada embedding di-skip otomatis.

---

## Keputusan Terbuka

| ID | Deskripsi | Status |
|----|-----------|--------|
| D-2 | Model chat `qwen2.5:7b` dikonfirmasi Director via queue.md | ✅ Dikunci via env `OLLAMA_CHAT_MODEL` |
| R-03 | Strip-PII untuk ClaudeAdapter | Gerbang keras SMA-48 (Sprint 4) — belum dibuild |
| SMA-46 | Endpoint `/ai/chat` (chatbot user-facing) | Antrian berikutnya Sprint 3 |

---

## Constraint yang Diikuti

- TS strict, no `any`
- Ollama-only — `ClaudeAdapter` tidak dibangun (Sprint 4)
- Tidak ada endpoint `/ai/chat` atau vector search (SMA-46)
- Schema/tabel `rag_chunks` tidak diubah
- Tidak ada dependency baru — pakai `fetch` bawaan Node 20
- Semua model/URL/dimensi dari env — tidak hardcode

---

**Gerbang review Cowork (abstraksi AI + embed pipeline) wajib sebelum merge.**
