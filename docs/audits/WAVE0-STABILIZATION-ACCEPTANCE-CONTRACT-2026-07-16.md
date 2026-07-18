# Wave 0 Stabilization and Acceptance Contract

Date: 2026-07-16
Executor: Codex
Scope: Documentation-only consolidation for DIIS `smart-ai-school`

## Executive Verdict

Wave 0 is complete as a stabilization contract, not as product remediation. The Phase 0-6 audits describe a system with strong foundations, but the next remediation must be serialized because the highest-risk defects are cross-cutting authorization, ownership, privacy, consent, and permission-contract problems.

The recommended next step is **Wave 1: RBAC, ownership, privacy, PDP consent, permission mismatch, and negative tests**. Do not start report-card Phase 5 or semester-close Phase 6 remediation before Wave 1, because their actor contracts depend on the same permission and ownership semantics.

No production code, schema, seed, dependency, migration, Docker, GitHub Actions, staging, or production environment should be changed by Wave 0.

## Scope and Non-Scope

### Scope

- Normalize Phase 0-6 audit findings into P0/P1/P2 backlog.
- Preserve the old audit reports as source evidence.
- Define remediation wave order and dependencies.
- Define acceptance contracts that future executors can verify.
- Define manual QA protocol with real UI actions and negative cases.
- Seed the next executor prompt for Wave 1.

### Non-Scope

- No code remediation.
- No Prisma schema change.
- No dependency addition.
- No seed, migration, Docker, GitHub Actions, or infrastructure change.
- No push, deploy, staging, or production access.
- No cleanup of untracked/historical artifacts.
- No audit finding is marked closed by this report. Closure requires a remediation wave plus runtime/code verification.

## Source Documents Read

- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/architecture/academic-lifecycle.md`
- `.tasks/PLAN-CONSOLIDATED-2026.md`
- `.tasks/RESIDUAL-ISSUES-REGISTER.md`
- `docs/audits/PHASE0-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE1-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE2-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE3-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE4-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE5-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PHASE6-COMPREHENSIVE-AUDIT-2026-07-15.md`
- `docs/audits/PROMPT-ARCHITECT-WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`

## Severity Normalization Rule

- **P0:** privacy/security/data-integrity/workflow utama tidak bisa berjalan, or users can view/change data they must not access.
- **P1:** important workflow partially broken, contract drift, permission mismatch, error masking, or missing UI action for a lifecycle-critical flow.
- **P2:** UX polish, minor validation, policy/documentation decision, performance/cleanup, or non-blocking hardening.

Old labels such as High/Medium/Low, `P3-CRIT-*`, and phase-local P0/P1/P2 are normalized below. Some duplicates are intentionally merged to prevent later executors from fixing the same root cause twice.

## Consolidated Remediation Backlog

| ID | Normalized | Source audit | Consolidated finding | Impacted module/file area | Affected role | Recommended wave | Dependency | Verification method | Manual QA need |
|---|---:|---|---|---|---|---|---|---|---|
| W1-01 | P0 | Phase 1, Phase 5 | GURU student access and report-card section access are too broad; grades/attendance/report sections must be scoped to assigned class, wali class, or explicit structural permission. | `student.controller/service`, `report-cards.service`, teaching assignments | GURU, SISWA, ORANG_TUA | Wave 1 | None | API negative tests for out-of-class student, grades, attendance, report sections; service ownership tests | GURU tries assigned and unassigned student; out-of-scope must 403, not empty fake success |
| W1-02 | P0 | Phase 0, Phase 1 | Parent/student consent propagation is incomplete; parent account creation through provisioning/assignment needs explicit PDP decision and persistence semantics. Duplicate findings merged here. | `provisioning.service`, `student.service`, auth user consent fields | SUPER_ADMIN, TATA_USAHA, ORANG_TUA, SISWA | Wave 1 | Director/Cowork consent policy decision | Unit/e2e tests for student provisioning and parent assignment; DB assertion for `consentAt` or explicit pending state | Provision student with parent, then inspect parent consent UI/state and parent first login |
| W1-03 | P0 | Phase 0, Phase 1, Phase 2, Phase 4, Phase 6 | Permission/role mismatch spans organization mutation, class management, finance own/child, WA log parent endpoint, analytics own/child, WAKA RPP review, and WAKA Phase 6 reports. | `positions`, `classes`, `finance`, `wa-log`, `analytics`, `rpp`, sidebar/page guards, seed permissions | SUPER_ADMIN, KS, TU, WAKA_KURIKULUM, SISWA, ORANG_TUA | Wave 1 | Consent model W1-02 helpful but not blocking | Controller metadata tests plus API e2e for allowed and denied role/permission pairs | Role without permission sees 403 or blocked UI; allowed own/child role sees scoped data |
| W1-04 | P0 | Phase 5 | SISWA/ORANG_TUA report-card `status` query can override distributed-only privacy gate. | `report-cards.service.findAll` | SISWA, ORANG_TUA | Wave 1 | None | API tests for `status=draft/checked/published` as SISWA/ORTU returning no protected rows | Before distribution, `/dashboard/rapor` and manual status filter show no report |
| W1-05 | P0 | Phase 3 | Class activity/jurnal kelas ownership is too loose: GURU can create for any class, and read scope can expose other classes. | `class-activities.service/controller` | GURU, SISWA, ORANG_TUA | Wave 1 | W1-01 ownership resolver pattern | API tests for create/read/update/delete on assigned vs unassigned class; permission metadata test | Guru creates class A journal success, class B forbidden; SISWA/ORTU only see own/child class |
| W1-06 | P0 | Phase 4 | Finance SPP approval semantics are reversed: create can default to paid and emit receipt before approval; approve does not own the transition/event. | `finance.dto`, `finance.service`, keuangan UI | TATA_USAHA, SUPER_ADMIN, KEPALA_SEKOLAH, SISWA, ORANG_TUA | Wave 1 | W1-03 finance permissions | Service/e2e tests: create -> unpaid/no WA; approve -> paid/approvedAt/payment.received | TU clicks `Catat SPP`, SA/KS clicks approve; WA log only after approve |
| W1-07 | P0 | Phase 3, Phase 4 | Parent multi-child UI/data binding is first-child only or label-only in academic, finance, SPP, WA log, grades, attendance, badges, rank, and report flows. | `dashboard/akademik/page.tsx`, `OrtuWorkspace`, child data actions | ORANG_TUA, SISWA | Wave 1 | W1-03 own/child permissions | Component/server action tests for childId-specific fetches; API tests for child ownership | Parent selects child two; every panel changes; refresh persists selected child or safely resets with correct data |
| W1-08 | P1 | Phase 0, Phase 6 | High-impact period/organization endpoints remain role-only where permission-based architecture is expected. | `positions.controller`, `school-config` semester/year endpoints | SUPER_ADMIN, KS, WAKA, delegated staff | Wave 1 | W1-03 permission catalog decision | Metadata tests for `@RequirePermission`; denied role tests | KS/TU/WAKA access matches documented policy and rejected users see clear 403 |
| W1-09 | P1 | Phase 0 | Permission override deny path is incomplete or misleading because DTO accepts grant boolean but service always grants through one path. | `permissions.controller/service`, Users UI | SUPER_ADMIN, TATA_USAHA | Wave 1 | W1-03 permission semantics | Unit tests grant true, grant false, revoke role-derived permission, cache invalidation | Super Admin grants and denies a permission; target user access changes after refresh |
| W1-10 | P1 | Phase 0 | Position assignment DB side effects are not transactional; active position can exist without intended permission overrides if later DB writes fail. | `positions.service` | SUPER_ADMIN, KS, WAKA, staff | Wave 1 | W1-03 | Transaction failure simulation or service test; access-check consistency | Assign/unassign position; warning/permission/access-check all stay consistent after reload |
| W2-01 | P1 | Phase 0 | Bulk user CSV template omits required email and blocks mass provisioning. | `AddUserDialog.tsx`, provisioning API | SUPER_ADMIN, TATA_USAHA | Wave 2 | Wave 1 consent policy if parent rows included | UI/component test template headers; e2e import valid CSV and missing email rejection | Download template, import, preview, submit, verify users created |
| W2-02 | P1 | Phase 1 | PPDB accepted status does not enroll/create a Student. | `ppdb.service`, PPDB UI, provisioning/student service | TATA_USAHA, SUPER_ADMIN, SISWA, ORANG_TUA | Wave 2 | W1-02 consent model | E2E: lead paid -> accepted -> student/user/parent linkage created or explicit enrollment action required | TU moves lead to accepted, completes enrollment, new student appears in student list |
| W2-03 | P1 | Phase 1 | PPDB state machine is UI-only; API allows invalid jumps/reverts and terminal status edits. | `ppdb.service`, `update-status.dto` | TATA_USAHA, SUPER_ADMIN | Wave 2 | None | API transition tests for valid and invalid status changes | Try invalid status jump in UI/API; UI shows clear blocked transition |
| W2-04 | P1 | Phase 1 | PPDB assignLead does not validate assignee role/staff eligibility. | `ppdb.service`, `assign-lead.dto` | TATA_USAHA, SUPER_ADMIN, staff | Wave 2 | W1-03 allowed PPDB handler permissions | Service tests active/deleted/wrong role target | Assign lead to TU succeeds; assign to SISWA/GURU without handler permission fails |
| W2-05 | P1 | Phase 1 | Class management actor contract is inconsistent: KS writes allowed by role while lifecycle suggests TU/SA setup and permission-based control. | `classes.controller`, `/dashboard/kelas` | SUPER_ADMIN, KS, TATA_USAHA | Wave 2 | W1-03 final policy | Controller metadata and UI capability tests | KS read/write behavior matches final policy; denied action has no fake success |
| W2-06 | P1 | Phase 1 | SPP schedule generation is a product decision: lifecycle names schedule setup, implementation is manual one-record flow. | `finance.service`, lifecycle docs/UI | TATA_USAHA, SUPER_ADMIN | Wave 2 | W1-06 finance semantics | Either doc/UI decision or bulk generator tests with idempotent upsert | TU creates monthly schedule for class or sees explicit manual-only workflow |
| W3-01 | P0 | Phase 2 | RPP/Modul Ajar body schema strips rich wizard fields, so saved content is incomplete. | `ModulAjarForm`, `guru-types`, `rpp.dto` | GURU, WAKA, KS, SISWA | Wave 3 | Wave 1 WAKA policy for review path | Round-trip API test for full body; UI save/reload test | Guru fills every wizard section, saves, refreshes, all fields remain |
| W3-02 | P0 | Phase 2 | AI RPP step generation reports success but most generic output is discarded/not applied. | `ModulAjarForm`, `actions.ts`, `ai-generate.service` | GURU | Wave 3 | W3-01 schema parity | Component/Playwright: click Generate for each step and assert field changes | Guru clicks Generate on steps; generated text appears and can be edited |
| W3-03 | P0 | Phase 2 | `Simpan Draft` is fake local timeout, not a server save. | `ModulAjarForm`, RPP create/update actions | GURU | Wave 3 | W3-01 | Browser test save draft -> close/reopen; API test draft persisted | Guru clicks `Simpan Draft`, refreshes, draft is still present |
| W3-04 | P1 | Phase 2 | WAKA_KURIKULUM RPP review is documented/seeded/sidebar-visible but API and page gates block it. | `rpp.controller/service`, `/dashboard/rpp`, Sidebar, position permissions | WAKA_KURIKULUM, KS | Wave 3 | W1-03 WAKA policy | API/UI tests WAKA allowed or docs/sidebar removed per decision | WAKA opens Review Modul Ajar, reviews/returns; unauthorized role denied |
| W3-05 | P1 | Phase 2 | AI generation can send/store raw prompt/output without PII stripping on RPP generation path. | `ai-generate.service`, PII utilities, `AiGeneration` audit | GURU, SISWA indirectly | Wave 3 | W1-02 PDP policy | Unit tests redaction for phone/email/name-like content; audit record inspection | Teacher enters PII-like text, generated request/audit is redacted or blocked |
| W3-06 | P1 | Phase 2 | RPP creation and manual LMS linking do not fully validate teacher assignment, RPP ownership, class/subject/year consistency. | `rpp.service`, `lms.service`, RPP/LMS DTOs | GURU, WAKA, KS, SISWA | Wave 3 | W1-01 ownership resolver | Service tests for assigned/unassigned class, arbitrary `rppId` denial | Guru can create only assigned class/subject module; arbitrary UUID fails |
| W3-07 | P1 | Phase 2 | Teacher attendance uses UTC day instead of Asia/Jakarta school day. | `teacher-attendance.service` | GURU, KS, TU | Wave 3 | None | Unit tests around 00:30 WIB and 07:30 WIB | Guru check-in early morning records correct local school date |
| W4-01 | P0 | Phase 3 | Student main workflow is incomplete: LMS detail/task/session screens still include placeholders and card click resets active module id. | `ModulDetailSiswa`, `TaskDetailModal`, `LessonSessionModal`, `ModulSiswa`, `SiswaWorkspace` | SISWA, GURU | Wave 4 | W3-06 LMS/RPP consistency | Browser tests: open module, lesson, task, submit assessment; no placeholder text | Student opens module card, detail loads, task start/submit works |
| W4-02 | P0 | Phase 3 | Assessment timer can be manipulated from client because submit can trust `dto.startedAt`. | `assessment.service`, assessment DTOs | SISWA, GURU | Wave 4 | None | API tests cannot submit without server start; future/modified startedAt ignored | Student starts timed assessment, refreshes, timer uses server start; late submit blocked |
| W4-03 | P0 | Phase 3 | Assessment/session contracts use loose `z.any`; invalid questions/answers can persist and break grading/UI. | assessment DTOs, question DTOs, shared types | GURU, SISWA | Wave 4 | W4-02 | Zod discriminated-union tests; invalid payload 400 | Malformed question/answer rejected with visible UI error |
| W4-04 | P0 | Phase 3 | Auto-grade formatif can overwrite unrelated grades due to weak existing-grade lookup. | `assessment.service`, `grade` creation | GURU, SISWA, ORANG_TUA | Wave 4 | W4-03 typed source metadata, schema decision may be ASK FIRST | Service tests for UH/UTS/UAS/praktik separation and idempotency | Guru completes formatif; prior UTS/UAS/praktik scores unchanged |
| W4-05 | P1 | Phase 3 | Randomized questions are not persisted per student; refresh can change order/snapshot. | `assessment.service`, `AssessmentResponse` answers/snapshot | SISWA, GURU | Wave 4 | W4-03; possible schema policy ASK FIRST | Tests for start -> refresh/resume -> same order; submit validates snapshot | Student refreshes assessment and sees same randomized order |
| W4-06 | P1 | Phase 3 | LMS progress is not monotonic and client can set `locked`. | `lms.service`, progress DTO/UI | SISWA, GURU | Wave 4 | W3-06 | API tests reject regressions and client `locked`; completed sticky | Student progress cannot decrease after refresh or malicious client request |
| W4-07 | P1 | Phase 3 | SSE monitor lacks reconnect token refresh and UI can close/error too harshly. | SSE token service/UI EventSource wrapper | GURU | Wave 4 | None | Integration/browser test network disconnect/reconnect with new token | Guru monitor reconnects and shows reconnecting state |
| W5-01 | P1 | Phase 4 | Announcement manager policy drifts from lifecycle; scheduled publish may broadcast early. | `announcements.service/controller`, `/dashboard/pengumuman` | SUPER_ADMIN, KS, TU, SISWA, ORANG_TUA | Wave 5 | W1-03 final manager policy | Tests TU allowed/denied per decision; scheduled urgent does not broadcast before schedule | Create scheduled urgent announcement; non-manager sees it only after time |
| W5-02 | P1 | Phase 4 | AI chatbot UI history/access policy is incomplete or too narrow despite strong backend ownership. | AI UI, sidebar permissions, `ai.chat` policy | SISWA, GURU, KS, configured roles | Wave 5 | W1-03 AI access policy | Browser test chat -> refresh -> history; denied role no menu/API | User chats, refreshes, history appears; denied role blocked |
| W5-03 | P1 | Phase 4 | Remedial is visible as status/filter but not a Phase 4 workflow with assignment, due date, retake, notification, completion. | grades, assessment, LMS/remedial UI/services | GURU, SISWA, ORANG_TUA, WAKA | Wave 5 | W4 assessment integrity, W6 report-card uses remediation data | Product design decision, then API/UI tests for remedial lifecycle | Guru assigns remedial, student completes, parent sees status, grade updates per policy |
| W5-04 | P2 | Phase 4 | Public kiosk exposes teacher names; needs privacy decision if public internet URL. | `public-kiosk.service`, school config token | Public, GURU, KS | Wave 5 | Director privacy policy | Snapshot test payload; policy doc update | Open kiosk link; no student PII, teacher display follows policy |
| W5-05 | P2 | Phase 4 | Finance UI uses raw Student ID and weak error/confirmation UX. | `KeuanganTable`, keuangan actions | TU, SA, KS | Wave 5 | W1-06 finance semantics | Component/browser test student search/select and approve confirmation | TU searches student, records SPP, sees errors and confirmation summary |
| W6-01 | P0 | Phase 5 | Wali kelas workflow cannot run because UI calls GURU actions while backend permits SA/TU/KS differently. | `report-cards.controller/service`, `RaporWaliKelas`, actions | GURU wali kelas, TU, KS | Wave 6 | Wave 1 RBAC/ownership, W1-01 | API/UI tests for wali generate, notes, submit only own class | Wali clicks `Kompilasi Rapor`, saves notes, submits own class |
| W6-02 | P0 | Phase 5 | Report-card separation of duties is wrong: WAKA missing, KS/TU too broad, distribute/publish/generate actions not actor-correct. | report-card controller/service/UI | WAKA, KS, TU, GURU | Wave 6 | Wave 1 WAKA/permission policy | Transition tests by actor/action and denied matrix | WAKA review/return, KS publish only, TU distribute only |
| W6-03 | P0 | Phase 5 | Attendance snapshot for report cards is not semester-correct and can build invalid date strings from academicYear. | `report-cards.service` attendance snapshot/sections | SISWA, ORANG_TUA, GURU, KS | Wave 6 | Active period consistency from W7 helpful | Unit tests semester 1/2 date range; out-of-range attendance excluded | Generate report; attendance matches semester, not whole history |
| W6-04 | P1 | Phase 5 | SISWA/ORTU UI may show current grades instead of immutable distributed ReportCard snapshot. | `RaporModal`, `NilaiSiswa`, `/dashboard/rapor` | SISWA, ORANG_TUA | Wave 6 | W1-04 privacy gate, W6-03 snapshot correctness | Browser test edit grade after publish/distribute does not change report view | Parent opens report after distribution; snapshot stays immutable after grade edit |
| W6-05 | P1 | Phase 5 | Report distribution lacks push/in-app notification for student and parent; WA parent exists. | notification listener/service, push/in-app notifications | SISWA, ORANG_TUA, TU | Wave 6 | Push subscription health/VAPID availability | Listener tests for WA plus push/in-app idempotency | TU distributes; WA log plus push/in-app appear for expected recipients |
| W6-06 | P1 | Phase 5 | Return/revision leaves stale `checkedAt`; mass generate can be partial; section endpoints are too loose and not snapshot-based. | `report-cards.service`, report-card UI | WAKA, KS, TU, GURU, SISWA, ORANG_TUA | Wave 6 | W6-01/W6-02 action model | Service tests for return clearing stamps, transactional/partial reporting, section ownership | Invalid transition produces clear error, not reload or silent stale state |
| W7-01 | P0 | Phase 6 | No atomic, fail-closed close semester workflow with preflight blockers for active assessments, published LMS, incomplete RPP, non-distributed reports, final audit snapshot, and idempotency. | `school-config`, new close workflow area, semester UI | KS, WAKA, GURU, TU | Wave 7 | Waves 1, 4, 6 | API tests for blockers and success transaction; browser QA close preflight | KS attempts close with blockers and sees categorized blockers; success close changes active period atomically |
| W7-02 | P0 | Phase 6 | WAKA_KURIKULUM cannot access Phase 6 learning achievement reports, CP progress, or relevant analytics. | `analytics.controller/service`, executive/akademik UI, RPP gates | WAKA_KURIKULUM | Wave 7 | W1-03 WAKA policy, W3-04 RPP policy | API/UI tests WAKA allowed for academic reports and denied non-academic areas | WAKA opens learning achievement report and RPP completion views |
| W7-03 | P1 | Phase 6 | LMS archive is not terminal; archived modules can be edited, republished, or deleted. | `lms.service`, `PembelajaranGuru` | GURU, SISWA | Wave 7 | W4 LMS progress integrity | API/UI tests reject edit/publish/delete archived; readonly UI | Guru archives module; refresh shows readonly, no publish/delete/edit |
| W7-04 | P1 | Phase 6 | Assessment completion exists per session but is not tied to close readiness and fail-soft grading can leave pending/ungraded work. | `assessment.service`, close preflight | GURU, KS, WAKA | Wave 7 | W4 assessment integrity | Readiness tests count active sessions, submitted/graded responses, essay pending | Active assessment blocks close; completed and graded assessment clears blocker |
| W7-05 | P1 | Phase 6 | KS executive audit is informational, not final semester report/snapshot/export/close readiness. | executive dashboard/actions/analytics | KS | Wave 7 | W7-01 | Browser QA final report mode; API tests period-bound summaries | KS opens final audit, exports/snapshots, follows blocker links |
| W7-06 | P1 | Phase 6 | KKTP compliance uses default KKM rather than configured KKTP per subject/period. | `analytics.service`, `kktp-config` | WAKA, KS, GURU | Wave 7 | W3/W4 grade semantics; KKTP config available | Unit tests configured KKTP overrides default; period-bound compliance | WAKA changes KKTP and report recomputes compliance |
| W7-07 | P2 | Phase 6 | Active semester can be inconsistent with active academic year; period endpoints role-only. | `school-config.service/controller`, Tahun Ajaran UI | KS, SA | Wave 7 | W7-01 close transaction | Invariant tests only one active TA and one active semester in that TA | Activate semester from inactive TA is blocked or activates parent transactionally |
| W8-01 | P2 | Phase 0-3 | Primary setup/prep pages can mask load failures as empty data. | users, positions, calendar, siswa, PPDB, RPP, jadwal, presensi-guru pages | Operators across roles | Wave 8 | After major flows stabilized | Browser tests API 500/401 -> load error banner, successful empty -> empty state | Simulated API failure shows LoadError, not "no data" |
| W8-02 | P2 | Phase 0, Phase 2, Phase 5 | Destructive/high-impact actions need shared confirmation and better error UX: calendar delete, RPP approve/delete, report publish/distribute, alert/reload patterns. | UI shared dialogs, calendar/RPP/report-card screens | SUPER_ADMIN, KS, WAKA, TU, GURU | Wave 8 | Relevant workflow waves | Component/browser tests confirm/cancel/submit/error | User sees clear destructive confirmation and backend error message |
| W8-03 | P2 | Phase 0-2 | Minor validation/policy cleanup: calendar date/type, KKTP query, major code casing, URL fields, teachingAssignment query, schedule auto-generate query. | DTOs/services | Operators | Wave 8 | No schema change unless ASK FIRST | DTO tests invalid query/body rejected | Invalid form/API input shows validation errors |
| W8-04 | P2 | Phase 1 | Legacy/dead student create path and PPDB client-side 200-row cap need cleanup. | student forms, PPDB dashboard | TU, SA | Wave 8 | W2 student/PPDB flow | Component/page tests canonical path only; server-side pagination | Student creation happens through one safe wizard; PPDB search includes beyond 200 rows |

## Duplicate, Deferred, and Policy Notes

- Parent consent appears in Phase 0 and Phase 1; this report merges it into W1-02.
- GURU over-read appears in Phase 1 and Phase 5 section endpoints; this report merges it into W1-01.
- Parent first-child bugs appear in Phase 3 and Phase 4; this report merges them into W1-07.
- WAKA role mismatch appears in Phase 2, Phase 5, and Phase 6; this report tracks the policy root in W1-03 and phase-specific implementation in W3-04, W6-02, and W7-02.
- SPP schedule generation is a product decision, not automatically a code defect. Wave 2 must either implement a generator or document/manualize the lifecycle contract.
- Schema changes and dependencies are **ASK FIRST** in every wave. Assessment/source metadata, report-card return metadata, remedial workflow, push/in-app delivery, and semester close snapshot may need schema work and must be approved before implementation.

## Dependency Graph Antar Wave

```text
Wave 1 RBAC/Ownership/Privacy/Consent
  -> Wave 2 Phase 0-1 Setup, Provisioning, PPDB, Class, SPP setup
  -> Wave 3 Phase 2 RPP, AI, LMS prep, Teacher attendance
  -> Wave 4 Phase 3 KBM, Assessment, LMS progress, Student/Parent runtime
  -> Wave 5 Phase 4 Operations, Finance UI, Announcements, AI Chat, Remedial
  -> Wave 6 Phase 5 Report-card pipeline and distribution
  -> Wave 7 Phase 6 Semester close and final academic reports
  -> Wave 8 Cross-phase UX/validation/error-polish cleanup
