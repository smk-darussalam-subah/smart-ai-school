# Aktivasi sesi dan alur kerja guru

Tanggal awal: 20 Oktober 2026. Diperbarui 21 Oktober 2026 untuk follow-up gap workflow. Pemeriksaan source dan pengujian lokal sintetis; bukan penerimaan staging/production.

## Batas perubahan

Wave ini menutup pemeriksaan ulang R01–R03 dan menambahkan konfigurasi aktivasi sesi per semester sesuai mandat. Git, staging dan production tetap HOLD. Hanya satu tabel konfigurasi dan satu migrasi baru, tanpa dependency baru. Seluruh database yang digunakan disposable, terikat loopback.

## Urutan setelah admin menetapkan penugasan dan jadwal

| Tahap | Yang dilakukan manusia                                                          | UI dan penghubung yang ditemukan pada source                                                      | Batas penting                                                                                                                    |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Pengelola memeriksa tahun/semester, penugasan, jam pelajaran dan konflik jadwal | Jadwal, teaching assignments, bell manager; API schedules/teaching-assignments/bell-schedules     | Penugasan saja belum berarti jadwal atau sesi siap                                                                               |
| 2     | SA/TU/Waka Kurikulum memeriksa lalu mengonfirmasi aktivasi semester             | `SessionActivationPanel` → server actions → `/class-sessions/activation/*` → service/config/audit | Perlu role/jabatan aktif dan `academic.schedule.manage`; tidak otomatis aktif karena deploy atau membuka halaman                 |
| 3     | Guru memeriksa kelas/mapel/jadwal pribadinya                                    | Akademik → Ringkasan/kelas; Jadwal → sesi hari ini                                                | Jadwal rencana berbeda dari sesi yang benar-benar dimulai                                                                        |
| 4     | Guru menyusun dan mengajukan Modul Ajar                                         | `AkademikWorkspace`, modul/RPP actions → `/rpp`                                                   | Review kurikulum oleh Waka/Kaprog, final KS oleh aktor berbeda; bukan syarat otomatis untuk mulai ClassSession                   |
| 5     | Guru menyiapkan materi LMS dan asesmen bila diperlukan                          | Modul/Studio Penilaian → `/lms/modules`, `/assessment/sessions`                                   | Asesmen punya lifecycle sendiri; bukan ClassSession KBM                                                                          |
| 6     | Guru melakukan presensi pegawai sesuai kebijakan                                | Presensi Saya → `/staff-attendance`                                                               | GPS/lokasi/exemption mengikuti kebijakan existing; bukan presensi mengajar/siswa                                                 |
| 7     | Guru memulai sesi miliknya                                                      | Jadwal → Sesi hari ini → Mulai sesi → `/class-sessions/:id/start`                                 | Aktivasi harus on, sesi hari ini/semester aktif dan sumber sesuai; mulai paling awal 10 menit sebelum jadwal, sebelum akhir sesi |
| 8     | Guru mencatat kehadiran siswa                                                   | Ringkasan/Panduan mengajar → `AbsenModal` → `/attendance`                                         | Form ini **harian per kelas**, tidak mengirim ClassSession ID atau JP; jangan disebut absensi siswa per JP                       |
| 9     | Guru menjalankan pembelajaran/asesmen, mengoreksi dan memberi umpan balik       | Panduan Mengajar delapan langkah, studio/monitor/analisis/gradebook/remedial                      | Pergantian langkah panduan tidak otomatis membuktikan langkah itu telah tersimpan                                                |
| 10    | Guru mencatat jurnal                                                            | `JurnalModal` → `createJurnal` → `/class-activities`                                              | Jurnal sekarang terikat kelas/tanggal/guru; belum relasi terstruktur ke ClassSession/RPP/JP                                      |
| 11    | Guru menyelesaikan sesi                                                         | Jadwal → Selesaikan → `/class-sessions/:id/complete`                                              | Boleh saat otomasi off bila sesi STARTED dan guru tetap berwenang; tidak otomatis menyatakan semua absensi/jurnal/nilai lengkap  |
| 12    | Guru meninjau nilai/KKTP/capaian; wali kelas menyiapkan rapor                   | Penilaian/Capaian & Rapor; `RaporWaliKelas` → `/teachers/me/wali-classes`, `/report-cards`        | Wali kelas berasal dari relasi kelas existing, bukan satu jabatan baru; publikasi/persetujuan rapor tetap tahap tersendiri       |

