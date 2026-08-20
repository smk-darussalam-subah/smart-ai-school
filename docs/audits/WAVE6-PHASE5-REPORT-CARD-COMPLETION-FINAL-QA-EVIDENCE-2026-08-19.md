# Wave 6 Phase 5 - Final QA Evidence

Tanggal: 2026-08-19

Scope: Report Card Completion, Web Push delivery, learner/family notification UX, and final staging evidence.

Status executor: READY FOR FINAL REVIEW setelah accessibility/navigation remediation dan targeted staging re-QA. Main/production tetap HOLD sampai reviewer memberi final approval.

## Ringkasan

Wave 6 sudah melewati source packaging, develop merge, staging promotion, deploy staging, dan targeted browser QA tambahan untuk bukti runtime dan UX yang sebelumnya belum lengkap:

1. Web Push end-to-end: service worker menerima push, Chrome menampilkan notifikasi native, klik notifikasi membuka Rapor resmi.
2. Permission denied branch: UI menampilkan status ditolak secara benar dan tidak menampilkan status langganan aktif.
3. Rapor learner app shell: halaman Rapor resmi untuk siswa kini tetap berada dalam visual system app siswa/orang tua, bukan terasa seperti dokumen terpisah di luar aplikasi.

Selama QA ditemukan satu defect runtime berisiko tinggi dan satu gap UX:

1. Defect cache service worker: halaman authenticated pernah tersimpan oleh cache lama, sehingga klik notifikasi berpotensi membuka konten rapor dari sesi sebelumnya. Ini diperbaiki dalam PR #524 dan #525.
2. Service worker asset belum public: `/sw.js` sempat diarahkan ke login oleh middleware. Ini diperbaiki dalam PR #526 dan #527.
3. Gap UX notification center: notifikasi native sudah membuka Rapor, tetapi riwayat notifikasi masih tersembunyi di account sheet, sedangkan icon lonceng hanya berisi pengumuman sekolah. Ini diperbaiki dalam PR #528 dan #529 dengan menyatukan lonceng sebagai pusat Notifikasi + Pengumuman.
4. Gap UX Rapor page: halaman `/dashboard/rapor` untuk learner sempat memakai tampilan dokumen putih operasional dan, setelah restyle awal, route masih dapat kembali ke Akademik karena gate authority terlalu ketat untuk learner-only. Ini diperbaiki dalam PR #530 sampai #533.

Tidak ada patch manual ke container, tidak ada SQL langsung, tidak ada production deploy, dan tidak ada perubahan main.

## SHA dan PR

### Source dan staging

- origin/develop setelah hotfix Rapor app shell dan route gate: `79d41ad9aac2ef716ef3583f7e33d257f96799da`
- origin/staging setelah promotion Rapor app shell dan route gate: `8f8ff883671b70a8a0735e4ec7b1bc8ebdbafacb`
- origin/main tetap: `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`

### Hotfix PR

- PR #524: `fix(web): harden rapor push target and view`
  - Commit: `935edd83cc665ff7653adf775b7a4778109ac179`
  - Develop merge: `f2ceae0`
  - Purpose: service worker cache hardening and Rapor target view hardening.

- PR #525: promotion to staging for PR #524
  - Staging merge: `52ec250`
  - Deploy run: `32212317914`

- PR #526: `fix(web): expose pwa assets publicly`
  - Commit: `eb4aa20a112c7d552590b012e91ab1cdea4315aa`
  - Develop merge: `02bc393`
  - Purpose: public access for `/sw.js`, manifest, and PWA assets.

- PR #527: promotion to staging for PR #526
  - Staging merge: `853a599`
  - Deploy run: `32213826845`

- PR #528: `fix(web): unify learner notification center`
  - Commit: `c3ce98bbcd9a4648c31c3734a35433f5906ec98c`
  - Develop merge: `95fdf8d8b4384fb5adcf65f33d3d3c98c264636f`
  - Purpose: in-app bell now shows notification history and announcements.

