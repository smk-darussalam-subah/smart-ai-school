# RFC-2J — Provisioning User 7-Role via Dashboard & Relasi Siswa–Orang Tua Wajib

> Status: PROPOSED · Penulis: Claude (Fable 5) · 2026-06-12
> Pemicu: arahan Director — (a) siswa minimal punya data ortu + telepon ortu;
> (b) tambah siswa via dashboard SA/TU; (c) Manajemen User per-7-role, bukan
> daftar nama; (d) pembuatan 7 entitas via dashboard, Keycloak mencatat &
> auto-generate UUID — tanpa buka console Keycloak.

---

## 1. Kondisi AS-IS (hasil riset kode, bukan asumsi)

| # | Fakta | Bukti | Dampak |
|---|-------|-------|--------|
| A1 | `POST /students` mewajibkan `userId` (auth.users.id) yang SUDAH ada — admin harus membuat user di Keycloak console, login pertama agar tersinkron, lalu salin-tempel UUID internal ke SiswaForm | `create-student.dto.ts:5`, `SiswaForm` field "User ID (Keycloak UUID)" | Alur 3-langkah lintas-sistem, rawan salah tempel; praktis menghalangi TU |
| A2 | `parentId` opsional; `User.phone` nullable | schema `Student.parentId String?` | Siswa tanpa wali sah secara sistem; notifikasi WA (fitur inti: SPP, rapor, absensi) TIDAK BISA menjangkau ortu |
| A3 | Modul `users` hanya GET/PATCH(role,active) — TIDAK ADA create; UI = daftar datar by name | `users.controller.ts` | Pembuatan akun apa pun = kerja manual console Keycloak |
| A4 | 🐞 **BUG LATEN**: `PATCH /users/:id/role` hanya update kolom DB; realm role Keycloak TIDAK diubah → token & RBAC tetap role lama; DB dan token bertentangan diam-diam | `users.service.updateRole()` tanpa sentuhan KC | Perubahan role dari dashboard = ILUSI; fondasi dua-sumber-kebenaran yang harus dibereskan SEBELUM provisioning |
| A5 | Client `diis-api` (confidential, secret sudah di env) ber-`serviceAccountsEnabled: false`; satu-satunya kredensial admin = `KC_ADMIN_PASSWORD` master | realm-diis.json, .env.example | Belum ada jalur aman aplikasi→Keycloak Admin API |
| A6 | `auth.users.keycloakId` NOT NULL UNIQUE | schema:30 | Setiap entitas (termasuk ortu) HARUS punya identitas Keycloak — desain harus merangkul ini, bukan melawan |

## 2. Prinsip desain (alasan di balik rekomendasi)

1. **Keycloak = sumber kebenaran identitas & role; DB = cermin + data domain.**
   Konsekuensi: SEMUA tulis identitas (create/role/enable) lewat satu pintu
   aplikasi yang menulis KEDUANYA secara atomik-terkompensasi. (Memperbaiki A4.)
2. **Least privilege ganda:** (i) aplikasi ke KC memakai **service account
   `diis-api`** dengan HANYA `manage-users` + `view-users` realm-management —
   master `KC_ADMIN_PASSWORD` tidak pernah disentuh aplikasi; (ii) penerbit akun:
   SA → semua role; TU → GURU/SISWA/ORANG_TUA/INDUSTRI; KS/lainnya → tidak.
3. **Ortu = kebutuhan komunikasi, bukan sekadar relasi.** Telepon ortu wajib
   karena WA adalah kanal inti (SPP/rapor/absensi). Satu ortu ↔ banyak anak
   (siblings) lewat DEDUP by nomor telepon.
4. **Additive & aman migrasi:** kolom DB lama tidak di-NOT-NULL-kan paksa;
   pemaksaan di API + laporan backfill. (Konsisten doktrin proyek.)
5. **Saga, bukan doa:** KC sukses tapi DB gagal → kompensasi hapus user KC;
   tidak ada akun setengah-jadi. Idempoten via username/email unik + pre-flight.

## 3. Desain TO-BE

### 3.1 KeycloakAdminService (fondasi)
- Auth: client-credentials `diis-api` (secret sudah ada di env — TANPA secret baru).
- Aktifkan service account + role `manage-users`,`view-users` (perubahan
  realm-diis.json + runbook langkah manual utk realm prod yang tidak di-reimport).
- Kemampuan: createUser (return UUID), setTempPassword(+requiredAction
  UPDATE_PASSWORD), assign/removeRealmRole, enable/disable, findByUsername/Email.
- Token di-cache (exp-aware), retry ringan, FAIL-CLOSED (KC down → 503 jelas,
  bukan akun separuh).

