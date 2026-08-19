# Wave 6 Phase 5 Report Card Completion - Staging QA

Date: 2026-08-18
Last updated: 2026-08-19
Environment: staging
Status: STAGING QA COMPLETE - ready for reviewer final sign-off and main promotion planning

## Scope

This report records the delivery and staging QA evidence for Wave 6 Phase 5 Report Card
Completion. It covers report-card source packaging, develop and staging promotion,
runtime health, official report-card visibility for student/family, distribution
notification intent, and role-boundary checks.

Production and main were not modified during this QA pass.

## Delivery Summary

- Source branch: `feat/wave6-report-card-completion-20260818`
- Source commit: `e42736544ba9e0c1a72ccac2b2db0b955647370f`
- Develop PR: `#516`
- Develop merge SHA: `202a18c48dd0a9265d267c936817639ca309583a`
- Staging promotion PR: `#517`
- Staging merge SHA: `0532daa0dffca727cd16554b9d7bde363c7bf97f`
- Staging deploy run: `32130607177`

## Same-Wave Staging Hotfix

During staging boundary QA, `ORANG_TUA` received `403` from
`GET /push/my-notifications`. Root cause: the push controller still required `lms.read`,
while parent report notifications rely on `report.read`.

Hotfix:

- Branch: `fix/wave6-parent-push-permission-20260818`
- Commit: `4f669f6709705d5cf8fa3c46f0239fc9fe7df73e`
- Develop PR: `#518`
- Develop merge SHA: `becb8ca2aa2a49d9bac98e9b2ba851391dcad905`
- Staging promotion PR: `#519`
- Staging merge SHA: `902e0e8815fe27ce37101eee71f810b6bcd177bd`
- Staging deploy run: `32132683862`

## Same-Wave Runtime Config Hotfix

During actual Chrome PWA Push QA, the browser capability matrix was valid but the
student UI still showed push as unavailable. Runtime inspection confirmed the staging
containers did not receive VAPID configuration. Root cause: deployment and compose files
did not pass the existing VAPID environment into the API container and Next.js build.

Hotfix:

- Branch: `fix/wave6-vapid-runtime-env-20260819`
- Commit: `5da27e56cce52d5442303ebac8537ad4a451885e`
- Develop PR: `#520`
- Develop merge SHA: `5296bbca7c6f39b90a1d806835fd2af296e4d0e8`
- Staging promotion PR: `#521`
- Staging merge SHA: `5690d32b1b7b3439f7550175287f2bd944bdf027`
- Staging deploy run: `32205377829`

Final deployed staging SHA:

`5690d32b1b7b3439f7550175287f2bd944bdf027`

## Runtime Preflight

- Staging checkout: `/opt/diis-staging/smart-ai-school`
- Staging containers: `smk-staging-web` running, `smk-staging-api` running and healthy
- Staging health endpoint: HTTP 200, database up, memory checks up
- Staging VAPID runtime state after PR `#521`: API public/private/subject values present
  with expected redacted lengths; web `NEXT_PUBLIC_VAPID_PUBLIC_KEY` present
- Production checkout: `/home/appuser/smart-ai-school`
- Production SHA remained `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`
- Production containers `smk-web` and `smk-api` were only inspected read-only
- No production timer, database, container, branch, or source mutation was performed

## Branch Protection

- Develop classic required approvals restored to `1`
- Staging classic required approvals restored to `1`
- Ruleset `Protect Staging` required approvals restored to `1`
- Ruleset `Protect main` remains active with required approvals `1`
- Open PR list after staging hotfix merge: empty

## API Staging QA

All authentication used existing DB-backed synthetic PII-safe staging accounts. No
credential, token, cookie, phone, email, or raw personal data is included in this report.

### Auth Matrix

Authenticated successfully:

- `SUPER_ADMIN`
- `GURU_OWNER`
- `SISWA`
- `ORANG_TUA`
- `TATA_USAHA`
- `GURU_NO_ASSIGNMENT`
- `KEPALA_SEKOLAH_APPOINTMENT`
- `WAKA_APPOINTMENT`
- `INDUSTRI`

### Official Report Pipeline

Using official APIs only:

1. `SUPER_ADMIN` set the synthetic class homeroom teacher to the synthetic owner guru.
2. `GURU_OWNER` created a synthetic grade through `POST /grades`.
3. `GURU_OWNER` generated report cards through `POST /report-cards/generate`.
4. `WAKA_APPOINTMENT` checked the report.
5. `KEPALA_SEKOLAH_APPOINTMENT` published the report.
6. `TATA_USAHA` distributed the report.

Observed pipeline result:

- Generate: HTTP 201, `generated=1`, `refreshed=0`, `skipped=0`, `totalStudents=1`
- Check: HTTP 200
- Publish: HTTP 200
- Distribute: HTTP 200
- Final report status: `distributed`
- Notification handoff: `queued`
- Notification intents: `3`
- Queued logs: `3`

### Family and Student Visibility

