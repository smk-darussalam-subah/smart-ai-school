# Integrasi rekap presensi JP — 3 November 2026

Mandat: implementasi lokal rancangan pengguna pada Downloads/DIIS_Paket_Prototype_Rekap_Presensi_Per_JP; dua indikator dan label sementara disetujui. Base f5dea2e2dce1dc81748768fd1f392fb475da74ee; predecessor 76 path disegel. Git, staging, production dan commissioning HOLD.

## Kontrak penerimaan

- Guru: sesi mengajar sendiri; Wali: rombel binaan; KS/Waka/Kaprog: cakupan server yang sah. Detail/export tidak memperluas akses.
- Kehadiran tercatat H/(H+I+S+A), kelengkapan (H+I+S+A)/(H+I+S+A+U); sementara bila U>0. N/C dikecualikan. Nol denominator tidak menjadi 0/100%.
- JP dinamis, tanggal WIB dan semester resmi; tidak menimpa absensi harian, histori atau rumus final learner/rapor.
- Ringkasan, tren, perbandingan JP/kelas, matriks bertanggal, rekap siswa, rincian kronologi/audit, sesi belum diisi dan export terhubung.
- Navigasi hijau DIIS; ringkasan Beranda ringkas; error/loading/empty/denied eksplisit, dialog opak dan fokus/Escape benar.
- Query bounded, data rincian terpaginasikan, tanpa request per siswa atau tabel/dependency baru.

## Urutan

1. Snapshot predecessor, baca model/kontrak/izin; keputusan: setiap JP menjadi jatuh tempo setelah waktu resmi JP berakhir.
2. Producer baca agregat terpisah, scope/DTO/controller; tetap gunakan catatan JP existing.
3. Consumer typed/actions/UI dan integrasi Guru/Wali/KS/Beranda.
4. Tes perilaku, PostgreSQL disposable + HTTP Nest/Fastify, built-browser dan screenshot; scope bukti/adapters dinyatakan eksplisit.
5. Completion sweep, manifest literal dan handoff reviewer. Tidak commit/push/deploy.

Keputusan schema/dependency/mutasi runtime baru memerlukan mandat terpisah. Aksi prototype yang belum mempunyai domain existing dipetakan sebelum implementasi; tidak dibuat menjadi tombol simulasi dalam aplikasi.

Keputusan tindak lanjut: gunakan sesi asal untuk guru pemilik dan rincian/audit existing untuk Wali/KS; alur permintaan/persetujuan koreksi baru ditunda.
