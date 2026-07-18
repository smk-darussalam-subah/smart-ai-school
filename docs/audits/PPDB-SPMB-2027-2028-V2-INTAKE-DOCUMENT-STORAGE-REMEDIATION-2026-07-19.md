# PPDB/SPMB 2027/2028 V2 Intake & Document Storage Remediation

Tanggal: 2026-07-19
Branch: `feat/ppdb-spmb-2027-v2-intake`
Status: follow-up remediation complete, stop at reviewer gate

## Scope Yang Dikerjakan

- Menambahkan fondasi public intake SPMB 2027/2028 V2 tanpa Prisma schema migration, dependency baru, Docker change, atau perubahan MinIO bucket policy.
- Menambahkan route publik `/spmb` sebagai wizard daftar awal DIIS.
- Mengarahkan CTA SPMB landing dari Taplink ke `/spmb`.
- Menjaga jalur 2026/2027 tetap sebagai import kolektif Data Siswa; tidak ada reprocessing PPDB online untuk 2026/2027.
- Membuat desain follow-up document storage yang executable untuk wave berikutnya.

## Implementasi Backend

- Endpoint baru: `POST /ppdb/spmb-2027/intake`.
- Guard public-write tetap dipakai:
  - `@Public()`
  - `@Throttle({ default: { ttl: 300_000, limit: 10 } })`
  - Zod `.strict()`
  - honeypot `_hp`
  - IP extraction untuk audit log
- CAPTCHA provider belum diaktifkan di wave ini:
  - `captchaToken` ditolak oleh DTO strict sebagai unknown field.
  - `PPDB_CAPTCHA_SECRET` tidak boleh dipakai sebagai toggle enforcement sampai provider resmi diimplementasikan.
  - Proteksi public submit yang benar-benar aktif saat ini adalah honeypot + throttle + validasi strict.
- Submit SPMB memakai `idempotencyKey` UUID dan transaksi dengan Postgres advisory lock agar retry key yang sama tidak membuat lead ganda.
- `idempotencyKey` diikat ke `payloadFingerprint` SHA-256 dari payload intake yang sudah dinormalisasi; retry key sama dengan payload berbeda ditolak `409 Conflict`.
- DTO intake V2 mewajibkan:
  - `applicantRole`
  - `fullName`
  - `gender`
  - `schoolOrigin`
  - `interestMajor`
  - `guardianName`
  - `guardianRelation`
  - `phone`
  - `consent: true`
- DTO intake V2 mengizinkan:
  - `nisn` jika 10 digit
  - `email` jika valid
- Data disimpan sebagai `PpdbLead` existing:
  - `source: website`
  - `status: new`
  - metadata V2 namespaced di `notes`
- List/dashboard PPDB tidak lagi memilih `notes`; metadata PII sementara hanya tersedia melalui endpoint detail yang berwenang.
- Response publik hanya mengembalikan:
  - `id`
  - `status`
  - `registrationNo`
  - `submittedAt`

## Implementasi Frontend

- Route baru: `/spmb`.
- Wizard V2:
  - step `Mulai -> Calon siswa -> Jurusan -> Kontak -> Tinjau`
  - state form bertahan saat back/next
  - step belum terbuka tidak bisa dilompati
  - validasi per-step dengan error dekat field
  - gender wajib
  - consent default unchecked
  - tombol submit aktif hanya setelah field wajib valid dan consent true
- Success proof UI sudah disiapkan untuk response sukses API.
- Proof publik tidak menampilkan NISN, WA, email, alamat, atau dokumen.
- Action proof `WhatsApp`, `PDF`, dan `email` tidak memalsukan keberhasilan; status UI adalah `Menunggu konfigurasi` atau `Tidak aktif` bila email kosong.
- Sidebar publik menampilkan alur setelah submit dan daftar dokumen daftar ulang dengan status jujur bahwa upload belum dibuka di daftar awal.
- Middleware diupdate agar `/spmb` dan `/privacy` public.
- Halaman `/privacy` diperbarui agar sesuai dengan field intake SPMB 2027/2028 yang benar-benar dikumpulkan, termasuk role pengisi, gender, NISN opsional, data wali, email opsional, timestamp consent, dan log teknis.
- Copy landing SPMB tidak lagi menampilkan klaim kuota publik yang belum disahkan (`234 Kursi`, `26 Siswa`, dan `Terbatas`) dan alt text foto tidak lagi menyebut tahun 2026.

## Keputusan Aman Tanpa Approval

