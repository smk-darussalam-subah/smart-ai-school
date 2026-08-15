# Wave 5 Phase 4 Continuous Operations - Staging QA Report

Date: 2026-08-15
Executor: Codex
Scope: Wave 5 staging deployment and targeted browser QA only.

## Verdict

Status: STAGING QA COMPLETE FOR REVIEWER HANDOFF.

Main/production promotion remains a separate gate. No main branch, production
container, production database, production timer, or production secret was
modified during this run.

## Source and Git Packaging

Initial Wave 5 feature packaging:

- Feature commit: `74f0d62bf1daee8a9788de695c741e34dd590c41`
- Develop PR: #500
- Develop merge SHA: `746edbd636adb1cf0aaa08fbcfaeccd9d4a6237d`
- Staging PR: #501
- Staging merge SHA: `1018310208768e703115db4e030744b954412437`
- Deploy run: `31870530004`

Same-wave browser-QA remediations:

- PR #502/#503: parent remedial browser token flow.
  - Develop merge: `b4158581d504f595893b324eeffe28fb596423af`
  - Staging merge: `e21d0c409d6188c4176f8594c899a5f9c745fbc2`
  - Deploy run: `31873489927`
- PR #504/#505: backend proxy session token forwarding.
  - Develop merge: `affa784ab2fd304abf627870beb5837ce06e5c71`
  - Staging merge: `6aee50df12bc29c9f20e1a03eb1c6b5f4c014c6c`
  - Deploy run: `31874535285`
- PR #506/#507: AI Chat server actions and announcement audience normalization.
  - Develop merge: `9af03ac4662de8dcc23ee408416f3ae6fda2de77`
  - Staging merge: `37de41a6afb92021aa9c04aa509313537a6cef4a`
  - Deploy run: `31875754054`
- PR #508/#509: legacy JSON-string announcement audience normalization.
  - Develop merge: `9a8db856b114cfb84d979d54b47e54512533d4e9`
  - Staging merge: `2a393dba9511431264c60c52d0c05b222176bafb`
  - Deploy run: `31876732697`
- PR #510/#511: announcement timestamp timezone hydration fix.
  - Develop merge: `6118a0dfbc7120fced3189525f06cce770b86284`
  - Staging merge and app-tested SHA: `932144a93e132c81e39777221e61176f6a31ce9a`
  - Deploy run: `31877764164`

All PRs were merged only after required checks were green. The temporary
required-review relaxation was restored to `1` for both `develop` and `staging`
after each authorized merge.

## Runtime Preflight

Staging host:

- SSH target: `appuser@204.168.242.123`
- Checkout: `/opt/diis-staging/smart-ai-school`
- Branch: `staging`
- Final app-tested SHA: `932144a93e132c81e39777221e61176f6a31ce9a`
- Containers: `smk-staging-web` and `smk-staging-api` running
- API health: `/health` returned `status: ok`
- Prisma migration status: 43 migrations found, database schema up to date
- `develop` required approvals: restored to `1`
- `staging` required approvals: restored to `1`
- Open PRs after staging completion: none
- `origin/main` remained at `005c9f5b603893729d66f086714caf1ee41df75e`

## Automated and API Evidence

Local source checks for same-wave fixes:

- Focused web Wave 5 helper tests: 11/11 pass
- Web type-check: pass
- Web lint: pass, existing Next lint deprecation/plugin notice only
- Web build: pass, 39/39 pages
- `git diff --check` and cached diff checks: pass

Staging API/role evidence from synthetic fixture matrix:

- 9 PII-safe synthetic accounts obtained application auth successfully
- Remedial pass flow raised source Grade to exact KKTP 80 after teacher finalization
- Remedial retry flow created successor remedial session/participant without weakening
  `(sessionId, studentId)` response uniqueness
- Family remedial API projection was privacy-safe
- Non-owner remedial mutation roles were blocked
- TU SPP creation and SA approval API flow passed
- Scheduled urgent announcement prepared notification logs atomically
- Prepared announcement content update returned conflict; pin remained allowed
- Kiosk query token was rejected; header token worked with safe cache/index headers
- GURU AI Chat API returned a response
- Assessment outbox and NotificationLog durability were observed for assessment,
  grade, payment, remedial, report-card, and announcement events

## Browser QA Matrix

