# Runbook — Setup Dashboard KS via Metabase Embed (SMA-47, D4-1)

> Disusun: Cowork analyst, 2026-06-05. Metabase SUDAH ada di stack (`smk-metabase`,
> proxy nginx → `https://analytics.smkdarussalamsubah.sch.id`, config di schema `metabase` pada `smk_db`).
> Tujuan: dashboard agregat untuk Kepala Sekolah, di-embed (signed) ke `/dashboard` aplikasi.

---

## 0. Prasyarat — pastikan Metabase bisa diakses

Di VPS:
```bash
docker ps | grep metabase            # smk-metabase harus Up
```
Lalu pastikan DNS subdomain `analytics` mengarah ke VPS (Cloudflare):
- Tipe **A** (atau CNAME ke root) `analytics` → IP VPS, **Proxied (oranye)**.
- Buka `https://analytics.smkdarussalamsubah.sch.id` di browser.

Jika 502/tak terjangkau: cek blok nginx untuk subdomain `analytics` (sudah ada `proxy_pass http://metabase:3000;`)
dan record DNS-nya. Jika container belum jalan: `docker compose up -d metabase`.

---

## 1. Setup awal Metabase (sekali saja, di browser)

1. Buka `https://analytics.smkdarussalamsubah.sch.id` → wizard "Welcome".
2. Buat **akun admin** (email + password kuat — simpan di password manager).
3. Saat ditanya "Add your data" → **boleh skip dulu** (kita tambah manual di langkah 2).

---

## 2. Tambahkan `smk_db` sebagai sumber data (untuk query tabel DIIS)

> Catatan: koneksi internal Metabase (schema `metabase`) hanya untuk config-nya sendiri.
> Untuk mengkueri tabel DIIS (academic/finance/student/ppdb), daftarkan `smk_db` sebagai Database.

Admin (ikon gerigi) → **Admin settings → Databases → Add database**:
- Database type: **PostgreSQL**
- Host: `postgres`  ·  Port: `5432`
- Database name: `smk_db`
- Username: `smk_admin`  ·  Password: (POSTGRES_PASSWORD dari `.env` VPS)
- Save → tunggu Metabase **sync schema** (academic, finance, student, ppdb, ai_knowledge muncul).

> Praktik baik (opsional, nanti): buat user PostgreSQL **read-only** khusus Metabase agar BI tak bisa menulis.

---

## 3. Buat 4 pertanyaan agregat (pakai Query Builder — tanpa SQL)

Klik **+ New → Question → pilih database `smk_db`**. Untuk tiap kartu:

| Kartu | Tabel | Summarize | Filter |
|---|---|---|---|
| **Siswa Aktif** | `student.students` | Count of rows | status = `active` (enum huruf kecil: active/inactive/graduated/dropped) |
| **SPP Terkumpul (bulan ini)** | `finance.spp_payments` | Sum of `amount` | status = paid **dan** `paid_at` = Current month |
| **% Kehadiran** | `academic.attendance` | Custom expression: `CountIf([Status]="hadir") / Count() * 100` (enum: hadir/izin/sakit/alpha) | bulan berjalan (opsional) |
| **Leads PPDB per Status** | `ppdb.leads` | Count of rows, **Group by** `status` (bar/pie). Enum: new/contacted/interested/registered/paid/accepted/rejected/cold | — |

> **SPP `spp_payments`:** kolom `status` (enum: unpaid/paid/late/waived), `amount` (Decimal), `paid_at`, `month` (1–12), `year`.

> Nama kolom persis bisa beda tipis — Query Builder menampilkan kolom yang ada, jadi pilih dari daftar
> (tak perlu hafal). Simpan tiap pertanyaan dengan nama jelas.

---

## 4. Susun Dashboard + catat ID

1. **+ New → Dashboard** → nama "KS Overview".
2. Tambahkan 4 pertanyaan tadi; atur tata letak.
3. Save. **Catat Dashboard ID** dari URL: `…/dashboard/<ID>` → angka `<ID>` itu yang dipakai.

---

## 5. Aktifkan Static (Signed) Embedding + ambil secret

1. Admin settings → **Embedding** → **Enable** (Static embedding).
2. **Salin "Embedding secret key"** (string panjang) — ini `METABASE_SECRET_KEY`.
3. Buka dashboard "KS Overview" → menu **Sharing (ikon panah/⬆) → Embed → Static embedding**.
4. Set parameter (kalau ada) → **Publish**. Ini mengaktifkan dashboard untuk di-embed via token signed.

---

## 6. Set `.env` di VPS

Edit `.env` aplikasi (yang dipakai service **web** — biasanya `/home/appuser/smart-ai-school/.env`):

```bash
cd /home/appuser/smart-ai-school
# tambahkan (jangan commit file .env — sudah gitignored):
cat >> .env <<'EOF'

# ── Metabase embed (SMA-47) ──
METABASE_SITE_URL=https://analytics.smkdarussalamsubah.sch.id
METABASE_SECRET_KEY=<paste-embedding-secret-key>
METABASE_DASHBOARD_ID=<angka-dashboard-id>
EOF

# restart service web agar env terbaca
docker compose up -d web        # atau: docker compose restart web
```

