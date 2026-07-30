# Wave D Appointment Governance Operational UI Runtime QA

Tanggal: 2026-07-29

Peran: Executor runtime QA

Branch: `feat/appointment-governance-operational-ui-20260728`

## Verdict

**DISPOSABLE RUNTIME QA COMPLETE - READY FOR REVIEWER RUNTIME SIGN-OFF**

Tidak ditemukan blocker runtime pada scope Wave D. Runtime disposable berhasil
menjalankan migrasi resmi, seed aplikasi/RBAC, Keycloak isolated dengan stable
roles, API lokal, web lokal, browser QA desktop/mobile, dan skenario appointment
utama.

Belum ada commit, push, PR, deploy, atau staging sign-off. Tahap berikutnya tetap
reviewer runtime sign-off, lalu explicit Git packaging bila reviewer menyetujui.

## Disposable Runtime

- PostgreSQL disposable: container `diis-waved-qa-postgres`, database
  `diis_waved_qa`, port lokal `55432`.
- Redis disposable: container `diis-waved-qa-redis`, port lokal `56379`.
- Keycloak disposable: container `diis-waved-qa-keycloak`, realm `diis`, port
  lokal `58080`.
- API lokal: `http://localhost:3301`.
- Web lokal: `http://localhost:3300`.
- Container produksi/staging bernama `smk-*` tidak disentuh.

## Migration And Seed Evidence

- `prisma migrate deploy` berhasil menerapkan 35 migration resmi.
- Migration terakhir:
  `20260727000001_appointment_capacity_wave_c_architecture`.
- `npx prisma db seed --schema prisma/schema.prisma` berhasil dari package
  `packages/database`.
- Script npm `db:seed` sempat gagal pada strict TypeScript seed fixture
  existing, bukan kegagalan database; jalur Prisma seed resmi dengan
  `--transpile-only` berjalan sukses.
- RBAC seed resmi dari `prisma/seed-permissions.ts` dijalankan setelah diketahui
  `auth.permissions` dan `auth.role_permissions` kosong pada disposable DB.
- Hasil RBAC final: 59 permissions dan 118 role permissions.
- Academic year fixture disposable disesuaikan dengan tanggal runtime:
  `2026/2027` aktif, `2027/2028` nonaktif/future.

## Keycloak Evidence

- Realm disposable hanya memakai enam stable identity role:
  `SUPER_ADMIN`, `TATA_USAHA`, `GURU`, `SISWA`, `ORANG_TUA`, `INDUSTRI`.
- Tidak ada realm role jabatan yang dibuat ulang.
- Client disposable diberi mapper `realm_access.roles` ke userinfo agar NextAuth
  browser mendapatkan role stabil yang sama dengan access token API.
- Untuk membuktikan finding lama, akun Kepala Sekolah disposable diubah menjadi
  token stable `GURU` saja, lalu tetap memiliki active appointment
  `KEPALA_SEKOLAH` dari DB.

## Scenario Results

1. **Ordinary stable GURU rejected**
   - `guru1` memiliki `myPositionCount=0`.
   - Direct `GET /api/v1/positions` menghasilkan `403`.

2. **Stable GURU + active KS allowed**
   - Akun Kepala Sekolah disposable memiliki token role `GURU`.
   - `GET /api/v1/positions/my-positions` mengembalikan `KEPALA_SEKOLAH`.
   - Direct `GET /api/v1/positions` menghasilkan `200`.
   - Browser sebelumnya memuat halaman Struktur Organisasi untuk akun KS.

3. **SUPER_ADMIN lifecycle via browser**
   - Browser login sebagai Super Admin berhasil menampilkan menu lengkap dan
     halaman `Struktur & Jabatan`.
   - Wizard Super Admin menampilkan opsi `Kepala Sekolah` serta posisi lain.
   - Dari UI browser, Super Admin membuat draft `WAKA_SARPRAS` untuk
     Fajar Nugroho efektif `2026-07-29`.
   - UI menampilkan `Draft appointment tersimpan`, lalu `Ajukan berhasil
     diproses`, lalu `Setujui berhasil diproses`.
   - Scheduler disposable mengaktifkan due appointment dengan response aman:
     `endedCount=0`, `cancelledCount=0`, `activatedCount=1`,
     `affectedUserCount=1`.
   - Refresh browser menampilkan `Wakasek Sarpras` aktif untuk Fajar Nugroho.
   - History API Sarpras:
     `CREATED:Administrator Sistem`, `SUBMITTED:Administrator Sistem`,
     `APPROVED:Administrator Sistem`, `ACTIVATED:Sistem`.

4. **KS can manage non-KS but cannot manage KS**
   - Browser KS menampilkan wizard tanpa opsi `Kepala Sekolah` untuk pembuatan
     appointment.
   - Direct `POST /api/v1/appointments` untuk posisi `KEPALA_SEKOLAH` memakai
     token stable `GURU` + active KS menghasilkan `403` dengan pesan:
     `Hanya SUPER_ADMIN yang dapat menyiapkan appointment Kepala Sekolah.`

