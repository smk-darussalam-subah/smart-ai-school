# SMA-53 — API Documentation — DONE

**Tanggal:** 2026-06-07
**Branch:** `feat/SMA-53-api-docs`
**PR:** → develop
**Tipe:** Dokumentasi saja — TIDAK ada perubahan kode runtime

---

## Grounding yang Dibaca

- Seluruh 11 controller: `auth`, `student`, `ppdb`, `teaching-assignment`, `grade`, `attendance`, `schedule`, `finance`, `ai`, `health`, `metrics`
- Seluruh 24 DTO file (Zod schema → field + tipe + validasi)
- `apps/api/src/main.ts` — global prefix `api/v1`, exclude `health` + `metrics`
- `apps/api/src/ai/ai.module.ts` + `ai.service.ts` + `claude.adapter.ts` — R-03 decision tree
- `CLAUDE.md §6` — matriks role 7 roles
- `docs/WAYS-OF-WORKING.md` — Git flow

---

## Deliverable

### `docs/api/api-reference.md` (dibuat baru)

Tabel per modul, setiap endpoint:
- Method · Path lengkap (dengan `/api/v1/...`) · Roles (@Roles) · Auth (JWT vs PUBLIC)
- Request DTO (field + tipe ringkas, wajib **ditebalkan**, opsional tidak)
- Response ringkas · Catatan RBAC / ownership / rate limit / error codes

### `README.md` (diperbarui)

Ditambah satu baris link ke `docs/api/api-reference.md` di section Dokumentasi.

---

## Verifikasi Jumlah Endpoint per Modul

| Modul | Controller | Endpoint Terdokumentasi | Endpoint di Controller |
|---|---|---|---|
| Auth | `auth.controller.ts` | 2 | 2 (`GET /me`, `PATCH /me`) ✓ |
| Students | `student.controller.ts` | 7 | 7 (`GET list`, `GET :id`, `POST`, `PATCH :id`, `DELETE :id`, `GET :id/grades`, `GET :id/attendance`) ✓ |
| PPDB | `ppdb.controller.ts` | 6 | 6 (`POST leads`, `GET leads`, `GET stats`, `GET leads/:id`, `PATCH leads/:id/status`, `PATCH leads/:id/assign`) ✓ |
| Teaching Assignment | `teaching-assignment.controller.ts` | 5 | 5 (`GET list`, `GET :id`, `POST`, `PATCH :id`, `DELETE :id`) ✓ |
| Grades | `grade.controller.ts` | 3 | 3 (`POST`, `GET list`, `PATCH :id`) ✓ |
| Attendance | `attendance.controller.ts` | 2 | 2 (`POST bulk`, `GET list`) ✓ |
| Schedules | `schedule.controller.ts` | 2 | 2 (`GET list`, `POST`) ✓ |
| Finance | `finance.controller.ts` | 5 | 5 (`POST`, `GET list`, `GET summary`, `GET :studentId/history`, `POST :id/approve`) ✓ |
| AI | `ai.controller.ts` | 10 | 10 (`POST chat`, `GET history`, `GET knowledge`, `POST knowledge`, `POST backfill`, `GET knowledge/:id`, `PATCH knowledge/:id`, `POST publish`, `POST unpublish`, `DELETE knowledge/:id`) ✓ |
| Health | `health.controller.ts` | 1 | 1 (`GET /health`) ✓ |
| Metrics | `metrics.controller.ts` | 1 | 1 (`GET /metrics`) ✓ |
| **Total** | | **44** | **44** ✓ |

Notification: tidak ada HTTP endpoint — internal service only.

---

## Gerbang Khusus yang Ditandai

- **SPP separation of duties** — TU catat, SA/KS approve. TU tidak bisa approve transaksi sendiri.
- **PPDB GURU hanya `/stats`** — GURU tidak boleh akses `/leads` (PII: nama + HP calon siswa).
- **AI R-03 decision tree** — PII → Ollama paksa. Non-PII + claude configured → ClaudeAdapter + PII-strip. Default = Ollama. Embedding selalu Ollama.
- **AI Knowledge publish gate** — embedding non-NULL wajib ada sebelum publish. SA/KS only.
- **Grade window 7 hari** — GURU edit nilai hanya ≤7 hari sejak input.
- **Rate limit khusus** — auth 15/min, PPDB submit 10/5min, AI chat 20/min.

---

## Constraint

- ✅ TIDAK ada perubahan controller atau DTO
- ✅ Semua endpoint berdasarkan kode aktual (bukan asumsi)
- ✅ DTO field diverifikasi dari Zod schema
- ✅ Prefix `/api/v1` diverifikasi dari `main.ts` (`exclude: ['health', 'metrics']`)
- ✅ R-03 behavior diverifikasi dari `ai.module.ts` + `ai.service.ts` + `claude.adapter.ts`

---

## Catatan Tahap 2

Swagger interaktif (`@nestjs/swagger`) di-defer ke Tahap 2 — decorator churn tidak diperlukan saat penutupan Tahap 1. Referensi ini cukup sebagai sumber kebenaran untuk integrasi frontend.

---

## DoD Checklist

- [x] Semua 11 controller dibaca (44 endpoint terdokumentasi)
- [x] Semua 24 DTO dibaca (field + tipe akurat)
- [x] `docs/api/api-reference.md` dibuat
- [x] README.md diperbarui dengan link
- [x] Jumlah endpoint terverifikasi cocok dengan controller
- [x] Gerbang khusus (SPP SoD, PPDB GURU, R-03, grade window) ditandai
- [x] TIDAK ada perubahan kode runtime
- [x] Done report ini
- [ ] CI hijau setelah merge
