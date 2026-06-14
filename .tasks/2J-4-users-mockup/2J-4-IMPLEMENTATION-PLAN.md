# RENCANA IMPLEMENTASI — 2J-4 Tambah Pengguna + Identitas Kepegawaian
> Disusun 2026-06-14 · status: MENUNGGU PERSETUJUAN KANG (belum coding)
> Mockup disetujui: `.tasks/2J-4-users-mockup/` · Visi: `docs/VISION-future-modules.md`

---

## 1. Tujuan & Batasan

**Tujuan:** operator (Super Admin / Tata Usaha) bisa **input data real guru, TU, KS, mitra industri** — satuan via form & massal via CSV — lengkap dengan identitas kepegawaian (NIY, status, dll).

**MASUK scope 2J-4:**
- Tabel baru `school.staff` (identitas kepegawaian) + field personal baru di `auth.users`.
- Migrasi `teacher.nip` → `staff.niy`.
- Perluas provisioning (satuan + **endpoint bulk** untuk CSV).
- UI form + import CSV di `dashboard/users` (sesuai mockup).
- Tests + verifikasi runtime.

**TIDAK masuk (→ sprint 2J-5 Struktur Organisasi):**
- Katalog jabatan (`school.position`), penugasan (`staff_position`), tautan izin (`position_permission`).
- UI struktur organisasi & otomasi akses modul Wakasek.
- (2J-5 nanti me-reuse `school.Major` [TKRO/TBSM/TJKT/AKL] + `school.AcademicYear` yang **sudah ada**.)

---

## 2. Perubahan Skema (Prisma)

> Schema `school` sudah terdaftar (`schema.prisma:21`) & berisi Major/AcademicYear/Semester. `staff` ditempatkan di sini.

### 2.1 Enum baru
```prisma
enum Gender { L  P  @@schema("auth") }                 // pada auth.users
enum EmploymentStatus { GTY GTT PTY PTT @@schema("school") }  // GTY/GTT guru, PTY/PTT tendik
```

### 2.2 `auth.users` — tambah field personal (nullable, reusable lintas role)
```prisma
gender     Gender?
birthDate  DateTime? @map("birth_date") @db.Date
address    String?   @db.Text
```
(birthDate & gender sengaja di User agar nanti dipakai siswa juga.)

### 2.3 `school.staff` — tabel baru (1:1 dengan User, hanya pegawai)
```prisma
model Staff {
  id               String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId           String           @unique @map("user_id") @db.Uuid
  niy              String?          @unique                 // Nomor Induk Yayasan, unik, tanpa aturan digit
  employmentStatus EmploymentStatus @map("employment_status")
  joinedAt         DateTime?        @map("joined_at") @db.Date
  createdAt        DateTime         @default(now()) @map("created_at")
  updatedAt        DateTime         @updatedAt @map("updated_at")
  deletedAt        DateTime?        @map("deleted_at")
  user             User             @relation(fields: [userId], references: [id])
  @@map("staff")
  @@schema("school")
}
```
+ relasi `staff Staff?` di model User.

### 2.4 `teacher.nip` → dihapus (identitas pindah ke staff)
- `Teacher` disisakan untuk hal mengajar (`isWaliKelas`, assignments, rpp, presensi). Kolom `nip` dibuang setelah backfill.

### 2.5 Migrasi (URUTAN AMAN — additive dulu, drop terakhir)
1. **Additive:** buat enum, buat tabel `staff`, tambah kolom `users.gender/birth_date/address`.
2. **Backfill (idempoten, script):**
   - Untuk tiap user role ∈ {GURU, TATA_USAHA, KEPALA_SEKOLAH} yang belum punya `staff` → buat baris `staff` (userId, employmentStatus default `GTY` guru/KS · `PTY` TU, joinedAt = createdAt).
   - Untuk tiap `teacher.nip` non-null → set `staff.niy = teacher.nip`.
3. **Drop:** kolom `teacher.nip`.
- Uji di **staging** dulu (data `smk_staging_db`), verifikasi, baru prod (izin Kang untuk migrasi DB prod).

---

## 3. Backend (NestJS / apps/api)

### 3.1 `provision.dto.ts` — perluas `ProvisionUserSchema`
- Tambah: `gender` (wajib), `birthDate?`, `address?`, `niy?`, `employmentStatus?`.
- **Refine:** role pegawai (GURU/TATA_USAHA/KEPALA_SEKOLAH) → `niy` & `employmentStatus` wajib; INDUSTRI → keduanya dilarang.
- Hapus `payload.nip`.