## Guru dengan jabatan tambahan

Identitas dasar GURU tetap diperlukan untuk tindakan mengajar milik sendiri. Appointment aktif menambah kewenangan sesuai periode/scope/permission, bukan mengganti identitas menjadi role baru. Akun nonaktif, profil guru/pegawai diarsipkan, perubahan menjadi TU atau pencabutan izin tetap ditolak. PostgreSQL lokal membuktikan start/complete milik sendiri pada seluruh 15 kode appointment katalog.

| Kombinasi                                                                                                            | Kesimpulan UI/source saat ini                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guru biasa                                                                                                           | Workspace pengajaran tersedia; link sesi memerlukan permission read dan tombol operasional memerlukan manage + ownership                                                                                             |
| Guru + Wali Kelas                                                                                                    | Rapor Kelas muncul setelah lookup wali kelas berhasil; kewenangan kelas tetap diperiksa backend                                                                                                                      |
| Guru + Waka Kurikulum                                                                                                | Ada pemisah Pengajaran Saya / Operasional Kurikulum; wave ini memperbaiki prop izin tautan sesi yang sebelumnya tidak diteruskan ke workspace pribadi                                                                |
| Guru + Kepala Sekolah                                                                                                | Akademik menyediakan Pengajaran Saya dan Kepemimpinan Sekolah; default kepemimpinan, atau mode pribadi melalui pilihan ruang kerja/link pengajaran. Data pribadi diminta dengan scope own yang diverifikasi backend. |
| Guru + Kaprog                                                                                                        | Akademik menyediakan Pengajaran Saya dan Operasional Jurusan. Kelas pribadi di luar jurusan dapat dibaca melalui scope own; scope jurusan pada mode jabatan dan kewenangan mutasi tetap tidak diperluas.             |
| Guru + Waka Kesiswaan/Humas/Sarpras                                                                                  | Masih memakai jalur guru karena hanya KS/Wakakur/Kaprog dikecualikan dari cabang guru; pekerjaan jabatan tampil sesuai permission/modul existing, bukan otomasi KBM baru                                             |
| Guru + Kepala TU, Koor/Wakil Koor BKK, Koor/Wakil Koor Hubin, Guru BK, Bendahara, Staf Kepegawaian, Operator Dapodik | Hak mengajar pribadi tidak digantikan appointment; modul tambahan bergantung permission. Pengujian lifecycle sesi tidak membuktikan seluruh workflow domain jabatan tersebut lengkap                                 |

Pada Jadwal, Guru memakai **Sesi Saya** secara default. Guru dengan kewenangan jabatan dapat memilih **Sesi dalam Kewenangan Jabatan**; daftar ini tetap memakai batas existing. Backend scope own mengikat identitas ke profil Guru aktif milik akun saat pembacaan, bukan mempercayai teacherId dari browser. Pengujian PostgreSQL pada 15 appointment mencakup list pribadi, penolakan teacherId asing, serta start/complete. Ini tidak membuktikan seluruh domain jabatan tersebut lengkap.

## Celah yang harus dinyatakan, bukan disembunyikan

1. **Ruang pengajaran pribadi KS/Kaprog disambungkan pada source lokal 21 Oktober.** Consumer penugasan, jadwal/sesi, Modul Ajar, jurnal, LMS, asesmen, submission/remedial dan capaian memakai scope own. Pembacaan jabatan default dan mutasi tetap memakai pembatasan existing. Review independen dan E2E staging belum diklaim.
2. **Kehadiran siswa masih harian; jurnal belum tertaut terstruktur ke sesi.** Ini batas model/workflow existing. Menjadikannya per-JP atau mewajibkan kelengkapan sebelum complete memerlukan keputusan produk/schema di luar satu tabel yang disetujui.
3. **Gagal memuat daftar siswa dipisahkan dari data kosong pada source lokal 21 Oktober.** Pembacaan seluruh halaman harus sukses; respons rusak/parsial tidak dipakai untuk menyimpan. Absensi/nilai menyediakan retry dan menolak simpan sebelum daftar sah. Respons terlambat dari kelas sebelumnya tidak mengganti kelas aktif. Dialog tetap terbuka bila simpan gagal dan tidak dapat ditutup saat pengiriman berlangsung.
4. **Lookup wali kelas memiliki status memuat/gagal/siap pada source lokal 21 Oktober.** Tab Rapor Kelas tidak disembunyikan hanya karena lookup gagal. Retry tersedia; data lama tidak dipakai setelah pergantian periode. Tab baru disembunyikan ketika hasil sah menyatakan tidak ada kelas perwalian atau kewenangan rapor tidak ada.
5. Perubahan identitas penerima push terbukti dan diuji; **belum membuktikan penyebab exception notifikasi historis**. Observasi lama tetap terbuka sampai stack/network terikat reproduksi.

