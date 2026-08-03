# AI-0A + Wave 3 Staging Browser QA Report

Tanggal: 2026-07-31

Scope:

- AI-0A Modul Ajar containment runtime check on staging.
- Wave 3 browser QA for Modul Ajar, WAKA review, LMS publish, and SISWA consumption.
- Provider decision validation for OpenAI `gpt-4.1-mini`.

Related plan:

- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-PLAN-2026-07-31.md`

## Verdict

Status: **FOLLOW-UP REQUIRED BEFORE AI PRODUCTION SIGN-OFF**.

Functional Wave 3 flow is broadly working on staging:

- GURU can create and persist structured Modul Ajar.
- AI generation calls OpenAI `gpt-4.1-mini` and writes generated content into the saved RPP body.
- Draft close/reopen preserves manual and generated fields.
- WAKA with active appointment can review and approve the submitted RPP.
- Approved RPP creates/links an LMS module.
- GURU can publish LMS.
- SISWA in the class can see the published module and mark progress completed.
- Negative roles did not expose the QA RPP/review path.

However, AI curriculum/content quality is not ready for production sign-off:

- Generated sections contain raw fenced markdown blocks inside form fields.
- Generated assessment uses stale vocabulary such as "Kompetensi Dasar" instead of staying within the Modul Ajar/Kurikulum Merdeka CP/TP framing.
- Output repeats metadata and produces broad full-document text inside narrow section fields.

Recommendation: hold final AI production sign-off/main promotion until a targeted prompt/output-normalization fix is reviewed and re-QAed. Provider choice remains accepted: OpenAI `gpt-4.1-mini`.

## Runtime Evidence

Staging deployment:

- Branch on VPS: `staging`
- Deployed source SHA: `7902126691247dcd0e9e41db397c43f9baea17e8`
- Containers:
  - `smk-staging-api`: running, healthy
  - `smk-staging-web`: running
- Public health: `200 OK`

Effective staging AI env, redacted:

- `AI_PROVIDER=openai`
- `OPENAI_CHAT_MODEL=gpt-4.1-mini`
- `OLLAMA_EMBED_MODEL=nomic-embed-text`
- `OPENAI_API_KEY`: present, value not printed

OpenAI smoke from inside `smk-staging-api`:

- HTTP status: `200`
- Model: `gpt-4.1-mini`
- Marker matched: `true`
- Elapsed: `815 ms`
- Secret value: not printed

Log hygiene, last 90 minutes during QA:

- API log lines inspected: `1171`
- `DIIS_QA`: `0`
- `OPENAI_API_KEY`: `0`
- `sk-`: `0`
- error/exception/failed/5xx keywords: `0`

Main promotion state:

- PR `#418` is open: `promote(main): OpenAI provider default`
- Head SHA: `29e7782fe15413554aaedcac28a0f4d2b090d14f`
- CI: Build, Lint & Type Check, Unit Tests all green
- Merge state: `BLOCKED` by review requirement
- No merge to `main` was performed in this QA pass.

## Fixture And Containment

QA used synthetic staging-only accounts and data:

- GURU owner with active TeachingAssignment.
- WAKA active appointment holder.
- SISWA in the same class.
- GURU non-owner and non-teacher negative roles.

The fixture title used for database evidence:

- `QA AI0A - Merancang Jaringan LAN Sederhana`

Temporary local and remote QA scripts/credential files were removed after evidence collection. No secrets or raw passwords are included in this report.

## Browser QA Results

### GURU Modul Ajar

Result: **PASS WITH AI QUALITY FINDING**.

Observed:

- `/dashboard/akademik` opened as GURU owner.
- Class and subject from active TeachingAssignment were available: `X TKJ 2`, `Produktif`.
- Legacy AI buttons were absent from the interactive UI:
  - `Generate Semua`
  - `Generate Materi AI`
  - `Generate Soal AI`
  - `Generate AI Bank Soal`
- Created Modul Ajar with synthetic non-PII content.
- Save draft completed and showed persisted state.
- AI generation was run for:
  - ATP
  - Kegiatan
  - Asesmen
- Generated data survived close/reopen and page reload.
- Submit changed the RPP state to submitted for review.

Timing observed:

| Action | Result | Duration |
| --- | --- | --- |
| OpenAI synthetic smoke | PASS | 815 ms |
| Save draft | PASS | 1437 ms |
| Generate ATP | PASS | completed before approx. 7 s, exact read hit browser tooling timeout |
| Generate Kegiatan | PASS | 6900 ms |
| Generate Asesmen | PASS | 9188 ms |
| Save AI result | PASS | 889 ms |

