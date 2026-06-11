# DONE — 2H: API Rapor (M12) + Kegiatan Kelas (M9) + Insiden Kode Tak Bertuan (2026-06-12)

> Branch `feat/2H-rapor-kegiatan-api` dari `559783a` (tip 2G + lint fix Director).

## 🚨 INSIDEN — kode tak bertuan lolos ke prod
- Halaman `/dashboard/rapor` + `/dashboard/kegiatan` (~820 baris) MASUK ke commit 2G
  `b27602c` via `git add -A` dari worktree — TIDAK ditulis dan TIDAK direview sesi ini
  (sumber: kemungkinan sesi paralel menulis ke worktree yang sama).
- Lolos CI dan ter-deploy prod sebagai CANGKANG KOSONG: memanggil `/report-cards` &
  `/class-activities` yang TIDAK ADA di API (pola persis bug /classes era 2C).
- **Respons:** (1) review penuh kode tsb — kualitas frontend OK, kontrak dipetakan;
  (2) API dilengkapi (branch ini); (3) guard proses baru di bawah.
- **GUARD BARU (wajib):** sebelum commit, `git status` + `git diff --cached --stat`
  WAJIB diperiksa — file yang tak dikenali TIDAK ikut commit; worktree bersama
  antar-sesi = sumber kontaminasi.

## Isi 2H
1. **API Rapor (M12)** — generate snapshot (per-mapel count/average/byType + rekap
   kehadiran), idempoten; pipeline draft→checked→published→distributed (+return)
   dengan stempel waktu & otorisasi per-aksi; notes hanya draft; ownership baca
   DI QUERY (SISWA/ORTU hanya `distributed`); distribute → WA ortu via event.
2. **API Kegiatan (M9)** — CRUD; teacherId dari token; edit/hapus pemilik/SA.
3. 5 permission baru + mapping 6 role; migration `2H_report_activity` additive.

## Bukti runtime
api: tsc 0 · eslint 0 · jest **39 suite / 639 PASS** (+11) · nest build OK ·
web: tsc 0 (tak tersentuh). next build via CI.

## Wajib sebelum CLOSED
CI hijau · migration 2H di staging dulu · re-seed permissions (5 baru) staging→prod ·
smoke: generate rapor kelas → check → publish → distribute → WA ortu (notification_logs)
· guru catat kegiatan. CATATAN: halaman rapor/kegiatan di prod akan langsung hidup
begitu API ini ter-deploy (kontrak sudah cocok — diverifikasi terhadap kode live).
