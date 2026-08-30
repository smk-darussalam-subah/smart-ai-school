# Paket Adopsi DIIS Wave 9

Paket ini membantu sekolah menjalankan pelatihan dan pilot secara bertahap dengan data sintetis sebelum memakai data nyata.

## Baseline

- Application SHA: `380a0708230d7ac3793e7303c105563de8ed3a4c`
- Application tree: `030ea15047811309c4de1a8f96eee1258333e085`
- Shared-auth production SHA: `76d64c6582fdf959d5868d89f36a3e36ea02beea`
- Theme manifest SHA-256: `038f82f39d8419e5e398b6f63bbe6edf2c7b756cfbd06f792163b6a9c3b514f5`

## Isi

1. `role-feature-approval-matrix.md` untuk batas kewenangan.
2. `quick-start-checklists.md` untuk langkah awal tiap kelompok pengguna.
3. `train-the-trainer-plan.md` untuk menyiapkan fasilitator internal.
4. `synthetic-exercises.md` untuk latihan tanpa data pribadi nyata.
5. `pilot-sequence.md` untuk urutan pilot dan kriteria lanjut.
6. `issue-intake-and-response.md` untuk pelaporan serta tindak lanjut kendala.
7. `real-data-readiness-checklist.md` untuk keputusan penggunaan data nyata.
8. `backup-real-data-readiness-seed-handoff.md` untuk kesiapan backup dan fixture.
9. `decks/` berisi empat presentasi pengenalan yang menjelaskan DIIS, masalah yang diselesaikan, tujuan, fitur utama, glosarium, ilustrasi pendukung, dua sampel tampilan per audiens, dan catatan sumber pada setiap slide.

## Batas Operasional

Automation aktivasi Appointment harian di production belum aktif. Ini adalah prasyarat go-live dan tidak boleh ditulis sebagai kemampuan operasional yang sudah berjalan.

Semua latihan memakai akun dan fixture sintetis. Jangan masukkan kata sandi, token, pairing code, data siswa nyata, atau informasi pribadi ke laporan maupun screenshot.

## Catatan Presentasi

- Setiap deck berisi sembilan slide: pengenalan DIIS, masalah, tujuan, fitur, dua sampel tampilan, glosarium, dan penutup berbasis tindakan.
- Ilustrasi dibuat khusus untuk membantu pemahaman. Ilustrasi bukan bukti fitur; bukti tampilan tetap berasal dari screenshot aplikasi frozen.
- Seluruh karakter perempuan pada ilustrasi menggunakan hijab yang pantas, termasuk figur latar. Kebijakan visual ini tidak mengubah screenshot bukti produk.
- Generator berada di `apps/web/scripts/generate-help-decks.mjs`. Setelah generate, jalankan `apps/web/scripts/normalize-help-decks.py` agar paket PowerPoint memiliki hash yang deterministik, lalu validasi dengan `apps/web/scripts/validate-help-decks.py`.
