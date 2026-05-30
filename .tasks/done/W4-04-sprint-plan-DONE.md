# W4-04 — Sprint Plan Tahap 1 (T4) DONE

**Branch:** `feat/W4-04-tahap1-sprint-plan`
**PR:** #14 | **Commit:** `afe6f76`
**Selesai:** 2026-05-30

---

## File Dibuat

`docs/tahap1-sprint-plan.md` — 623 baris, 8 bagian wajib + semua perbaikan design review.

## Keputusan Eksplisit (4 temuan laporan analyst)

| Temuan | Keputusan |
|---|---|
| **N-1** | Finance → `SppPayment`; Notification → `NotificationLog`. Tidak hapus deklarasi schema (berbahaya untuk migration). |
| **N-2** | `KnowledgeDocument` + `AiDocument` → satu model `RagChunk`. Embedding: `nomic-embed-text` → **`vector(768)`** (bukan 1536 OpenAI). |
| **T-12** | `teacher` schema = identitas SDM; `academic` schema = operasional. Tambah `TeachingAssignment`, `Grade`, `Attendance` di `academic`. |
| **T-09** | `AIGateway` + `NotificationAdapter` interface. Decision tree: PII → Ollama lokal; FAQ → Claude API (strip PII dulu). |

## Perbaikan Design Review (diterapkan sebelum merge)

1. **Embedding dimension:** `vector(768)` ditetapkan; env `OLLAMA_EMBED_MODEL` + `OLLAMA_EMBED_DIMENSIONS` sebagai single source of truth.
2. **R-05 consent:** BLOCKER keras sebelum input data siswa nyata — bukan paralel.
3. **PPDB public endpoint:** rate-limit 10/5mnt + Zod strict + honeypot anti-bot.
4. Endpoint `approve` ditambah di §3 untuk grades + finance/spp.
5. EventEmitter2 durability: mitigasi via `notification_logs` pending-retry + BullMQ di Tahap 2.
6. Estimasi sprint +30% buffer.
7. INDUSTRI = no access Tahap 1 (PKL/BKK baru Tahap 2) — dikonfirmasi eksplisit.

## Bukti Runtime (dokumen = cek konsistensi)

```
grep model schema.prisma  → 7 model ditemukan, semuanya valid
grep role sprint-plan.md  → INDUSTRI, SISWA (keduanya dari 7 role resmi)
grep vector( sprint-plan  → vector(768) di RagChunk ✓
```
