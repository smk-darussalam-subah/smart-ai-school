# ROLLOUT PLAN BERTAHAP — Dashboard Akademik DIIS (4 Role)
> Turunan operasional dari `INTEGRATION-PROMPT-PRODUCTION.md`.
> Disusun: 2026-06-20 · Branch awal: `feat/2O-akademik-guru-v1.1` · Target deploy: **STAGING** (prod ditahan).

---

## 0. KEPUTUSAN CAKUPAN (terkunci, Kang 2026-06-20)

1. **TAHAN rollout guru ke prod.** Kode guru v1.1 (`dc07761`) TIDAK di-push ke main dulu.
2. **Bangun bertahap keempat dashboard** dari mockup sampai lengkap: **Siswa · Ortu · Guru-penuh · KS**.
3. **`guru-penuh` = pengembangan dari guru v1.1** (lanjutkan branch yang ada, bukan tulis ulang).
4. **Deploy bertahap ke STAGING** per gelombang (feat → develop → staging). **Prod = gerbang terpisah nanti**, setelah semua matang + ada data nyata lintas modul (selaras keputusan 2026-06-16: lengkapi modul dulu, refine + data nyata belakangan).

**Konsekuensi:** staging = lapangan simulasi. Tiap gelombang berdiri sendiri di staging, bisa diuji & disimulasikan dengan seed dummy sebelum gelombang berikutnya.

---

## 1. PRINSIP KUNCI (berlaku semua gelombang)

- **DATA JUJUR — jangan palsukan.** Wire ke endpoint nyata bila ada; bila backend belum ada (LMS, gamifikasi XP/badge/leaderboard, AI Soal, pembayaran detail), tampilkan **placeholder jujur / data simulasi bertanda**, bukan angka karangan yang terlihat nyata. (Pola yang sama dipakai di 2L/2N.)
- **Endpoint NYATA yang sudah tersedia** (reuse, tanpa migrasi DB): `/grades`, `/attendance`, `/schedules`, `/class-activities` (Jurnal), `/rpp`, `/teaching-assignments`, `/students`, `/classes`, `/subjects`, `/school/semesters/active`, `/finance/spp/*`, `/announcements`. Konstanta: `KKTP=75`, `NA_W=[.20,.25,.15,.20,.20]`.
- **BELUM ada backend** (→ simulasi/placeholder gelombang ini, modul terpisah nanti): Modul/LMS, diagnostik quiz, XP/level/badge/leaderboard, CP/TP granular, AI Soal generator, pembayaran VA, WA-history realtime, monitoring KBM live per-JP.
- **Gate kualitas tiap commit:** `npx tsc --noEmit` 0 error → `next build` sukses. Frontend WAJIB konsultasi skill `ui-ux-pro-max`; sebelum PR jalankan persona **code-reviewer + security-reviewer** (CLAUDE.md §Harness).
- **Gitflow wajib:** `feat/2P-...` → PR develop (CI) → PR staging (deploy). JANGAN `--delete-branch`. JANGAN push langsung ke staging/main (protected). Auto-heal nginx↔staging-net sudah otomatis sejak PR #180 — tak perlu heal manual.
- **Tanpa migrasi DB** sedapat mungkin (KKTP konstanta). Bila satu gelombang butuh tabel baru (mis. LMS), itu jadi sub-task backend tersendiri + migrasi additive `IF NOT EXISTS`.
- **Reuse, jangan duplikat.** Komponen lintas-role (kalender, grade row, rapor, leaderboard) dibangun SEKALI di Wave 0.

---

## 2. PETA GELOMBANG