Permintaan persetujuan tambahan telah dikirim untuk tabel absensi siswa per sesi dan relasi opsional jurnal ke ClassSession. Sampai ada jawaban eksplisit, schema/migrasi tambahan itu **belum diimplementasikan**. Absensi harian existing, data historis, serta aturan completion tetap dipertahankan. Jangan menganggap checklist UI sebagai bukti absensi/jurnal per sesi telah tersimpan.

## Pemeriksaan lokal follow-up 21 Oktober

- Ruang pribadi tidak memberikan izin baru: global permission guard tetap berlaku; profil milik sendiri harus berstatus operasional, dan teacherId asing ditolak.
- Permintaan daftar pengajaran pribadi memakai scope own juga pada Guru biasa dan Guru dengan jabatan selain KS/Wakakur/Kaprog. Khusus Waka Kesiswaan, ini mencegah jurnal ruang pribadi tercampur pembacaan lintas-kelas yang sah pada modul jabatannya. Pengujian SSR meliputi Guru biasa serta seluruh 15 kode jabatan katalog; bukan bukti E2E seluruh domain jabatan.
- Mode pribadi tidak mengganti identitas jabatan. Perpindahan mode menyembunyikan panel tanpa membuang isian lokal; keyboard panah/Home/End didukung.
- Modal absensi/nilai memakai permukaan opaque, kontras kontrol dark/light, label form, batas layar kecil dan area sentuh 44 px. Klik simpan ganda dibatasi selama request; kegagalan transport ditampilkan, bukan sukses palsu.
- Nilai harus finite 0–100; siswa yang sudah tidak ada pada daftar aktif tidak dapat dipilih untuk penyimpanan berikutnya. Backend tetap sumber validasi dan otorisasi final.
- Bukti baru disimpan terpisah pada laporan `DIIS-TEACHER-WORKFLOW-GAP-2026-10-21`; receipt R04 dan laporan sebelumnya tidak ditimpa. Uji komponen browser lokal memakai aksi sintetis, bukan login Keycloak/API sekolah.

## Kualitas dan operabilitas

- Status belum terverifikasi ditampilkan eksplisit; bukan default off/sukses. Tidak ada retry mutasi otomatis setelah hasil tidak pasti.
- Konfirmasi aktivasi terikat preview/revision; dua konfirmasi bersamaan menghasilkan satu perubahan durable.
- Fokus dialog kembali ke pemicu/konteks. Bantuan dilipat; teks menggunakan istilah manusia, bukan “materialisasi”.
- Dialog memakai permukaan opaque, warna teks/tombol eksplisit pada dark/light dan ukuran sentuh minimal 44 px; akses keyboard dan mobile dicek pada komponen produksi lokal.
- Scan menggunakan timer API existing dan batas klaim 100; display dibatasi 100 delivery dan memeriksa sesi unik dalam satu transaksi. Ini bukan benchmark kapasitas atau jaminan SLA.
- Penerima eskalasi dan retry memakai tanggal sekolah WIB untuk masa jabatan bertipe tanggal; hari terakhir tetap inklusif. Scope jabatan tetap harus NONE tanpa jurusan untuk eskalasi KS/Waka.
- Cadence timer 60 detik berarti sesi yang baru memenuhi syarat dapat muncul pada scan berikutnya. Restart/rollover tidak membuat sesi historis; sesi berjalan tetap bisa dituntaskan setelah opt-out.
- Staging autentik, perangkat GPS/audio/push fisik, clean Linux artifact dan independent review tetap gate/batas bukti terpisah.
