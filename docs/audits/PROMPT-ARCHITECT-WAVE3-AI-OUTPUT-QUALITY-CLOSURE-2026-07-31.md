# Prompt Architect - Wave 3 AI Output Quality Closure

Tanggal: 2026-07-31

Status sumber: `FOLLOW-UP REQUIRED BEFORE AI PRODUCTION SIGN-OFF`.

## Keputusan

Pekerjaan ini tetap bagian dari Wave 3. Jangan membuat AI-0C, Wave 3.1, atau wave
baru. Temuan staging dikembalikan ke branch Wave 3 yang sama sampai implementasi,
review, delivery, dan re-QA staging lulus.

Provider tetap:

- OpenAI `gpt-4.1-mini` untuk konteks non-PII;
- Ollama untuk embedding dan rute lokal ketika PII terdeteksi.

Masalah yang ditutup adalah kontrak kualitas dan bentuk output, bukan pemilihan
provider.

## Urutan Prompt Pack

1. Implementasi lokal:
   `PROMPT-ARCHITECT-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
2. Independent review:
   `PROMPT-ARCHITECT-REVIEW-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
3. Git, CI, staging, dan re-QA:
   `PROMPT-ARCHITECT-DELIVERY-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`
4. Final staging review:
   `PROMPT-ARCHITECT-FINAL-STAGING-REVIEW-WAVE3-AI-OUTPUT-QUALITY-CLOSURE-2026-07-31.md`

Finding in-scope kembali ke Executor pada branch dan Wave 3 yang sama. Gate adalah
checkpoint bukti, bukan alasan menunda pekerjaan.

## Draft Prompt

```md
Perbaiki prompt AI agar tidak menghasilkan markdown dan istilah KD. Tambahkan test,
lalu perbaiki refresh LMS.
```

## Kritik Draft

1. Prompt-only tidak cukup. Model masih dapat melanggar instruksi dan browser saat ini
   tetap menebak markdown dengan regex.
2. Normalisasi hanya Kegiatan/Asesmen meninggalkan parser bebas pada CP/TP, sarana,
   remedial, refleksi, profil, dan lampiran.
3. CP resmi tidak boleh dibuat atau ditulis ulang oleh model. AI hanya boleh membantu
   menyusun TP dari CP yang telah disimpan guru.
4. Output yang gagal schema atau memakai terminologi kurikulum lama harus ditolak
   sebelum audit sukses dan sebelum mutate form, bukan diam-diam dibersihkan secara
   semantik.
5. Read-only reviewer saat ini belum menampilkan seluruh field Kegiatan terstruktur
   dan masih memiliki fallback content yang dapat terlihat seperti data nyata.
6. UI masih memakai enam `Profil Pelajar Pancasila`, padahal tahun ajaran 2025/2026
   dan sesudahnya memakai delapan `Dimensi Profil Lulusan`.
7. Draft tidak menutup missing-TP browser proof, LMS row staleness, React `#310`
   reproduction, Git/CI, deployed SHA, atau targeted staging QA.

## Prompt Final untuk Executor

````md
Anda adalah Executor untuk DIIS `smart-ai-school`.

## Misi

Selesaikan **Wave 3 AI Output Quality Closure** sebagai satu batch implementasi lokal.

Hasil yang wajib:

1. seluruh endpoint bantuan AI per-section mengembalikan patch JSON terstruktur yang
   telah divalidasi backend;
2. browser tidak lagi mengurai markdown bebas menjadi field domain;
3. Kegiatan dan Asesmen bersih, field-native, selaras CP/TP, dan tidak memakai
   `Kompetensi Dasar`/`KI-KD`;
4. CP tersimpan tetap authoritative dan tidak boleh dibuat ulang oleh AI;
5. delapan Dimensi Profil Lulusan berlaku untuk draft 2025/2026 dan sesudahnya,
   sementara dokumen historis tetap terbaca;
6. reviewer melihat seluruh content terstruktur secara jujur;
7. publish/unpublish/archive LMS langsung memperbarui status row;
8. missing-foundation dan React `#310` memiliki bukti yang tegas;
9. seluruh test, local browser QA, dan report selesai sebelum Reviewer.

