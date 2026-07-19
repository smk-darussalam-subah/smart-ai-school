# SPMB Staging QA Follow-up - Findings and Fixes

Date: 2026-07-19
Branch: `fix/spmb-enrollment-staging-followup`
Scope: SPMB accepted enrollment, first-login Keycloak theme, new-student dashboard, and student attendance calendar.

## Summary

This follow-up responds to staging QA after a real SPMB applicant was accepted, provisioned as a student, logged in with the temporary password, changed password, accepted PDP consent, and reached the student dashboard.

The reported issues were reproducible from code evidence and screenshots. The fixes keep the existing workflow intact and focus on UI correctness, data handoff, and truthful empty states. No API schema change or new dependency was added.

## Findings and Fixes

### 1. PPDB accepted lead to student enrollment

Finding:
- The enrollment wizard prefilled only part of the accepted lead data. Name and phone could be available, but guardian name, guardian email, and gender stored in PPDB notes were not projected into the wizard.
- The final enrollment wizard step could be clipped on smaller viewports because dialog content was not constrained with an internal scroll region.
- Editing an existing student could open a blank form because form state was initialized before the selected student was available and was not resynced when the dialog opened.

Fix:
- Added a PPDB enrollment handoff helper that safely parses allowed SPMB metadata from lead notes and pre-fills student name, gender, guardian name, guardian phone, and guardian email.
- Added class recommendation for a single matching grade-X class based on PPDB major aliases, including `TKJ`/`TJKT` and public labels such as "Teknik Komputer dan Jaringan".
- Kept NIS and consent operator-verified; they are not invented from PPDB data.
- Made the wizard dialog scrollable with a fixed footer so step 3/4 content remains reachable on mobile and desktop.
- Added `toSiswaFormState()` and resync logic so the edit student dialog shows the selected student's existing data.

Files:
- `apps/web/src/app/dashboard/siswa/_components/ppdb-enrollment-handoff.ts`
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx`
- `apps/web/src/app/dashboard/siswa/_components/SiswaForm.tsx`
- `apps/web/src/app/dashboard/siswa/_components/siswa-form-state.ts`
- `apps/web/src/app/dashboard/siswa/page.tsx`
- `apps/web/src/app/dashboard/siswa/_components/SiswaTable.tsx`

### 2. Keycloak login and first-password-change UX

Finding:
- The Keycloak login theme had contrast bugs: password input/toggle could render with a white native input background, making the password text/mask hard to see.
- The locale dropdown could open over the login form and visually collide with the page title.
- The first-login password update screen did not explain the active Keycloak password policy.

Fix:
- Added CSS overrides for password/text inputs, autofill, input groups, and toggle button to preserve dark-theme contrast.
- Positioned the locale dropdown as a small anchored menu at the top-right of the card.
- Added a visible password-policy hint: minimum 8 characters, uppercase, lowercase, number, symbol, and not the username.
- Added Indonesian and English Keycloak messages for common password-policy failures.

Files:
- `infrastructure/keycloak/themes/diis/login/resources/css/login.css`
- `infrastructure/keycloak/themes/diis/login/messages/messages_id.properties`
- `infrastructure/keycloak/themes/diis/login/messages/messages_en.properties`
- `apps/web/src/__tests__/keycloak-theme.test.ts`

### 3. New student dashboard empty states

Finding:
- A newly provisioned student with no academic records saw zero values styled as negative signals, for example `0/0 tuntas` and `0 Tugas Pending` with "perlu dikerjakan".
- This made a valid new-account state look like a student problem.

Fix:
- Attendance with no records now shows "belum ada presensi".
- Grades with no records now show "belum ada nilai".
- Pending tasks with zero records now show "tidak ada tugas".
- Daily quest progress handles empty quest arrays without implying work is missing.

File:
- `apps/web/src/app/dashboard/akademik/_components/siswa/BerandaSiswa.tsx`

### 4. Student attendance calendar completeness

Finding:
- The attendance calendar was not a complete month grid. Padding cells and Sundays were represented as empty cells, so the calendar looked incomplete.
- User expectation: the calendar should still show previous/next month dates in a muted shade, Sundays and national/school holidays in red, and Monday-Saturday as active school days.

Fix:
- `generateCalendar()` now returns a full Sunday-first week grid with visible previous/next month dates marked as `outside`.
- Sundays are marked as `holiday`.
- School/national holiday ranges from academic-calendar events are marked as `holiday` when event type is `holiday`/`break` or the event text indicates libur/cuti/holiday.
- The function still does not invent attendance statuses. Real attendance statuses remain only `hadir`, `izin`, `sakit`, and `alpha` from `/attendance`.
- The student attendance UI now shades outside-month dates, colors Sundays/holidays red, and keeps only real attendance statuses clickable.
- The parent attendance calendar was adjusted to avoid clicking outside-month or holiday cells with the wrong month context.
- The student workspace now maps `personal-calendar.events` into the calendar display instead of incorrectly using `schedule` as calendar events.

Files:
- `apps/web/src/lib/academic.ts`
- `apps/web/src/app/dashboard/akademik/_components/siswa/KehadiranSiswa.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/KehadiranOrtu.tsx`
- `apps/web/src/components/academic/shared/attendance-status.ts`
- `apps/web/src/components/academic/shared/CalendarHeatmap.tsx`
- `apps/web/src/__tests__/academic.test.ts`

### 5. Attendance calendar data contract follow-up

Finding:
- Reviewer found that the student attendance API returns `date`, while the student calendar component expected `dayIndex`.
- The old mapping used only the day number, so attendance from another month with the same day number could color the wrong calendar cell.
- The initial page fetch was not constrained to the viewed month, and month navigation did not refetch attendance for the newly viewed month.

Fix:
- `generateCalendar()` now accepts `statusByDate` keyed by full `YYYY-MM-DD`, not day number.
- `SiswaWorkspace` normalizes unknown API rows into `{ date, status }` before rendering, removing the previous cast-only handoff.
- `KehadiranSiswa` refetches attendance for the viewed month via `fetchStudentAttendanceMonth(year, monthIndex0)` whenever the operator/student changes month.
- The server page initial fetch now requests current-month attendance using `dateFrom` and `dateTo`.
- Tests now assert that statuses from another month do not bleed into the visible month, including outside-month cells.

Files:
- `apps/web/src/lib/academic.ts`
- `apps/web/src/app/dashboard/akademik/page.tsx`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/src/app/dashboard/akademik/_components/siswa/KehadiranSiswa.tsx`
- `apps/web/src/app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/ortu/ortu-mappers.ts`
- `apps/web/src/__tests__/academic.test.ts`

