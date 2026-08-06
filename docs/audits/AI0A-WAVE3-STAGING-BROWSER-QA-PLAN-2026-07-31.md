# AI-0A and Wave 3 Staging Browser QA Plan

Tanggal: 2026-07-31

## Status

Planning only. QA browser belum dieksekusi dalam dokumen ini.

## Informasi Yang Dikumpulkan

### Keputusan Provider

- Keputusan final Director/operator: OpenAI `gpt-4.1-mini` adalah provider
  chat/generate non-PII.
- Ollama tetap dipertahankan untuk embedding dan rute lokal ketika prompt
  mengandung PII.
- Runtime staging dan production sudah dikoreksi pada 2026-07-30.
- Source hardening PR #416 sudah merged ke `develop`, PR #417 sudah merged ke
  `staging`, dan PR #418 sedang disiapkan/promosi ke `main`.

### Evidence Runtime Terkini

- Staging deployed SHA setelah PR #417: `7902126691247dcd0e9e41db397c43f9baea17e8`.
- Staging effective env: `AI_PROVIDER=openai`, `OPENAI_CHAT_MODEL=gpt-4.1-mini`.
- Staging OpenAI smoke pasca-deploy: HTTP 200, marker matched, 1581 ms.
- Production effective env: `AI_PROVIDER=openai`, `OPENAI_CHAT_MODEL=gpt-4.1-mini`.
- Production OpenAI smoke terbaru: HTTP 200, marker matched, 1174 ms.
- Secret values tidak dicetak.

### Kontrak AI-0A

- Browser hanya boleh meminta `rppId` dan satu `section`.
- Backend memuat RPP tersimpan sebagai authoritative context.
- Backend membuktikan ownership guru dan active `TeachingAssignment` sebelum
  provider call.
- Prompt dibangun dari allowlist field RPP, bukan raw browser `body/context`.
- PII terdeteksi harus memakai local gateway; tidak boleh fallback ke cloud.
- Non-PII memakai provider aktif, saat ini OpenAI.
- Satu klik menghasilkan satu request generation; tidak ada Generate Semua,
  retry otomatis, atau fallback otomatis pada AI-0A.

### Kontrak Wave 3

- W3-01: structured Modul Ajar survive save/reload.
- W3-02: hasil AI benar-benar masuk ke field target, bukan toast sukses palsu.
- W3-03: Simpan Draft adalah server save nyata.
- W3-04: RPP review one-step konsisten; WAKA dapat review/approve berdasarkan
  appointment/effective role, dua tahap tetap deferred.
- W3-05: AI egress PII teredaksi dan audit tidak menyimpan raw PII.
- W3-06: RPP/LMS create memvalidasi ownership dan TeachingAssignment.
- W3-07: teacher attendance memakai hari sekolah Asia/Jakarta.

### Source Signals Terkini

- `GenerateRppStepSchema` sudah `.strict()`.
- Legacy AI endpoints tetap 410 sebagai defense-in-depth.
- Legacy AI buttons di LMS/question-bank sudah dihapus menurut review follow-up.
- LMS reviewer role kini mencakup `WAKA_KURIKULUM`, tetapi write path tetap
  GURU-owned dan tidak memberi WAKA broad mutation.

## Draft Plan Awal

1. Verify staging still deployed at expected SHA and provider remains OpenAI.
2. Login as PII-safe GURU.
3. Create a Modul Ajar draft with non-PII synthetic content.
4. Run AI generation on representative sections.
5. Submit RPP, login WAKA, review/approve, verify LMS draft appears.
6. Login SISWA, verify published/visible LMS path.
7. Test negative roles.
8. Capture screenshots and produce final report.

## Kritik Terhadap Draft

1. Draft belum memisahkan AI containment, Wave 3 core, LMS, and role/RBAC
   evidence. Jika satu skenario gagal, akar masalah dapat kabur.
2. Draft belum membuktikan save-first dengan network evidence: create/update
   RPP harus terjadi sebelum `generate-rpp-step`.
3. Draft belum menguji missing TP zero-provider-call dan PII local-only route.
4. Draft terlalu cepat submit/approve; perlu test draft close/reopen/refresh
   sebelum lifecycle review.
5. Draft belum punya quality rubric untuk output AI. Provider 200 belum berarti
   hasil pedagogis valid.
6. Draft belum mengukur durasi per section dan belum menilai risiko penggunaan
   massal guru.