```

Strict dependencies:

- Wave 6 must not start before Wave 1, because report-card actor contracts rely on role, permission, and ownership boundaries.
- Wave 7 must not start before Waves 1, 4, and 6, because semester close depends on ownership, assessment completion, LMS archive, and report-card distributed status.
- Wave 5 remedial design should not start before Wave 4 assessment integrity decisions are stable.
- Any wave requiring schema or dependency changes must pause for Director/Cowork approval before editing schema/dependencies.

## Wave Order Recommendation

1. **Wave 1 - RBAC, ownership, privacy, PDP consent, permission mismatch, and negative tests.** This is the next wave.
2. **Wave 2 - Phase 0/1 setup and enrollment stabilization.** Provisioning, PPDB, class setup, SPP setup decision.
3. **Wave 3 - Phase 2 academic preparation.** RPP save/schema/AI, WAKA review policy, LMS/RPP ownership, local-day attendance.
4. **Wave 4 - Phase 3 KBM runtime integrity.** Student workflow, assessment timer/DTOs/randomization/auto-grade, LMS progress, class activity.
5. **Wave 5 - Phase 4 operations.** Finance UX after semantics, announcement scheduling, AI chat UI, remedial workflow.
6. **Wave 6 - Phase 5 report-card pipeline.** Actor separation, status privacy, immutable snapshots, notifications, error UX.
7. **Wave 7 - Phase 6 semester close.** Atomic fail-closed close, WAKA learning report, archive terminal semantics, final reports.
8. **Wave 8 - Cross-phase polish and validation.** Error masking, destructive confirmations, minor DTOs, legacy UI cleanup.

## Acceptance Contract Per Wave

### Wave 1 Acceptance Contract

- GURU cannot read students, grades, attendance, class activities, or report-card sections outside assigned class/wali/explicit structural scope.
- SISWA and ORANG_TUA can access only own/child data, including finance, WA log, analytics, report cards, grades, attendance, LMS, and class activities.
- Parent consent model is decided and implemented consistently: either operator-confirmed guardian consent persists on parent user, or parent self-consent is explicitly pending and visible.
- Permission gates align with seed permissions and documented role/position model for organization, class, finance, analytics, WA log, RPP review, WAKA reports, and semester/period endpoints.
- Negative authorization tests exist for every changed controller/service path.
- UI controls are hidden/disabled for denied actions and API denial returns 403, not empty fake success.
- Schema/dependency policy: **ASK FIRST**.

Suggested checks:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/api run test -- --runInBand student permissions finance wa-log analytics rpp report-cards class-activities positions
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/web run lint
```