### 6. Student provisioning placement policy

Finding:
- Reviewer found that student provisioning could still complete without a class, leaving the new student with empty class schedule, activities, and personal calendar.

Decision:
- For completed enrollment/provisioning, class placement is mandatory.
- Deferred placement should be handled by a separate explicit workflow/status later, not by silently creating an active student with no class.

Fix:
- `ProvisionStudentSchema` now requires `siswa.classId`.
- PPDB enrollment wizard and single-entry student form block submit until a class is selected.
- CSV import already required class, so the bulk import contract remains aligned.

Files:
- `apps/api/src/provisioning/dto/provision.dto.ts`
- `apps/api/src/provisioning/provisioning.service.ts`
- `apps/api/src/__tests__/provisioning.spec.ts`
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx`
- `apps/web/src/app/dashboard/siswa/_components/StudentSingleEntrySheet.tsx`

### 7. PPDB lead to Student linkage follow-up

Finding:
- Reviewer noted that the accepted PPDB lead was not linked back to the created student, so refreshing `/dashboard/siswa?ppdbLeadId=...` could reopen the wizard and invite duplicate enrollment.

Fix:
- `SiswaWizard` sends `ppdbLeadId` when provisioning from an accepted PPDB lead.
- `ProvisionStudentSchema` accepts optional `ppdbLeadId`.
- `ProvisioningService` verifies the lead exists, is `accepted`, and is not already enrolled before creating Keycloak accounts.
- After successful DB creation, the service writes an `enrollment` marker into PPDB lead notes with `studentId`, `studentUserId`, `enrolledAt`, and `enrolledBy`.
- `PpdbService` suppresses enrollment CTA for leads already marked enrolled, while still stripping raw notes from list responses.
- The student page helper refuses to reopen the wizard for a lead whose notes already contain `enrollment.studentId`.

Files:
- `apps/api/src/provisioning/dto/provision.dto.ts`
- `apps/api/src/provisioning/provisioning.service.ts`
- `apps/api/src/ppdb/ppdb.service.ts`
- `apps/api/src/__tests__/provisioning.spec.ts`
- `apps/api/src/__tests__/ppdb.spec.ts`
- `apps/web/src/app/dashboard/siswa/_components/SiswaWizard.tsx`
- `apps/web/src/app/dashboard/siswa/_components/ppdb-enrollment-handoff.ts`
- `apps/web/src/__tests__/ppdb-enrollment-handoff.test.ts`

## Verification

Executed locally:

```bash
npm.cmd --workspace @smk/web test -- academic.test.ts ppdb-enrollment-handoff.test.ts student-import-csv.test.ts keycloak-theme.test.ts siswa-form-state.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-web-spmb-enrollment-followup
npm.cmd --workspace @smk/api test -- ppdb.spec.ts provisioning.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-api-spmb-enrollment-followup
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
git diff --check
explicit target file whitespace/conflict check
```

Result:
- API focused tests: 2 suites / 80 tests passed. Initial run without local cache failed with Windows Temp/Jest EPERM; rerun with workspace cache passed.
- Web focused tests: 5 suites / 45 tests passed.
- API type-check: passed.
- Web type-check: passed.
- API lint: passed.
- Web lint: passed. Existing Next.js `next lint` deprecation/plugin warning only.
- API build: passed.
- Web production build: passed. Next generated 39/39 pages.
- `git diff --check`: passed.
- Explicit target file whitespace/conflict check including untracked new files: passed.

Pending before reviewer sign-off:
- Deploy to staging and manually re-check:
  - Accepted PPDB lead -> Daftarkan sebagai Siswa.
  - Edit created student.
  - Login with a newly generated student account.
  - First password update hint and validation messages.
  - PDP consent redirect.
  - Student dashboard empty states.
  - Attendance calendar for a month starting mid-week and a month with school/national holiday events.

## Residual Notes

- National holidays are not hard-coded in the frontend. They are shown when present in the academic calendar API. This avoids stale holiday rules and keeps the school calendar as the source of truth.
- Cloudflare Analytics CSP warning remains intentionally unchanged in this follow-up. Enabling external analytics scripts should be a separate security/privacy decision.
- Worktree contains historical untracked files. Packaging must use an explicit file list, not broad `git add .`.
