# Dashboard–scheduling integration — local executor handoff

Verdict: **SOURCE COMPLETE — INDEPENDENT REVIEW REQUIRED — GIT AND RUNTIME HOLD**.
User mandate: local implementation only; no Git packaging or runtime operations.
Checkout: `smart-ai-school-staging-learner-schedule-fix-20261010`.
HEAD remains `be600fa4532b39501478e2ad82c4f898e4f65ba6`; working-tree source is not that committed tree.

## Delivered

- Complete, configured-period readers with stable ordering, duplicate/drift rejection and explicit unavailable/denied outcomes.
- Teacher-ID grouped monitoring: one collapsed disclosure per teacher, all assignments, search, pagination, global/selected-teacher Excel and print, color/neutral monochrome.
- Actual daily attendance, teacher–class journal scope, materialized due ClassSessions and module progress have independent units. Unknown data is not fabricated as 0% failure.
- Canonical StaffAttendance summaries aggregate before pagination and honor principal exemption, unknown schedules and GPS review.
- Schedule boards retain every concurrent row, actual bell timing and complete subject names/official catalog codes; no arbitrary first/last selection or invented subject code.
- Guru schedule uses selected-period timing and distinguishes planned/current time window from actual session state. Ambiguous modules/RPP expose explicit choices rather than arbitrary selection.
- Siswa/Ortu ownership and per-child availability remain separate. Parent day detail no longer copies daily attendance into every JP.
- KAPROG uses operations scope instead of incorrectly labeling all major schedules as own teaching. Waka own-teacher mode remains explicitly teacher-bound.
- Grade-summary consumers no longer manufacture CP attainment; official per-mapel KKTP is carried to the teacher preview. Existing rapor computation is not rewritten into a new policy.

## Local verification

Web: 77 suites / 855 tests. Affected API: 16 suites / 376 tests. Real Nest module dependency wiring: 1/1.
Actual-component isolated browser lab: 16/16, desktop/mobile, keyboard multi-expand, search/pagination, scope-race rejection, denied/outage/loading, real XLSX download/re-read and print metadata.
Web/API type-check, lint, builds, dependency graph, new-file formatting and diff checks are recorded in the evidence directory.
Final code digests bind verification to unchanged source. API evidence is reused only after checking all 21 API paths remain raw-byte identical following Web-only refinements.

Evidence in the outer workspace: `docs/audits/evidence/scheduling-dashboard-integration-20261013/`.
Authoritative manifest: `candidate-manifest.json` (raw bytes, intended file mode, raw Git blob digest and deterministic aggregate).
Integrity: `integrity.json`; detailed commands: `final-verification.json`; Windows standalone build: `web-build.json`; browser: `browser-complete.json`.
Frozen auth predecessor: 23/23 byte-identical. Previous scheduling/flags union: 42/47 identical; three differences belong to frozen auth, two to this integration wave. No unclassified source drift.

## Limits and next gate

This is executor verification, not an independent verdict. Storage is synthetic/mocked; HTTP guards are real but identity is injected in-process. No TCP DIIS listener, Keycloak login, database connection/migration, active schedule mutation, real attendance, worker, staging, production or sleep was performed.
Clean Linux standalone artifact, authenticated browser→Keycloak/API/PostgreSQL E2E, long-idle physical session recovery, multi-instance token rotation, physical GPS and operational deployment remain NOT VERIFIED.
True CP/TP evidence links, per-JP attendance and assignment/session-linked journals require a separately approved data-model decision; they are honestly unavailable here.
Impeccable executable detector/version 4.5.2 could not be verified. Installed guidance plus scoped browser/manual accessibility review was used; no detector PASS is claimed.

The independent reviewer should inspect the entire cross-role contract, denominator/window/ownership tests and raw manifest before deciding source acceptance. Git and runtime remain HOLD.

## Rekomendasi model untuk tindak lanjut

Task berikutnya: independent semantic review of this exact local wave and frozen auth preservation, before any packaging approval.
Model / effort: GPT-6.1 Sol (`gpt-6.1-sol`) / xhigh.
Alasan: cross-role authority, P1 synthetic-data remediation, period joins and denominator correctness need a comprehensive semantic review, not a mechanical JSX check.
Syarat kualitas: reproduce all key negative controls; reconcile scope, hashes, period, ownership and honest metric units; separate local proof from runtime proof.
Sesi laporan ini: model/effort aktual tidak terverifikasi. Model switching remains manual.
