# Prompt Architect Delivery - Wave 3 AI Output Quality Closure

Tanggal: 2026-07-31

## Entry Contract

Gunakan hanya setelah independent Reviewer memberi:

`APPROVED FOR EXPLICIT GIT PACKAGING`

pada:

`docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REVIEW-2026-07-31.md`

Jika ada finding, perbaiki dan re-review pada branch Wave 3 yang sama. Jangan membuat
wave baru.

## Draft Prompt

```md
Commit perbaikan, promote ke staging, lalu coba generate lagi.
```

## Kritik Draft

Draft tidak mengunci file manifest, reviewed SHA, CI, deployment SHA, stochastic
quality sample, invalid-output fail-closed, PII local-only, concurrency, LMS immediate
state, role matrix, secret hygiene, atau hubungan dengan PR `#418`.

## Prompt Final untuk Delivery Executor

````md
Anda adalah Delivery Executor untuk DIIS **Wave 3 AI Output Quality Closure**.

Selesaikan explicit Git packaging, PR/CI, promotion ke staging, deploy verification,
targeted authenticated QA, dan evidence report. Jangan merge atau deploy ke production.

## Wajib Dibaca

1. workspace/repo `AGENTS.md`;
2. `docs/WAYS-OF-WORKING.md`;
3. Prompt Architect implementation/review pack;
4. staging QA plan/report sebelumnya;
5. Executor remediation report;
6. independent review report;
7. current source/diff/tests;
8. current PR `#418` state.

## Phase 0 - Reviewed State Integrity

```powershell
git fetch origin develop staging main
git branch --show-current
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor origin/develop HEAD
git diff --stat origin/develop...HEAD
git diff --name-status origin/develop...HEAD
git diff --cached --stat
```

Requirements:

- branch `fix/wave3-ai-output-quality-20260731`;
- HEAD/source equals reviewed state;
- no code change after Reviewer verdict;
- no staged files;
- no unrelated historical artifact;
- no schema/migration/dependency/env/provider/infrastructure change.

Jika source berubah setelah review, kembali ke Reviewer sebelum packaging.

## Phase 1 - Explicit File Manifest

Buat manifest dari:

- exact source/test/docs files in Executor report;
- QA plan/report sebelumnya;
- empat Prompt Architect pack files;
- remediation dan review reports.

Tampilkan manifest sebelum staging. Stage hanya explicit file paths:

```powershell
git add -- <exact-file-1> <exact-file-2> <exact-file-n>
```

Dilarang:

- `git add .`
- `git add -A`
- glob seluruh `apps`, `docs`, atau repo
- memasukkan `.tmp`, credential, PR body scratch, historical untracked files, test
  output dump, atau unrelated audits.