7. Draft belum membedakan expected 403/410 dari unexplained 4xx/5xx.
8. Draft belum menetapkan data fixture PII-safe dan cleanup/containment.
9. Draft belum punya browser responsive/mobile spot check.
10. Draft belum punya stop condition untuk secret leak, production mutation, atau
    unexpected role elevation.

## Fixed Plan

### Phase 0 - Preflight Non-Browser

1. Verify deployed staging SHA and container health.
2. Verify effective `AI_PROVIDER=openai` and `OPENAI_CHAT_MODEL=gpt-4.1-mini`.
3. Run direct OpenAI smoke from `smk-staging-api`.
4. Check application logs for recent secret/synthetic prompt marker leakage.
5. Identify or prepare PII-safe staging accounts:
   - GURU with active TeachingAssignment;
   - WAKA/Kurikulum with active appointment/effective reviewer access;
   - SISWA in matching class;
   - negative role account if available.

### Phase 1 - Browser Setup And Baseline

1. Use staging: `https://staging.smkdarussalamsubah.sch.id`.
2. Open authenticated browser session only after this plan is accepted.
3. Capture browser console/network baseline before actions.
4. Confirm no active session uses production URL.

### Phase 2 - GURU Modul Ajar AI-0A

1. Login as PII-safe GURU.
2. Open `Dashboard Akademik` -> `Pembelajaran` -> `Buat Modul Ajar`.
3. Create draft with synthetic non-PII data:
   - subject/class/year from active TeachingAssignment;
   - CP and TP filled;
   - avoid student names, phone, email, addresses, or real PII.
4. Trigger `Simpan & bantu isi bagian ini` on a saved-required section.
5. Verify network order:
   - RPP create/update succeeds first;
   - one `generate-rpp-step` request follows;
   - request body contains only `rppId` and `section`.
6. Verify UI:
   - generation status visible and not misleading;
   - buttons disabled during request;
   - output is inserted only into the target section;
   - proposal remains editable.
7. Repeat on representative sections:
   - `atp` from saved CP/TP;
   - `kegiatan`;
   - `asesmen`;
   - one reflective/lampiran-adjacent section.
8. Measure duration for each generation request.
9. Close and reopen dialog, refresh page, verify saved fields persist.
10. Double-click guard: trigger one section rapidly and verify one request only.
11. Missing TP: clear TP or create a controlled draft without TP, verify CTA/error
    appears and no provider request is sent.
12. Legacy controls: verify `Generate Semua`, `Generate Materi AI`,
    `Generate Soal AI`, and `Generate AI Bank Soal` are absent from interactive UI.

### Phase 3 - AI Quality And Curriculum Validity

Evaluate generated output using this rubric:

- Context alignment: references only the selected subject/class/CP/TP context.
- Field fit: output matches the target section format.
- Curriculum validity: aligns with Modul Ajar/Kurikulum Merdeka vocabulary.
- Specificity: actionable for a teacher, not generic filler.
- Safety: no invented personal data, no real PII, no unsupported claim.
- Editability: teacher can revise result without losing draft.
- Indonesian language quality: clear, teacher-facing, and appropriate.

Minimum evidence:

- Save one redacted sample per generated section in the final report.
- Mark each sample `GOOD`, `ACCEPTABLE WITH EDIT`, or `REJECT`.
- If output is rejected, capture reason and whether it is provider prompt issue,
  context issue, or UI mapping issue.

### Phase 4 - RPP Review And WAKA Path

1. GURU submits Modul Ajar/RPP for review.
2. Login as WAKA/authorized reviewer.
3. Open `/dashboard/rpp`.
4. Verify submitted RPP visible.
5. Open review dialog.
6. Test revision path if safe:
   - send revision note;
   - login GURU and verify revision state and note.
7. Test approval path:
   - approve submitted RPP;
   - verify status approved and reviewer label.
8. Verify no duplicate RPP or duplicate LMS module is created from repeated
   approval/reopen.

### Phase 5 - LMS Wave 3

1. As GURU, verify approved RPP produces or links to LMS draft.
2. Verify manual LMS create from RPP:
   - derives class/subject/year from RPP;
   - no arbitrary override from browser fields.
3. Verify publish/unpublish/archive actions according to current UI policy.
4. As WAKA, verify reviewer/audit LMS visibility works, but broad mutation is not
   accidentally granted.