Browser surface: Chrome extension, staging URL
`https://staging.smkdarussalamsubah.sch.id`.

Credentials: PII-safe synthetic accounts kept only in local untracked `.tmp`.
No credential, token, cookie, or real PII is included in this report.

### GURU - AI Chat

Result: PASS.

- Logged in as `QA Wave4 Guru Produktif`
- Opened `/dashboard/ai`
- Sent a synthetic prompt
- Received contextual AI answer
- No `Token tidak ditemukan`
- No `Gagal menghubungi AI`
- No fresh console error in the successful run

Note: after later docs/UI-only deploys, the AI page still displayed the successful
conversation. The later deploys only changed Pengumuman files.

### TATA_USAHA - Pengumuman

Result: PASS after same-wave fixes.

- Opened `/dashboard/pengumuman`
- `Pengumuman Sekolah` rendered
- `Buat Pengumuman` was visible for TU
- Scheduled/prepared announcement status rendered truthfully
- Legacy audiences rendered as clean labels such as `ALL`, `SISWA`, and
  `ORANG_TUA`, not JSON text like `["ALL"]`
- No `audience.join` crash
- No fresh React #418/#419 or server-action mismatch after final reload

### ORANG_TUA - Remedial

Result: PASS.

- Opened `/dashboard/akademik`
- Selected-child dashboard rendered remedial cards
- Visible cards:
  - `QA Wave5 Remedial Pass ...` with status `Tuntas`
  - `QA Wave5 Remedial Retry ...` with status `Perlu tindak lanjut`
- No token error
- No question text, answer key, rubric, source grade ID, participant ID, or
  lifecycle timestamp leaked in the parent projection

### TATA_USAHA - Keuangan

Result: PASS.

- Opened `/dashboard/keuangan`
- `Keuangan SPP` rendered
- `+ Catat Pembayaran` visible for TU
- Staging SPP transaction for `QA Wave4 Siswa` visible
- No fresh browser console error

### GURU - Akademik

Result: PASS.

- Opened `/dashboard/akademik`
- Guru workspace rendered with active teaching context
- Academic tabs and Wave 4/Wave 5 surfaces were reachable
- No token error or fresh browser console error

### SISWA - Akademik

Result: PASS.

- Opened `/dashboard/akademik`
- Student dashboard rendered
- LMS/task/grade/attendance sections visible
- No answer key, rubric, participant ID, source grade ID, or internal remedial
  identifier leaked
- No fresh browser console error

### Negative Role - Pengumuman

Result: PASS.

- GURU view of Pengumuman was read-only
- No `Buat Pengumuman`, `Edit`, `Arsipkan`, or destructive controls were visible
  for the non-announcement-manager role

### Mobile 390 x 844

Result: PASS.

- Browser viewport set to 390 x 844
- Pengumuman page remained usable
- No blank/error state
- No fresh browser console error
- Viewport reset after the check

## Findings Closed During QA

1. Parent remedial browser panel returned `Token tidak ditemukan`.
   - Root cause: client fetch to `/api/backend/...` did not attach an app bearer token.
   - Fix: server action `fetchFamilyRemedials` now calls backend with NextAuth token.

2. AI Chat still returned `Token tidak ditemukan`.
   - Root cause: AI Chat client path was still browser-side for authenticated backend calls.
   - Fix: AI Chat sessions, history, delete, and send now use server actions with
     the server-side session token.

3. Pengumuman crashed on legacy audience payload.
   - Root cause: UI assumed `audience` was always a string array.
   - Fix: added safe normalizer for array, string, and legacy object payloads.

4. Pengumuman rendered legacy JSON-string audiences such as `["ALL"]`.
   - Root cause: old rows stored audience as serialized JSON text.
   - Fix: normalizer now parses JSON array/object strings fail-soft.

5. Pengumuman produced React hydration text mismatch.
   - Root cause: timestamp formatter did not set timezone explicitly.
   - Fix: announcement date rendering now uses `timeZone: 'Asia/Jakarta'`.

## Residuals and Gate Status

- No P0/P1/P2 blocker remains from this staging QA run.
- One earlier failed browser evidence row was superseded by a post-reload clean
  run after final deploy; it is not a current blocker.
- This is not a production/main sign-off.
- Recommended next gate: reviewer re-check of this staging evidence, then explicit
  main promotion planning if approved.
