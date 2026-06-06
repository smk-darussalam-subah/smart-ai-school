# Ways of Working — DIIS

> Rujukan cara kerja hemat-token + disiplin. **Baca di awal tiap sesi Claude Code.**
> Tujuan: chat tetap pendek, kualitas tetap terjaga.

## Prinsip inti
**File = ingatan permanen. Chat = ruang kerja sementara.** Status tidak disimpan di riwayat
chat — selalu di file. Maka sesi boleh pendek & sekali-pakai; konteks dibangun ulang dari file.

## Sumber kebenaran (single source of truth)
- **`.tasks/queue.md`** = canonical ledger status. Dokumen lain hanya menautkan, tidak menduplikasi.
- **GitHub** (PR/commit/diff) = histori kode. **Linear tidak dipakai** (stale, ditinggalkan).
- `SMA-XX` = **kode internal** di queue.md saja, bukan ID Linear.
- Tracker (GitHub Projects/Linear) baru relevan saat ada **tim** — kemungkinan fase SaaS.

## Sesi hemat-token — Claude Code
1. **Satu sesi per task.** Selesai → `/clear` atau sesi baru. Jangan tumpuk banyak task.
2. Baris pertama sesi: *"Baca `.tasks/queue.md` + brief task + [file spesifik]."* Beri daftar file —
   jangan "explore repo".
3. **Model:** Haiku untuk rutin (CRUD pola, dokumentasi, config); Sonnet untuk desain/schema/security.
4. Rujuk **path file**, jangan paste isi panjang. Hindari paste dump terminal kecuali debugging.
5. Selesai task → done-report + update queue.md + commit. Sesi berikutnya baca ringkasan kecil.

## Sesi hemat-token — Cowork (analyst)
- **Chat baru per workstream besar.** Auto-memory + file menjaga konteks; tak perlu thread panjang.
- Kirim status **1–2 baris** ("modul X merged, coverage Y, hijau"), bukan tabel penuh tiap kali.
- Untuk review: paste **done-report ringkas / file kunci**, bukan seluruh log.

## Non-negotiable (JANGAN dipangkas)
- **Bukti runtime (O-02):** tidak ada ✅ tanpa bukti (curl / test / screenshot). Murah, wajib.
- **Update queue.md + done-report** tiap task — inilah yang membuat chat boleh pendek.
- **Gerbang review** untuk schema, security, dan keputusan desain (oleh Cowork analyst).
- Branch per task `feat/...`, conventional commits, **CI hijau sebelum merge**.

## Git flow (branching) — diadopsi 2026-06-04
> Sebelumnya feature→main langsung (pragmatis, 165 commit). Mulai 2026-06-04 = **gitflow 3-tingkat**.
- **Alur:** `feat/...` atau `fix/...` → PR ke **`develop`** (integrasi) → PR `develop`→**`staging`** (deploy Staging, asap test) → PR `staging`→**`main`** (deploy Produksi).
- **Deploy trigger (`deploy.yml`):** hanya `push` ke **`staging`** & **`main`**. `develop` = CI saja, TIDAK men-deploy. → **jangan pernah berharap perubahan di `develop` masuk produksi tanpa dipromosikan.**
- **Aturan emas:** `main` ⊇ `staging` ⊇ `develop` (superset). Sebelum kerja baru, **`develop` harus selalu di-rebase/merge dari `main`** agar tak pernah tertinggal → mencegah promosi yang merevert produksi (pelajaran N-18).
- Branch fitur **selalu dicabang dari `develop` terkini** (yang sudah sinkron dengan `main`).
- **JANGAN `--delete-branch` pada `develop`/`staging`/`main`** — ketiganya permanen. `--delete-branch` HANYA untuk branch `feat/*` & `fix/*` setelah merge. (Insiden 2026-06-05: promosi develop→staging dgn `--delete-branch` menghapus `develop`, untung ter-restore.)

## Definition of Done per task
- [ ] `tsc --noEmit` 0 error · eslint 0 error · jest hijau (coverage ≥70% bila ada logic)
- [ ] Bukti runtime ditempel di laporan
- [ ] `.tasks/done/<task>-DONE.md` dibuat + `.tasks/queue.md` diupdate
- [ ] PR dibuka, CI hijau, di-review (schema/security/desain), lalu merge
- [ ] Working tree bersih setelah merge

## Pengingat forward-compatibility (murah sekarang, mahal nanti)
- **Jangan hardcode** nilai spesifik sekolah (nama, domain, realm, kode jurusan) → pakai config. (SaaS)
- **Schedule** harus mengakomodasi **JP + ruang** → sumber generate sesi KBM Tahap 2.
- **Attendance** siap diberi `sessionId?` (nullable, additive) saat KBM dibangun.
- Lihat `docs/tahap2-kbm-design.md` (modul KBM) — desain, bukan untuk dikoding sekarang.

## Pemilihan model cepat
| Pekerjaan | Model |
|---|---|
| CRUD pola, dokumentasi, config, boilerplate | Haiku 4.5 |
| Desain schema/ERD, API contract, security, refactor lintas-modul, analisis | Sonnet 4.5+ |
| Reasoning sangat kompleks (jarang) | Opus |

*Dikelola Cowork analyst. Update bila cara kerja berubah.*
