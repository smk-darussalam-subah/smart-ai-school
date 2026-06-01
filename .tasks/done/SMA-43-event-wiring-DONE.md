# SMA-43 — Event Wiring: Producer→NotificationService via EventEmitter2

**Status:** ✅ DONE  
**Branch:** `feat/SMA-43-event-wiring`  
**Commit:** `a39ec99`  
**PR:** (lihat bawah)  
**Model:** Claude Sonnet 4.6  
**Tanggal:** 2026-06-01

---

## Scope yang Dikerjakan

5 event ter-wire producer → NotificationListener → NotificationService:

| Event | Producer | Konsumer | Payload | Idempotensi |
|---|---|---|---|---|
| `student.enrolled` | `StudentService.create()` | `handleStudentEnrolled` | studentId, nis, fullName, parentId | refType=student, refId=studentId |
| `student.statusChanged` | `StudentService.update()` | `handleStudentStatusChanged` | + oldStatus/newStatus | refId=`studentId:status:newStatus` per penerima |
| `grade.submitted` | `GradeService.create()` | `handleGradeSubmitted` | gradeId, subject, score, type, semester | refType=grade, refId=gradeId |
| `attendance.recorded` | `AttendanceService.bulkCreate()` (hanya alpha/sakit) | `handleAttendanceRecorded` | attendanceId, date, status | refType=attendance, refId=attendanceId |
| `payment.received` | `FinanceService.createRecord()` (hanya paid/late) | `handlePaymentReceived` | paymentId, month, year, amount | refType=payment, refId=paymentId/`:ortu` |

---

## File yang Dibuat / Dimodifikasi

### Baru
- `apps/api/src/events/events.types.ts` — event name constants + payload interfaces
- `apps/api/src/notification/notification.listener.ts` — @OnEvent() consumers
- `apps/api/src/__tests__/event-wiring.spec.ts` — 23 test cases SMA-43

### Dimodifikasi
- `apps/api/src/app.module.ts` — tambah `EventEmitterModule.forRoot({ ignoreErrors: true })`
- `apps/api/src/notification/notification.module.ts` — tambah `NotificationListener` provider
- `apps/api/src/student/student.service.ts` — inject EventEmitter2, emit enrolled+statusChanged
- `apps/api/src/grade/grade.service.ts` — inject EventEmitter2, emit grade.submitted
- `apps/api/src/attendance/attendance.service.ts` — inject EventEmitter2, emit hanya alpha/sakit
- `apps/api/src/finance/finance.service.ts` — inject EventEmitter2, emit hanya paid/late
- `apps/api/src/__tests__/student.spec.ts` — tambah EventEmitter2 mock
- `apps/api/src/__tests__/grade.spec.ts` — tambah EventEmitter2 mock
- `apps/api/src/__tests__/attendance.spec.ts` — tambah EventEmitter2 mock
- `apps/api/src/__tests__/finance.spec.ts` — tambah EventEmitter2 mock
- `apps/api/package.json` — tambah `@nestjs/event-emitter@^3.1.0` (dikonfirmasi Kang Sholah)

---

## Guardrail Compliance

| Guardrail | Status |
|---|---|
| Producer TIDAK kirim WA langsung | ✅ — semua emit via EventEmitter2, konsumer via notify() |
| Idempotensi N-9: refType+refId di setiap notify() | ✅ — diverifikasi di test idempotensi |
| attendance.recorded hanya alpha/sakit | ✅ — filter di loop after $transaction |
| N-10: payment.received tidak menyentuh BOS | ✅ — test "TIDAK menyentuh BOS" verified |
| Kegagalan notif tidak gagalkan transaksi bisnis | ✅ — emit fire-and-forget, listener try/catch + fail-soft |

---

## Bukti Runtime

**tsc 0 errors:**
```
npx tsc --noEmit
(no output = 0 errors)
```

**eslint 0 warnings:**
```
npx eslint "src/**/*.ts" --max-warnings=0
(no output = clean)
```

**jest 346/346 hijau, coverage 85.58%:**
```
Test Suites: 21 passed, 21 total
Tests:       346 passed, 346 total (was 323, +23 SMA-43 tests)

Key file coverage:
  student.service.ts:           100% statements
  grade.service.ts:             94.62% statements
  attendance.service.ts:        96.8% statements
  finance.service.ts:           98.73% statements
  notification.listener.ts:     91.07% statements
  events.types.ts:              100% statements
  All files:                    85.58% statements (>70% ✅)
```

---

## Test Wajib yang Lulus

- [x] student.enrolled ter-emit saat StudentService.create()
- [x] student.statusChanged ter-emit saat status berubah
- [x] student.statusChanged TIDAK emit saat status sama
- [x] grade.submitted ter-emit saat GradeService.create()
- [x] attendance.recorded ter-emit untuk alpha ✓
- [x] attendance.recorded ter-emit untuk sakit ✓
- [x] attendance.recorded TIDAK emit untuk hadir ✓
- [x] attendance.recorded TIDAK emit untuk izin ✓
- [x] payment.received ter-emit untuk paid ✓
- [x] payment.received ter-emit untuk late ✓
- [x] payment.received TIDAK emit untuk unpaid ✓
- [x] payment.received TIDAK emit untuk waived ✓
- [x] handleStudentEnrolled: notify() dengan refType=student+refId=studentId
- [x] handleStudentStatusChanged: notify() untuk siswa+OT dengan refId berbeda
- [x] handleGradeSubmitted: notify() dengan refType=grade+refId=gradeId
- [x] handleAttendanceRecorded: notify() dengan refType=attendance+refId=attendanceId
- [x] handlePaymentReceived: notify() dengan refType=payment+refId=paymentId+:ortu
- [x] handlePaymentReceived: TIDAK menyentuh BOS
- [x] Idempotensi: semua notify() call sertakan refType+refId (guard N-9 SMA-42)

---

## Catatan untuk Cowork Review

1. **@nestjs/event-emitter@^3.1.0** ditambahkan ke `apps/api/package.json` — sudah dikonfirmasi Kang Sholah sebelum install.
2. **`ignoreErrors: true`** dipilih untuk EventEmitterModule karena opsi `async: true` tidak ada di tipe v3.x. `ignoreErrors: true` membuat kegagalan listener tidak crash proses (equivalent fail-soft behavior).
3. **student.statusChanged** — emit hanya jika `dto.status !== existing.status` (efficient: tidak polusi event bus untuk update non-status).
4. **payment.received** — emit hanya jika `payment.status === 'paid' || 'late'` karena hanya kondisi ini yang berarti uang sudah diterima sekolah.
5. **NotificationListener.handlePaymentReceived** — notify ke siswa DAN OT dengan `refId` berbeda (`paymentId` vs `paymentId:ortu`) agar idempotensi per-penerima.

---

*Laporan: Claude Sonnet 4.6 | SMA-43 | 2026-06-01*