### 3.2 ProvisioningService + API
```
POST /provision/users        body: { role, profil umum, payloadRole }   (SA; TU utk subset)
POST /provision/students     body: { siswa: {nis, nama, kelas, ...},
                                     ortu: { name, phone* , email? }    ← WAJIB
                                     opsi: { reuseParentByPhone: true } }
```
Alur students: (1) dedup ortu by phone → pakai akun ortu existing ATAU provision
ortu baru (KC username = nomor HP, temp password, role ORANG_TUA);
(2) provision akun SISWA (username = NIS); (3) transaksi DB: users(siswa,ortu)
+ students(parentId terisi); (4) gagal di mana pun → kompensasi KC.
Respons memuat kredensial sementara SEKALI-TAMPIL (tidak disimpan/dilog —
selaras redaksi audit).

`PATCH /users/:id/role` DIREPARASI: assign realm role KC + update DB +
invalidasi cache permission (sudah ada) — satu transaksi terkompensasi.

### 3.3 Kebijakan kredensial & username
| Role | Username | Password awal |
|---|---|---|
| SISWA | NIS | temp + wajib ganti |
| GURU/TU/KS/SA | email (atau NIP) | temp + wajib ganti |
| ORANG_TUA | nomor HP | temp + wajib ganti |
| INDUSTRI | email | temp + wajib ganti |

### 3.4 UI
- **Manajemen User v2**: 7 TAB per role + badge jumlah; tabel per tab
  (kolom relevan per role, mis. tab Siswa: NIS/kelas/wali); tombol
  "+ Tambah {Role}" → wizard provisioning; pencarian dalam-tab.
- **Data Siswa**: SiswaForm lama DIGANTI wizard yang sama (seksi Identitas +
  seksi Wali wajib — meniru form 2-bagian KamilEdu M2); field "User ID
  (Keycloak UUID)" DIHAPUS TOTAL.
- Laporan kelengkapan: kartu "Tanpa Wali" (sudah ada di KamilEdu M2) → klik =
  daftar siswa legacy tanpa ortu + aksi "Lengkapi Wali" per baris.

### 3.5 Keamanan & kepatuhan
- Permission baru: `user.provision` (SA, TU-subset di-enforce di service per
  role target — bukan cuma guard).
- Telepon/ortu = PII → tambah `phone` ke denylist redaksi audit (gap kecil
  ditemukan saat riset); kredensial temp tidak pernah masuk log/audit/WA.
- Rate-limit endpoint provisioning (Throttler sudah global).
- UU PDP: pencatatan ortu = pelaksanaan kontrak layanan sekolah; tetap masuk
  cakupan R-05 consent saat go-live data nyata (gerbang existing, tidak berubah).

## 4. Alternatif yang DITOLAK (dan alasannya)
1. *Keycloak User Federation / sinkron DB→KC* — kompleksitas operasional tinggi,
   melawan arsitektur token-first yang sudah jalan.
2. *parentId NOT NULL via migrasi paksa* — meledakkan data legacy & alur PPDB;
   pemaksaan di API + backfill = hasil sama tanpa risiko.
3. *Ortu tanpa akun KC (kolom lepas di students)* — melanggar A6, mendua-kan
   identitas, mematikan portal ortu yang SUDAH ada (nilai/SPP anak).
4. *Aplikasi memakai master admin KC* — blast radius penuh bila bocor; service
   account scoped adalah praktik standar.