- PR #529: promotion to staging for PR #528
  - Promotion merge before GitHub merge: `66641b96e1cb9e222c667e9a1bf7288bc6dd5804`
  - Staging merge: `b9e28faaa5c1ca291e29ccd3cdf535fff99db09f`
  - Deploy run: `32220671082`

- PR #530: `fix(web): align report card learner shell`
  - Commit: `7c60331702099bc0a357028aed1603e8d220c065`
  - Develop merge: `d209b68349aa9e2076b013c122a9164209aecf7a`
  - Purpose: restyle `/dashboard/rapor` learner view with the same app shell and visual language used by siswa/orang tua dashboards.

- PR #531: promotion to staging for PR #530
  - Promotion merge before GitHub merge: `a75b63d08ab9dce812ac299273c02cf3708fbb8a`
  - Staging merge: `380badd27641abc02254dd64f2c253bd1de42f53`
  - Deploy run: `32223736070`

- PR #532: `fix(web): keep learner report route in app shell`
  - Commit: `ff360ece31ace3c8bcc50345ca90afaf7d308f94`
  - Develop merge: `79d41ad9aac2ef716ef3583f7e33d257f96799da`
  - Purpose: allow learner-only SISWA/ORANG_TUA sessions to stay on `/dashboard/rapor` while preserving `INDUSTRI` deny and staff/admin `report.read` gate.

- PR #533: promotion to staging for PR #532
  - Promotion merge before GitHub merge: `5739764444254ebb8041346c5d7d0bd2cd597bd8`
  - Staging merge: `8f8ff883671b70a8a0735e4ec7b1bc8ebdbafacb`
  - Deploy run: `32225995302`

All PRs had green CI before merge:

- Build Check: pass
- Lint & Type Check: pass
- Unit Tests: pass

Branch protection was temporarily relaxed only as explicitly authorized, then restored to one approval. Staging classic protection and the active staging ruleset were both restored to one approval after PR #529.

## Runtime Staging Verification

Staging VPS verification:

- SSH target used: `appuser@204.168.242.123`
- Staging checkout: `/opt/diis-staging/smart-ai-school`
- Checked SHA: `8f8ff883671b70a8a0735e4ec7b1bc8ebdbafacb`
- `smk-staging-api`: running and healthy
- `smk-staging-web`: running
- Health endpoint: healthy
- Production containers, database, timer, and main branch: not modified

Service worker verification after deploy:

- `/sw.js`: HTTP 200
- Active service worker content includes `diis-v2-static`
- Fetch handler skips authenticated dashboard documents
- Cache after Rapor click contains static cache only, not `/dashboard/rapor`, `/`, or `/sw.js`

## Web Push E2E Evidence

### Fixture

PII-safe synthetic student fixture:

- Label: `WAVE6_PUSH_E2E_2608190408`
- NIS: `982608190408`
- Name: `QA Wave6 Push E2E 2608190408`
- Class: `X QAW4 1`

This fixture was created and used only for staging QA.

### Subscription

Subscription was created through the official application API from an authenticated student browser session:

- Notification permission: `granted`
- Subscription endpoint host: `fcm.googleapis.com`
- Public key material count: 2
- `POST /push/subscribe`: HTTP 201

### Distribution and notification

Rapor distribution was triggered through the official API and application authorization:

- Before distribution, `/push/my-notifications`: 0
- PATCH distribute report: HTTP 200
- After distribution, `/push/my-notifications`: 1
- Notification type: `report-card`
- Subject: `Rapor semester tersedia`
- Status: `sent`

Chrome native notification appeared:

- Title: `Rapor semester tersedia`
- Body: `Rapor semester 1 tahun ajaran 2026/2027 telah dibagikan di DIIS.`
- Target URL: `/dashboard/rapor`

The user clicked the native notification. Browser opened:

- URL: `https://staging.smkdarussalamsubah.sch.id/dashboard/rapor`
- Rapor page displayed the target synthetic student.
- Previous fixture data was not displayed.
- New Rapor UI was visible.

Verdict: Web Push E2E is validated for staging.

## Permission Denied Evidence

