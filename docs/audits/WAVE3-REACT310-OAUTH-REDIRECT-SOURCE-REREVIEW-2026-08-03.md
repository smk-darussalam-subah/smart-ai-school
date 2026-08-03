# Wave 3 React 310 OAuth Redirect - Source Re-review

Tanggal: 2026-08-03

## Verdict

**FOLLOW-UP REQUIRED IN WAVE 3**

Pemindahan redirect learner ke middleware merupakan mitigasi source yang tepat
untuk callback OAuth bersih. Token NextAuth memang membawa `roles`, redirect
hanya berlaku pada `/dashboard`, request `/dashboard/akademik` tidak diarahkan
kembali oleh middleware, dan fallback Server Component memakai helper yang sama.

Namun satu celah P1 anti-loop masih ada. Jangan lanjut explicit Git packaging
sebelum finding ini ditutup dan direview ulang. React `#310` juga belum boleh
dinyatakan runtime-closed sebelum deployed staging OAuth matrix lulus.

## Finding

### P1 - Mixed learner + INDUSTRI membentuk redirect loop

**Evidence**

- `dashboard-routing.ts:1-7` hanya menganggap `GURU`, `KEPALA_SEKOLAH`,
  `SUPER_ADMIN`, dan `TATA_USAHA` sebagai role yang membatalkan learner landing.
  `INDUSTRI` tidak termasuk.
- Untuk token `['SISWA', 'INDUSTRI']` atau `['ORANG_TUA', 'INDUSTRI']`, helper
  mengembalikan `true` dan middleware mengarahkan `/dashboard` ke
  `/dashboard/akademik`.
- `app/dashboard/akademik/page.tsx:45` mengarahkan setiap role `INDUSTRI` kembali
  ke `/dashboard`.
- Test mixed-role di `middleware.test.ts:167-177` tidak mencakup `INDUSTRI`,
  walaupun laporan re-QA memasukkannya ke role negatif.

**Resulting flow**

`/dashboard` -> middleware `/dashboard/akademik` -> AkademikPage `/dashboard` ->
middleware `/dashboard/akademik` -> berulang.

**Impact**

Salah konfigurasi assignment stable role menghasilkan browser redirect loop,
bukan fallback yang aman. Ini melanggar klaim anti-loop dan membuat evidence
OAuth/React tidak dapat dipercaya untuk matriks role campuran.

**Required remediation**

1. Definisikan learner-only secara positif: set role harus memiliki `SISWA` atau
   `ORANG_TUA` dan seluruh stable role yang ada harus merupakan learner role.
   Dengan demikian role non-learner apa pun membatalkan redirect learner.
2. Alternatif minimum adalah memasukkan `INDUSTRI` ke exclusions, tetapi logika
   subset learner lebih fail-closed dan tidak perlu daftar pengecualian yang mudah
   tertinggal ketika stable role bertambah.
3. Tambahkan regresi test untuk:
   - `SISWA + INDUSTRI` tetap pada dashboard standar;
   - `ORANG_TUA + INDUSTRI` tetap pada dashboard standar;
   - `INDUSTRI` saja tidak diarahkan ke Akademik;
   - learner-only tetap diarahkan;
   - `/dashboard/akademik` tetap tidak diarahkan ulang oleh middleware.

## Non-blocking Runtime Boundary

`DashboardPage` masih memiliki fallback `redirect('/dashboard/akademik')`.
Fallback itu masuk akal sebagai defense-in-depth, tetapi dapat tetap dieksekusi
pada effective role dari cookie mode tinjau karena middleware memakai stable JWT
roles. Karena perpindahan mode tinjau menggunakan `router.refresh()`, staging QA
wajib menguji masuk/keluar mode SISWA dan ORANG_TUA pada akun multi-role. Bila
React `#310` muncul di jalur itu, finding kembali ke branch yang sama.

Ini bukan finding source tambahan saat ini karena skenario OAuth learner-only
yang direproduksi memang ditangkap middleware sebelum App Router mount.

## Positive Review

- JWT callback menyimpan Keycloak role terfilter ke `token.roles`; middleware
  membaca field yang benar.
- Unauthenticated `/dashboard` tetap fail-closed ke login.
- Query ini tidak mengubah API authorization atau role di Keycloak.
- Redirect membawa CSP response header dan tidak membuka route publik baru.
- Pure learner dan role campuran staf/guru sudah memiliki regresi test.
- Perubahan terbatas pada empat source/test file dan satu laporan executor.

## Independent Verification

Reviewer menjalankan ulang pada branch
`fix/wave3-react310-oauth-redirect-20260803`:

| Check | Hasil |
| --- | --- |
| Web test penuh | PASS - 23 suite / 144 test |
| Web type-check | PASS |
| Web lint | PASS; warning Next lint existing |
| Web production build | PASS - 39/39 halaman |
| `git diff --check` | PASS |
| `git diff --cached --check` | PASS; tidak ada staged change |

Build warning EPERM trace-copy berasal dari junction dependency worktree dan
exit code tetap 0. Junction/cache reviewer telah dibersihkan; dependency checkout
utama tetap utuh.

## Re-review Gate Setelah P1

Setelah source P1 ditutup, reviewer perlu memeriksa ulang helper dan focused
middleware tests. Jika hijau, source dapat diberi verdict explicit packaging.
Sesudah deploy, staging sign-off tetap memerlukan OAuth bersih SISWA/ORANG_TUA,
mixed roles termasuk INDUSTRI, consent redirect, mode tinjau, direct negative
route, LMS matrix, serta console/network bersih tanpa React `#310`.

## Confidence

- Kebenaran finding P1: **0.99**
- Kelayakan pendekatan middleware setelah P1 ditutup: **0.96**
- Readiness untuk explicit Git packaging saat ini: **0.30**
