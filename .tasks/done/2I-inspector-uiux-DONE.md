# DONE — 2I: Akun Inspektur + Mode "Masuk sebagai" + Audit UI/UX (2026-06-12)

> Branch `feat/2I-inspector-uiux` (2 commit) dari tip 2H. Mandat Director:
> satu akun semua role + pilih masuk sebagai apa + Claude menilai sendiri
> kelayakan visual dashboard.

## 2I-1 — Akun inspektur + role switcher (edbaa60)
- `scripts/create-inspector-account.sh` (kcadm, idempoten, password interaktif
  tanpa log) → user `inspector` ber-7 role. Runbook: `docs/runbooks/inspector-account.md`.
- Web: cookie `diis_view_as` + `getEffectiveRoles()` — server MEMVALIDASI role
  dimiliki (cookie palsu diabaikan); murni lapisan tampilan, RBAC API tetap
  role asli (batasan didokumentasikan: uji ownership tetap pakai akun asli).
- Sidebar: blok "Masuk sebagai" otomatis utk akun >1 role + badge "· tinjau";
  banner kuning 👁 + tombol kembali; 18 halaman pakai effective roles.

## 2I-2 — Audit UI/UX + perbaikan (a971c4a)
Audit penuh: `docs/audits/UIUX-AUDIT-2026-06-12.md`. **Vonis: layak & profesional
pasca-fix.** 2 temuan KRITIS diperbaiki: (1) dashboard GURU/SISWA berisi ANGKA
PALSU hardcoded → GURU kini data nyata, SISWA/ORTU kartu navigasi jujur;
(2) "Status Sistem" hijau permanen → kini /health nyata (SA saja).
Plus: TU dapat kartu staf, loading.tsx executive/lowongan.
Backlog desain: sidebar mobile drawer (prioritas), konsolidasi .card→shadcn,
AI typing indicator. Verifikasi VISUAL live = jalankan script inspektur lalu
tinjau per role (saya siap menilai dari tangkapan layar bila diberikan).

## Bukti runtime
web: tsc 0 · eslint 0 · 17 test PASS · api: tsc 0 (tak berubah perilaku).
next build via CI (sandbox SIGBUS — diketahui).

## Wajib sebelum CLOSED
CI hijau · jalankan `create-inspector-account.sh` di VPS · login inspector →
switcher muncul → tinjau 7 role · konfirmasi banner & sidebar berubah.