Actual granted, subscribe, unsubscribe, and unsupported paths had already been validated in the Wave 6 staging QA.

For denied permission, the available Chrome extension/CDP surface did not support persistent `Browser.setPermission`. A runtime branch simulation was therefore used before the account panel mounted:

- Runtime override result: `Notification.permission = denied`
- Account panel displayed denied status text.
- Account panel did not display subscribed/active status.

This validates the UI branch logic. It does not claim a persistent browser permission toggle, because the available automation surface did not expose that control.

Verdict: Permission denied UI state is validated sufficiently for staging sign-off, with method caveat documented.

## Notification Center UX Closure

### Problem

The expected user mental model is:

- Native OS notification on desktop/mobile is the immediate alert and can deep-link to the relevant content.
- The in-app bell is the persistent notification center and should contain the same meaningful notification history, not only school announcements.

Before the hotfix, learner/parent notification history was only reachable in the account sheet through `PushNotificationToggle`, while the bell opened only school announcements. This created a split UX and made the bell feel disconnected from the native notification.

### Fix

PR #528 and #529 updated learner and parent dashboards:

- The bell now opens a unified `Notifikasi` modal.
- The modal has two tabs:
  - `Notifikasi`
  - `Pengumuman`
- Report-card notifications are listed in the bell surface.
- Report-card notification CTA opens `/dashboard/rapor`.
- Existing announcement content remains available under `Pengumuman`.
- Empty, loading, and error states are present.
- Student and parent workspaces use the same notification-fetch pattern.

### Browser QA

Desktop 1440x900:

- Bell modal opens.
- Title `Notifikasi` visible.
- Tabs `Notifikasi 1` and `Pengumuman 0` visible.
- Card `Rapor semester tersedia` visible.
- CTA `Buka notifikasi` visible.
- No horizontal overflow.
- Browser console errors: none observed.

Mobile 390x844:

- Bell modal opens.
- Notification and announcement tabs visible.
- Report-card notification visible.
- No horizontal overflow by viewport metrics.

Clicking `Buka notifikasi` from the bell opens:

- URL: `https://staging.smkdarussalamsubah.sch.id/dashboard/rapor`
- Target student Rapor page visible.
- No stale previous fixture content.

Verdict: Notification UX now follows the high-quality model agreed in review: native notification for immediate alert, in-app bell for persistent notification center and announcement history.

## Rapor Learner App Shell UX Closure

### Problem

After native push and in-app bell navigation, `/dashboard/rapor` displayed the correct official report data, but the page did not feel integrated with the siswa/orang tua application. The first remediation aligned the visual shell, but browser QA found a second defect: direct learner navigation to `/dashboard/rapor` could still redirect back to `/dashboard/akademik` because the page-level gate relied only on the dashboard authority projection.

### Fix

PR #530 and #531 aligned the learner Rapor page with the existing siswa/orang tua app shell:

- student shell class: `.siswa-app`;
- parent shell class: `.ortu-app`;
- dark app background and existing app tokens;
- learner top bar with DIIS identity and Dashboard action;
- bottom navigation with `Beranda`, `Notifikasi`, and active `Rapor`;
- report summary rendered as app cards, not a white operational document surface;
- detail modal uses the same dark app tokens.

PR #532 and #533 fixed the route gate:

- learner-only `SISWA`/`ORANG_TUA` sessions may open `/dashboard/rapor`;
- `INDUSTRI` remains denied;
- staff/admin roles without `report.read` remain denied;
- backend `/report-cards` remains the authoritative privacy and ownership boundary.

### Browser QA

Desktop default viewport:

- URL stayed on `https://staging.smkdarussalamsubah.sch.id/dashboard/rapor`.
- `.siswa-app` shell visible.
- Header `RAPOR RESMI` and `Dokumen semester` visible.
- Target synthetic report visible.
- `Dashboard` action and bottom navigation visible.
- Detail modal opened with dark shell background `rgb(15, 22, 35)`.
- Horizontal overflow: false.
- Clean-tab console warnings/errors: none.

Mobile 390x844:

