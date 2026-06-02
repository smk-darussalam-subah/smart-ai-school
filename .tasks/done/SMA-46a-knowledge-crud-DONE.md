# SMA-46a — Knowledge Base CRUD + Publish Workflow — DONE

**Status:** ✅ SELESAI  
**Tanggal:** 2026-06-02  
**Branch:** `feat/SMA-46a-knowledge-crud`  
**Commit:** `2d62326`  
**Model:** Sonnet 4.6

---

## Deliverable

### A. Schema Additive (migration `20260602000001_sprint4_kb_audit`)
```sql
ALTER TABLE "ai_knowledge"."rag_chunks"
  ADD COLUMN IF NOT EXISTS "created_by"   UUID,
  ADD COLUMN IF NOT EXISTS "published_by" UUID,
  ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ;
```
- `isActive` default berubah ke `false` (draft) di schema.prisma — hanya berlaku INSERT baru
- `prisma validate` ✅ · `prisma generate` ✅

### B. Create → Draft
- POST /ai/knowledge (SA/KS/TU): `isActive=false`, `createdBy=auth.users.id`, embed fail-soft

### C. Endpoint Baru/Diubah

| Method | Path | Roles | Aksi |
|---|---|---|---|
| GET | /ai/knowledge | SA, KS, TU | List ALL chunk (draft+published) + hasEmbedding + audit |
| GET | /ai/knowledge/:id | SA, KS, TU | Detail + content + audit |
| PATCH | /ai/knowledge/:id | SA, KS, TU | Edit; content berubah → re-embed + isActive=false |
| POST | /ai/knowledge/:id/publish | SA, KS | Gate 422 jika embedding NULL; isActive=true + publishedBy/At |
| POST | /ai/knowledge/:id/unpublish | SA, KS | isActive=false |
| DELETE | /ai/knowledge/:id | SA | Hard-delete |
| POST | /ai/knowledge/backfill | SA | (tetap, SMA-46) |

### D. Guardrail
- **Separation of duties:** TU create/edit OK, TU publish → 403
- **Publish gate:** embedding IS NOT NULL wajib → 422 jika NULL (pesan: jalankan backfill/re-embed)
- **Re-embed on content change:** PATCH content → embed baru (fail-soft) + isActive=false (wajib review ulang)
- PATCH title/category saja → tidak re-embed, status tidak berubah

---

## Keputusan Teknis

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Delete | Hard-delete | Tidak ada kolom `deletedAt` dalam scope migration. Soft-delete tidak bisa dibedakan dari unpublish tanpa kolom tambahan. |
| updatedBy | Tidak diimplementasikan | Scope hanya tambah createdBy/publishedBy/publishedAt. `updatedAt` ter-update otomatis via Prisma `@updatedAt`. |
| listKnowledge | Tampilkan semua (draft+published) | SA/KS/TU butuh lihat draft untuk review workflow. Chatbot hanya baca `is_active=true` via `searchSimilar`. |
| publish gate | 422 UnprocessableEntityException | Lebih semantik dari 400; menunjukkan request valid tapi state entitas belum siap. |

---

## Bukti Runtime

```
prisma validate: ✅ valid
prisma generate: ✅ Prisma Client v5.22.0
tsc --noEmit: 0 error
eslint --max-warnings=0: 0 warning
jest --coverage: 390/390 pass
  src/ai: 92.2% statements · 84.44% branches · 75% functions · 92.75% lines
```

**Test skenario wajib:**
- create → isActive=false + createdBy + embed dipanggil ✅
- PATCH content → re-embed + isActive=false ✅
- PATCH title saja → tidak re-embed, status tidak berubah ✅
- publish KS → isActive=true + publishedBy/At ✅
- publish TU → 403 ForbiddenException ✅
- publish embedding NULL → 422 UnprocessableEntityException ✅
- unpublish SA/KS → isActive=false ✅
- unpublish TU → 403 ✅
- delete SA → hard-delete ✅
- delete chunk tidak ada → 404 ✅
- GET list/detail → $queryRaw ✅
- getKnowledgeById tidak ada → 404 ✅

---

## Langkah Uji Nyata di VPS

```bash
TOKEN_SA="<sa-token>"
TOKEN_TU="<tu-token>"
BASE="https://api.smkdarussalamsubah.sch.id/api/v1"

# 1. Create draft (TU bisa)
ID=$(curl -s -X POST $BASE/ai/knowledge \
  -H "Authorization: Bearer $TOKEN_TU" \
  -H "Content-Type: application/json" \
  -d '{"title":"FAQ Pendaftaran","content":"...","category":"faq"}' | jq -r '.id')

# 2. List (semua SA/KS/TU)
curl $BASE/ai/knowledge -H "Authorization: Bearer $TOKEN_SA"

# 3. Publish (SA/KS only — TU → 403)
curl -X POST $BASE/ai/knowledge/$ID/publish \
  -H "Authorization: Bearer $TOKEN_SA"

# 4. Chat → chatbot akan pakai chunk yang baru dipublish
curl -X POST $BASE/ai/chat \
  -H "Authorization: Bearer $TOKEN_SA" \
  -H "Content-Type: application/json" \
  -d '{"message":"Bagaimana cara mendaftar?"}'
```
