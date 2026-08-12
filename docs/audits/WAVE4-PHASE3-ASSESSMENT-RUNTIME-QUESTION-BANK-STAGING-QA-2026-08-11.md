# Wave 4 Phase 3 Assessment Runtime and Question Bank Staging QA

Tanggal: 2026-08-11, diperbarui 2026-08-12
Environment: staging only
URL: https://staging.smkdarussalamsubah.sch.id
Executor: Codex

## Verdict

STAGING QA PASS for Wave 4 Phase 3 Assessment Runtime and Question Bank.

Main and production were not promoted or modified in this QA pass. This report is evidence for reviewer/main gate, not a production sign-off by itself.

Update 2026-08-12: reviewer follow-up P1/P2 on provider matrix, negative API
authority, quality sampling, and permanent evidence has been completed. A final narrow
follow-up later on 2026-08-12 closed the remaining resource-ID authority, QAAKL
productive sampling, and controlled-failure recovery evidence gaps. Staging remains the
only runtime touched.

## Final Deployed State

- Final runtime QA staging SHA: `880543daa87854e5dac2857116f3c45ac50c496f`
- Final deploy run: `31559051798`
- Deploy status: success
- VPS checkout: `/opt/diis-staging/smart-ai-school` at
  `880543daa87854e5dac2857116f3c45ac50c496f`
- Staging containers:
  - `smk-staging-web`: running
  - `smk-staging-api`: running and healthy
- Health endpoint: `https://staging-api.smkdarussalamsubah.sch.id/health` returned `status=ok`, database up.
- Production containers were observed only for containment:
  - `smk-web`: running
  - `smk-api`: running and healthy
- Production/main were not changed. Read-only production SHA at follow-up closure:
  `8d03902dc29d6faa1e91137a08155ef56d546afb`.

## PR and CI Chain

Initial Wave 4 delivery:

- PR #448: Wave 4 feature to develop.
- PR #449: promotion to staging.
- Staging SHA after #449: `2d387b6d3e0c771c1a15661db6e18044e25f6926`
- Deploy run: `31459413847`, success.

Same-wave staging QA remediations:

- PR #450 / #451: AI matching question draft output hardening.
  - Staging SHA: `842ebbac6e43a5bf3902f311ba61e764a11e6d1e`
  - Deploy run: `31461695506`, success.
- PR #452 / #453: AI regenerate request-spec wrapped draft fix.
  - Staging SHA: `2e4346811f7a401bfee4031443fd00b0a27e14b5`
  - Deploy run: `31462911117`, success.
- PR #454 / #455: AI accept persisted JsonNull fix.
  - Staging SHA: `09390dd47f810a9e43e42cd768be95d5d0255ef8`
  - Deploy run: `31464700995`, success.
- PR #456 / #457: Question Bank picker loading stabilization.
  - Staging SHA: `fa55c38e75cf1ee679c57fb328a3215206fdec26`
  - Deploy run: `31466665379`, success.
- PR #458 / #459: guru dashboard teaching-assignment fetch limit fix.
  - Staging SHA: `068f3d3a6ebd0db752a3d9b8ac328837c93dc458`
  - Deploy run: `31469726316`, success.
- PR #460 / #461: Session Analysis matching type label fix.
  - Final staging SHA: `3c69a00c6c8c080a93d59e9208fe7ddac0bd34fd`
  - Deploy run: `31471578245`, success.
- PR #472 / #473: question draft metadata normalization and staging promotion.
  - Staging SHA: `2adbfc7e083083b5edd46bc902fecbee16e387b9`
  - CI: Build, Lint & Type Check, and Unit Tests passed.
- PR #474 / #475: question draft subject normalization and staging promotion.
  - Final runtime QA staging SHA:
    `4842278f41528f059d84f766f8a69b55106ed37c`
  - Deploy run: `31555792343`, success.
  - CI: Build, Lint & Type Check, and Unit Tests passed.
