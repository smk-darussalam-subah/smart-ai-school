# Wave 7 Phase 6 Semester Closing - Staging Browser QA

Tanggal: 2026-08-21

Target: staging only

## Verdict

**FOLLOW-UP REQUIRED BEFORE FINAL STAGING SIGN-OFF**

Core Wave 7 staging flow is functional on the deployed SHA, and the React hydration
error found during QA was remediated and redeployed. Final sign-off is still held
because two required browser evidence items are not proven on shared staging:

1. KAPROG major-only browser matrix is not proven because no active KAPROG account is
   available in the saved PII-safe credential manifest.
2. Historical closure detail, print preview, and CSV export are not proven in browser
   because staging has no `SemesterClosure` row and positive close must not be run on
   the shared staging database without an isolated fixture.

## Delivery Evidence

- Feature PR: #547 merged to `develop`.
- Initial staging promotion PR: #548 merged to `staging`.
- QA hotfix PR: #549 merged to `develop`.
- Hotfix staging promotion PR: #550 merged to `staging`.
- Final deployed staging SHA: `65840a5301bc86d1282f13cb64c05a6fc3bfa3e4`.
- Develop SHA after hotfix: `ee7e2ace209cc375563c8aef32c000a56b591a12`.
- Production/main SHA unchanged: `23e93af414a3b71ff0114ad43f78b833cefaa132`.
- Deploy run: `32461285227`, conclusion `success`.
- Staging containers:
  - `smk-staging-web`: running.
  - `smk-staging-api`: running and healthy.
- Staging health endpoint: `/health` returned `status: ok`, database up.
- Prisma migrate status: 44 migrations found, database schema up to date.
- Branch protection restored:
  - `develop`: 1 required approval.
  - `staging`: 1 required approval.
  - `Protect Staging` ruleset: 1 required approval.
  - `main`: 1 required approval.
- Open PRs after promotion: none.

## Same-wave Hotfix

During browser QA, `/dashboard/penutupan-semester` emitted React hydration error
`#418`. Root cause was timestamp rendering with implicit timezone in the client
component. Server and browser could render different localized time text.

Fix:

- `formatSemesterDateTime()` now uses explicit app timezone `Asia/Jakarta`.
- `SemesterClosingClient` uses the shared deterministic formatter.
- Focused regression test asserts app-timezone output.

Verification:

- Web focused test: `semester-closing-ui.test.ts`, 9/9 pass.
- Web type-check: pass.
- Web lint: pass, only existing Next lint deprecation/plugin warning.
- `git diff --check`: pass.
- PR #549 CI: Build, Lint & Type Check, Unit Tests pass.
- PR #550 CI: Build, Lint & Type Check, Unit Tests pass.

Post-deploy browser re-QA confirmed zero console errors and no React #418 on the
tested Wave 7 pages.

## Browser QA Matrix

All browser tests used staging:

`https://staging.smkdarussalamsubah.sch.id`

Synthetic PII-safe accounts from the saved staging credential manifest were used.
Passwords, tokens, cookies, and secrets were not printed.

### SUPER_ADMIN

Status: **PASS**

- Opened `/dashboard/penutupan-semester`.
- Page showed `Penutupan Semester 1 2026/2027`.
- Status showed `Belum siap`.
- Scope showed `Scope sekolah`.
- Tabs visible: `Kesiapan`, `Capaian`, `Riwayat`.
- `Capaian` tab rendered:
  - Heatmap Kelas.
  - Heatmap Jurusan.
  - Kepatuhan KKTP per Mapel.
  - Pemetaan CP/TP/ATP.
- `Riwayat` tab rendered empty state:
  - `Pilih laporan dari tabel riwayat...`
  - `Belum ada semester yang ditutup.`
- No horizontal body overflow at 1440x900.
- Browser console: no errors after hotfix.

### KEPALA_SEKOLAH Appointment

Status: **PASS**

- Base identity `GURU` with active `KEPALA_SEKOLAH` Appointment opened the page.
- Tabs visible: `Kesiapan`, `Capaian`, `Riwayat`.
- Final close section visible.
- After typing exact confirmation `TUTUP SEMESTER`, final close button stayed disabled
  because readiness status is `Belum siap`.
- No close request was submitted.
- No horizontal body overflow at 1440x900.
- Browser console: no errors.

