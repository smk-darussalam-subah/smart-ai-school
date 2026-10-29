# Mixed-role concurrency — local implementation and handoff

Date: 29 October 2026 WIB. Local source only; Git, staging, production and commissioning HOLD.

## Result

The mixed-role implementation extends the prior 67-path concurrency package. It preserves the unrelated Metabase retirement and the assessment processing-time deadline rule. There are no new dependencies, schema changes or services.

- Automatic assessment network saves coalesce every five seconds without starving continuous typing. Encrypted device drafts remain immediate. Manual save/final submit bypass the timer; late acknowledgements cannot restore a completed attempt.
- Authenticated bootstrap and selected own/child reads receive explicit shared-peer transport budgets. User, AI and ordinary mutation quotas remain enforced. Semester query validation runs before persistence.
- Parent dashboards poll opaque, relationship-bound data/scope revisions instead of reloading all data when unchanged. Detected permission/scope loss withdraws obsolete child content while authorized data reloads.
- Only the two anonymous active-period catalogs share a bounded process-local read. Private responses remain uncached. Successful mutations invalidate; failed or stuck reads do not remain cached.
- Parent messages are bounded to the newest 20 by default, maximum 100; the Web consumer now reads the actual array response.
- Mixed-NAT portal budget accounts for autosave, heartbeat, parent updates and staff clicks. Login burst remains separate; abuse is still rejected.
- Independent autosaves share the existing period barrier instead of taking an exclusive global lock. Semester close, appointment activation and all other lifecycle writers retain the exclusive lock on the same key; response revision checks remain atomic.

## Verification and limits

Full Web 109 suites / 1,366 tests; focused API 119 tests and the later 74-test period regression (187 distinct tests across 12 suites after deduplication; the eight shared-budget controls are included). Actual PostgreSQL 26/26 passes, including five new shared/exclusive period controls. Fresh API/Web type-check, scoped lint (31 paths, zero errors/warnings), API build and standalone Web build pass locally. Actual optimized-component browser controls: parent 12 and assessment eight. Built Next catalog proof includes 730 RSC callers, real Server Action invalidation, failure recovery and timeout. Actual Linux Nginx proves the mixed-NAT counterexample and corrected limit, retaining abuse controls.

Actual local HTTP, JWT signature verification, production guards/controllers/services and PostgreSQL exercise 730 synthetic identities. The controlled final stage offers all 730 intents with 100 transport workers, submits 350 answers, and synchronizes 350 unique Gradebook records. Its queue delay is included in latency.

The first seven-minute mixed run processed 25,077 sustained requests without HTTP errors, but its subsequent 730-new-socket stage failed with ECONNREFUSED. An empty Node HTTP server without DIIS reproduces that transport failure. This is not a clean end-to-end PASS for that attempt and is not a production defect/capacity determination. Adding real heartbeats then exposed the exclusive-period bottleneck; the first corrected 90-second exploration profile sent all 10,126 scheduled requests with zero errors or omitted intents. The final acceptance repeats normal usage for 60 seconds and exploration for 120 seconds: 4,261 + 13,576 requests, zero errors, zero drops/coalesced intents; the complete main profile includes 29,667 requests and 350 unique synchronized grades. Exploration p95 is 190 ms; cold bootstrap p95 is 7,621 ms. Prior failed runs remain preserved. PostgreSQL uses five connections, one CPU and 512 MiB; generator and API share a process, so resource/latency results are local samples, not isolated production capacity.

No claim of 730 browser sessions, real Keycloak login capacity, Cloudflare behavior, 60-minute soak, external AI/provider/push throughput, Linux exact-candidate artifact, staging acceptance or production SLA. Deferred KKTP narrative P3 and historical operational residuals remain open.

## Review materials

Outer workspace: `docs/audits/DIIS-MIXED-ROLE-LOCAL-REMEDIATION-AND-REVIEW-HANDOFF-2026-10-29.md`.

Evidence root: `output/mixed-role-remediation-20261029/`. `SOURCE-MANIFEST.json` binds the combined package and current-task delta. `COMBINED-DELTA.patch` is reconstructed without modifying the source/index. `SCREENSHOTS.html` contains actual production components in explicitly synthetic local fixtures.

## Recommendation

Next actor: fresh independent reviewer of the exact combined manifest, shared-period/exclusive-cutover races and mixed-role/privacy/autosave contracts. GPT-5.6 Sol (`gpt-5.6-sol`) / xhigh because the performance fix changes a transaction barrier while preserving academic-period closure. Actual session model/effort is not verified. This handoff does not authorize packaging or runtime mutation.