Audit staged package:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
```

Run secret markers against staged diff and files. Jangan mencetak value secret.

## Phase 2 - Commit dan PR ke Develop

Commit message:

`fix(ai): enforce structured Modul Ajar output quality`

Push feature branch. Create PR to `develop` with:

- problem/root cause;
- structured patch and curriculum contracts;
- profile compatibility;
- reviewer/LMS/browser closures;
- exact tests/builds;
- no schema/dependency/provider/env/infrastructure statement;
- staging QA plan;
- link remediation/review reports.

Wait all required CI:

- Lint & Type Check;
- Unit Tests;
- Build Check;
- other required branch checks.

Do not bypass branch protection, self-approve, force-push, or weaken tests.

CI failure:

- diagnose source;
- fix on same feature branch;
- rerun local affected/full gates;
- obtain re-review when behavior changes materially;
- push and wait CI again.

Merge to `develop` only after required approval and green CI. Record feature, PR, and
develop merge SHAs.

## Phase 3 - Promote Develop ke Staging

Fetch latest refs and verify:

- Wave 3 commit is ancestor of `origin/develop`;
- `origin/develop` contains current `origin/main`;
- no unexpected unrelated commit range.

Create promotion branch from latest `origin/staging`, merge latest `origin/develop`,
inspect conflicts and full range, then create PR to `staging`.

Suggested branch:

`promote/staging-wave3-ai-output-quality-20260731`

Run required CI and obtain required approval. Merge to `staging`. Never delete
`develop`, `staging`, or `main`.

Record staging merge SHA and deploy workflow URL.

## Phase 4 - Deploy Integrity

Wait staging deploy completion. Verify PII-minimal:

- deployed source SHA equals/contains staging merge SHA;
- `smk-staging-api` healthy;
- `smk-staging-web` running;
- public health `200`;
- effective `AI_PROVIDER=openai`;
- effective `OPENAI_CHAT_MODEL=gpt-4.1-mini`;
- local Ollama path remains available;
- no production source/runtime mutation.

Run one non-PII OpenAI marker smoke from the API container only if existing approved
runbook supports it. Print status/model/timing/marker match, never key or response body.

Mismatch = stop affected QA, fix through Gitflow/config owner, redeploy, then resume.

## Phase 5 - Targeted Quality Sample

Use only synthetic, non-PII staging data and authorized accounts.

Create three saved RPP drafts under valid active TeachingAssignment. They may share an
assignment but must use distinct topic/CP/TP contexts. Use titles prefixed:

`QA W3 AI QUALITY`

For each context:

1. generate Kegiatan once;
2. generate Asesmen once;
3. do not manually clean output before evaluation;
4. inspect network response shape and visible target fields;
5. save, close, reopen, and verify persistence.

Total primary quality sample: six calls.

Space calls so the existing throttle is not artificially exceeded. No automatic or
manual retry may replace a failed first-attempt result in the primary sample.

Structural acceptance for all six:

- response is exact structured patch;
- no raw markdown/code fence/JSON wrapper displayed;
- no `Kompetensi Dasar`, `KD`, or `KI-KD`;
- no full-document metadata;
- only target fields change;
- invalid response, if any, is rejected and never applied/audited as success.

Curriculum quality rubric:

- saved CP/TP alignment;
- field fit;
- actionable teacher/student activities;
- diagnostik/formatif/sumatif distinction;
- evidence/instrument/criteria clarity;
- no invented PII/facts;
- clear Indonesian;
- editable without restructuring the whole field.

Rating per call:

- `GOOD`
- `ACCEPTABLE WITH EDIT`
- `REJECT`

Production-quality threshold:

- six of six structurally safe;
- six of six valid on first attempt;
- no `REJECT`;
- at least four `GOOD`;
- remaining maximum two `ACCEPTABLE WITH EDIT`.

Failure returns to same Wave 3 branch. Do not relabel as residual and merge production.

## Phase 6 - Foundation, Profile, and Reviewer Matrix

Foundation:

1. controlled draft without CP -> CP/TP help stops before generate;
2. saved CP without TP -> ATP/Kegiatan/Asesmen CTA stops before generation;
3. verify zero generation network request and zero new AI audit row.

Profile:

1. current-year draft shows eight Dimensi Profil Lulusan;
2. save/reopen preserves selected current dimensions;
3. historical fixture retains old label/value without rewrite;
4. current AI profile output uses current terminology.

Reviewer:

1. submit one synthetic RPP;
2. WAKA opens review;
3. confirm all Kegiatan fields and three Asesmen fields are visible;
4. confirm no fake fallback;
5. approve;
6. GURU sees approved state.

## Phase 7 - PII Local-Only Proof

Use a clearly synthetic marker such as an `.invalid` email in an allowlisted saved
context. Do not use real names/contact data.

Generate one safe section and prove:

- cloud/OpenAI path is not used;
- local Ollama path is selected;
- marker is stripped/redacted before provider/audit/log persistence;
- result is applied only if structured validation succeeds;
- local invalid output fails closed with teacher-facing message;
- no fallback to cloud.

Use audit model/provenance, safe container logs, and request timing. Do not print raw
prompt/output or credentials.

## Phase 8 - Bounded Concurrency and Failure UX

After throttle window resets, run one bounded concurrency smoke:

- maximum three simultaneous single-section requests;
- three distinct saved synthetic RPPs;
- one run only;
- no retry;
- monitor 2xx/429/5xx and duration;
- no duplicate audit row per request;
- no cross-RPP output;
- API remains healthy.

This is a small operational smoke, not a claim of unlimited provider capacity.

Also verify controlled/mocked timeout, 429, and invalid-output UI:

- draft remains saved;
- clear teacher copy;
- controls recover;
- no false success;
- retry requires explicit user action.

If provider quota/account telemetry is accessible to the authorized operator, record
only limit/utilization categories. Lack of provider-console access is a genuine
external evidence limitation, not permission to skip application smoke.

## Phase 9 - LMS, SISWA, Negative Roles, Console

LMS:

- approved RPP links one LMS module;
- publish row changes to `Terbit` without manual reload;
- unpublish returns to `Draft` immediately;
- publish again and archive behavior are truthful;
- no duplicate LMS row.

SISWA:

- intended class sees published module;
- progress smoke succeeds;
- unrelated student/role cannot see it.

Negative roles:

- non-owner GURU cannot generate/edit/review;
- TATA_USAHA, ORANG_TUA, INDUSTRI cannot access protected RPP;
- WAKA review does not grant broad GURU mutation.

React `#310`:

- fresh desktop GURU flow;
- mobile `390x844`;
- step navigation;
- open/close three cycles;
- role/session switch if fixture permits;
- capture fresh console timestamps.

No new `#310`, unexplained 4xx/5xx, overlap, or inaccessible primary action.

## Phase 10 - Logs, Audit, Hygiene

Inspect the bounded QA window:

- API error/5xx/provider failures;
- secret markers;
- `OPENAI_API_KEY`;
- `sk-` patterns;
- synthetic PII marker;
- raw prompt/full RPP body;
- AI audit count/type/model;
- duplicate/cross-RPP rows.

Report counts only and redacted snippets. Clean temporary credentials/scripts locally
and remotely. Do not delete durable QA reports/evidence.

## Phase 11 - Same-Wave Fix Loop

Any source/config defect discovered by CI or staging QA:

1. reproduce and record redacted evidence;
2. fix on a Wave 3 branch;
3. PR to `develop`;
4. CI/review;
5. promote to `staging`;
6. verify deployed SHA;
7. rerun affected scenario and regression matrix.

Do not patch container files, run SQL, edit live source, bypass Gitflow, create
Wave 3.1, or defer an in-scope P0/P1/P2.

## Delivery Report

Buat:

`docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-DELIVERY-2026-07-31.md`

Isi:

1. Git manifest and commit/PR/merge SHAs;
2. CI/deploy URLs and conclusions;
3. deployed staging SHA/provider/model;
4. six-call quality table and redacted samples;
5. foundation/profile/reviewer results;
6. PII local-only proof;
7. concurrency/failure UX results;
8. LMS/SISWA/negative-role results;
9. console/log/audit/secret hygiene;
10. cleanup;
11. PR `#418` state;
12. genuine external limitations;
13. request final staging review.

## PR #418 Containment

Do not merge PR `#418` during this delivery. Its head predates Wave 3 quality closure.
Keep it open/blocked or mark it superseded only after final Reviewer decision.

After final staging approval, production promotion must use a fresh branch from current
`staging` so provider configuration and quality closure travel together. That future
merge still requires explicit production authorization.

## Final Answer

Laporkan:

- delivery verdict;
- PR/CI/deploy SHAs;
- six-call quality threshold result;
- PII/concurrency/LMS/role/console results;
- cleanup;
- PR `#418` status;
- link report;
- request final staging review.

Stop only when all phases are complete or a genuine external authorization/credential
blocker prevents the remaining phase after all independent work is finished.
````

## Confidence Level

0.96.

## Risk Notes

- Provider HTTP 200 bukan quality evidence.
- Manual cleaning invalidates the primary sample.
- Six samples are a release gate, not a claim of unlimited scale.
- PII proof must never use real student/teacher data.
- Old PR `#418` must not bypass the newer quality closure.
