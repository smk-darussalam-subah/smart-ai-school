# Wave D Appointment Governance Operational UI P1 Follow-up Remediation

Tanggal: 2026-07-29

Peran: Executor

Branch: `feat/appointment-governance-operational-ui-20260728`

## Verdict Executor

Follow-up source untuk P1 awal dan narrow follow-up reviewer sudah dikerjakan.
Focused verification, type-check, lint, build, Prisma validate, dan diff checks
lokal lulus. Belum dilakukan commit, push, PR, atau staging sign-off. Browser QA
dengan database disposable resmi tetap menjadi gate berikutnya setelah reviewer
menyetujui source.

## Temuan yang Ditutup

### P1-FU-01 - Katalog posisi terlalu terbuka

Perbaikan:

- `GET /positions` sekarang dibatasi ke `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH')`.
- Halaman Struktur Organisasi mengambil `/positions/my-positions` terlebih
  dahulu.
- Actor yang bukan `SUPER_ADMIN` dan tidak memiliki appointment
  `KEPALA_SEKOLAH` aktif diarahkan ke `/dashboard` sebelum support data
  `/positions`, tahun ajaran, jurusan, dan registry appointment dimuat.
- Test controller dan RolesGuard diperbarui agar role stabil biasa tidak
  dianggap cukup untuk membaca katalog.
- Test server page baru membuktikan role `GURU` biasa redirect sebelum katalog,
  sedangkan `GURU` dengan appointment Kepala Sekolah aktif dapat memuat support
  data.

File utama:

- `apps/api/src/positions/positions.controller.ts`
- `apps/api/src/__tests__/positions.spec.ts`
- `apps/api/src/__tests__/roles.spec.ts`
- `apps/web/src/app/dashboard/struktur-organisasi/page.tsx`
- `apps/web/src/__tests__/struktur-organisasi-page.test.ts`

### P1-FU-02 - Resume definitif saat PLT future masih terbuka

Perbaikan:

- `resume()` sekarang menolak `409 Conflict` jika ada PLT tertaut berstatus
  `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, atau `ACTIVE`.
- Operator harus membatalkan atau mengakhiri PLT lebih dahulu sebelum pemangku
  definitif dapat kembali aktif.
- Test API mengunci query terhadap status PLT terbuka, bukan hanya `ACTIVE`.

File utama:

- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/__tests__/appointments.spec.ts`

### P1-FU-03 - Timeline lifecycle berulang dan aktivasi manual

Perbaikan:

- Timeline tidak lagi memakai audit sukses pertama per action.
- Semua audit sukses lifecycle `submit`, `suspend`, `resume`, `cancel`, dan
  `end` dipetakan secara kronologis sebagai event terpisah.
- Fallback dari state terkini hanya dipakai jika audit sukses tidak tersedia,
  sehingga timestamp terbaru tidak dipasangkan dengan aktor audit lama.
- Event `ACTIVATED` memakai actor dari audit `appointment.supersede` saat
  aktivasi manual dilakukan; label `Sistem` hanya dipakai ketika tidak ada
  actor manual.
- Test API ditambahkan untuk dua siklus suspend/resume dan actor manual
  supersede.
- Narrow follow-up:
  - failed `PATCH` audit sekarang mempertahankan `params.id` sebagai
    `resourceId`, sehingga failure action muncul di history appointment terkait.
  - History incumbent `SUPERSEDED` mencari audit manual pada successor yang
    menggantikannya dan memakai actor operator yang sama.
  - Event `CREATED` tidak lagi menampilkan `appointment.reason` yang mutable.
    Reason saat ini hanya ditempelkan ke lifecycle state yang masih dapat
    dibuktikan; alasan historis yang tidak tersedia dibiarkan `null`.
  - Final narrow follow-up: history sekarang menyeleksi `supersededById` dari
    appointment, memisahkan `ownActivationAudit` berdasarkan resource ID
    appointment sendiri, dan memisahkan `supersedingAudit` berdasarkan
    `supersededById`. Audit PLT/replacement lama yang bukan successor definitif
    tidak dapat dipakai sebagai actor `ACTIVATED` atau `SUPERSEDED`.
  - Test tiga aktor ditambahkan: aktivator incumbent X, aktivator PLT Y, dan
    aktivator successor Z. History incumbent harus menghasilkan `ACTIVATED = X`
    dan `SUPERSEDED = Z`, tidak pernah Y.

File utama:

- `apps/api/src/audit-log/interceptors/audit.interceptor.ts`
- `apps/api/src/__tests__/audit-interceptor.spec.ts`
- `apps/api/src/appointments/appointments.service.ts`
- `apps/api/src/__tests__/appointments.spec.ts`

## P2 yang Ikut Diperbaiki

### P2-FU-01 - Preview stale

Perbaikan:

- `loadPreview()` memakai request generation ref.
- Respons lama diabaikan jika request preview terbaru sudah berubah, termasuk
  ketika field menjadi invalid dan tidak mengirim request baru.
- Wizard open/close juga menginvalidasi generation dan menghapus preview, jadi
  respons wizard lama tidak dapat masuk ke wizard blank yang baru dibuka.
- Guard diekstrak menjadi helper murni dan test UI sekarang menguji perilaku
  pending request -> close -> blank reopen -> old response ignored, bukan lagi
  hanya membaca source string.

