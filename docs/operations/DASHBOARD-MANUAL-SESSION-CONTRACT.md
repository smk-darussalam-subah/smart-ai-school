# Dashboard and Manual Session Contract

Date: 2026-10-20. Source contract only, not runtime activation evidence.

## Authority and Wiring

| Consumer                               | Read path                                                                                     | Mutation                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Super Admin, TU, active Waka Kurikulum | Jadwal -> Sesi pembelajaran harian; monitoring entry only with its existing reader permission | Periksa & aktifkan / Nonaktifkan otomasi -> explicit confirmation                       |
| Teacher                                | Own assigned sessions in Jadwal and dashboard                                                 | Start/complete own session with `academic.class-session.manage`; API rechecks ownership |
| Principal                              | Existing academic and monitoring readers, bounded by permissions                              | No new preparation/start privilege                                                      |
| Student and parent                     | Existing class/child schedule readers                                                         | No preparation/start privilege                                                          |
| Industry                               | No new access                                                                                 | None                                                                                    |

Preparation requires both the authoritative application role/active appointment
and `academic.schedule.manage`. The commit reads authority again inside the
transaction after domain locks, using the existing identity lifecycle lock.
The preview is not an authorization grant.

Teacher academic summary links to `/dashboard/jadwal#today-class-sessions` only
with session-read permission. The old walkthrough button is named `Panduan
mengajar`: it opens the existing teaching guide, not a ClassSession transition.
Assessments remain a separate domain and are not started by preparing KBM sessions.

`GET /class-sessions/activation` reads the current semester's explicit status.
`GET /class-sessions/activation/preparation?date=YYYY-MM-DD` derives a preview for today in WIB.
`POST /class-sessions/activation/enable` requires `{date, planHash}` from that preview.
`POST /class-sessions/activation/disable` requires `{semesterId, revision}` and rejects stale confirmations.
Only one new table, `academic.class_session_activations`, is introduced; absence is off.
The migration never enables a semester or copies the previous semester's choice.
Changes are audited atomically with the configuration. No dependency is added.

The compatibility `GET /class-sessions/preparation?date=YYYY-MM-DD` derives a preview from the active
period, applicable weekly schedules and canonical SCHOOL bell profile.
`POST /class-sessions/materialize` requires `{date, planHash}` from that preview.
Unknown fields, impossible dates, missing binding and drift fail closed.
Its range is today through 14 days ahead (WIB), within the active period; commit requires activation already on.
No dependency on published RPP/module content is introduced.

Preparation skips blocks whose start has already passed, as well as expired
concurrency approvals. It does not start a session, edit a timetable or replay
historical alerts. After explicit opt-in, the existing API startup/minute timer
prepares upcoming sessions each teaching day in WIB (Monday–Saturday, excluding calendar holiday/break),
until opt-out or semester change. Restart does not duplicate sessions/events/alerts or backfill past starts.
One ineligible teacher is suppressed by the daily path without stopping unrelated valid classes;
interactive preview/confirmation rejects an invalid assignment instead of certifying readiness.
Existing T+5/T+10/T+15 alert rows follow future schedule timestamps. Delivery/worker commissioning remains separate;
the UI does not promise that an uncommissioned worker will deliver alerts.

Lock order: per-date preparation (when needed) -> schedule/bell mutation -> period cutover -> session row (when needed)
-> activation -> idempotency -> identity lifecycle -> eligibility rows. No path acquires an earlier lock after a later one.
Both preview and confirmation reject a closed semester under the existing cutover lock.
Preview takes domain transaction locks but creates no session/event/alert rows.
Commit is atomic; event insertion failure rolls back session creation. Concurrent
confirmations reject stale state. A conflict/uncertain network result requires a
fresh explicit preview; no automatic mutation retry is performed.

Opt-out blocks starting unstarted sessions and cancels pending/claimed/dispatched alert intents,
pending queue logs and active display deliveries. It does not change session history or block completion of
an already STARTED session by its still-authorized owner. Every new start still checks live account,
teacher/staff eligibility, ownership, permission, active/writable period and canonical schedule/bell window.
Reactivation binds only valid upcoming sessions to the new activation revision using existing domain events.
Old queue intents are not revived. Reminder dispatch, retries and display playback share the same
date/period/activation/source/teacher/active-JP guard; break/outside hours/Sunday are suppressed.
Push recipients use DIIS `auth.users.id`, not the Keycloak subject, and link to the real session card.
External packets/audio already sent cannot be withdrawn; the last-send guard is not an atomic remote revocation guarantee.

## Attendance and Schedule Readiness

Executive teacher attendance and school-health pillar use StaffAttendance:
`presentRequired / dueRequired * 100`, rounded to one decimal.
The denominator includes known teacher obligations already due or recorded early.
Future unrecorded obligations, exemptions and unscheduled teachers are excluded.
Any unknown teacher obligation or zero denominator produces unavailable (`null`),
not a fabricated 0% or 100%. GPS inside/recorded remains a separate location metric.
Late arrivals count as recorded attendance; punctuality remains separately visible.

Schedule readiness compares occupied inclusive JP against weekly assignment hours
for each represented semester. No schedule means unplanned, underfill partial,
overfill needs correction, exact fill ready. An absent second semester no longer
makes a fully filled first-semester assignment partial. This is occupancy, not a
guarantee of conflict-free schedules, bell coverage or prepared class sessions.

Monitoring resolves the current segment from date/holiday/SCHOOL bell, independent
of whether sessions exist. Failed resolution is unavailable, never outside-hours.

## Request Budgets

All budgets are per route/handler and minute unless an endpoint explicitly differs.

| Layer                                            | Budget                             | Key                                            |
| ------------------------------------------------ | ---------------------------------- | ---------------------------------------------- |
| Pre-authentication ceiling                       | 1200                               | Server-derived request IP                      |
| General authenticated API                        | 240                                | Verified Keycloak subject after authentication |
| `GET /auth/me`                                   | 240                                | Same verified identity                         |
| Heartbeat                                        | 30                                 | Same verified identity                         |
| SSE ticket                                       | 60                                 | Same verified identity                         |
| Explicit AI endpoints                            | Existing 10/20 limits unchanged    | Same verified identity                         |
| Sensitive writes/public intake/device operations | Existing explicit limits unchanged | Verified subject or public request IP          |

The named AI quota no longer applies to ordinary handlers. Unauthenticated access
still has IP quotas. Forwarded headers and caller-supplied identity are not trusted
as quota keys. HTTP 429 is temporary unavailability with a bounded Retry-After
message, never evidence of a revoked permission or expired session. These are
source limits, not measured capacity guarantees; storage remains process-local as
before. No rate-limit removal, authentication bypass or ingress change is included.

## Release and Recovery Boundary

No automatic activation on page load, deploy or migration. Source rollback reverts
the code; it must not delete already created sessions or audit history. If a future
authorized live preparation must be corrected, use the existing reasoned cancel,
reassign/recovery APIs, not direct SQL or a bulk history purge.

Account mapping repair in staging, Git packaging, Linux artifact verification,
staging role QA, live manual preparation, production deployment and worker
commissioning require their separate gates. Keep the old notification exception
observation open until a reproducible stack/network trace identifies its cause.