- URL stayed on `/dashboard/rapor`.
- `.siswa-app` shell visible.
- Header, report data, distributed status, and bottom navigation visible.
- Horizontal overflow: false.
- Max element right equaled viewport width; no clipped content observed.

Parent shell source contract is present for `ORANG_TUA` via `.ortu-app`; browser parent visual proof requires a parent session fixture. No parent data or cross-child access was widened by this change.

Verdict: Rapor no longer feels like an external document page for the student app path and is ready for independent reviewer validation.

## Visual Evidence

Screenshots were saved locally as PII-safe QA artifacts:

- `.tmp/wave6-qa-20260819/wave6-rapor-push-desktop-1440x900.png`
- `.tmp/wave6-qa-20260819/wave6-rapor-push-mobile-390x844.png`
- `.tmp/wave6-qa-20260819-final/wave6-notification-center-desktop-1440x900.png`
- `.tmp/wave6-qa-20260819-final/wave6-notification-center-mobile-390x844.png`
- `.tmp/wave6-qa-20260819-rapor-shell/wave6-rapor-shell-desktop.png`
- `.tmp/wave6-qa-20260819-rapor-shell/wave6-rapor-shell-mobile-390x844.png`

The mobile screenshot capture for the notification center had a browser-extension capture artifact, so final judgment used DOM and viewport metrics. Product behavior and layout metrics passed.

Screenshots remain local and untracked because they are evidence artifacts, not source.

## Verification Commands and Results

Hotfix PR #528 source checks:

- `apps/web` focused test `academic-operational-ui.test.ts`: 1 suite / 19 tests pass
- Web type-check: pass
- Web lint: pass, only existing Next lint deprecation/plugin warning
- Web build: pass, 39/39 pages
- `git diff --check`: pass

Hotfix PR #530 source checks:

- `apps/web` focused test `academic-operational-ui.test.ts`: 1 suite / 19 tests pass
- Web type-check: pass
- Web lint: pass, only existing Next lint deprecation/plugin warning
- Web build: pass, 39/39 pages
- `git diff --check`: pass

Hotfix PR #532 source checks:

- `apps/web` focused test `academic-operational-ui.test.ts`: 1 suite / 19 tests pass
- Web type-check: pass
- Web lint: pass, only existing Next lint deprecation/plugin warning
- Web build: pass, 39/39 pages
- `git diff --check`: pass

Staging post-deploy checks:

- Deploy run `32220671082`: success
- Deploy run `32223736070`: success
- Deploy run `32225995302`: success
- Staging SHA: `8f8ff883671b70a8a0735e4ec7b1bc8ebdbafacb`
- API health: healthy
- Web container: running
- Open PR count: 0
- develop/staging branch protection restored to one approval
- main unchanged: `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`

## Final Accessibility, Parent, and Cleanup Closure

Independent re-review found five narrow UX/accessibility gaps after the first Rapor shell delivery. They were fixed and revalidated in the same Wave 6 scope.

### Delivery binding

- PR #534, source `f97b2d632a9a9e08609f84345d719d8dafa140d0`: learner notification navigation, shared dialog, parent child context, contrast, touch targets, and KKTP copy.
- Develop merge for PR #534: `cc40b31a98555a6964d83ea0d23d47c3516a3deb`.
- PR #535 staging merge: `c58a8ec8c9fd1cba51fa8844f5e21977aae941e5`.
- Deploy run: `32231269178`, success.
- Browser re-QA found two residual details: missing explicit `aria-modal=true` and no focus restoration to the bell.
- PR #536, source `a8941b7a643ef64beb0720bb4d204266e7113773`: explicit modal semantics and focus restoration.
- Develop merge for PR #536: `e76e5716259262ffd288231d3a842556fc9d665f`.
- PR #537 staging merge and final tested staging SHA: `a02a20980c222966a606ffc96368f1afe6ba8a8e`.
- Final deploy run: `32233585043`, success.
- Final runtime: `smk-staging-api` healthy and `smk-staging-web` running.
- `origin/main` remained `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`.
- Classic develop/staging protections and the active staging ruleset were restored to one approval.

