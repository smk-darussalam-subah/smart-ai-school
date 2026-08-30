# Wave 9 Checkpoint A External Deck Contract Follow-up

Tanggal: 2026-08-30

## Verdict Executor

`READY FOR INDEPENDENT SOURCE REVIEW`

Checkpoint B dihentikan sebelum screenshot atau artefak final dibuat karena preflight menemukan
ketidaksesuaian antara prompt V2 dan registry frozen. Prompt mewajibkan deck keempat untuk Orang
Tua dan Industri, sedangkan `deck.family` hanya memuat Orang Tua.

Freeze berikut dinyatakan tidak berlaku untuk produksi artefak:

- evidence staging SHA: `068ffe6779213dc7be8a17a41732caa1e8f00ef5`;
- frozen application SHA: `de2d5b89929c385a93befc14b750c6798b491a11`;
- frozen application tree: `765f1316e08c52d5c6c57228c80e8f03961786a4`.

Tidak ada screenshot provisional, PDF, PPTX, atau adoption package yang digunakan atau dibuat.

## Root Cause

`HELP_DECK_CONTENT_MAP` mendefinisikan deck keempat sebagai audience Orang Tua dengan topik
keluarga saja. `shot.industry.desktop` juga tidak mendaftarkan deck tersebut sebagai consumer.
Akibatnya generator yang mengikuti registry kanonis akan menghasilkan deck yang tidak memenuhi
Prompt Wave 9 V2.

## Perbaikan

1. Audience `deck.family` diubah menjadi `Orang Tua dan Industri`.
2. Topik `topic.career-industry` ditambahkan ke content map deck.
3. `shot.industry.desktop` ditambahkan sebagai evidence consumer deck.
4. Deck eksternal diikat ke `SUPER_ADMIN` sebagai fasilitator internal, bukan self-service
   audience. Ini mencegah satu audience eksternal mengunduh screenshot workflow audience lain.
5. Regresi mengunci audience, topic coverage, facilitator authority, dan screenshot Industri.

ID deck dipertahankan agar tidak memutus referensi stabil. Perubahan tidak menyentuh product
workflow, API, schema, dependency, infrastructure, secret, staging, atau production.

## Verifikasi

- Focused Help: 1 suite / 31 test lulus.
- Web lint: lulus tanpa warning atau error source.
- `git diff --check`: lulus.
- Staged files: 0.

Type-check worktree tidak diklaim lulus. Percobaan pertama memakai junction dependency root yang
tidak menyediakan tipe React workspace. Setelah tipe web tersedia, pemeriksaan mencapai package
`@smk/types` build lama dan gagal pada export `AssessmentQuestion` yang tidak terkait delta.
Junction sementara sudah dibersihkan. CI pada packaging gate harus membangun workspace packages
secara berurutan sebelum type-check web.

## Manifest Reviewer

- `apps/web/src/lib/help/help-evidence.ts`
- `apps/web/src/__tests__/help-system.test.ts`
- `docs/audits/WAVE9-CHECKPOINT-A-EXTERNAL-DECK-CONTRACT-FOLLOWUP-2026-08-30.md`

## Gate Berikutnya

Independent Source Reviewer harus memverifikasi:

1. deck keempat memenuhi audience Orang Tua dan Industri;
2. consumer-authority matrix tetap tidak memiliki incompatibility;
3. seluruh focused Help test lulus;
4. tidak ada product behavior change.

Jika reviewer menyetujui source, lakukan explicit Git packaging pada manifest yang disetujui,
CI, promosi ke staging, affected browser matrix, dan exact-SHA freeze baru. Checkpoint B baru
boleh dimulai ulang setelah freeze baru disetujui. Tidak ada commit, push, PR, deploy, atau
branch-protection change pada follow-up ini.