Pada sesi ini jangan stage, commit, push, membuat PR, merge, promote, deploy, mengubah
staging/production env, mengganti provider/model, menjalankan SQL, atau mengubah
Keycloak. Handoff Git/staging memakai prompt terpisah dalam pack yang sama.

## Konteks Wajib Dibaca

1. `C:\Users\USER\Documents\Claude\Projects\DIIS\AGENTS.md`
2. `C:\Users\USER\Documents\Claude\Projects\DIIS\docs\AI_CONTEXT.md`
3. repo `AGENTS.md`
4. `docs/WAYS-OF-WORKING.md`
5. `docs/decision-log.md`
6. `docs/audits/WAVE3-MODUL-AJAR-AI-RELIABILITY-CURRICULUM-INTELLIGENCE-REVIEW-HANDOFF-2026-07-27.md`
7. `docs/audits/WAVE-AI0A-MODUL-AJAR-CODE-CONTAINMENT-2026-07-27.md`
8. `docs/audits/WAVE-AI0A-MODUL-AJAR-CODE-CONTAINMENT-FOLLOWUP-REREVIEW-2026-07-30.md`
9. `docs/audits/WAVE-AI0B-MODUL-AJAR-OPERATIONAL-PROVIDER-EVIDENCE-2026-07-27.md`
10. `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-PLAN-2026-07-31.md`
11. `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-REPORT-2026-07-31.md`
12. source dan tests aktual yang disebut di bawah.

Rujukan kurikulum resmi:

- `https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513313951257-Pengertian-Capaian-Pembelajaran-CP`
- `https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52513306767897-Perumusan-Tujuan-Pembelajaran-TP-dan-Penyusunan-Alur-Tujuan-Pembelajaran-ATP`
- `https://pusatinformasi.rumahpendidikan.kemendikdasmen.go.id/hc/id/articles/52478137936409-Komponen-Perangkat-Ajar`
- `https://jdih.kemendikdasmen.go.id/sjdih/siperpu/dokumen/salinan/Permendikdasmen_No_13_Tahun_2025_ttg_Perubahan_atas_Permendikbudristek_No_12_Tahun_2024_ttg_Kurikulum_pada_Pendidikan_Anak_Usia_Dini_Jenjang_Dikdasmen.pdf`

Gunakan source aktual sebagai authority bila laporan lama berbeda.

## Gate 0 - Baseline Bersih

Current canonical worktree berada pada promotion branch dan memiliki banyak historical
untracked artifacts. Jangan mengimplementasikan di sana.

```powershell
cd C:\Users\USER\Documents\Claude\Projects\DIIS
git -C smart-ai-school fetch origin develop staging main
git -C smart-ai-school rev-parse origin/develop
git -C smart-ai-school rev-parse origin/staging
git -C smart-ai-school rev-parse origin/main
git -C smart-ai-school status --short --branch
```

Buat dedicated worktree dari `origin/develop` terkini:

```powershell
git -C smart-ai-school worktree add -b fix/wave3-ai-output-quality-20260731 smart-ai-school-wave3-ai-quality origin/develop
```

Jika branch/worktree sudah ada, inspect dan reuse hanya bila benar-benar branch task
ini. Jangan delete/reset worktree yang memiliki perubahan.

Expected baseline pada saat prompt ditulis:

- `origin/develop`: `77fb7ef6875bce75cf15dba9c62017d78db6d1c1`
- `origin/staging`: `7902126691247dcd0e9e41db397c43f9baea17e8`
- `origin/main`: `382792b06a070c217c14afe1c9ad6f808cd62131`

Jika refs berubah, rekam SHA baru dan pastikan branch tetap berasal dari current
`origin/develop`. Jangan cherry-pick PR `#418` atau promotion branch; provider source
sudah ada di `develop`.

Salin hanya enam audit inputs berikut dari canonical worktree ke dedicated worktree
bila belum tracked di baseline:

- QA plan;
- QA report;
- empat prompt pack Wave 3 quality closure.