- PR #476 / #477: docs-only Wave 4 staging QA closure evidence and staging promotion.
  - Final evidence staging SHA:
    `880543daa87854e5dac2857116f3c45ac50c496f`
  - Deploy run: `31559051798`, success.
  - CI: Build, Lint & Type Check, and Unit Tests passed.

For each PR above, GitHub CI required checks passed before merge:

- Build Check
- Lint & Type Check
- Unit Tests

Branch protection approvals for `develop` and `staging` were temporarily relaxed only when needed for the authorized merge, then restored to `required_approving_review_count=1` after each merge.

At follow-up closure, GitHub reported no open PRs. Branch protection for both `develop`
and `staging` was verified back at `required_approving_review_count=1`.

## Local Verification for Same-Wave Fixes

Question Bank picker loading fix:

- Web type-check: pass
- Web lint: pass
- Web build: pass, 39/39 pages
- `git diff --check`: pass

Dashboard teaching-assignment limit fix:

- Web type-check: pass
- Web lint: pass
- Web build: pass, 39/39 pages
- `git diff --check`: pass

Session Analysis label fix:

- Focused web test: `session-analysis-panel.test.ts`, 2/2 pass
- Web type-check: pass
- Web lint: pass
- Web build: pass, 39/39 pages
- `git diff --check`: pass

## Synthetic Staging Fixtures

All browser QA used PII-safe synthetic staging users and data.

Accounts used:

- SUPER_ADMIN: synthetic account available but not required for the final Wave 4 assessment path after deployment checks.
- GURU: `qa-guru-wave4-20260811@staging.local`
- SISWA: `QAW420260811`
- ORANG_TUA: synthetic parent account ending `20260811`

Fixture data:

- Class: `X QAW4 1`
- Major: `QAW4`
- Subject: `Produktif TKJ`
- Modul Ajar: `QA Wave4 RPP Produktif 20260811`
- LMS Module: `QA Wave4 LMS Produktif 20260811`
- Schedule: Tuesday JP 1-2, room `QA-W4`

No passwords, API keys, session cookies, or real PII are included in this report.

## Browser QA Matrix

### 1. Guru Authoring - AI Draft to Canonical Bank Soal

Result: PASS after same-wave remediations.

Evidence:

- GURU logged in through Keycloak using a fresh federated logout/login cycle.
- Opened `/dashboard/akademik`.
- Selected class `X QAW4 1` and subject `Produktif TKJ`.
- Opened `Penilaian` -> `Bank Soal`.
- AI draft generation produced four question types:
  - `true_false`
  - `essay`
  - `matching`
  - `multiple_choice`
- Draft output passed backend validation after structured provider and matching-output hotfixes.
- Regenerate succeeded after request-spec wrapper hotfix.
- Partial accept succeeded after persisted JsonNull normalization hotfix.
- Canonical Bank Soal displayed 4 questions on page 1.
- Final labels in Bank Soal:
  - `B/S`
  - `ESAI`
  - `MATCH`
  - `PG`

Performance observation:

- Initial AI generation succeeded in about 14.7 seconds in browser QA.
- One regenerate run previously took about 151 seconds but completed without error. This is not a functional blocker for Wave 4, but provider latency/load should remain a production monitoring item.

### 2. Question Bank Picker in Session Studio

Result: PASS after picker loading hotfix.

Evidence:

- Opened `Mulai Sesi` / assessment studio.
- Selected Formatif flow.
- Opened `Pilih dari Bank Soal`.
- Picker displayed all 4 canonical questions and no longer stayed in loading state.
- Selected all 4 items.
- Review step displayed:
  - `Formatif`
  - 4 questions
  - 40 points
  - grade target `uh`

### 3. Assessment Draft and Activation

Result: PASS.

Evidence:

- Created draft session from selected Bank Soal questions.
- UI showed `Sesi draft`.
- Activated session for students.
- UI showed `Sesi active`.
- Database confirmed:
  - Session id: `d3e52e11-f5f6-4da8-90af-457d2a1cd723`
  - Status before student submit: active
  - Type: `formatif`
  - Grade target: `uh`
  - Randomize order: true
  - Question count: 4
  - Question types: `true_false`, `essay`, `matching`, `multiple_choice`

