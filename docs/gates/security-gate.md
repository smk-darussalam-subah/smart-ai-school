# Security Gate — DIIS Tahap 0

> **Tujuan:** Memastikan fondasi keamanan sistem DIIS cukup kuat sebelum memulai Tahap 1 (System Design & Core Build).
> Semua 5 kriteria di bawah harus lulus (status ✅) sebelum Kang Sholah memberikan sign-off.
>
> **Sumber:** Laporan System Analyst DIIS, Bab 8.4 | Tanggal laporan: 2026-05-26
> **Deadline:** 9 Juni 2026 (Security Gate)
> **Linear:** SMA-22, SMA-23, SMA-24, SMA-25, SMA-26

---

## Kriteria Kelulusan

### ✅ Kriteria 1 — Validasi Input Aktif (T-01)
**Pernyataan:** Semua request body ke API divalidasi menggunakan Zod schema sebelum menyentuh business logic. Tidak ada endpoint yang bisa menerima payload sembarangan.

**Bukti:**
- [x] `ZodValidationPipe.transform()` sekarang throw `BadRequestException` jika parse gagal — tidak ada pass-through. Lihat `apps/api/src/common/pipes/zod-validation.pipe.ts`
- [x] `ZodPipe(schema)` — per-endpoint pipe — throw `BadRequestException` dengan `errors` array dari Zod. Lihat `apps/api/src/common/pipes/zod-pipe.ts`
- [x] Test result `npx jest --testPathPattern=zod-pipe` → **5 tests PASSED** (SMA-22, 2026-05-26):
  ```
  PASS  apps/api/src/common/pipes/zod-pipe.spec.ts
    ZodPipe
      ✓ returns parsed value when schema is valid (3ms)
      ✓ throws BadRequestException when schema invalid (1ms)
      ✓ includes Zod error details in response (1ms)
      ✓ handles nested object validation (1ms)
      ✓ handles array validation (1ms)
  Tests: 5 passed, 5 total
  ```

**Status:** ✅ LULUS — SMA-22 closed 2026-05-26
**Diverifikasi oleh:** Claude Code (Eksekutor)
**Tanggal verifikasi:** 2026-05-26

---

### ✅ Kriteria 2 — Auth Guard Global Aktif (T-02)
**Pernyataan:** Semua endpoint API terlindungi autentikasi secara default (opt-out model). Endpoint baru yang tidak diberi `@Public()` secara otomatis membutuhkan Keycloak JWT yang valid.

**Bukti:**
- [x] `APP_GUARD` terdaftar di `apps/api/src/app.module.ts` sebagai global guard — semua endpoint protected by default
- [x] `@Public()` decorator tersedia untuk opt-out — dipakai di `/health` endpoint
- [x] Test result `npx jest --testPathPattern=keycloak-guard` → **4 tests PASSED** (SMA-23, 2026-05-26):
  ```
  PASS  apps/api/src/auth/keycloak.guard.spec.ts
    KeycloakGuard
      ✓ allows request with valid JWT (4ms)
      ✓ throws UnauthorizedException when no token (1ms)
      ✓ throws UnauthorizedException when token invalid (1ms)
      ✓ skips auth for @Public() endpoints (1ms)
  Tests: 4 passed, 4 total
  ```
- [x] Keputusan arsitektur dicatat di CLAUDE.md Section 10: "Auth Guard Model — APP_GUARD global, opt-out via @Public()"

**Status:** ✅ LULUS — SMA-23 closed 2026-05-26
**Diverifikasi oleh:** Claude Code (Eksekutor)
**Tanggal verifikasi:** 2026-05-26

---

### ✅ Kriteria 3 — Database Tidak Terekspos ke Internet (T-04)
**Pernyataan:** Port PostgreSQL (5432) dan Redis (6379) tidak dapat diakses dari luar jaringan Docker/VPS. Database hanya dapat direach oleh container dalam Docker network internal.

**Bukti:**
- [x] `infrastructure/docker/docker-compose.yml` (production) — **tidak ada** `ports: ["5432:5432"]` maupun `ports: ["6379:6379"]` pada service `postgres` dan `redis`. Kedua service hanya terekspos di `smk-network` internal. (SMA-25, 2026-05-26)
- [x] `infrastructure/docker/docker-compose.dev.yml` dibuat untuk developer lokal — mapping port 5432 + 6379 hanya ada di file dev ini, tidak di production compose
- [x] Komentar eksplisit di compose: `# ports tidak dimapping — aksesibel hanya via Docker network internal. Dev lokal: gunakan docker-compose.dev.yml atau SSH tunnel ke VPS.`
- [x] UFW di VPS mengizinkan hanya port 22 (SSH), 80 (HTTP), 443 (HTTPS) — port 5432 & 6379 DENY by default (tidak ada rule ALLOW)

