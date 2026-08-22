# Wave 7 Phase 6 - PR #551 Source Re-review

Tanggal: 2026-08-22

PR: `#551 fix(academic): refine semester closing staging follow-up`

Head: `02ade5c171703d097476529f3e0a6b21f1343dce`

Peran: independent reviewer, review-only

## Verdict

**FOLLOW-UP REQUIRED IN PR #551 - DO NOT MERGE YET**

Empat P2 dari staging review sebelumnya telah ditutup secara substansial:

- provenance `system_default` menjadi `Standar sekolah`;
- destructive close form hanya muncul untuk authority close KS;
- unsupported stable roles berhenti sebelum readiness fetch dan memperoleh access-denied
  state yang jelas;
- mobile navigation trigger memiliki target minimum 44x44px.

PR remote benar-benar `MERGEABLE`, satu commit, scope tujuh file web/test, dan seluruh CI
hijau. Namun satu P2 false-empty state masih tersisa pada endpoint riwayat closure.

## Finding

### P2-R01 - Kegagalan fetch riwayat disamarkan sebagai riwayat kosong

Setelah readiness berhasil, page memanggil endpoint `/semester-closing/closures`. Bila request
ini gagal, code mengubah hasil menjadi `initialClosures=[]` tanpa membawa status error ke
client. Tab Riwayat lalu menampilkan `Belum ada semester yang ditutup`, walaupun kondisi nyata
adalah API/network/permission failure.

Pola yang sama muncul setelah positive close: kegagalan `listSemesterClosuresAction()` diabaikan
dan history table tidak memperoleh error/retry state. Selected closure memang tetap tersedia,
tetapi registry dapat terlihat kosong atau stale.

Evidence:

- `apps/web/src/app/dashboard/penutupan-semester/page.tsx:91-100`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:405-414`
- `apps/web/src/app/dashboard/penutupan-semester/_components/SemesterClosingClient.tsx:668-674`

Impact:

- operator tidak dapat membedakan sekolah belum pernah menutup semester dari kegagalan API;
- kontrak Wave 7 yang memisahkan empty, permission denied, no-active-period, dan API failure
  belum sepenuhnya terpenuhi;
- masalah riwayat dapat tersembunyi sampai staging positive-close QA.

Required narrow fix:

1. Bawa typed history state ke client, misalnya `ready | empty | error`, atau prop error yang
   ekuivalen.
2. Bila initial closure fetch gagal, biarkan readiness/capaian tetap dapat digunakan tetapi
   tab Riwayat menampilkan error eksplisit dan tombol `Coba lagi`, bukan empty state.
3. Bila refresh history setelah close gagal, pertahankan selected closure dan tampilkan warning
   `Riwayat belum berhasil dimuat ulang`; jangan menggantinya dengan empty/stale silence.
4. Retry harus memakai synchronous request guard yang sudah ada dan tidak mengirim request
   paralel saat rapid click.
5. Tambahkan behavioral tests untuk:
   - readiness 200 + closures 500;
   - closures empty 200;
   - retry history success;
   - post-close history refresh failure tetap mempertahankan selected closure.

## Remote Verification

Reviewer memverifikasi melalui GitHub:

- base: `develop`;
- head branch: `fix/wave7-semester-closing-staging-followup-20260822`;
- head SHA: `02ade5c171703d097476529f3e0a6b21f1343dce`;
- state: open;
- mergeable: mergeable;
- blocker: review required;
- Build Check: pass;
- Lint & Type Check: pass;
- Unit Tests: pass;
- file scope: tujuh file web/test, tanpa schema, migration, dependency, API, infrastructure,
  secret, atau production change.

Local verification yang dilaporkan executor diterima sebagai evidence:

- focused web: 3 suites / 17 tests pass;
- full web: 37 suites / 229 tests pass;
- web type-check, lint, build 40/40 pass;
- diff checks pass.

## Next Gate

1. Amend narrow fix P2-R01 ke branch PR #551 yang sama.
2. Jalankan focused page/client tests, full web regression, type-check, lint, build, dan diff
   checks.
3. Push branch dan tunggu CI head terbaru hijau.
4. Kirim kembali untuk one-pass re-review.
5. Setelah reviewer approve, merge PR #551 ke `develop`, promote melalui PR normal ke
   `staging`, deploy, lalu jalankan G1 KAPROG dan G2 isolated positive-close matrix.

Belum ada approval untuk merge, staging promotion, `main`, atau production pada verdict ini.

## Confidence

- Empat P2 awal tertutup: **98%**.
- P2-R01 valid: **97%**.
- Overall source readiness PR #551: **96%**.