5. As ordinary GURU non-owner, verify other teacher LMS/RPP cannot be edited.
6. As SISWA in class, verify published module visibility and progress path.
7. As SISWA outside class or negative role, verify not visible/denied.

### Phase 6 - Attendance/Session Sanity

1. Verify teacher session/jurnal flow can reference approved Modul Ajar.
2. Verify no obvious Asia/Jakarta date drift in teacher attendance surfaces.
3. This is a smoke sanity check only unless test data allows exact WIB boundary.

### Phase 7 - Responsive And A11y Spot Checks

1. Desktop 1440x900:
   - Modul Ajar wizard fits;
   - AI status/error does not overlap;
   - review dialog fits.
2. Mobile 390x844:
   - wizard sections scroll cleanly;
   - action buttons reachable;
   - no clipped footer/actions;
   - keyboard focus and Escape close behavior where safe.
3. Browser console:
   - no unexplained 4xx/5xx;
   - expected 403/410 only when explicitly testing negative/legacy contracts.

### Phase 8 - Logs, Audit, And Secret Hygiene

1. Check API logs around QA timestamp for:
   - provider errors;
   - timeout/rate-limit;
   - raw PII or secret markers.
2. Check `aiGeneration` audit if accessible via safe server query/API:
   - model label/provenance present;
   - prompt/output redacted;
   - no real PII stored.
3. Do not print secret values, cookies, tokens, or real PII.

## Acceptance Matrix

| Area | Acceptance |
| --- | --- |
| Runtime | Staging provider OpenAI `gpt-4.1-mini`, health 200, smoke 200 |
| AI request boundary | Browser request body contains only `rppId` and `section` |
| Save-first | RPP create/update precedes generation |
| Single-flight | Double-click makes one generation request |
| Missing foundation | Missing TP blocks before provider |
| Section mapping | Output mutates only requested section |
| Draft persistence | Close/reopen/refresh preserves generated and manual data |
| Legacy AI | Legacy AI buttons absent; endpoint 410 only as defense |
| Quality | Generated output passes rubric or finding recorded |
| WAKA review | WAKA sees and reviews submitted RPP via effective appointment/role |
| LMS | Approved RPP creates/links LMS without duplicate; ownership enforced |
| SISWA | Published class-scoped LMS visible only to intended student |
| Negative roles | Ordinary/non-owner/negative roles denied as expected |
| Responsive | Desktop and mobile have no overlap/blocking layout issue |
| Hygiene | No secret/PII in screenshots, logs, or report |

## Evidence To Capture

- Staging SHA and deploy run.
- Runtime env redacted and OpenAI smoke.
- PII-safe screenshots:
  - GURU Modul Ajar draft before/after generation;
  - network payload shape;
  - WAKA review board/dialog;
  - LMS module visible;
  - SISWA module view.
- Network summary:
  - endpoints called;
  - status codes;
  - duration per AI section.
- Console summary.
- Quality rubric table with short redacted excerpts.
- Negative-control results.
- Residual risk and recommendation.

## Stop Conditions

Stop QA and report immediately if any of these occur:

- Production URL/session is used accidentally.
- Secret/token/key appears in UI, network payload, logs, screenshot, or report.
- AI request contains raw full RPP body, arbitrary `context`, browser-declared
  teacher/class/year, or extra fields beyond `rppId` and `section`.
- Non-owner can generate/edit/review protected RPP/LMS.
- PII prompt routes to OpenAI/cloud.
- Browser generates multiple provider requests from one user action.
- Staging runtime provider is no longer OpenAI `gpt-4.1-mini`.
- Unexpected 500 occurs in core happy path.

## Stop Condition Follow-Up Protocol

Stop condition bukan akhir pekerjaan. Protokol QA memakai jalur **hybrid
risk-based**:

- **Hard stop** hanya untuk temuan yang membahayakan keamanan, data integrity,
  production containment, atau membuat QA berikutnya tidak valid.
- **Continue and document** untuk temuan non-blocking; lanjutkan matrix QA,
  batch fix setelah coverage selesai, lalu re-QA targeted.

Tujuannya adalah menghindari dua ekstrem: tidak berhenti saat evidence sudah
terkontaminasi, atau berhenti total untuk bug kecil yang bisa dicatat sambil
melanjutkan skenario independen.

### Triage Jalur