Gunakan explicit `Copy-Item -LiteralPath`; jangan copy seluruh `docs/audits`, `.tmp`,
atau historical untracked artifacts.

## Gate 1 - Trace dan Fixed Plan

Inspect minimum:

- `apps/api/src/ai/ai-generate.service.ts`
- `apps/api/src/ai/dto/generate.dto.ts`
- `apps/api/src/__tests__/ai-generate.spec.ts`
- `apps/api/src/__tests__/p16-ai-push.spec.ts`
- `apps/api/src/__tests__/rpp.spec.ts`
- `apps/web/src/app/dashboard/akademik/actions.ts`
- `apps/web/src/app/dashboard/akademik/_components/ModulAjarForm.tsx`
- `apps/web/src/app/dashboard/akademik/_components/modul-ajar-ai-containment.ts`
- `apps/web/src/app/dashboard/akademik/_components/guru-types.ts`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx`
- `apps/web/src/components/academic/ModulAjarView.tsx`
- `apps/web/src/app/dashboard/rpp/_components/RppBoard.tsx`
- `apps/web/src/app/dashboard/akademik/_components/KsWorkspace.tsx`
- focused web tests;
- `docs/architecture/academic-lifecycle.md`.

Buat before/after map untuk:

1. provider text -> backend parser -> normalized patch -> audit -> browser apply;
2. foundation rules per section;
3. current/historical profile framework;
4. teacher authoring -> WAKA/KS read-only rendering;
5. LMS status action -> visible row state;
6. React `#310` reproduction path.

Tulis self-critique dan fixed plan sebelum edit. Setelah plan terbentuk, langsung
implementasikan. Jangan berhenti untuk optional naming/layout preference.

## Hard Boundaries

- Tidak ada Prisma schema, migration, dependency, queue, retry, automatic fallback,
  provider, model, rate-limit, nginx, Docker, VPS, atau secret change.
- Browser request tetap strict `{ rppId, section }`.
- Ownership, active TeachingAssignment, PII routing, one-provider-attempt, audit
  redaction, dan legacy endpoint `410` tidak boleh melemah.
- Tidak ada full-document generation atau `Generate Semua`.
- AI adalah draft assistant; guru tetap mengedit, menyimpan, dan submit.
- Tidak ada raw model response, prompt, secret, atau real PII di report/test fixture.
- Jangan silently mengganti makna `KD` menjadi `CP`. Output yang tidak valid harus
  fail-closed sebagai `AI_OUTPUT_INVALID`.

## Scope A - Uniform Structured Patch Contract

Backend harus menjadi satu-satunya parser dan validator model output.

Ubah contract response sehingga `output` adalah patch domain terstruktur, bukan
markdown/string bebas:

```ts
type SectionPatch =
  | { tp: string[] }
  | { atp: Array<{ tpRef: string; indikator: string }> }
  | { profilUraian: string }
  | { sarana: string; target: string }
  | { kegiatan: Array<{
      pertemuan: string;
      pendahuluan: string;
      inti: string;
      penutup: string;
      diferensiasi?: string;
    }> }
  | {
      asesmenDiagnostik: string;
      asesmenFormatif: string;
      asesmenSumatif: string;
    }
  | { pengayaan: string; remedial: string }
  | { refleksiGuru: string; refleksiSiswa: string }
  | { lampiran: string };
```

Ketentuan:

1. Buat section-specific strict Zod schemas di API.
2. Prompt setiap section meminta JSON only dengan exact keys. Tidak ada markdown,
   prose di luar JSON, heading, atau code fence.
3. Parser boleh membuka satu outer fenced `json` wrapper sebagai robustness, lalu
   wajib JSON parse dan schema validate.
4. Free-form markdown, missing key, extra key, empty required value, wrong type,
   oversized value, nested code fence, dan full-document heading harus ditolak.
5. Response dan `AiGeneration.output` hanya memakai patch yang sudah dinormalisasi.
6. Audit write terjadi setelah validation sukses. Invalid output tidak membuat audit
   success row dan tidak mutate browser.
