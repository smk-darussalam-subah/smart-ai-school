# Runbook — Akun Inspektur Multi-Role + Mode "Masuk sebagai"

## Tujuan
Satu akun (default `inspector`) memegang SEMUA 7 role untuk meninjau dashboard
tiap peran tanpa berganti akun.

## Pembuatan akun (VPS, sekali jalan, idempoten)
```bash
cd /home/appuser/smart-ai-school
./scripts/create-inspector-account.sh          # default: inspector
# password admin master + password baru diketik interaktif (tidak masuk log)
```

## Cara pakai
1. Login sebagai `inspector` → sidebar menampilkan blok **Masuk sebagai**
   (muncul otomatis untuk semua akun ber->1 role).
2. Pilih peran → seluruh dashboard (sidebar, halaman, gate) dirender sebagai
   peran itu; banner kuning 👁 menandai mode tinjau + tombol kembali.
3. "Semua peran (asli)" mengembalikan tampilan penuh.

## Batasan yang DISENGAJA (keamanan)
- Cookie `diis_view_as` hanya MENYEMPITKAN tampilan; role yang tidak dimiliki
  user diabaikan server (tak bisa impersonate lewat cookie).
- Token API tidak berubah → backend tetap menilai role asli. Akibatnya data
  yang tampil = data yang boleh dilihat role TERTINGGI akun (mis. daftar siswa
  penuh, karena token SA). Untuk menguji OWNERSHIP data (siswa hanya melihat
  miliknya), tetap gunakan akun role-tunggal sungguhan.
- Halaman GURU yang butuh profil guru (presensi check-in, RPP) akan 404
  "Profil guru tidak ditemukan" untuk inspector — buat baris Teacher tertaut
  bila ingin menguji alur tsb (lihat catatan SQL di bawah).

## (Opsional) Profil Teacher/Student untuk inspector
```sql
-- ganti <KEYCLOAK_ID> dengan id user inspector di Keycloak
INSERT INTO auth.users (keycloak_id, email, full_name, role)
VALUES ('<KEYCLOAK_ID>', 'inspector@smkdarussalamsubah.sch.id', 'Inspektur DIIS', 'SUPER_ADMIN')
ON CONFLICT (keycloak_id) DO NOTHING;
INSERT INTO teacher.teachers (user_id)
SELECT id FROM auth.users WHERE keycloak_id = '<KEYCLOAK_ID>'
ON CONFLICT (user_id) DO NOTHING;
```