- Tidak mengubah Prisma schema.
- Tidak menambah dependency.
- Tidak mengubah Docker, infra, MinIO bucket, Keycloak realm, atau provider notifikasi.
- Tidak mengklaim upload dokumen, PDF server-side, WhatsApp sending, atau email sending sudah berjalan.
- `guardianRelation` tetap free text untuk wave intake ini; enum relasi wali perlu keputusan UX/data normalization terpisah.
- Nomor pendaftaran saat ini deterministic dari UUID lead: `SPMB-2027-XXXXXXXX`. Ini cukup untuk bukti awal, tetapi bukan pengganti keputusan nomor urut resmi bila sekolah membutuhkan sequence manusiawi.

## Document Storage Design Untuk Wave Berikutnya

Rekomendasi tetap `MinIO-only document storage` dengan bucket private.

Model data yang perlu migration approval:

- `PpdbApplication`
  - relasi ke `PpdbLead`
  - academic year
  - applicant public token hash
  - status publik/internal
  - correction scope/reason
  - submitted/resubmitted timestamps
- `PpdbDocumentRequirement`
  - kode dokumen
  - label
  - required/optional
  - MIME allowlist
  - size limit
  - active academic year
- `PpdbApplicantDocument`
  - application id
  - requirement id
  - object key
  - original filename
  - MIME
  - size
  - checksum
  - version
  - status: missing, uploaded, needs_revision, verified
  - uploadedBy/verifiedBy
  - rejection reason
  - timestamps
- `PpdbDocumentAccessLog`
  - actor id/public applicant id
  - document id
  - action: upload, presign_download, verify, reject, delete
  - IP/user agent
  - timestamp

Storage/API contract yang perlu approval:

- Private MinIO bucket khusus PPDB documents.
- Signed upload/download URL berumur pendek.
- MIME sniffing server-side, bukan hanya extension.
- Checksum SHA-256.
- Max file size per document type.
- Virus scan decision bila diwajibkan sekolah.
- Retention/lifecycle policy untuk pendaftar diterima, ditolak, dan tidak lanjut.
- RBAC:
  - pendaftar hanya miliknya lewat token aman/magic link
  - TU/SA kelola dan verifikasi
  - KS agregat/read-only tanpa akses file sensitif default
  - GURU tidak melihat PII lead/dokumen

Notification/PDF contract yang perlu approval:

- PDF proof server-side dengan content type dan filename resmi.
- WhatsApp provider internal untuk pesan status/proof link.
- Email provider optional.
- Idempotency key per proof action.
- Audit log per send/download attempt.

## File Yang Diubah

- `apps/api/src/ppdb/dto/submit-lead.dto.ts`
- `apps/api/src/ppdb/ppdb.controller.ts`
- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/__tests__/ppdb.spec.ts`
- `apps/api/src/__tests__/ppdb-spmb-intake.spec.ts`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/privacy/page.tsx`
- `apps/web/src/app/spmb/page.tsx`
- `apps/web/src/app/spmb/spmb-intake.ts`
- `apps/web/src/app/spmb/_components/SpmbIntakeWizard.tsx`
- `apps/web/src/__tests__/spmb-intake.test.ts`
- `apps/web/src/components/landing/CtaPPDB.tsx`
- `apps/web/src/components/landing/Footer.tsx`
- `apps/web/src/components/landing/Hero.tsx`
- `apps/web/src/components/landing/LandingNav.tsx`
- `apps/web/src/components/landing/SPMBSection.tsx`
- `apps/web/src/middleware.ts`

## Verification

- API focused tests:
  - `npm.cmd --workspace @smk/api test -- ppdb.spec.ts ppdb-spmb-intake.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-api-spmb-fingerprint`
  - Result: pass, 2 suites / 55 tests.
- Web focused tests:
  - `npm.cmd --workspace @smk/web test -- spmb-intake.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-web-spmb-fingerprint`
  - Result: pass, 1 suite / 5 tests.
- API type-check:
  - `npm.cmd --workspace @smk/api run type-check`
  - Result: pass.
- Web type-check:
  - `npm.cmd --workspace @smk/web run type-check`
  - Result: pass.
- API lint:
  - `npm.cmd --workspace @smk/api run lint`
  - Result: pass.
- Web lint:
  - `npm.cmd --workspace @smk/web run lint`
  - Result: pass, with existing Next lint deprecation/plugin warning.
- API build:
  - `npm.cmd --workspace @smk/api run build`
  - Result: pass.
- Web build:
  - `npm.cmd --workspace @smk/web run build`
  - Result: pass, 39/39 static pages generated; existing Next lint plugin warning only.
- `git diff --check`
  - Result: pass.
- `git diff --cached --check`
  - Result: pass; no staged changes. Git emitted the existing user config ignore warning.

## Manual Browser QA

Environment:

