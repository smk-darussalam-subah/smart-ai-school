# Decision Log — DIIS Smart AI School

> Catatan keputusan arsitektur dan teknis yang dibuat selama development.
> Format: Tanggal | Keputusan | Konteks | Lesson Learned

---

## 2026-06-11 — 2E: Agent harness terkurasi + Jadwal matrix

1. **ECC v2.0.0 diadopsi SUBSET, bukan wholesale** (14 skill + 13 agent + 4 rules relevan
   stack). **Hooks ECC sengaja TIDAK dipasang** — auto-exec script pihak-ketiga pada tiap
   tool-use memperluas permukaan serang tanpa kebutuhan; quality gate tetap CI + gerbang
   review. Audit keamanan & daftar eksklusi: `.claude/HARNESS.md`. Re-vendor manual.
2. **Skill ui-ux-pro-max v2.5.0** = referensi WAJIB pekerjaan frontend (CLAUDE.md).
   Symlink upstream di-resolve; script sinkronisasi upstream dihapus dari vendor.
3. **Deteksi bentrok jadwal dua lapis**: DB constraint (unique jpStart) + deteksi klien
   rentang-overlap (guru lintas kelas & kelas dobel). *Diketahui:* unique DB tidak
   menangkap overlap rentang (1–3 vs 2–4) — kandidat constraint/exclusion server-side.
4. **Redaksi audit diperkuat** (case-insensitive, substring, nested depth 3) + statusCode
   @HttpCode-aware. *Lesson:* denylist exact-match case-sensitive adalah ilusi keamanan.

---

## 2026-06-11 — 2D: Review-gate retrospektif 2B/2C + stabilisasi + modul KamilEdu