### WAKA_KURIKULUM Appointment

Status: **PASS**

- Base identity `GURU` with active `WAKA_KURIKULUM` Appointment opened the page.
- Scope showed `Scope sekolah`.
- Tabs visible: `Kesiapan`, `Capaian`, `Riwayat`.
- No horizontal body overflow at 1440x900.
- Browser console: no errors.

### GURU With Teaching Assignment

Status: **PASS**

- Opened `/dashboard/penutupan-semester`.
- Scope showed `Scope guru`.
- Only `Kesiapan` tab was visible.
- `Capaian`, `Riwayat`, and final close controls were hidden.
- No horizontal body overflow at 1440x900.
- Browser console: no errors.

### Negative Roles

Status: **PASS WITH UX NOTE**

Roles tested:

- `TATA_USAHA`
- `SISWA`
- `ORANG_TUA`
- `INDUSTRI`

Result:

- No role saw readiness data, final report tabs, or final close controls.
- Direct route showed fail-closed message:
  `Data penutupan semester tidak dapat dimuat. Periksa izin atau konfigurasi periode aktif.`
- No horizontal body overflow.
- Browser console: no errors.

UX note: for learner/non-admin roles the fail-closed page is very bare. It is safe
from a privacy/security standpoint, but could be improved later with a role-friendly
access-denied screen.

### Mobile 390px

Status: **PASS WITH P2 UI NOTE**

- Viewport: 390x844.
- Tested WAKA page.
- Heading, status, tabs, metrics, and blocker table remained usable.
- Body scroll width equaled client width; no page-level horizontal overflow.
- Browser console: no errors.

P2 UI note: the global mobile menu button measured 40x40px. It works, but the
professional target should be at least 44x44px.

## Not Proven

### KAPROG Major-only Browser Matrix

Status: **NOT PROVEN**

Reason:

- The saved credential manifest contains no active KAPROG account.
- Read-only staging DB inspection found an account named like KAPROG, but it has no
  active Appointment and no stored credential in the QA manifest.

Required follow-up:

- Create or activate a PII-safe KAPROG fixture through official UI/API flow.
- Re-run browser QA:
  - major-only readiness/final report scope;
  - direct negative scope;
  - no school-wide snapshot exposure.

### Historical Detail, Print Preview, and CSV

Status: **NOT PROVEN**

Reason:

- Staging currently has no closed semester snapshot row.
- Shared staging data is `Belum siap` and positive close is prohibited without an
  isolated fixture.

Required follow-up:

- Use an isolated staging/disposable fixture that can be closed safely, or seed an
  approved synthetic closure through the official service path.
- Prove in browser:
  - open historical detail;
  - print preview opens the same snapshot;
  - CSV filename is period-bound;
  - CSV content reads immutable snapshot, not live readiness.

## UI/UX Findings

### P2 - Raw Provenance Label

`Kepatuhan KKTP per Mapel` displays raw provenance values such as
`system_default`. This is audit-accurate but not polished for a high-quality
operator UI.

Recommendation:

- Render `system_default` as `Default sistem`.
- Render other provenance values with Indonesian labels while keeping raw values in
  API/audit data.

### P2 - Read-only Oversight Roles See Disabled Close Form

WAKA can see the final close section, including the confirmation input, although only
Kepala Sekolah can close. The disabled state is safe, but the UX invites an action
that WAKA cannot perform.

Recommendation:

- Show the close form only for users with `academic.semester.close`.
- For read-only oversight roles, show a concise policy note instead.

### P2 - Mobile Header Touch Target

The global mobile menu button measured 40x40px. Recommended professional mobile
target is at least 44x44px.

## Stop Condition

Do not promote Wave 7 to `main` yet.

Required before final staging sign-off:

1. KAPROG PII-safe browser fixture and major-only matrix.
2. Historical closure fixture for detail/print/CSV browser proof, without closing the
   shared active staging semester destructively.
3. Reviewer decision on whether the P2 UI items above must be fixed in Wave 7 or can
   be tracked as follow-up polish.

## Confidence

- Delivery/runtime SHA confidence: 99%.
- Core browser flow confidence: 94%.
- Final staging sign-off confidence: 78%, held by missing KAPROG and historical
  snapshot browser evidence.
