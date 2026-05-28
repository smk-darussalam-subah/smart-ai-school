# Capacity & Scope Gate — DIIS Akhir Tahap 1

> **Tujuan:** Memastikan tim, infrastruktur, dan scope proyek DIIS berada dalam kondisi yang sehat dan berkelanjutan sebelum masuk ke Tahap 2 (Core Build). Gate ini mencegah overcommitment dan technical debt yang tidak terkendali.
>
> **Sumber:** Laporan System Analyst DIIS, Bab 6.2, 7.2, 8.5 (O-01, O-03, T-07, T-09) | Tanggal: 2026-05-26
> **Deadline:** Akhir Tahap 1 (target: Juli 2026)

---

## Kriteria Kelulusan

### ✅ / ❌ Kriteria 1 — DR (Disaster Recovery) Plan Terdokumentasi (T-07)
**Pernyataan:** Terdapat dokumen Disaster Recovery Plan yang menjelaskan prosedur pemulihan sistem jika VPS utama (204.168.242.123) mengalami kegagalan total. Plan mencakup estimasi RTO (Recovery Time Objective) dan RPO (Recovery Point Objective).

**Bukti yang harus dilampirkan:**
- [ ] File `docs/runbooks/disaster-recovery.md` sudah ada, berisi step-by-step recovery
- [ ] RTO dan RPO telah ditetapkan (contoh: RTO ≤ 4 jam, RPO ≤ 24 jam)
- [ ] DR drill telah dilakukan minimal 1x: simulasi restore dari backup ke VPS baru
- [ ] Hasil drill (berhasil/gagal, waktu yang dibutuhkan) didokumentasikan

**Status saat ini:** ❌ OPEN — masuk roadmap Tahap 1
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 2 — Abstraction Layer untuk Vendor External (T-09)
**Pernyataan:** Dependency terhadap vendor eksternal (AI provider, notification service) di-abstract melalui interface — sehingga penggantian vendor tidak membutuhkan refactor besar.

**Bukti yang harus dilampirkan:**
- [ ] Interface `AIGateway` atau `AIProvider` tersedia di `packages/types/` — implementasi konkret bisa Ollama atau Claude API
- [ ] Interface `NotificationAdapter` tersedia — implementasi bisa Fonnte (WhatsApp), email, atau placeholder
- [ ] Tidak ada `fetch('https://api.anthropic.com/...')` atau `fetch('https://api.fonnte.com/...')` langsung di business logic (harus via adapter)

**Status saat ini:** ❌ OPEN — akan diimplementasi di Tahap 1 sebelum fitur AI dibangun
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 3 — Tidak Ada Single-Author Bottleneck Kritis (O-01)
**Pernyataan:** Proyek tidak lagi sepenuhnya bergantung pada satu orang (Director) untuk semua keputusan teknis dan review. Minimal ada mekanisme "AI Deputy" mode atau reviewer kedua untuk PR critical.

**Bukti yang harus dilampirkan:**
- [ ] Pull Request policy terdefinisi: PR ke `main` butuh minimal 1 review (bisa dari Cowork AI atau reviewer manusia)
- [ ] Dokumen `docs/governance/pr-review-policy.md` ada dan aktif digunakan
- [ ] Minimal 3 PR terakhir di branch `main` memiliki review sebelum merge (cek git log)
- [ ] ATAU: Terdapat automated check (CI) yang memblock merge tanpa review

**Status saat ini:** ❌ OPEN — masuk roadmap Tahap 1
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

### ✅ / ❌ Kriteria 4 — Scope 20 Modul Dijadwalkan Realistis (O-03)
**Pernyataan:** 20 modul DIIS telah diprioritaskan dengan timeline realistis berdasarkan kapasitas tim aktual (1 Director + AI tools). Scope telah dikonfirmasi tidak mengalami creep dari rencana awal, dan ada mekanisme Change Request untuk penambahan scope baru.

**Bukti yang harus dilampirkan:**
- [ ] Roadmap 5 tahun di Notion diupdate dengan breakdown modul per tahap yang realistis
- [ ] Terdapat template Change Request di Notion untuk proposal penambahan scope
- [ ] Tahap 1 scope maksimal 3-5 modul inti (bukan 20 sekaligus) — dikonfirmasi dan disetujui Director
- [ ] Tidak ada modul baru yang ditambahkan ke Tahap 0-1 scope tanpa CR formal

**Status saat ini:** ❌ OPEN — perlu review roadmap di Notion
**Diverifikasi oleh:** —
**Tanggal verifikasi:** —

---

## Sign-Off

Gate ini dinyatakan **LULUS** apabila semua 4 kriteria di atas berstatus ✅ dan bukti terlampir.

| | |
|---|---|
| **Director** | Kang Sholah (Ahmad Sholahuddin) |
| **Tanggal Sign-Off** | _(diisi saat lulus)_ |
| **Catatan** | _(diisi saat lulus)_ |
| **Berlaku untuk** | Izin mulai Tahap 2 — Core Build (bersama Compliance Gate) |

---

*File ini dikelola oleh Cowork AI. Update status setiap kali temuan di-close.*
*Terakhir diupdate: 2026-05-26*
