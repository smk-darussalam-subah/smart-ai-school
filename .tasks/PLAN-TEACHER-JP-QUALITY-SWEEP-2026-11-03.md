# Pemeriksaan dan penyempurnaan scope Guru/JP — 3 November 2026

Mandat pengguna: periksa kembali paket lokal 92 path, buktikan integrasi role/menu dan beban pemakaian; perbaiki hanya setelah temuan cukup diperiksa. Git/index, staging, production HOLD. Tidak menambah dependency/schema.

Tahap pemeriksaan sebelum perbaikan:
1. Bind predecessor92 dan baca alur Beranda→Akademik→rekap→sesi/detail/audit/export.
2. Matriks role Guru/Wali/KS/Waka/Kaprog; denial siswa/ortu/TU tanpa grant. Surface predecessor Humas, credential dan cookie diregresikan secukupnya pada image yang sama.
3. Buktikan dugaan: parameter sesi KS/Waka, periode/tanggal saat berpindah semester, panel tersembunyi/background read, dan konsistensi filter/export.
4. Freeze daftar temuan+hasil probe; baru patch minimum beserta regresi yang gagal sebelum patch.
5. Type/lint/DB-HTTP/built-browser terarah, screenshot perubahan, manifest/preservasi dan handoff. #418 lama tidak ditutup lewat replay sukses.

Rute model tindak lanjut: GPT-6.1 Sol / high untuk semantic independent review. Actual model/effort tidak terverifikasi.
