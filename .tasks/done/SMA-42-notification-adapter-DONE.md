# Done Report — SMA-42 NotificationAdapter

**Task:** SMA-42 — NotificationAdapter: abstraksi anti lock-in + durability  
**Sprint:** 3 (Finance + AI + Notification)  
**Branch:** `feat/SMA-42-notification-adapter`  
**Tanggal selesai:** 2026-06-01  
**Model:** Claude Sonnet 4.6

---

## Deliverable

### A. Interface `NotificationAdapter` di `@smk/types`

- `packages/types/src/index.ts` — ditambahkan interface:
  ```typescript
  NotificationAdapter { send(channel, to, body, subject?): Promise<void> }
  ```
- Package di-rebuild (`npm run build`) agar `dist/` sinkron.

### B. Tiga Adapter (`apps/api/src/notification/adapters/`)

| Adapter | File | Keterangan |
|---|---|---|
| `LogAdapter` | `log.adapter.ts` | Default dev/CI — log ke Winston, tidak kirim nyata |
| `FonnteAdapter` | `fonnte.adapter.ts` | POST ke `api.fonnte.com/send` via `fetch` bawaan Node 20, timeout 10 dtk |
| `SmtpAdapter` | `smtp.adapter.ts` | **Stub** — throw `NotImplementedError` (Nodemailer belum dikonfirmasi direktur, Sprint 4) |

### C. `NotificationService` — Durability Pattern

File: `apps/api/src/notification/notification.service.ts`

- `notify({ channel, to, body, subject?, refType?, refId? })`:
  1. **Idempotensi (N-9):** cek `notification_logs` status=`sent` untuk `refType+refId+recipient+channel` yang sama → SKIP
  2. **Tulis `pending` DULU** (sebelum kirim — crash-safe)
  3. `adapter.send()` → sukses: update `sent`+`sentAt`; gagal: update `failed`+`error` — **tidak throw ke caller** (fail-soft)
- **`onModuleInit` startup retry:** scan `pending` berumur >5 menit (batch 50) → coba kirim ulang

### D. `NotificationModule` dengan factory

File: `apps/api/src/notification/notification.module.ts`

- `useFactory: buildAdapter()` — baca `process.env.NOTIF_PROVIDER`:
  - `fonnte` → `FonnteAdapter` (butuh `FONNTE_API_KEY`)
  - `smtp` → `SmtpAdapter` (stub)
  - `log` / unset → `LogAdapter` (default)
- Token: `'NOTIFICATION_ADAPTER'`
- Di-import di `AppModule`

### E. Env Validation + Dokumentasi

- `apps/api/src/config/env.validation.ts` — tambah opsional: `NOTIF_PROVIDER`, `FONNTE_API_KEY`, `ADMIN_PHONE_NUMBER`, `SMTP_HOST/PORT/USER/PASSWORD`
- `docs/deployment/env-variables.md` — section 11a baru

---

## Bukti Runtime

### tsc --noEmit

```
(0 errors — PowerShell: no output = sukses)
```

### eslint --max-warnings=0

```
(0 warnings — PowerShell: no output = sukses)
```

### jest --coverage (modul notification)

```
Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total

src/notification/notification.service.ts   | 96.77% stmts | 88.88% branch | 80% funcs | 96.55% lines
src/notification/notification.module.ts    | 72.72% stmts
src/notification/adapters/log.adapter.ts   | 100% all
src/notification                           | 86.79% stmts (modul aggregate) ✅ (≥70% target)
```

### Full suite (19 spec files)

```
Test Suites: 19 passed, 19 total
Tests:       286 passed, 286 total
```

0 regresi dari modul lain.

---

## Skenario test yang diverifikasi

| # | Skenario | Status |
|---|---|---|
| 1 | `notify()` tulis `pending` SEBELUM `adapter.send` (urutan via mock) | ✅ |
| 2 | send sukses → status `sent`, `sentAt` diisi | ✅ |
| 3 | send gagal → status `failed`, error dicatat, TIDAK throw ke caller | ✅ |
| 4 | Idempotensi N-9: ref sudah `sent` → `adapter.send` tidak dipanggil | ✅ |
| 5 | Tanpa `refType` → tidak cek idempotensi, langsung kirim | ✅ |
| 6 | Startup retry: `pending` >5 menit → dikirim ulang | ✅ |
| 7 | Startup retry: tidak ada stale → adapter tidak dipanggil | ✅ |
| 8 | Startup retry dengan `refType/refId` → tetap dikirim | ✅ |
| 9 | Factory: `NOTIF_PROVIDER` unset → `LogAdapter` | ✅ |
| 10 | Factory: `NOTIF_PROVIDER=log` → `LogAdapter` | ✅ |
| 11 | Factory: `NOTIF_PROVIDER=fonnte` tanpa `FONNTE_API_KEY` → throw compile | ✅ |
| 12 | `LogAdapter.send()` tidak throw (WA) | ✅ |
| 13 | `LogAdapter.send()` tidak throw (email) | ✅ |
| 14 | `FonnteAdapter.send()` channel email → throw | ✅ |

LogAdapter cukup untuk semua test (tidak perlu Fonnte nyata).

---

## Keputusan Terbuka (untuk analis)

| ID | Keputusan | Status |
|---|---|---|
| D-SMTP | Nodemailer sebagai dep baru untuk `SmtpAdapter` | **Menunggu konfirmasi direktur** — SmtpAdapter adalah stub saat ini |
| D-1 | `FONNTE_API_KEY` untuk WA nyata | Menunggu direktur — colok ke `.env` VPS saat siap |

---

## Files Changed

```
packages/types/src/index.ts                          (+ NotificationAdapter interface)
packages/types/dist/                                 (rebuild)
apps/api/src/notification/adapters/log.adapter.ts    (baru)
apps/api/src/notification/adapters/fonnte.adapter.ts (baru)
apps/api/src/notification/adapters/smtp.adapter.ts   (baru — stub)
apps/api/src/notification/notification.service.ts    (baru)
apps/api/src/notification/notification.module.ts     (baru)
apps/api/src/config/env.validation.ts                (+ optional notif vars)
apps/api/src/app.module.ts                           (+ import NotificationModule)
apps/api/src/__tests__/notification.spec.ts          (baru — 14 tests)
docs/deployment/env-variables.md                     (+ section 11a)
docs/tahap1-sprint3-design.md                        (sudah ada, tidak diubah)
```

---

## Next Step

- Tunggu **review Cowork** (desain adapter + durability) sebelum merge
- SMA-43 (Event wiring) depends on SMA-42 → bisa mulai setelah PR ini di-approve
- SMA-41 (Finance SPP) bisa jalan paralel sekarang