### 3.2 `provisioning.service.ts` — `provisionUser`
- Set `user.gender/birthDate/address`.
- Role pegawai → buat baris `staff` (niy, employmentStatus, joinedAt) di dalam transaksi.
- GURU → tetap buat baris `teacher` (tanpa nip).
- Pre-flight idempotency: cek `staff.niy` unik (ganti cek lama `teacher.nip`).
- Saga Keycloak + kompensasi **tetap** dipertahankan.

### 3.3 Endpoint bulk baru — `POST /provision/users/bulk`
- Body: array baris (maks 500). Per baris: validasi Zod + otorisasi role (TU tak boleh TU/KS) + create.
- **Skip-invalid** (lanjut walau ada error) → balikan `{ results:[{index,status,error?,credentials?}], summary:{ok,fail} }`.
- Sekuensial (tiap baris hit Keycloak) + `@Audit`. Reuse `provisionUser`.

### 3.4 Refactor `nip` → `niy` (16 file ter-scan)
- Update referensi `teacher.nip` (display/seed/types) → ambil `niy` dari `staff`.
- ⚠️ **JANGAN sentuh** `headmasterNip` di `school_profile` / `school-config` — itu field profil sekolah, beda konsep (boleh dikonsistenkan jadi NIY belakangan, di luar 2J-4).
- Update `packages/types` bila `Teacher`/`User` type memuat `nip`.

---

## 4. Frontend (Next.js / apps/web)

- `dashboard/users`: tombol **"Tambah Pengguna"** → halaman/modal dengan tab **Input Satuan** + **Import Massal** (persis mockup yang disetujui).
- **Satuan:** form → server action → `POST /provision/users` → tampilkan kredensial sementara sekali.
- **Import:** parse CSV di klien (papaparse) → preview validasi (valid/error per baris) → `POST .../bulk` → ringkasan hasil. Sediakan tombol unduh template.
- Field & perilaku kondisional sesuai mockup (NIY & status hanya pegawai; jabatan TIDAK di sini).
- Patuhi `ui-ux-pro-max` + palet Emerald; **jangan tampilkan detail stack/teknis ke user**.

---

## 5. Tests (target ≥80%)

- **DTO:** field baru; pegawai wajib niy+status; INDUSTRI tolak niy; gender wajib.
- **Service unit:** buat baris `staff`; konflik `niy` (409); GURU dapat teacher tanpa nip; bulk skip-invalid.
- **Endpoint:** otorisasi per-baris (TU ≠ buat TU/KS); audit ter-rekam.
- `npx prisma validate` + `migrate status`.

---

## 6. Verifikasi Runtime (WAJIB, CLAUDE.md §9)
- `prisma validate` OK · `tsc --noEmit` 0 error · `next build` sukses.
- `curl` provision satuan + bulk (output ditempel di laporan).
- `jest --coverage` provisioning + dto.

---

## 7. Gitflow & Deploy
- Branch: `feat/2J-4-staff-identity` dari **origin/develop** (bukan develop lokal).
- `feat/2J-4 → develop (PR+CI) → staging (deploy, re-heal jaringan) → main (prod)`.
- Migrasi dijalankan di **staging dulu**; prod menyusul dengan izin Kang.
- JANGAN hapus `api-migrate` dari deploy.yml.

---

## 8. Risiko & Mitigasi
| Risiko | Mitigasi |
|---|---|
| Migrasi `nip→niy` menyentuh data prod | Backfill idempoten + uji staging dulu; additive → backfill → drop terpisah |
| 16 file referensi `nip` | Refactor hati-hati; sisihkan `headmasterNip` (beda konsep) |
| Bulk endpoint lambat (tiap baris hit Keycloak) | Sekuensial + batas 500 baris + progress; pertimbangkan throttle |
| `niy` unik tapi nullable | Banyak NULL diizinkan; uniqueness hanya untuk yang terisi |

---

## 9. Keputusan kecil (default dipilih, bisa Kang ubah)
1. **Bulk = skip-invalid** (sesuai mockup) — bukan all-or-nothing. ✅ default
2. **employmentStatus wajib** untuk pegawai. ✅ default
3. **gender/birthDate/address di `auth.users`** (reusable), bukan staff. ✅ default
4. **headmasterNip dibiarkan** di 2J-4 (konsistensi NIY menyusul). ✅ default

---

## 10. Estimasi urutan kerja
1. Skema + migrasi + backfill script (uji staging).
2. Backend DTO + service + endpoint bulk + refactor nip→niy.
3. Frontend form + import CSV.
4. Tests + verifikasi runtime.
5. PR → develop → staging (verify) → prod.
