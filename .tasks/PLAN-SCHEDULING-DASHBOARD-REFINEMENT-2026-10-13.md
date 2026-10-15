# Local refinement: human-readable dashboard and wiring quality

Authority: user-approved local recheck/refinement of the completed integration wave. Git and all DIIS runtime operations remain HOLD.
Checkout: `smart-ai-school-staging-learner-schedule-fix-20261010`; HEAD `be600fa4532b39501478e2ad82c4f898e4f65ba6`.
Predecessor: 56-path integration manifest in outer `docs/audits/evidence/scheduling-dashboard-integration-20261013/`; preserve the frozen auth 23 paths.

## Acceptance

- Replace internal vocabulary in rendered UI and export with plain school-facing language, while retaining legitimate JP/KKTP/semester terminology and honest denominators.
- Keep one teacher row with expandable detail; default-help/rare-status detail stays collapsed, without hiding source failure or denying access silently.
- Keep complete exports/search/pagination and make no-result recovery obvious.
- A blocked print popup must not erase healthy report data or disable unrelated Excel actions.
- Reject malformed times, impossible totals and rows inconsistent with declared filters; no new backend privileges, dependencies, schema or role changes.
- Parent presence labels must not invent all-session attendance or medical/family causes not supplied by data.
- Verify keyboard, touch, mobile/landscape, 200% zoom and reduced motion. Preserve DIIS identity, fonts and compact type scale.
- Run local regression/build against frozen bytes; report self-assessment percentages from an explicit rubric, not as reliability probability or independent approval.

## Scope and evidence

Presentation and validation in Web only; API is rechecked but not edited. Evidence: outer `docs/audits/evidence/scheduling-dashboard-refinement-20261013/`.
No real users/data, live APIs, Keycloak login, database, workers, deployment, Git transactions or computer sleep.
Stop for independent semantic review; authenticated staging E2E and clean Linux artifact remain separate, unverified gates.

Next-task recommendation: GPT-6.1 Sol / xhigh for the consolidated independent semantic review. Actual session identity is unverified; no automatic switching/delegation.
