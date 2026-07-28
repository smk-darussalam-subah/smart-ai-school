# Wave C Appointment Governance - Follow-up Re-review

Tanggal review: 2026-07-27

Status: **FOLLOW-UP REQUIRED - NOT APPROVED for Git gate, PostgreSQL dry-run, commit, PR, promotion, or deploy.**

## Scope and Independent Evidence

Review covers the uncommitted Wave C architectural remediation on
`feat/appointment-governance-wave-c-activation-20260725`.

Independently re-run in the review workspace:

- Focused API suites: 4 suites, 91 tests passed.
- `prisma validate`: passed.
- `git diff --check` and `git diff --cached --check`: passed.

Not performed:

- PostgreSQL migration apply or combined TF2 + Wave B + Wave C dry-run.
- Partial-index/trigger proof, rollback restore rehearsal, browser QA, staging QA,
  Git packaging, Keycloak/VPS change, or deploy.

The passing tests are useful but do not prove the production lifecycle below.

## Accepted Work

1. `Appointment` is now the intended source of position-derived permissions;
   `PermissionsService` applies only `MANUAL` overrides and derives position
   permissions from an `ACTIVE` appointment in the active academic year.
2. `PositionsService.assign/unassign` is fail-closed before legacy writes, and
   appointment-driven Keycloak logout/outbox artefacts have been removed in
   accordance with Director Outbox Option A.
3. Capacity Option A is represented by `Position.maxActiveHolders`, with a
   database trigger intended to serialise capacity changes per position.
4. Academic-year activation calls the appointment helper inside the
   academic-year transaction, and cache invalidation is deferred until after it
   commits.
5. `RolesGuard` correctly resolves required position codes through active DIIS
   appointments. `@Roles('KEPALA_SEKOLAH')` is therefore not a dependency on a
   deleted Keycloak realm role.

## Findings

### P1 - Structure, sidebar, and access diagnostics still read `StaffPosition`

The new appointment authority cannot be observed consistently by users:

- `PositionsService.getAssignments()`, `getMyPositions()`, and `accessCheck()`
  query legacy `StaffPosition`, not `Appointment`.
- `/dashboard/struktur-organisasi` fetches `/positions/assignments` and displays
  those legacy rows.
- The dashboard layout derives sidebar position roles from
  `/positions/my-positions`, so a newly activated appointment may have valid
  backend authority while the user does not receive the appropriate navigation.
- The Struktur Organisasi UI remains explicitly read-only and still says the
  transition will occur in Wave B, although Waves B/C are the implementation
  being reviewed.
- The Users access dialog can show legacy `activePositions` and
  `positionPermissions` beside a different `effectivePermissions` result.

This is a material end-to-end inconsistency, not merely a cosmetic stale label.
It makes the only supported appointment path operationally invisible and makes
the legacy assign/unassign endpoints appear as a dead handoff.

Required direction: replace the read model used by `/positions/assignments`,
`/positions/my-positions`, and `/positions/access-check/:userId` with an
appointment projection. It must expose lifecycle status and dates, use
`Appointment` as the authority source, and leave `StaffPosition` only as an
explicit migration/reconciliation view. Rewire the Structure Organisasi UI to
the appointment lifecycle before enabling a mutation CTA. Do not reactivate
legacy assignment writes.

### P1 - No scheduler or operational trigger for future effective dates

`activateDueAppointments()` is implemented behind `POST /appointments/activate-due`
and has an advisory lock. Repository search found
no scheduler, worker, n8n job, or deployment-managed task invoking it.

Consequently, a mid-year successor approved with a future `effectiveFrom` date
remains `APPROVED` indefinitely unless a privileged operator manually calls the
endpoint. This contradicts the required future-effective-date flow.

Required direction: define one operational owner for the idempotent daily due
activation. Reuse the existing transition helper and advisory lock; do not add
a second activation path. The implementation may be an existing managed
scheduler/n8n job or an application worker, but it must be versioned,
authenticated, observable, and tested. The academic-year cutover path must use
the same lock domain or otherwise have an explicit concurrency proof against
this job.

### P1 - Stable-role transition is incomplete in service-level authorization

