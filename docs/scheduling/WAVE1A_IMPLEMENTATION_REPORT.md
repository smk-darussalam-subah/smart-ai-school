# DIIS Smart Scheduling — Wave 1A implementation

8 Oktober 2026. **SOURCE COMPLETE — INDEPENDENT REVIEW / STAGING HOLD**, terbatas pada fondasi draft Wave 1A. Bukan selesainya program Smart Scheduling, bukan hasil solver sekolah, dan bukan deployment.

## Scope dan persetujuan

User menyetujui dengan pesan **“ya saya setuju”** setelah ditawarkan tiga tabel additive, API internal, audit/idempotency dan PostgreSQL disposable lokal; tanpa dependency baru atau perubahan jadwal aktif. Binding persetujuan: `approval.json` pada folder evidence berikut.

Checkout: `C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-jp-presensi-20261006`.
HEAD tetap `cf1b8f1514408152230f72ff51d87dd6d789f258`; tree HEAD `34dde202a9f0d6c87a64d13dc867f897a4bb2d3b`. Implementasi berada di **working tree**, bukan commit baru.

Kontrak approved: `.tasks/evidence/smart-scheduling-wave1a-contract-20261008/contract.json`, SHA-256 `f3bfad23ac482d409dbd14845544fbe479ce89302f559291d64b2adbf5c2277b`. Kontrak proposal dibekukan; status persetujuan/implementasi baru dicatat terpisah, bukan menulis ulang evidence lama.

Literal scope **17 path: 3 modify, 14 add termasuk laporan ini**, sesuai `proposedFiles` kontrak. Before-binding, LF-normalized before copies, manifest 17 path dan union source 104 path disimpan di:
`.tasks/evidence/smart-scheduling-wave1a-implementation-20261008/`.

Original reviewed 90-path source manifest dibekukan. Hanya schema, seed permission definitions dan AppModule dari set itu berubah sesuai persetujuan; **87 path lainnya tetap byte-identical**. Before copies tidak diklaim binary-identical terhadap sumber CRLF: SHA raw original dan SHA copy dicatat terpisah. Git index kosong; tidak ada staging/commit/push/PR/merge.

## Hasil implementasi

- Tiga tabel terpisah: SchedulingVersion, SchedulingVersionSlot, SchedulingMutationReceipt. Root DRAFT/ARCHIVED dan MANUAL saja. FK semester compound/RESTRICT; slot/receipt terikat root; assignment/group scalar snapshot references sehingga master legacy dapat diperbaiki/dihapus tanpa FK draft baru.
- Internal API `/api/v1/scheduling/drafts`: daftar/detail, create kosong, rename, replace seluruh slot, pure precheck, soft archive. Tidak ada import/generate/run/candidate/publish/restore/delete endpoint.
- Flag `SMART_SCHEDULER_ENABLED` hanya aktif untuk literal `true`; default off. Akses foundation Super Admin saja dengan permission definitions baru. Tidak ada grant TU/WAKA/siswa/orang tua; tujuh base roles tidak diubah.
- Mutasi READ COMMITTED: schedule-domain advisory lock → cutover → root row lock bila ada → identity mutex/fresh account-role-permission → receipt/revision checks → domain write/audit/receipt dalam satu transaksi. Role/akun yang dicabut ketika request menunggu tidak dapat memakai authority lama.
- Expected revision menghindari lost updates. Actor/operation/key dan canonical request binding membuat replay tepat satu domain operation; key sama/body berbeda conflict. Replay memeriksa authority dahulu dan mengembalikan **ack lama**, bukan revision terbaru.
- Snapshot readiness ditangkap dalam satu MVCC SQL statement; digest live dibandingkan dengan snapshot draft. Simpan/replay bukan sertifikat validitas dan tidak menjadikan draft publishable. Rename tidak diam-diam mengganti provenance.
- Pure precheck memakai DB read-only transaction; SkipAudit hanya pada handler validasi. Semua jalur valid/invalid/error tetap zero-write. HTTP audit mutative tetap observational/fail-soft; domain success audit atomik dan metadata minimal, bukan file/token/PII siswa.
- Penugasan produktif guru berbeda dalam kelas/mapel sama tetap bagian berurutan dengan target JP terpisah. Overflow, session index duplikat, identitas/scope invalid dan class/teacher overlap ditolak.
- Profil JP dipilih untuk **setiap tanggal occurrence periode pilihan**, bukan hari ini. JP bervariasi, durasi tidak dipaksa 40 menit, sesi tidak menyeberangi gap/BREAK. Hari libur menghapus occurrence, bukan seluruh weekday template.
- Hanya binding concurrency baseline resmi yang persis, lengkap dan belum expired dapat dipertahankan; tidak membuat pengecualian baru/memperluas izin dan tidak melegalkan class collision. Jadwal kelas di luar scope menjadi occupancy tetap.
- Label ruang mendeteksi collision sederhana; capacity PC/zona/alat/safety dan availability terstruktur tetap **NOT_VERIFIED**, solverStatus null, publishable false. Dua kelompok TKR tidak diterjemahkan menjadi kapasitas otomatis dua kelas; TSM belum tersedia.

