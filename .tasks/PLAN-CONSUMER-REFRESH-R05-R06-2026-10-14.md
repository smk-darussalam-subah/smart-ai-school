# Consumer refresh R05/R06 — 2026-10-14

Follow-up to independent re-review SHA-256 d177325b0cfebc9c9ad226d624a7b4f7c546f3ff83f88756dcb588d9016c575c. Local source only; Git/index/refs and all runtime remain HOLD. No sleep, dependency/schema/policy/infra changes or real records.

1. Retire Gradebook acknowledged overlays only at a new authoritative parent read/availability transition. Bind each asynchronous success to its originating read, never prioritize it over a newer snapshot. Source identity must be the unfiltered parent server read, not a newly created UI filter array. Preserve active input draft and same-read unrelated renders; do not use hard reload or remount for same-period recovery.
2. Forward the same scoped official KKTP metadata and availability to Penilaian and Capaian. Derive current status/rapor rows from props; keep CP fetch independent and unable to overwrite thresholds. Preserve period/class/student/role boundaries.
3. Verify mounted lifecycle: NA70 -> save60/NA80 -> incoming60/80 -> incoming90/95, CSV95; late success/failure, draft active, denied/unavailable then recovery, exact-id/dedup/cancel. KKTP80 ->70 ->denied/unavailable ->recovery; late80 CP response cannot change it.
4. Add permanent regressions, focused Web and type/lint. Run direct-component local browser proof with synthetic callbacks, desktop/mobile states. Preserve byte-identical KS editor/prose, auth/API, old48/37 tests and historic evidence. Seal new union96/delta7, never overwrite predecessor93.

Next task: independent bounded semantic delta re-review, GPT-6.1 Sol / high. Prioritize asynchronous data integrity, incoming snapshot authority and unavailable semantics. Actual session identity unverified; switching manual.
