# Sprint 3 — Design & Sequencing Brief (Finance + AI MVP + Notification)

> Disusun: Cowork analyst, 2026-06-01. Turunan dari `docs/tahap1-sprint-plan.md` §2.3, §5, §6.
> Tujuan: kunci keputusan terbuka + urutan build, sebelum brief Claude Code dikeluarkan.
> Status masuk Sprint 3: Sprint 1 ✅ · Sprint 2 ✅ (semua merged, runtime-verified, VPS health 200).

---

## 1. Yang SUDAH dikunci oleh design gate (jangan dilitigasi ulang)

| Area | Keputusan terkunci | Lokasi gate |
|---|---|---|
| Finance schema | `SppPayment` (finance schema): `studentId, month, year, amount, status, paidAt, receiptNo, recordedBy`. `@@unique([studentId,month,year])`. Enum `PaymentStatus { unpaid paid late waived }`. **Sudah ada di schema.prisma** (SMA-31). | §2.3 |
| Notification schema | `NotificationLog` (notification schema): `recipient, channel, subject, body, status, sentAt, error, refType, refId`. **Sudah ada di schema.prisma**. | §2.3 |
| AI abstraksi | `AIGateway { chat(); embed() }` + `NotificationAdapter { send() }` — interface di `packages/types`. Anti lock-in. | §6 |
| Provider Sprint 3 | **Ollama-only** (chat + embed lokal). ClaudeAdapter = Sprint 4 (SMA-48). | §6, §7 |
| Embedding | `nomic-embed-text` → `vector(768)`. RagChunk sudah ada (SMA-31). | §2.1 |
| Notif durability | Tulis `notification_logs status=pending` SEBELUM emit event; update `sent`/`failed` sesudah; startup hook retry `pending` > 5 menit. (Bukan broker — BullMQ ditunda Tahap 2.) | §5 |
| Event bus | NestJS EventEmitter2 in-process. NotificationService TIDAK kirim langsung — selalu via NotificationAdapter (mockable). | §5 |

**Konsekuensi penting (de-risk):** karena Sprint 3 Ollama-only, **tidak ada PII keluar server** → **R-03 strip-PII bukan prasyarat Sprint 3**. R-03 menjadi gerbang keras untuk **SMA-48 (Sprint 4)** saat ClaudeAdapter masuk.

---

## 2. Event Map Sprint 3 (subset yang relevan)

```
StudentService   student.enrolled        → FinanceService (buat SppPayment bulan ini)
                                          → NotificationService (WA selamat datang ke OT)
GradeService     grade.submitted         → NotificationService (ringkasan nilai, batched akhir semester)
AttendanceSvc    attendance.recorded     → NotificationService (alpha/sakit → WA hari itu ke OT)
FinanceService   payment.received        → NotificationService (kwitansi digital ke siswa/OT)
```
Guardrail: setiap event pemicu notifikasi → tulis `notification_logs` (pending) dulu, baru emit.

---

## 3. Keputusan yang MASIH milik Director (butuh jawaban sebelum/saat eksekusi)

> Saya beri rekomendasi + trade-off; keputusan komersial/operasional = Director.

**D-1 · Kredensial Fonnte (WhatsApp) — kapan tersedia?**
NotificationAdapter dibangun dengan **3 implementasi**: `FonnteAdapter`, `SmtpAdapter`, `LogAdapter`. Untuk dev/test/CI dipakai `LogAdapter` (tidak kirim nyata). **Rekomendasi:** bangun adapter + wiring sekarang pakai `LogAdapter`; colok `FONNTE_API_KEY` di VPS saat Director siap. Tidak memblokir koding. → *Butuh dari Director nanti: API key Fonnte + nomor admin (sudah ada placeholder env `FONNTE_API_KEY`/`ADMIN_PHONE_NUMBER` dari SMA-12).*

**D-2 · Model Ollama untuk chat — `qwen2.5:7b` vs `llama3.1:8b`?**
Gate menyebut keduanya sebagai opsi. Trade-off: `qwen2.5:7b` umumnya lebih kuat untuk Bahasa Indonesia + instruksi; `llama3.1:8b` lebih umum/teruji. **Rekomendasi:** `qwen2.5:7b` untuk chatbot FAQ Indonesia, tapi jadikan **env `OLLAMA_CHAT_MODEL`** (jangan hardcode) → swappable tanpa redeploy kode. *Butuh dari Director: konfirmasi model sudah `ollama pull` di VPS (RAM cukup? 7–8B ≈ 5–6GB).*

