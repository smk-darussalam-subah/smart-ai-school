# Class Activity Private Media

Runbook ini menyiapkan penyimpanan privat foto Kegiatan Kelas. Foto tidak boleh
memakai public bucket atau URL eksternal. Aplikasi membaca dan menulis object
melalui API yang sudah menerapkan autentikasi dan scope kelas.

## Kontrak

- Bucket: nilai `CLASS_ACTIVITY_MEDIA_BUCKET` (default `diis-class-activities`).
- Object harus private; jangan pasang anonymous download policy.
- Service account hanya memperoleh akses object pada bucket tersebut.
- Kredensial hanya berada di environment VPS/staging, tidak di Git, log, atau laporan QA.
- Format yang diterima: JPEG, PNG, WebP; ukuran maksimal 5 MiB.
- Referensi database bersifat opaque dan tidak memuat nama guru, siswa, atau kelas.

## Preflight Staging

1. Pastikan MinIO sehat dan snapshot/backup tersedia.
2. Buat bucket bila belum ada menggunakan MinIO Console atau `mc` pada host terotorisasi.
3. Buat policy service account yang hanya mengizinkan list bucket serta get, put, dan delete object pada bucket Kegiatan Kelas.
4. Buat service account khusus staging. Jangan memakai root credential MinIO.
5. Isi environment staging berikut tanpa mencetak nilainya:

```text
CLASS_ACTIVITY_MEDIA_ENDPOINT=http://minio:9000
CLASS_ACTIVITY_MEDIA_ACCESS_KEY=<service-account-access-key>
CLASS_ACTIVITY_MEDIA_SECRET_KEY=<service-account-secret-key>
CLASS_ACTIVITY_MEDIA_BUCKET=diis-class-activities
CLASS_ACTIVITY_MEDIA_REGION=us-east-1
```

6. Validasi konfigurasi compose, deploy candidate SHA, lalu periksa health API.
7. Pastikan bucket tetap private dengan percobaan anonymous GET yang harus ditolak.

## Browser QA

Gunakan data sintetis tanpa PII nyata.

1. Guru pencatat mengunggah JPEG, PNG, dan WebP yang valid; gambar tampil setelah halaman dimuat ulang.
2. File di atas 5 MiB, MIME yang tidak didukung, dan file dengan magic byte palsu harus ditolak.
3. Guru lain pada kelas yang dapat dibaca tidak boleh mengganti atau menghapus media.
4. Pengguna pada kelas di luar scope tidak boleh membaca media, termasuk memakai URL langsung.
5. Siswa dan orang tua hanya dapat membaca media pada kelas yang sah.
6. Kaprog hanya dapat membaca media dalam jurusan appointment aktif.
7. Penggantian media menghapus object lama setelah binding baru berhasil.
8. Penghapusan catatan membersihkan object secara fail-soft tanpa mengembalikan catatan yang sudah terhapus.
9. Catatan legacy ber-URL eksternal tidak merender URL tersebut; guru pencatat dapat mengganti atau menghapus referensinya.
10. Ulangi jalur baca pada desktop `1440x900` dan mobile `390x844`.

## Evidence Minimal

- Candidate SHA dan waktu QA.
- Role/skenario dan hasil pass/fail tanpa nama atau kredensial pengguna.
- Status bucket private dan policy service account yang telah diredaksi.
- API log window yang membuktikan tidak ada secret, object key, URL eksternal, atau respons 5xx tak tertangani.
- Bukti cleanup fixture dan object QA.

## Rollback

1. Hentikan upload baru dengan rollback aplikasi ke SHA sebelumnya bila diperlukan.
2. Jangan mengubah bucket menjadi public sebagai workaround.
3. Pertahankan object selama referensi database masih ada.
4. Setelah rollback terverifikasi, rotasi service-account secret bila ada dugaan kebocoran.
