# Wave D Appointment Governance Operational UI Source Sign-off

Tanggal: 2026-07-29

Peran: Reviewer independen

Branch: `feat/appointment-governance-operational-ui-20260728`

## Verdict

**SOURCE COMPLETE - READY FOR DISPOSABLE RUNTIME AND BROWSER QA**

Tidak ditemukan P0, P1, atau P2 source baru pada final re-review. Seluruh finding
reviewer Wave D dan follow-up sempit dinilai tertutup.

Status ini bukan approval commit, push, PR, staging, atau production. Gate
berikutnya adalah runtime/browser QA pada database disposable dengan migration
resmi dan Keycloak isolated.

Confidence:

- `0.99` terhadap source correctness pada scope Wave D.
- `0.98` terhadap regression evidence.
- Runtime/staging confidence belum diberikan sebelum QA berikutnya.

## Final P1 Closure

`getHistory()` sekarang:

1. memilih `supersededById`;
2. membaca audit appointment sendiri;
3. membaca audit supersede hanya dari exact `supersededById`;
4. memakai `ownActivationAudit` untuk event `ACTIVATED`;
5. memakai `supersedingAudit` untuk event `SUPERSEDED`;
6. tidak lagi mengambil seluruh replacement yang pernah menunjuk incumbent.

Test tiga aktor membuktikan:

- aktivasi incumbent memakai actor X;
- PLT historis memakai actor Y tetapi tidak masuk history incumbent;
- supersede definitif memakai actor Z;
- event `ACTIVATED` menghasilkan X;
- event `SUPERSEDED` menghasilkan Z;
- Y tidak digunakan sebagai actor history incumbent.

Evidence:

- `apps/api/src/appointments/appointments.service.ts:922`
- `apps/api/src/appointments/appointments.service.ts:941`
- `apps/api/src/appointments/appointments.service.ts:946`
- `apps/api/src/appointments/appointments.service.ts:993`
- `apps/api/src/appointments/appointments.service.ts:996`
- `apps/api/src/appointments/appointments.service.ts:1083`
- `apps/api/src/appointments/appointments.service.ts:1123`
- `apps/api/src/__tests__/appointments.spec.ts:932`
- `apps/api/src/__tests__/appointments.spec.ts:947`
- `apps/api/src/__tests__/appointments.spec.ts:1001`

## Accepted Closures

Reviewer menerima seluruh closure berikut:

1. Appointment adalah authority period-bound; legacy StaffPosition mutation
   tetap fail-closed.
2. `/positions` hanya untuk `SUPER_ADMIN` atau active `KEPALA_SEKOLAH`.
3. Page memeriksa `/positions/my-positions` sebelum support data dan redirect.
4. Active Kepala Sekolah dapat mengelola non-KS; hanya SA mengelola KS.
5. Candidate, capacity, year, major, dan scope validation fail-closed.
6. PLT hanya menggantikan definitive `SUSPENDED` pada tahun yang sama.
7. Resume diblokir selama linked PLT masih open atau active.
8. Successor lintas tahun dan default next-year tersedia.
9. Permission preview terlindung dari stale async response.
10. Dialog lifecycle mereset note/date dan memiliki accessibility description.
11. Failed PATCH audit mempertahankan resource ID.
12. History tidak memindahkan mutable reason ke CREATED.
13. Multi-cycle suspend/resume dan manual/automatic actor mapping deterministic.
14. Route authorization dan helper state memiliki focused regression tests.

## Independent Verification

Reviewer menjalankan ulang:

- API broader focused: 5 suites / 107 tests pass.
- Web broader focused: 3 suites / 20 tests pass.
- API type-check: pass.
- API lint: pass.
- API build: pass.
- Prisma validate: pass dari evidence Executor dan re-review sebelumnya.
- Web type-check/lint/build: pass pada re-review sebelum final API-only patch;
  final patch tidak mengubah file web.
- Web production build terakhir: 39/39 pages.
- `git diff --check`: pass.
- `git diff --cached --check`: pass; tidak ada staged changes.

Warning ts-jest compiled JS, Next lint deprecation/plugin, dan expected
Positions containment logs bukan assertion failure.

## Required Runtime Gate

Gunakan database disposable, bukan `diis_db` lokal yang stale:

1. buat DB bernama jelas seperti `diis_waved_qa_*`;
2. apply migration resmi dari baseline bersih;
3. seed RBAC resmi dan fixture appointment minimal;
4. gunakan Keycloak isolated dengan enam stable identity roles;
5. jangan membuat kembali realm role jabatan;
6. jalankan API dan web terhadap runtime disposable tersebut.

Minimum browser scenarios:

1. stable GURU biasa diarahkan keluar dan direct catalog access ditolak;
2. stable GURU dengan active KS appointment dapat membuka Struktur Organisasi;
3. SA membuat draft, submit, approve, dan mengaktifkan successor;
4. KS dapat mengelola non-KS tetapi tidak dapat menyiapkan/approve KS;
5. suspend definitive, siapkan PLT, activate PLT, block resume, end PLT, lalu
   resume definitive;
6. successor tahun berikutnya memakai incumbent dan scope yang tepat;
7. history X/Y/Z menampilkan actor yang benar;
8. failed lifecycle action muncul hanya pada history appointment terkait;
9. preview close/reopen tidak menerima response lama;
10. refresh, browser console/network, desktop, dan mobile 360/390 px bersih.

Rekam evidence tanpa token, secret, credential, atau PII nyata. Bersihkan DB,
container, dan fixture disposable setelah QA selesai.

## Git Gate After Runtime

Jika seluruh runtime scenario lulus:

1. kembali ke reviewer untuk runtime sign-off;
2. stage hanya explicit Wave D file list;
3. pastikan tiga test web untracked yang relevan ikut bila termasuk scope;
4. review `git diff --cached --stat` dan `git diff --cached --check`;
5. pastikan audit report yang dipilih konsisten dan tidak memasukkan seluruh
   historical scratch reports;
6. baru commit, push, PR ke `develop`, dan tunggu CI.

Larangan tetap:

- jangan `git add .`;
- jangan `git add -A`;
- jangan reset atau membersihkan historical untracked files;
- jangan `db push --accept-data-loss` ke `diis_db` stale;
- jangan deploy atau mengubah Keycloak/VPS sebelum gate berikutnya.
