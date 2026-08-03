# Wave 3 AI Output Quality Closure - Source Re-review

Date: 2026-07-31

Branch: `fix/wave3-ai-output-quality-20260731`

Verdict: **FOLLOW-UP REQUIRED IN WAVE 3**

Scope: independent source re-review of the two P1 and one P2 findings from
`WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REVIEW-2026-07-31.md`.

Reviewer confidence:

- Source review and automated verification: **0.96**
- Overall verdict: **0.94**

No product code or tests were edited by the reviewer. No stage, commit, push,
deploy, provider change, or live access was performed.

## Findings

### P2 - Forbidden-output tests still do not independently prove the declared matrix

Evidence:

- `apps/api/src/__tests__/ai-generate.spec.ts:226-264`
- `apps/api/src/ai/ai-generate.service.ts:85-94`
- `docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REMEDIATION-2026-07-31.md:28`

The source patterns now cover generic Markdown headings, `Kompetensi Dasar`,
`Kompetensi Inti`, standalone `KD`, `KI dan KD`, `KI/KD`, and `KI-KD`.
However, the tests independently cover only standalone `KD`, `KI dan KD`, and a
generic heading.

The remaining combined fence test is not sufficient evidence:

- it combines an outer code fence with `Kompetensi Dasar`;
- its Kegiatan object contains only `inti`, which is independently invalid under
  the new complete-Kegiatan schema;
- it therefore does not isolate which guard rejected the output.

There is no independent valid-shape negative test for:

- outer fence;
- nested fence inside a JSON field;
- `Kompetensi Dasar`;
- `Kompetensi Inti`;
- `KI/KD`;
- `KI-KD`.

Required narrow follow-up:

1. Use otherwise valid, complete Kegiatan payloads for every forbidden-pattern
   test.
2. Add one isolated case per pattern above.
3. Assert `AI_OUTPUT_INVALID`, zero success audit, and no returned patch for each
   case.

### P2 - Per-row action guard and single `busyId` produce incorrect concurrent UI state

Evidence:

- `apps/web/src/app/dashboard/akademik/_components/lms-status-optimistic.ts:19-35`
- `apps/web/src/app/dashboard/akademik/_components/lms-status-optimistic.ts:43-68`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx:68-72`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx:364-416`
- `apps/web/src/__tests__/lms-status-optimistic.test.ts:75-113`

The guard intentionally permits simultaneous actions on different module IDs,
but the component stores only one `busyId`.

Example:

1. module A starts and sets `busyId = A`;
2. module B starts and overwrites it with `busyId = B`;
3. A no longer appears busy while its request is still active;
4. when A finishes it sets `busyId = null`, so B also stops appearing busy even
   though B is still active.

The Set guard still prevents a duplicate network call for the same module, so
this is not a data-integrity failure. It is nevertheless misleading operational
state and leaves apparently enabled controls that silently ignore clicks.

Required narrow follow-up:

- either make the lifecycle globally single-flight and disable all affected
  controls while one action is active; or
- store a set/map of busy module IDs and clear only the completed ID.

Add a two-module overlapping-action test that resolves the promises in both
orders and proves each row remains busy until its own action completes.

## Closed Findings

### Previous P1 - Complete Kegiatan contract

**Closed.**

- Backend requires `pertemuan`, `pendahuluan`, `inti`, and `penutup`.
- `diferensiasi` remains optional.
- Browser parser mirrors the required fields.
- Partial Kegiatan negative tests pass.
- Generated rows still merge without deleting later manual meetings.

### Previous P1 - Legacy vocabulary and generic Markdown rejection

**Source implementation closed; test matrix P2 remains.**

The recursive source filter now covers the requested vocabulary and generic
Markdown heading lines. The remaining issue is isolated regression proof, not
the source matcher itself.

### Previous P2 - Failed/exception LMS cleanup and same-row deduplication

**Closed for same-row behavior.**

- Failed responses preserve status and release busy state.
- Thrown actions are caught, reported, and released through `finally`.
- Same-row double click invokes the Server Action once.
- Successful actions update the optimistic row status.

## Independent Verification

```text
API focused: 4 suites / 72 tests passed
Web focused: 6 suites / 48 tests passed
API type-check: pass
Web type-check: pass
API lint: pass
Web lint: pass with existing Next lint deprecation/plugin warnings
API build: pass
Web build: pass, 39/39 pages
git diff --check: pass
git diff --cached --check: pass
No staged changes
```

The documented worktree junction produced the same non-fatal standalone
trace-copy warning after a successful web build.

## Browser And React Gate

React `#310` is not source-signed-off by this re-review. Because this branch is
not deployed and has no deterministic authenticated browser fixture, the full
browser matrix remains an explicit post-packaging staging gate.

This does not require a new wave or a new Prompt Architect prompt. Once the two
P2 source findings above are closed and re-reviewed, source may proceed to
explicit Git packaging. The existing delivery and final staging prompts must
then prove:

- fresh-console React `#310` matrix;
- generated Kegiatan and Asesmen;
- close/reopen persistence;
- missing-foundation zero request;
- immediate LMS status and overlapping-action behavior;
- WAKA/KS rendering;
- desktop/mobile behavior.

## Recommendation

Return only the two P2 findings to the same Executor branch. Do not broaden the
scope and do not create Wave 3.1 or AI-0C.

After the narrow follow-up:

1. rerun the same focused suites plus the new isolated forbidden-output and
   overlapping-row tests;
2. rerun type-check, lint, builds, and diff checks;
3. request one final source re-review;
4. if green, proceed directly to explicit Git packaging and the existing
   delivery/staging browser sequence.