### Wave 2 Acceptance Contract

- CSV template/import can provision required user types without impossible validation mismatch.
- PPDB status transitions are server-enforced, terminal statuses are protected, and invalid jumps are rejected.
- Accepted PPDB leads either enroll/create a Student through a verified flow or explicitly require a separate enrollment action with clear UI.
- Class management actor policy is permission-based and matches lifecycle.
- SPP setup is either documented as manual or implemented as duplicate-safe schedule generation.
- Primary setup pages show load errors for failed API calls.
- Schema/dependency policy: **ASK FIRST**.

### Wave 3 Acceptance Contract

- Modul Ajar full wizard fields survive save/reload round-trip.
- `Simpan Draft` is a real server save with truthful dirty/saved/error state.
- AI generation applies output to target fields or opens an explicit review/apply flow; no success toast when output is discarded.
- WAKA RPP review policy is implemented or documentation/sidebar/seed claims are corrected.
- AI generation path redacts/strips PII before cloud egress and avoids storing raw sensitive prompt/output.
- RPP and LMS creation validate teacher assignment, RPP ownership, and class/subject/year consistency.
- Teacher attendance uses Asia/Jakarta school-local day.
- Schema/dependency policy: **ASK FIRST**.

### Wave 4 Acceptance Contract

- SISWA can open LMS module details, lesson/session details, task/assessment details, start assessment, answer, submit, and resume without placeholder screens.
- Assessment timing is server-authoritative and cannot be extended through client `startedAt`.
- Assessment question/answer DTOs are strict and shared enough to prevent grading/render drift.
- Randomized question order persists per student attempt.
- Auto-grade is idempotent and cannot overwrite unrelated grade types/sessions.
- LMS progress is monotonic; `completed` is sticky unless an explicit authorized reset exists.
- Class activity read/write/update/delete is scoped and permission-correct.
- SSE monitor reconnects using a new token after transient disconnect.
- Schema/dependency policy: **ASK FIRST**, especially if grade source metadata or assessment snapshot storage requires schema migration.

