# SMA-46 — AI Chatbot RAG — DONE

**Status:** ✅ SELESAI  
**Tanggal:** 2026-06-02  
**Branch:** `feat/SMA-46-chatbot`  
**Commit:** `1a8ed39`  
**Model:** Sonnet 4.6  
**Sprint:** Sprint 3 (penutup)

---

## Deliverable

### A. POST /api/v1/ai/chat (semua authenticated)
- Body Zod: `{ message: string.min(1).max(2000), sessionId?: uuid }` — `.strict()`
- Alur: `embed(message)` → `searchSimilar(vector, topK, minSim)` → `chat(message, context)` → `{ answer, sources, sessionId }`
- Graceful empty: tidak ada chunk ber-embedding → `chat()` dipanggil tanpa context, tidak 500
- Threshold `AI_RAG_MIN_SIMILARITY` menyaring chunk tidak relevan sebelum dikirim ke LLM
- Rate limit `@Throttle({ aichat: { ttl: 60_000, limit: 20 } })` — throttler 'aichat' terdaftar di `ThrottlerModule.forRoot`

### B. GET /api/v1/ai/knowledge (SA)
- List chunk: id, title, category, isActive, hasEmbedding (via `$queryRaw IS NOT NULL`)
- LIMIT 200, order `created_at DESC`

### C. POST /api/v1/ai/knowledge (SA)
- Body Zod: `{ title, content, category, source? }` — `.strict()`
- Create chunk → embed → tulis embedding via `$executeRaw ::vector`
- **Fail-soft**: Ollama down → chunk tersimpan `embedding=NULL`, response `{ ...chunk, embeddingOk: false }` — tidak 500

### F. POST /api/v1/ai/knowledge/backfill (SA) — N-13
- Panggil `AiService.backfillEmbeddings()` (sudah ada SMA-45)
- Response: `{ total, success, failed, results[] }`
- Idempoten (embedding IS NOT NULL di-skip), fail-soft per chunk
- **Pengganti** script `ts-node db:embed-faq` yang tidak bisa jalan di image produksi

### E. History — DEFER
- `sessionId` di-echo di response tapi tidak di-persist
- `GET /ai/chat/:sessionId/history` = Sprint 4 (butuh schema `ChatSession/ChatMessage`)
- TODO komentar di `chatWithRag()`

---

## Env baru

| Variable | Default | Keterangan |
|---|---|---|
| `AI_RAG_TOP_K` | `4` | Jumlah chunk top-K dari pgvector |
| `AI_RAG_MIN_SIMILARITY` | `0.3` | Ambang cosine similarity (0–1) |

Keduanya tervalidasi Zod di `env.validation.ts`. Docs: `docs/deployment/env-variables.md §11c`.

---

## Keputusan teknis

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Throttle key | `aichat` (named throttler) | Isolasi dari default 100/mnt — chat Ollama jauh lebih mahal |
| Graceful empty | chat tanpa context (bukan error) | UX: user tetap dapat respons walau FAQ belum di-backfill |
| Similarity threshold | default 0.3 | Trade-off: cukup longgar untuk FAQ, cukup ketat untuk buang noise |
| listKnowledge via `$queryRaw` | Wajib | Kolom `embedding` = `Unsupported` — tidak bisa `findMany` biasa |
| createKnowledge source | default 'manual' | Schema DB: source NOT NULL; opsional di API level |

**Keputusan terbuka:** Threshold `AI_RAG_MIN_SIMILARITY=0.3` bisa perlu di-tune setelah FAQ nyata ter-embed di produksi. Monitor kualitas jawaban chatbot untuk menyesuaikan.

---

## Bukti Runtime

```
tsc --noEmit: 0 error
eslint src/ai/ src/__tests__/ai-chatbot.spec.ts --max-warnings=0: 0 warning
jest --coverage: 375/375 pass
  src/ai: 95.6% statements · 91.3% branches · 78.94% functions · 95.06% lines
```

**Test skenario wajib yang dicovered:**
- POST /ai/chat: embed → search → chat(context) → {answer, sources, sessionId} ✅
- retrieval kosong → graceful, chat tanpa context, tidak 500 ✅
- threshold similarity menyaring chunk tidak relevan ✅
- POST /ai/knowledge: Ollama down → chunk tersimpan embedding NULL, embeddingOk=false, tidak 500 ✅
- POST /ai/knowledge/backfill: backfillEmbeddings() → {total, success, failed, results} ✅
- $queryRaw parameterized (Prisma.sql → object dengan .strings + .values, bukan string mentah) ✅

**Curl nyata** butuh Ollama + embedding terisi di produksi — defer ke pasca-backfill VPS.

---

## Langkah Uji Nyata di VPS (pasca-backfill)

```bash
# 1. Backfill embedding (pastikan smk-ollama + model sudah pull)
TOKEN="<sa-token>"
curl -X POST https://api.smkdarussalamsubah.sch.id/api/v1/ai/knowledge/backfill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
# Response: {"total":N,"success":N,"failed":0,"results":[...]}

# 2. Chat (semua authenticated user)
TOKEN="<any-token>"
curl -X POST https://api.smkdarussalamsubah.sch.id/api/v1/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Bagaimana cara mendaftar di SMK Darussalam Subah?"}'
# Response: {"answer":"...","sources":[{"title":"..."}],"sessionId":null}

# 3. List knowledge (SA)
curl https://api.smkdarussalamsubah.sch.id/api/v1/ai/knowledge \
  -H "Authorization: Bearer $TOKEN"
```
