# SMA-49 — Chat History (ChatSession + ChatMessage) — DONE

**Branch:** `feat/SMA-49-chat-history`
**Tanggal selesai:** 2026-06-05
**Model:** Sonnet 4.6

---

## Deliverable

### Schema — `packages/database/prisma/schema.prisma`

Tambahan model di `ai_knowledge` schema (ADDITIVE — tidak menyentuh tabel lain):

| Model | Tabel | Keterangan |
|-------|-------|-----------|
| `MessageRole` enum | — | `user \| assistant` |
| `ChatSession` | `ai_knowledge.chat_sessions` | 1 percakapan per user |
| `ChatMessage` | `ai_knowledge.chat_messages` | pesan individual, Cascade on session delete |

**Migration file:** `packages/database/prisma/migrations/20260605000001_sprint4_chat_history/migration.sql`

> ⚠️ **Catatan deploy:** Docker Desktop tidak running di lokal saat implementasi.
> Migration SQL ditulis manual (konsisten dengan `prisma migrate dev` output).
> `prisma generate` → ✅ Prisma Client terupdate.
> Migration HARUS dijalankan di VPS sebelum deploy: `psql diis_db < migration.sql`
> atau via `prisma migrate deploy` dengan DATABASE_URL yang benar.

### Backend — `apps/api`

| File | Perubahan |
|------|-----------|
| `src/ai/ai.service.ts` | MOD — `chatWithRag(dto, user)` → session-aware + `getChatHistory()` baru |
| `src/ai/ai.controller.ts` | MOD — `chat()` inject user + endpoint `GET /ai/chat/:sessionId/history` |
| `src/__tests__/ai-chatbot.spec.ts` | MOD — update mocks + call sites sesuai signature baru |
| `src/__tests__/ai-chat-history.spec.ts` | NEW — 17 test skenario a–e + wiring |

---

## API Changes

### POST /ai/chat (diubah)
- **Sebelum:** `chatWithRag(dto)` — tidak menyimpan apapun, sessionId di-echo saja
- **Setelah:** `chatWithRag(dto, user)` — session-aware:
  - Tanpa `sessionId` → buat `ChatSession` baru (title = 50 char pertama pesan) → simpan 2 `ChatMessage`
  - Dengan `sessionId` → validasi ownership → append 2 `ChatMessage` ke session itu
  - **Response:** `{ answer, sources[], sessionId: string }` — sessionId selalu dikembalikan

### GET /ai/chat/:sessionId/history (baru)
- **RBAC:** Pemilik session ATAU SUPER_ADMIN. Non-pemilik → 403.
- **Ownership:** filter `session.userId === auth.users.id` di service (bukan sekadar cek role)
- **Response:** `{ sessionId, messages[{ id, role, content, createdAt }] }` — diurutkan `createdAt ASC`
- 404 jika session tidak ditemukan

---

## RBAC Matrix — endpoint /ai/chat/:sessionId/history

| Role | Akses session milik sendiri | Akses session orang lain |
|------|----------------------------|--------------------------|
| SUPER_ADMIN | ✅ 200 | ✅ 200 |
| GURU / SISWA / dll. | ✅ 200 | ❌ 403 |

---

## Bukti Runtime

### tsc --noEmit
```
apps/api → exit 0 (0 errors)
```

### eslint --max-warnings=0
```
ai.service.ts, ai.controller.ts, ai-chat-history.spec.ts, ai-chatbot.spec.ts → exit 0
```

### prisma generate
```
✔ Generated Prisma Client (v5.22.0) to .\node_modules\@prisma\client in 426ms
```

### jest (full suite)
```
Test Suites: 26 passed, 26 total
Tests:       445 passed, 445 total  (+13 new dari SMA-49 baseline 432)
ai.service.ts coverage (semua AI tests): 96.8% stmts | 82.9% branch | 100% funcs | 98.2% lines
ai.controller.ts coverage: 77.8% stmts | 100% branch
```

**Skenario wajib:**
- **(a)** tanpa sessionId → `chatSession.create` + `chatMessage.createMany(2 entries)` dipanggil, `sessionId` dikembalikan ✅
- **(b)** sessionId milik user → `chatSession.findUnique` + append, `chatSession.create` tidak dipanggil ✅
- **(b)** sessionId milik orang lain → ForbiddenException ✅
- **(b)** sessionId tidak ada → NotFoundException ✅
- **(c)** pemilik → 200, `orderBy: { createdAt: 'asc' }` ✅
- **(d)** user lain (non-SA) → ForbiddenException ✅
- **(e)** SUPER_ADMIN → 200, `user.findUnique` tidak dipanggil (ownership skip) ✅

---

## Keputusan Desain

1. **Ownership via `userId` (auth.users.id), bukan keycloakId** — Konsisten dengan pola `createdBy`/`publishedBy` di schema existing. `resolveUserId()` sudah ada di service.

2. **Cross-schema FK menggunakan String @db.Uuid (no Prisma FK)** — `ChatSession.userId` merujuk `auth.users.id` tanpa Prisma FK (`no FK; cross-schema`), konsisten dengan pattern `createdBy`/`publishedBy` di `RagChunk`, `Grade`, dsb.

3. **SA bypass ownership tanpa `resolveUserId`** — SA tidak perlu resolusi DB userId untuk ownership check. Menghemat 1 query dan menghindari throw jika keycloakId SA belum ada di DB.

4. **`getChatHistory` di `AiService` (bukan service baru)** — Tidak perlu service baru; chat history adalah ekstensi alur chatbot yang sudah ada. Sesuai DDD: sama bounded context.

5. **`chatWithRag` return `sessionId: string` (bukan optional)** — Sebelumnya `sessionId: string | undefined`. Setelah SMA-49, session SELALU dibuat → selalu ada sessionId.

---

## Catatan Deploy (WAJIB)

Migration harus dijalankan di VPS sebelum layanan API restart:

```bash
# Via psql langsung
psql $DATABASE_URL -f packages/database/prisma/migrations/20260605000001_sprint4_chat_history/migration.sql

# Atau via prisma migrate deploy (recommended — tandai applied di _prisma_migrations)
DATABASE_URL="..." npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
```

**Order:** Migration dulu → restart API → test endpoint.

---

*Tunggu review Cowork (schema + RBAC) sebelum merge ke develop. Deploy develop→staging→main jangan skip staging (ada migration).*