1. **Security/secret/production containment**
   - Contoh: secret/token muncul, production URL/session terpakai, PII terkirim
     ke cloud, atau ada indikasi data nyata terekspos.
   - Tindakan:
     - hentikan browser QA;
     - jangan ulangi aksi yang sama;
     - capture bukti minimal yang sudah redacted;
     - bersihkan artefak lokal/remote yang berisiko;
     - laporkan segera;
     - lanjut hanya setelah keputusan operator/reviewer.
   - Jalur ini tidak langsung patch-and-continue bila membutuhkan rotasi secret,
     kebijakan privasi, atau tindakan eksternal.

2. **Bug produk in-scope AI-0A/Wave 3**
   - Contoh: request membawa raw `context`, save-first gagal, output tidak masuk
     field, double-click membuat dua request, WAKA reviewer gagal, LMS duplicate,
     atau unexpected 500 pada happy path.
   - Jika bug adalah P0/P1 atau membuat evidence berikutnya tidak valid,
     tindakan:
     - stop QA hanya pada skenario tersebut;
     - dokumentasikan reproduksi ringkas: role, URL, langkah, expected, actual,
       status code, request shape redacted, dan screenshot PII-safe;
     - telusuri root cause di source/log/API;
     - susun targeted fix plan yang sempit;
     - implementasi pada branch yang sesuai;
     - jalankan focused tests/type/lint/diff check;
     - deploy ulang lewat Gitflow ke staging;
     - re-QA targeted skenario yang gagal;
     - setelah hijau, lanjutkan sisa QA matrix.
   - Jika bug P2/P3 dan skenario lain tetap valid, tindakan:
     - catat finding dengan evidence redacted;
     - lanjutkan QA matrix yang independen;
     - batch targeted fixes setelah matrix selesai;
     - deploy staging;
     - re-QA targeted pada seluruh finding yang diperbaiki.

3. **Fixture/account/config staging**
   - Contoh: akun QA tidak punya TeachingAssignment, WAKA appointment belum aktif,
     siswa tidak berada di kelas yang sama, atau data staging tidak cukup.
   - Tindakan:
     - jangan ubah production;
     - pastikan kebutuhan fixture aman dan PII-safe;
     - jika perubahan fixture/config staging diizinkan dan reversible, perbaiki
       fixture dengan bukti;
     - ulangi preflight;
     - lanjut QA.
   - Jika fixture membutuhkan mutasi sensitif, minta approval operator terlebih
     dahulu.

4. **Expected negative control**
   - Contoh: non-owner mendapat 403, legacy endpoint mendapat 410, role negatif
     redirect/denied.
   - Tindakan:
     - jangan dianggap stop;
     - catat sebagai PASS negative control jika sesuai acceptance.

### Continue And Document Examples

QA boleh dilanjutkan sambil mencatat finding jika:

- copy/microcopy minor tidak memblokir workflow;
- layout kecil tidak menghalangi aksi utama;
- output AI satu section kurang spesifik tetapi request/data aman dan editable;
- latency lambat tetapi request sukses dan tidak timeout;
- expected 403/410 muncul pada negative/legacy control;
- fixture role tertentu belum siap, tetapi skenario lain independen masih bisa
  diuji.

### Report Handling

Jika stop condition terjadi, report akhir tetap dibuat/diupdate dengan:

- status `FOLLOW-UP REQUIRED` atau `BLOCKED`, bukan sign-off;
- severity dan klasifikasi jalur triage;
- evidence redacted;
- root cause atau hipotesis sementara;
- file/endpoint/log terkait;
- targeted remediation plan;
- verification yang sudah dan belum dijalankan;
- keputusan apakah QA matrix boleh dilanjutkan setelah targeted re-QA.

### Resume Rule

Jika hard stop terjadi, QA browser dilanjutkan hanya jika:

- root cause in-scope sudah diperbaiki atau fixture/config sudah valid;
- deploy staging terbaru terverifikasi;
- targeted re-QA pada skenario gagal sudah PASS;
- tidak ada residual P0/P1 yang membuat hasil QA lain menyesatkan.

Jika temuan masuk jalur continue-and-document, QA matrix boleh lanjut tanpa
deploy ulang sampai batch fix dilakukan.

## Execution Decision

Recommended next step after this planning document is accepted:

1. Finish PR #418 main gate or record it as a separate approval blocker.
2. Run Phase 0 preflight.
3. Execute browser QA phases in the order above.
4. Produce final combined report:
   `docs/audits/AI0A-WAVE3-STAGING-BROWSER-QA-REPORT-2026-07-31.md`.