Mass usage note:

- Single-teacher latency is acceptable for an interactive "assist me" workflow.
- No load/concurrency test was run, so this is not a mass-usage capacity sign-off.
- Before broad live use by many teachers, add/verify provider quota monitoring, timeout handling, per-user throttling, and clear UI copy for slow generation.

### Draft Persistence

Result: **PASS**.

Evidence:

- RPP count for the synthetic title: `1`
- Status: `approved` after review
- Duplicate risk: `none-observed`
- Body persisted:
  - CP present
  - TP count: `2`
  - ATP count: `2`
  - Kegiatan count: `1`
  - Diagnostik/Formative/Sumatif fields present

### WAKA Review

Result: **PASS**.

Observed:

- Active WAKA appointment account saw reviewer navigation.
- Submitted QA RPP appeared on `/dashboard/rpp`.
- Review dialog identified WAKA delegated review path.
- Approval action succeeded.
- GURU owner later saw the RPP as `Disetujui`.

### LMS

Result: **PASS WITH P2 UI STALENESS**.

Observed:

- Approved RPP created/linked one LMS module.
- LMS module initially appeared as `Draft`.
- GURU published the LMS module.
- Immediate row state remained stale until page reload.
- After reload, LMS status showed `Terbit`.

Database evidence:

- LMS module count linked to QA RPP: `1`
- LMS status counts: `published: 1`
- JP allocation: `6`
- KKTP: `75`
- SISWA progress rows: `1`
- Completed progress count: `1`

Finding:

- P2: publish/unpublish action should refresh local UI state immediately after success, instead of requiring manual reload.

### SISWA

Result: **PASS**.

Observed in browser QA:

- SISWA dashboard loaded after login.
- Published module appeared in student learning/module view.
- Student could mark module completed.
- Progress state changed to completed.

Database evidence:

- LMS progress status counts: `completed: 1`
- Completed progress count: `1`

### Negative Roles

Result: **PASS**.

Checked roles:

- GURU non-owner
- TATA_USAHA
- ORANG_TUA
- INDUSTRI

Observed:

- Negative roles did not see the QA RPP.
- Negative roles did not see review actions.
- Route behavior redirected to allowed dashboard surfaces rather than exposing protected RPP state.

## AI Audit Evidence

Redacted DB evidence for the QA title:

| Area | Evidence |
| --- | --- |
| RPP count | `1` |
| RPP status | `approved` |
| LMS count | `1` |
| LMS status | `published` |
| AI audit rows | `3` |
| AI audit types | `rpp-atp: 1`, `rpp-kegiatan: 1`, `rpp-asesmen: 1` |
| AI model | `gpt-4.1-mini` |
| Estimated audit tokens | `1972` |

The audit output was redacted and did not expose secrets or raw credentials.

## AI Quality Rubric

### ATP

Rating: **GOOD**.

Excerpt:

> TP 1: Menganalisis kebutuhan perangkat jaringan untuk LAN kecil berdasarkan skenario pengguna. TP 2: Membuat rancangan topologi LAN sederhana lengkap dengan alasan pemilihan perangkat.

Assessment:

- Context matches subject, class, and TP.
- Output fits ATP/indicator fields.
- No obvious PII or unsupported claim.

### Kegiatan

Rating: **ACCEPTABLE WITH EDIT**.

Observed issue:

- Output inserted a fenced markdown block and repeated full module metadata inside the Kegiatan field.

Excerpt:

> `# Modul Ajar Kurikulum Merdeka ... Kegiatan Pembelajaran Pertemuan 1 ...`

Assessment:

- Pedagogical direction is usable.
- Field fit is weak: a section field should receive clean kegiatan content, not a full document block.
- Needs output normalization or stricter prompt instruction.

### Asesmen

Rating: **REJECT FOR PRODUCTION QUALITY, EDITABLE IN STAGING**.

Observed issues:

- Output inserted fenced markdown into the field.
- Output used stale "Kompetensi Dasar" vocabulary.
- Output mixed diagnostic/formative/summative text with a broad full-document assessment plan.

Excerpt:

> `# Rencana Asesmen ... Kompetensi Dasar Terkait ...`

Assessment:

- Technically generated and persisted.
- Not acceptable as-is for final teacher-facing production quality.
- Needs prompt contract and/or parser normalization so each target field gets clean, section-shaped output aligned to CP/TP.

