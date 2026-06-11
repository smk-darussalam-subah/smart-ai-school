# DONE — 2G: Backlog Tertunda (2026-06-11, larut)

> Branch `feat/2G-pending-backlog` (1 commit + docs) dari tip 2F. Mandat:
> "lanjutkan yang tertunda" — tiga item backlog non-blok 2F dieksekusi.

## Isi
1. **Notif WA (2G-3)** — `rpp.reviewed` → WA guru (idempoten per aksi review via
   refId `rppId:reviewedAtIso`); `announcement.published` → broadcast HANYA
   darurat/urgent, penerima role+phone difilter DI QUERY, idempoten per penerima.
   Fail-soft penuh; jalur kirim tetap NotificationService→BullMQ→Fonnte existing.
2. **Dashboard (2G-1)** — kartu "RPP Menunggu" (count submitted nyata, SA/KS).
3. **DB constraint (2G-2)** — `btree_gist` + EXCLUDE overlap rentang JP per kelas.
   ⚠ Migration GAGAL bila ada data lama overlap — query deteksi ada di header
   migration; jalankan dulu di smk_staging_db (payoff N-20).

## Bukti runtime
api: tsc 0 · eslint 0 · jest **38 suite / 628 PASS** (+6 listener) · web: tsc 0 ·
eslint 0 · 17 PASS. next build via CI (sandbox SIGBUS — diketahui).

## Wajib sebelum CLOSED
CI hijau · migration 2G diuji staging dulu (cek query overlap) · smoke: review RPP
→ WA guru masuk (atau LogAdapter tercatat) · publish pengumuman darurat → antrian
broadcast terisi (cek notification_logs).

## Backlog tersisa (kandidat berikut)
File Storage API + selfie presensi · Rapor hub (M12) · Kegiatan kelas (M9) ·
heatmap drill-down · prisma-exception filter: map 23P01 (exclusion) → 409.