All CI checks for PR #534 through PR #537 passed: Build Check, Lint & Type Check, and Unit Tests.

### Source verification

- Focused web after the first remediation: 2 suites / 24 tests passed.
- Full web after the first remediation: 34 suites / 209 tests passed.
- Focused web after focus remediation: 2 suites / 25 tests passed.
- Full web after focus remediation: 34 suites / 210 tests passed.
- Web type-check: pass.
- Web lint: pass, only the existing Next lint deprecation/plugin warning.
- Web build: pass, 39/39 pages.
- Diff and cached checks: pass.

### SISWA browser result

- Rapor `Beranda` and `Notifikasi` have distinct destinations.
- `Notifikasi` opens `/dashboard/akademik?panel=notifications` and the unified center.
- Bell accessible name is `Notifikasi dan pengumuman`.
- Dialog exposes `role=dialog`, `aria-modal=true`, title/description relationships, and initial focus on the close control.
- Close control measures 44x44 CSS pixels.
- Focus remains inside the Radix modal; Escape closes it and focus returns to the bell.
- Mobile viewport is exactly 390x844, dialog width is 390, and document/dialog horizontal overflow is absent.
- Fresh-tab console warning/error result: empty.
- Rapor CTA contrast measured 10.49:1. Passive bottom-navigation contrast measured 6.36:1. All inspected primary controls were at least 44 CSS pixels high.
- Internal `system_default` is not displayed; learner copy is `Standar sekolah` or `Snapshot resmi` as appropriate.

### ORANG_TUA browser result

- A DB-backed PII-safe parent fixture remained on `/dashboard/rapor?studentId=<owned-child>` and rendered `.ortu-app` on desktop and mobile.
- The selected owned child was shown and the notification link preserved its child context.
- A valid but unowned synthetic `studentId` returned zero report cards and no owned-child data.
- Navigation then normalized safely to the parent's owned child; no stale cross-child Rapor appeared.
- Clicking the parent's Rapor notification returned to the correct owned-child Rapor route.
- The parent dialog produced the same modal semantics, 44x44 close target, Escape behavior, focus containment, and focus restoration as SISWA.
- Fresh-tab console warning/error result: empty.
- The reusable parent fixture currently has one owned child; isolation was therefore proven with an unowned ID rather than a two-owned-child switch.

### Subscription and fixture cleanup

- The browser subscription was disabled through the official learner account UI.
- UI state changed from `Notifikasi Aktif` to `Aktifkan Notifikasi`.
- A read-only staging count found one stale server subscription for the Wave 6 E2E fixture.
- Cleanup used the deployed `PushService.dispatchNotificationLog` path, not SQL or direct deletion. The expired endpoint returned the stale path and the service removed it through its normal 404/410 handling.
- Redacted result: two matching Wave 6 synthetic fixtures; subscription counts changed `1 -> 0` and `0 -> 0`; total remaining subscriptions: 0.
- Synthetic users/reports were restored to the approved reusable, PII-safe staging-fixture state and remain active for repeatable regression QA.
- No Wave 6 credential/token file was committed. The shared Wave 5 credential manifest remains local because it is the approved reusable fixture registry.
- Screenshots remain local under `.tmp/wave6-qa-20260819-notification-remediation/` and contain synthetic data only.
- No production container, database, timer, or branch was changed.

## Notification Contrast and Parent Target Follow-up

Independent final sign-off review found two remaining P2 issues: active notification-tab
contrast and parent notification routing for families with more than one child. Both were
fixed, promoted to staging, and revalidated against the deployed staging runtime.

### Delivery binding

- PR #540, source commit `068c1c8f2030b1375171e7ff137e7f7dca155bb8`: fixes learner notification contrast and server-bound report notification targets.
- Develop merge for PR #540: `0418ab827671c595183b90f0e627562ec6b10bc7`.
- PR #541 staging merge and final tested staging SHA: `9bd3f70b5599b189cf4fd3e157efdabe56eb90d0`.
- Deploy run: `32239822568`, success.
- Runtime preflight: `/opt/diis-staging/smart-ai-school` on branch `staging`, `smk-staging-web` running, `smk-staging-api` running and healthy.
- `origin/main` remained `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`.
- No open PR remained after promotion.

