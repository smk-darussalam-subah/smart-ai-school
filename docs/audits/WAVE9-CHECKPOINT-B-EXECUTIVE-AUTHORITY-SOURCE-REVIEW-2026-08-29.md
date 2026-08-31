# Wave 9 Checkpoint B Executive Authority - Independent Source Re-review

Tanggal: 2026-08-29
Peran: Independent Source Reviewer
Verdict: APPROVED FOR EXPLICIT GIT PACKAGING

## Findings

Tidak ditemukan P0, P1, atau P2 yang belum terselesaikan pada manifest 16 file.

## Closure Finding Sebelumnya

### P1 - Permission Appointment Kepala Sekolah: CLOSED

Migration data-only
`20260829000001_wave9_executive_authority_permission` sekarang:

- memastikan permission canonical `finance.read` tersedia;
- fail-closed bila Position `KEPALA_SEKOLAH` atau permission canonical tidak tepat
  satu row;
- menambahkan tepat satu mapping pada `school.position_permissions`;
- idempotent melalui unique key dan `ON CONFLICT DO NOTHING`;
- tidak mengubah Prisma schema, role dasar, atau kontrak API.

Trace authority telah konsisten:

1. pemangku KS tetap memiliki stable identity `GURU`;
2. RolesGuard memperoleh position code dari Appointment aktif;
3. PermissionsService memperoleh `finance.read` dari PositionPermission;
4. manual override diterapkan setelah grant Appointment, sehingga revoke tetap menang;
5. route dan Server Action mensyaratkan role/Appointment KS serta `finance.read`.

Negative controls tetap menolak GURU biasa dan Appointment non-KS.

### P2 - Tiga resolusi authority saat initial render: CLOSED

`fetchExecutivePageData()` melakukan satu pemanggilan
`requireExecutiveDashboardAccess()`, kemudian meneruskan token tervalidasi ke dua
loader privat untuk bundle dan tahun ajaran. Halaman tidak lagi memanggil guard
terpisah.

`fetchExecutiveBundle()` dan `fetchAcademicYears()` tetap exported Server Action
yang masing-masing memiliki guard sendiri. Forged invocation karena itu tetap berhenti
sebelum API domain pertama dipanggil.

## Fail-Closed dan Product Flow

- Session tanpa token diarahkan ke login sebelum authority projection.
- Projection tanpa KS/Super Admin atau tanpa `finance.read` diarahkan ke dashboard.
- Mode tinjau tetap menyembunyikan Appointment karena resolver meniadakan position
  roles ketika view-as aktif.
- Sidebar dan Help menyembunyikan permukaan berpermission ketika `/auth/me` gagal,
  termasuk wildcard Super Admin.
- Tidak ada pelebaran akses berdasarkan role sesi historis `KEPALA_SEKOLAH`.
- Loader dashboard mempertahankan graceful per-source null yang sudah ada; perubahan
  hanya menghilangkan resolusi authority berulang.

## Verifikasi Independen

### Source dan Git hygiene

- seluruh 16 file manifest dibaca dan ditelusuri;
- trace web -> authority resolver -> API RolesGuard/PermissionGuard -> Appointment
  PositionPermission diperiksa;
- `git diff --check`: pass;
- `git diff --cached --check`: pass;
- staged changes: 0;
- tidak ditemukan schema, dependency, infra, Keycloak, secret, staging, atau
  production mutation.

### Automated focused tests

- Web: 5 suite / 46 test pass.
- API: 2 suite / 47 test pass.

Focused matrix mencakup Super Admin, KS aktif, GURU biasa, Appointment non-KS,
permission projection gagal, manual revoke, unauthenticated/direct Server Action,
single authority resolution, Sidebar, dan Help.

Type-check independen sempat dicoba, tetapi runtime junction reviewer menunjuk build
`@smk/types` dari worktree utama yang lebih lama dan menghasilkan missing export di
modul assessment yang tidak terkait delta ini. Karena itu hasil tersebut tidak
diklaim sebagai kegagalan source branch. Bukti full type-check/lint/build Executor
tetap harus diulang oleh CI/Linux setelah packaging.

### PostgreSQL disposable

PostgreSQL 18 + pgvector di WSL digunakan pada database dan port disposable:

- Prisma migrate deploy: 46/46 migration pass dari database kosong;
- SQL Wave 9 direplay dua kali setelah migrate deploy;
- hasil akhir: permission `finance.read` = 1 row;
- mapping `KEPALA_SEKOLAH + finance.read` = 1 row;
- `_prisma_migrations` selesai = 46 row.

Runtime disposable dan junction dependency reviewer dibersihkan setelah pemeriksaan.

## Batas Approval

Approval ini hanya mengizinkan explicit Git packaging dari manifest 16 file yang
direview. Approval ini bukan:

- staging sign-off;
- exact-SHA freeze baru;
- izin menghasilkan screenshot/PDF/deck final;
- main/production approval.

Setelah packaging dan CI hijau, urutan tetap:

1. merge melalui Gitflow normal;
2. deploy reviewed SHA ke staging;
3. affected browser matrix untuk Super Admin, KS aktif, GURU biasa, Appointment
   non-KS, mode tinjau, Sidebar, dan Help;
4. verifikasi tidak ada manual permission grant khusus fixture;
5. tetapkan exact-SHA freeze baru;
6. ambil ulang seluruh screenshot sebelum PDF/deck Checkpoint B dibuat.

## Confidence

- Security/authority: 0.98
- Product flow: 0.97
- UI/UX/performance: 0.95
- Database migration: 0.98
- Overall source verdict: 0.98
