# Optimasi lokal beban campuran 725 akun

Mandat 4 November 2026: rencana terarah, implementasi optimasi lokal, kemudian uji ulang. Git, staging, production, shared ingress sekolah dan commissioning HOLD. Tidak menambah dependency, tabel/migrasi atau layanan aplikasi.

## Baseline dan kontrak

- Checkout teacher-workspace-20261102, HEAD f5dea2e2dce1dc81748768fd1f392fb475da74ee; kandidat lokal 109 path, aggregate cf76ca2c718c3e2d1d7988f12dfcbe9fb8edbd9e5eb7dbc340c3b71f68e2a20e.
- Bukti asal: output/mixed725-cpx-simulation-20261104, sealed manifest 687 artefak. CPU bersama 2 vCPU, layanan 3.200 MiB dalam anggaran 4 GB, pool 5, satu NAT, 350 siswa/350 ortu/20 guru/5 TU, 40 soal, 56.000 JP.
- Baseline CPU bersama: 37.765 request, 8.017 gagal, normal p95 31,63 detik. Semua 350 jawaban/revisi/nilai/Grade akhir benar. P2024/P2028, admission sibuk, 401/403 saat lookup gagal, dan 429 ingress dicatat terpisah.
- Bukti lama, termasuk kegagalan setup dan keterbatasan harness, tidak dihapus. Tidak mengubah perhitungan JP/KKTP/nilai, batas kewenangan, revokasi/logout, atau histori.

## Manajemen eksekusi

Satu pemilik eksekusi dan satu log keputusan di output/mixed725-optimization-20261104. Tiap tahap mempunyai masukan, keluaran, gate, serta anggaran pengujian. Optimasi satu kelompok dahulu; hanya naik tahap jika perbaikan terukur dan kontrol keamanan tetap lulus. Tidak mendelegasikan atau membuat chat baru.

| Tahap | Pekerjaan | Keluaran / syarat lanjut |
|---|---|---|
| R0 | Verifikasi baseline, source/image, ruang disk dan lab kosong | 109 path terjaga; semua operasi hanya disposable lokal |
| R1 | Profil CPU/thread, hitungan/bentuk query dan lama operasi; kalender serentak lalu campuran 90 detik | Hotspot dominan teridentifikasi dengan data, bukan menebak dari P2024 |
| R2 | Perbaiki pekerjaan berulang pada hotspot: formatter/perhitungan, projection/read model atau penggabungan lookup dalam satu request jika terbukti | Before/after kecil + kesetaraan data; tidak memakai cache kewenangan lintas request baru |
| R3 | Bila masih diperlukan, atur antrean baca/heartbeat/simpan secara terbatas dan pemulihan kegagalan sementara | Tidak mematikan guard/admission; final submit dan revisi tidak kalah oleh pekerjaan latar |
| R4 | Focused unit/HTTP/PostgreSQL untuk delta, kemudian image Linux dan jalur browser yang benar-benar terpengaruh | Izin salah akun/anak/kelas, revoke/disabled, replay/race, simpan terakhir tetap aman |
| R5 | Ulangi resep penuh identik 725 akun pada CPU bersama 2/RAM4 | Normal/soak error <1%, baca p95 <=2s, tulis p95 <=5s; snapshot semua kegagalan dan intent |
| R6 | Completion sweep, manifest literal delta, laporan dan handoff independent review | Klaim sesuai lapisan bukti; tidak ada Git/deploy |

## Urutan pengambilan keputusan

1. Hilangkan CPU/round-trip yang tidak memberi nilai, sebelum menaikkan pool atau timeout.
2. Prefer optimasi deterministik tanpa cache data bisnis: projection, reuse formatter tetap, indeks lookup lokal dalam satu perhitungan, atau satu pembacaan authority per request yang tetap diverifikasi ulang di titik transaksi mutasi.
3. Jangan memperkenalkan stale-allow, cache relasi anak lintas-request, atau melewati pembacaan revokasi. Kegagalan DB tetap tidak memberikan akses; pemulihan dapat membedakan layanan sibuk dari identitas tidak sah.
4. P2028 tidak otomatis berarti pool harus diperbesar; profil CPU, lama transaksi, dan antrean harus dibedakan. Pool/timeouts dasar tetap pada replay utama agar perbandingan sah.
5. Rate limit ingress adalah kontrol yang sah. Tidak menaikkan shared ingress sekolah. Raw burst dan alur retry aplikasi, jika disentuh, diuji terpisah; retry sukses tidak menghapus kegagalan pertama.
6. Jika akar masalah membutuhkan dependency/schema/infrastruktur baru, hentikan langkah yang bergantung padanya untuk keputusan pengguna; lanjutkan pekerjaan lokal independen yang masih sah.

## Matriks kualitas yang wajib dipertahankan

- Tepat 350 respons akhir/revisi/jawaban lengkap, nilai dan Grade sumber asesmen; tidak ganda.
- Siswa/ortu hanya data sendiri/anak aktif; guru cakupan penugasan; KS/Waka cakupan sah; TU tanpa hak tetap ditolak.
- Permission, posisi, status akun, relasi dan logout yang dicabut tetap berlaku, termasuk saat request antre. Optimasi guard tidak mengganti pemeriksaan transaksi.
- JP beririsan/campuran/historis tetap dihitung identik. Tidak menganggap belum diisi sebagai Alpha.
- Semua intent = terkirim + digabung + tertahan pembangkit; 429/503/timeout dan late callbacks tetap terekam.
- Jika perubahan menyentuh shared auth/browser, jalankan authorized/denied/recovery pada build nyata; adapter HTTP tidak menggantikannya.

## Batas klaim dan penghentian

Baseline ini API/controller terpilih + PostgreSQL + Nginx, bukan 725 browser atau Keycloak/Next penuh. Tidak mengklaim kapasitas production dari hasil lokal. Pengujian berat dihentikan bila lab OOM, ruang disk tidak memadai atau objek tidak lagi cocok label/nama disposable. Container/volume/cgroup milik task dibersihkan setelah evidence disimpan; histori sekolah tetap utuh.

Rekomendasi model untuk tindak lanjut: GPT-6.1 Sol (gpt-6.1-sol) / high untuk eksekusi dan review semantik terarah; naik xhigh bila perlu mengubah koordinasi transaksi/authority. Model/effort aktual sesi tidak terverifikasi. Pemilihan model tetap manual.