Ceiling teknis configurable: 1.000 slot/batch, 256 kelas/scope, tambahan defensive 370 hari occurrence untuk membatasi kerja kalender sebelum query berat. Batas hari bukan kebijakan kurikulum; dapat dikonfigurasi lewat `SMART_SCHEDULER_MAX_DRAFT_DAYS` dan rentang tetap wajib berada dalam semester terdaftar. Tidak menaikkan global body limit. Occupancy diperiksa per identity/day, termasuk label ruang dan fixed external schedules; tidak men-scan semua pasangan slot lintas identitas.

## Bukti Runtime

Semua data uji sintetik lokal. API memakai controller Fastify, PermissionGuard/RolesGuard, audit interceptor, service dan PostgreSQL nyata. Hanya authentication seam dan panggilan external Keycloak pada lifecycle fixture yang sintetik; ini **bukan** proof JWT/provider production.

| Pemeriksaan final | Hasil | Evidence |
|---|---|---|
| Focused API + regresi JP/presensi | **135/135**, 9 suites, exit 0 | api-focused.log |
| Regresi Web jadwal/presensi/auth shell | **24/24**, 4 suites, exit 0 | web-regression-final.log |
| PostgreSQL 6 Oktober, PS5.1 | **34/34**, migrate/test exit 0 | postgres-2026-10-06-ps5-diis_wave1a_20261008181132_c8f51fd0.log + .json |
| PostgreSQL 13 Oktober, PS5.1 | **34/34**, migrate/test exit 0 | postgres-2026-10-13-ps5-diis_wave1a_20261008181343_dddabe88.log + .json |
| PostgreSQL 6 Oktober, PS7 | **34/34**, migrate/test exit 0 | postgres-2026-10-06-ps7-diis_wave1a_20261008181352_c776cfcb.log + .json |
| PostgreSQL 13 Oktober, PS7 | **34/34**, migrate/test exit 0 | postgres-2026-10-13-ps7-diis_wave1a_20261008181142_cc91bfd5.log + .json |
| Target guard matrix kedua engine | **14/14 status sesuai**, termasuk 12 refusal | target-control-ps5/ps7-*.log |
| Native stderr PASS / genuine failure / missing exe / log failure | Kedua engine exit 0/17 benar, caller Stop terjaga | native-controls-ps5/ps7.json + .log |
| Prisma validate/generate; API/database type-check; API lint; API/database build | **PASS, native exit 0** | build-checks.log |
| Whitespace/delta completion sweep | PASS, 87 protected source paths unchanged, staged 0 | manifest/verification |

Ini hasil terarah, bukan rerun semua suite proyek atau browser baru. No UI delta: tidak mengklaim visual/mobile/browser QA baru, tidak mengubah preview pengguna di port 3107.

Empat run PostgreSQL final memeriksa SHA-256 **16 file source/test/runner** sebelum dan sesudah run; semua unchanged dan cocok dengan manifest final. Laporan ini adalah path ke-17 dan dikecualikan dari binding runtime karena berisi hasil run. Raw log, engine/date/native exit, source hashes dan manifest disatukan dalam `run-bindings.json`; bukti lama tetap retained, bukan diganti menjadi PASS.

Runtime proof utama: competing revisions/replays; fresh authority kedua urutan serialisasi dengan real UsersService disable/demote; deleted no-relations fixture; rollback audit/receipt failure; no partial slot loss; archive immutable; source deletion membuat stale; per-date bell/BREAK/holiday; exact/forged/partial/expired baseline concurrency. Pure precheck dibandingkan hash seluruh isi tabel DB, termasuk audit, pada valid/invalid/unknown-field/missing-root/error paths; negative injected write benar-benar ditolak DB read-only.

Migration additive aktual juga diaplikasikan ulang di **rollback transaction pada tiga tabel draft kosong milik fixture saja**, dengan legacy Schedule/ClassSession sudah berisi histori. Hash histori sebelum/sesudah DDL sama; rollback mengembalikan fixture. DROP dalam test tidak ada pada migration aplikasi, tidak menyentuh target existing/production atau data draft retained. FK/checks diuji melalui bypass Prisma untuk kontrol negatif.

Native runner asli tidak menutupi kegagalan: run awal 28 gagal/4 lulus mengembalikan exit 1 dan raw log tetap disimpan. Setelah perbaikan UUID casts, run interim 32/32 juga retained; empat run 34/34 kemudian diulang dengan before/after source binding. Empat run final 34/34 mencakup runtime occurrence/concurrency/migration checks.

Masalah eksekusi awal yang sudah dikoreksi: schema validate tanpa DATABASE_URL (lalu menggunakan URL dummy port 1 untuk validate/generate saja), PostgreSQL image temporary socket readiness (diganti readiness TCP final), parameter UUID pada snapshot (explicit casts), quoting regex pipe di batch npm (diganti explicit test paths), serta dua nama file Web yang tidak ada (diganti hasil inventory). Web failure log tetap disimpan sebagai web-regression.log; tidak dipakai sebagai bukti PASS.

