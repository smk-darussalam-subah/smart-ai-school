# Combined PostgreSQL Dry-Run Preflight Re-review

Tanggal: 2026-07-27
Peran: reviewer independen
Scope: keputusan fail-closed dan kesiapan handoff operator untuk dry-run TF2 + Appointment Wave B + Wave C.
Status: **FOLLOW-UP REQUIRED**

## Putusan

**FOLLOW-UP REQUIRED**

Penghentian dry-run oleh executor sudah benar dan tidak ada migration atau koneksi database yang dijalankan. Namun manifest migration pada laporan preflight belum konsisten dengan keputusan arsitektur Wave C final. Handoff operator harus diperbarui sebelum database disposable tersedia; jika tidak, evidence dry-run berisiko memvalidasi scope yang salah.

Keyakinan reviewer: **96%** untuk status prerequisite lokal dan ketidakkonsistenan manifest. Tidak ada klaim tentang keadaan database staging/live.

## Finding

### [P1] Manifest dry-run masih memasukkan migration outbox yang telah dicabut

`COMBINED-POSTGRES-DRY-RUN-PREFLIGHT-2026-07-27.md` menyatakan target mencakup `20260725000001_appointment_outbox_wave_c`. Ini bertentangan dengan keputusan Director Option A dan laporan arsitektur Wave C, yang menyatakan model, processor, dan migration outbox uncommitted telah dihapus.

Evidence saat re-review:

- `docs/audits/WAVEC-APPOINTMENT-ARCHITECTURAL-REMEDIATION-2026-07-27.md:14` dan `:94` menyatakan outbox/migration dicabut.
- Tidak ada `AppointmentOutboxEvent`, `appointment_outbox_events`, atau `AppointmentOutbox` pada schema Prisma maupun production source saat ini.
- `git ls-files` tidak memuat migration outbox tersebut dan `migration.sql` tidak tersedia sebagai file source yang dapat dijalankan.
- Migration Wave C yang benar-benar tersedia untuk perubahan final adalah `packages/database/prisma/migrations/20260727000001_appointment_capacity_wave_c_architecture/migration.sql`.

Impact:

- Operator dapat mencoba memvalidasi artefak yang sudah tidak menjadi bagian dari model final, atau menyimpulkan gate Wave C lulus tanpa menguji capacity trigger yang justru masih berlaku.
- Prompt operator lama juga hanya mendeskripsikan TF2 + Wave B dan menunjuk baseline `develop@37d41e6`; ia tidak boleh dipakai verbatim untuk scope Wave C final.

Required follow-up:

1. Perbarui laporan preflight dan buat handoff operator V2 dengan manifest final, berurutan menurut timestamp:
   - `20260722000001_tf2_p1_1_zombie_permissions`
   - `20260724000001_appointment_governance_wave_b`
   - `20260727000001_appointment_capacity_wave_c_architecture`
2. Nyatakan secara eksplisit bahwa outbox **bukan** bagian target dan tidak boleh dibuat/manual-applied.
3. Tambahkan proof Wave C capacity trigger: capacity satu pemangku, kapasitas dua wakil yang diizinkan, kandidat terbuka melampaui kapasitas ditolak, dan rollback/restore rehearsal setelah trigger ada.
4. Operator harus memakai salinan source yang tepat dari worktree final, dengan hash untuk tiga `migration.sql` serta `schema.prisma`. Jangan mengandalkan SHA `develop` lama karena Wave C belum melalui Git gate.

## Preflight Runtime Yang Diterima

- `DATABASE_URL` tidak tersedia.
- `psql`, `pg_dump`, dan `pg_restore` tidak ditemukan di environment ini.
- Docker CLI ada tetapi daemon tidak reachable.
- Tidak ada snapshot PostgreSQL repo-local yang dapat dipakai.
- Tidak ada `prisma migrate deploy`, SQL apply, script dry-run, koneksi staging/live, n8n, Git, atau deploy yang dijalankan.

Fail-closed pada kondisi ini adalah benar. Database kosong bukan substitusi untuk migration reconciliation pada snapshot staging yang representatif.

## Urutan Setelah Follow-up Dokumentasi

1. Prompt Architect membuat handoff operator V2 yang mencerminkan tiga migration final dan manifest hash.
2. Operator VPS atau executor dengan environment PostgreSQL membuat restore disposable dari snapshot staging, dengan nama yang jelas mengandung `dryrun` atau `copy`.
3. Verifikasi target bukan staging/live sebelum migration.
4. Jalankan pre-count, apply tiga migration final, post-reconciliation, proof index/capacity/quarantine/lifecycle, lalu restore rehearsal schema + data.
5. Kembalikan report PII-minimal ke reviewer. Git packaging tetap tertutup sampai evidence ini diterima.

## Batas Review

Reviewer tidak menjalankan perintah database, tidak mengubah source/migration, dan tidak melakukan Git, n8n, Keycloak, VPS, deploy, atau browser QA.
