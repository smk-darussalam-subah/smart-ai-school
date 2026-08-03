# Wave 3 AI Output Quality Closure Remediation

Date: 2026-07-31
Branch: `fix/wave3-ai-output-quality-20260731`
Base: `origin/develop` at `77fb7ef6875bce75cf15dba9c62017d78db6d1c1`
Status: local source remediation complete; not a Git, staging, production, or AI production sign-off.

## Scope

This follow-up closes the Wave 3 AI output-quality findings inside the same Wave 3 branch scope:

- AI section generation now returns validated structured JSON patches, not free markdown strings.
- Browser-side application now accepts backend patch shapes only; it no longer parses markdown heuristically.
- CP stays authoritative. AI can propose TP but cannot overwrite or return `cp`.
- `atp`, `kegiatan`, and `asesmen` require saved CP plus at least one saved TP before save/provider/audit.
- `cp_tp` requires saved CP before provider/audit.
- Code fences, full-document headings, `Kompetensi Dasar`, `KI/KD`, and extra/missing section keys fail closed as `AI_OUTPUT_INVALID`.
- Current-year authoring uses the eight Dimensi Profil Lulusan; historical Profil Pelajar Pancasila values remain readable.
- RPP/Modul Ajar review rendering now preserves structured kegiatan, asesmen, remedial, refleksi, and lampiran fields.
- LMS publish/unpublish/archive updates the visible row status immediately after successful server action.

## Reviewer Follow-up Closure

Follow-up after `WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REVIEW-2026-07-31.md`:

- Kegiatan output is now fail-closed unless each generated meeting row includes `pertemuan`, `pendahuluan`, `inti`, and `penutup`.
- Browser patch application mirrors the same complete Kegiatan contract and rejects partial rows instead of guessing missing subparts.
- Legacy curriculum filters now reject standalone `KD`, `KI dan KD`, `KI/KD`, `Kompetensi Dasar`, `Kompetensi Inti`, and generic Markdown heading lines independently from code-fence rejection.
- LMS publish/unpublish/archive now runs through a guarded lifecycle helper with `finally` cleanup for both failed responses and thrown Server Action exceptions.
- LMS double-click is covered by a same-module single-flight guard; the second click returns duplicate without invoking the Server Action again.
- Negative AI output tests now isolate outer code fence, nested code fence, `Kompetensi Dasar`, `Kompetensi Inti`, `KI/KD`, `KI-KD`, standalone `KD`, `KI dan KD`, and generic Markdown headings as independent invalid outputs.
- LMS row busy UI now tracks a set of active module IDs, so parallel actions on different modules keep both rows busy until each action finishes.
- React `#310` remains an explicit browser/staging matrix gate after deployment; no browser closure is claimed in this source-only follow-up.

## Policy Basis

Official curriculum references checked during remediation:

- CP is the competency reached at the end of each phase; Fase E maps to class X SMK and Fase F to class XI-XII/XIII SMK:
  https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513313951257-Pengertian-Capaian-Pembelajaran-CP
- TP is formulated from CP keywords, while ATP sequences TP systematically and logically toward CP:
  https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513306767897-Perumusan-Tujuan-Pembelajaran-TP-dan-Penyusunan-Alur-Tujuan-Pembelajaran-ATP
- Minimum RPP/perangkat ajar components include Tujuan Pembelajaran, Rencana Asesmen, and Langkah Pembelajaran:
  https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52478137936409-Komponen-Perangkat-Ajar
- The eight Dimensi Profil Lulusan used for 2025/2026+ authoring are:
  Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa, Kewargaan, Penalaran kritis, Kreativitas, Kolaborasi, Kemandirian, Kesehatan, and Komunikasi.

## Implementation Notes

### Backend AI Contract

`apps/api/src/ai/ai-generate.service.ts`

- Added section-specific Zod schemas for every supported RPP section.
- Replaced loose JSON extraction with exact JSON object parsing.
- Removed markdown/string passthrough for non-ATP sections.
- Validation happens before `aiGeneration.create`; invalid provider output leaves no success audit row.
- `cp_tp` output schema is exactly `{ "tp": [...] }`; any `cp` field is rejected.
- `atp` output schema is exactly `{ "atp": [{ "tpRef": "TP 1", "indikator": "..." }] }`.
- `kegiatan` output schema requires complete first-meeting structure: `pertemuan`, `pendahuluan`, `inti`, and `penutup`.
- ATP refs must match saved TP refs and cannot invent unsaved TP.
- Profile dimension schema switches by academic year.
- Prompt instructions now require one JSON object and forbid legacy KD/KI-KD language; output validation independently rejects the same terms plus Markdown headings.
- PII routing behavior is preserved. A false-positive prompt phrase was avoided so non-PII still reaches the configured OpenAI path, while real PII context still routes local-only.