7. Tidak ada targeted repair call atau provider retry.
8. Tambahkan bounded lengths dan array limits sesuai kapasitas field existing.

Browser:

- hapus `parseCpTp`, `parseAsesmen`, `parseDualSection`, heading regex, paragraph
  guessing, dan markdown-to-domain heuristics;
- validate patch defensively berdasarkan requested section;
- reject mismatched keys/shape;
- apply hanya keys yang diizinkan section tersebut;
- pertahankan manual fields di section lain;
- untuk Kegiatan, merge hasil ke pertemuan pertama dan jangan menghapus pertemuan
  lain yang sudah dibuat guru;
- invalid patch tidak boleh menampilkan success state.

## Scope B - Foundation dan Kurikulum

### CP, TP, ATP

- CP tersimpan adalah authoritative input. AI tidak boleh membuat, mengganti, atau
  mengaku mengambil CP resmi.
- Bantuan pada langkah CP/TP hanya menyusun usulan TP dari CP yang sudah disimpan.
- `cp_tp` memerlukan CP non-empty dan hanya boleh menghasilkan `{ tp }`.
- `atp`, `kegiatan`, dan `asesmen` memerlukan CP serta minimal satu TP.
- Foundation invalid berhenti sebelum provider dan audit.
- ATP hanya mengurutkan TP tersimpan; tidak membuat TP baru.

Prompt Kegiatan wajib:

- memakai subject, fase, kelas, jurusan, CP, TP, model, dan alokasi waktu yang
  di-allowlist backend;
- menghasilkan tindakan guru dan peserta didik yang konkret;
- memisahkan pendahuluan, inti, penutup, dan diferensiasi;
- tidak mengulang metadata Modul Ajar.

Prompt Asesmen wajib:

- selaras dengan TP tersimpan;
- membedakan diagnostik, formatif, dan sumatif;
- menyebut bukti/instrumen/kriteria secara ringkas dan dapat diedit;
- tidak memakai `Kompetensi Dasar`, `KD`, atau `KI-KD`;
- tidak mengklaim siswa telah mencapai hasil yang belum dinilai.

Validator curriculum vocabulary minimal menolak:

- `Kompetensi Dasar`;
- pola `KI/KD`, `KI-KD`, atau padanan jelas;
- heading dokumen penuh seperti `# Modul Ajar`/`# Rencana Asesmen`;
- code fence di dalam field.

Jangan blacklist substring umum yang menimbulkan false positive. Tambahkan tests case
insensitive dan boundary.

### Delapan Dimensi Profil Lulusan

Untuk academic year `2025/2026` dan sesudahnya, gunakan label
`Dimensi Profil Lulusan` dan delapan pilihan:

1. Keimanan dan ketakwaan terhadap Tuhan Yang Maha Esa
2. Kewargaan
3. Penalaran kritis
4. Kreativitas
5. Kolaborasi
6. Kemandirian
7. Kesehatan
8. Komunikasi

Implementasikan pure year resolver yang dites. Dokumen sebelum 2025/2026 tetap
menampilkan label/nilai historis. Stored legacy values:

- tetap dapat dibaca;
- tidak dihapus atau ditulis ulang otomatis;
- tidak menjadi pilihan default untuk draft current year;
- diberi presentation yang jujur bila muncul pada dokumen historis.

Update konsisten:

- authoring wizard;
- rekap wizard;
- AI profile prompt;
- `ModulAjarView`;
- RPP reviewer board;
- KS review view;
- lifecycle architecture documentation;
- focused tests.

Jangan mengubah marketing/public copy yang tidak merender dokumen kurikulum.

## Scope C - Full-Fidelity Reviewer Rendering

`ModulAjarView` dan KS review harus:

- menerima academic year untuk menentukan profile label;
- menampilkan pendahuluan, inti, penutup, dan diferensiasi, bukan hanya
  `deskripsi` legacy;
- menampilkan asesmen diagnostik, formatif, dan sumatif;
- tetap membaca `deskripsi`, `asesmen`, dan `refleksi` legacy bila structured field
  tidak ada;