**D-3 · SPP: sumber angka nominal & approve flow.**
Gate: `POST /finance/spp` (TU input), `POST /finance/spp/:id/approve` (SA/KS konfirmasi). **Pertanyaan:** apakah nominal SPP seragam per jenjang/jurusan (perlu tabel tarif) atau diinput manual per transaksi di Sprint 3? **Rekomendasi Sprint 3 (MVP):** input manual `amount` per transaksi (paling sederhana, tidak hardcode tarif sekolah → SaaS-safe). Tabel tarif master = enhancement Tahap 2. *Butuh konfirmasi Director.*

---

## 4. Urutan Build (dua track paralel)

Dependency SMA-31 ✅ terpenuhi untuk semua. Dua track bisa jalan di sesi Claude Code terpisah.

```
TRACK A — Finance & Notification & Events
  SMA-42 NotificationAdapter (Fonnte+SMTP+Log)   [Sonnet]  deps: —          ← MULAI (keystone)
  SMA-41 Finance SPP CRUD + approve              [Haiku]   deps: SMA-31 ✅   ← paralel dgn 42
  SMA-43 Event wiring (student/grade/payment→notif) [Sonnet] deps: 42, 41

TRACK B — RAG & AI Chatbot (Ollama-only)
  SMA-44 RAG migration RagChunk + seeder FAQ     [Sonnet]  deps: SMA-31 ✅
  SMA-45 AIGateway interface + OllamaAdapter     [Sonnet]  deps: 44
  SMA-46 Chatbot endpoint /ai/chat (Ollama RAG)  [Sonnet]  deps: 45
```

**Rekomendasi mulai:** **SMA-42 NotificationAdapter** lebih dulu (keystone: pola durability pending-log + abstraksi adapter adalah keputusan desain yang men-setup SMA-41/43). **SMA-41 Finance** boleh jalan paralel (Haiku, pola CRUD seperti Grade). Track B (RAG/AI) menyusul setelah Track A keystone stabil, atau paralel bila kapasitas review cukup.

**Model rationale:** adapter/interface/event/RAG = desain → Sonnet. Finance SPP = pola CRUD+RBAC identik Grade/Attendance → Haiku cukup.

---

## 5. Catatan arsitektur (temuan analis)

- **N-9 (LOW, forward-compat):** `NotificationLog.recipient` = string bebas (nomor/email). Saat batching notif nilai akhir-semester (grade.submitted), butuh idempotensi agar tidak dobel-kirim saat retry startup hook. **Rekomendasi:** andalkan `refType+refId+status` untuk dedup di NotificationService sebelum kirim (jangan kirim jika sudah `sent` untuk ref yang sama). Masukkan ke DoD SMA-43.
- **N-10 (LOW):** `payment.received → FinanceService (update saldo BOS)` di gate §5 menyangkut BOS yang belum ada modelnya di Tahap 1. **Rekomendasi:** Sprint 3 batasi konsumer `payment.received` ke NotificationService saja; cabang BOS ditandai TODO Tahap 2 (jangan bangun model BOS sekarang).
- **R-05 tetap aktif:** semua seed/test Finance & chatbot pakai data dummy. Jangan input SPP/siswa nyata sebelum consent.

---

## 6. Definition of Done Sprint 3 (= DoD gate §7 + tambahan)

- TU bisa catat & approve pembayaran SPP (RBAC: TU input, SA/KS approve). Siswa/OT lihat tagihan sendiri.
- Chatbot `/ai/chat` menjawab FAQ sekolah via Ollama+RAG (semua authenticated).
- NotificationAdapter abstrak + durability pending-log + startup retry; CI pakai LogAdapter.
- Event wiring 4 alur (§2) + idempotensi notif (N-9).
- Tiap task: tsc 0 · eslint 0 · jest ≥70% · bukti runtime · done-report · queue.md · PR · gerbang review (schema/security/desain).

---

*Dikelola Cowork analyst. Tunggu keputusan D-1/D-2/D-3 dari Director; SMA-42 & SMA-41 bisa mulai tanpa menunggu (pakai LogAdapter + amount manual).*
