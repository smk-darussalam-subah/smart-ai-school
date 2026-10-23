# Rekap pembelajaran — Guru dan Kepala Sekolah

Implementasi lokal 21 Oktober 2026. Git dan seluruh runtime sekolah tetap HOLD.

## Akses dan navigasi

- Akademik → **Pembelajaran Saya** untuk pengajaran pribadi Guru, termasuk Guru dengan jabatan. Semua permintaan sesi pribadi memakai `scope=own`; backend tetap memeriksa identitas Guru operasional dan izin efektif.
- Akademik → **Rekap Pembelajaran** pada ruang Kepemimpinan Sekolah untuk KS. Cakupan pemantauan tetap ditentukan API, bukan pilihan filter browser.
- Tautan `?view=learning-recap` membuka tab yang sesuai pada ruang kerja yang dipilih. Pemilihan ruang kerja pribadi/jabatan existing tetap berlaku.
- Navigasi kiri, tema DIIS, Panduan Mengajar, rekap nilai lama, dan Rekap Audit dipertahankan. UI tidak membuat sesi, jurnal, modul atau presensi hanya karena halaman dibuka.

## Kontrak data dan tindakan

1. Filter tanggal maksimal 31 hari inklusif, tahun ajaran dan semester wajib. Semua halaman diambil melalui pembaca paginasi existing; respons parsial, duplikat, berubah jumlah, atau malformed tidak dipakai untuk mengesahkan hitungan lengkap.
2. KS melihat satu kelompok per **ID guru**, bukan per nama atau per penugasan. Guru melihat sesi miliknya. Filter guru/kelas/status diterapkan pada hasil lengkap yang sudah dibatasi API. Pagination tidak membatasi hasil ekspor.
3. Angka Total/Selesai/Berlangsung/Terjadwal berasal dari status ClassSession. Gagal, belum dimuat, dan akses ditolak berbeda dari hasil kosong yang sah. Sesi terlewat/dibatalkan/diganti tetap dapat ditampilkan melalui filter status, tidak dihitung sebagai terjadwal.
4. Rincian mengotorisasi ulang ID sesi sebelum meminta data pendukung. Tidak menerima classId/teacherId dari browser sebagai dasar akses. Masing-masing modul sumber tetap mempunyai permission guard dan scope existing. Tidak ada grant atau mutation endpoint baru.
5. Modul ditampilkan berdasarkan guru + kelas + mapel + tahun/semester. Modul tersedia **bukan bukti digunakan**. Jurnal berdasarkan guru + kelas + tanggal, **belum ditautkan ke pertemuan tertentu**. Asesmen dibatasi ID penugasan + guru + kelas + periode; bukan bukti asesmen dilakukan pada sesi tersebut.
6. Absensi siswa tetap **harian per kelas/tanggal**. Data tersimpan tidak disebut absensi independen per JP. Form entri hanya ditawarkan ketika hasil baca harian sah dan kosong; kegagalan membaca tidak mengaktifkan entri baru. Konflik atau perubahan data setelah baca tetap diputuskan server existing.
7. Mulai/selesai memakai aksi ClassSession existing, permission manage, dan `canOperate` dari server. UI menahan pengiriman ganda dan mempertahankan idempotency key pada kegagalan ambigu. KS tidak memiliki tombol tulis meskipun akun juga memiliki identitas Guru; beralih ke Pengajaran Saya untuk sesi sendiri.
8. Panduan Mengajar tetap flow existing dan berbeda dari status sesi server. Pembukaan panduan tidak otomatis menandai sesi STARTED. Langkah berikutnya tidak otomatis menyimpan kehadiran/jurnal/nilai. Riwayat hanya memuat timestamp lifecycle yang benar-benar tersimpan, bukan aktivitas membuka dokumen yang tidak dicatat.
9. Jurnal tidak lagi mengarang urutan pertemuan dari jumlah catatan kelas atau mengisi kegiatan seolah sudah dilaksanakan. Guru menulis kegiatan sebenarnya; ada validasi, penahan double-submit, hasil gagal yang mempertahankan isian, dan konfirmasi sukses eksplisit.
10. Setelah dialog pendukung ditutup, rekap/rincian dimuat ulang tanpa menghapus filter. Respons dari permintaan lama diabaikan; data periode/konteks lama tidak ditampilkan sebagai terbaru.

## Dokumen

Cetak/Simpan PDF berwarna atau hitam-putih dan Excel mengambil seluruh hasil filter; dari rincian hanya sesi terpilih. Tahun ajaran, semester, periode, cakupan, guru, kelas, nama/kode resmi mapel bila tersedia, JP jadwal, waktu WIB, status, serta waktu mulai/selesai tersimpan disertakan. Dokumen tidak menyatakan catatan pendukung lengkap hanya karena sesi selesai. Jika katalog kode gagal, gunakan nama mapel lengkap, bukan kode buatan.

JP di rincian merupakan JP pada sumber jadwal terkait. Waktu rencana dan lifecycle berasal dari catatan sesi. Tidak ada kolom snapshot JP baru atau backfill historis yang diada-adakan pada wave ini.

## Batas

Tidak ada schema, migrasi, dependency, permission grant, perubahan sidebar global atau deployment baru. Relasi per-pertemuan yang belum ada tidak dipalsukan. UI hanya menampilkan sumber yang benar-benar tersedia dan membedakan gagal-muat dari kosong. QA komponen sintetis bukan authenticated staging E2E, pengujian perangkat GPS/push fisik, atau clean Linux standalone.