- tidak membuat fallback content palsu seperti dimensi, remedial, atau refleksi yang
  tidak tersimpan;
- menampilkan empty state jujur bila bagian kosong;
- tidak menampilkan raw JSON/code fence.

Authoring, WAKA review, dan KS review harus membaca data yang sama tanpa kehilangan
field.

## Scope D - LMS Status Tidak Stale

Setelah publish, unpublish, atau archive sukses:

- row status dan actions langsung berubah tanpa manual browser reload;
- failure mempertahankan status lama dan menampilkan error;
- busy state selalu dilepas;
- duplicate click tetap tertahan;
- server revalidation tetap boleh digunakan, tetapi UI tidak boleh menunggu reload
  manual.

Gunakan existing React/Next patterns. Jangan menambah state library/dependency.

## Scope E - Missing Foundation dan React `#310`

### Missing foundation

- Tambahkan stable accessible selector atau `data-testid` pada CTA AI aktif.
- Hidden section controls tidak boleh membuat locator browser ambigu.
- Tambahkan focused test bahwa Kegiatan/Asesmen tanpa TP berhenti sebelum save/generate
  sesuai contract yang disepakati.
- Browser QA harus membuktikan zero generation request.

### React `#310`

Jalankan dedicated local development reproduction:

1. fresh GURU login/load;
2. desktop open/close wizard tiga kali;
3. mobile `390x844`, pindah step, open/close tiga kali;
4. role/session switch yang sama dengan evidence staging bila fixture tersedia;
5. capture console timestamp dan route.

Jika reproducible:

- gunakan dev stack/source map;
- temukan hook-order/state lifecycle root cause;
- perbaiki pada branch ini;
- tambah regression proof dan ulangi matrix.

Jika tidak reproducible setelah matrix tersebut:

- catat exact attempts dan clean-console evidence;
- tutup finding sebagai `NOT REPRODUCED WITH DEFINED MATRIX`, bukan residual tanpa
  tindakan.

## Test Contract

API wajib membuktikan:

1. semua section menghasilkan exact structured patch;
2. valid raw JSON dan outer fenced JSON dinormalisasi;
3. free markdown, extra/missing keys, empty fields, nested fence, document heading,
   `Kompetensi Dasar`, dan `KI/KD` ditolak;
4. invalid output: no audit write;
5. valid output: audit stores normalized patch and correct model;
6. CP tetap tidak berubah;
7. foundation failure: zero provider/audit;
8. ownership/TeachingAssignment/PII local-only tetap lulus;
9. satu user action tetap satu provider attempt;
10. DTO extra browser fields tetap ditolak.

Web wajib membuktikan:

1. exact patch per section diterapkan ke correct fields;
2. mismatched/string/free-form output ditolak;
3. Kegiatan first-row merge mempertahankan later manual rows;
4. Asesmen mengisi tiga target field tanpa raw wrapper;
5. failure tidak mutate body atau success state;
6. foundation CTA/selector dan zero generate;
7. year resolver current versus historical;
8. legacy profile values tetap readable;
9. reviewer view model menampilkan seluruh structured Kegiatan/Asesmen tanpa fake
   fallback;
10. LMS success updates expected status dan failure preserves old status.

Gunakan existing Jest node harness dan pure helpers. Jangan menambah testing library
atau dependency.

Commands minimum:

```powershell
npm.cmd --workspace @smk/api run test -- --runTestsByPath src/__tests__/ai-generate.spec.ts src/__tests__/p16-ai-push.spec.ts src/__tests__/rpp.spec.ts src/__tests__/lms.spec.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3-ai-quality
npm.cmd --workspace @smk/web run test -- --runTestsByPath src/__tests__/modul-ajar-ai-containment.test.ts src/__tests__/academic.test.ts src/__tests__/rpp-page.test.ts --runInBand --cacheDirectory=.tmp/jest-cache-wave3-ai-quality
npm.cmd --workspace @smk/api run type-check
npm.cmd --workspace @smk/web run type-check
npm.cmd --workspace @smk/api run lint
npm.cmd --workspace @smk/web run lint
npm.cmd --workspace @smk/api run build
npm.cmd --workspace @smk/web run build
```