- `ORANG_TUA /report-cards`: HTTP 200, one distributed report visible
- `SISWA /report-cards`: HTTP 200, one distributed report visible
- `ORANG_TUA official sections`: HTTP 200, official section snapshot available
- `SISWA official sections`: HTTP 200, official section snapshot available
- `ORANG_TUA /push/my-notifications`: HTTP 200, one notification visible
- `SISWA /push/my-notifications`: HTTP 200, one notification visible

Notification privacy checks:

- Channel was `push`
- Reference type was `report-card`
- Returned fields were bounded to UI-safe notification fields
- No recipient, subscription endpoint, refId, email, phone, answer key, rubric, or secret was returned
- Generic report words were expected in the notification body

### Negative Controls

- `INDUSTRI /push/my-notifications`: HTTP 403
- `INDUSTRI /report-cards`: HTTP 403
- `SISWA` forged status transition: HTTP 403
- `ORANG_TUA` forged status transition: HTTP 403
- `GURU_NO_ASSIGNMENT` forged report generation for unrelated class: HTTP 403

## Browser QA

Browser sessions used synthetic accounts and federated logout between roles.

### Student

- URL: `/dashboard/akademik`
- Dashboard loaded without new console errors.
- From the `Nilai` screen, the `Rapor resmi` CTA was visible.
- CTA opened `/dashboard/rapor`.
- Distributed report was visible.
- Detail dialog opened.
- Detail showed report snapshot sections, including `Nilai akhir`, `KKTP snapshot`,
  attendance summary, checker, publisher, and distributor fields.

### Parent

- URL: `/dashboard/akademik`
- Dashboard loaded without new console errors.
- From the `Nilai` screen, the `Rapor resmi` CTA was visible.
- Precise button click opened `/dashboard/rapor?studentId=...`.
- Distributed report was visible.
- Detail dialog opened.
- Detail showed report snapshot sections, including `Nilai akhir`, `KKTP snapshot`,
  attendance summary, checker, publisher, and distributor fields.
- Operational actions such as generate, publish, distribute, and recovery were not exposed
  to the parent account.

### Mobile

- Browser viewport: `390x844`
- Parent `/dashboard/rapor` loaded.
- Distributed report and detail action were visible.
- Document width matched viewport width.
- Horizontal overflow: false.
- No new console errors were observed.

### Negative Browser Role

- `INDUSTRI` direct navigation to `/dashboard/rapor` did not expose report data.
- The account was redirected/blocked at the dashboard boundary as expected.

## PWA Push Status

In-app browser validation:

- The in-app browser does not expose `Notification`, `ServiceWorker`, or `PushManager`.
- It cannot be used for actual browser-level PWA Push subscription proof.

Chrome diagnostics:

- Google Chrome is installed.
- The ChatGPT browser extension is installed and enabled in the selected Chrome profile.
- The native host manifest is correct.
- Chrome browser-level capabilities passed:
  - `Notification`: available
  - `ServiceWorker`: available and ready
  - `PushManager`: available
  - secure context: true

Chrome subscription proof:

- Synthetic `SISWA` account opened `/dashboard/akademik`.
- Before the VAPID runtime hotfix, UI correctly reported push unavailable.
- After PR `#521` deploy, account panel showed `Aktifkan Notifikasi`.
- Clicking `Aktifkan Notifikasi` triggered the native Chrome notification permission prompt.
- Permission was granted for the staging origin.
- Browser subscription was created successfully.
- Endpoint host was `fcm.googleapis.com`; raw endpoint and keys were not recorded.
- Subscription key material count was `2`, confirming `p256dh` and `auth` browser keys existed.
- UI changed to `Notifikasi Aktif`.
- `Riwayat Notifikasi (1)` opened and displayed the report-card notification.
- Notification history did not expose endpoint, key material, recipient identifiers, answer keys,
  rubrics, raw answers, or secrets.
- Clicking `Notifikasi Aktif` unsubscribed successfully.
- Final cleanup state: browser permission remained `granted`, browser subscription was absent,
  and UI returned to `Aktifkan Notifikasi`.
- Dashboard reload after cleanup showed no captured browser runtime, network, or log errors.

Scope note:

- This closes the browser-level PWA Push subscribe/history/unsubscribe proof.
- This pass did not trigger a new report distribution after subscription, so OS-level push toast
  delivery for a new event remains optional reviewer hardening rather than a source or staging
  blocker for the Wave 6 report-card completion contract.

## Current Gate Status

Source packaging: complete.
Develop promotion: complete.
Staging promotion: complete.
Runtime health: pass.
Official report-card API and browser visibility: pass.
Role negative controls: pass.
Notification in-app history and privacy: pass.
Actual browser-level PWA Push subscription: pass.

Wave 6 is ready for final independent reviewer sign-off and main promotion planning.

## Residuals

- No P0/P1/P2 product blocker was found in the completed API/browser matrix.
- Optional hardening: trigger a fresh report distribution while Chrome subscription is active
  if reviewer requires OS-level toast evidence in addition to subscription and history proof.

## Cleanup

- No production state was changed.
- No SQL was executed directly.
- No container files were patched.
- No active browser push subscription was left for the synthetic account after cleanup.
- Temporary QA files remain under `.tmp/` and must not be committed.
- The historical untracked Wave 5 report remains outside Wave 6 packaging scope.