## Browser Console

Observed during the longer QA session:

- Two historical React production errors `#310` were captured by tab dev logs at `2026-07-31T03:04:47Z` and `2026-07-31T03:08:43Z`.
- Stack pointed to React/Next App Router chunks.
- Fresh GURU dashboard load and GURU wizard open/close repro did not produce new errors.
- No API errors or 5xx were found in staging API logs during the QA window.

Classification:

- P2 residual until reproducible source path is isolated.
- Not a hard stop because the happy path remained usable and fresh repro on the key GURU wizard path did not recur.

Recommended follow-up:

- Run a dedicated browser/dev build repro for role-switch + mobile viewport + wizard navigation.
- If reproduced, map to source using non-minified build/source maps and fix hook-order mismatch before final UI sign-off.

## Findings

### P1 - AI Output Quality Not Production-Ready

Impact:

- Teachers receive generated content that is technically saved but not cleanly shaped for the target fields.
- "Kompetensi Dasar" vocabulary can conflict with the CP/TP framing expected in Kurikulum Merdeka Modul Ajar.
- Raw markdown fences reduce polish and trust.

Recommended fix:

- Tighten AI section prompts to return field-native content only.
- Strip fenced markdown wrappers before applying patch.
- Add section-specific validators:
  - ATP must be an array of TP refs and indicators.
  - Kegiatan must map to `pendahuluan`, `inti`, `penutup`, and optional `diferensiasi`.
  - Asesmen must map to diagnostic/formative/summative fields without KD vocabulary.
- Add focused tests for output normalization.
- Re-run staging browser QA on ATP/Kegiatan/Asesmen after fix.

### P2 - LMS Publish UI Stale Until Reload

Impact:

- Publish succeeds, but row still shows `Draft` until reload.

Recommended fix:

- Refresh server data or update local module state after successful publish/unpublish/archive.
- Re-QA publish/unpublish on staging.

### P2 - Historical React #310 Console Error Needs Dedicated Repro

Impact:

- Could indicate hook-order mismatch, but not reproduced on fresh GURU load/wizard path.

Recommended fix:

- Dedicated debug session on staging or dev build with role-switch/mobile/wizard route changes.
- Treat as P1 only if it becomes reproducible or breaks rendering/interactions.

### P2 - Missing-TP Browser Guard Evidence Partial

Impact:

- Source/review contract says missing TP should stop before provider.
- Browser locator testing was noisy because the wizard renders multiple hidden section controls.
- No extra AI audit rows were observed beyond the three intentional generation calls.

Recommended fix:

- Add component/integration test for the visible ATP CTA with no TP.
- Add browser test id on active section AI CTA to make QA unambiguous.

## Not Fully Covered

The following were not full sign-offs in this pass:

- PII-to-local route browser proof: not executed with PII input; containment remains source/review based.
- Load/concurrency: no multi-teacher load test.
- Full network payload capture: browser connector did not expose a clean HAR workflow in this pass; request boundary relies on AI-0A code review plus observed DB/audit behavior.
- Production/main deployment: PR `#418` is still open and blocked by review requirement.

## Cleanup

Cleaned:

- Remote `/tmp/qa-ai0a-wave3-evidence-redacted.js`
- Remote QA fixture helper scripts from `/tmp` and `/app`
- Remote temporary QA credential JSON
- Local temporary QA scripts under `.tmp`
- Local temporary QA credential JSON under `%TEMP%`

Remaining local files intentionally not staged:

- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-PLAN-2026-07-31.md`
- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-REPORT-2026-07-31.md`

## Recommendation

Best next step:

1. Do not treat AI as production-quality signed off yet.
2. Create a narrow AI quality follow-up:
   - prompt/output normalization for Kegiatan and Asesmen;
   - remove code fences before patching fields;
   - forbid KD vocabulary in Kurikulum Merdeka output;
   - add tests and re-QA staging.
3. Fix LMS publish stale row in the same small PR if low risk.
4. Keep PR `#418` to `main` on hold unless Director explicitly accepts the AI quality residual as a known risk.
5. After targeted fixes pass, rerun only the affected browser QA paths plus one SISWA progress smoke.

Confidence:

- Runtime provider and integration evidence: `0.96`
- Wave 3 functional browser flow: `0.90`
- AI content-quality readiness: `0.62`
- Production/main readiness for AI: `0.55`
