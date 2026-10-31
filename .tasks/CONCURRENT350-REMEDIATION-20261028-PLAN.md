# Local concurrent-access remediation, target 350 learners

Mandate: user `lanjutkan` after the 350-student simulation. Local code/config/tests only. Git, staging and production mutation HOLD. No dependency or schema addition. Preserve pre-existing Metabase removal (14 paths), with intentional intersections recorded separately.

Inputs: production incident investigation and 350-student simulation reports dated 2026-10-28 under outer `docs/audits/`; production reference SHA 9ace768b6eea276e289384b114029aecf6f57bc2. Evidence baseline: outer `output/concurrent350-remediation-20261028/BASELINE.json`.

Acceptance / sequence:

1. Bound ingress budgets for school NAT, internal API transport, per-handler pre-auth budget for assessment signals/saves; preserve authenticated per-user quotas and spoof-resistant identity.
2. FIFO bounded assessment write admission before Prisma connection acquisition; retain all existing session/period locks, permissions, revisions and idempotency. Reject an expired queue item before executing it; no automatic replay of an uncertain mutation.
3. Correct POST session recovery at writable boundaries, preserving drafts and preventing redirect307 -> GET-only refresh405. Runtime controls for actual middleware + handler / Server Action.
4. Replace blind learner whole-page30s polling with scoped change checks, pause while assessment active, jitter/single-flight; initial data and manual refresh remain correct. Reduce common reads for student/parent branches. Autosave cadence change pending user's short async answer; safe coalescing and single-flight can proceed.
5. Additive permission reconciliation recipe with dry-run/idempotence/deny preservation; existing tables only. No production permission mutation. Diagnose monitoring target from source and document external residual rather than adding an unapproved service.
6. Focused unit, actual Nest/Fastify and disposable PostgreSQL350 controls, Linux ingress/artifact proof and component/browser expiry/draft controls. Record all synthetic boundaries. No capacity guarantee from arithmetic alone.
7. Completion sweep, literal delta manifest + pre-existing preservation and independent reviewer handoff. Source complete only after all authorized source work/checks are complete; external acceptance remains HOLD.

Decisive counterexamples: old shared backend1400 signals -> 1200 accepted +200429; old five-connection350write burst -> P2028; old POST307refresh ->405; old LMS grants missing; old full-page poll17API per30s.

Next actor after source closure: independent semantic reviewer, GPT-5.6 Sol / xhigh, exact local delta and runtime boundaries. Current session model/effort unverified.