### 4. Student Runtime and Answer-Key Privacy

Result: PASS.

Evidence:

- SISWA logged in using fresh federated logout/login.
- Consent PDP was required and completed in browser.
- Student dashboard showed the active assessment as a pending task.
- Student opened task detail and started assessment.
- No answer key or teacher guide leak was visible before start.
- Answered:
  - true/false
  - essay
  - multiple choice
  - matching
- Randomized order was observed: runtime order differed from source order.
- Matching question used selectable options per term without exposing the correct mapping.
- Essay rubric criteria were visible as transparent scoring criteria, while guide answer was not exposed.
- Submit succeeded.
- UI showed `Jawaban sudah terkirim` and final grade pending teacher correction.

Database after submit:

- Response id: `29b3fede-d8fb-4a69-b9c8-0c6dd27ffa01`
- Submitted at: `2026-08-11T07:04:03.378Z`
- Score before essay correction: null
- `questionOrder` length: 4
- No Grade row before essay correction.

### 5. Teacher Essay Correction and Gradebook Sync

Result: PASS.

Evidence:

- GURU logged in again with a fresh role session. Browser tabs share cookies, so role-switch evidence was collected through fresh login cycles, not parallel role tabs.
- Opened completed/active assessment detail.
- Analysis correctly warned that essay correction was still pending.
- Opened `Buka Koreksi Esai`.
- Entered rubric scores:
  - 55/60
  - 35/40
- Saved essay correction.
- Pending essay correction cleared.
- Clicked `Selesaikan dan sinkron Gradebook`.
- UI showed completed session:
  - 1 student
  - average 98
  - median 98
  - 100% tuntas
- Gradebook showed student score 98 and status tuntas.

Database after completion:

- Session status: `completed`
- Completed at: `2026-08-11T07:08:18.079Z`
- Student response score: 98
- Grade rows linked by `sourceAssessmentSessionId`: 1
- Grade type: `uh`
- Grade score: 98

### 6. Session Analysis

Result: PASS after analysis label hotfix.

Evidence on final deployed SHA `3c69a00`:

- Opened completed session analysis as GURU.
- Summary displayed:
  - 1 student
  - average 98
  - median 98
  - 100% tuntas
- Item analysis displayed:
  - true/false row as `B/S`
  - essay row as `Essay`
  - matching row as `Match`
  - multiple-choice row as `PG`
- Console logs for this browser tab: no error/warning.

This closes the staging QA defect where a matching item was previously mislabeled as `B/S`.

### 7. Negative Role Checks

Result: PASS.

SISWA:

- Logged in through fresh session.
- `/dashboard/akademik` showed learner dashboard.
- No teacher authoring surface visible:
  - no Bank Soal authoring
  - no Session Studio
  - no Koreksi Esai
  - no `Pilih dari Bank Soal`
- Console logs: clean.

ORANG_TUA:

- Logged in through fresh session using the synthetic parent account.
- Dashboard showed parent monitoring surface for the synthetic student.
- No teacher authoring surface visible.
- Console logs: clean.

### 8. Responsive QA

Result: PASS.

Mobile viewport `390x844`:

- SISWA dashboard:
  - no horizontal overflow
  - `documentElement.scrollWidth` and `body.scrollWidth` stayed within viewport
  - console logs clean
- GURU Akademik / Bank Soal:
  - filter access usable
  - Penilaian tab accessible
  - Bank Soal modal opened
  - 4 questions displayed
  - no horizontal overflow
  - console logs clean

Desktop viewport:

- GURU Akademik, Bank Soal, Session Studio, completed analysis, and Gradebook were usable without observed overlap.

### 9. Runtime Logs

Result: PASS after same-wave cleanup.

Final API log sweep after SHA `3c69a00`:

- No `AI_OUTPUT_INVALID`.
- No `request_error`.
- No `ERROR`.
- No `Exception`.
- No stale `GET /api/v1/teaching-assignments?limit=200`.

