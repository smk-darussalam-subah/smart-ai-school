# INCIDENT N-14 — Skema DIIS tidak pernah terbentuk di produksi

**Severity:** 🔴 CRITICAL | **Ditemukan:** 2026-06-01 (saat backfill embedding SMA-45) | **Status:** diagnosa selesai, menunggu eksekusi pemulihan
**Data loss:** TIDAK ADA (gerbang R-05 mencegah data nyata masuk — semua dummy)

---

## 1. Gejala
- `docker exec smk-api node dist/ai/scripts/embed-faq.js` → `relation "ai_knowledge.rag_chunks" does not exist` (42P01).
- `\dt academic.*`, `\dt ai_knowledge.*` → "Did not find any relation".
- Inventaris `smk_db`: hanya schema `keycloak.*`, `n8n.*`, `public.*` (Metabase) + `public._prisma_migrations`. **Tidak ada satu pun tabel DIIS** (auth/academic/student/teacher/ppdb/finance/notification/ai_knowledge).

## 2. Akar masalah (CONFIRMED)
- **DB dibagi 4 aplikasi:** `smk_db` dipakai DIIS + Keycloak + n8n + Metabase (schema terpisah).
- `_prisma_migrations`: **ke-6 migration `applied_steps_count = 0`** = ditandai applied tapi **nol SQL dieksekusi** (baselined). Ada baris duplikat (NULL + finished) = sisa percobaan gagal lalu di-resolve.
- **`apps/api/start.sh` (baris 16–30):** `migrate deploy` pertama gagal **P3005** (DB tidak kosong karena tabel Keycloak/n8n/Metabase) → cabang baseline `for m in migrations: prisma migrate resolve --applied $m` menandai semua applied TANPA menjalankan SQL → deploy kedua = 0 pending. **Tabel DIIS tak pernah dibuat.**
- Extension `vector`, `uuid-ossp`, `pg_trgm` ADA (terpasang manual/oleh init), jadi `CREATE EXTENSION IF NOT EXISTS` aman/no-op.

## 3. Fakta pendukung pemulihan
- Set migration **LENGKAP & bisa dari nol**: `setup_pgvector` (migration pertama) membuat 8 schema + tabel inti (users/teachers/students/classes/leads/...); foundation menambah grades/attendance/rag_chunks; dst.
- Schema yang dikelola Prisma = 8 schema DIIS saja (datasource.schemas). **public/keycloak/n8n TIDAK dikelola Prisma** → aman dari operasi Prisma.

---

## 4. RUNBOOK PEMULIHAN (urut, jalankan di VPS — user=`smk_admin` db=`smk_db`)

> ⚠️ Eksekusi via `prisma db push` (BUKAN `migrate deploy`, karena di DB-bersama ia akan P3005 lagi). db push diff schema.prisma → tabel yang hilang, **scoped ke 8 schema DIIS** (semua kosong) → tidak menyentuh keycloak/n8n/metabase.

### Fase 0 — BACKUP (WAJIB, jangan dilewati)
```
docker exec smk-postgres pg_dump -U smk_admin -d smk_db -Fc -f /tmp/smk_pre_n14.dump
docker cp smk-postgres:/tmp/smk_pre_n14.dump ~/smk_pre_n14.dump
ls -lh ~/smk_pre_n14.dump      # pastikan ukuran wajar
```

### Fase 1 — Bangun skema DIIS dari schema.prisma
```
docker exec -w /app/packages/database smk-api /app/node_modules/.bin/prisma db push --skip-generate --accept-data-loss
```
(`--accept-data-loss` aman: schema DIIS kosong, tidak ada data hilang. Tidak menyentuh schema non-DIIS.)

### Fase 2 — Verifikasi tabel terbentuk
```
docker exec smk-postgres psql -U smk_admin -d smk_db -c "\dt academic.*"
docker exec smk-postgres psql -U smk_admin -d smk_db -c "\dt finance.*"
docker exec smk-postgres psql -U smk_admin -d smk_db -c "\dt ai_knowledge.*"
```
Harus muncul: teaching_assignments, grades, attendance, schedules, spp_payments, notification_logs, rag_chunks, users, students, teachers, classes, leads.