### Browser Patch Application

`apps/web/src/app/dashboard/akademik/_components/modul-ajar-ai-containment.ts`

- Removed markdown parsing helpers (`parseCpTp`, markdown section splitting, dual-section guessing, raw array parsing).
- Added strict record/allowed-key validation per AI section.
- Partial Kegiatan rows are rejected unless the complete first-meeting structure is present.
- Existing manual kegiatan rows are preserved; generated rows merge onto matching indexes.
- Missing CP/TP foundations return `AI_FOUNDATION_INCOMPLETE` before `ensureSaved()` and before provider request.

### Profile Framework

`apps/web/src/app/dashboard/akademik/_components/modul-ajar-profile.ts`

- Added a small shared resolver for current Dimensi Profil Lulusan vs historical Profil Pelajar Pancasila.
- `ModulAjarForm` uses current-year options for authoring and keeps saved legacy values visible when editing old/current documents.
- `ModulAjarView` labels profile sections according to academic year.

### Rendering and LMS

- `apps/web/src/components/academic/ModulAjarView.tsx` now renders structured kegiatan, asesmen diagnostik/formatif/sumatif, remedial, refleksi guru/siswa, lampiran text, and lampiran URL.
- `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx` no longer shows fallback example profile/lampiran/pengayaan data as if it were saved data.
- `apps/web/src/app/dashboard/rpp/_components/RppBoard.tsx` passes `academicYear` into `ModulAjarView`.
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx` applies successful LMS status changes optimistically through `lms-status-optimistic.ts`.
- `lms-status-optimistic.ts` wraps Server Action responses with duplicate protection and `finally` cleanup so exception paths cannot leave the row busy.
- LMS busy state is tracked per module row through a Set-based updater, allowing two different module actions to run without corrupting either row indicator.
- Active AI CTA now has stable `data-testid="modul-ajar-ai-active-cta"` and `data-ai-section`.

## Explicit File Manifest

Tracked modifications:

- `apps/api/src/ai/ai-generate.service.ts`
- `apps/api/src/__tests__/ai-generate.spec.ts`
- `apps/api/src/__tests__/p16-ai-push.spec.ts`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-ai-containment.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx`
- `apps/web/src/app/dashboard/rpp/_components/RppBoard.tsx`
- `apps/web/src/components/academic/ModulAjarView.tsx`
- `apps/web/src/__tests__/modul-ajar-ai-containment.test.ts`

New files:

- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-profile.ts`
- `apps/web/src/app/dashboard/akademik/_components/lms-status-optimistic.ts`
- `apps/web/src/__tests__/modul-ajar-profile.test.ts`
- `apps/web/src/__tests__/modul-ajar-view.test.ts`
- `apps/web/src/__tests__/lms-status-optimistic.test.ts`
- `docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REMEDIATION-2026-07-31.md`

Copied prompt/audit inputs remain untracked for reviewer packaging decision:

- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-PLAN-2026-07-31.md`
- `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-REPORT-2026-07-31.md`
- `docs/audits/PROMPT-ARCHITECT-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
- `docs/audits/PROMPT-ARCHITECT-REVIEW-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
- `docs/audits/PROMPT-ARCHITECT-DELIVERY-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
- `docs/audits/PROMPT-ARCHITECT-FINAL-STAGING-REVIEW-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`

No schema, migration, dependency, provider/env, Docker, Keycloak, scheduler, staging, production, or Git action was performed.

## Verification

Focused API tests:

```text
npm.cmd --prefix apps/api test -- --runTestsByPath src/__tests__/rpp.spec.ts src/__tests__/lms.spec.ts src/__tests__/ai-generate.spec.ts src/__tests__/p16-ai-push.spec.ts --runInBand
PASS: 4 suites / 78 tests
```

Focused web tests:

```text
npm.cmd --prefix apps/web test -- --runTestsByPath src/__tests__/modul-ajar-ai-containment.test.ts src/__tests__/modul-ajar-profile.test.ts src/__tests__/modul-ajar-view.test.ts src/__tests__/lms-status-optimistic.test.ts src/__tests__/rpp-page.test.ts src/__tests__/academic.test.ts --runInBand
PASS: 6 suites / 49 tests
```

Type-check:

```text
npm.cmd --prefix apps/api run type-check
PASS