`RolesGuard` is appointment-aware, but multiple domain services still use the
synchronous helper `isElevated()` that checks `user.roles` for the deleted
`KEPALA_SEKOLAH` realm role. A real Kepala Sekolah now has stable identity role
`GURU` plus an active `KEPALA_SEKOLAH` appointment, so these service checks
treat the principal as an ordinary teacher and may apply teacher ownership
restrictions or deny a principal-only action.

Examples include the shared helper consumed by attendance, grade, class
activities, analytics, badges, WA logs, and student access, plus local copies
in report cards, teaching assignments, and teacher attendance.

This is fail-closed rather than an observed privilege escalation, but it breaks
the agreed KS operating model. It also leaves authorization policy inconsistent:
the route may admit the KS through `RolesGuard`, then the service rejects or
over-restricts the same user.

Required direction: Prompt Architect must first inventory every positional
authorization check. Replace only the intended *capabilities* with an
appointment-aware policy/resolver or granular permission check. Do not make all
WAKA users globally elevated, and do not reintroduce position roles into
Keycloak or JWT. SUPER_ADMIN and genuine stable-role policy may remain explicit.

### P1 - Capacity and annual lifecycle have uncovered edge cases

1. `resume()` calls `assertNoActiveScopeConflict()`, which rejects whenever any
   other `ACTIVE` appointment exists. This conflicts with `maxActiveHolders >
   1`: an independent deputy holder can occupy one valid slot, yet the suspended
   definitive holder cannot resume even when capacity remains. The required
   rule is narrower: a linked active PLT must block return; independent holders
   should be evaluated against the configured capacity.
2. Academic-year cutover ends only old-year `ACTIVE` appointments. An old-year
   `SUSPENDED` definitive appointment remains non-terminal after the year
   changes. It no longer grants authority because the year is inactive, but its
   business lifecycle is incorrect and it can confuse subsequent replacement or
   history operations.

Required direction: specify and test the capacity matrix for definitive,
independent deputy, successor, and linked PLT states. At annual cutover close
all non-terminal operational appointments according to an explicit policy
(normally `ACTIVE` and `SUSPENDED`; handle old `APPROVED` records deliberately),
while preserving a truthful business history.

### P2 - Capacity is database-configured but not governance-configured

The migration initializes two deputy codes to capacity two, but no reviewed
SUPER_ADMIN catalog workflow exists for changing `maxActiveHolders`. The report
calls it configurable although the current application only reads the value.

Required direction: either document this as an intentional seed-only policy for
the current wave, or add a tightly authorized audited catalog setting in a later
wave. Do not expose arbitrary capacity editing in the appointment form.

## Required Tests and Proof

The follow-up must add focused tests for:

1. An appointment activated for a user immediately appears in the structure
   projection, `my-positions`, sidebar role input, and access diagnostic; a
   suspended/ended appointment does not.
2. A KS represented as stable `GURU` plus active `KEPALA_SEKOLAH` appointment
   passes the intended principal capability while a normal GURU remains scoped.
3. A daily due-activation invocation is idempotent, authenticated, and shares
   its concurrency guarantee with annual cutover.
4. Capacity-two independent holders, suspended definitive holder plus PLT, and
   resume-after-PLT-ended behaviour all follow the approved matrix.
5. Cutover terminates old-year operational appointments and preserves
   cross-year same-person continuation without an authority gap.

Only after code re-review passes may the executor perform the combined
PostgreSQL dry-run: disposable staging copy, pre/post reconciliation counts,
capacity trigger proof under concurrent writes, TF2/Wave B/Wave C migration
application, and restore rehearsal. Browser QA follows that database gate.

## Verdict and Recommendation

Confidence: **90/100** for the findings above. Confidence is high because the
affected request/UI/service paths were traced directly; it is not 100 because
no PostgreSQL runtime or staging browser evidence exists.

Do not send this patch to Git or PostgreSQL dry-run yet. Send this review to
Prompt Architect first. The next executor prompt should be a narrowly scoped
Wave C compatibility and activation follow-up, followed by a fresh reviewer
gate; it must not be merged into the already mandatory combined migration proof.
