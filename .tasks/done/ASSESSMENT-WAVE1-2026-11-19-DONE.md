# Assessment native wave 1 — local implementation

Baseline: main #742, `d1f58637f56391a491c7b4438fd9b9f25aa7098c`, tree `1f37c3c3e9a724ade5804fd5c8667c94c180dbd4`.
Checkout: `smart-ai-school-assessment-wave1-20261119`.
Mandate: local plan/implementation for learner preview, draft protection and session-close confirmation; media and XLSX/Word design/example templates.

## Implemented

- `AssessmentQuestionPreview` reuses `QuestionContent` and the extracted actual `QuestionAnswerInput`. Four question types work locally without start/autosave/submit. Teacher-only keys and guide/rubric information are separate from learner mode. Missing preview details block saving/activating an incomplete draft.
- `QuestionBankEditor` supplies each loaded page to the studio cache; selecting a later-page question retains its content in review.
- Studio close/Escape warns about unsaved choices/configuration; native beforeunload handler is installed while dirty. This is an in-memory guard, not persistent offline draft storage or a comprehensive SPA route guard.
- Essay grading retains unsaved work across participants, isolates fields by response+question, invalidates stale saved markers and retains values after a failed save. Identical criterion IDs across two questions no longer couple their fields. Saving one question does not erase unsaved work elsewhere.
- `AssessmentCompletionDialog` reads current readiness, distinguishes unknown data from zero, shows consequences, and cancels with zero completion calls. Confirmation rereads readiness; changed counts require another confirmation. A single-flight guard handles rapid repeated clicks. Existing completion/Gradebook server behavior remains authoritative.
- Nested dialogs remain in front and tested cancellation returns focus appropriately. Mobile preview and confirmation fit a 390×844 viewport.

## Refinement sweep

- Use the verified AI acceptance receipt and submitted payload to populate Studio for selected AI questions, including ones outside the first Bank Soal page. Reflect edits and deletion from the picker. Keep only selected details, use keyed lookups, and load Bank Soal when opened. The monitored entry path goes from one eager bank read and one results read to zero of each.
- Align preview with saved matching-choice ordering and reject incomplete keys. Answer inputs share the real student component. One test answer now updates its own preview row.
- Read the existing session with a retry option and use the successful create response directly. Protect rapid draft creation/activation clicks in the same dialog. Load full results when opening analysis or essay corrections.
- Clear stale readiness on a failed confirmation read, use the session's actual Gradebook target in copy, and reopen analysis from the server's completed state if the original close response was lost. The active roster total and estimate of learners who have not started are labelled separately.
- Prevent an unchanged saved score from being sent again in the open essay dialog. Improve touch targets, error announcement, and scrolling of nested dialogs on small screens.

## Verification

Independent review found a stale essay list after an unavailable refresh and
duplicate drafts after a lost response. The local follow-up requires a successful
results read before opening the editor, keeps other working scores, and checks
the previous score inside the grade transaction. Draft recovery sends the same
operation and reads its persisted receipt. See
`output/assessment-wave1-review-followup-20261119/REVIEW-HANDOFF.md`.

- Web type-check and scoped ESLint: PASS.
- Eleven focused Jest suites: 120/120 PASS.
- Local browser component bundles: 18 candidate controls PASS plus five comparison controls. Chrome desktop 1440×1000 and mobile 390×844, plus diagnostic close at 320×490. Actual production components with synthetic actions and auth adapter.
- Anonymous built HTTP: login 200, protected academic page 307 to login, health 200. Standard `next build` compiled then stopped on two unchanged lint errors. Diagnostic `next build --no-lint` built and served via `next start`. The incomplete Windows standalone trace is still open.
- DOCX opens/renders in Word as two pages, with an embedded image and two native equations. XLSX opens/renders in Excel with four sheets and calculated rubric total 100. These are proposed formats, not a newly implemented importer.

Latest evidence/handoff: outer workspace `output/assessment-wave1-refinement-20261119/REVIEW-HANDOFF.md`. Original evidence and templates remain in `output/assessment-wave1-20261119`. Harness failures and their corrections are preserved.

## Limits and next gate

Next standalone deployment image, real authentication, API/controller/database end-to-end behavior, CI and staging/production acceptance are NOT VERIFIED by this work. Closing readiness can change between GET and PATCH. Browser beforeunload verification uses a cancelable event. SPA navigation and persistent draft recovery remain outside that proof.

No API/schema/dependency application changes, commit, push, remote access or release. Capacity 725 remains NOT PASSED and React #418/other historical residuals remain OPEN.

Rekomendasi model untuk tindak lanjut
Task berikutnya: independent semantic/source re-review of this exact local wave and its bound evidence, before Git.
Model / effort: GPT-6.2 Sol (gpt-6.2-sol) / high.
Alasan: shared learner rendering, unsaved grading and completion consequences require cross-consumer review.
Syarat kualitas: no preview mutation, isolated essay fields, failure/confirmation/focus controls; do not promote component evidence into authenticated E2E acceptance.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
