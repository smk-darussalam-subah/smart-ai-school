# Assessment native wave pertama

Mandat pengguna pada 19 November 2026 mencakup implementasi lokal pratinjau siswa, perlindungan draft dan konfirmasi penutupan sesi. Gambar, rumus, XLSX dan Word diperiksa dan disiapkan sebagai rancangan beserta contoh template.

Baseline adalah main rilis #742, SHA `d1f58637f56391a491c7b4438fd9b9f25aa7098c`, tree `1f37c3c3e9a724ade5804fd5c8667c94c180dbd4`. Implementasi memakai checkout lokal terpisah `smart-ai-school-assessment-wave1-20261119`.

## Rencana

1. Gunakan kontrol jawaban dan renderer isi yang sama dengan siswa untuk pratinjau empat jenis soal. Interaksi pratinjau hanya menyimpan state lokal. Tampilan kunci/rubrik khusus Guru dapat dipilih. Periksa soal berformat, pilihan, pasangan, rubrik dan soal dari halaman Bank Soal berikutnya.
2. Lindungi penutupan Studio dan koreksi esai ketika ada pekerjaan belum disimpan. Beri penanda yang jelas dan pilihan melanjutkan atau membuang perubahan. Aktifkan peringatan browser ketika keluar halaman. Koreksi esai dipisahkan per peserta dan per soal agar ID kriteria yang sama tidak mencampur nilai.
3. Sebelum penutupan, baca ulang hasil melalui action yang sudah ada. Tampilkan peserta belum mulai, sedang mengerjakan, koreksi tertunda dan keputusan terlambat. Gagal membaca kesiapan memerlukan retry. Konfirmasi secara eksplisit sebelum satu request penutupan/sinkronisasi dikirim.
4. Uji logika baru dan regresi komponen, type-check/lint Web yang relevan, lalu browser lokal desktop/mobile untuk pratinjau, pembatalan, kegagalan simpan, fokus dialog dan penutupan. Data browser sintetis dan adapter diberi label pada laporan.
5. Siapkan rancangan interoperabilitas soal serta contoh XLSX dan DOCX yang menyertakan gambar/rumus IPAS, tipe soal, kunci dan rubrik. Nyatakan bahwa importer aplikasi saat ini mendukung CSV. Rancangan format baru tidak mengklaim importer baru sudah tersedia.
6. Selesaikan satu pemeriksaan akhir dan handoff dengan manifest literal, patch, hasil uji, screenshot serta batas bukti.

## Kriteria penerimaan

- Pratinjau merender rich text dengan kebijakan sanitasi yang sama, menampilkan semua tipe soal dan dapat diisi tanpa request start/autosave/submit/penilaian.
- Kunci, panduan jawaban dan bobot rubrik khusus Guru tidak dirender pada mode siswa.
- Tutup/Escape pada perubahan belum tersimpan meminta keputusan dan mempertahankan pekerjaan ketika dibatalkan. Gagal simpan mempertahankan isian. Nilai yang diubah setelah berhasil disimpan tidak lagi mengaku tersimpan.
- Data skor dua soal esai dengan ID kriteria sama tetap terpisah. Respons simpan yang sedang berjalan tidak ditandai sebagai simpan atas perubahan baru.
- Tombol penutupan membuka konfirmasi dan memuat ringkasan baru. Batal serta gagal GET mengirim nol request penutupan. Konfirmasi mengirim satu request, menangani gagal/ulang dengan jelas dan memperlihatkan hasil sebenarnya.
- Endpoint, izin, pemetaan UH/UTS/UAS, algoritma nilai, snapshot dan transaksi yang sudah ada tetap menjadi kontrak integrasi.
- Tampilan kecil dan keyboard tetap dapat mengakses tindakan utama. Dialog lanjutan muncul di depan dan fokus kembali secara masuk akal.

## Batas tahap

Git packaging, staging/production, schema, dependency aplikasi baru, jadwal ujian otomatis dan integrasi engine eksternal memerlukan tahap tersendiri. Kapasitas 725 tetap NOT PASSED menurut evidence sebelumnya. Hasil wave ini merupakan verifikasi Executor lokal, dengan independent re-review sebagai tindak lanjut.

Rekomendasi model untuk tindak lanjut
Task berikutnya: review independen semantik atas source dan bukti lokal, sebelum Git.
Model / effort: GPT-6.2 Sol (gpt-6.2-sol) / high.
Alasan: pratinjau bersama, isolasi nilai dan penutupan asesmen memerlukan penilaian lintas consumer.
Syarat kualitas: nol mutasi pratinjau; kerja belum tersimpan tidak hilang tanpa keputusan; konfirmasi memakai ringkasan terbaru.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