File utama:

- `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/struktur-ui.ts`
- `apps/web/src/__tests__/appointment-governance-ui.test.ts`

### P2-FU-02 - Test UI terlalu berbasis source-string

Perbaikan:

- Ditambahkan test server-page `struktur-organisasi-page.test.ts` yang memanggil
  page dengan mock session/API untuk membuktikan urutan authorization dan route
  behavior.
- Preview generation guard dan reset form dialog lifecycle diekstrak menjadi
  helper state kecil agar bisa diuji sebagai perilaku, bukan source-text
  assertion.
- Test ini melengkapi route/helper tests yang sudah ada tanpa menambah
  dependency UI testing baru.

### P2-FU-03 - Successor lintas tahun kurang intuitif

Perbaikan:

- Aksi `Siapkan pengganti` sekarang memilih default tahun ajaran berikutnya
  yang tersedia berdasarkan tahun incumbent.
- PLT tetap dipertahankan pada tahun appointment yang sedang ditangguhkan.
- Helper dan test ditambahkan untuk default successor year.

File utama:

- `apps/web/src/app/dashboard/struktur-organisasi/_components/StrukturClient.tsx`
- `apps/web/src/app/dashboard/struktur-organisasi/struktur-ui.ts`
- `apps/web/src/__tests__/appointment-governance-ui.test.ts`

## Verifikasi Lokal

Focused API batch awal:

```text
npm.cmd --workspace apps/api test -- appointments.spec.ts positions.spec.ts roles.spec.ts --runInBand --cacheDirectory .tmp/jest-cache/api-wave-d-followup
PASS src/__tests__/appointments.spec.ts
PASS src/__tests__/positions.spec.ts
PASS src/__tests__/roles.spec.ts
Test Suites: 3 passed, 3 total
Tests: 51 passed, 51 total
```

Focused API narrow:

```text
npm.cmd --workspace apps/api test -- appointments.spec.ts audit-interceptor.spec.ts positions.spec.ts roles.spec.ts --runInBand --cacheDirectory .tmp/jest-cache/api-wave-d-narrow
PASS src/__tests__/appointments.spec.ts
PASS src/__tests__/audit-interceptor.spec.ts
PASS src/__tests__/positions.spec.ts
PASS src/__tests__/roles.spec.ts
Test Suites: 4 passed, 4 total
Tests: 68 passed, 68 total
```

Focused API final narrow:

```text
npm.cmd --workspace apps/api test -- appointments.spec.ts audit-interceptor.spec.ts positions.spec.ts roles.spec.ts --runInBand --cacheDirectory .tmp/jest-cache/api-wave-d-supersede-audit
PASS src/__tests__/appointments.spec.ts
PASS src/__tests__/audit-interceptor.spec.ts
PASS src/__tests__/positions.spec.ts
PASS src/__tests__/roles.spec.ts
Test Suites: 4 passed, 4 total
Tests: 68 passed, 68 total
```

Focused web batch awal:

```text
npm.cmd --workspace apps/web test -- appointment-governance-ui.test.ts struktur-organisasi-page.test.ts --runInBand --cacheDirectory .tmp/jest-cache/web-wave-d-followup
PASS src/__tests__/appointment-governance-ui.test.ts
PASS src/__tests__/struktur-organisasi-page.test.ts
Test Suites: 2 passed, 2 total
Tests: 12 passed, 12 total
```

Focused web narrow:

```text
npm.cmd --workspace apps/web test -- appointment-governance-ui.test.ts struktur-organisasi-page.test.ts struktur-ui.test.ts --runInBand --cacheDirectory .tmp/jest-cache/web-wave-d-narrow
PASS src/__tests__/appointment-governance-ui.test.ts
PASS src/__tests__/struktur-organisasi-page.test.ts
PASS src/__tests__/struktur-ui.test.ts
Test Suites: 3 passed, 3 total
Tests: 20 passed, 20 total
```

Checks tambahan:

```text
npm.cmd --workspace apps/api run type-check
pass

npm.cmd --workspace apps/web run type-check
pass

$env:DATABASE_URL='postgresql://diis:diis@localhost:5432/diis?schema=school'; npx.cmd prisma validate --schema packages/database/prisma/schema.prisma
pass

npm.cmd --workspace apps/api run lint
pass

npm.cmd --workspace apps/web run lint
pass, hanya warning existing Next lint deprecation/plugin

npm.cmd --workspace apps/api run build
pass

npm.cmd --workspace apps/web run build
pass, 39/39 halaman

git diff --check
pass

git diff --cached --check
pass
```

Catatan: run pertama Jest tanpa `--cacheDirectory` gagal karena sandbox tidak
dapat menulis cache ke `%LOCALAPPDATA%\Temp\jest`. Rerun memakai cache di
workspace dan lulus.

## Belum Dilakukan

- Browser QA belum dijalankan ulang karena reviewer meminta database disposable
  dengan migration resmi, bukan `db push` ke `diis_db` lokal yang stale.
- Tidak ada staged changes, commit, push, PR, deployment, atau branch-protection
  action pada follow-up ini.

## Catatan Packaging

Worktree tetap mixed dengan perubahan Wave D sebelumnya dan banyak untracked
historis. Jika nanti masuk Git Gate, staging harus memakai explicit file list,
bukan `git add .` atau `git add -A`.