## 5. Rencana eksekusi (SERIAL, tiap fase ber-gerbang bukti)
| Fase | Isi | Bukti gerbang |
|---|---|---|
| 2J-1 | Enable service account diis-api (+realm json+runbook prod), KeycloakAdminService + test (mock HTTP) | unit hijau; di staging: curl token client-credentials → 200; create+delete user uji |
| 2J-2 | ProvisioningService + POST /provision/* + saga + FIX A4 (role sync) + permission `user.provision` + denylist `phone` | e2e staging: provision guru → login nyata sukses; matikan KC → 503 bersih tanpa residu |
| 2J-3 | Create-siswa wajib ortu (dedup by phone) + GET /students/without-parent + laporan | provision siswa+ortu sekali jalan; siblings → parentId sama; siswa tanpa ortu DITOLAK 400 |
| 2J-4 | UI: Users v2 (7 tab + wizard) + SiswaForm wizard (hapus UUID) + halaman lengkapi-wali | tinjau via akun inspektur; smoke 7 tab |
| 2J-5 | Backfill: laporan siswa legacy tanpa wali → TU melengkapi; tutup | count without-parent menurun → 0 |

Estimasi: 2J-1+2J-2 = 1 sesi; 2J-3+2J-4 = 1 sesi; 2J-5 operasional TU.
Dependensi: TIDAK menabrak 2I (file berbeda); butuh 2H sudah merged ✓.

## 6. Risiko utama
| Risiko | Mitigasi |
|---|---|
| KC Admin API berubah perilaku antar versi (24.x) | pin endpoint yang dipakai + integration test di staging realm |
| Duplikasi nomor HP ortu beda-orang | konfirmasi UI saat dedup match ("gunakan wali existing X?") — bukan auto-silent |
| Kredensial temp tercecer | sekali-tampil, tak disimpan; requiredAction memaksa ganti |
| Provision massal PPDB nanti | desain service sudah batch-ready (loop saga per-item), UI massal = fase terpisah |

---

# ADDENDUM v1.1 — Hasil Validasi Ulang (2026-06-12, atas mandat Director)

> Metode: bedah-ulang rencana sendiri + verifikasi kode untuk tiap asumsi.
> Hasil: rencana inti TETAP VALID; 4 celah di RFC v1.0 ditambal; 1 temuan
> KRITIS baru menggeser urutan; 8 blind-spot proyek diangkat ke Director.

## V1. Temuan KRITIS baru — A4b: "Nonaktifkan user" = ilusi total
Verifikasi kode: `updateActive()` hanya flip kolom DB; `isActive` TIDAK dicek
di guard/auth path mana pun (grep nol); KC tidak disentuh. **User yang
dinonaktifkan dari dashboard tetap bisa login dan memakai seluruh API.**
→ **2J-0 (HOTFIX, duluan, kecil):** (a) AuthGuard menolak token milik user
`isActive=false`/`deletedAt` (lookup ber-cache TTL 5 mnt, pola PermissionsService,
fail-closed); (b) `updateActive` juga men-disable user di KC begitu
KeycloakAdminService ada (2J-1) — KC = saklar utama, guard = sabuk pengaman.

## V2. Celah RFC v1.0 yang ditambal
| # | Celah | Tambalan |
|---|-------|----------|
| C1 | `auth.users.email` NOT NULL+UNIQUE, padahal ortu/siswa sering tanpa email | Kebijakan email sintetis: `{nis}@siswa.…sch.id`, `{phone}@ortu.…sch.id`; email asli menggantikan saat tersedia |
| C2 | Dedup ortu by phone TANPA normalisasi → `0812…` ≠ `+62812…` = dobel akun | Util normalisasi E.164 (default +62) WAJIB sebelum simpan/cari; terapkan juga saat kirim WA |
| C3 | `updateRole` semantics utk akun multi-role (inspector!) tidak terdefinisi | Definisi: dashboard role = REPLACE role tunggal kanonik; akun multi-role dikelola via flag khusus & DILINDUNGI dari updateRole; **proteksi last-SA**: tolak demote/nonaktifkan SUPER_ADMIN terakhir (anti-lockout) |
| C4 | Distribusi password temp tidak diputuskan; SMTP realm = env yang belum tentu terisi → reset via email kemungkinan MATI | Keputusan Director diperlukan: (a) sekali-tampil di layar admin [paling aman, beban TU], atau (b) kirim via WA + kedaluwarsa 24 jam + wajib ganti [praktis utk 350 ortu, risiko kanal]. Rekomendasi saya: (b) utk ORTU/SISWA, (a) utk staf |

## V3. Blind-spot proyek (di luar 2J — yang luput dari pengawasan kita)
1. **`PASS The WALL.txt` di folder DIIS** (luar repo, satu folder proyek) —
   bila berisi kredensial plaintext: pindahkan ke password manager, hapus file.
2. **Backup DB & restore drill belum pernah masuk ledger** — pg_dump terjadwal
   + simpan off-VPS + SATU kali latihan restore = PRASYARAT data nyata,
   setara gerbang R-05. (Rapor/nilai tidak boleh bergantung pada satu disk.)
3. **R-05 consent**: form provisioning ortu (2J-3) = momen alami menangkap
   consent UU PDP (checkbox + kolom `consent_at`) — gabungkan, jangan proyek
   terpisah.
4. **Lifecycle deprovisioning** (siswa lulus, guru resign): disable + arsip,
   JANGAN delete (rapor/audit historis); kebijakan tahunan kenaikan kelas =
   modul tersendiri nanti.
5. **Kuota/rate Fonnte** belum diuji utk broadcast 350 — uji 1×50 di staging
   sebelum mengandalkan pengumuman darurat.
6. **Sentry DSN masih backlog lama** (OBS) + belum ada uptime alert eksternal
   sederhana — dua jam kerja, nilai besar saat insiden.
7. SMTP realm perlu diisi/diuji ATAU resmi dinyatakan tidak dipakai (C4).
8. Halaman privacy notice publik (PDP) belum ada di landing — kecil, perlu.

## V4. Urutan eksekusi FINAL (revisi)
**2J-0 HOTFIX isActive (kecil, duluan) → 2J-1 → 2J-2 (+C1,C3, A4, A4b-KC-sync)
→ 2J-3 (+C2, consent R-05) → 2J-4 UI → 2J-5 backfill.**
Paralel non-blok: blind-spot #1 (Director, 5 menit), #2 (runbook backup —
bisa saya kerjakan kapan pun), #5/#6 (sesi ringan).
