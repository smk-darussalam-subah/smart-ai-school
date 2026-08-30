# Matriks Peran, Fitur, dan Persetujuan

| Kelompok | Fokus utama | Sumber kewenangan | Persetujuan sebelum mutasi penting |
| --- | --- | --- | --- |
| Super Admin | konfigurasi, pengguna, periode, monitoring | identity role dan permission | ikuti gate Git/operasional; tidak mengambil keputusan pedagogis guru |
| Tata Usaha | siswa, PPDB, kelas, kalender, keuangan | identity role, permission, dan scope | verifikasi periode dan data sumber |
| Guru | jadwal, Modul Ajar, asesmen, remedial | Teaching Assignment aktif | review guru sebelum publish/finalisasi |
| Wali Kelas | Rapor kelas | relasi Wali Kelas aktif | snapshot dan periode harus benar |
| Kepala Sekolah | oversight, Rapor, penutupan semester | Appointment aktif | close semester hanya setelah readiness lulus |
| WAKA/KAPROG | oversight sesuai bidang atau jurusan | Appointment aktif dan scope | tidak memperluas scope ke bidang lain |
| Siswa | tugas, asesmen, remedial, Rapor sendiri | ownership siswa | tidak dapat membaca data siswa lain |
| Orang Tua | Rapor, keuangan, remedial anak terpilih | selected-child ownership | pilih anak secara eksplisit; tautan salah anak ditolak |
| Industri | kemampuan yang benar-benar tersedia | identity role INDUSTRI | workflow yang belum tersedia tetap ditampilkan jujur |

## Prinsip

- Stable identity berada di Keycloak; jabatan period-bound berada pada Appointment DIIS.
- Teaching Assignment menentukan konteks guru, kelas, mapel, dan tahun ajaran.
- Mode tinjau hanya menyempitkan tampilan. API tetap memeriksa authority akun asli.
- SUPER_ADMIN wildcard tidak boleh dipakai untuk menyamarkan kekurangan mapping operasional.
