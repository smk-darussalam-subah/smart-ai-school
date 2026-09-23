# DIIS Installable Experience Checkpoint A: Independent Delivery-Proof Re-review

Date: 2026-09-23
Role: Independent Reviewer
Verdict: `APPROVED FOR EXPLICIT GIT PACKAGING - STAGING AND INSTALLED-PWA QA HOLD`

## Findings

No verified P0, P1, P2, or P3 finding remains in the reviewed seven-path closure.

The prior P1-AR01 is closed. The worker no longer treats its persisted `signed-in` record as
sufficient authority to display a push. Before `showNotification`, it reads the actual browser
subscription and obtains a fresh same-origin, no-store decision from the authenticated API. The
API validates the bounded endpoint/proof DTO, resolves the active authenticated user through the
existing global fail-closed auth path, confirms that user still owns the endpoint, and compares the
server-generated HMAC proof in constant time. Missing session, changed owner, invalid proof,
malformed response, absent subscription, and network failure all suppress notification display.

The proof is generated inside `dispatchNotificationLog` from the intended user ID and the exact
validated endpoint. The previous double-failure reproduction was repeated against the final worker:
the local record intentionally remained `signed-in` for the old account, server verification
returned `deliver:false`, and `showNotification` was called zero times. A positive control with
`deliver:true` displayed exactly one notification and sent the expected endpoint/proof request with
`credentials:same-origin`, `cache:no-store`, and `redirect:error`.

## Exact review binding

- Checkout: `C:/Users/USER/.codex/worktrees/diis-installable-experience-20260921`
- Branch: `feat/diis-installable-experience-20260921`
- Baseline commit: `5143c28620c7fbf2db356f8eecfe6ac6ca25e559`
- Baseline tree: `3481339b5af93867fd2bfa881c6d2068b160885e`
- Executor report SHA-256: `5f567b97817216e01726c7ccc2e255bfb7b53281c777e854cf05af95e360ce57`
- Source manifest: 33/33 paths matched current Git status; staged files: 0
- Source aggregate independently reproduced: `83fc06741f2a3618571c77208e854f0354a4df0be5a874ff852b665d2722a88e`
- Seven closure hashes: 7/7 matched the Executor report

Reviewed closure paths:

1. `apps/api/src/__tests__/p16-ai-push.spec.ts`
2. `apps/api/src/push/dto/push.dto.ts`
3. `apps/api/src/push/push.controller.ts`
4. `apps/api/src/push/push.service.ts`
5. `apps/web/public/sw.js`
6. `apps/web/src/lib/push.ts`
7. `apps/web/src/__tests__/pwa-runtime-security.test.ts`

## Independent verification

- Focused Web PWA/service-worker: 2 suites, 78/78 passed.
- Focused API push: 1 suite, 20/20 passed.
- Full Web: 55/55 suites, 454/454 tests passed.
- Full API: 74 active suites, 1,392 active tests passed; 2 suites/11 guarded tests skipped.
- Web and API type-check: passed.
- Web and API lint: passed. Only the existing Next.js lint migration notices were emitted.
- API production build: passed.
- Web production build: passed, including 50/50 generated static pages.
- Service-worker JavaScript syntax: passed.
- Prisma schema validation: passed after supplying a disposable syntactically valid
  `DATABASE_URL`; the first invocation had only failed because the local variable was absent and did
  not connect to or mutate a database.
- `git diff --check` and cached diff check: passed.
- Independent negative and positive worker controls: passed as described above.

## Residual boundaries

- This is source approval only. It does not establish installed-mode behavior on Android,
  iPhone/iPad, Windows, or macOS.
- No authenticated remote push was sent, and no staging or production runtime was accessed.
- Availability now intentionally depends on a live authenticated verification response; an offline
  or unreachable API suppresses the notification. This is the required privacy-safe behavior, not
  an availability claim.
- Packaging must bind the exact 33-path manifest, aggregate, Executor report, and this reviewer
  report. Any byte change invalidates this approval.

## Gate decision

The exact reviewed snapshot is approved for a separate, explicit Git packaging gate. Packaging,
merge, staging promotion, deployment, and installed-PWA/device QA remain separate approvals. The
next runtime acceptance should cover account switching, logout, expired/no session, proof mismatch,
network failure, and a valid current-owner notification on each supported installed platform.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: Git Packager mengikat exact 33-path source manifest plus Executor dan Reviewer
reports, runs CI on the exact head, and stops before merge; all runtime gates remain HOLD.
Model / effort: GPT-5.6 Terra (`gpt-5.6-terra`) / medium.
Alasan: semantic privacy review is complete; the next task is a literal manifest/hash/CI packaging
transaction with mechanically checkable evidence.
Syarat kualitas: no missing or extra paths, exact hashes preserved, clean cached diff, secret scan
clean, and required CI bound to the exact head.
Eskalasi bila: packaging reveals source drift or CI changes notification behavior -> GPT-5.6 Sol
(`gpt-5.6-sol`) / high for renewed source review.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
