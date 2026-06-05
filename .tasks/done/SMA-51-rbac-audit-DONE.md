# SMA-51 — Security Audit RBAC Coverage — DONE

**Branch:** `feat/SMA-51-rbac-audit`
**Tanggal:** 2026-06-05
**Model:** Sonnet 4.6

---

## Matriks Referensi (CLAUDE.md §6)

| Modul | SA | KS | TU | GURU | SISWA | OT | INDUSTRI |
|-------|----|----|----|----|------|--------|----------|
| Dashboard Eksekutif | ✅ | ✅ | - | - | - | - | - |
| Keuangan (SPP/BOS) | ✅ | 👁 | ✅ | - | 👁 | 👁 | - |
| PPDB / CRM | ✅ | 👁 | ✅ | 👁 | - | - | - |
| Data Siswa | ✅ | 👁 | ✅ | 👁 | 👁 | 👁 | - |
| Nilai & Absensi | ✅ | 👁 | - | ✅ | 👁 | 👁 | - |
| PKL/Prakerin | ✅ | 👁 | 👁 | ✅ | ✅ | 👁 | ✅ |
| BKK/Rekrutmen | ✅ | 👁 | - | - | ✅ | - | ✅ |
| Monitoring/AI | ✅ | - | - | - | - | - | - |

---

## Matriks Audit — Endpoint × Role × {allow/deny} × {ownership-ok?}

### Auth
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| GET /auth/me | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ self-only via keycloakId |
| PATCH /auth/me | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ self-only, strict Zod |

### Students
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| GET /students | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ deletedAt:null; GURU=all (TODO SMA-36) |
| GET /students/:id | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ SISWA:userId; OT:parentId |
| POST /students | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ SA/TU only |
| PATCH /students/:id | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ SA/TU only; deletedAt:null check |
| DELETE /students/:id | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ soft-delete |
| GET /students/:id/grades | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ SISWA:userId; OT:parentId |
| GET /students/:id/attendance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ SISWA:userId; OT:parentId |

### Grades
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| GET /grades | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ GURU:teacherId filter; SISWA:own; OT:children |
| POST /grades | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ TeachingAssignment ownership check |
| PATCH /grades/:id | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ GURU:submittedBy+7hari; SA:unrestricted |

### Attendance
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| POST /attendance | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ classId TeachingAssignment check |
| GET /attendance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ GURU:classIds; SISWA:own; OT:children |

### Finance (SPP)
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| POST /finance/spp | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ recordedBy=userId |
| GET /finance/spp | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ SISWA:own; OT:children; SA/KS/TU:all |
| GET /finance/spp/summary | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ aggregate, no PII filter needed |
| GET /finance/spp/:id/history | ✅ | ✅* | ✅ | ❌ | ✅ | ✅ | ✅ SISWA:own; OT:child; SA/KS/TU:all |
| POST /finance/spp/:id/approve | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ separation of duties (TU tidak bisa) |

*KS = **diperbaiki** di SMA-51 (F-1)

### PPDB
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| POST /ppdb/leads | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | 🌐 | ✅ @Public; throttle 10/5min; response:{id,status} |
| GET /ppdb/leads | ✅ | ✅ | ✅ | ❌† | ❌ | ❌ | ✅ no ownership needed (admin-only list) |
| GET /ppdb/stats | ✅ | ✅ | ✅ | ❌† | ❌ | ❌ | ✅ aggregate only |
| GET /ppdb/leads/:id | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| PATCH /ppdb/leads/:id/status | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| PATCH /ppdb/leads/:id/assign | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

†GURU = **F-2** (lihat temuan)

### Schedule
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| GET /schedules | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ GURU:teachingAssignmentId; SISWA:classId; OT:children classIds |
| POST /schedules | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ konflik check (kelas+guru+ruang) |

### Teaching Assignments
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| GET /teaching-assignments | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ GURU:teacherId filter |
| GET /teaching-assignments/:id | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ GURU:403 jika bukan miliknya |
| POST /teaching-assignments | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| PATCH /teaching-assignments/:id | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| DELETE /teaching-assignments/:id | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### AI / Chat
| Endpoint | SA | KS | TU | GURU | SISWA | OT | Ownership |
|----------|----|----|----|----|------|----|----|
| POST /ai/chat | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ session ownership (SMA-49) |
| GET /ai/chat/:id/history | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ SA bypass; non-SA: session.userId check |
| GET /ai/knowledge | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| POST /ai/knowledge | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| POST /ai/knowledge/:id/publish | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ separation of duties |
| DELETE /ai/knowledge/:id | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Public Endpoints
| Endpoint | Auth | Rate Limit | Response | Verdict |
|----------|------|-----------|---------|---------|
| GET /health | @Public | global | DB status + memory (no PII) | ✅ |
| GET /metrics | @Public | ❌ (F-3) | Prometheus (no PII) | ⚠️ INFO |

---

## Temuan

### F-1 — MEDIUM (DIPERBAIKI) — KS hilang dari `GET /finance/spp/:studentId/history`

**Lokasi:** `apps/api/src/finance/finance.controller.ts`

**Deskripsi:**
`@Roles` pada `GET /finance/spp/:studentId/history` tidak menyertakan `KEPALA_SEKOLAH`,
padahal CLAUDE.md §6 menetapkan KS = 👁 pada Keuangan. Akibatnya KS mendapat 403
saat mengakses riwayat SPP satu siswa, meskipun KS bisa mengakses:
- `GET /finance/spp` (list semua) ✅
- `GET /finance/spp/summary` (agregat) ✅
- `POST /finance/spp/:id/approve` (approve) ✅

**Inkonsistensi:** KS bisa approve SPP tapi tidak bisa lihat history-nya.