- Docker local runtime had `smk-postgres` and `smk-redis` already running.
- API was built and started from `apps/api/dist/main.js` with `apps/api/.env`; Nest booted on `http://localhost:3001` and connected to PostgreSQL.
- Web dev server started with direct Next binary at `http://localhost:3010`.

Executed:

- Direct API idempotency proof:
  - POST `http://127.0.0.1:3001/api/v1/ppdb/spmb-2027/intake` twice with the same `idempotencyKey`.
  - Result: both responses returned the same id `b9974ba2-4cd7-4fe1-92ba-9475c4abe4be`, same `registrationNo`, and status `new`.
- Direct API fingerprint proof after follow-up:
  - POST `http://127.0.0.1:3001/api/v1/ppdb/spmb-2027/intake` twice with the same `idempotencyKey` and same normalized payload.
  - Result: both responses returned status `201`, the same id, and the same `registrationNo`.
  - POST again with the same `idempotencyKey` but changed `fullName`.
  - Result: API returned `409` with message `Data retry tidak cocok dengan pendaftaran sebelumnya`.
- Direct DB proof:
  - Prisma read-only lookup found the row for `b9974ba2-4cd7-4fe1-92ba-9475c4abe4be`.
  - Result: `kind=spmb_2027_2028_intake`, matching `idempotencyKey`, and `consentAccepted=true`.
- Open `/spmb` without login.
  - Result: pass after middleware fix.
- Step 1: click `Lanjut` before selecting role.
  - Result: specific error `Pilih siapa yang mengisi formulir`.
- Select `Orang tua/wali`, click `Lanjut`.
  - Result: moves to `Calon siswa`.
- Step 2: click `Lanjut` with missing required values.
  - Result: gender required error appears.
- Enter NISN malformed.
  - Result: `NISN harus berisi 10 digit angka`.
- Correct NISN, fill name/school, select gender.
  - Result: moves to `Jurusan`.
- Step 3: click `Lanjut` without major.
  - Result: `Pilih jurusan minat terlebih dahulu`.
- Select `TKJ`.
  - Result: moves to `Kontak`.
- Step 4: click `Lanjut` with blank contact.
  - Result: phone error appears.
- Enter malformed email.
  - Result: `Format email tidak valid`.
- Clear email as optional, fill WA/guardian.
  - Result: moves to `Tinjau`.
- Review step.
  - Result: submit button disabled while consent unchecked.
- Check consent.
  - Result: submit button enabled.
- Submit through browser UI with API + DB runtime available.
  - Result: success proof displayed with `SPMB-2027-383D6530`.
  - Public proof did not contain WA, email, or NISN.
- Direct DB proof for browser submit:
  - Prisma read-only lookup found lead `383d6530-f068-4949-9a3e-d6f972b723e7`.
  - Result: `status=new`, `kind=spmb_2027_2028_intake`, `applicantRole=guardian`, `consentAccepted=true`.
- Dashboard PPDB local access:
  - Opening `/dashboard/ppdb` redirected to `/login?callbackUrl=%2Fdashboard%2Fppdb` because no local admin/TU session was available in the in-app browser.
- Mobile viewport attempt:
  - In-app browser viewport override was attempted at `360x800`, but the runtime still reported `innerWidth=1280`.
  - Result: mobile 360px visual proof is not claimed from this run.

Not run:

- Browser proof PDF/WA/email send success, because providers are intentionally not configured in this wave.
- Authenticated dashboard PPDB browser verification with TU/SA session.
- Mobile 360px browser proof with a working viewport override.
- Staging browser QA.

## Residual Risks

P1 residual:

- None from the reviewed code findings. Browser UI submit, API runtime, DB persistence, and idempotent retry were verified locally.

P2 residual:

- Metadata in `PpdbLead.notes` is a safe temporary bridge, not final application/document schema.
- Registration number is UUID-derived, not school-approved sequential numbering.
- `guardianRelation` remains free text for Wave 1 intake; structured relation options are deferred to the next form-normalization pass.
- Authenticated dashboard PPDB browser verification still needs a TU/SA session.
- Mobile 360px proof should be repeated in staging or a browser tool where viewport override is effective.
- Staging browser QA remains required before staging sign-off.

## Reviewer Gate Recommendation

Ready for reviewer gate, not direct staging sign-off.

Reviewer should focus on:

- Public route no longer redirects to login.
- Wizard state/validation/consent behavior.
- Public proof PII minimization.
- API response minimization.
- Payload fingerprint conflict for same idempotency key with changed data.
- Whether temporary `PpdbLead.notes` metadata is acceptable for Wave 1 intake bridge.
- Whether document storage schema/infra approval should be opened as Wave 2.
