# Wave AI-0A Modul Ajar Code Containment Follow-up Re-review

Tanggal: 2026-07-30

## Verdict

**CODE CONTAINED - READY FOR AI-0B OPERATIONAL GATE**

Tidak ditemukan P0, P1, atau P2 yang belum terselesaikan dalam scope AI-0A.
Verdict ini bukan staging sign-off, bukan approval deploy, dan belum membuktikan
provider/runtime atau kualitas kurikulum hasil AI.

## Follow-up Closure

### DTO strict - closed

- `GenerateRppStepSchema` memakai `.strict()`.
- Payload valid tetap hanya berisi `rppId` dan `section`.
- Test membuktikan `context`, `rppBody`, dan browser-declared `subject` ditolak
  sebagai `unrecognized_keys`.
- Controller tetap memakai schema tersebut melalui `ZodPipe`.

### Legacy dead actions - closed

- `Generate Materi AI` di Modul LMS dihapus.
- `Generate Soal AI` di Modul LMS dihapus.
- `Generate AI` di Bank Soal dihapus.
- Empty-state Bank Soal tidak lagi menyarankan command AI.
- Import, handler, loading state, dan raw-context Server Actions yang tidak lagi
  memiliki caller sudah dibersihkan.
- Endpoint backend legacy tetap `410 AI_ENDPOINT_DISABLED` sebagai
  defense-in-depth untuk klien lama.

### TeachingAssignment negative proof - closed

Test baru membuktikan RPP milik guru tanpa TeachingAssignment aktif:

- ditolak sebelum generation;
- local gateway tidak dipanggil;
- cloud gateway tidak dipanggil;
- audit generation tidak ditulis.

### Save rejection cleanup - closed

`persistDraftForAi()` sekarang memakai `try/catch/finally`:

- rejection menandai save state sebagai `error`;
- `saving` selalu dilepas melalui `finally`;
- single-flight guard juga dilepas sehingga guru dapat mencoba kembali;
- test helper membuktikan attempt berikutnya tidak terkunci.

## Independent Verification

Reviewer menjalankan ulang:

```text
API focused:
3 suites / 39 tests passed
  - ai-generate.spec.ts
  - p16-ai-push.spec.ts
  - rpp.spec.ts

Web focused:
1 suite / 8 tests passed

API type-check: passed
Web type-check: passed
API lint: passed
Web lint: passed
  Existing Next lint deprecation/plugin notice only.

Target and full git diff check: passed according to executor report; reviewer
inspection found no staged changes.
```

Static inspection juga membuktikan tidak ada caller frontend tersisa untuk
`generate-questions`, `generate-material`, atau `generate-atp`. Hanya endpoint
backend fail-closed yang dipertahankan.

## Scope Integrity

Diff AI-0A tetap terbatas pada:

- ID-based Modul Ajar AI request;
- server-side ownership, assignment, prompt allowlist, dan PII routing;
- save-first single-section UI;
- removal of legacy dead actions;
- focused tests dan audit report.

Tidak ada schema, migration, dependency, infrastructure, environment, VPS,
Keycloak, Appointment Governance, RPP review authority, commit, push, PR, atau
deploy change.

## Next Gate

Lanjutkan ke **AI-0B operational provider/runtime gate** sebelum Git packaging
dan deployment AI-0A.

AI-0B wajib membuktikan tanpa mencetak secret:

1. provider dan model efektif pada target runtime;
2. local Ollama gateway dan model yang diperlukan tersedia;
3. cloud credential, bila digunakan, valid dan tidak bocor ke log;
4. PII request hanya mencapai local gateway;
5. local failure pada PII tidak memanggil cloud;
6. timeout, auth failure, unavailable, invalid output, dan rate limit dipetakan
   ke error contract yang benar;
7. audit menyimpan redacted prompt/output dan provenance yang jujur;
8. tidak ada retry/fallback tersembunyi.

Setelah AI-0B direview:

1. package AI-0A/AI-0B dengan explicit file list;
2. commit, push, PR, dan CI;
3. promote ke staging sesuai Gitflow;
4. jalankan browser QA Wave 3 terintegrasi dengan evidence matrix terpisah untuk
   Modul Ajar AI, RPP lifecycle, GURU ownership, WAKA reviewer, dan SISWA
   visibility.

Jangan menjalankan browser QA AI terhadap source lokal yang belum menjadi
deployed SHA lalu menggunakannya sebagai staging proof.

## Residual Risks Outside AI-0A

- provider/model staging belum diverifikasi;
- timeout dan rate-limit runtime belum dibuktikan;
- browser behavior belum diuji;
- output quality, official curriculum grounding, subject-major context, dan
  pedagogical validation tetap scope wave lanjutan;
- model audit label perlu dibandingkan dengan provider/model runtime aktual.

## Confidence

**0.98**

Keyakinan berasal dari actual diff review, strict-schema proof, negative
ownership/assignment tests, dead-action removal, focused test rerun, type-check,
lint, dan scope inspection.