### Wave 5 Acceptance Contract

- SPP record/approve UI reflects fixed semantics from Wave 1: TU records unpaid, SA/KS approve, receipt event only after approval.
- Announcement manager policy is final and scheduled urgent/darurat broadcasts do not fire early.
- AI chat UI restores history after refresh, handles gateway errors clearly, and follows final access policy.
- Remedial workflow is either explicitly designed and implemented or documented as deferred; no UI implies complete remediation if only status/filter exists.
- Public kiosk privacy policy for teacher names is documented/implemented.
- Finance UI no longer requires raw Student ID for routine entry and shows approval confirmation/errors.
- Schema/dependency policy: **ASK FIRST**, especially remedial workflow and notification changes.

### Wave 6 Acceptance Contract

- GURU wali kelas can generate/compile report cards only for own wali class, edit notes, and submit for review.
- WAKA_KURIKULUM reviews/returns; KS publishes; TU distributes; no actor can perform another actor's high-impact transition.
- SISWA/ORANG_TUA cannot see draft/checked/published report cards by query override; only distributed snapshots are visible.
- Attendance snapshots are semester-correct and immutable after publish/distribute.
- Parent/student report UI reads `ReportCard` snapshot, not live grades.
- Report distributed emits required WA plus push/in-app notifications per approved notification contract.
- Return clears stale timestamps or records return metadata per approved schema policy.
- Mass generate is transactional or reports per-student partial failures clearly and safely.
- Schema/dependency policy: **ASK FIRST**, especially return metadata, actor metadata, push/in-app infrastructure.