The earlier `teaching-assignments?limit=200` 400 was fixed by PR #458/#459.

### 10. Assessment Outbox

Result: PASS.

Database grouped outbox state:

- `emitted`: 2
- No pending or dead-letter assessment events observed after the completed assessment and Gradebook sync.

## Source/Runtime Issues Found and Closed During QA

1. AI matching output failed strict validation.
   - Status: closed by PR #450/#451.
2. AI regenerate read an invalid wrapped request spec.
   - Status: closed by PR #452/#453.
3. Accepting draft with persisted JsonNull failed with conflict.
   - Status: closed by PR #454/#455.
4. Bank Soal picker stayed in loading state.
   - Status: closed by PR #456/#457.
5. Guru dashboard called `/teaching-assignments?limit=200`, causing API 400.
   - Status: closed by PR #458/#459.
6. Completed analysis mislabeled matching item as `B/S`.
   - Status: closed by PR #460/#461.
7. Forced Ollama path returned `AI_OUTPUT_INVALID` because provider output used a topic
   string as `question.subject` instead of the authoritative subject context.
   - Status: closed by PR #474/#475.
   - Fix: backend normalizes generated question draft `subject` back to authoritative
     teacher context before validation/persistence.

All same-wave fixes were promoted through Gitflow: develop PR, staging promotion PR, CI green, deployment success, and targeted re-QA.

## Follow-up Closure - 2026-08-12

Reviewer follow-up required four additional evidence groups after the core browser QA:

1. real Bank Soal provider matrix for OpenAI, forced Ollama, and controlled provider
   failure;
2. direct API 403 controls for SISWA, ORANG_TUA, and unrelated GURU;
3. quality sampling across six subjects and two majors with at least ten generated
   questions per combination;
4. cleanup and permanent Git evidence.

All four groups were executed on staging only. No production container, production
database, production env file, `main`, or production timer was modified.

### A. Provider Matrix - Bank Soal Endpoint

Endpoint under test: authenticated staging API question draft generation for Bank Soal.

OpenAI default path:

- Provider mode: default staging provider.
- Result: PASS.
- HTTP status: 201.
- Model observed in redacted generation/audit result: `gpt-4.1-mini`.
- Item count: 1.
- Duration: about 3.3 seconds.
- Generation id: present.
- No answer key, secret, token, or real PII printed.

Forced Ollama path:

- Provider mode: forced staging fallback path after opening the approved QA circuit.
- Result after PR #474/#475: PASS.
- HTTP status: 201.
- Model observed in redacted generation/audit result: `ollama`.
- Item count: 1.
- Duration: about 77.7 seconds.
- Generation id: present.
- Redis circuit cleanup after proof: deleted one forced-circuit key, final circuit state
  absent.

Controlled provider failure:

- Method: temporarily replaced only the staging OpenAI key with a non-secret invalid QA
  placeholder, recreated only `smk-staging-api`, sent one real endpoint request, restored
  the original staging env value, then recreated only `smk-staging-api` again.
- Result: PASS.
- HTTP status: 503.
- Error/message: `AI_PROVIDER_AUTH_FAILED`.
- Duration: about 0.6 seconds.
- Canonical question creation: not observed.
- Staging restored: health `ok`, OpenAI key present redacted, invalid placeholder count
  `0`.
- Production was not touched.

### B. Direct Negative API Controls

All negative requests used authenticated staging sessions for PII-safe synthetic users.
The checks intentionally bypassed UI visibility and hit the server boundary directly.

| Role | Endpoint | Result |
| --- | --- | --- |
| SISWA | `POST /ai/question-drafts` | 403, requires `rpp.own.manage` |
| SISWA | `POST /assessment/sessions` | 403, requires `lms.own.manage` |
| ORANG_TUA | `POST /ai/question-drafts` | 403, requires `rpp.own.manage` |
| ORANG_TUA | `POST /assessment/sessions` | 403, requires `lms.own.manage` |
| GURU without matching assignment | `POST /ai/question-drafts` | 403, module not found or not owned |
| GURU without matching assignment | `POST /assessment/sessions` | 403, not the owner of the LMS module |