| Gel. | Nama | Branch | Sumber mockup | Tergantung | Output staging |
|---|---|---|---|---|---|
| **W0** | Fondasi bersama | `feat/2P-akademik-shared` | §5.1–5.3 prompt | — | lib types+helpers+komponen shared (tak ada UI route baru) |
| **W1** | Guru-penuh | `feat/2P-guru-full` (lanjut v1.1) | `akademik-guru-utuh.html` | W0 | `/dashboard/akademik` (GURU) lengkap |
| **W2** | Siswa | `feat/2P-akademik-siswa` | `akademik-siswa.html` | W0 | route siswa (7 tab) |
| **W3** | Ortu | `feat/2P-akademik-ortu` | `akademik-ortu.html` | W0, (W2 reuse) | route ortu (5 tab) + pembayaran |
| **W4** | KS/Waka | `feat/2P-akademik-ks` | `akademik-ks.html` | W0, W1 | route KS (approval/monitor/audit) |

**Urutan rekomendasi:** W0 → W1 → W2 → W3 → W4. Rasional: W0 membuka semua; W1 melanjutkan branch v1.1 yang sudah jalan + jadi produsen data; W2 konsumen data terbesar; W3 reuse komponen W2 + tambah pembayaran; W4 monitoring/approval (desktop) paling kompleks. **Urutan W1–W4 fleksibel** — siswa/ortu hanya butuh W0 + seed, tak butuh kode guru; bila Kang mau siswa duluan, tinggal tukar W1↔W2.

---

## 3. WAVE 0 — FONDASI BERSAMA  `feat/2P-akademik-shared`

**Tujuan:** kunci kontrak data + util + komponen reusable sebelum sentuh UI role. Tanpa route baru → risiko nol, langsung mantap di staging.

**Bangun:**
1. **Types** `packages/types/src/academic.ts` — `StudentGrade`, `NilaiAkhir`, `Pembayaran`, `Kehadiran`, `Tugas` (§5.1 prompt).
2. **Helpers** (shared utils + unit test ≥80%): `naOf()`, `cls()`, `fmtRupiah()`, `daysUntil()`, `fmtDate()`, `generateCal()` (kalender Sunday-first 6-hari, offset `firstDow`, empty hari Minggu). Konstanta `NA_W`, `KKTP`, `JP`, `JPN`, `DOW`, `MON`.
3. **Komponen shared** `apps/web/src/components/academic/shared/`: `CalendarHeatmap` (CSS `repeat(7,minmax(0,1fr))` + today `outline` BUKAN box-shadow — §7.4), `GradeRow`, `GradeDetailModal`, `RaporModal`, `LeaderboardTable`, `BadgeGrid`, `CPProgress`, `ThemeToggle` (localStorage), `PaymentItem`.

**Data:** murni util/presentational, data lewat props. Tak ada fetch.

**Gate & deploy:** tsc 0 + build + unit test hijau → `ui-ux-pro-max` review → PR develop → PR staging. **Verifikasi staging:** build sukses, tak ada regresi route lama (komponen belum dipakai siapa pun). Ini gelombang "aman" untuk memvalidasi pipeline.

---

## 4. WAVE 1 — GURU-PENUH  `feat/2P-guru-full` (lanjutan `feat/2O-akademik-guru-v1.1`)

**Basis:** v1.1 sudah punya Ringkasan, Jadwal, Pembelajaran, Penilaian (Gradebook+InputNilai), Kehadiran, Penugasan, Capaian (sub-nav `AkademikWorkspace`).

**Lengkapi ke mockup `akademik-guru-utuh.html` (§2.3 prompt):**
- **Pembelajaran:** Modul ajar list + status approval, RPP/Modul Ajar form, LMS editor *(LMS = simulasi/placeholder, backend menyusul)*.
- **Penilaian:** Monitor LMS realtime *(simulasi)*, **AI Soal generator** *(simulasi `openAISoal`)*, student detail modal.
- **Penugasan:** pengumpulan detail (list siswa + status + file + nilai) — reuse `/class-activities`/tugas bila ada, else simulasi.
- **Capaian & Rapor:** CP progress per mapel *(simulasi granular)*, Rapor preview (reuse `RaporModal` W0, data `/grades`).
- **Rekap Audit** + **LMS Preview** (embedded).

**Data nyata:** Ringkasan/Jadwal/Kehadiran/Gradebook/Jurnal/Rekap = endpoint nyata (sudah jalan di v1.1). **Simulasi:** LMS, AI Soal, monitor live, CP granular.

