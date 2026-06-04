# Sprint 4 — Design, To-Do & Prompts (Penutup Tahap 1)

> Disusun: Cowork analyst, 2026-06-02. Turunan `tahap1-sprint-plan.md` §7 + backlog terkumpul.
> **Eksekusi SERIAL — satu task per waktu.** queue.md = milik Cowork; prompt Claude Code TIDAK update queue.md.
> Status masuk Sprint 4: Sprint 1–3 + Knowledge Base + Observability (Sentry) = SELESAI/merged.

---

## 1. Tujuan Sprint 4 (= DoD Tahap 1)
Semua modul P0 live, test E2E hijau, KS punya dashboard, keamanan & regulasi tervalidasi. Setelah Sprint 4 → Tahap 1 ditutup.

## 2. Keputusan terkunci (gate)
- AIGateway + provider Ollama sudah ada (SMA-45). Sprint 4 menambah **ClaudeAdapter** untuk FAQ umum/reasoning (gate §6 decision tree).
- **R-03 (UU PDP) = gerbang keras SMA-48:** strip PII WAJIB sebelum request keluar ke Claude API. Reuse pola scrub OBS-1/OBS-1a.
- EventEmitter2 in-process (durability via notification_logs) — broker (BullMQ) = Tahap 2.
- Chatbot retrieval hanya `is_active=true` (KB workflow draft→publish sudah jalan).

## 3. Keputusan TERBUKA (butuh Director)
**D4-1 · Dashboard KS — Metabase vs koding penuh?**
Metabase SUDAH jalan di stack (`smk_db`). Opsi:
- (a) **Metabase embed** — buat dashboard di Metabase (query agregat: siswa aktif, SPP terkumpul, %kehadiran, leads PPDB) lalu embed (signed URL) ke `/dashboard` KS. **Cepat, kuat, low-code, refresh otomatis.** Trade-off: dependensi Metabase, styling kurang menyatu.
- (b) **Koding penuh** — endpoint agregat NestJS + chart di Next.js. Kontrol UI penuh, tapi lebih lama + maintain.
- **Rekomendasi analis:** (a) Metabase embed untuk MVP KS (hemat minggu kerja, data real-time), kartu KPI ringkas dikoding di Next.js untuk header. Final = Director.

**D4-2 · ClaudeAdapter — kapan pakai Claude vs Ollama?** (gate §6)
Default Ollama (lokal, gratis, data sensitif). Claude hanya untuk: pertanyaan umum non-PII + reasoning kompleks. **Aturan keras:** sebelum ke Claude → strip PII (R-03). Konfirmasi: aktifkan ClaudeAdapter sekarang atau simpan di belakang flag sampai R-03 diaudit?

**D4-3 · Anthropic API key & anggaran** — ClaudeAdapter butuh `ANTHROPIC_API_KEY` (sudah ada placeholder di compose). Director sediakan saat siap; sampai itu, adapter di-flag off (Ollama-only tetap jalan).

## 4. Urutan SERIAL Sprint 4 (by dependency)
```
1. OBS-1a   Hardening scrub Sentry (exception msg + breadcrumbs)      [Haiku]   — cepat, tutup gerbang privasi
2. SMA-49   Chat history (ChatSession/ChatMessage) + GET history       [Sonnet]  — schema additive
3. SMA-48   ClaudeAdapter + decision tree + R-03 strip-PII             [Sonnet]  — GERBANG REGULASI
4. SMA-47   Dashboard KS (Metabase embed + kartu KPI)                  [Sonnet]  — tergantung D4-1
5. SMA-50   E2E integration test suite                                 [Sonnet]
6. SMA-51   Security audit — RBAC coverage check                       [Sonnet]
7. SMA-52   Perf — query optimization + index review                  [Haiku]
8. SMA-53   API docs (Swagger / tabel)                                 [Haiku]
   Backlog kecil: SMA-46 Ollama-down→503, source-editable KB
```

---

## 5. PROMPT SIAP-TEMPEL per task (ringkas — perluas saat dijalankan)

### OBS-1a — Hardening PII scrub Sentry (Haiku)
> Branch `fix/OBS-1a-scrub-hardening` dari main.
- Perluas `apps/api/src/common/sentry.utils.ts` `scrubPii` + frontend `scrubPiiNext`: selain `event.request`, **redact** `event.exception.values[].value` (ganti pola NIS/nama/email/phone → `[REDACTED]`), set `maxBreadcrumbs: 0` di `Sentry.init` (atau scrub breadcrumb), dan strip query-string dari `event.request.url`.
- Test: exception value dengan NIS dummy → ter-redaksi; breadcrumbs kosong.
- Bukti: tsc 0 · eslint 0 · jest hijau. DoD: done-report + PR, tunggu review. **Gerbang: selesai sebelum SENTRY_DSN produksi di-set bila ada data nyata.**

