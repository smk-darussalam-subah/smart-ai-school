# Mixed725 — tiga checkpoint lokal, 4 November 2026

Mandat: docs/audits/PROMPT-EXECUTOR-DIIS-MIXED725-THREE-CHECKPOINTS-2026-11-04.md pada outer workspace. Jalankan satu rangkaian; checkpoint internal bukan approval tambahan. Git, staging, production, shared ingress dan commissioning HOLD.

Baseline: working tree 133 path, aggregate d2195fbec96b14d753672cb3f6d317a8d5f6f0d261a29c24f4d9d050146346ed; HEAD f5dea2e2dce1dc81748768fd1f392fb475da74ee. R01/R02 closed lokal tetap dipertahankan. Tidak menambah dependency/schema/service atau mengubah data/layanan sekolah.

1. CP1: failing-before/passing-after CAP-04 (lookup authority error -> safe503, actual deny tetap deny), rollback transaksi, telemetry lab monotonic bounded dan ledger endpoint/intent. Baseline baru sesudah R01/R02 dan error fix, bukan image load lama.
2. CP2: deduplikasi role fresh hanya satu request, bukan cached authority atau pengganti pemeriksaan transaksi/post-queue. Eksperimen satu variabel: identity/heartbeat, autosave, JP dan gabungan. Writer2/reader2/pool5, parent CPU2 dan mem3200MiB, ingress9000/min burst700. Perubahan tambahan hanya dipilih bila trace mendukung; eksperimen gagal disimpan. Tidak melemahkan dataset/SLO.
3. CP3: focused + full API milestone, PostgreSQL integrity/races/scope, standard Linux artifact, browser built authorized/denied/recovery/draft. Dua final full725 replay minimum dengan seed/profile/budget sama, semua error pertama/per-endpoint disimpan. Capacity725 tetap NOT PASSED bila target gagal, atau NOT VERIFIED jika bukti tak tersedia.

Output: ../output/mixed725-capacity-three-checkpoints-20261104/. Bekukan before/delta/union/image/evidence, cleanup hanya resource berlabel tugas. Handoff independen sebelum Git; tidak menganggap self-check sebagai approval.

Model untuk independent semantic re-review berikutnya: GPT-6.1 Sol (gpt-6.1-sol) / high; authority fresh tetap fail-closed, revision/Grade/JP utuh dan ledger terukur. Model sesi aktual tidak terverifikasi.