All CI checks for PR #540 and PR #541 passed: Build Check, Lint & Type Check, and Unit Tests.

### Source verification

- API focused push notification test: 15/15 passed.
- API focused report distribution + push notification tests: 89/89 passed.
- Web focused learner notification tests: 27/27 passed.
- API/web type-check: pass.
- API/web lint: pass, only the existing Next lint deprecation/plugin warning.
- Diff and cached checks: pass.

### Browser contrast result

- SISWA notification center on staging:
  - `role=dialog` and `aria-modal=true` present.
  - Active `Notifikasi` tab uses `rgb(2, 44, 34)` on `rgb(209, 250, 229)`, measured 13.36:1.
  - Inactive `Pengumuman` tab measured 6.97:1.
  - Notification open control and close control were both 44 CSS pixels high.
- ORANG_TUA notification center on staging:
  - `role=dialog` and `aria-modal=true` present.
  - Active `Notifikasi` tab uses `rgb(23, 37, 84)` on `rgb(219, 234, 254)`, measured 12.04:1.
  - Inactive `Pengumuman` tab measured 6.03:1.
  - Active controls were at least 44 CSS pixels high.
- Rapor completed-step indicator on staging:
  - Completed status icon container uses `rgb(2, 44, 34)` on `rgb(209, 250, 229)`, measured 13.36:1.
  - Distributed status badge measured 13.52:1 on the dark learner shell.

### Parent two-child routing result

- Existing reusable ORANG_TUA fixture initially had one owned child.
- A second PII-safe child was created through the official staging provisioning API with `reuseParentByPhone=true`; no direct SQL was used.
- The second child's report was generated by the class teacher fixture, checked by the WAKA fixture, published by Super Admin, and distributed by Tata Usaha through the official report-card API.
- Distribution returned `notificationHandoff.status=queued`, `intentCount=3`, and `queuedCount=3`.
- `GET /api/v1/push/my-notifications` as ORANG_TUA returned two report-card notifications with two distinct server-resolved `targetHref` values.
- The same response did not include raw `refId`.
- Browser QA while child B was active:
  - Opening the older report notification for child A navigated to `/dashboard/rapor?studentId=<child-a>` and rendered child A's report.
  - `Beranda` from that report returned to `/dashboard/akademik?studentId=<child-a>` and kept child A selected.
- Browser QA while child A was active:
  - Opening the newer report notification for child B navigated to `/dashboard/rapor?studentId=<child-b>` and rendered child B's report.
  - Reloading the child B report kept child B selected.
  - `Dashboard`, `Beranda`, and `Notifikasi` links from the child B Rapor shell all preserved `studentId=<child-b>`.
  - Opening `Notifikasi` from the Rapor shell kept the child B context and loaded the notification center after the normal fetch delay.
- The two-child proof used only synthetic fixture names and redacted identifiers in this report.

## Residuals

No P0/P1/P2 is known from executor QA after the final hotfix and re-QA.

Documented caveats:

1. Denied permission proof used runtime branch simulation because persistent Chrome permission override was unavailable in the extension/CDP surface.
2. The parent fixture now has two owned synthetic children. Two-child notification routing, selected-child route preservation, refresh, and notification return were validated after PR #541.
3. One `ChunkLoadError` was recorded by a tab held open across deployment. A new post-deploy tab on the same final SHA had no console warning/error, so the old event is classified as a deploy-boundary artifact.
4. This report is staging evidence only. Production/main promotion still requires final reviewer approval.

## Final Recommendation

Executor recommendation: request independent final reviewer sign-off for Wave 6 staging.

If reviewer accepts this evidence:

1. Plan staging to main promotion through normal Gitflow.
2. Keep production deploy separate from source/staging approval.
3. Preserve branch protection at one approval after any authorized temporary relaxation.
4. Do not alter production timer or unrelated infrastructure during promotion.
