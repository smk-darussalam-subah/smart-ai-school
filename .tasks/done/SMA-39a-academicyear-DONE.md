# SMA-39a — Schedule academicYear cross-check — DONE REPORT

**Tanggal:** 2026-06-01
**Branch:** `fix/SMA-39a-academicyear`
**Temuan:** F-1 (MEDIUM) dari review analis post-SMA-39

---

## Masalah (F-1)

`POST /schedules` menerima `academicYear` mentah dari body tanpa cross-check
terhadap `TeachingAssignment.academicYear`. Akibat: jadwal bisa dibuat dengan
assignment TA 2024/2025 tapi diberi `academicYear: "2025/2026"` → timetable
inkonsisten.

---

## Fix (terlokalisir di `schedule.service.ts`)

**Dua perubahan kecil di `create()`:**

1. Tambah `academicYear: true` ke `select` saat query `TeachingAssignment`
2. Validasi `dto.academicYear !== assignment.academicYear` → `BadRequestException` 400
   — diletakkan **setelah** cek classId mismatch, **sebelum** cek konflik guru/ruang (fail fast)

Tidak ada perubahan DTO, controller, schema, atau migration.

---

## Bukti Runtime

### tsc --noEmit
```
✅ 0 error
```

### eslint --max-warnings=0
```
✅ 0
```

### jest (dari apps/api)
```
Test Suites: 18 passed, 18 total
Tests:       272 passed, 272 total (+1 dari SMA-39)

Test baru:
  ✓ academicYear mismatch vs TeachingAssignment → BadRequestException (F-1)
    — memverifikasi schedule.findFirst tidak dipanggil (gagal cepat)
    — memverifikasi schedule.create tidak dipanggil
```

---

## File yang Diubah

```
apps/api/src/schedule/schedule.service.ts   -- +academicYear ke select; +validasi mismatch
apps/api/src/__tests__/schedule.spec.ts     -- +1 test mismatch; fix mock 'room null' (tambah academicYear)
```

---

**F-1 CLOSED.**

*Done report: SMA-39a, 2026-06-01*