### Wave 7 Acceptance Contract

- Close semester has explicit preflight and final endpoints/actions, not only "activate semester".
- Close blocks when there are active assessments, published/unarchived LMS modules, incomplete RPPs, non-distributed report cards, pending/ungraded responses, or inconsistent periods.
- Successful close is transactional, idempotent, audit-logged, and produces a final summary/snapshot.
- WAKA_KURIKULUM can access learning achievement reports, KKTP compliance, heatmap/progress CP, and RPP completion where policy allows.
- LMS archived state is terminal/read-only for teachers and safe from delete/republish without explicit privileged audited action.
- KS final semester report is period-bound and export/snapshot capable.
- KKTP compliance uses configured KKTP per subject/period instead of default KKM.
- Active academic year and active semester invariants are enforced.
- Schema/dependency policy: **ASK FIRST**, especially close snapshot/audit metadata.

### Wave 8 Acceptance Contract

- Primary pages distinguish API/session/permission failure from successful empty result.
- High-impact/destructive actions use shared confirmation and clear toast/banner errors.
- Minor DTO validation is aligned across list/mutation paths.
- Legacy/dead UI paths are removed or made safe.
- PPDB pagination/filtering does not silently cap at 200 rows.
- Schema/dependency policy: **ASK FIRST**.

## Focused Test Strategy Per Wave

