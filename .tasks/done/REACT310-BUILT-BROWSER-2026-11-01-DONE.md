# React #310 — local reproduction and regression handoff

Authorized slice: reproduce the built-browser Guru denial, return to Beranda,
exception and recovery; add repeatable regression. **P3 remains OPEN.**
No application remediation or staging/production action was authorized here.

Binding: HEAD `cef0f7f858186eca4e1d6a8c886bc4c8ceadd629`, tree
`510597345f45815b0f02a8ebecfe8b711e5e51ef`; local Linux Web image
`sha256:a1cfa419674dade90d47af5e329fee2aafe88b34adfd31c4058ea4a509add3ed`.
Its 837 reviewed build inputs match this checkout. Next 15.5.28, React 19.2.6.

The actual application denies Guru access to Executive and recovers to usable
Beranda, while the exception-free assertion fails. Fresh desktop/mobile probes
reproduce #310. Direct Beranda and anonymous denial are controls. The locally
synthetic permission counterfactual and responsive backend isolate a useful
trigger; they do not establish the exact root cause or justify disabling
attendance. No framework-upgrade attribution has been proved.

Regression and runnable instructions: `scripts/qa/BUILT-ROUTER-RECOVERY.md`.
Raw receipts, retained setup failures, screenshots and the consolidated handoff:
`../output/react310-built-browser-20261101/` relative to the checkout.
The full audit report is in the outer workspace at
`docs/audits/DIIS-REACT310-BUILT-BROWSER-REGRESSION-HANDOFF-2026-11-01.md`.

This is Executor verification with synthetic signed sessions and an HTTP backend
adapter, not independent approval or authenticated staging E2E. Git/index,
dependency versions, database, permissions and remote runtime are not modified.

Next task after a separate source mandate: isolate and repair the redirect/shared
router interaction, then turn the same actual built-browser regression green
with the attendance provider and authority checks intact. Recommended model:
**GPT-6.1 Sol / high**, because routing, shared providers and denial semantics
interact; no silent model switch or release authority is implied.