npm.cmd --prefix apps/web run type-check
PASS
```

Lint:

```text
npm.cmd --prefix apps/api run lint
PASS

npm.cmd --prefix apps/web run lint
PASS, with existing Next lint deprecation/plugin warning only
```

Build:

```text
npm.cmd --prefix apps/api run build
PASS

npm.cmd --prefix apps/web run build
PASS, 39/39 pages generated
```

Note: this isolated Git worktree uses junctions to the main checkout `node_modules` to avoid reinstalling dependencies. Next build exited 0 but printed a standalone trace-copy warning caused by the junction path. This is a local worktree dependency artifact, not a compile/type failure.

Diff check:

```text
git diff --check
PASS
```

## Proof Matrix

| Contract | Evidence |
| --- | --- |
| DTO stays ID-only and strict | Existing `GenerateRppStepSchema` strict test remains green |
| Extra browser context rejected | `ai-generate.spec.ts` |
| CP authoritative | API rejects `cp` in `cp_tp`; web rejects `cp` in browser patch |
| Provider output must be structured JSON object | `normalizeSectionOutput()` plus focused API tests |
| Code fence/markdown/full document rejected | API parser and forbidden pattern tests isolate outer fence, nested fence, and Markdown heading |
| KD/KI-KD rejected | API forbidden patterns test `Kompetensi Dasar`, `Kompetensi Inti`, `KI/KD`, `KI-KD`, standalone `KD`, and `KI dan KD` without relying on code fence |
| Complete Kegiatan contract | API and browser tests reject partial rows with only `inti` |
| ATP cannot invent TP | `assertAtpRefsMatchSavedTp()` plus test |
| Missing TP zero request | API and web tests assert no provider/generate/audit path |
| PII local-only route preserved | PII context test still uses local gateway and no cloud fallback |
| Current profile dimensions | `modul-ajar-profile.test.ts` verifies eight dimensions for 2025/2026+ |
| Historical compatibility | `modul-ajar-profile.test.ts` keeps old profile framework readable |
| Full-fidelity review rendering | `modul-ajar-view.test.ts` renders structured sections to static HTML |
| LMS row status immediate | `lms-status-optimistic.test.ts` and component integration |
| LMS action cleanup | `lms-status-optimistic.test.ts` covers failed response, thrown exception, and same-row double-click dedupe |
| LMS parallel row busy | `PembelajaranGuru.tsx` uses per-row Set state; `lms-status-optimistic.test.ts` proves two rows stay independently busy |

## Local Browser QA and React #310

Local browser QA was not claimed as complete in this remediation pass.

Reason: this branch is not deployed, and the isolated local worktree has no authenticated deterministic browser fixture equivalent to the staging QA accounts. Running a browser against staging would not validate this branch's changed source.

Source/test mitigations completed before re-review:

- Stable active AI CTA selector added: `data-testid="modul-ajar-ai-active-cta"`.
- Hidden/inactive AI buttons now have no active test id, reducing ambiguous locator risk.
- Missing-foundation tests prove zero `ensureSaved()` and zero generate call.
- React `#310` remains a staging/browser reproduction gate after this source branch is deployed.

Required next gate after reviewer source approval:

1. Explicit packaging and PR to `develop`.
2. Promote to staging only after CI/review.
3. Re-run targeted browser QA on staging for active AI CTA, missing CP/TP zero request, six section generations, RPP review rendering, LMS publish/unpublish/archive row state, SISWA LMS visibility/progress, and React `#310` matrix.

## Residuals

- No production/main promotion was performed.
- PR `#418` to main should remain held until this quality closure is reviewed, deployed through Gitflow, and staging QA passes.
- Staging provider/runtime quality samples must be re-collected after deployment because local provider was not invoked in this source remediation.
- React `#310` is not declared fixed; it has source-level locator mitigation and still needs staging reproduction verification.

## Recommendation

Proceed to reviewer source re-review. Do not commit, push, merge, promote, or sign off AI production quality until reviewer accepts the source closure and the delivery/staging QA prompt completes.