| Wave | Focused API/service tests | Web/browser/manual tests | Static checks |
|---|---|---|---|
| Wave 1 | Authorization matrix, ownership resolvers, consent persistence, permission seed/controller alignment | Denied roles see blocked UI/403; own/child selectors return correct data | API/web type-check and lint |
| Wave 2 | PPDB transition/enrollment, CSV import, class policy, SPP setup | Provisioning wizard, PPDB accepted flow, class management, SPP setup | API/web type-check and lint |
| Wave 3 | RPP body round-trip, AI redaction/application, RPP/LMS ownership, local date | Modul Ajar save/generate/submit/review, teacher attendance | API/web type-check and lint |
| Wave 4 | Assessment timer, strict DTOs, auto-grade idempotency, class activity scope, LMS progress | Student module/task/assessment, parent child switching, SSE reconnect | API/web type-check and lint |
| Wave 5 | SPP approval event, announcement schedule, AI chat history, remedial service | Finance record/approve, announcement schedule, AI chat refresh/error | API/web type-check and lint |
| Wave 6 | Report actor transitions, status privacy, snapshot range, notifications | Wali/WAKA/KS/TU pipeline, student/parent distributed report view | API/web type-check and lint |
| Wave 7 | Close preflight/success transaction, archive terminal, KKTP analytics, period invariants | KS close preflight, WAKA reports, GURU archive, negative close blockers | API/web type-check and lint |
| Wave 8 | DTO validation and error-state regression tests | LoadError vs empty state, confirmations, pagination/search | API/web type-check and lint |

Baseline commands after any code wave:

```powershell
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
```

For API/auth/security work, add focused Jest/e2e/curl evidence. For UI workflows, add browser QA or Playwright evidence where practical.

## Manual QA Matrix Per Role and Workflow

| Role | Page/path | Button/action to click | Form/input | Expected backend effect | Expected UI result | Negative authorization case | Empty/error-state case | Refresh/reload persistence |
|---|---|---|---|---|---|---|---|---|
| SUPER_ADMIN | `/dashboard/users` | `Tambah User`, `Import CSV`, permission grant/deny controls | CSV with email, role, staff/student fields; permission grant and deny values | Users created; consent state follows policy; permission override grant/deny changes effective access and cache invalidates | Preview validates rows; success/error toast truthfully reports created/failed rows; user detail shows effective permissions | TATA_USAHA cannot alter privileged roles/active state if policy denies; denied action returns 403 and UI blocks control | Invalid CSV missing required column shows row-level errors; API failure shows LoadError/banner, not empty list | Reload users page; created users and permission effects persist; denied permission still denied |
| SUPER_ADMIN | `/dashboard/struktur-organisasi` | Assign/unassign staff position; sync Keycloak role if available | Staff, position, academic year, major for scoped position | StaffPosition and DB permission overrides update atomically; Keycloak sync fail-soft after DB commit | Warnings for SoD conflicts are visible; access-check reflects new permissions | KS or other role without manage permission cannot assign/unassign if final policy says SA-only | Failed override write rolls back position; UI shows error | Reload; assignment and access-check stay consistent |
| TATA_USAHA | `/dashboard/ppdb` | Update lead status until `accepted`, assign lead, enroll/create student | Lead status, assignee, accepted lead enrollment data | Valid PPDB transitions persist; accepted lead creates/links student or opens required enrollment action | Funnel and student list update; invalid transition blocked with message | Assign lead to unrelated/non-staff user fails; role without PPDB permission blocked | No leads shows empty state only after successful fetch; API failure shows error | Reload PPDB and student list; accepted/enrolled state persists |
| TATA_USAHA | `/dashboard/kelas` and `/dashboard/keuangan` | Create/edit class; `Catat SPP` | Class grade/major/year/wali; student select, month, amount | Class write follows final permission policy; SPP record created as unpaid, no receipt event yet | Class row and unpaid SPP row appear; no approve button for TU | TU cannot self-approve SPP; denied class action follows final policy | No students/classes shows explicit empty; invalid student/month shows validation error | Reload; class and unpaid SPP remain; no WA receipt before approval |
| GURU | `/dashboard/akademik` | `Buat Modul Ajar`, `Generate`, `Simpan Draft`, `Submit`; create/start assessment; attendance; create class activity | Full RPP wizard, AI prompt fields, assigned class/subject, assessment questions, attendance statuses, class activity details | RPP draft persists; AI output stored in intended fields; assessment starts server-side; attendance/class activity scoped to assigned class | Saved state truthful; generated fields visible; assessment monitor active; activity appears for class | Guru cannot create RPP/LMS/activity for unassigned class; cannot read other class student data | AI/API failure leaves form open with error; no RPP list due to API failure shows LoadError | Refresh after draft/assessment/activity; data persists and unauthorized class remains denied |
| WAKA_KURIKULUM | `/dashboard/rpp`, `/dashboard/akademik`, future learning report path | Review/return RPP; review/return report card; open learning achievement report | Review note, report-card return reason, TA/semester filters | RPP/report status changes according to WAKA action; learning report queries period-bound academic data | WAKA sees only academic review/report tools, not unrelated KS finance/PPDB powers | GURU/TU cannot perform WAKA review; WAKA denied non-academic executive panels | No submitted RPP/reports shows queue empty; API failure shows error | Reload; review status, return reason, and report filters persist |
| KEPALA_SEKOLAH | `/dashboard/rpp`, `/dashboard/rapor`, `/dashboard/keuangan`, `/dashboard/executive`, `/dashboard/tahun-ajaran` | Approve RPP/report card; approve SPP; open audit; run semester close preflight | Approval note, report filters, SPP approval confirmation, TA/semester close target | RPP final approval triggers LMS hook; SPP approval sets paid/approvedAt and emits receipt; close preflight reads blockers | KS sees approve/publish but not TU distribute if SoD applies; close shows blockers or success summary | KS cannot distribute report if policy says TU-only; cannot bypass close blockers | Empty reports/payments show empty only after success; close blockers categorized | Reload; approved status/payment/close preflight state remains correct |
| SISWA | `/dashboard/akademik`, `/dashboard/rapor`, `/dashboard/keuangan` | Open LMS module, start assessment, submit answers, view grades/attendance/report | Assessment answers, module progress | AssessmentResponse uses server start; progress monotonic; report visible only when distributed; finance own scoped | Module/detail no placeholders; own grades/attendance/payment/report only | SISWA cannot access other student ID, non-distributed report, or elevated analytics | No modules/report/payments show honest empty; API failure shows error | Refresh assessment/module/report; timer/order/progress/report snapshot remain stable |
| ORANG_TUA | `/dashboard/akademik`, `/dashboard/keuangan`, report modal | Switch child, open grades/attendance/WA log/report card | Child selector, report modal | All child-scoped datasets query selected child; WA log and finance use child permissions; report only distributed snapshot | Every panel changes with selected child; no first-child data leak | Parent cannot access unrelated child ID or status-filter non-distributed reports | Child without data shows child-specific empty; WA log 403 is surfaced as permission error, not blank success | Refresh after child switch; selected child persists or safely resets with matching data only |
| Negative cross-role | Any protected page/API | Try direct URL/API with role lacking permission | Manual URL or devtools request | Backend returns 401/403 before service data leak | UI blocks nav/control or shows forbidden state | Must not return other user's data or empty fake success | Error state distinguishes forbidden/session/API failure | Reload does not change unauthorized outcome |

