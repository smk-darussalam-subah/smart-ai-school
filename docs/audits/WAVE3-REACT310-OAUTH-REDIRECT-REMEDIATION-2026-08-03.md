# Wave 3 React 310 OAuth Redirect Remediation

Tanggal: 2026-08-03

## Status

**FOLLOW-UP IMPLEMENTED - AWAITING SOURCE RE-REVIEW**

Temuan browser React `#310` adalah hard-stop evidence untuk Wave 3. Perbaikan
ini masih berada pada Wave 3 yang sama. Belum ada commit, push, PR, deployment,
atau klaim staging sign-off untuk perbaikan ini.

## Scope dan Containment

- Scope produk: routing landing dashboard setelah OAuth untuk role learner.
- Tidak ada perubahan API, schema, migration, dependency, Keycloak, scheduler,
  systemd, Docker, database, production, atau `main`.
- Perbaikan dibuat pada branch terpisah dari `origin/develop` setelah PR #421
  telah merged: `fix/wave3-react310-oauth-redirect-20260803`.
- Tidak ada kredensial, identifier akun, PII, token, atau payload sesi yang
  dicatat dalam laporan ini.

## Bukti Reproduksi Staging

Staging pada saat reproduksi telah berada pada SHA
`a27dbfad23366b64a915418637215ce65ef53315` dari PR #422.

1. Sesi siswa fixture yang sudah terautentikasi membuka
   `/dashboard/akademik` secara langsung dan browser console bersih setelah
   halaman stabil.
2. Sesi browser kemudian dibersihkan dan login OAuth dilakukan kembali melalui
   Keycloak dengan akun fixture yang sama.
3. Alur login menggunakan callback URL aplikasi `/dashboard`; role learner
   selanjutnya dirutekan ke `/dashboard/akademik`.
4. Setelah halaman siswa terlihat, console baru mencatat `Minified React error
   #310` pada `useMemo` di App Router Next.js.

Kontras sesi yang sudah ada versus callback OAuth bersih menunjukkan masalah
berada pada transisi landing, bukan pada tampilan kartu LMS atau aksi completion.

## Analisis Akar Masalah

`apps/web/src/app/login/page.tsx` selalu meminta NextAuth kembali ke
`/dashboard`. Untuk role SISWA atau ORANG_TUA, `DashboardPage` kemudian memakai
`redirect('/dashboard/akademik')`.

Source runtime Next.js 15.5.18 mendokumentasikan bahwa jalur App Router
`mpaNavigation` sengaja melakukan `throw` di dalam kondisi yang dapat berubah
secara eksternal dan menyatakan bahwa jalur tersebut melanggar aturan hooks.
Pada callback OAuth baru, transisi learner ini dapat terjadi bersamaan dengan
mount provider klien dan memicu invariant React #310. Redirect yang sama tidak
dibutuhkan ketika sesi sudah ada dan URL akademik dibuka secara langsung.

## Perbaikan

1. Tambah `apps/web/src/lib/dashboard-routing.ts` sebagai helper murni untuk
   menentukan set role learner-only.
2. Middleware membaca role dari JWT NextAuth yang telah diverifikasi dan, hanya
   untuk request `/dashboard` dengan SISWA atau ORANG_TUA tanpa role desktop,
   mengirim redirect HTTP ke `/dashboard/akademik` sebelum React App Router
   di-mount.
3. `DashboardPage` memakai helper yang sama sebagai fallback agar kebijakan
   role tidak terduplikasi.
4. Definisi learner-only bersifat positif: semua role dalam token harus berupa
   `SISWA` atau `ORANG_TUA`. Role lain, termasuk `INDUSTRI` dan role baru yang
   belum dikenal helper, membatalkan redirect learner dan mencegah loop.

### Follow-up P1 - Mixed Learner and INDUSTRI

Re-review menemukan bahwa daftar pengecualian sebelumnya belum mencakup
`INDUSTRI`. Helper kini tidak lagi memakai daftar pengecualian; redirect hanya
berlaku bila setiap role token merupakan role learner. Dengan demikian
`SISWA + INDUSTRI`, `ORANG_TUA + INDUSTRI`, akun `INDUSTRI` saja, dan role
stabil baru yang belum dikenal tetap berada di landing dashboard standar.

Role campuran yang memiliki role non-learner tetap berada pada landing dashboard
standar. Request langsung ke `/dashboard/akademik` tidak diarahkan lagi sehingga
tidak membentuk loop.

## Verifikasi Lokal

| Check | Result |
| --- | --- |
| Middleware focused test | PASS - 22 test |
| Web test penuh | PASS - 23 suite / 147 test |
| Web type-check | PASS |
| Web lint | PASS; warning deprecation/plugin Next yang sudah ada |
| Web production build | PASS - 39/39 halaman |
| `git diff --check` | PASS |

Build lokal menggunakan junction dependency sementara karena worktree baru tidak
memiliki instalasi dependency sendiri. Build keluar dengan code 0 dan selesai
39/39 halaman, tetapi Next mencatat warning trace-copy standalone pada junction
Windows. Warning tersebut bukan perubahan source; CI Linux pada PR tetap wajib
menjadi bukti build packaging.

## File Manifest untuk Reviewer

- `apps/web/src/lib/dashboard-routing.ts`
- `apps/web/src/middleware.ts`
- `apps/web/src/app/dashboard/page.tsx`
- `apps/web/src/__tests__/middleware.test.ts`
- `docs/audits/WAVE3-REACT310-OAUTH-REDIRECT-REMEDIATION-2026-08-03.md`

## Required Re-review dan Re-QA

Sebelum Git packaging, reviewer perlu memeriksa batas authorization middleware,
role campuran, dan keutuhan fallback server.

Setelah source re-review, delivery harus menjalankan Gitflow normal lalu menguji
di staging dengan sesi OAuth bersih:

1. SISWA dan ORANG_TUA login baru menuju `/dashboard/akademik` tanpa React
   `#310`.
2. GURU, WAKA, KS, SUPER_ADMIN, TATA_USAHA, dan role negatif mempertahankan
   landing serta batas akses yang sesuai.
3. Siswa membuka route negatif `/dashboard/rpp` setelah login baru tanpa
   disclosure atau console error yang tidak dijelaskan.
4. Ulangi LMS completion sukses dan gagal, archive fixture, mobile `390x844`,
   serta inspeksi console/network baru.

Fixture QA yang sudah ada hanya dibersihkan setelah matrix re-QA selesai agar
tidak menghapus bukti yang masih diperlukan. Tidak ada data non-QA diubah.

## Gate Berikutnya

Tahan commit, push, PR, promotion, dan staging sign-off sampai reviewer memberi
verdict source untuk follow-up ini.