5. **Suspend, PLT, blocked resume, end PLT, resume definitive**
   - Runtime API berhasil menjalankan alur: suspend definitive
     `WAKA_KURIKULUM`, siapkan PLT, activate PLT, block resume selama PLT open,
     end PLT, lalu resume definitive.
   - Failed resume hanya muncul pada history appointment incumbent, bukan pada
     history PLT.

6. **Successor next year**
   - Runtime API membuat successor `WAKA_KURIKULUM` untuk tahun `2027/2028`.
   - Status successor future tetap `APPROVED`, tidak aktif pada tahun berjalan.

7. **History X/Y/Z**
   - History incumbent `KEPALA_TU` Maya:
     `ACTIVATED=Administrator Sistem` dan `SUPERSEDED=Sari Wulandari, S.Pd`.
   - History PLT Dedi:
     `ACTIVATED=Drs. H. Abdul Karim, M.Pd` dan `ENDED=Administrator Sistem`.
   - History successor Eko:
     `ACTIVATED=Sari Wulandari, S.Pd`.
   - Actor PLT lama tidak bocor ke event incumbent yang disupersede.

8. **Failed lifecycle correlation**
   - Failed resume saat PLT masih open tercatat pada appointment incumbent.
   - History PLT tidak menerima failed event milik incumbent.

9. **Preview close/reopen**
   - Browser membuka wizard, memilih posisi, menutup, lalu membuka ulang.
   - Wizard kembali ke `Pilih jabatan`; response preview lama tidak masuk ke
     state baru.

10. **Refresh, console, desktop, mobile**
   - Desktop `1280px`: halaman struktur terbuka, tidak ada horizontal overflow.
   - Mobile `390x844`: `innerWidth=390`, `scrollWidth=375`, `hasStruktur=true`,
     `hasSarpras=true`.
   - Mobile `360x800`: `innerWidth=360`, `scrollWidth=345`, `hasStruktur=true`,
     `hasSarpras=true`.
   - Browser dev logs hanya berisi info React DevTools dev-mode; tidak ada error
     produk yang muncul pada snapshot final.

## Final Appointment Snapshot

Status appointment final pada disposable DB:

- `KEPALA_SEKOLAH`: `ACTIVE=1`.
- `KEPALA_TU`: `ACTIVE=1`, `ENDED=1`, `SUPERSEDED=2`.
- `WAKA_HUMAS`: `DRAFT=1`.
- `WAKA_KESISWAAN`: `ACTIVE=1`.
- `WAKA_KURIKULUM`: `ACTIVE=1`, `APPROVED=1`, `ENDED=1`.
- `WAKA_SARPRAS`: `ACTIVE=1`.

Pemangku aktif final:

- `KEPALA_SEKOLAH`: Drs. H. Abdul Karim, M.Pd.
- `KEPALA_TU`: Eko Wahyudi, S.T.
- `WAKA_KESISWAAN`: Rudi Hartono, S.E., M.M.
- `WAKA_KURIKULUM`: Lina Marlina, S.E.
- `WAKA_SARPRAS`: Fajar Nugroho, S.T.

## Cleanup Evidence

- API/web lokal QA di port `3300` dan `3301` dihentikan setelah evidence selesai.
- Container disposable `diis-waved-qa-keycloak`, `diis-waved-qa-redis`, dan
  `diis-waved-qa-postgres` dihapus.
- Network disposable `diis-waved-qa-net` dihapus.
- Folder fixture `.tmp/waved-qa` yang dibuat untuk QA ini dihapus setelah path
  diverifikasi berada di dalam workspace.
- Verifikasi akhir: tidak ada listener di port `3300/3301`, tidak ada container
  `diis-waved-qa-*`, dan tidak ada network `diis-waved-qa-net`.

## Notes For Reviewer

- Semua token, password, dan client secret disposable sengaja tidak dicantumkan
  dalam laporan.
- Mapper Keycloak userinfo ditambahkan hanya pada realm disposable agar local
  NextAuth browser menerima stable roles dari profile. Ini bukan perubahan source.
- Pembuatan draft UI memakai input tanggal typed/native karena automation
  `locator.fill()` pada date input tidak mengubah value browser; typed/native path
  berhasil dan review step menampilkan tanggal yang benar.
- Log server lokal memuat beberapa `POST /auth/heartbeat` 429 karena browser
  automation melakukan reload cepat berulang saat QA. Ini tidak memblokir flow
  appointment dan tidak muncul sebagai error console produk pada snapshot final.
- Log server lokal juga memuat satu request operator yang salah ke
  `/appointments//history` sebelum ID Sarpras ditemukan. Request berikutnya
  memakai UUID valid dan history endpoint berhasil.
- QA ini bukan staging sign-off. Setelah reviewer menerima runtime gate, lanjutkan
  explicit Git packaging sesuai daftar file Wave D, bukan broad staging.