## Acceptance A01–A24

| ID | Disposisi Executor / bukti terarah |
|---|---|
| A01 | PASS: exact flag + ceilings unit; HTTP off no domain effects |
| A02 | PASS foundation protected/other roles denied; legacy reader source tidak berubah + regresi; full provider/role-browser tidak direrun |
| A03 | PASS: actual lock wait/revoke-first dan mutation-first, disable/demote/delete fixture; no stale replay |
| A04 | PASS: authoritative reads/replays, token spoof denied |
| A05 | PASS: tiga tabel additive + actual DDL rollback proof mempertahankan histori |
| A06 | PASS: period FK/RESTRICT, ranges/revision/status/JP/locked/session checks |
| A07 | PASS: draft-only effects, separate HTTP and atomic domain audits |
| A08 | PASS: pure precheck all tested paths hash seluruh tabel unchanged + DB rejects injected write |
| A09 | PASS: competing revision one winner |
| A10 | PASS: exact concurrent replay one operation, request mismatch conflict, old ack distinct from current revision |
| A11 | PASS: real audit/receipt failure rolls back |
| A12 | PASS: invalid/receipt-failed replacement preserves slots/revision |
| A13 | PASS: archive immutable; no publish/restore/delete routes |
| A14 | PASS: edits/deletions make stale, no TA/group FK interference |
| A15 | PASS: separate productive teacher components/JP; same class overlap rejected |
| A16 | PASS: incomplete coverage visible; assignment overflow rejected |
| A17 | PASS: variable JP/minutes/per-occurrence profiles/BREAK; unit + PostgreSQL |
| A18 | PASS: one holiday does not erase all weekday occurrences |
| A19 | PASS: exact active baseline only, partial/forged/expanded/expired bindings denied; no class waiver |
| A20 | PASS fail-closed boundary: facilities/availability remain NOT_VERIFIED; not a feasibility proof |
| A21 | PASS: strict fields, payload/scope/date ceilings, no silent dedup/row loss |
| A22 | PASS: exact checkout/container/label/ID/loopback/port; default/legacy targets refused |
| A23 | PASS: actual PS5.1/7 two-date runners plus failure controls |
| A24 | Executor checks PASS; **independent review remains required/HOLD**, not self-approved |

## Migration / rollback / retained resources

Migration `20261008000020_scheduling_draft_foundation` hanya diuji pada task-owned `diis-wave1a-proof-20261008`, exact loopback `127.0.0.1:55441`. Existing local pgvector image digunakan tanpa pull/dependency/Docker Compose changes. Ownership ID/image/label disimpan; pre-existing non-owned containers ditolak. Existing JP proof container port 55439 dan database/runtime pengguna tidak dimutasi.

Sepuluh disposable test databases dan bootstrap DB dalam container wave ini **retained** untuk review; tidak dihapus. Tidak menjalankan migrate reset, full seed, production clone atau cleanup artefak lain. Tidak ada deployment/migration/grant/flag activation pada runtime pengguna/staging/production.

Rollback aplikasi awal: flag off dan restore aplikasi sesuai gate berikutnya, bukan drop draft/history tables. FK periode yang baru menjadi dependency eksplisit; hapus semester berisi draft akan ditolak, bukan cascading history removal. Operator TU/WAKA memerlukan work berikutnya untuk permission-writer/scope races, bukan otomatis diaktifkan oleh foundation ini.

## Completion sweep dan handoff

Executor sweep tidak menemukan defect in-scope yang masih terverifikasi. Ini self-verification, **bukan review independen**. Specification, before/after literal manifests, raw logs/native exits, dan reviewer packet terpisah tersedia dalam folder evidence. Reviewer harus bind exact working-tree bytes, bukan hanya HEAD lama.

Import 1B, structured resource/availability/competency foundation, worker/CP-SAT, responsive UI, repair/exception resolution workflow dan publish/consumer integration belum diimplementasikan atau diotorisasi dari keberhasilan 1A ini. Tidak mengklaim optimum jadwal sekolah atau kesiapan commissioning.

Git packaging, staging, production access/mutation/deploy, worker activation dan commissioning tetap **HOLD**. Izin read master production sebelumnya tidak diperluas atau digunakan ulang pada eksekusi ini.

Rekomendasi model untuk tindak lanjut

Task berikutnya: reviewer independen menilai delta Wave 1A **17 path** dan bukti API/PostgreSQL bound; read-only, tanpa source fixes atau operational mutation.
Model / effort: GPT-6.1 Sol (`gpt-6.1-sol`) / xhigh.
Alasan: schema integrity, authority-after-lock, zero-write precheck dan atomic audit/idempotency membutuhkan independent semantic/race review; rekomendasi provisional, bukan benchmark.
Syarat kualitas: verifikasi source manifest, audit/receipt rollback dan kedua lock order; periksa no operational schedule effects dan no false publishability.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
