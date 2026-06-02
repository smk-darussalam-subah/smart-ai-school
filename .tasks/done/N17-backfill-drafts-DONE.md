# N-17 — Backfill juga embed draft chunk — DONE

**Branch:** `fix/N17-backfill-drafts`
**Commit:** `fe23fc3`
**Tanggal selesai:** 2026-06-02
**Model:** Haiku 4.5

---

## Masalah

`AiService.backfillEmbeddings()` memfilter `WHERE embedding IS NULL AND is_active = true` sehingga chunk draft (is_active=false) tanpa embedding TIDAK terjaring. Akibatnya:
- Buat draft → embeddingOk mungkin false (Ollama down/lambat saat create)
- Publish → 422 (embedding NULL)
- Backfill → skip draft
- Loop tidak bisa keluar

## Perubahan

**`apps/api/src/ai/ai.service.ts`** — satu baris dihapus:

```sql
-- Sebelum (N-17 bug)
WHERE embedding IS NULL
  AND is_active = true   -- ← dihapus

-- Sesudah
WHERE embedding IS NULL
```

`searchSimilar()` (chatbot) tidak diubah — tetap hanya pakai `is_active = true`.

**`apps/api/src/__tests__/ai-knowledge-crud.spec.ts`** — +1 test:

```
AiService.backfillEmbeddings() — N-17 draft inclusion
  ✓ chunk is_active=false + embedding NULL → ikut ter-embed (draft tidak di-skip)
```

---

## Bukti Runtime

### tsc --noEmit
```
(0 output = 0 errors)
```

### eslint --max-warnings=0
```
(0 output = 0 warnings)
```

### jest --coverage (full suite)
```
Test Suites: 24 passed, 24 total
Tests:       391 passed, 391 total

ai.service.ts  | 96.15% stmts | 79.41% branch | 100% funcs | 97.82% lines
```

391 test hijau. Tidak ada regresi.

---

*Tunggu review Cowork sebelum merge ke main.*