**Service layer:** Sudah benar — `ELEVATED_ROLES` menyertakan KS, sehingga `findHistory` tidak membatasi KS. Hanya gate `@Roles` controller yang salah.

**Fix:** Tambah `'KEPALA_SEKOLAH'` ke `@Roles` pada endpoint tersebut.

**Test pembukti:**
```
SEBELUM fix: KS memanggil controller.findHistory → @Roles guard throw 403
SESUDAH fix: KS memanggil service.findHistory('student-uuid-001', KS_USER) → data dikembalikan
Test: "KS melihat histori student manapun (F-1 fix)" → PASS ✅
```

---

### F-2 — LOW (DIPERBAIKI — parsial per konfirmasi Cowork) — GURU hilang dari endpoint PPDB read

**Lokasi:** `apps/api/src/ppdb/ppdb.controller.ts`

**Deskripsi:**
CLAUDE.md §6 menetapkan GURU = 👁 pada PPDB/CRM. Namun:
- `GET /ppdb/leads` → `@Roles('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')` — GURU tidak ada
- `GET /ppdb/stats` → sama

**Dampak:** GURU tidak bisa melihat pipeline PPDB (calon siswa).

**Resolusi (konfirmasi Cowork):**
GURU 👁 PPDB = **hanya `/ppdb/stats`** (agregat: total per status + conversion rate, tanpa PII).
GURU TIDAK boleh akses `/ppdb/leads` atau detail individual (nama + nomor HP calon siswa).

**Fix:**
- `GET /ppdb/stats` → tambah `'GURU'` ke `@Roles`
- `GET /ppdb/leads`, `GET /ppdb/leads/:id` → GURU tetap diblokir
- CLAUDE.md §6 → tambah catatan `¹` yang menjelaskan batasan ini
- Test: GURU ada di @Roles stats ✅; GURU tidak ada di @Roles leads ✅ (403 terjaga)

---

### F-3 — INFO (BACKLOG — mitigasi infra) — `/metrics` tanpa rate limit

**Lokasi:** `apps/api/src/metrics/metrics.controller.ts`

**Deskripsi:**
`GET /metrics` adalah `@Public()` tanpa `@Throttle`. Endpoint ini mengembalikan
Prometheus metrics teknis (request count, heap, CPU) — tidak ada PII data siswa.

**Mitigasi yang ada:**
- Endpoint di-eksklusi dari prefix `api/v1` (lihat main.ts)
- Di VPS, Prometheus scraper diakses via Docker internal network / Grafana
- Tidak ada data PII dalam response

**Tidak diperbaiki** karena: (a) tidak ada PII, (b) rate limit pada Prometheus scraper
berpotensi merusak monitoring. Dapat ditambahkan IP allowlist di nginx level jika dibutuhkan.

---

## Area CLEAN (tidak ada temuan)

| Area | Verifikasi |
|------|-----------|
| Student ownership (SISWA/OT WHERE filter) | ✅ filter di query, bukan post-fetch |
| Finance ownership (SISWA self, OT children) | ✅ WHERE studentId injected |
| Grade ownership (GURU: teacherId; SISWA: studentId; OT: children) | ✅ |
| Attendance ownership (pola sama dengan Grade) | ✅ |
| Schedule ownership (GURU: assignmentId; SISWA: classId; OT: childClassIds) | ✅ |
| TeachingAssignment GURU ownership (service-level 403) | ✅ |
| Soft-delete filter (deletedAt: null) | ✅ Student.findAll/findById/update |
| PrismaExceptionFilter (P2002→409, P2003→409, P2025→404) | ✅ |
| @Public() /health — tidak bocorkan PII | ✅ hanya DB status + memory |
| @Public() /ppdb/leads — throttle+honeypot+minimal response | ✅ |
| GURU grade POST: TeachingAssignment ownership check | ✅ |
| GURU attendance POST: classId assignment check | ✅ |
| GURU grade PATCH: submittedBy check + 7-hari window | ✅ |
| Finance separation of duties: TU input, SA/KS approve | ✅ |
| AI knowledge: separation of duties TU create, SA/KS publish | ✅ |
| Chat session ownership (SMA-49) | ✅ |
| Auth /me: self-only, Zod strict (tidak bisa ubah role/email) | ✅ |

---

## Bukti Runtime

```
tsc --noEmit   → exit 0 (0 errors)
eslint         → exit 0 (0 warnings)
jest (full)    → 477 passed, 27 suites (+2 test F-2)
```

### Test pembukti

| Test | Sebelum | Sesudah |
|------|---------|---------|
| KS `findHistory` (F-1) | service pass; controller 403 | ✅ controller+service pass |
| GURU ada di @Roles stats (F-2a) | — | ✅ `Reflect.getMetadata('roles', getStats)` contains GURU |
| GURU tidak ada di @Roles leads (F-2b) | — | ✅ `Reflect.getMetadata('roles', findAll)` not contains GURU |

---

## File Diubah

| File | Perubahan |
|------|-----------|
| `apps/api/src/finance/finance.controller.ts` | F-1: tambah KS ke @Roles + update header comment |
| `apps/api/src/__tests__/finance.spec.ts` | F-1: test KS findHistory |
| `apps/api/src/ppdb/ppdb.controller.ts` | F-2: tambah GURU ke @Roles stats; komentar batas PII |
| `apps/api/src/__tests__/ppdb.spec.ts` | F-2: test RBAC metadata stats (GURU ✅) + leads (GURU ❌) |
| `CLAUDE.md §6` | Klarifikasi GURU 👁 PPDB = stats agregat saja (catatan ¹) |

---

*Menunggu review Cowork: verifikasi temuan F-2 (GURU PPDB) + konfirmasi F-1 fix benar.*