**Gate & deploy:** rebase ke develop terbaru (after W0 merged) → tsc/build → reviewer personas → PR develop → PR staging. **Verifikasi:** login `inspector` (mode Guru) → telusuri semua layar; seed `seed-demo-staging` sudah beri assignment + schedule.

---

## 5. WAVE 2 — SISWA  `feat/2P-akademik-siswa`

**Bangun** route siswa mobile-first (560px, bottom nav 7 tab) dari `akademik-siswa.html` (§2.1). Layar: Beranda, Jadwal, Modul(LMS), Nilai, Tugas, Kehadiran, Capaian. Tema dual dark/light (`diis-theme`, emerald `#10b981`).

**Reuse W0:** `CalendarHeatmap`, `GradeRow`, `GradeDetailModal`, `RaporModal`, `LeaderboardTable`, `BadgeGrid`, `CPProgress`, `ThemeToggle`.

**Data nyata:** Nilai (`/grades` filter own), Kehadiran (`/attendance` own), Jadwal (`/schedules` own), Pengumuman. **Simulasi:** Daily Quest/XP/streak, Modul/LMS+diagnostik, Tugas submit-flow, Badge/Leaderboard/CP granular, Profile CV.

**Routing/role:** tambah cabang SISWA (guard role) — route baru `/dashboard/akademik` untuk SISWA atau sub-route khusus; pastikan tak rusak fallback role lain.

**Gate & deploy:** tsc/build → `ui-ux-pro-max` (mobile-first) → reviewer personas → PR develop → staging. **Verifikasi:** inspector mode Siswa; uji kalender tak overflow, toggle tema, semua modal.

---

## 6. WAVE 3 — ORTU  `feat/2P-akademik-ortu`

**Bangun** route ortu mobile-first (5 tab, biru `#3b82f6`, `diis-ortu-theme`) dari `akademik-ortu.html` (§2.2): Beranda, Kehadiran, Nilai, **Pembayaran**, Capaian.

**Reuse:** komponen W0 + banyak komponen Siswa (grade row, kalender, rapor) → konfirmasi reuse, jangan duplikat.

**Data nyata:** Nilai/Kehadiran anak (read child), **Pembayaran** (`/finance/spp/*` bila tersedia → `fmtRupiah`), Pengumuman. **Simulasi:** WA-history, teacher-contact, CP/badge granular.

**Khusus:** `ChildSelector` (multi-anak), nav badge unpaid count, `PaymentDetailModal` (Bayar/Upload Bukti = simulasi).

**Gate & deploy:** sama pola → PR develop → staging. **Verifikasi:** inspector mode Ortu; format Rupiah, filter pembayaran, badge unpaid.

---

## 7. WAVE 4 — KS/WAKA KURIKULUM  `feat/2P-akademik-ks`

**Bangun** dashboard desktop-first (sidebar 240px) dari `akademik-ks.html` (§2.4): Beranda (KPI+Health gauge+Papan KBM), Modul Ajar (approval queue), Audit Sumatif, Monitoring KBM, Rekap Audit, KKTP settings, Jadwal&Tugas (auto-scheduler + teacher load).

**Data nyata:** KPI guru/rombel (`/teaching-assignments`,`/classes`,`/students`), Rekap (reuse guru), Papan KBM (`/schedules`). **Simulasi:** Health gauge breakdown, approval modul (butuh status modul → reuse `/rpp?status`), monitoring live, auto-scheduler (constraint solver = sub-task berat, boleh placeholder dulu), KKTP editable (konstanta → simulasi sampai ada config).

**Gate & deploy:** sama → PR develop → staging. **Verifikasi:** inspector mode KS; desktop layout, approval flow.

---

## 8. POLA DEPLOY STAGING (checklist reusable tiap gelombang)