**Status:** ✅ LULUS — SMA-25 closed 2026-05-26
**Diverifikasi oleh:** Claude Code (Eksekutor)
**Tanggal verifikasi:** 2026-05-26

---

### ✅ Kriteria 4 — Backup Aktif (T-06)
**Pernyataan:** Terdapat proses backup otomatis database PostgreSQL yang berjalan minimal 1x sehari dan hasilnya tersimpan di lokasi terpisah dari VPS utama (MinIO object storage).

**Bukti:**
- [x] Service `pg-backup` aktif di `docker-compose.yml` — cron `0 19 * * *` (= 02:00 WIB setiap hari)
- [x] Script `infrastructure/docker/scripts/backup.sh` melakukan: `pg_dump → gzip → mc cp ke MinIO bucket` + purge file lebih dari 7 hari
- [x] **Runtime verified 2026-05-27 21:49 WIB** — output VPS dari manual trigger:
  ```
  [pg-backup] Memulai backup database...
  pg_dump: database "diis_db" berhasil di-dump
  File: /tmp/diis_db_2026-05-27_14-49.sql.gz (228.0 KiB)
  Upload ke MinIO: myminio/diis-backup/postgres/2026-05-27_14-49.sql.gz
  Upload selesai. Speed: 8.20 MiB/s
  Backup selesai OK
  ```
- [x] File backup dapat diverifikasi: `mc ls myminio/diis-backup/postgres/` → `2026-05-27_14-49.sql.gz  225KiB`
- [x] Runbook restore tersedia: `docs/runbooks/restore-database.md` — Skenario A (full restore), Skenario B (partial), verifikasi mingguan, troubleshooting

**Status:** ✅ LULUS — SMA-27 closed 2026-05-27 (runtime verified)
**Diverifikasi oleh:** Claude Code (Eksekutor) + Output VPS langsung
**Tanggal verifikasi:** 2026-05-27

---

### ✅ Kriteria 5 — Test Coverage Security-Critical ≥ 70% (T-10)
**Pernyataan:** Fungsi-fungsi kritis keamanan (`verifyToken`, `hasRole`, `KeycloakGuard.canActivate`) memiliki unit test dengan coverage ≥70% di `packages/auth`.

**Bukti:**
- [x] 50 unit tests di `packages/auth/src/__tests__/auth.test.ts` — semua PASS (SMA-28, 2026-05-27)
- [x] **Coverage report** `npx jest --coverage` di `packages/auth`:
  ```
  ----------------------------|---------|----------|---------|---------|
  File                        | % Stmts | % Branch | % Funcs | % Lines |
  ----------------------------|---------|----------|---------|---------|
  All files                   |     100 |      100 |     100 |     100 |
   index.ts                   |     100 |      100 |     100 |     100 |
  ----------------------------|---------|----------|---------|---------|

  Test Suites: 1 passed, 1 total
  Tests:       50 passed, 50 total
  ```
- [x] Coverage threshold enforced di `packages/auth/package.json`: `"lines": 70, "functions": 70, "statements": 70` — threshold wajib dipenuhi atau CI gagal
- [x] CI pipeline (`.github/workflows/ci.yml`) menjalankan test dengan `--coverage` dan upload ke Codecov
- [x] Fungsi yang di-cover: `UserRole` (6 tests), `KeycloakTokenPayloadSchema` (10), `extractAuthUser` (12), `hasRole` (7), `isAdmin` (9), `verifyKeycloakToken` (8)

**Status:** ✅ LULUS — SMA-28 closed 2026-05-27 (100% coverage, threshold ≥70% enforced)
**Diverifikasi oleh:** Claude Code (Eksekutor)
**Tanggal verifikasi:** 2026-05-27

---

## Sign-Off

Gate ini dinyatakan **LULUS** — semua 5 kriteria berstatus ✅ dan bukti runtime terlampir.

| | |
|---|---|
| **Director** | Kang Sholah (Ahmad Sholahuddin) |
| **Tanggal Sign-Off** | 2026-05-28 |
| **Catatan** | Semua 5 blocking security tasks (SMA-22 s/d SMA-28) selesai dan diverifikasi runtime. Fondasi keamanan Tahap 0 solid: input validation fail-secure, auth guard global, DB tidak terekspos, backup 02:00 WIB aktif, coverage 100% (threshold ≥70% enforced di CI). **Tahap 1 — System Design & Core Build diizinkan mulai.** |
| **Berlaku untuk** | Izin mulai Tahap 1 — System Design & Core Build |

---

*File ini dikelola oleh Cowork AI. Update status setiap kali temuan di-close.*
*Terakhir diupdate: 2026-05-28 — Security Gate LULUS, semua 5 kriteria ✅*
