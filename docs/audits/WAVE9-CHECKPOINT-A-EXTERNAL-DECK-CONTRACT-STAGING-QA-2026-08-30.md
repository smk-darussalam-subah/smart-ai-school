# Wave 9 Checkpoint A External Deck Contract Staging QA

Tanggal: 2026-08-30

## Executive Status

`EXECUTOR QA PASS - READY FOR INDEPENDENT EXACT-SHA FREEZE REVIEW`

Affected browser matrix untuk kontrak deck keempat `Orang Tua dan Industri` lulus pada
staging. Tidak ditemukan P0, P1, atau P2 baru pada scope yang diuji. Checkpoint B tetap
HOLD sampai reviewer independen menyetujui exact-SHA freeze baru.

## Delivery Binding

- PR source ke `develop`: `#611`.
- Head source yang direview: `56637e2130e3681b9c779af983ebd4cc6e5cb320`.
- Merge `develop`: `940f13f3f0686b2ebfda231a2d1e1a6ae7217368`.
- PR promosi ke `staging`: `#612`.
- Staging/deployed SHA: `380a0708230d7ac3793e7303c105563de8ed3a4c`.
- Staging tree: `030ea15047811309c4de1a8f96eee1258333e085`.
- Deploy run: `33316348155`, sukses.
- Source delta: hanya tiga file manifest source yang disetujui reviewer.
- `main` tetap `76d64c6582fdf959d5868d89f36a3e36ea02beea` dan tidak disentuh.

## Runtime Preflight

- Checkout VPS staging berada tepat pada SHA `380a0708230d7ac3793e7303c105563de8ed3a4c`.
- `smk-staging-web` running.
- `smk-staging-api` healthy.
- API health: `status=ok`, database `up`.
- Prisma: 46 migration ditemukan dan schema database up to date.
- Tidak ada PR terbuka setelah promosi.
- Classic required approvals `develop`, `staging`, dan `main` kembali `1`.
- Ruleset `Protect Staging` dan `Protect main` aktif dengan required approvals `1`.

## Browser Matrix

Browser nyata menggunakan akun sintetis PII-safe pada shared staging. Credential, cookie,
token, UUID anak, dan data autentikasi tidak dicatat dalam laporan.

### Orang Tua

Status: `PASS`

- Halaman Akademik menyediakan tautan Panduan yang membawa selected-child context.
- Fixture memiliki dua anak sintetis.
- Setelah operator memilih anak kedua, parameter konteks berubah ke anak kedua.
- Seluruh sembilan tautan Help yang relevan mempertahankan selected-child context yang sama.
- Topik keluarga yang diharapkan tampil: Ruang Akademik, Status Remedial Anak, Rapor Resmi,
  Keuangan dan SPP, Pengumuman/Notifikasi, serta bantuan umum.
- Topik `Karier, Industri, dan Lowongan` tidak muncul pada proyeksi Orang Tua.
- `studentId` sintetis yang tidak dimiliki fail-closed: hanya tiga bantuan umum tampil dan UI
  meminta pengguna memilih anak yang sah.

### Industri

Status: `PASS`

- Help menampilkan tepat lima topik yang relevan untuk Industri.
- `Karier, Industri, dan Lowongan` tampil.
- Topik keluarga seperti Status Remedial Anak, Rapor Resmi, dan Keuangan/SPP tidak tampil.
- Tidak ada selected-child context atau data anak yang diproyeksikan ke persona Industri.

### Negative Cross-Persona

Status: `PASS`

- Orang Tua yang membuka langsung slug Industri menerima halaman generik `Panduan tidak
  tersedia` tanpa judul atau isi topik Industri.
- Industri yang membuka langsung slug Rapor menerima halaman generik `Panduan tidak tersedia`
  tanpa judul atau isi workflow keluarga.
- Registry source tetap membatasi `deck.family` kepada `SUPER_ADMIN` sebagai fasilitator
  internal; QA browser tidak mengubah deck menjadi self-service bagi persona eksternal.

## Responsive, Keyboard, and Runtime Quality

- Desktop `1440x900`: tidak ada horizontal overflow; `scrollWidth <= innerWidth`.
- Mobile `390x844`, Orang Tua: tidak ada horizontal overflow, seluruh link Help mempertahankan
  selected-child context, dan target link terlihat minimum 44 px.
- Mobile `390x844`, Industri: tidak ada horizontal overflow, target link terlihat minimum 44 px,
  dan tidak ada topik keluarga yang bocor.
- Keyboard: Tab dari searchbox berpindah ke tombol filter `Semua` secara berurutan.
- Fresh-tab console pada Help: tidak ada error atau warning aplikasi.
- Network reload: tidak ada respons HTTP 4xx/5xx atau loading failure tak terduga. Request fetch
  yang dibatalkan browser saat navigasi diklasifikasikan sebagai `canceled=true`, bukan kegagalan
  aplikasi.

## Privacy and Containment

- Seluruh akun dan anak merupakan fixture sintetis staging.
- Evidence laporan tidak menyimpan nama login, email, credential, cookie, token, maupun UUID.
- Tidak ada mutation database, Keycloak, schema, infrastructure, production, atau `main`.
- Tidak ada screenshot provisional yang dipromosikan menjadi artefak Checkpoint B.

## Freeze Candidate

Kandidat exact-SHA freeze baru:

- application/deployed SHA: `380a0708230d7ac3793e7303c105563de8ed3a4c`;
- application tree: `030ea15047811309c4de1a8f96eee1258333e085`;
- shared-auth production SHA tetap `76d64c6582fdf959d5868d89f36a3e36ea02beea`;
- theme manifest tetap `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`.

Freeze belum dinyatakan final oleh Executor. Reviewer independen harus memverifikasi delivery
binding, application tree, evidence browser, protection, dan ketiadaan source delta lanjutan.

## Next Gate

1. Independent reviewer menilai laporan ini dan exact-SHA freeze candidate.
2. Jika tidak ada P0/P1/P2, permanenkan laporan Executor dan reviewer melalui docs-only Gitflow.
3. Pastikan application tree tidak berubah setelah docs promotion.
4. Baru mulai ulang Checkpoint B dan hasilkan 40 screenshot, 24 PDF, 4 deck, serta adoption
   package dari freeze baru.
5. Artefak provisional dari freeze lama tidak boleh digunakan kembali.
