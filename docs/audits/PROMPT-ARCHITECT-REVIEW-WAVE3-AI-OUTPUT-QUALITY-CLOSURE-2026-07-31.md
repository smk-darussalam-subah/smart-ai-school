# Prompt Architect Review - Wave 3 AI Output Quality Closure

Tanggal: 2026-07-31

## Draft Prompt

```md
Review perbaikan output AI, jalankan test, lalu tentukan siap PR.
```

## Kritik Draft

Draft tidak membuktikan bahwa backend menjadi parser tunggal, invalid model output
fail-closed, CP tetap authoritative, historical curriculum tetap terbaca, reviewer
melihat semua field, atau LMS dan browser console benar-benar tertutup.

## Prompt Final untuk Reviewer

````md
Anda adalah Reviewer independen untuk DIIS `smart-ai-school`.

Review-only atas **Wave 3 AI Output Quality Closure**. Jangan edit code/tests/docs,
stage, commit, push, membuat PR, merge, deploy, menjalankan SQL, atau mengubah
staging/production/provider/secret.

Verdict:

- `APPROVED FOR EXPLICIT GIT PACKAGING`
- `FOLLOW-UP REQUIRED IN WAVE 3`
- `BLOCKED`

Finding in-scope dikembalikan ke Executor pada branch/worktree yang sama. Jangan
membuat AI-0C, Wave 3.1, atau prompt Architect baru.

## Wajib Dibaca

1. workspace dan repo `AGENTS.md`;
2. `docs/WAYS-OF-WORKING.md`;
3. `docs/decision-log.md`;
4. staging QA plan/report 2026-07-31;
5. Prompt Architect implementation;
6. Executor remediation report;
7. source, diff, dan tests aktual.

## Gate 0 - Identity dan Scope

```powershell
git branch --show-current
git status --short --branch
git merge-base --is-ancestor origin/develop HEAD
git diff --stat origin/develop...HEAD
git diff --name-status origin/develop...HEAD
git diff --cached --stat
```

Expected:

- dedicated `fix/wave3-ai-output-quality-20260731`;
- no staged changes;
- no schema/migration/dependency/provider/env/infrastructure changes;
- prompt/QA/report artifacts included explicitly, not historical untracked files.

Mismatch yang mencampur promotion/main atau unrelated code = `BLOCKED`.

## Gate 1 - Claim-by-Claim Diff Review

Trace setiap changed line dan buktikan:

1. request browser tetap strict `{ rppId, section }`;
2. backend memuat RPP authoritative, ownership, dan active TeachingAssignment;
3. PII tetap local-only dan tidak fallback cloud;
4. setiap section meminta JSON exact shape;
5. backend parse + strict validate sebelum audit/return;
6. output API berupa allowed domain patch, bukan raw model text;
7. invalid output tidak membuat audit success atau browser mutation;
8. browser tidak lagi memakai markdown heading/regex heuristics;
9. apply patch tidak menghapus unrelated/manual fields;
10. satu action tetap satu provider attempt.

Temuan penting:

- prompt instruction tanpa parser enforcement = P1;
- parser hanya membersihkan fence tetapi menerima free prose/KD = P1;
- browser masih menebak Kegiatan/Asesmen = P1;
- raw invalid output diaudit sebagai sukses = P1;
- mismatched section dapat menulis field lain = P1.

## Gate 2 - Schema Matrix

Audit section-by-section:

| Section | Required patch | Foundation |
| --- | --- | --- |
| `cp_tp` | `tp[]` only | saved CP |
| `atp` | `atp[]` | saved CP + TP |
| `profil` | `profilUraian` | saved context |
| `sarana` | `sarana`, `target` | saved context |
| `kegiatan` | structured first meeting | saved CP + TP |
| `asesmen` | diagnostik, formatif, sumatif | saved CP + TP |
| `remedial` | pengayaan, remedial | saved context |
| `refleksi` | guru, siswa | saved context |
| `lampiran` | lampiran | saved context |

Untuk setiap section, review:

- exact keys;
- strict unknown-key rejection;
- non-empty/bounded values;
- raw JSON dan outer fenced JSON behavior;
- nested fence/document heading rejection;
- no cross-section mutation;
- normalized audit output.