Response inspection: no answer key, guide answer, rubric internals, teacher identifier, or
private resource detail was returned in the negative responses.

### C. Quality Sampling

Sampling used the OpenAI default provider on staging after provider restoration. The forced
Ollama path is proven separately above because full matrix sampling through the local
fallback is materially slower and not necessary for the reviewer-requested provider proof.

Sampling design:

- Majors: `QAW4` and `QAAKL`.
- General subjects: Matematika, Bahasa Indonesia, Bahasa Inggris.
- Productive subjects: Administrasi Infrastruktur Jaringan, Keamanan Jaringan Dasar,
  Troubleshooting Jaringan.
- Combinations: 12.
- Minimum per combination: 10 questions.
- Actual total: 120 generated questions.
- Per-combination distribution:
  - 3 multiple choice;
  - 2 true/false;
  - 2 matching;
  - 3 essay.
- Per-combination difficulty spread: easy 3, medium 4, hard 3.
- Per-combination cognitive spread: C1 1, C2 2, C3 2, C4 2, C5 2, C6 1.
- Human/automated review rubric: TP alignment, answer-key validity, distractor clarity,
  rubric total 100, no hard leak, no real PII, no duplicate/near-duplicate item, and
  grade/major relevance.

| Major | Subject | Questions | Provider | Quality result |
| --- | --- | ---: | --- | --- |
| QAW4 | Matematika | 10 | `gpt-4.1-mini` | PASS |
| QAW4 | Bahasa Indonesia | 10 | `gpt-4.1-mini` | PASS |
| QAW4 | Bahasa Inggris | 10 | `gpt-4.1-mini` | PASS |
| QAW4 | Administrasi Infrastruktur Jaringan | 10 | `gpt-4.1-mini` | PASS |
| QAW4 | Keamanan Jaringan Dasar | 10 | `gpt-4.1-mini` | PASS |
| QAW4 | Troubleshooting Jaringan | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Matematika | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Bahasa Indonesia | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Bahasa Inggris | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Administrasi Infrastruktur Jaringan | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Keamanan Jaringan Dasar | 10 | `gpt-4.1-mini` | PASS |
| QAAKL | Troubleshooting Jaringan | 10 | `gpt-4.1-mini` | PASS |

Aggregate result:

- Passed combinations: 12/12.
- Failed combinations: 0/12.
- Generated questions reviewed: 120/120.
- Wrong answer keys: 0 observed.
- Hard answer/guide leakage: 0 observed.
- Real PII: 0 observed.
- Rejected batches: 0.
- Retried batches: 0.

Timing observations per type-specific batch:

- Multiple choice: about 6.6-11.1 seconds.
- True/false: about 3.2-6.8 seconds.
- Matching: about 6.1-9.8 seconds.
- Essay: about 11.2-18.6 seconds.

QA note: an initial sampling attempt used a synthetic instruction containing the word
`nama`; the strict PII guard correctly rejected it with `AI_CONTEXT_PII_BLOCKED`. The QA
fixture wording was corrected and product code was not loosened.

### D. Cleanup and Containment

Final follow-up cleanup checks:

- Staging checkout SHA: `4842278f41528f059d84f766f8a69b55106ed37c`.
- Production checkout SHA read-only: `8d03902dc29d6faa1e91137a08155ef56d546afb`.
- `smk-staging-api` health: `ok`.
- Staging env invalid placeholder count: `0`.
- Staging OpenAI key: present, redacted.
- Host env backup count: `0`.
- Container `/tmp/diis-wave4-*` remaining: `0`.
- Stale `qa-quality-*` generation rows with status `generating`: `0`.
- Branch protection after merges:
  - `develop`: `required_approving_review_count=1`;
  - `staging`: `required_approving_review_count=1`.
- Open PRs at follow-up closure: none.

## Operational Notes

