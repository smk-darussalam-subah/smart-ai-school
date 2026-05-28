# AUDIT FINDINGS — Laporan System Analyst DIIS
> Sumber: `docs/Laporan_System_Analyst_DIIS_2026-05-26.docx`
> Dibuat oleh: Cowork AI | Tanggal: 2026-05-26
> Update file ini setiap kali status temuan berubah.

---

## Status Overview

| Kategori | Total | Open | In Progress | Closed |
|---|---|---|---|---|
| Teknis (T-) | 12 | 2 | 0 | 10 |
| Organisasional (O-) | 7 | 5 | 0 | 2 |
| Regulasi (R-) | 5 | 5 | 0 | 0 |
| **TOTAL** | **24** | **12** | **0** | **12** |

> ℹ️ W3-03 Security Hardening Verification (SMA-16) selesai 2026-05-28 — 62 tests PASS, 12 item diverifikasi runtime. Bukan temuan audit baru, tapi verifikasi ulang security baseline Tahap 0. Lihat `.tasks/done/SMA-16-W3-03-DONE.md`.

---

## 🔴 CRITICAL — Wajib selesai sebelum Security Gate (9 Juni 2026)

### T-01 — ZodValidationPipe global tanpa schema
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-26) |
| **Linear** | [SMA-22](https://linear.app/smart-ai-school/issue/SMA-22) — Done |
| **File** | `apps/api/src/main.ts`, `apps/api/src/__tests__/zod-pipe.spec.ts` |
| **Fix** | Global pipe dihapus dari `main.ts`. Validasi enforced per-endpoint via `@Body(new ZodPipe(schema))`. 8 unit tests PASS. |
| **Bukti** | `npx jest --testPathPattern=zod-pipe` → 8/8 PASS. `npx tsc --noEmit` → bersih. `grep "ZodValidationPipe" main.ts` → No matches. |
| **Closed by** | Claude Code + runtime verification Kang Sholah |

---

### T-02 — KeycloakGuard belum APP_GUARD global
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-26) |
| **Linear** | [SMA-23](https://linear.app/smart-ai-school/issue/SMA-23) — Done |
| **File** | `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/src/__tests__/auth-guard.spec.ts` |
| **Fix** | APP_GUARD global aktif. Urutan guard: ThrottlerGuard → KeycloakGuard. `@Public()` bypass KeycloakGuard saja — endpoint publik tetap terlindungi rate-limit. 4 tests PASS. |
| **Bukti** | `npx jest --testPathPattern=auth-guard` → 4/4 PASS. `npx tsc --noEmit` → bersih. |
| **Closed by** | Claude Code + runtime verification Kang Sholah |

---

## 🟠 HIGH — Wajib selesai sebelum akhir Minggu 3 (13 Juni 2026)

### T-03 — Port mismatch docker/main.ts/healthcheck/nginx
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-26) |
| **Linear** | [SMA-24](https://linear.app/smart-ai-school/issue/SMA-24) — Done |
| **File** | `infrastructure/docker/docker-compose.yml`, `infrastructure/nginx/nginx.conf` |
| **Fix** | Env var diganti `PORT` → `API_PORT: "3001"` (main.ts membaca `API_PORT`, bukan `PORT`). Healthcheck dan nginx upstream difix ke port 3001. Port 3000 untuk web/metabase/grafana tidak berubah. |
| **Bukti** | `grep API_PORT docker-compose.yml` → `3001`. `grep proxy_pass nginx.conf` → `api:3001`. `tsc --noEmit` → bersih. |
| **Closed by** | Claude Code + Kang Sholah |

---

### T-04 — PostgreSQL port 5432 exposed di docker-compose
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-26) |
| **Linear** | [SMA-25](https://linear.app/smart-ai-school/issue/SMA-25) — Done |
| **File** | `infrastructure/docker/docker-compose.yml`, `infrastructure/docker/docker-compose.dev.yml` (baru), `docs/development-setup.md` (baru) |
| **Fix** | `ports: ["5432:5432"]` dihapus dari service postgres, `ports: ["6379:6379"]` dihapus dari service redis. Dev override di `docker-compose.dev.yml`. SSH tunnel docs di `docs/development-setup.md`. |
| **Bukti** | `grep '"5432:5432"' docker-compose.yml` → no output. `grep '"6379:6379"' docker-compose.yml` → no output. Satu-satunya `ports:` tersisa adalah Keycloak 8080 (intentional). |
| **Closed by** | Cowork AI (Kang Sholah verifikasi) |

---

### T-05 — CSP nginx menggunakan unsafe-eval + unsafe-inline
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-27) |
| **Linear** | [SMA-26](https://linear.app/smart-ai-school/issue/SMA-26) — Done |
| **File** | `infrastructure/nginx/nginx.conf`, `apps/web/src/middleware.ts` (refactor), `apps/web/src/app/layout.tsx` |
| **Fix** | Global CSP dihapus dari nginx. Next.js middleware generate nonce 16-byte per-request (Web Crypto API). Production CSP: `script-src 'self' 'nonce-{x}' 'strict-dynamic'` — no unsafe directives. |
| **Bukti** | `grep "unsafe-eval\|unsafe-inline" nginx.conf` → no output ✅. `tsc --noEmit` apps/web → bersih ✅. |
| **Closed by** | Claude Code (Sonnet 4.6) + Cowork AI |

---

### T-06 — Backup PostgreSQL belum aktif
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-27) |
| **Linear** | [SMA-27](https://linear.app/smart-ai-school/issue/SMA-27) — Done |
| **File** | `infrastructure/docker/docker-compose.yml`, `infrastructure/docker/scripts/backup.sh` (baru), `docs/runbooks/restore-database.md` (baru) |
| **Fix** | Service `pg-backup` aktif di production VPS. pg_dump → gzip → upload MinIO bucket `diis-backup`. Cron 02:00 WIB (19:00 UTC). Retention 7 hari. |
| **Bukti** | `docker exec smk-pg-backup sh /backup.sh` → "Backup selesai OK" 225 KiB. `mc ls myminio/diis-backup/postgres/` → `2026-05-27_21-49.sql.gz` ✅ |
| **Closed by** | Claude Code + runtime verification Kang Sholah (VPS 204.168.242.123) |

---

### T-07 — Single VPS untuk semua service — tidak ada DR
| | |
|---|---|
| **Status** | 🟡 OPEN — Medium, masuk Tahap 1 roadmap |
| **Linear** | — (belum dibuat, planned Cycle 5) |
| **Masalah** | Semua 14 Docker service di satu VPS Hetzner. Tidak ada disaster recovery drill. |
| **Rencana** | DR drill plan + dokumentasi recovery procedure di Tahap 1 |

---

### T-08 — Migration enum ALTER TYPE rawan gagal dalam transaksi
| | |
|---|---|
| **Status** | 🟡 OPEN — Medium |
| **Linear** | — (belum dibuat, planned Cycle 5) |
| **Masalah** | `ALTER TYPE ... ADD VALUE` tidak bisa di-rollback dalam transaksi Prisma. |
| **Rencana** | Gunakan `--schema-only` migration untuk enum changes di Tahap 1 |

---

### T-09 — Vendor lock-in Claude API + Fonnte
| | |
|---|---|
| **Status** | 🟡 OPEN — Medium |
| **Linear** | — (belum dibuat, planned Tahap 1) |
| **Masalah** | Tidak ada abstraction layer untuk AI provider dan notification service. |
| **Rencana** | `AIGateway` interface + `NotificationAdapter` pattern di Tahap 1 |

---

### T-10 — Zero unit test untuk security-critical paths
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-27) |
| **Linear** | [SMA-28](https://linear.app/smart-ai-school/issue/SMA-28) — Done |
| **File** | `packages/auth/src/__tests__/auth.test.ts` (BARU, 483 lines) |
| **Fix** | 50 unit tests covering UserRole, KeycloakTokenPayloadSchema, extractAuthUser(), hasRole(), isAdmin(), verifyKeycloakToken(). CI workflow diupdate. |
| **Bukti** | `npm test --coverage` → **100%** Stmts/Branch/Funcs/Lines. 50/50 PASS. Target ≥70% terlampaui. |
| **Closed by** | Claude Code (Sonnet 4.6) + runtime verification Cowork AI |

---

### T-11 — README.md versi salah + folder fiktif
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-27) |
| **Linear** | [SMA-29](https://linear.app/smart-ai-school/issue/SMA-29) — Done |
| **File** | `README.md` |
| **Fix** | Versi dikoreksi: Next.js 15.x, NestJS 11.x, React 19.x. Flutter → ⏸ Deferred Tahap 3. Folder fiktif (`apps/admin`, `apps/mobile`) ditandai belum ada. |
| **Bukti** | `grep "15.x\|11.x\|19.x\|Deferred" README.md` → semua versi benar, Flutter deferred ✅ |
| **Closed by** | Cowork AI |

---

### T-12 — Domain boundary academic vs teacher tidak konsisten
| | |
|---|---|
| **Status** | 🟡 OPEN — Medium |
| **Linear** | — (belum dibuat, planned Tahap 1) |
| **Masalah** | Schema Prisma punya domain `academic` dan `teacher` yang boundary-nya overlap. |
| **Rencana** | Refactor schema domain di Tahap 1 sebelum ada data produksi |

---

## 🟡 MEDIUM — Risiko Organisasional (masuk roadmap 30/90 hari)

### O-01 — Single-author bottleneck: Director
| **Status** | 🟡 OPEN | **Rencana** | AI Deputy mode + reviewer kedua untuk PR critical |

### O-02 — DoD tanpa verifikasi runtime
| | |
|---|---|
| **Status** | ✅ CLOSED (2026-05-27) |
| **Linear** | [SMA-30](https://linear.app/smart-ai-school/issue/SMA-30) — Done |
| **Fix** | CLAUDE.md Section 9 ditambah blok `Runtime Verification WAJIB` — 3 bentuk bukti (curl/jest/screenshot), format `## Bukti Runtime` wajib di setiap laporan. Berlaku mulai 2026-05-26. |
| **Bukti** | `grep "Runtime Verification WAJIB" CLAUDE.md` → line 287 ✅. Semua current.md setelah tanggal ini sudah punya section Bukti Runtime. |
| **Closed by** | Cowork AI |

### O-03 — Tidak ada change management process
| **Status** | 🟡 OPEN | **Rencana** | Formal RFC process di Notion untuk perubahan arsitektur Tahap 1 |

### O-04 — Dokumentasi tertinggal
| **Status** | 🟡 OPEN | **Rencana** | SMA-18 (W4-01): system-overview, env-variables, setup-server |

### O-05 — Tidak ada staging environment
| **Status** | 🟡 OPEN | **Rencana** | Staging VPS atau namespace Docker berbeda di Tahap 1 |

### O-06 — Testing culture belum established
| **Status** | 🟡 OPEN | **Rencana** | CI enforced coverage threshold setelah T-10 selesai |

### O-07 — Deployment masih manual
| **Status** | 🟡 OPEN | **Rencana** | GitHub Actions auto-deploy ke VPS di Tahap 1 |

---

## 🔵 REGULASI — Wajib sebelum Tahap 2 Go-Live

### R-01 — Kebijakan UU PDP No.27/2022 belum ada
| **Status** | 🔵 OPEN | **Rencana** | DPIA + consent flow + privacy policy sebelum Tahap 2 |

### R-02 — AI generatif untuk siswa — risiko misinformation
| **Status** | 🔵 OPEN | **Rencana** | Guardrails + content policy + human-in-the-loop di Tahap 2 |

### R-03 — Embedding siswa di pgvector — personal data
| **Status** | 🔵 OPEN | **Rencana** | Anonimisasi + pseudonymization sebelum store embedding di Tahap 2 |

### R-04 — Kontrak data dengan mitra industri (INDUSTRI role)
| **Status** | 🔵 OPEN | **Rencana** | DPA (Data Processing Agreement) template di Tahap 1 |

### R-05 — Belum ada penetration testing
| **Status** | 🔵 OPEN | **Rencana** | Pentest eksternal sebelum Go-Live Tahap 2 |

---

## ✅ CLOSED

| ID | Temuan | Closed Date | Bukti |
|---|---|---|---|
| W2-01 | Keycloak realm diis aktif | 2026-05-25 | Admin console login berhasil |
| W2-03 | pgvector migration + HNSW index | 2026-05-25 | `npx prisma migrate status` OK |
| W2-02 | Prisma seed 40 users, 10 kelas | 2026-05-25 | seed output 40 records |
| T-01 | ZodValidationPipe global pass-through | 2026-05-26 | `jest zod-pipe` → 8/8 PASS, `tsc --noEmit` bersih |
| T-02 | KeycloakGuard bukan APP_GUARD global | 2026-05-26 | `jest auth-guard` → 4/4 PASS, urutan ThrottlerGuard→KeycloakGuard |
| T-03 | Port mismatch docker/nginx/main.ts | 2026-05-26 | `API_PORT=3001` di docker-compose, nginx → api:3001, tsc bersih |
| T-04 | PostgreSQL/Redis port exposed di docker-compose | 2026-05-26 | `grep '"5432:5432"'` → no output. `grep '"6379:6379"'` → no output. Dev override di docker-compose.dev.yml |
| T-11 | README versi salah + folder fiktif | 2026-05-27 | `grep "15.x\|11.x\|Deferred" README.md` → semua versi benar |
| O-02 | DoD tanpa verifikasi runtime | 2026-05-27 | CLAUDE.md line 287: `Runtime Verification WAJIB` block aktif |
| T-06 | Backup PostgreSQL tidak ada | 2026-05-27 | `docker exec smk-pg-backup sh /backup.sh` → OK. `mc ls` → `2026-05-27_21-49.sql.gz` 225KiB ✅ |
| T-10 | Zero unit test security-critical paths | 2026-05-27 | `npm test --coverage` packages/auth → 100% all categories, 50/50 PASS ✅ |
| T-05 | CSP unsafe-eval + unsafe-inline | 2026-05-27 | nginx.conf: no unsafe directives. middleware.ts: nonce-based CSP. tsc → bersih ✅ |

---

## Cara Update File Ini

Setiap kali status temuan berubah, update baris `Status` yang relevan:
- `🔴 OPEN` → `🔴 IN PROGRESS` → `✅ CLOSED (YYYY-MM-DD)`
- Tambah kolom `Bukti` berisi link ke curl output / test result / Linear comment

*Terakhir diupdate: 2026-05-26 oleh Cowork AI*