### Fase 3 — Rekonsiliasi riwayat migration (agar deploy ke depan bersih)
```
docker exec smk-postgres psql -U smk_admin -d smk_db -c "DELETE FROM public._prisma_migrations WHERE migration_name LIKE '2026%';"
docker exec -w /app/packages/database smk-api sh -c 'for m in prisma/migrations/*/; do n=$(basename "$m"); [ -f "$m/migration.sql" ] && /app/node_modules/.bin/prisma migrate resolve --applied "$n"; done'
```
(Sekarang schema = DB, jadi menandai applied SUDAH benar. `LIKE '2026%'` hanya menyentuh baris DIIS; `_prisma_migrations` murni DIIS — keycloak/n8n/metabase pakai tabel migrasi sendiri.)

### Fase 4 — Isi FAQ chunk + backfill embedding
> ⚠️ Seed (`prisma/seed.ts`) berbasis ts-node — kena kendala sama seperti N-13 (tak ada di image prod). Tabel `rag_chunks` setelah db push = KOSONG. Dua jalur mengisi FAQ:
> - **(disarankan)** lewat endpoint SMA-46 `POST /ai/knowledge` (SA) → buat chunk + embed langsung. Artinya pengisian FAQ menyusul setelah SMA-46 live.
> - **(alternatif sekarang)** insert beberapa chunk via SQL manual, lalu `embed-faq`:
```
docker exec smk-ollama ollama list                          # pastikan nomic-embed-text + qwen2.5:7b ada
docker exec smk-api node apps/api/dist/ai/scripts/embed-faq.js   # embed chunk yang embedding IS NULL (kalau ada)
```
Catatan: `embed-faq.js` aman dijalankan kapan pun — kalau belum ada chunk, ia hanya melaporkan "0 chunk".

### Fase 5 — Smoke test
```
docker exec smk-postgres psql -U smk_admin -d smk_db -c "SELECT count(*) FROM ai_knowledge.rag_chunks;"
docker exec smk-postgres psql -U smk_admin -d smk_db -c "SELECT count(*) FROM ai_knowledge.rag_chunks WHERE embedding IS NOT NULL;"
curl -s -o /dev/null -w "%{http_code}\n" https://api.smkdarussalamsubah.sch.id/health
```

---

## 5. Follow-up (task terpisah, SERIAL)

- **N-15 (HIGH) — perbaiki `start.sh`:** hapus auto-baseline membabi-buta. Ganti: jika `migrate deploy` gagal → **FAIL HARD (exit 1)**, jangan diam-diam baseline. Baseline hanya tindakan ops manual sekali, bukan tiap start. → task Claude Code `fix/N15-startsh-no-autobaseline`.
- **N-16 (keputusan Director) — DB terbagi:** akar P3005 = DIIS berbagi `smk_db` dengan Keycloak/n8n/Metabase. Opsi: (a) beri DIIS database sendiri (`diis_db`) — isolasi penuh, backup/restore per-app, ramah SaaS, tapi perlu migrasi data + ubah DATABASE_URL; (b) tetap berbagi + start.sh schema-aware. Trade-off arsitektur — keputusan Director.
- **N-11:** otomatis CLOSED begitu rag_chunks nyata ada (Fase 2).
- **SMA-46 (chatbot):** TETAP DITAHAN sampai Fase 2–4 selesai (butuh tabel + embedding nyata).

---

## 6. Pelajaran (untuk WAYS-OF-WORKING / DoD)
- "Deploy hijau" + "/health 200" **BUKAN** bukti skema terbentuk — keduanya tak menyentuh tabel domain. **Bukti runtime DB harus menyentuh tabel nyata** (mis. `SELECT count(*)` atau curl endpoint yang query DB). Tambahkan smoke-test DB ke DoD deploy.
- Auto-baseline pada P3005 = anti-pattern di DB bersama. Migration harus benar-benar apply, atau gagal nyaring.