Tambahkan test file baru ke command focused bila dibuat.

Static checks:

```powershell
rg -n "Kembalikan markdown|parseCpTp|parseAsesmen|parseDualSection|splitNamedSection" apps/api/src/ai apps/web/src/app/dashboard/akademik
rg -n "Kompetensi Dasar|KI/KD|Profil Pelajar Pancasila|Profil Lulusan" apps/api/src apps/web/src docs/architecture
rg -n "JSON.stringify\\(body\\)|context: z.string|Generate Semua" apps/api/src/ai apps/web/src/app/dashboard/akademik
rg -n "OPENAI_API_KEY|sk-[A-Za-z0-9_-]{16,}" apps/api/src apps/web/src docs/audits
git diff --check
git diff --cached --check
```

Interpretasikan hasil secara semantik. Tests/historical compatibility boleh menyebut
terminologi lama; current authoring/prompt path tidak boleh.

## Local Browser QA Wajib

Jalankan API/web branch lokal dengan disposable synthetic fixture:

1. GURU membuka current-year Modul Ajar.
2. Isi CP dan TP, save, generate Kegiatan dan Asesmen.
3. Pastikan field terpisah terisi dan tidak ada code fence/metadata/KD.
4. Close/reopen dan pastikan patch tersimpan setelah guru save.
5. Missing TP membuktikan zero generation request.
6. WAKA/KS read-only view menampilkan semua structured fields.
7. Publish/unpublish/archive LMS memperbarui row tanpa reload manual.
8. Jalankan React `#310` matrix.
9. Desktop `1440x900` dan mobile `390x844`, tanpa overlap.
10. Capture screenshot PII-free dan console/network summary.

Local provider tidak wajib dipanggil. Untuk deterministic QA, boleh gunakan mocked
provider/API fixture. Jangan memakai real staging credential pada local runtime.

## Report Wajib

Buat:

`docs/audits/WAVE3-AI-OUTPUT-QUALITY-CLOSURE-REMEDIATION-2026-07-31.md`

Isi:

1. baseline branch/SHA/worktree;
2. source/report/official references;
3. before/after contract;
4. self-critique dan fixed plan;
5. exact structured schemas per section;
6. foundation and curriculum rules;
7. current/historical profile behavior;
8. reviewer rendering closure;
9. LMS refresh behavior;
10. React `#310` result;
11. exact files changed;
12. focused/full verification totals;
13. local browser evidence;
14. static/secret checks;
15. explicit no schema/dependency/provider/env/infrastructure/live/Git declaration;
16. unresolved genuine external blockers only;
17. verdict `READY FOR INDEPENDENT REVIEW` atau `BLOCKED`.

## Final Answer

Laporkan ringkas:

- verdict;
- output/curriculum contracts yang ditutup;
- UI/reviewer/LMS closures;
- test/build/browser totals;
- React `#310` result;
- files changed;
- hard-boundary confirmation;
- link report.

Jangan menyebut Wave 3 complete. Jika Reviewer menemukan finding in-scope, perbaiki
langsung pada branch ini, rerun affected/full gates, lalu re-review.
````

## Confidence Level

0.97.

Root cause telah terkonfirmasi di source: backend hanya menormalisasi ATP, section lain
dikembalikan sebagai string, dan browser memakai parser heuristik. JSONB existing cukup
untuk patch terstruktur sehingga tidak diperlukan schema/migration/dependency baru.

## Risk Notes

- Jangan menganggap code-fence stripping sebagai curriculum validation.
- Jangan membiarkan prompt menjadi satu-satunya enforcement.
- Jangan membuat CP resmi dari model.
- Jangan silently rewrite dokumen historis.
- Jangan menyimpan raw invalid model output sebagai audit sukses.
- Jangan memperbaiki React `#310` tanpa reproduksi/source evidence.
- Jangan merge PR `#418` sebelum Wave 3 quality closure melewati staging sign-off.