**Konteks.** 2B-1/2/3 + 2C-0..7 merged 9–10 Juni TANPA gerbang review & done-report (deviasi
WAYS-OF-WORKING); queue.md drift. Sesi 2026-06-11 (mandat Director: "sempurnakan, referensi
KamilEdu, tanpa intervensi") melakukan review retrospektif + perbaikan + 2 modul baru.

**Keputusan & temuan kunci:**
1. **PermissionGuard wajib FAIL-CLOSED** — rute ber-@RequirePermission tanpa user = 403,
   bukan pass. *Lesson:* guard otorisasi tidak boleh mengandalkan urutan guard lain.
2. **Override permission grant=false kini menarik izin role** (semantik schema ditegakkan);
   resolusi override difilter di QUERY (bukan scan tabel di JS); invalidasi cache:
   perubahan role-level → clear-all (350 user, TTL 5 mnt — konsistensi > hit-rate).
3. **Pengumuman (KamilEdu M14)** = schema `notification.announcements`, visibilitas audiens
   ditegakkan DI QUERY untuk non-manager; DELETE diizinkan penuh (tabel tanpa FK) — selaras
   kebijakan "CRUD penuh termasuk DELETE atas data dummy".
4. **/classes API resmi ada (KamilEdu M4)** — menutup bug frontend 2C yang memanggil endpoint
   fiktif (silent 404). DELETE kelas = 409 bila berelasi; nonaktifkan via isActive.
5. **Dashboard (KamilEdu M1)**: statistik hardcoded diganti data nyata + heatmap kehadiran
   kelas×hari (agregasi groupBy di DB; sel tanpa data = null, bukan 0%).
6. **Artefak coverage dilarang di git** (`coverage*/` di .gitignore; 677 file dibersihkan).
7. **Verifikasi sandbox ≠ CI penuh**: next build SIGBUS di sandbox → bukti build web
   didelegasikan ke CI; semua verifikasi lain (tsc/eslint/jest 592/nest build) hijau lokal.

**Lesson umum:** kecepatan merge 2B+2C dalam 2 hari membayar utang berupa 3 bug otorisasi
nyata + endpoint fiktif. Gerbang review BUKAN birokrasi — dua dari tiga bug permission
bersifat security (fail-open, revoke tak efektif). SERIAL + review tetap aturan.

---

## 2026-06-08/09 — Penutupan 2A: isolasi staging, Keycloak prod-mode, isolasi network

**N-20 — Isolasi staging (bentuk final).** DB logis `smk_staging_db` di container `smk-postgres` yang sama +
stack `smk-staging-*` (compose project `smk-staging`, port 3100/3101) + `deploy.yml` per-branch (staging
`/opt/diis-staging`, main `/home/appuser`) + guardrail `GUARD_STAGING_DB` (fail-hard bila target ≠ smk_staging_db).
*Trade-off (Director):* staging & prod berbagi proses PostgreSQL/Keycloak/Redis — minimal, bukan server baru.
*Bukti CLOSED-prod:* smk_db 9→9 migration / 14→14 tabel tak berubah; smk_staging_db 9 migration + schema terbentuk.

**N-23b — Keycloak production mode + tutup 8080.** `command: start` (tanpa `--import-realm` — anti revert URL
prod N-26; realm `diis` persist di DB). Env 24.0: `KC_HOSTNAME=auth.smkdarussalamsubah.sch.id`,
`KC_HOSTNAME_STRICT=false` (admin via tunnel), **`KC_HOSTNAME_STRICT_HTTPS=true`** (WAJIB true di belakang proxy
TLS — `false` memicu http:// di CSP → mixed-content; lihat N-29b), `KC_HTTP_ENABLED=true`, `KC_PROXY_HEADERS=xforwarded`,
`KC_CACHE=local` (single-node). Port `127.0.0.1:8080:8080` (loopback — tertutup internet, admin via SSH tunnel).
Cutover prod via `--force-recreate keycloak` (deploy biasa tak me-restart keycloak — by design). *Bukti:* G1–G5
+ login browser nyata dikonfirmasi Director.

**F-3 — Harden /metrics.** nginx blok publik `api.*`: `location /metrics { return 404; }`. Prometheus scrape
`api:3001/metrics` via jaringan internal, tak terpengaruh. *Bukti:* curl publik → 404, Prometheus target up.

**N-29 — DNS alias collision staging↔prod (regresi N-20).** *Root cause definitif:* Docker Compose **merge**
networks (bukan replace) → service override `api`/`web` di staging mendaftarkan alias service-name yang SAMA
(`api`/`web`) di `smk-network` → Docker DNS round-robin → nginx random-route prod→staging → login loop
(NEXTAUTH_URL staging). *Fix permanen:* nginx upstream menunjuk **container name** `smk-web`/`smk-api`
(bukan alias service `web`/`api`) → kebal terhadap alias apa pun yang didaftarkan staging. *Pelajaran:* stack
berbagi network = berbagi namespace alias; jangan andalkan alias service-name untuk routing kritis — pakai
nama container eksplisit, dan isolasi network sejak desain.

**N-29b — Admin console spinner.** *Root cause:* `KC_HOSTNAME_STRICT_HTTPS=false` → Keycloak emit `http://`
self-URL → masuk CSP halaman https → browser blokir login-status-iframe sebagai **Mixed Content** → spinner.
*Fix:* set `true`. *Pelajaran:* di belakang proxy TLS-terminating, strict-https HARUS true meski KC listen HTTP internal.

**CI merah — dua sebab terpisah** (dirty git working-tree di VPS + label `smk-staging-net`) → keduanya difix.

**Lesson umum sesi ini:** diagnosa konsol browser sering menunjuk GEJALA (redirect_uri/NEXTAUTH) bukan PENYEBAB
(DNS/Compose). Selalu turun ke lapisan infrastruktur sebelum menyalahkan konfigurasi aplikasi.

---

## 2026-06-08 — Keputusan arsitektur Tahap 2 (pasca audit eksternal)

> Basis: `Laporan_Audit_Komparatif_DIIS_2026-06-08.md` (skor 82%) + brainstorm Director–analis.
> Memformalkan deviasi (saran auditor: hentikan "deviasi diam-diam"). Berlaku untuk Tahap 2.

**1. RBAC → permission-based pragmatis (REVISI dari role-based, DEV-01).**
7 role tetap sebagai dasar; tambah tabel `permission` + `role_permissions` di DB yang dikelola Super Admin
(ubah izin tanpa deploy) + override per-user. Konteks: Director butuh izin fleksibel (mis. guru wali-kelas
lihat siswa kelasnya) — role-based murni butuh ganti kode+deploy. Sejalan rencana awal Tahap 1/3. Wali-kelas
bisa via atribut `Teacher.isWaliKelas` + scope kelas. Effort sedang; UI di halaman Manajemen User.

**2. Event/queue: EventEmitter (domain) + BullMQ (broadcast WA) + n8n (terjadwal) — REVISI DEV-02.**
Domain event tetap EventEmitter NestJS (type-safe, tested). BullMQ diintroduksi untuk **keandalan broadcast WA**
(antrian/retry/rate-limit/tahan-restart) — 350 ortu = volume rendah tapi batch wajib andal (Fonnte rate-limit
20–30 mnt/batch; EventEmitter in-process hilang bila restart). n8n = pemicu terjadwal eksternal: SPP (waktu
bayar + keterlambatan dari `spp_payments`) & kalender akademik (broadcast fleksibel) → cron n8n panggil endpoint
NestJS yang enqueue BullMQ. n8n = hybrid (terjadwal/eksternal), bukan automation engine tunggal.

**3. UI: adopsi shadcn/ui + design system landing.** 7 halaman frontend modul Tahap 2 butuh UI profesional &
konsisten. shadcn (Radix+Tailwind) aksesibel & cepat. State loading/empty/error wajib.

**4. Strategi data: dummy di TABEL DB (di-seed) + gerbang go-live data nyata.** Frontend dibangun di atas dummy
DB (bukan mock kode), CRUD penuh termasuk DELETE aman (FK: cascade/soft-delete/409). Data siswa NYATA digerbang:
R-05 consent + N-20 (`smk_staging_db` terpisah) + N-23b (Keycloak prod-mode, tutup 8080) + AuditLog persisten +
R-03 ditutup bila Claude.

**5. AuditLog persisten (temuan auditor, prasyarat UU PDP).** Tabel `AuditLog` + interceptor (bukan hanya Winston).

**6. Tabel referensi (DEV-03):** tambah `Subject`, `Major/Jurusan`, formalkan `Parent` sebelum frontend Akademik/PPDB.

**7. API docs Markdown cukup (Swagger ditunda, DEV-04). Blueprint → revisi v2.1** (cerminkan stack nyata).

**8. Activity Tracking & File Storage API = just-in-time** (saat modul yang membutuhkan digarap).

**9. Tooling.** **Context7 MCP** ditambahkan ke **Claude Code** (dokumentasi library versi-terkini: Next.js 15,
React 19, NestJS 11, Prisma, shadcn) → kurangi halusinasi API saat eksekusi Tahap 2. **Obsidian** = konsumsi
PRIBADI (lensa navigasi/backlink antar-dokumen) dengan **vault menunjuk ke folder repo git-tracked** — BUKAN
store terpisah (mencegah sumber-kebenaran ganda). Tidak memakai Obsidian-MCP (Claude Code sudah baca file repo).

**Lesson learned:** keputusan arsitektur WAJIB ditulis di sini saat dibuat; "deviasi diam-diam" (implementasi
menyimpang dari dokumen tanpa catatan) adalah temuan utama audit. CLAUDE.md §⭐ memuat ringkasan + presedensi.

---

## 2026-05-29 — React version deduplikasi via npm overrides

**Keputusan:** Paksa single React version di seluruh monorepo via `overrides` di root `package.json`.

```json
"overrides": {
  "react": "^19.1.0",
  "react-dom": "^19.1.0"
}
```

**Konteks:** `next build` gagal dengan React error #31 ("Objects are not valid as a React child — object with keys {$$typeof, type, key, ref, props}") saat prerender `/404`. Root cause: npm workspaces meng-install React 18.3.1 di root `node_modules/` (untuk memenuhi peer-deps `next-auth` v4) sementara `apps/web` meng-install React 19.2.6 di `apps/web/node_modules/`. Saat Next.js prerender worker berjalan, ia resolve React dari root (v18) sementara component bundle pakai React 19 — element shape mismatch → error #31.

**Lesson learned:** Monorepo npm workspaces bisa install versi package berbeda di tiap workspace jika tidak ada constraint eksplisit. Selalu verifikasi dengan `npm ls react` saat ada React-related build error. `/_error: /404` dalam error log adalah red herring — Next.js selalu fallback ke `/_error` worker saat ada prerender failure, bahkan di pure App Router.

---

## 2026-05-29 — SessionProvider dipindah dari root layout ke DashboardProviders

**Keputusan:** `NextAuthSessionProvider` tidak dipasang di root layout, melainkan hanya di `DashboardProviders.tsx` yang di-mount di `dashboard/layout.tsx`.

**Konteks:** Halaman publik (`/`, `/login`, `/404`) tidak membutuhkan SessionProvider. Memasang SessionProvider di root layout menambah `'use client'` boundary yang tidak perlu, mencegah halaman publik untuk di-static-generate dengan zero client JS.

**Lesson learned:** `SessionProvider` sebaiknya di-scope ke area yang membutuhkannya, bukan dipasang global di root layout. Ini juga memungkinkan `getServerSession()` di `dashboard/layout.tsx` untuk pass session sebagai prop ke `DashboardProviders` — menghindari waterfall dan loading flash di dashboard.

---

## 2026-05-28 — Auth Rate Limit pada auth endpoints

**Keputusan:** `@Throttle({ default: { ttl: 60_000, limit: 15 } })` wajib di auth endpoints.

**Konteks:** Default global throttle (100 req/menit) terlalu longgar untuk auth endpoints. Auth dibatasi 15 req/menit per IP untuk mencegah credential stuffing. (SMA-16, 2026-05-28)

---

## 2026-05-28 — Security Headers via Fastify onSend hook

**Keputusan:** Security headers di-set via Fastify `addHook('onSend')`, bukan Express helmet sebagai Fastify plugin.

**Konteks:** Express helmet tidak kompatibel langsung sebagai Fastify plugin. Header di-set via `addHook('onSend')` — fungsional equivalent, tested runtime. (SMA-16, 2026-05-28)

---

## 2026-05-26 — APP_GUARD global dengan opt-out @Public()

**Keputusan:** KeycloakGuard dipasang sebagai APP_GUARD global; endpoint yang tidak butuh auth diberi decorator `@Public()`.

**Konteks:** Security by default — endpoint baru protected tanpa perlu dekorasi eksplisit. Mencegah T-02 terulang. (SMA-23, 2026-05-26)

---

## 2026-05-26 — Zod sebagai validation library (bukan class-validator)

**Keputusan:** Zod digunakan untuk semua validasi DTO, bukan class-validator.

**Konteks:** Runtime type safety, shareable dengan frontend, compatible dengan TypeScript strict mode. (Section 10 CLAUDE.md)

---

*Dikelola oleh Cowork AI. Update setiap ada keputusan arsitektur baru.*