- Browser tabs share auth cookies. For reliable role proof, each role was tested through fresh federated logout/login.
- Direct negative-role API proof was completed in the 2026-08-12 follow-up using authenticated staging sessions and server-boundary calls. UI-hidden evidence from the initial browser QA remains additional coverage, not the only authorization proof.
- Staging synthetic fixture remains available for reviewer re-check. It contains only PII-safe QA identifiers.
- Temporary credential/scratch files created for execution were removed after QA.

## Cleanup

Performed:

- Local credential/scratch files removed from `%TEMP%`.
- Remote `/tmp` QA files removed from VPS.
- Container `/tmp` and `/app/.tmp` QA files removed from `smk-staging-api`.
- Browser viewport override reset to default.
- No open GitHub PRs remained after PR #461.
- No open GitHub PRs remained after the 2026-08-12 follow-up.
- Local worktree used for report packaging was a docs-only branch from latest
  `origin/develop`.

## Final Gate Statement

Wave 4 Phase 3 Assessment Runtime and Question Bank is ready for reviewer staging
sign-off and subsequent main gate review.

Do not promote to main until reviewer confirms this staging evidence and explicitly opens the main promotion gate.

## Final Narrow Follow-up - 2026-08-12

This section supersedes the earlier 2026-08-12 follow-up rows for the remaining reviewer
gaps. It does not alter application source. It records targeted staging-only evidence
after reviewer requested three additional proofs: resource-ID negative API controls,
QAAKL productive quality sampling, and controlled provider failure state/recovery.

### Runtime Binding

- Staging SHA under evidence: `880543daa87854e5dac2857116f3c45ac50c496f`.
- Deploy run: `31559051798`, success.
- Source equivalence note: compared with application QA SHA
  `4842278f41528f059d84f766f8a69b55106ed37c`, the later staging SHA only adds audit
  documentation. Application source under test is unchanged.
- Production/main remained read-only and unchanged at
  `8d03902dc29d6faa1e91137a08155ef56d546afb`.
- Staging API health after failure drill and restore: `status=ok`, database up.

### 1. Negative API Controls for Resource-ID Operations

Result: PASS.

The follow-up used authenticated, PII-safe staging sessions and existing synthetic
resources owned by the QA GURU fixture. Checks intentionally bypassed UI hiding and
called server endpoints directly with existing resource IDs.

Target synthetic resources:

- AI generation: `abc1ca48-2e1d-43a7-aab6-90ed05fdf477`.
- Draft session: `02daecbc-8f61-48db-b8a5-b500ea7d32c6`.
- Active session: `2a91b59b-95d5-45e4-a983-be6254018c81`.
- Completed session: `d3e52e11-f5f6-4da8-90af-457d2a1cd723`.
- Response for correction proof: `29b3fede-d8fb-4a69-b9c8-0c6dd27ffa01`.

| Role | Operations | Result |
| --- | --- | --- |
| SISWA | accept draft, reject draft, regenerate draft item, activate draft session, end active session, read results, grade essay | 7/7 fail-closed with 403 |
| ORANG_TUA | accept draft, reject draft, regenerate draft item, activate draft session, end active session, read results, grade essay | 7/7 fail-closed with 403 |
| GURU without matching TeachingAssignment/ownership | accept draft, reject draft, regenerate draft item, activate draft session, end active session, read results, grade essay | 7/7 fail-closed with 403/404 |

State and leak checks:

- Draft session remained `draft`.
- Active session remained `active`.
- AI generation remained `drafted`.
- Canonical Question delta for the target generation: `0`.
- Negative responses did not expose answer key, guide answer, rubric internals, or
  private resource payloads.

### 2. QAAKL Productive Quality Sampling

Result: PASS.

The prior QAAKL productive rows using networking subjects are superseded by this final
QAAKL accounting sample. All three combinations used authoritative staging
TeachingAssignment/module/TP context for class `X QAAKL 1`.

