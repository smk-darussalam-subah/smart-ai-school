# Wave AI-0A Modul Ajar Code Containment

Tanggal eksekusi: 2026-07-29

Verdict executor: CODE CONTAINED - READY FOR REVIEW

## Scope

Wave AI-0A membatasi ulang bantuan AI Modul Ajar agar aman sebelum provider/runtime gate. Scope ini tidak melakukan commit, push, PR, deploy, perubahan schema, dependency, infrastructure, environment, VPS, Keycloak, atau staging runtime.

## Before Contract

- UI Modul Ajar dapat mengirim konteks browser yang luas untuk generate per bagian dan generate semua.
- Endpoint legacy menerima request raw-context untuk pertanyaan, materi, ATP, dan konteks RPP.
- Draft belum selalu dipersist sebelum AI berjalan, sehingga request AI dapat memakai state lokal yang belum otoritatif.
- Beberapa affordance seperti generate semua, PDF/DOCX, dan upload lampiran berpotensi memberi kesan fitur operasional padahal belum ada provider/storage final.

## After Contract

- Endpoint operasional Modul Ajar hanya menerima `rppId` dan `section`.
- Backend memuat RPP tersimpan dari database, memvalidasi owner guru, dan memvalidasi TeachingAssignment aktif sebelum provider dipanggil.
- Backend membangun prompt allowlisted dari field RPP tersimpan: subject, title, class, academicYear, semester, fase, model, durasi, JP, CP, TP, dan konteks section yang relevan.
- DTO `generate-rpp-step` strict: field tambahan seperti `context`, `rppBody`, dan browser-declared subject ditolak, bukan dibuang diam-diam.
- Endpoint legacy raw-context `generate-questions`, `generate-material`, dan `generate-atp` dibuat fail-closed dengan 410 `AI_ENDPOINT_DISABLED`.
- UI Modul Ajar hanya menawarkan bantuan AI per bagian, bukan generate semua.
- UI LMS dan Bank Soal tidak lagi menampilkan tombol AI legacy yang akan deterministik 410.
- UI menyimpan atau memperbarui draft lebih dulu sebelum memanggil AI. Submit review tetap action terpisah.
- Satu dialog hanya menjalankan satu request AI aktif; double-click didedupe di helper.
- ATP hanya dapat dibantu setelah CP/TP tersimpan atau dikonfirmasi guru. Jika TP kosong, UI menahan provider call dan mengarahkan guru mengisi TP.
- Output invalid tidak memutasi body; error copy stabil dan menjaga draft tetap tersimpan.
- Server Action rejection pada tahap save-before-AI selalu melepas status saving melalui `finally`.
- Affordance palsu `Upload Lampiran`, `Download PDF`, dan `Export DOCX` di Modul Ajar dihapus.

## PII And Provider Routing

- `hasPii(prompt)` dijalankan sebelum provider selection.
- Jika PII terdeteksi, request hanya memakai local gateway dan tidak fallback ke cloud bila local gagal.
- Jika local gateway gagal pada konteks PII, service mengembalikan `AI_CONTEXT_PII_BLOCKED`.
- Prompt provider dan audit tetap melewati `stripPiiForLlm`.
- Audit `aiGeneration` menyimpan prompt/output redacted dengan ukuran terbatas dan fail-soft bila audit write gagal.

## Files

Product/API:

- `apps/api/src/ai/dto/generate.dto.ts`
- `apps/api/src/ai/ai-generate.controller.ts`
- `apps/api/src/ai/ai-generate.service.ts`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-ai-containment.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulLmsForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/QuestionBankEditor.tsx`

Tests:

- `apps/api/src/__tests__/ai-generate.spec.ts`
- `apps/api/src/__tests__/p16-ai-push.spec.ts`
- `apps/web/src/__tests__/modul-ajar-ai-containment.test.ts`

Report:

- `docs/audits/WAVE-AI0A-MODUL-AJAR-CODE-CONTAINMENT-2026-07-27.md`

## Verification

Commands run from `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school`:

- `npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/ai-generate.spec.ts src/__tests__/p16-ai-push.spec.ts src/__tests__/rpp.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave-ai0a`
  - 3 suites / 39 tests passed.
- `npm.cmd --workspace @smk/web run test -- --runTestsByPath src/__tests__/modul-ajar-ai-containment.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave-ai0a`
  - 1 suite / 8 tests passed.
- `npm.cmd --workspace @smk/api run type-check`
  - passed.
- `npm.cmd --workspace @smk/web run type-check`
  - passed.
- `npm.cmd --workspace @smk/api run lint`
  - passed.
- `npm.cmd --workspace @smk/web run lint`
  - passed with existing Next lint deprecation/plugin warning only.
- `npm.cmd --workspace @smk/api run build`
  - passed.
- `npm.cmd --workspace @smk/web run build`
  - passed, 39/39 app routes generated.
- `git diff --check`
  - passed. Git emitted line-ending warnings for existing CRLF-normalized files, with no whitespace errors.

Static checks:

- `rg -n "Generate Semua|Upload Lampiran|Download PDF|Export DOCX|isGeneratingSemua|isGeneratingMaterial|semuaProgress|aiGenerateMaterial|aiGenerateAtp" apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
  - no matches.
- `rg -n "Generate Materi AI|Generate Soal AI|Generate AI Bank Soal|Generate AI" apps/web/src/app/dashboard/akademik`
  - no matches.
- `rg -n "rppBody|context: z\.string|sourceText|subject: z\.string" apps/api/src/ai`
  - no matches.
  - The same pattern intentionally appears in `ai-generate.spec.ts` only as a negative test proving `context`, `rppBody`, and `subject` are rejected.
- `rg -n "JSON.stringify\(body\)|handleGenerateSemua|Generate Semua|Upload Lampiran|Download PDF|Export DOCX" apps/web/src/app/dashboard/akademik apps/api/src/ai`
  - only generic fetch body serialization in `actions.ts` and OpenAI HTTP request serialization in `openai.adapter.ts`; no raw Modul Ajar body/context generation path.

## Test Coverage

API tests cover:

- saved RPP server-side context and ownership lookup;
- strict DTO rejection of extra browser context fields;
- non-owner rejected before provider or audit call;
- owned RPP without active TeachingAssignment rejected before provider or audit call;
- PII context routed to local gateway only;
- PII local failure blocks cloud fallback with `AI_CONTEXT_PII_BLOCKED`;
- ATP missing foundation stops before provider call;
- invalid ATP output rejects before audit success;
- non-PII request uses a single configured provider attempt;
- legacy raw-context generation endpoints are disabled.

Web tests cover:

- unsaved/dirty button labels;
- save-before-generate for new drafts;
- update-before-generate for dirty saved drafts;
- save success plus AI failure preserving saved draft id;
- save rejection releasing the single-flight guard for the next attempt;
- double-click dedupe;
- missing TP zero provider call;
- invalid ATP output no patch.

## Manual QA

Manual browser QA was not run for AI-0A because this wave is source containment only and explicitly excludes Git, deploy, provider configuration, VPS, and AI-0B runtime gate.

Browser QA for Wave 3 should be run after reviewer approval and deployment of this containment plus the AI-0B provider gate. Minimum browser checks:

- GURU opens Modul Ajar and creates a draft.
- Dirty draft shows save-before-generate label.
- Per-section AI saves draft first.
- Provider failure leaves draft visible and editable.
- ATP without TP shows the TP foundation message and makes no provider request.
- LMS and Bank Soal no longer expose legacy AI buttons while their raw-context endpoints remain disabled.

## Residual Risks

- LMS material and question-bank AI UI plus raw-context web server actions were removed in this containment pass. Their backend endpoints stay disabled and require a separate authoritative-context redesign before re-enablement.
- Provider runtime, API key/token health, local gateway availability, timeout behavior, and staging browser behavior are intentionally deferred to AI-0B.
- This report does not claim curriculum quality of AI output; it only claims request boundary containment and failure safety.
- Worktree remains mixed with historical untracked artifacts. Any future Git packaging must use an explicit file list.

## Request To Reviewer

Please perform AI-0A source review against:

- ID-based request contract;
- server-side ownership and TeachingAssignment validation;
- allowlisted context construction;
- PII routing and no cloud fallback on PII;
- save-first and one-request UI behavior;
- disabled legacy raw-context endpoints;
- tests and static checks above.

If approved, next gate is AI-0B operational provider/runtime validation, not direct production or main promotion.
