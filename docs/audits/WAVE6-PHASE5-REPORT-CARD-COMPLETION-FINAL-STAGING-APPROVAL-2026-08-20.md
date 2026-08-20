# Wave 6 Phase 5 Report Card Completion - Final Staging Approval

Tanggal review: 2026-08-20
Peran: Independent Reviewer
Verdict: **APPROVED FOR STAGING SIGN-OFF AND MAIN PROMOTION PLANNING**

Approval ini menutup gate staging Wave 6. Approval ini bukan perintah untuk merge
ke `main` atau deploy production; kedua tindakan tersebut tetap memerlukan gate dan
otorisasi eksplisit terpisah.

## Findings

Tidak ditemukan P0, P1, atau P2 yang belum terselesaikan dalam scope follow-up
kontras notifikasi dan routing Rapor keluarga multi-anak.

## Delivery Integrity

- `origin/develop`: `275f1fc7c7d321a3bb77b9273a1d81f5af548cc8`.
- `origin/staging`: `b20aa39f57f98f179e00190fed0f5db0d2beb9a2`.
- `origin/main`: `ff20b235dd1d5ee5d5e8e4a7220944c10cdbef7d`.
- PR #542 merged ke `develop`; Build, Lint & Type Check, dan Unit Tests sukses.
- PR #543 merged ke `staging`; Build, Lint & Type Check, dan Unit Tests sukses.
- Deploy run `32245617312` sukses dan memakai SHA staging yang sama.
- Tidak ada PR terbuka saat review.
- Classic branch protection `develop`, `staging`, dan `main` mewajibkan satu
  approval. Ruleset aktif `Protect Staging` juga mewajibkan satu approval.
- Perubahan setelah application-tested SHA
  `9bd3f70b5599b189cf4fd3e157efdabe56eb90d0` hanya dokumentasi audit. Product tree
  non-audit pada SHA staging final terbukti ekuivalen.

## Source Review

### Notification target and privacy

- `PushService.findMyNotifications()` hanya membaca log milik user saat ini.
- `NotificationLog.refId` dipakai internal untuk lookup, lalu dihapus dari response.
- Target Rapor hanya dihasilkan untuk `ReportCard` berstatus `distributed` dan
  siswa yang terikat ke `SISWA.userId` atau `ORANG_TUA.parentId` saat ini.
- Lookup banyak notifikasi dilakukan secara batch, bukan query per item.
- Rapor asing, malformed, atau tidak lagi berhak diakses gagal tertutup ke rute
  Rapor umum tanpa mengungkap student ID.
- Web Push memakai resolver ownership yang sama sehingga native notification dan
  notification center tidak berbeda tujuan.
- Frontend menerima hanya same-origin path di bawah `/dashboard/`, serta menolak
  URL eksternal, protocol-relative, backslash, malformed, dan non-dashboard path.

### Multi-child navigation

- Notification target server-side menjadi sumber utama; anak aktif di UI tidak
  lagi dipakai untuk menebak pemilik Rapor.
- `Dashboard`, `Beranda`, dan `Notifikasi` dari shell Rapor ORANG_TUA mempertahankan
  `studentId` yang sedang dibuka.
- Fallback notifikasi Rapor tanpa target tidak membawa selected-child yang dapat
  salah; halaman Rapor tetap melakukan ownership resolution sendiri.

### Contrast and interaction

- SISWA active control: `#022c22` pada `#d1fae5`, 13.36:1.
- ORANG_TUA active control: `#172554` pada `#dbeafe`, 12.04:1.
- Completed-step Rapor: `#022c22` pada `#d1fae5`, 13.36:1.
- Ketiganya melewati WCAG AA untuk teks normal dengan margin yang kuat.
- Target sentuh dan dialog accessibility closure dari QA sebelumnya tetap terjaga.

## Independent Verification

- API focused: 1 suite / 15 tests pass.
- Web focused: 2 suites / 27 tests pass.
- `git diff --check` dan cached check pass.
- GitHub CI kedua PR pass.
- VPS checkout: branch `staging`, SHA
  `b20aa39f57f98f179e00190fed0f5db0d2beb9a2`.
- `smk-staging-api`: running dan healthy; database health `up`.
- `smk-staging-web`: running.
- Dua jam log API yang diperiksa tidak memuat `request_error`, `ERROR`,
  `Exception`, atau `AI_OUTPUT_INVALID` baru.

## Browser Evidence

Evidence staging permanen mengikat browser QA ke application-tested SHA
`9bd3f70b...`, yang product tree-nya sama dengan staging final:

- SISWA dan ORANG_TUA active-tab contrast terukur sesuai matrix di atas.
- Parent dua anak dibangun melalui provisioning API resmi, bukan SQL langsung.
- Distribusi Rapor memakai lifecycle resmi dan handoff notifikasi `3/3 queued`.
- `/push/my-notifications` mengembalikan dua `targetHref` berbeda tanpa raw
  `refId`.
- Child B aktif lalu notifikasi child A membuka child A; arah sebaliknya juga lulus.
- Reload dan link Dashboard/Beranda/Notifikasi mempertahankan child context.
- Fresh browser tab setelah deploy tidak memiliki console error/warning baru.

Sesi browser independen yang tersedia saat review tidak memiliki sesi login staging.
Reviewer tidak membuat credential, fixture, atau mutasi baru. Karena itu, browser
assertion follow-up ini didasarkan pada evidence PII-safe yang telah dipermanenkan,
kemudian dikorelasikan dengan source, test, deployed product tree, dan runtime VPS.
Batas ini tidak mengubah verdict karena skenario dua anak sudah dibuktikan pada SHA
produk yang identik dan seluruh boundary keamanan dapat direproduksi dari source/test.

## Residual Risk

- Tidak ada residual P0/P1/P2 yang diketahui dalam scope Wave 6.
- Denied browser-notification permission tetap memakai branch simulation dari QA
  sebelumnya; ini bukan bagian dari dua finding follow-up terakhir.
- Synthetic parent sekarang memiliki dua anak untuk fixture regresi staging. Fixture
  harus tetap PII-safe dan tidak dipromosikan sebagai data production.
- Production runtime belum diverifikasi terhadap Wave 6 karena `main` dan production
  memang belum dipromosikan.

## Recommendation

Wave 6 siap masuk **main promotion planning** melalui Gitflow normal:

1. Buat PR promotion terbaru dari `origin/staging` ke `main` tanpa source patch baru.
2. Pertahankan satu approval dan seluruh required checks; jangan relaksasi protection
   kecuali ada otorisasi Director yang baru dan spesifik.
3. Setelah reviewer GitHub yang sah approve dan Director mengizinkan, merge dan deploy
   production sebagai gate terpisah.
4. Di production, batasi validasi awal pada SHA, health, migration status, container,
   dan smoke read-only. Jangan membuat fixture, memaksa push, atau mendistribusikan
   Rapor nyata hanya untuk smoke test.

## Confidence

**0.99 (99%)** untuk staging sign-off dan kesiapan perencanaan promosi ke main.