```
[ ] git fetch && branch dari origin/develop terbaru (JANGAN develop lokal basi)
[ ] Implementasi + tsc --noEmit (0 error) + next build (sukses)
[ ] Konsultasi skill ui-ux-pro-max (frontend) — sebelum PR
[ ] Persona code-reviewer + security-reviewer — sebelum PR
[ ] PR feat/* → develop (tunggu CI hijau, merge)
[ ] PR develop → staging (deploy.yml jalan; auto-heal nginx↔staging-net otomatis)
[ ] Verifikasi runtime staging:
      - web / 200, /dashboard/akademik (unauth) → 307 login
      - login inspector → switch "Masuk sebagai" <role> → telusuri tiap layar
      - cek konsol error, kalender tak overflow, tema toggle, modal focus-trap
[ ] Seed data simulasi bila perlu (lihat §9)
[ ] Catat hasil + screenshot → update memory project-status
```

**Caveat gitflow (dari catatan rilis sebelumnya):** staging/main bisa diverging dari develop (merge-bubble) → bila konflik bubble, pakai branch `release/*` + `git merge -s ours origin/<target>` lalu PR. Branch protected → tanpa force-push.

---

## 9. DATA SIMULASI / SEED STAGING

- Reuse & **perluas** `packages/database/prisma/seed-demo-staging.ts` (idempotent, guard `DATABASE_URL~staging`, **JANGAN di prod**) agar tiap role punya data: siswa dgn nilai+kehadiran+jadwal, ortu↔anak, KS lihat agregat. Sudah ada: inspector guru + 6 assignment + Schedule +46 + grades/SPP/RPP/PPDB (dari #183/#187).
- Jalankan via `docker exec smk-staging-api … ts-node prisma/seed-demo-staging.ts`.
- Untuk fitur tanpa backend (XP/badge/LMS/AI), data = konstanta mock di komponen, **diberi tanda "simulasi/segera"** (badge kejujuran data ala 2N), bukan seed DB.

---

## 10. GERBANG PROD (DITAHAN — jangan dieksekusi tanpa aba-aba Kang)

Prod baru dibuka **setelah** keempat dashboard matang di staging **dan** Kang setuju + ada data nyata lintas modul. Saat dibuka, pola rilis prod yang sudah terbukti:
```
release/2P-akademik-prod  ←  dari staging
git merge -s ours origin/main   (reconcile, main pernah di-squash)
PR release → main (squash --admin, Kang merge sendiri)
→ deploy.yml prod (build api web api-migrate — JANGAN hapus api-migrate)
→ verifikasi: web 200, route unauth→307, api /health 200, keycloak discovery 200
```
Bisa dirilis **per-gelombang** ke prod (guru dulu, dst.) atau **sekaligus** — diputuskan saat gerbang dibuka.

---

## 11. HOUSEKEEPING / "SIAPKAN FILE UPLOAD" (lakukan dulu, sekali)

File desain saat ini **untracked**. Sebelum mulai W0:
- [ ] Commit artefak desain ke `.tasks/akademik-mockup/` (mockup HTML + PNG + INTEGRATION-PROMPT + plan ini) di branch `feat/2P-akademik-shared` — referensi tim, bukan kode produksi. (`.tasks/` memang sudah dilacak utk mockup lain.)
- [ ] Review `scripts/seed-attendance-demo.ts` & `.tasks/mockups/` untracked — putuskan commit/abaikan.
- [ ] Branch `feat/2O-akademik-guru-v1.1` (`dc07761`): **biarkan** sebagai basis W1 (guru-penuh). Jangan merge ke develop sendiri sampai jadi bagian W1.
- [ ] Pastikan tak ada file produksi tak-bertuan ikut ter-`git add -A` (pelajaran insiden 2G) — selalu `git status` + `git diff --cached --stat` sebelum commit.

---

### Ringkasan satu baris
W0 fondasi → W1 guru-penuh (lanjut v1.1) → W2 siswa → W3 ortu → W4 KS, **masing-masing ke staging** dengan data jujur (nyata bila ada endpoint, simulasi bertanda bila belum), **prod ditahan** sampai semua matang.