### SMA-49 — Chat history (Sonnet)
> Branch `feat/SMA-49-chat-history` dari main.
- Schema `ai_knowledge` (atau schema baru): `ChatSession { id, userId, title?, createdAt }`, `ChatMessage { id, sessionId, role('user'|'assistant'), content, createdAt }`. Migration additive.
- `POST /ai/chat`: jika `sessionId` ada → simpan pesan user + jawaban; jika tidak → buat session baru, kembalikan sessionId. `GET /ai/chat/:sessionId/history` (gate §3.6: user pemilik + SA).
- Ownership: user hanya akses session miliknya; SA semua. R-05: dummy.
- Bukti: tsc/eslint/jest ≥70% + test ownership history. Tunggu review schema.

### SMA-48 — ClaudeAdapter + R-03 strip-PII (Sonnet) ⚠️ GERBANG REGULASI
> Branch `feat/SMA-48-claude-adapter` dari main. **Konfirmasi Director: ANTHROPIC_API_KEY + aktifkan/flag.**
- `ClaudeAdapter implements AIGateway` (`@anthropic-ai/sdk` — konfirmasi dep) di `apps/api/src/ai/adapters/`. Provider via `AI_PROVIDER=claude`.
- **R-03 strip-PII middleware WAJIB** sebelum SETIAP request ke Claude: util `stripPii(text)` → `[SISWA]`, `[NIS]`, `[DATA_AKADEMIK]`, dst (gate §6). Reuse/sejajarkan dengan `sentry.utils` scrub. Unit test dengan nama+NIS dummy → terstrip.
- Decision tree (gate §6): PII terdeteksi → paksa Ollama (JANGAN ke Claude); non-PII + reasoning → Claude Haiku. Default aman = Ollama.
- Env: `ANTHROPIC_API_KEY` opsional (tanpa key → ClaudeAdapter disabled, Ollama-only). Env-gated, CI hijau tanpa key.
- Bukti: tsc/eslint/jest; test stripPii + decision tree + fallback. **Review keamanan WAJIB (egress PII) sebelum merge.** R-03 di trek regulasi → tandai closed.

### SMA-47 — Dashboard KS (Sonnet) — tergantung D4-1
> Jika Metabase embed (rekomendasi): buat dashboard Metabase (siswa aktif, SPP/bulan, %kehadiran, leads PPDB per status) → embed signed-URL di `/dashboard` (role KS/SA). Kartu KPI ringkas dikoding (server fetch agregat). Jika koding penuh: endpoint `/dashboard/summary` (agregat, RBAC KS/SA) + chart Recharts. Bukti: next build + tsc + test agregat.

### SMA-50 — E2E test suite (Sonnet)
> Alur kritikal end-to-end (auth → student → grade → attendance → SPP → chat). Supertest/Playwright (konfirmasi dep). Target: jalur P0 hijau. Bukti: laporan test.

### SMA-51 — Security audit RBAC (Sonnet)
> Audit matriks RBAC (CLAUDE.md §6 + gate §4) vs implementasi nyata tiap controller. Cek ownership filter benar (bukan cek role saja), soft-delete filter, endpoint publik ter-harden. Output: laporan temuan + fix bila ada.

### SMA-52 — Perf & index review (Haiku)
> Review query N+1, index yang hilang (mis. FK lookups, filter ownership), `EXPLAIN` pada query panas. Tambah index additive bila perlu (migration). Bukti: sebelum/sesudah.

### SMA-53 — API docs (Haiku)
> Swagger (`@nestjs/swagger` — konfirmasi dep) atau tabel endpoint di `docs/`. Semua endpoint + roles + DTO. Bukti: build + halaman /docs (jika Swagger).

---

## 6. Catatan forward-compat & regulasi
- **R-03 = blocker egress:** tidak ada data siswa nyata ke Claude API tanpa strip-PII tervalidasi (SMA-48). Sebelum itu Ollama-only.
- **R-05 tetap aktif:** semua test/seed dummy sampai consent terkumpul.
- KBM Tahap 2: Schedule (JP+ruang) & Attendance (sessionId?) sudah forward-compat — jangan dibangun sekarang.

*Dikelola Cowork analyst. Tunggu D4-1/D4-2/D4-3 dari Director; OBS-1a & SMA-49 bisa mulai tanpa menunggu.*
