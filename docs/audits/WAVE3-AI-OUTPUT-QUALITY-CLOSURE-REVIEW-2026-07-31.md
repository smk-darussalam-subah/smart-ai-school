# Wave 3 AI Output Quality Closure - Independent Review

Date: 2026-07-31

Branch: `fix/wave3-ai-output-quality-20260731`

Verdict: **FOLLOW-UP REQUIRED IN WAVE 3**

Reviewer confidence:

- Source and automated verification: **0.95**
- Browser/runtime closure for this branch: **0.45**
- Overall verdict: **0.91**

This review did not edit product code or tests, stage, commit, push, deploy,
change provider configuration, or access live data.

## Findings

### P1 - Kegiatan validation does not enforce the promised structured first meeting

Evidence:

- `apps/api/src/ai/ai-generate.service.ts:102-110`
- `apps/api/src/ai/ai-generate.service.ts:123-125`
- `apps/api/src/ai/ai-generate.service.ts:465-466`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-ai-containment.ts:249-265`
- `apps/web/src/__tests__/modul-ajar-ai-containment.test.ts:121-124`

The provider prompt asks for `pertemuan`, `pendahuluan`, `inti`, `penutup`, and
optional `diferensiasi`, but the backend makes every field optional and accepts a
row when any one content field exists. The browser validator mirrors this
behavior, and its positive test explicitly accepts an `inti`-only row.

Consequently, output such as:

```json
{"kegiatan":[{"inti":"Diskusi kelompok."}]}
```

can be validated, audited as successful, and applied even though the closure
contract requires a structured first meeting. Prompt quality is therefore still
allowed to collapse into incomplete content.

Required follow-up:

1. Require `pertemuan`, `pendahuluan`, `inti`, and `penutup` for generated first
   meeting rows; keep `diferensiasi` optional only if that is the intended
   policy.
2. Apply the same exact contract in the backend and browser defense-in-depth
   parser.
3. Add positive full-shape and negative partial/missing-key tests.

### P1 - Legacy curriculum and full-document rejection has uncovered bypasses

Evidence:

- `apps/api/src/ai/ai-generate.service.ts:85-91`
- `apps/api/src/ai/ai-generate.service.ts:325-339`
- `apps/api/src/__tests__/ai-generate.spec.ts:226-233`

The recursive scan correctly rejects code fences and the phrase `Kompetensi
Dasar`, but it does not reject standalone `KD`, `KI dan KD`, or a generic
Markdown heading such as `## Kegiatan Pembelajaran`. A direct reviewer regex
probe returned `false` for all three examples.

The current test combines a fenced response with `Kompetensi Dasar`. It can pass
at the outer fence check without proving that nested forbidden curriculum
language is independently rejected. It also does not prove generic
full-document heading rejection.

Required follow-up:

1. Define a boundary-safe legacy vocabulary rule that rejects standalone `KD`
   and forms such as `KI/KD`, `KI-KD`, and `KI dan KD` without matching ordinary
   word fragments.
2. Reject Markdown headings in any returned field, or define and test the exact
   heading allowlist.
3. Split tests so each cause is isolated: outer fence, nested fence, generic
   heading, `Kompetensi Dasar`, standalone `KD`, and KI/KD variants.
4. Assert zero success audit for each invalid output.

### P2 - LMS busy/error lifecycle is not exception-safe and is not tested

Evidence:

- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx:131-138`
- `apps/web/src/app/dashboard/akademik/actions.ts:206-209`
- `apps/web/src/__tests__/lms-status-optimistic.test.ts:3-22`

`busyId` is cleared only after `await fn()` resolves. If a Server Action rejects
or throws, the callback exits before `setBusyId(null)`, leaving the row busy
until reload. There is no `try/catch/finally` around this LMS action.

The new tests verify only status mapping and pure object override. They do not
verify success, returned failure, thrown failure, busy release, or duplicate
request prevention, although these are explicit acceptance requirements.

Required follow-up:

1. Move busy release into `finally` and show a truthful error for a rejected
   action.
2. Keep the previous status on both returned and thrown failures.
3. Add behavior-level tests for success, failure, exception, busy release, and
   repeated clicks while busy.

### P2 - React #310 and branch browser evidence do not yet meet the reviewer gate

Evidence:

- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-REPORT-2026-07-31.md`, Browser
  Console section