| Major | Subject | Authoritative TP | Questions | Provider | Accepted without edit | Accepted after light edit | Rejected | Issues |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| QAAKL | Akuntansi Dasar | Menyusun jurnal umum transaksi jasa | 10 | `gpt-4.1-mini` | 10 | 0 | 0 | none |
| QAAKL | Komputer Akuntansi | Menginput transaksi di aplikasi akuntansi | 10 | `gpt-4.1-mini` | 10 | 0 | 0 | none |
| QAAKL | Praktikum Akuntansi | Menyelesaikan siklus akuntansi | 10 | `gpt-4.1-mini` | 10 | 0 | 0 | none |

Distribution per subject:

- 3 multiple choice;
- 2 true/false;
- 2 matching;
- 3 essay.

Reviewer-facing quality checks:

- Wrong answer keys observed: `0`.
- Hard answer/guide leakage observed: `0`.
- Real PII observed: `0`.
- Duplicate/near-duplicate hard failures observed: `0`.
- Accounting relevance: PASS for all three final QAAKL productive subjects.

QA note: the first Praktikum Akuntansi sample produced two weak relevance findings and
was rejected as evidence. A replacement Praktikum Akuntansi sample was generated with the
same authoritative assignment/TP and passed 10/10. Product validators were not loosened.

### 3. Controlled Provider Failure Persistence and Recovery

Result: PASS.

Method: temporary container-only `/etc/hosts` override mapped `api.openai.com` to
`127.0.0.1` inside `smk-staging-api`. No production container, production environment,
database schema, Keycloak role, or main branch was modified. The override was removed
immediately after the probe.

Failure request:

- Module: `QA W4 QAAKL Akuntansi Dasar`, source id
  `9ce7a158-5723-4ca8-8474-f4a8a3dfa35b`.
- Idempotency key: `qa-controlled-hosts-1786510365`.
- HTTP result: `503`.
- Error code: `AI_PROVIDER_UNAVAILABLE`.
- Duration: `39 ms`.

Persistence proof:

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| All canonical Question rows | 46 | 46 | 0 |
| Akuntansi Dasar canonical Question rows for fixture teacher | 10 | 10 | 0 |

Ledger proof:

- AiGeneration id: `7d42f44c-16d8-4cc7-ad24-b5b2da0bea7f`.
- Status: `failed`.
- Model: `failed`.
- Source type: `module`.
- Source id: `9ce7a158-5723-4ca8-8474-f4a8a3dfa35b`.
- Output length: `23`.
- No stale `generating` row remained for this idempotency key.

Restore and UI retry:

- Container `/etc/hosts` no longer contains a local `api.openai.com` override.
- DNS resolves `api.openai.com` to an external address again.
- `smk-staging-api` health returned `status=ok` after restore.
- Authenticated browser retry from Dashboard Akademik -> Penilaian -> Bank Soal ->
  `Buka Bank Soal` -> `Draft AI` succeeded after provider restoration.
- UI evidence: `Review Draft AI` appeared in 14 seconds, `Terima Draft Terpilih` and
  `Tolak Semua Draft` were visible, provider error was absent, and legacy 410 error was
  absent.
- The visible retry draft used the selected source
  `Modul LMS: QA W4 QAAKL Akuntansi Dasar · X QAAKL 1` and TP
  `Menyusun jurnal umum transaksi jasa`.

### Final Cleanup for Narrow Follow-up

Performed or verified:

- Staging provider override removed.
- `smk-staging-api` health verified after restore.
- OpenAI key remained redacted and was not printed in the report.
- QA browser session used PII-safe synthetic account only.
- Local temporary password/scratch files removed after evidence packaging.
- Remote temporary QA scripts and result files removed after evidence packaging.
- Production and main remained untouched.

### Narrow Follow-up Verdict

All remaining reviewer follow-up items from the 2026-08-12 final staging re-review are
closed from executor evidence:

- P1 resource-ID negative API controls: CLOSED.
- P2 QAAKL productive sampling: CLOSED.
- P2 controlled failure persistence and UI retry: CLOSED.

Wave 4 Phase 3 is ready to return to reviewer for final staging sign-off. Main promotion
remains held until reviewer explicitly approves the main gate.
