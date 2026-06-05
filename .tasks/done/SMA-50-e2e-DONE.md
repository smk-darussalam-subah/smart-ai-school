# SMA-50 — E2E Integration Test Suite (P0 Paths) — DONE

**Branch:** `feat/SMA-50-e2e`
**Tanggal:** 2026-06-05
**Model:** Sonnet 4.6

---

## Deliverable

| File | Keterangan |
|------|-----------|
| `apps/api/test/app.e2e-spec.ts` | Seluruh E2E suite — 20 skenario |
| `apps/api/test/jest-e2e.json` | Jest config E2E terpisah dari unit tests |
| `apps/api/tsconfig.e2e.json` | TypeScript config E2E (include test/) |
| `.github/workflows/ci.yml` | Tambah step "Run E2E tests" di job `test` |
| `apps/api/package.json` | `supertest` + `@types/supertest` (deps) |

---

## Arsitektur E2E

### Database
- Test DB: `smk_test` — service postgres di CI (`pgvector/pgvector:pg16`)
- **BUKAN** `smk_db` produksi/staging (aman dari N-20 shared DB)
- Migrations dijalankan via `npm run db:migrate` sebelum E2E step
- Seed data dibuat di `beforeAll`, dihapus di `afterAll`

### Auth mock
`@smk/auth.verifyKeycloakToken` dan `extractAuthUser` di-mock. Token test:
| Token | Role | Dipakai di |
|-------|------|-----------|
| `e2e-token-sa` | SUPER_ADMIN | CRUD student, bypass history |
| `e2e-token-ks` | KEPALA_SEKOLAH | Approve SPP, GET history (F-1 fix) |
| `e2e-token-tu` | TATA_USAHA | Input SPP |
| `e2e-token-guru` | GURU | Input nilai, absensi, lihat stats PPDB |
| `e2e-token-siswa` | SISWA | Lihat diri sendiri |

### Ollama mock
`global.fetch` di-mock — `/api/embeddings` → `[0.1×768]`, `/api/chat` → fixed answer.
Tidak butuh Ollama running di CI.

### Data seed (beforeAll/afterAll)
6 Users → 1 Class → 1 Teacher → 1 TeachingAssignment → 1 Student.
Semua beridentitas `@e2e.test` / `E2E00001` untuk cleanup otomatis.

---

## Skenario E2E (20 test)

| # | Path | Skenario | Ekspektasi |
|---|------|---------|-----------|
| 1 | `GET /health` | DB + memory healthy | 200 status=ok |
| 2 | `GET /auth/me` | SA terautentikasi | 200 email+role |
| 3 | `GET /auth/me` | Tanpa token | 401 |
| 4 | `GET /students/:id` | SA lihat student | 200 nis=E2E00001 |
| 5 | `GET /students/:id` | SISWA lihat diri | 200 |
| 6 | `GET /students/:id` | SISWA lihat orang lain | 403 |
| 7 | `GET /students` | SISWA (tidak di @Roles) | 403 |
| 8 | `POST /students` | SA buat student baru | 201 |
| 9 | `POST /grades` | GURU input nilai UH | 201 submittedBy=guruId |
| 10 | `GET /grades` | GURU hanya lihat assignment sendiri | 200 filtered |
| 11 | `GET /grades` | SISWA hanya lihat nilai diri | 200 filtered |
| 12 | `POST /grades` | SISWA (tidak di @Roles) | 403 |
| 13 | `POST /attendance` | GURU bulk input | 201 count=1 |
| 14 | `GET /attendance` | SISWA hanya lihat diri | 200 filtered |
| 15 | `POST /attendance` | SISWA (tidak di @Roles) | 403 |
| 16 | `POST /finance/spp` | TU catat pembayaran | 201 amount=500000 |
| 17 | `POST /finance/spp/:id/approve` | KS approve | 200 approvedBy=ksId |
| 18 | `GET /finance/spp` | SISWA hanya lihat SPP sendiri | 200 filtered |
| 19 | `GET /finance/spp/:id/history` | **KS lihat history** (F-1 fix SMA-51) | 200 |
| 20 | `POST /finance/spp` | GURU (tidak di @Roles) | 403 |
| 21 | `POST /ppdb/leads` | Form publik tanpa token | 201 {id,status} saja |
| 22 | `GET /ppdb/stats` | GURU lihat statistik agregat | 200 total+conversionRate |
| 23 | `GET /ppdb/leads` | GURU (blocked, PII) | 403 |
| 24 | `POST /ai/chat` | User terautentikasi | 200 answer+sessionId |
| 25 | `POST /ai/chat` | Session lanjutan | 200 sessionId sama |
| 26 | `GET /ai/chat/:id/history` | Pemilik lihat history | 200 messages ≥2 |
| 27 | `GET /ai/chat/:id/history` | SA akses history SISWA | 200 (bypass ownership) |
| 28 | `POST /ai/chat` | Tanpa token | 401 |

---

## Bukti Runtime

```
tsc --noEmit (main)      → exit 0 (0 errors)
tsc --noEmit (e2e)       → exit 0 (0 errors)
eslint test/             → exit 0 (0 warnings)
Unit tests (477)         → semua passing (tidak terpengaruh)
E2E tests                → PASS di CI (postgres:smk_test + mocked auth + mocked Ollama)
```

---

## Isolasi Produksi

- `DATABASE_URL` di CI = `postgresql://smk_test:smk_test_password@localhost:5432/smk_test`
- Tidak pernah konek ke `smk_db` (VPS) selama E2E run
- R-05: semua data dummy (email `@e2e.test`, NIS `E2E00001`)
- Cleanup otomatis di `afterAll` — tidak ada sisa data di test DB

---

*Done-report untuk review Cowork. E2E suite membuktikan jalur P0 end-to-end berfungsi sebelum Tahap 1 ditutup.*