> ⚠️ **PENTING — service `web` pakai blok `environment:` EKSPLISIT, bukan `env_file: .env`.**
> Menaruh `METABASE_*` di `.env` saja TIDAK terbaca container web. Variabel WAJIB direferensikan
> di `infrastructure/docker/docker-compose.yml` pada service `web` (perubahan ini bagian dari PR SMA-47):
> ```yaml
>   web:
>     environment:
>       # ... NEXT_PUBLIC_* yang sudah ada ...
>       METABASE_SITE_URL: ${METABASE_SITE_URL}
>       METABASE_SECRET_KEY: ${METABASE_SECRET_KEY}      # server-side, BUKAN NEXT_PUBLIC_
>       METABASE_DASHBOARD_ID: ${METABASE_DASHBOARD_ID}
> ```
> Nilai `${...}` diinterpolasi docker-compose dari `.env` (gitignored) saat `docker compose up`.
> Jadi: nilai rahasia tetap di `.env`, hanya referensi `${}` yang masuk compose (ter-commit).
>
> Token embed digenerate **server-side** oleh Next.js (HS256, library `jsonwebtoken` yang sudah ada),
> jadi `METABASE_SECRET_KEY` TIDAK pernah sampai ke browser. Jangan taruh di `NEXT_PUBLIC_*`.

---

## 7. Prompt Claude Code (jalankan di sesi baru — sudah final)

```
PERAN: Claude Code executor, proyek DIIS. SERIAL. Jangan sentuh queue.md.

GROUNDING (baca ini saja): docs/runbooks/metabase-dashboard-ks-setup.md,
docs/tahap1-sprint4-design.md §5 (SMA-47), apps/web struktur app/dashboard,
apps/web auth/session (cara baca role), packages/auth (roles), CLAUDE.md §6 (KEPALA_SEKOLAH/SUPER_ADMIN),
docs/WAYS-OF-WORKING.md §Git flow.

BRANCH: feat/SMA-47-dashboard-ks dari develop (pastikan develop sinkron dgn main dulu). PR ke develop.

SCOPE:
1. Util server-side `metabaseEmbedUrl()`: generate signed JWT (HS256) dgn `jsonwebtoken`,
   payload { resource: { dashboard: Number(METABASE_DASHBOARD_ID) }, params: {}, exp: now+10menit },
   secret = METABASE_SECRET_KEY → kembalikan
   `${METABASE_SITE_URL}/embed/dashboard/<token>#bordered=false&titled=false`.
   Generate HANYA di server component / route handler — JANGAN expose secret ke client.
2. Halaman /dashboard (Next.js server component): render <iframe src={embedUrl}> responsif.
   RBAC: HANYA role KEPALA_SEKOLAH & SUPER_ADMIN; role lain → redirect ke dashboard mereka / 403.
3. Kartu KPI ringkas di header: server-fetch agregat dari endpoint NestJS yang SUDAH ADA
   (mis. finance summary, student count). Jangan bikin query duplikat bila sudah tersedia.
4. Env Zod (apps/web): METABASE_SITE_URL / METABASE_SECRET_KEY / METABASE_DASHBOARD_ID OPSIONAL.
   Tanpa env lengkap → tampilkan placeholder "Dashboard belum dikonfigurasi" (JANGAN crash, JANGAN build error).
5. infrastructure/docker/docker-compose.yml — service `web` pakai blok `environment:` EKSPLISIT
   (bukan env_file). TAMBAHKAN 3 referensi (nilai dari .env via interpolasi ${}):
     METABASE_SITE_URL: ${METABASE_SITE_URL}
     METABASE_SECRET_KEY: ${METABASE_SECRET_KEY}      # server-side, JANGAN NEXT_PUBLIC_
     METABASE_DASHBOARD_ID: ${METABASE_DASHBOARD_ID}
   JANGAN tulis nilai rahasia di compose — hanya referensi ${}.

CONSTRAINT: JANGAN commit secret. METABASE_SECRET_KEY hanya server-side (bukan NEXT_PUBLIC_).
Dashboard ID & URL dari env, tidak hardcode. RBAC ketat. Env-gated → CI hijau tanpa env.

BUKTI RUNTIME WAJIB: tsc 0 · eslint 0 · next build sukses · test: (a) role non-KS/SA tak bisa akses
/dashboard (redirect/403); (b) tanpa METABASE_* → placeholder, bukan crash.

DoD: dashboard embed + KPI cards + RBAC + env-gating. Working tree bersih.
LAPOR: done-report `.tasks/done/SMA-47-dashboard-ks-DONE.md` + PR ke develop.
JANGAN update queue.md. Tunggu review Cowork.
```

---

## Yang akan di-review Cowork
- Token digenerate **server-side** (secret tak bocor ke browser / tak ada di `NEXT_PUBLIC_`).
- RBAC `/dashboard` benar-benar membatasi ke KEPALA_SEKOLAH & SUPER_ADMIN.
- Env-gating: tanpa konfigurasi Metabase, app tetap build & jalan (placeholder), tidak crash.
- exp token pendek (≤10 menit) — embed URL tidak bisa dipakai ulang selamanya.