## Decisions Needed From Director/Cowork

1. PDP consent model for parent accounts created by operator workflows.
2. Final KS/TU/WAKA boundaries for class management, RPP review, report-card review, and semester close.
3. Whether PPDB `accepted` should auto-enroll immediately or require an explicit enrollment step.
4. Whether Phase 1 SPP setup remains manual or gets bulk schedule generation.
5. Whether RPP review is one-step KS-only or two-step WAKA then KS.
6. Whether WAKA_KURIKULUM gets executive academic analytics via a WAKA-specific workspace or shared KS workspace with restricted panels.
7. Whether report-card return requires new metadata fields such as returnedAt/returnedBy/returnNote.
8. Whether remedial becomes a real workflow in this remediation series or is deferred with documentation.
9. Public kiosk teacher-name exposure policy.
10. Schema migration approvals for assessment source metadata, report-card return metadata, remedial workflow, push/in-app notifications, and semester close snapshot if future waves require them.

## Risks If Waves Are Executed Out Of Order

- Starting Phase 5 before Wave 1 can bake the wrong actor model into report-card code and expose draft/checked/published reports.
- Starting Phase 6 before Waves 1, 4, and 6 can create a close-semester flow that closes over incomplete assessment/report data.
- Fixing parent dashboards before own/child permissions are settled can make UI appear correct while APIs still leak or block data.
- Building remedial workflow before assessment and grade idempotency are fixed can attach remediation to unstable grade semantics.
- Adding schema fields opportunistically without approval can violate the repository guardrail and create migration drift.
- Treating Wave 0 backlog entries as closed would hide unresolved product risk; this report only consolidates.

## Next Executor Prompt Seed For Wave 1

```md
Anda adalah Codex Executor untuk proyek DIIS `smart-ai-school`.

Misi: eksekusi Wave 1 - RBAC, Ownership, Privacy, PDP Consent, Permission Mismatch, dan Negative Tests.

Baca wajib:
- `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
- `C:\Users\USER\Documents\Claude\Projects\DIIS\smart-ai-school\AGENTS.md`
- `docs/WAYS-OF-WORKING.md`
- `docs/decision-log.md`
- `docs/architecture/academic-lifecycle.md`
- `docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md`
- Phase audit files 0-6 as needed for source evidence.

Scope Wave 1:
- Fix or formally decide RBAC/permission mismatches for positions, classes, finance own/child, WA log child endpoint, analytics own/child, WAKA RPP review, WAKA Phase 6 reports, and high-impact period endpoints.
- Implement fail-closed ownership for GURU student access, grades, attendance, class activities, report-card sections, and parent/student own/child data.
- Resolve PDP consent propagation for parent accounts created during student provisioning/assignment, or document/persist explicit pending self-consent.
- Fix report-card status query privacy gate for SISWA/ORANG_TUA.
- Fix SPP create/approve event semantics if included in Wave 1 finance boundary.
- Add negative authorization tests for every changed route/service.

Non-goals:
- Do not implement Phase 2 RPP body/AI fixes, Phase 3 assessment workflow, Phase 5 full report-card pipeline, or Phase 6 close semester except where required for access gates.
- Do not change Prisma schema, dependencies, seed, migration, Docker, GitHub Actions, staging, or production without explicit approval.

Acceptance:
- Every changed API path has allowed and denied tests.
- UI no longer offers high-impact actions to denied roles.
- Denied API paths return 403/401 and do not masquerade as empty success.
- Own/child and assigned-class tests pass for positive and negative cases.
- Final answer includes files changed, test output, code touched, remaining risk, and next recommended wave.
```

## Wave 0 Verification Plan

Required for this documentation-only wave:

```powershell
git status --short
git diff --check -- docs/audits/WAVE0-STABILIZATION-ACCEPTANCE-CONTRACT-2026-07-16.md
```

Type-check/lint are not required for Wave 0 because no source code is changed. If a later wave edits code, run focused checks plus package type-check/lint.
