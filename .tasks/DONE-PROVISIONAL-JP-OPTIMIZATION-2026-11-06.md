# Provisional JP read efficiency and parent notification correction

Status: source delta reviewed locally; eligible only for a reviewable draft package and exact-candidate Linux CI. Overall built-browser acceptance and capacity remain NOT PASSED. No merge, staging/production deployment or commissioning is authorized by this note.

## Scope and behavior

- Learner JP reads now fetch the active, nondeleted actor ID and primary role once inside their existing fresh RepeatableRead transaction, after admission and logout/session checks. Required own/child permission is derived from that DB role. Caller-supplied identity snapshots, TTL caches and cross-request/queue/transaction reuse are not introduced.
- Role grants, manual revoke precedence, active academic year, appointment effectiveness, parent-child/own scope, selected period and stored attendance history checks remain. Database authority lookup failures return503; actual absence/denial remains403. Teacher roster/save paths and the public legacy permission entry points retain their behavior.
- Production HTTP query-count controls show learner identity reads3→1 for students and parents. This is a proven query reduction, not a demonstrated latency gain.
- Parent WA API contracts accept nullable eventType. Null/empty/unrelated types remain visible as neutral Informasi instead of crashing or inventing Alpha. Explicit izin/sakit/alpha labels remain. The mapper derives notification date and time consistently in WIB, including date rollover; unrelated date utilities are unchanged.

## Local verification and limits

- Focused API156/156 across8 suites and PostgreSQL46/46 with57 candidate migrations passed. These counts include new controls; preliminary/duplicate runs are not added. Independent reviewer reran the same bounded API/PG coverage.
- Parent mapper33 unique tests passed in UTC and Asia/Jakarta, with Web type-check/scoped lint. Independent reviewer repeated the timezone controls. API standard Linux image and source-complete incremental Web image were built; clean-install exact-candidate CI remains a separate packaging obligation.
- Final built Web/API/DB journeys cover student/parent desktop/mobile, neutral parent notification, JP calendar/pie/session details, real403 denial, controlled503 and retry recovery. All business actions were observed; parent mobile also emitted React418. Raw verdict is46/48 checks with the derived completion check also failing. This is not clean-browser acceptance; first failures and original null-WA reproduction are preserved.
-35,000 nullable synthetic WA logs,350 baseline practice grades and56,000 JP records remained intact. Fixture permission overrides were restored to0; owned local containers/networks/volumes/cgroups were cleaned.
- Two declared performance comparisons do not demonstrate latency improvement: AFTER was slower even without JP and included ENOBUFS/ETIMEDOUT transport failures. Final-intent readback before tool repair was complete, but recovery/persistence does not erase initial failures. Capacity725 remains NOT PASSED. No third load was run to seek a passing result.

## Cumulative package and evidence

The predecessor144-path source snapshot carries the previously authorized teacher home/session recovery, calendar/Humas details and permissions, selected temporary-credential reissue/export, JP aggregates and concurrency/authority fixes. Intersecting versions are preserved; prior manifest sizes are successive snapshots, not additive packages or blanket semantic acceptance. The existing calendar migration remains visible; packaging is not live migration approval.

The present implementation adds13 changed/new paths against predecessor144. This mechanical results note adds one more path; all151 source bytes reviewed before this note remain unchanged. Literal packaging must bind the final full manifest, parent/base/tree, path/blob/mode and exact CI checkout. No unrelated file or local output/credential/screenshot belongs in the Git payload.

Local evidence is under the outer DIIS workspace `output/provisional-jp-optimization-20261105/`, including predecessor/current manifests, frozen recipes, build inputs/images, original failed and final browser receipts, query-count controls, raw timed comparisons and independent-review/FINAL-DELTA-REVIEW-20261106.md. The reviewer permits draft packaging/CI only; this is a fresh-agent technical review, not a two-human approval or authenticated staging acceptance.

Residual owners/gates: capacity and transport isolation -> future bounded SRE work; React418 and earlier mobile timeout -> scoped browser diagnosis; real Keycloak/device/PWA/outbox delivery, production permission reconciliation, shared ingress/backup and deployment -> separately authorized runtime gates. Do not relabel residuals CLOSED because CI or a later replay passes.

Next: literal package, draft PR to develop, clean-install Linux CI, then stop for independent exact-PR review. Merge/protection changes/environment approval/runtime/production/commissioning remain HOLD.

Recommended next model: GPT-6.1 Terra / medium for mechanical packaging; GPT-6.1 Sol / high if actual source/base drift requires new semantic judgment. Actual session model/effort is not asserted by this note.
