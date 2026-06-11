# DONE — 2F: CRUD Jadwal + Presensi Guru GPS + RPP Pipeline (2026-06-11 malam)

> Branch `feat/2F-jadwal-presensi` (4 commit) dari tip 2E. Mandat: "lanjutkan
> berturut-turut". Tiga modul KamilEdu berturut-turut: M6 (lengkap), M8, M11.

## 2F-1 — CRUD Jadwal (0612467)
- **BUG DITEMUKAN & FIX:** cek konflik guru/ruang lama pakai `lt/gt` padahal rentang
  JP INKLUSIF → overlap tepi (1–3 vs 3–4) LOLOS. Kini `lte/gte`.
- **BARU:** cek konflik RENTANG kelas di create/update (unique DB hanya jpStart;
  1–3 vs 2–4 sebelumnya lolos) → 409.
- PATCH /schedules/:id (slot only; re-cek 3 konflik exclude diri) + DELETE (hard,
  template tanpa dependen). UI: + Slot Jadwal, klik sel utk edit, hapus 2-langkah.

## 2F-2 — Presensi Guru GPS (5a2118c) — KamilEdu M8
- Schema `teacher.teacher_attendance` + SchoolProfile `latitude/longitude/
  geofence_radius_m` (null = geofence off; diatur via PUT /school/profile).
- Check-in/out GURU + haversine; **luar radius TIDAK ditolak — dicatat + diflag**
  (kebijakan flag_luar_area); geofence aktif tanpa koordinat = flag tak-terverifikasi.
- Rekap: SA/KS/TU bebas + filter outsideOnly; GURU miliknya DI QUERY.
- UI: tombol check-in/out geolocation (gagal GPS → kirim + peringatan jujur),
  badge jarak, disclosure privasi lokasi. photoUrl nullable (storage just-in-time).

## 2F-3 — RPP Pipeline (287e1c3) — KamilEdu M11
- State machine draft→submitted→approved|revision (revisi→edit→submit ulang);
  edit hanya draft/revision; review hanya submitted; **revisi wajib bercatatan** (Zod).
- Ownership GURU DI QUERY; KS/SA review; DELETE: guru draft sendiri, SA bebas.
- UI: guru kelola+ajukan; reviewer antrian default "Menunggu Review" + dialog
  approve/revisi; catatan reviewer tampil ke guru.

## Bukti runtime (O-02)
- apps/api: tsc 0 · eslint 0 · **jest 37 suite / 622 PASS** (594→622: +6 schedule-crud,
  +12 teacher-attendance, +10 rpp) · nest build hijau.
- apps/web: tsc 0 · eslint 0 · jest 17 PASS. `next build` via CI (sandbox SIGBUS).

## Wajib sebelum CLOSED
1. CI hijau (termasuk next build) di PR.
2. **2 migration** diuji di `smk_staging_db` dulu: `2F2_teacher_attendance`
   (CREATE + 3 ALTER ADD school_profile), `2F3_rpp` (CREATE).
3. Pasca-merge: `prisma generate` + re-run `seed-permissions.ts` (5 permission baru:
   teacher.attendance.checkin/read, rpp.read/own.manage/review) staging→prod.
4. Set koordinat sekolah (PUT /school/profile: latitude/longitude/geofenceRadiusM)
   agar geofence aktif; sebelum itu presensi jalan tanpa flag.
5. Smoke UI: jadwal (+slot/edit/hapus), presensi (check-in browser, izin lokasi),
   RPP (guru ajukan → KS review).

## Backlog baru (non-blok)
- Foto selfie presensi (butuh File Storage API — just-in-time berikutnya).
- Notifikasi WA saat RPP direview / pengumuman darurat (BullMQ wiring).
- Dashboard: kartu "RPP Menunggu" pakai count submitted nyata.
- Constraint server-side rentang-overlap kelas (exclusion constraint Postgres).
