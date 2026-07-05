# Wave 2 Zero-Simulasi Resolution Program — DONE

**Status:** ✅ CLOSED — diverifikasi lokal, siap merge ke staging  
**Tanggal:** 2026-07-05  
**Branch:** `feat/wave2-zero-simulasi-resolution`  
**Plan:** `.tasks/PLAN-Wave2-Zero-Simulasi.md`  

---

## Ringkasan

Wave 2 menutup seluruh hardcoded data array yang tersisa di dashboard GURU setelah Wave 1 (P0-P6) membersihkan 18 permukaan SIM. Semua komponen sekarang membaca data nyata dari backend atau menampilkan honest empty-state bila data belum ada.

---

## Item yang Diselesaikan

| ID | Komponen / Domain | Perubahan |
|---|---|---|
| W2-01..W2-03 | `KehadiranGuru.tsx` + `attendance` backend | `GET /attendance/sessions` agregasi per sesi; rekap kehadiran, siswa perlu perhatian, dan tren 10 hari dari data nyata |
| W2-04..W2-05 | `PenugasanGuru.tsx` + `assessment` backend | `GET /submissions` dan `GET /submissions/:id/details`; daftar tugas & detail pengumpulan nyata |
| W2-06..W2-08 | `PembelajaranGuru.tsx`, `CapaianRapor.tsx` + `analytics` backend | `GET /analytics/cp-progress`; progress mapel dan ketuntasan CP dari data nyata |
| W2-12..W2-14 | `AkademikWorkspace.tsx` + `teaching-assignment` backend | `GET /teachers/me/wali-classes`; tab "Rapor Kelas" hanya muncul untuk wali kelas |
| W2-15 | SSE auth | Token Keycloak dilewatkan via query param `?token=` untuk `EventSource`; `KeycloakGuard` memvalidasi token di endpoint SSE |
| W2-16 | `KsWorkspace.tsx` | Empty-state terpusat untuk tabel rekap/monitoring kosong |

---

## File yang Diubah

### Backend
- `apps/api/src/attendance/attendance.controller.ts`
- `apps/api/src/attendance/attendance.service.ts`
- `apps/api/src/attendance/dto/attendance-sessions.dto.ts` *(baru)*
- `apps/api/src/assessment/assessment.module.ts`
- `apps/api/src/assessment/assessment.service.ts`
- `apps/api/src/assessment/submission.controller.ts` *(baru)*
- `apps/api/src/assessment/dto/submission.dto.ts` *(baru)*
- `apps/api/src/analytics/analytics.controller.ts`
- `apps/api/src/analytics/analytics.service.ts`
- `apps/api/src/auth/guards/keycloak.guard.ts`
- `apps/api/src/teaching-assignment/teaching-assignment.module.ts`
- `apps/api/src/teaching-assignment/teaching-assignment.service.ts`
- `apps/api/src/teaching-assignment/wali-kelas.controller.ts` *(baru)*

### Frontend
- `apps/web/src/app/dashboard/akademik/_components/AkademikWorkspace.tsx`
- `apps/web/src/app/dashboard/akademik/_components/CapaianRapor.tsx`
- `apps/web/src/app/dashboard/akademik/_components/KehadiranGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PembelajaranGuru.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PenilaianSesiModal.tsx`
- `apps/web/src/app/dashboard/akademik/_components/PenugasanGuru.tsx`
- `apps/web/src/app/dashboard/akademik/actions.ts`

### Dokumentasi
- `.tasks/PLAN-Wave2-Zero-Simulasi.md` *(baru)*
- `.tasks/done/Wave2-Zero-Simulasi-DONE.md` *(file ini)*

---

## Bukti Runtime / Validasi

```
# API
cd apps/api
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors
npm run build             # nest build OK
npm run test              # 53 passed, 53 total / 854 tests pass

# Web
cd apps/web
npx tsc --noEmit          # 0 errors
npm run lint              # No ESLint warnings or errors
npm run build             # 29/29 static pages OK
npm run test              # 3 passed, 3 total / 39 tests pass
```

---

## Catatan Penting

- Semua hardcoded array `SESI_REKAP`, `ATT_ATTENTION`, `TREND_POINTS`, `TUGAS_DATA`, `PENGUMPULAN`, `MAPEL_PROG`, `CP_DATA`, `CP_RAPOR` telah dihapus dari kode.
- Produksi akan menampilkan empty-state yang jujur sampai data kehadiran, tugas, dan nilai dimasukkan melalui alur bisnis yang sudah live.
- SSE live monitor untuk sesi asesmen kini autentikasi via query-token, mengatasi keterbatasan `EventSource` yang tidak bisa mengirim header `Authorization`.

---

*Tunggu review Cowork / KS sebelum merge ke staging.*