## Gate 3 - Curriculum Correctness

Buktikan:

- CP tidak pernah ditulis model;
- TP AI selalu usulan dari saved CP;
- ATP tidak membuat TP baru;
- Kegiatan/Asesmen menggunakan CP/TP;
- `Kompetensi Dasar`, `KD`, dan `KI-KD` ditolak dengan boundary yang tidak
  false-positive;
- AI tidak mengklaim hasil belajar yang belum dinilai;
- current authoring 2025/2026+ memakai delapan Dimensi Profil Lulusan;
- historical documents retain old labels/values without silent rewrite;
- official references dipakai secara tepat.

Review all current rendering paths, bukan hanya wizard.

## Gate 4 - Full-Fidelity Rendering

Inspect authoring, rekap, `ModulAjarView`, `RppBoard`, dan KS view:

- all Kegiatan fields visible;
- all three assessment fields visible;
- legacy fallback only when stored;
- no fabricated dimensi/remedial/refleksi;
- academic-year label correct;
- no raw JSON/fence;
- empty state truthful.

WAKA/KS harus menilai content yang sama dengan yang disimpan GURU.

## Gate 5 - LMS dan Browser Findings

LMS:

- success updates row/action immediately;
- failure preserves prior state;
- busy always releases;
- no duplicate request;
- no manual reload required.

Missing foundation:

- stable active-control selector;
- hidden wizard controls do not confuse QA;
- no save/generate/provider when contract says stop.

React `#310`:

- inspect exact reproduction matrix and console timestamps;
- if reproduced, require root-cause fix and regression proof;
- if not reproduced, accept only after all defined attempts are documented with
  clean fresh-console evidence.

## Gate 6 - Tests

Rerun independently:

```powershell
npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/ai-generate.spec.ts src/__tests__/p16-ai-push.spec.ts src/__tests__/rpp.spec.ts src/__tests__/lms.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3-ai-quality-review
npm.cmd --workspace @smk/web run test -- --runTestsByPath src/__tests__/modul-ajar-ai-containment.test.ts src/__tests__/academic.test.ts src/__tests__/rpp-page.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3-ai-quality-review
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
git diff --check
git diff --cached --check
```

Tambahkan seluruh focused test baru dari report ke rerun. Review assertions, bukan
hanya totals.

Wajib ada negative tests untuk:

- free markdown;
- extra/missing keys;
- nested fence;
- KD/KI-KD;
- wrong section patch;
- invalid output no audit/no mutation;
- foundation zero provider;
- PII no cloud;
- LMS failure state;
- current/historical profile behavior.

## Gate 7 - Local Browser Evidence

Review screenshot/network/console PII-free:

- generated Kegiatan/Asesmen fields;
- close/reopen persistence;
- WAKA/KS full rendering;
- missing TP zero request;
- immediate LMS status;
- desktop/mobile;
- React `#310` matrix.

Local mock evidence cukup untuk code gate. Jangan menganggapnya staging/provider
quality sign-off.

## Report

Buat:

`docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REVIEW-2026-07-31.md`

Format:

1. findings dahulu, P0/P1/P2, dengan file:line;
2. claim matrix;
3. commands dan exact totals;
4. browser evidence review;
5. scope/hard-boundary audit;
6. residual external risks;
7. confidence;
8. verdict.

`APPROVED FOR EXPLICIT GIT PACKAGING` hanya bila:

- no unresolved in-scope P0/P1/P2;
- structured output and curriculum contracts are enforced;
- reviewer rendering and LMS state are operational;
- React finding has defined closure;
- all checks pass;
- no staged/live action.

After approval, hand off langsung ke:

`docs/audits/PROMPT-ARCHITECT-DELIVERY-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
````

## Confidence Level

0.97.

## Risk Notes

- Green tests tidak membuktikan stochastic provider quality.
- Clean output sample tidak membuktikan strict invalid-output rejection.
- Current-year label tidak boleh merusak historical documents.
- Reviewer fallback text dapat menjadi data fabrication meski tampak membantu.
