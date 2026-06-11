# TASK QUEUE — DIIS Tahap 0 → Sprint-0 Tahap 1

> ⭐ **FILE INI = SATU-SATUNYA SUMBER KEBENARAN STATUS (canonical ledger).**
> Dokumen lain (`current.md`, `CLAUDE.md` §7, gate docs) hanya MENAUTKAN ke sini,
> tidak menduplikasi status. Jika ada konflik, file INI yang menang.
> Dikelola oleh Cowork AI. Claude Code hanya membaca file ini.
> Update terakhir: 2026-06-12 — **2G MERGED→prod (PR #116–118) + 2H selesai dikoding**
> (branch `feat/2H-rapor-kegiatan-api`). 🚨 Insiden: frontend rapor+kegiatan ikut 2G
> tanpa review (worktree terkontaminasi) & live sebagai cangkang kosong → 2H
> melengkapi API Rapor (M12) + Kegiatan (M9) sesuai kontrak frontend live + WA ortu
> saat distribute. api **639 test** hijau. Wajib: migration 2H di staging + re-seed
> permissions (5 baru). Guard baru: cek `git diff --cached --stat` pra-commit.
> Detail: `.tasks/done/2H-rapor-kegiatan-api-DONE.md` + decision-log 2026-06-12.
> KamilEdu tersisa: M2/M3 (siswa/guru—parsial ada), M5 mapel, M7 sudah, M10 nilai
> (ada), M12 ✅, jadi inti 12 modul ≈ LENGKAP. Berikutnya: File Storage+selfie,
> heatmap drill-down, atau konsolidasi kualitas — keputusan Director.
>
> (Catatan 2G larut: 2026-06-11 (larut) — **2G selesai dikoding** (branch
> `feat/2G-pending-backlog`, dari tip 2F): notif WA rpp.reviewed + broadcast
> pengumuman darurat/urgent (idempoten, fail-soft, via BullMQ existing) · kartu
> RPP Menunggu nyata · EXCLUDE constraint overlap rentang jadwal (btree_gist).
> api 628 test hijau. ⚠ migration 2G: cek data overlap dulu di staging (query di
> header migration). Detail: `.tasks/done/2G-backlog-tertunda-DONE.md`.
>
> (Catatan 2F malam: 2026-06-11 (malam) — **2F selesai dikoding** (branch
> `feat/2F-jadwal-presensi`, 4 commit dari tip 2E, menunggu PR): 2F-1 CRUD Jadwal
> (+fix bug overlap inklusif & cek rentang kelas) · 2F-2 **Presensi Guru GPS geofence**
> (M8; haversine, flag luar-area, geofence config di SchoolProfile) · 2F-3 **RPP
> pipeline** (M11; draft→submitted→approved|revision, revisi wajib catatan).
> Bukti: api **622 test** hijau · web 17 · tsc/eslint 0 · nest build OK · next build via CI.
> **2 migration baru WAJIB uji di smk_staging_db** + re-seed permissions (5 baru).
> Detail: `.tasks/done/2F-jadwal-presensi-rpp-DONE.md`. Berikutnya: Rapor hub (M12) /
> kegiatan kelas (M9) / file storage + selfie presensi — keputusan Director.
>
> (Catatan 2E sore: 2026-06-11 (sore) — **2D MERGED ke main (PR #107) + infra redis fixed.**
> **2E selesai dikoding** (branch `feat/2E-harness-uiux`, menunggu PR): agent harness
> terkurasi (.claude/ — ECC subset TANPA hooks + ui-ux-pro-max; audit di .claude/HARNESS.md)
> · 3 backlog-fix 2D (audit statusCode @HttpCode, redaksi case-insensitive+nested, SiswaForm
> → /classes nyata) · **modul Jadwal matrix + deteksi bentrok** (KamilEdu M6). Bukti: api
> 594 test hijau, web 17 test hijau, tsc/eslint 0, nest build OK; next build via CI.
> Detail: `.tasks/done/2E-harness-jadwal-DONE.md`. Berikutnya (pasca-merge 2E): presensi
> guru GPS (M8) / RPP (M11) / CRUD jadwal — keputusan Director.
>
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ## 🔄 REKONSILIASI 2026-06-11 (2D — stabilisasi & review retrospektif) — BLOK INI MENANG
>
> **Fakta:** 2B-1 AuditLog ✅ · 2B-2 Permission-RBAC ✅ · 2B-3 SchoolConfig ✅ · 2C-0..7
> (frontend 7 modul + shadcn + Users CRUD) ✅ — SEMUA sudah merged ke develop PR #91–#94 dst.
> (9–10 Juni) **tanpa done-report/gerbang review**. Drift ledger ini direkonsiliasi sekarang.
>
> **2D (sesi 2026-06-11, branch stack `feat/2D-1..4`, MENUNGGU PR + CI):**
> - 2D-1 hygiene: 677 artefak coverage keluar dari git + .gitignore `coverage*/` + fix tsc spec.
> - 2D-2 permission hardening (temuan review retrospektif 2B-2 — 2 temuan SECURITY):
>   guard fail-open→fail-closed · revoke override kini efektif · filter override di QUERY
>   · invalidasi cache benar. 592 test hijau.
> - 2D-3 **Pengumuman** (KamilEdu M14): schema notification.announcements + API CRUD penuh
>   (visibilitas audiens di QUERY, DELETE aman) + halaman /dashboard/pengumuman + 3 permission baru.
> - 2D-4 **Dashboard realtime + /classes** (KamilEdu M1/M4): heatmap kehadiran kelas×hari
>   (groupBy DB) + stat nyata (ganti hardcoded 542/48/18/124) + API /classes (menutup bug
>   frontend 2C yang memanggil endpoint fiktif → silent 404).
>
> **Gerbang merge 2D (WAJIB):** CI hijau termasuk `next build` (sandbox tak bisa build web —
> SIGBUS swc) · migration 2D3 diuji di `smk_staging_db` dulu · pasca-merge: `prisma generate`
> + re-run `seed-permissions.ts` (announcement.*) staging→prod · smoke UI pengumuman+heatmap.
>
> **Backlog baru (non-blok):** statusCode audit dari reply aktual · denylist redaksi
> case-insensitive/nested · SiswaForm masih POST `/api/backend/classes` (route fiktif) →
> alihkan ke /classes · broadcast WA saat publish pengumuman darurat (BullMQ) · drill-down
> heatmap. **Berikutnya setelah 2D merged:** lanjut roadmap (RPP/jadwal-matrix/presensi guru
> per referensi KamilEdu M6/M8/M11, atau prioritas Director).
>
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
>
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ## 🔄 REKONSILIASI 2026-06-09 (Penutupan 2A)
>
> **2A ✅ DITUTUP (2026-06-09).** N-20 ✅ CLOSED-prod · N-23b ✅ CLOSED-prod (G1–G5 + login browser, Director
> konfirmasi) · F-3 ✅ (/metrics→404, Prometheus up) · N-29 ✅ (fix permanen: nginx→container name smk-web/smk-api;
> root cause: Compose merge networks) · N-29b ✅ (KC_HOSTNAME_STRICT_HTTPS=true, mixed-content) · CI hijau.
> **Backlog (non-blok):** smk-staging-web landing di `smk-staging_default` (interaksi `!reset`+`external:true`
> Compose 5.1.4 — tak pengaruhi prod, fix saat staging dipakai serius) · T-N20a (`DATABASE_URL` di `.env.staging`)
> · T-N20b (selaraskan schema 2 jalur init) · Redis db-index staging terpisah · keputusan ekspos admin console
> publik vs tunnel-only · OBS-1b · aktivasi Sentry (project+DSN) · #418 Cloudflare obfuscation.
> **Berikutnya: 2B Fondasi** — AuditLog persisten → permission-RBAC → School Profile/Config+kalender → tabel
> referensi (Subject/Major/Parent). SERIAL + gerbang review + gitflow.
>
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ## 🔄 REKONSILIASI 2026-06-04 (Cowork analyst) — BLOK INI MENANG atas isi lama di bawah
> > Disusun setelah verifikasi langsung riwayat GitHub Actions + `git log origin/main`. Bagian historis di bawah (Sprint 1–3) sengaja dibiarkan sebagai arsip; status TERKINI ada di sini.
>
> ### 📌 KEPUTUSAN DIRECTOR 2026-06-06 (penutupan Tahap 1) — CARRY-OVER ke Tahap 2 / backlog
> - **Frontend 7 halaman modul** (Siswa/Akademik/PPDB/Keuangan/AI/Users/Health) = **Tahap 2** (di luar scope Sprint 4; API sudah ada). Gate sidebar = opsional nanti.
> - **N-27 DIBATALKAN** — terbukti SALAH (web→API publik & internal sama-sama 200; bukan loopback).
> - **Bug data knowledge/KPI Eksekutif (Fase 2)** = **CATATAN/backlog** — gejala: SSR fetch ke API gagal render; diagnosa via log ditunda. Kemungkinan terkait React #418 (lihat di bawah).
> - **React #418 (hydration) + CSP email-decode** = akibat **Cloudflare Email Obfuscation/Rocket Loader menyuntik HTML**. **KEPUTUSAN: BIARKAN** — fitur masih dibutuhkan untuk landing page (rekomendasi sesi Cowork sebelumnya). Trade-off: #418 di halaman terautentikasi diterima untuk sekarang. Backlog: scope obfuscation hanya ke landing (page rule) bila perlu.
> - **Fase 4 (keamanan & hardening: N-23b Keycloak prod-mode + tutup port 8080, N-20 isolasi staging, rotasi secret)** = **CATATAN/backlog Tahap 2** — tidak dikerjakan sekarang.
> - **Arah:** langsung **Fase 5 (SMA-52 perf + SMA-53 docs)** → lalu **TUTUP Tahap 1** (backend + auth + fondasi). Deploy final SMA-52/53 sebagai `appuser` sekaligus **memformalkan VPS = repo** (main sudah lengkap).
>
> ### 🎉 PROGRESS 2026-06-06 — LOGIN PRODUKSI PULIH (pertama kali aplikasi terautentikasi hidup)
> Login admin (SUPER_ADMIN) tembus ke `/dashboard`. Seluruh sisi terautentikasi (login + dashboard) ternyata **tak pernah berfungsi di prod** sebelumnya. Rantai blocker yang dibongkar berurutan:
> - **N-21 (CRIT)** CSP nonce tak di-set di request header → JS halaman dinamis mati. Fix: `requestHeaders.set('Content-Security-Policy', csp)`. (PR #60)
> - **N-21a (CRIT)** `/login` & `/health` statis ('use client') kena CSP ketat → JS mati. Fix: STATIC_INTERACTIVE → `unsafe-inline`. (PR #63)
> - **N-22 (CRIT)** container web tak punya env server next-auth. Fix: tambah NEXTAUTH_URL/SECRET, KEYCLOAK_ISSUER/CLIENT_ID/CLIENT_SECRET, API_URL ke service web. (PR #65)
> - **Realm Keycloak `diis` HILANG** dari Keycloak (volume ter-reset, --import-realm skip) → re-impor `realm-diis.json`. Client diis-web URL diperbaiki ke prod (https).
> - **N-23 (CRIT)** Keycloak (start-dev, tanpa proxy header) hasilkan issuer `http://`. Fix: `KC_PROXY_HEADERS: xforwarded` di service keycloak → issuer https.
> - **N-24 (CRIT)** `next.config.js` blok `env:{NEXTAUTH_URL: ...||'localhost:3000'}` membakar localhost saat build → redirect_uri selalu localhost. Fix: HAPUS NEXTAUTH_URL dari `env:` (next-auth baca runtime). + `.dockerignore` cegah `.env.local` dev.
> - **N-25 (HIGH)** nginx blok web tanpa `proxy_buffer_size` besar → "upstream sent too big header" (Set-Cookie JWT). Fix: `proxy_buffer_size 128k; proxy_buffers 4 256k; proxy_busy_buffers_size 256k`.
> - **N-23b (backlog hardening):** Keycloak masih `start-dev` + port 8080 ter-expose publik → pindah `start` production-mode + tutup 8080. Admin console hanya via SSH tunnel.
>
> ### 🚨 BELUM DIFORMALKAN — SEMUA FIX DI ATAS = EDIT LANGSUNG DI VPS, BUKAN DI REPO
> **BAHAYA: deploy berikutnya (`git pull` + build) akan MEREVERT semua ini → login rusak lagi.** JANGAN trigger deploy sampai diformalkan. Yang wajib masuk repo via gitflow:
> 1. `apps/web/next.config.js` — hapus NEXTAUTH_URL dari `env:` (N-24).
> 2. `infrastructure/docker/docker-compose.yml` — keycloak: `KC_PROXY_HEADERS: xforwarded`; web: 6 env next-auth (= #65, pastikan ter-merge ke main) + `HOSTNAME: "0.0.0.0"` bila ditambah.
> 3. `infrastructure/nginx/nginx.conf` — blok web: proxy_buffer besar (N-25).
> 4. `infrastructure/keycloak/realm-diis.json` — diis-web Root/Home/baseUrl/redirectUris/webOrigins → https prod (hapus localhost), agar re-impor tak balikkan localhost (N-26).
> 5. `.dockerignore` baru (N-24).
> 6. Nilai rahasia (`NEXTAUTH_SECRET`, `KEYCLOAK_WEB_CLIENT_SECRET`) tetap di `.env` VPS (gitignored, persist) — dokumentasikan di `.env.example`.
>
> ### ➕ PROGRESS 2026-06-05 (Sprint 4 berjalan)
> - **OBS-1a ✅ CLOSED & MERGED** (PR #43→develop→main, Deploy #81). Review Cowork APPROVE: scrub PII Sentry diperluas (exception values, breadcrumbs off ganda, URL query-strip), 100% coverage util. Backlog **OBS-1b LOW:** nama/NIS hanya tertangkap bila berlabel; HP >13 digit lolos. Done: `.tasks/done/OBS-1a-scrub-hardening-DONE.md`.
> - **SMA-49 chat history ✅ CLOSED & MERGED** (PR #45→develop→#47 staging→main, Deploy #83). Review Cowork APPROVE: schema additive (`ChatSession`/`ChatMessage`/`MessageRole` @ ai_knowledge), migration `20260605000001` CREATE-only terverifikasi, RBAC ownership via `userId` (404→403, SA bypass), FK cascade, index `(session_id,created_at)`. Tabel terbukti di prod (`\dt ai_knowledge.chat_*`). Backlog LOW: `userId` tanpa FK lintas-schema (orphan risk).
> - **🔴 N-20 (HIGH) OPEN — staging & produksi TIDAK terisolasi.** deploy.yml: satu `SERVER_HOST`, satu `.env`, DB `smk_db` sama, `git checkout <branch>` di satu direktori. → deploy "staging" menjalankan migration di DB **produksi** & checkout branch staging di server prod. Gerbang staging = ilusi keamanan untuk migration destruktif. Menyatu dgn N-16. **Fix sebelum migration destruktif berikut:** DB staging terpisah (`smk_staging_db`)+compose/port terpisah, atau server staging terpisah. Keputusan arsitektur Director.
> - **SMA-48 ClaudeAdapter + R-03 ✅ MERGED (flag-OFF, dormant di prod)** — PR #48→#49 staging→#50 main, Deploy produksi hijau. Review keamanan Cowork APPROVE arsitektur: satu-satunya jalur ke Claude lewat `!hasPii && claudeGateway` + strip ganda; default Ollama; factory double-lock (`AI_PROVIDER=claude`+key, else null); `embed()` throw. `AI_PROVIDER` TIDAK diset → egress nol. Done: `.tasks/done/SMA-48-claude-adapter-DONE.md`.
> - **🟠 R-03 (UU PDP) TETAP OPEN — gerbang pengaktifan ClaudeAdapter.** Celah: `hasPii()`/`stripPiiForLlm()` hanya tangkap email/HP/NIS-berlabel/nama-berlabel → **nama/nomor siswa TANPA label lolos** = bocor ke Anthropic saat aktif. JANGAN set `AI_PROVIDER=claude` di prod sampai R-03 ditutup. Tutup via: (1) batasi Claude ke FAQ-intent non-free-text [rekomendasi], (2) detektor nama NER, atau (3) jalur legal consent+DPA. Director belum punya `ANTHROPIC_API_KEY` → pengaktifan tertunda alami.
> - **SMA-51 Audit RBAC ✅ CLOSED & APPROVE** (PR #51, branch feat/SMA-51-rbac-audit → merge develop→staging→main). 26 area clean. **F-1 MEDIUM** (KS hilang dari finance history) → fixed. **F-2 LOW** (GURU vs PPDB) → keputusan Director: GURU **hanya `/ppdb/stats` agregat**, tertutup dari `/leads` (PII calon siswa); matriks §6 diklarifikasi. Verifikasi Cowork langsung di kode. 477 tests. Done: `.tasks/done/SMA-51-rbac-audit-DONE.md`.
> - **N-18a ✅ CLOSED** — develop disinkronkan ke main (`merge-base --is-ancestor` tip main ⊆ develop; `0  N`). develop kembali superset.
> - **D4-1 ✅ DIPUTUSKAN (Director 2026-06-05): Metabase embed** untuk Dashboard KS (SMA-47) — Metabase sudah di stack `smk_db`, dashboard agregat signed-embed + kartu KPI dikoding di header.
> - **SMA-50 E2E ✅ CLOSED & APPROVE** (PR #54). 28/28 skenario jalur P0 (auth→student→grade→attendance→SPP→chat) + negatif 401/403 hijau di CI. Verifikasi Cowork: berjalan di DB **`smk_test`** ephemeral (service pgvector di CI), TIDAK menyentuh smk_db prod/staging (N-20 aman). Done: `.tasks/done/SMA-50-e2e-DONE.md`.
> - **SMA-47 Dashboard KS ✅ CLOSED & APPROVE** (PR #57, Metabase embed). Verifikasi Cowork di kode: secret server-only (bukan NEXT_PUBLIC_, tak ke bundle browser), JWT HS256 exp+10mnt mint per-request (route dynamic), RBAC `/dashboard/executive` server-side fail-closed (KS/SA saja, else redirect), env-gated placeholder, CSP+compose `${}` gated. Director: Metabase "KS Overview" + 4 kartu + embedding + `.env` VPS sudah diset. Done: `.tasks/done/SMA-47-dashboard-ks-DONE.md`.
> - **🔴 N-21 (CRITICAL) ✅ FIXED & APPROVE** (PR #60). Seluruh app terautentikasi (login + semua dashboard) JS-nya MATI di prod sejak SMA-26 (FIX-T05) — tak terdeteksi karena hanya landing/API/Metabase yang pernah diuji; SMA-47 menyingkapnya (tombol login tak merespons). Akar: middleware nonce-CSP tak set `Content-Security-Policy` di REQUEST header → Next.js 15 tak bisa menyetempel nonce ke `<script>` → `strict-dynamic` blokir semua JS halaman dinamis. Fix: 1 baris `requestHeaders.set('Content-Security-Policy', csp)`. Verifikasi Cowork di diff. **Wajib bukti login hidup di staging sebelum main.** Done: `.tasks/done/N21-csp-nonce-DONE.md`.
> - **▶️ Sisa Sprint 4 (penutup Tahap 1, SERIAL):** ▶️SMA-52 perf/index → SMA-53 API docs → **Tahap 1 DITUTUP**. **Backlog:** OBS-1b (scrub nama tak-berlabel), R-03 hardening (gate aktivasi Claude), **F-3** (`/metrics` publik → batasi internal/auth), N-20 (isolasi DB staging/prod), N-19 (relokasi clone non-sync).
>
> **A. Yang SUDAH live di `main` + Produksi (terverifikasi git log, Deploy #68–#76, 2 Juni):**
> N-15-base start.sh fail-hard (#34/D#68) · **SMA-46 chatbot `/ai/chat`** (#35/D#69) · **SMA-46a KB-CRUD draft→publish** (#36/D#70) · **SMA-46b knowledge-UI `/dashboard/knowledge`** (#37/D#71) · N-17 backfill-drafts (#38/D#72) · OBS-1 Sentry (#39/D#73) · Landing page (#40/D#74) · CSP fix (#41/D#76). → **Koreksi:** ledger lama menandai SMA-46/N-15 "DITAHAN/menunggu merge" — itu KELIRU; semua sudah merged+deploy. SMA-46a & SMA-46b sebelumnya tak tercatat sama sekali. Sprint 3 = TUTUP TOTAL.
>
> **B. ✅ N-18 (HIGH) — CLOSED 2026-06-04 — guardrail kini di produksi.**
> N-15a smoke-test tabel domain (`auth.users` via `prisma db execute`) di-APPROVE Cowork. Gitflow diadopsi & diselaraskan: `develop`/`staging` di-rebuild dari `main` + cherry-pick smoke-test `3011725`, dipromosikan `develop`→`staging`→`main`. **Bukti:** `origin/main:apps/api/start.sh` mengandung blok SMOKE-TEST · **Deploy #79 `main` (f677d9e) HIJAU** (deploy hijau dgn start.sh fail-hard = skema prod utuh) · Deploy #78 staging hijau. Done-report: `.tasks/done/N18-gitflow-realign-DONE.md`.
> **Keputusan Director 2026-06-04: ADOPSI GITFLOW** `feat→develop→staging→main` (lihat `docs/WAYS-OF-WORKING.md` §Git flow).
> **N-18a (LOW, backlog):** `develop` tertinggal 1 commit dari `main` (merge-commit promosi) → sinkronkan `git checkout develop && git merge origin/main && git push` sebelum fitur berikut. **Deploy #77 staging (commit lama) GAGAL** tapi disusul #78 hijau — pantau bila berulang.
>
> **C. 🔧 P0 REPO — index git lokal KORUP** (`git status` → "index file corrupt"). Inilah penyebab working-tree queue.md ter-revert & operasi merge berperilaku aneh. Perbaikan di mesin Director: `rm -f .git/index && git reset` lalu verifikasi `git status`.
>
> **D. 📒 Disiplin baru — queue.md WAJIB di-commit tiap update** (di `develop`). Akar masalah hari ini: update Sprint 4 sesi sebelumnya di-edit tapi tak pernah di-commit → checkout menimpanya → hilang.
>
> **E. ✅ N-14 Fase 4 / N-11 — CLOSED 2026-06-04.** rag_chunks prod diisi via SQL (seed FAQ PPDB) + di-embed lewat node-di-container (Ollama `nomic-embed-text`). **Bukti:** `SELECT count(*) total, count(embedding) embedded` → `total=1, embedded=1`, `dim=768` (cocok `vector(768)`). Skema prod utuh (dikonfirmasi smoke-test Deploy #79 hijau). Insiden N-14 = SELESAI TOTAL. (Uji `/ai/chat` end-to-end = opsional, butuh token; bukan syarat tutup N-14.)
>
> **F. ▶️ Urutan kerja berikut (SERIAL):** ✅① fix index git · ✅② gitflow + smoke-test ke prod (N-18) · ✅③ N-14 Fase 4 · ⏳④ commit ledger ini ke `develop` · ▶️⑤ **Sprint 4: OBS-1a → SMA-49 → SMA-48(R-03)** ← AKTIF. **N-19 (terbuka):** clone lokal korup berulang (index+config) — relokasi ke path non-sync.
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
>
> ⚠️ **Linear ditinggalkan mulai 2026-05-31.** Status task kini canonical di file ini.
> `SMA-XX` = kode internal saja (tidak ada Linear issue). Claude Code: baca queue.md sebagai sumber tunggal.

---

## 📊 STATUS RINGKAS (per 2026-05-29)

| | |
|---|---|
| **Fase** | Tahap 0 core SELESAI & terverifikasi → membuka Sprint-0 Tahap 1 |
| **Go/No-Go** | ✅ **CONDITIONAL GO** (28 Mei) — Tahap 1 boleh mulai, TAPI 4 carryover Tahap 0 wajib tuntas sebagai Sprint-0 |
| **Audit teknis** | 10/12 temuan CLOSED & diverifikasi runtime (T-07, T-08, T-09, T-12 = medium, masuk desain Tahap 1) |
| **Test terverifikasi** | packages/auth 50/50 (coverage 100%) · apps/api 62/62 — diuji ulang 29 Mei |
| **Carryover Tahap 0 (Sprint-0)** | W2-04 n8n · W3-02 Grafana+/metrics · W4-02 onboarding · W4-04 sprint-plan Tahap 1 |

> Catatan koreksi: deklarasi "Tahap 0 SELESAI 23/23" sebelumnya terlalu optimistis.
> Status akurat = **core selesai + 4 carryover non-blocking dipindah ke Sprint-0**.

---

## 🚑 HARDENING MENDESAK — Insiden 30 Mei 2026 (situs sempat down 521)

> Brief siap-eksekusi: `.tasks/HARDENING-N7-N8-BRIEF.md`.

| ID | Masalah | Status | Aksi |
|---|---|---|---|
| **N-8** | nginx reverse proxy TIDAK ada di docker-compose → hilang tiap reboot (akar 521). Kini nginx ADA di docker-compose dengan `restart=unless-stopped` | ✅ CLOSED (31 Mei) — verified VPS | nginx di compose, `restart=unless-stopped`, situs 307. Commit `0c01f84`, laporan `.tasks/done/N8-nginx-compose-DONE.md`. Reboot-safe. |
| **N-7** | Origin tanpa TLS 443; Cloudflare Flexible (trafik CF↔origin tak terenkripsi) | ✅ CLOSED (30 Mei) | nginx `listen 443 ssl` + Cloudflare Origin Cert (15-thn, di VPS `infrastructure/nginx/certs/`, gitignored). Cloudflare **Full (Strict)** + Always Use HTTPS. Verifikasi: `https://localhost/login`=200, web 307, api 200, Edge SSL Active. Enkripsi end-to-end. |

**Status W3-02 (SMA-15):** ✅ `/metrics` terverifikasi runtime 200 (https://api.smkdarussalamsubah.sch.id/metrics, 30 Mei).
Dashboard Node.js jalan. ⚠️ Dashboard PostgreSQL/Redis butuh `postgres-exporter`+`redis-exporter` (addendum, belum dikerjakan).

---

## 🔄 SEDANG DIKERJAKAN

→ Lihat `.tasks/current.md` (hanya pointer; status resmi tetap di file ini)

---

## ✅ BLOCKING — Audit Fix dari Laporan System Analyst (26 Mei 2026) — SEMUA CLOSED

> **STATUS 2026-05-29: SELURUH item BLOCKING di bawah sudah CLOSED & diverifikasi runtime.**
> FIX-T01..T06, T10, T11, DOC-O02 — semua selesai. W4-03 Go/No-Go tidak lagi BLOCKED.
> Detail per item tetap diarsipkan di bawah untuk jejak audit. Referensi laporan:
> `docs/Laporan_System_Analyst_DIIS_2026-05-26.docx` & `Laporan_..._2026-05-29.docx`.

---

### [BLOCKING-1] FIX-T01 — ZodValidationPipe global tanpa schema
**Linear:** SMA-22 | **Severity:** 🔴 CRITICAL | **Sprint:** Minggu-3
**Estimasi:** 2 jam | **Model:** Sonnet 4.5+
**Depends on:** —

**Scope:**
- Refactor `apps/api/src/common/pipes/zod-validation.pipe.ts` — fail-secure jika tidak ada schema
- Buat decorator `@ValidateBody(schema)` yang simpan schema ke reflector metadata
- Update `apps/api/src/main.ts` — global pipe tetap aktif tapi sekarang fail-secure
- Tulis 2 integration test: body invalid → 400, body valid → 200
- Update `queue.md` item W3-03 dari ✅ ke ⚠️

**Bukti runtime yang wajib:** `curl -X POST /api/v1/... -d '{invalid}' → 400 + error array`

---

### [BLOCKING-2] FIX-T02 — KeycloakGuard belum APP_GUARD global
**Linear:** SMA-23 | **Severity:** 🔴 CRITICAL | **Sprint:** Minggu-3
**Estimasi:** 1.5 jam | **Model:** Sonnet 4.5+
**Depends on:** FIX-T01 (parallel OK)

**Scope:**
- Update `apps/api/src/app.module.ts`: `{ provide: APP_GUARD, useClass: KeycloakGuard }`
- Pastikan `@Public()` ada di: HealthController, auth callbacks
- Tulis 2 integration test: tanpa token → 401, @Public() tanpa token → 200
- Update CLAUDE.md Section 10: tambah baris APP_GUARD decision

**Bukti runtime yang wajib:** `curl http://localhost:3001/api/v1/students` tanpa token → 401

---

### [BLOCKING-3] FIX-T03 — Port mismatch docker/nginx/main.ts
**Linear:** SMA-24 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 45 menit | **Model:** Haiku 4.5
**Depends on:** FIX-T01, FIX-T02 selesai dulu

**Scope:**
- `infrastructure/docker/docker-compose.yml`: PORT=3000 → PORT=3001
- `infrastructure/nginx/nginx.conf`: upstream api:3000 → api:3001
- Healthcheck: port 3000 → port 3001

**Bukti runtime yang wajib:** `docker compose ps` → api Healthy + `curl localhost:3001/api/health` → 200

---

### [BLOCKING-4] FIX-T04 — PostgreSQL port 5432 exposed di docker-compose
**Linear:** SMA-25 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 1 jam | **Model:** Haiku 4.5
**Depends on:** FIX-T03 (parallel OK)

**Scope:**
- Hapus `ports: ["5432:5432"]` dari service postgres di `docker-compose.yml`
- Buat `infrastructure/docker/docker-compose.dev.yml` untuk dev override
- Dokumentasi SSH tunnel untuk koneksi dev lokal

**Bukti runtime yang wajib:** `nc -zv 204.168.242.123 5432` → Connection refused

---

### [BLOCKING-5] FIX-T06 — Backup PostgreSQL belum aktif
**Linear:** SMA-27 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 2 jam | **Model:** Haiku 4.5
**Depends on:** FIX-T04 (setelah postgres secure)

**Scope:**
- Tambah service `pg-backup` di docker-compose: pg_dump + upload MinIO, cron 02:00 WIB
- Buat `infrastructure/n8n/backup-daily.json` (selesaikan SMA-12)
- Buat `docs/runbooks/restore-database.md`

**Bukti runtime yang wajib:** `mc ls minio/diis-backup/` → ada file dump hari ini

---

### [BLOCKING-6] DOC-O02 — Definition of Done wajib runtime verification
**Linear:** SMA-30 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 45 menit | **Model:** Haiku 4.5
**Depends on:** — (bisa dikerjakan parallel, idealnya pertama)

**Scope:**
- Update CLAUDE.md Section 9: tambah blok "Runtime Verification WAJIB"
- Update template `.tasks/current.md` dan `.tasks/queue.md`: tambah field `Runtime Verification:`

---

### [BLOCKING-7] DOC-T11 — README versi salah & Flutter fiktif
**Linear:** SMA-29 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-3
**Estimasi:** 30 menit | **Model:** Haiku 4.5
**Depends on:** — (parallel OK)

**Scope:**
- Update README: Next.js 15, NestJS 11, React 19, Flutter → Deferred Tahap 3
- Tandai folder-folder yang belum ada di Tahap 0

---

### [BLOCKING-8] FIX-T05 — CSP unsafe-eval + unsafe-inline
**Linear:** SMA-26 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-4
**Estimasi:** 3 jam | **Model:** Sonnet 4.5+
**Depends on:** BLOCKING-3 (port mismatch) selesai

**Scope:**
- Hapus unsafe-eval dari CSP di `infrastructure/nginx/nginx.conf`
- Implementasi nonce-based CSP di Next.js middleware
- Test dengan CSP Evaluator

---

### [BLOCKING-9] FIX-T10 — Zero unit test security-critical paths
**Linear:** SMA-28 | **Severity:** 🟠 HIGH | **Sprint:** Minggu-4
**Estimasi:** 3 jam | **Model:** Sonnet 4.5+
**Depends on:** FIX-T02 (APP_GUARD selesai dulu)

**Scope:**
- Unit test `verifyToken()`, `hasRole()` di `packages/auth`
- Unit test `KeycloakGuard.canActivate()` di `apps/api`
- Target: ≥70% coverage `packages/auth`
- CI pipeline jalankan test ini

---

## 📋 ANTRIAN REGULER (setelah semua BLOCKING selesai)

### [QUEUE-1] W3-02 Monitoring Config ✅ SELESAI
**Linear:** SMA-15 | **Status:** ✅ DONE 2026-05-30 (runtime + exporter keduanya selesai)

- `/metrics` 200 terverifikasi di VPS (curl 2026-05-30)
- Dashboard Node.js jalan. PostgreSQL + Redis butuh deploy exporter (PR SMA-19 branch)
- `postgres-exporter` + `redis-exporter` → PR `feat/SMA-19-onboarding-exporter`
**Laporan:** `.tasks/done/SMA-15-monitoring-DONE.md`

---

### [QUEUE-2] W4-01 Dokumentasi Arsitektur
**Linear:** SMA-18 | **Estimasi:** 1.5 jam

**Scope:**
- `docs/architecture/system-overview.md`
- `docs/deployment/env-variables.md`
- `docs/deployment/setup-server.md`

---

### [QUEUE-3] W4-02 Developer Onboarding Guide ✅ SELESAI
**Linear:** SMA-19 | **Status:** ✅ DONE 2026-05-30
**Branch:** `feat/SMA-19-onboarding-exporter` | **Commit:** `b40a299`
Semua path + script terverifikasi nyata. Laporan: `.tasks/done/SMA-19-onboarding-DONE.md`

---

### [QUEUE-4] W4-03 Checklist Final Go/No-Go ✅ SELESAI
**Linear:** SMA-20 | **Status:** ✅ CONDITIONAL GO (2026-05-28)
**Hasil:** `docs/gates/go-no-go-tahap0.md` — semua FIX-T01..T05 sudah closed & diverifikasi.
4 carryover non-blocking dipindah ke Sprint-0 Tahap 1 (lihat STATUS RINGKAS di atas).

---

### [QUEUE-5] W2-04 n8n Workflow Health-Check ✅ SELESAI
**Linear:** SMA-12 | **Status:** ✅ DONE 2026-05-30
**Branch:** `feat/SMA-12-n8n-workflows`

**Hasil:**
- `infrastructure/n8n/workflows/health-check.json` — monitor /health setiap 5 menit, notif WA jika DOWN
- `infrastructure/n8n/workflows/backup-daily.json` — konfirmasi backup MinIO setiap 02:00 WIB, notif OK/GAGAL
- `infrastructure/n8n/README.md` — panduan import + konfigurasi credential
- `infrastructure/docker/docker-compose.yml` — tambah FONNTE_API_KEY + ADMIN_PHONE_NUMBER ke env n8n

**Bukti:** JSON valid (node -e JSON.parse → OK). Tidak ada secret hardcoded (grep bersih).
**Laporan:** `.tasks/done/SMA-12-n8n-DONE.md`

---

### [QUEUE-6] W3-03 Security Hardening Verification (REVISED)
**Linear:** SMA-16 | **Estimasi:** 1 jam

> ⚠️ DIAUDIT — beberapa item yang diklaim ✅ ternyata bermasalah.
> Item 4 (Zod global pipe) = ⚠️ ada di FIX-T01 (SMA-22)
> Item KeycloakGuard = ⚠️ ada di FIX-T02 (SMA-23)
> Task ini dijalankan SETELAH semua BLOCKING-1..5 selesai.

**Scope — verifikasi 12 item checklist (ulang dari awal dengan runtime proof):**
1. ThrottlerGuard 100 req/menit → verifikasi runtime
2. Helmet.js → verifikasi header di curl output
3. CORS policy → verifikasi allowed origins
4. ~~Zod validation global pipe~~ → diselesaikan di FIX-T01
5. Winston audit logger → verifikasi log output
6. HTTP Exception filter → verifikasi error format
7. JWT verification JWKS → verifikasi dengan expired token
8. Rate limit per-route (auth endpoints) → perlu implementasi
9. SQL injection protection → Prisma, verifikasi
10. XSS headers → Helmet config audit
11. CSRF protection → next-auth config
12. Environment variable validation → startup schema

---

## 🏁 SPRINT 3 — Finance + AI + Notification (berjalan)

> ⚙️ **KEBIJAKAN (2026-06-01): EKSEKUSI SERIAL — satu task per waktu.** Paralel SMA-41+42 memicu collision (schema.prisma, migration, docs, pull main, queue.md ketimpa) + Prisma client tak ter-regenerate (Finance error approvedBy/approvedAt → perlu `prisma generate`). Urutkan by dependency; tunggu merge+CI hijau sebelum task berikutnya. Setelah merge schema → `prisma generate` dulu.

### SMA-42 — NotificationAdapter — ✅ MERGED ke main (CI hijau, 2026-06-01)
**Model:** Sonnet 4.6 | Interface `NotificationAdapter` @smk/types + 3 adapter (Log default/Fonnte/SMTP stub) + factory env + durability (pending-first, idempotensi N-9, fail-soft, startup retry). Review ✅ APPROVE.
**Backlog LOW:** N-9b (idempotensi hanya cek `sent`) · SMTP stub (Nodemailer Sprint 4). **Laporan:** `.tasks/done/SMA-42-notification-adapter-DONE.md`

### SMA-41 — Finance SPP CRUD + Approval — ✅ MERGED ke main (CI hijau, 2026-06-01)
**Model:** Sonnet 4.6 | **Commit:** `ff08ecb` | digabung satu merge dengan SMA-42.
Migration additive `20260601000002_sprint3_spp_approval` (approvedBy/approvedAt) · 5 endpoint (record/list/summary/history/approve) · RBAC SA/TU input + SA/KS approve (separation of duties) + SISWA/OT ownership · 36 test, coverage finance 99%.
**⚠️ Pasca-merge:** `prisma generate` wajib (Finance error sebelumnya karena client lama). **Laporan:** `.tasks/done/SMA-41-finance-spp-DONE.md`
**Backlog:** paidAt historis (saat ini now()) → enhancement.

### SMA-44 — RAG: RagChunk model + seeder FAQ — ✅ MERGED ke main (PR #30, `837a939`, Deploy #65 hijau)
**Branch:** `feat/SMA-44-rag-chunk` | **Laporan:** `.tasks/done/SMA-44-rag-chunk-DONE.md` | **Model:** Sonnet 4.6
**N-11 ⚠️ REOPENED (prod):** model `RagChunk` benar di schema, TAPI verifikasi produksi 2026-06-01 menunjukkan tabel TIDAK ADA → lihat N-14.

> 🔴 **N-14 (CRITICAL) — CONFIRMED 2026-06-01 — SELURUH skema DIIS tidak pernah terbentuk di produksi.** Detail + runbook: `.tasks/INCIDENT-N14-prod-schema-missing.md`.
> **Akar:** `smk_db` dibagi DIIS+Keycloak+n8n+Metabase → `migrate deploy` pertama P3005 (DB tak kosong) → `start.sh` (baris 16–30) auto-baseline: `migrate resolve --applied` semua migration TANPA jalankan SQL (`_prisma_migrations` semua `steps=0`) → tabel DIIS tak pernah dibuat. Data loss NIHIL (R-05). Set migration lengkap & bisa dari nol.
> **Pemulihan — ✅ CONTAINED 2026-06-01:** backup (`~/smk_pre_n14.dump`, 840K) · `prisma db push` SUKSES (tabel `academic.*`/`finance.spp_payments`/`ai_knowledge.rag_chunks` ADA di smk_db, N-11 CLOSED) · `_prisma_migrations` direkonsiliasi → 6 baris bersih, semua finished_at terisi, 0 NULL/duplikat → restart api tak akan re-baseline. ⏳ Sisa: FAQ chunks via endpoint SMA-46 + backfill embedding.
> **Follow-up wajib:** ~~**N-15**~~ ✅ **CLOSED (2026-06-02)** lalu **SMA-46**.
> **N-15 (HIGH) ✅ CLOSED 2026-06-02:** `start.sh` — cabang auto-baseline dihapus, fail-hard dengan `exit 1` + pesan jelas. Branch `fix/N15-startsh-no-autobaseline`. Laporan: `.tasks/done/N15-startsh-DONE.md`. Tunggu review Cowork sebelum merge.
> **N-16 (keputusan Director 2026-06-01):** pemulihan dilakukan di **`smk_db` (shared)** demi kecepatan; isolasi DB (`diis_db`) DITUNDA sebagai perbaikan terpisah. Mitigasi P3005 ke depan = fix start.sh (N-15).
> **N-11:** CLOSED otomatis saat rag_chunks nyata terbentuk (Fase 2 runbook).
> **SMA-46 DITAHAN** sampai pemulihan Fase 2–4 selesai.
**Verifikasi analis:** Deploy hijau = migrate deploy sukses (tak ada DROP/ALTER destruktif rag_chunks). Verifikasi schema-sync penuh (grep model di working tree) tertunda sampai mount lokal sinkron dengan main — pola sama SMA-31/39.

### SMA-43 — Event Wiring (producer→NotificationService) — ✅ MERGED ke main (PR #32, CI hijau, 2026-06-01)
**Branch:** `feat/SMA-43-event-wiring` | **Commit:** `a39ec99` | **Model:** Sonnet 4.6
5 event ter-wire: student.enrolled · student.statusChanged · grade.submitted · attendance.recorded (alpha/sakit) · payment.received (paid/late). NotificationListener @OnEvent() → notify() dengan refType+refId idempotensi. N-10: BOS = TODO Tahap 2. @nestjs/event-emitter@^3.1.0 dikonfirmasi oleh Director.
tsc 0 · eslint 0 · 346 tests hijau · coverage 85.58%.
**Laporan:** `.tasks/done/SMA-43-event-wiring-DONE.md`
**Gerbang review Cowork (2026-06-01):** ✅ APPROVE — boleh merge. Verified: emit pasca-commit (tak ada notif hantu), filter di sisi emit, idempotensi refId per-penerima (`:ortu`), N-10 tanpa BOS.
  - **N-12 LOW (backlog):** durability — `pending` ditulis di listener pasca-emit, bukan pre-emit per gate §5. Aman Tahap 1 (EventEmitter2 in-process sync, jendela commit→pending sub-ms tanpa I/O). Outbox/pre-emit pending = ranah BullMQ Tahap 2.

### SMA-45 — AIGateway + OllamaAdapter — ✅ SELESAI, review ✅ APPROVE (PR #33, siap merge)
**Branch:** `feat/SMA-45-ai-gateway` | **Model:** Sonnet 4.6
Interface `AIGateway`+`RagContext` @smk/types · `OllamaAdapter` (embed+chat, timeout, dimensi guard gate §2.1) · factory `AI_GATEWAY` via env (`AI_PROVIDER=ollama` default, `claude` → throw Sprint 4) · `AiService.backfillEmbeddings()` via `$queryRaw`+`$executeRaw` · script `db:embed-faq` · env Zod (OLLAMA_*) · docs env-variables.md §11b.
tsc 0 · eslint 0 · 361/361 tests hijau · coverage 83.81%.
**Laporan:** `.tasks/done/SMA-45-ai-gateway-DONE.md`
**⚠️ Backfill nyata:** Director jalankan `npm run db:embed-faq` di VPS setelah merge (Ollama + model nomic-embed-text sudah pull).
**Gerbang review Cowork (2026-06-01):** ✅ APPROVE. Verified: `$queryRaw`/`$executeRaw` parameterized (aman injection), dimensi guard 768, backfill idempoten (IS NULL filter), factory env tanpa hardcode. Backlog **LOW:** `vector.join(',')` bisa notasi eksponensial — format eksplisit bila backfill error.

### Antrian Sprint 3 (SERIAL — satu per waktu)
1. ~~SMA-43~~ ✅ merged · ~~SMA-45~~ ✅ merged
2. **SMA-46** ✅ SELESAI 2026-06-02 — PR `feat/SMA-46-chatbot`, menunggu review Cowork + merge.
   POST /ai/chat (RAG, throttle 20/mnt) · GET+POST /ai/knowledge (SA) · POST /ai/knowledge/backfill (SA, N-13).
   tsc 0 · eslint 0 · 375/375 tests · src/ai coverage 95.6%. Laporan: `.tasks/done/SMA-46-chatbot-DONE.md`.
   - **N-13 CLOSED:** backfill dipindah ke `POST /ai/knowledge/backfill` (ganti script ts-node yang tidak bisa jalan di image prod).

> 🏁 **SPRINT 3 SELESAI** (pending merge SMA-46). Semua modul Finance+AI+Notif ter-deliver.
> Langkah berikutnya: review Cowork SMA-46 → merge → mulai Sprint 4 (SMA-48 Claude adapter, SMA-49 chat history, dll).

---

## 🏁 SPRINT 1 & 2 — Tahap 1 — ✅ SPRINT 2 SELESAI

> Sprint 1 (Foundation/Student/PPDB/Auth) + Sprint 2 (Academic Core) semua modul P0 = SELESAI.
> **Sprint 2 DITUTUP 2026-06-01.** Sprint 3 (Finance+AI+Notif) menjadi antrian aktif.

### SMA-39 — Schedule View (semua role) — ✅ SELESAI & MERGED ke main (2026-06-01)
**Sprint:** 2 (penutup) | **Selesai:** 2026-06-01 | **Model:** Sonnet 4.6
**Deliverable:** schema Schedule additive + migration SQL + GET/POST /schedules + RBAC ownership + 409 konflik (kelas/guru/ruang) + seed dummy + 28 unit test (coverage ~95%) + forward-compat KBM didokumentasikan
**Laporan:** `.tasks/done/SMA-39-schedule-DONE.md`
**Gerbang review Cowork (2026-06-01):** ✅ APPROVE. PR sudah di-merge ke main oleh Director sebelum F-1 difix → F-1 turun jadi **fast-follow** (non-blocking, bukan security).
  - **F-1 MEDIUM → SMA-39a ✅ CLOSED & MERGED (2026-06-01):** `academicYear` cross-check vs `assignment.academicYear` — mismatch → 400 BadRequestException, gagal cepat. +1 unit test. 272 tests. PR #27 MERGED ke main, CI ✅. Laporan: `.tasks/done/SMA-39a-academicyear-DONE.md`.
  - **F-2 LOW (backlog):** konflik guru/ruang app-level non-transaksional → celah TOCTOU double-book (kelas aman via unique DB). Mitigasi nanti.
  - **F-3 INFO → ✅ VERIFIED (2026-06-01):** VPS `curl https://api.smkdarussalamsubah.sch.id/health` → 200 pasca-reboot. `migrate deploy` jalan sebelum NestJS start → tabel `academic.schedules` ada di DB production. (Bonus: reboot-safety N-8 terbukti ulang.)

### SMA-31 — Foundation Schema (N-1, N-2, T-12)
**Status:** ✅ DONE & MERGED (PR #17, `f505d88`) — migration **APPLIED & verified di production**
**Branch:** `feat/SMA-31-foundation-schema` (merged main)
**Deliverable:** schema.prisma ✅ · migration `20260531000001_sprint1_foundation` ✅ · generate ✅ · validate ✅ · tsc ✅
**Bukti runtime DB nyata:** deploy.yml jalankan `prisma migrate deploy` SEBELUM NestJS start → api tidak akan healthy jika migrasi gagal. Deploy `f505d88` hijau + `curl api/health` → 200 = tabel Grade/Attendance/RagChunk SUDAH ada di DB production (bukan mock).
**Laporan:** `.tasks/done/SMA-31-foundation-schema-DONE.md`

> **Unlocked:** SMA-37/38 (Grade + Attendance) — keduanya sudah merged.

### Portal Nilai & Absensi (frontend)
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/portal-nilai` (commit `1e8c342`)
**Laporan:** `.tasks/done/portal-nilai-DONE.md`
**Note:** `/dashboard/nilai` untuk SISWA + ORANG_TUA. Server component fetch, child selector client-side. tsc ✅ · next build ✅ (7/7 pages).

### SMA-38 — Attendance Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-38-attendance` (commit `9615a11`)
**Laporan:** `.tasks/done/SMA-38-attendance-DONE.md`
**Note:** Bulk insert atomik (prisma.$transaction), ownership GURU via TeachingAssignment.

### SMA-37 — Grade Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-37-grade-module` (commit `4a80b94`, branch dari SMA-36)
**Laporan:** `.tasks/done/SMA-37-grade-DONE.md`
**Note:** Branch ini include PrismaExceptionFilter global + cleanup TeachingAssignmentService.

### SMA-36 — TeachingAssignment Module
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-36-teaching-assignment` (commit `d2258af`)
**Laporan:** `.tasks/done/SMA-36-teaching-assignment-DONE.md`

### SMA-34 — PPDB Lead Pipeline
**Status:** ✅ DONE 2026-05-31 — MERGED ke main (PR #20–#25)
**Branch:** `feat/SMA-34-ppdb-pipeline` (commit `985d1d9`)
**Laporan:** `.tasks/done/SMA-34-ppdb-DONE.md`

### SMA-32 — Student Module CRUD
**Status:** ✅ DONE 2026-05-31 — merged main + CI hijau
**Branch:** `feat/SMA-32-student-module` (merged)
**Laporan:** `.tasks/done/SMA-32-student-DONE.md`
**Note:** ⚠️ R-05 gate aktif — jangan input data siswa nyata sampai SMA-55 (consent) selesai

### SMA-35 — Auth /me + RolesGuard
**Status:** ✅ DONE 2026-05-31 — merged main + deployed (#47)
**Branch:** `feat/SMA-35-auth-me-rolesguard` (merged)
**Laporan:** `.tasks/done/SMA-35-auth-me-DONE.md`

---

## 🏁 SPRINT-0 SELESAI — 2026-05-30

> Semua 4 carryover Tahap 0 tuntas. Sprint-0 ditutup.
> **Tahap 1 resmi dibuka.** Design gate: `docs/tahap1-sprint-plan.md` (PR #14).
> Langkah berikutnya: buat Linear issues SMA-31..SMA-52, mulai Sprint 1 coding.

| Task | Status | PR |
|---|---|---|
| W2-04 n8n workflows (SMA-12) | ✅ | #10 |
| W3-02 /metrics + exporter (SMA-15) | ✅ | #9, #13 |
| W4-02 Developer Onboarding (SMA-19) | ✅ | #13 |
| W4-04 Sprint Plan Tahap 1 | ✅ | #14 |
| N-8 nginx compose | ✅ | #11, #12 |

---

## ✅ SUDAH SELESAI (Terverifikasi Runtime)

- W1-01 VPS Setup Script ✅
- W1-03 Monorepo Turborepo init ✅
- W1-04 Docker Compose (14 services) ✅
- W2-01 Keycloak Configuration (SMA-9) ✅ 2026-05-25
- W2-02 Prisma Schema (multi-domain) ✅
- W2-03 pgvector Migration (SMA-10) ✅ 2026-05-25
- W2-02 Prisma Seed Data (SMA-8) ✅ 2026-05-25 — 40 users, 10 kelas, 4 jurusan
- W3-01 GitHub Actions CI ✅
- W3-04 Next.js Web Scaffold ✅
- SMA-6 Cloudflare DNS ✅ 2026-05-27 — 9 records aktif. NS `celeste` + `corey` sudah diset di Hostinger (registrar). Propagasi berjalan.
- W4-01 Dokumentasi Arsitektur (SMA-18) ✅ 2026-05-29 — 3 dokumen selesai:
  `docs/architecture/system-overview.md`, `docs/deployment/env-variables.md`,
  `docs/deployment/setup-server.md`. Sekalian fix 2 production issues:
  REDIS_URL URL-encoding (Zod reject karena `@`/`#` di password) → python3
  encode di deploy.yml; healthcheck curl missing di node:20-alpine → apk add
  curl di runner stage. Deploy production berhasil commit fb71fc3.
- FIX-WEB-BUILD-31 ✅ 2026-05-29 — React error #31 saat `next build` diperbaiki.
  Root cause: duplikasi React 18 (root node_modules) vs React 19 (apps/web node_modules).
  Fix: tambah `overrides` di root package.json, regenerasi package-lock.json.
  Arsitektur: SessionProvider dipindah ke DashboardProviders.tsx (hanya /dashboard/*).
  Bukti: `✓ Generating static pages (7/7)` + `npx tsc --noEmit → 0 errors`.
  Done report: `.tasks/done/FIX-react19-duplicate-DONE.md`
  Lesson learned: monorepo npm workspaces bisa install versi React berbeda di
  tiap workspace jika tidak di-pin dengan overrides → selalu cek duplikasi
  dengan `npm ls react` saat ada React version error.

## ⚠️ DIKLAIM SELESAI — BELUM DIVERIFIKASI RUNTIME

- W2-05 NestJS API Scaffold — ⚠️ ada temuan T-01 & T-02, lihat SMA-22 & SMA-23
- W3-03 Security Hardening — ⚠️ ada temuan T-01 (Zod global) & T-02 (APP_GUARD), lihat SMA-22 & SMA-23

---

*Cowork AI akan update file ini setiap task selesai.*
*Claude Code: jika sebuah task sudah selesai, beri tahu Cowork via laporan akhir di current.md*
*Aturan baru: JANGAN centang ✅ tanpa bukti runtime. Lihat CLAUDE.md Section 9.*