- `docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REMEDIATION-2026-07-31.md:185-209`

The earlier staging run recorded two historical React `#310` errors. A fresh
GURU load and wizard open/close did not reproduce them, but the defined
role-switch, mobile viewport, wizard navigation, and fresh-console matrix was
not completed against this source branch. No local browser run was performed for
the changed branch.

Stable selectors and unit helpers are useful preparation, but they are not the
clean browser evidence required by Gate 7. This finding must remain in the same
Wave 3 delivery sequence; it must not be relabeled as a new wave.

Required follow-up:

1. After the source findings above are fixed, run a deterministic local browser
   fixture when practical, or deploy through the approved Gitflow and execute
   the complete staging matrix.
2. Capture fresh console timestamps for role switch, desktop/mobile, wizard
   navigation, missing foundation, generated sections, reopen persistence, and
   LMS status actions.
3. If `#310` reproduces, resolve its source before sign-off. If it does not,
   document every defined attempt and clean fresh-console result.

## Claim Matrix

| Claim | Review result |
| --- | --- |
| Browser request remains `{ rppId, section }` | Pass |
| Backend reloads saved RPP and checks owner | Pass |
| Active TeachingAssignment required | Pass |
| PII stays local-only with no cloud fallback | Pass at source/test level |
| Backend is the authoritative JSON parser | Pass |
| Strict top-level section keys | Pass except incomplete Kegiatan required fields |
| CP cannot be overwritten by AI | Pass |
| ATP cannot invent saved TP references | Pass |
| Missing CP/TP stops save/provider where required | Pass |
| Invalid output has no success audit | Pass for covered cases; negative matrix incomplete |
| Browser no longer parses Markdown heuristically | Pass |
| Patch preserves unrelated/manual Kegiatan rows | Pass |
| Current eight Dimensi Profil Lulusan | Pass |
| Historical profile remains readable | Pass at helper level |
| Reviewer rendering includes structured fields | Pass at source/static-render level |
| LMS immediate success status | Pass at helper/source level |
| LMS failure/busy/single-flight behavior | Fail |
| React #310 closure | Not proven |

The eight current dimensions match Permendikdasmen No. 10 Tahun 2025. The
regulation was promulgated on 13 June 2025 and is in force, so the project policy
to use the new framework from academic year 2025/2026 is reasonable. Historical
values are preserved rather than silently rewritten.

## Independent Commands

Focused API:

```text
4 suites passed
68 tests passed
```

Focused web:

```text
6 suites passed
44 tests passed
```

Additional checks:

```text
API type-check: pass
Web type-check: pass
API lint: pass
Web lint: pass with existing Next lint deprecation/plugin warnings
API build: pass
Web build: pass, 39/39 pages
git diff --check: pass
git diff --cached --check: pass
```

An initial parallel web build/type-check reviewer attempt produced transient
missing `.next/types` errors because both commands mutate/read the same generated
directory. The web build and type-check were rerun sequentially and both passed.
The production build retained the documented junction-only standalone trace
warning.

## Scope And Hard Boundaries

- Dedicated branch confirmed.
- `HEAD` is based on `origin/develop`.
- No staged changes.
- No schema, migration, dependency, provider/env, Docker, Keycloak,
  infrastructure, staging, production, or Git delivery mutation is present in
  the reviewed source diff.
- The worktree contains the declared source changes and untracked prompt/report
  artifacts. Future packaging must use the explicit reviewed file manifest.

## Residual External Risks

These are downstream gates, not reasons to weaken the same-wave source follow-up:

- stochastic provider content quality after strict validation;
- staging provider latency, timeout, quota, and concurrency behavior;
- PII local-gateway runtime availability;
- authenticated browser/network evidence after deployment;
- WAKA/KS/GURU/SISWA integrated staging flow;
- production/main promotion remains held.

## Recommendation

Return the four findings to the same Executor branch. Do not commit, push, or
open the delivery PR yet. After the narrow fixes:

1. rerun the exact API/web suites and all newly required negative tests;
2. rerun type-check, lint, builds, and diff checks;
3. request independent re-review;
4. only after source approval proceed to explicit Git packaging and the existing
   delivery/staging browser prompt.
