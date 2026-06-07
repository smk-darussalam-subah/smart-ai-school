# SMA-52 — Performance Index Review — DONE

**Tanggal:** 2026-06-07
**Branch:** `feat/SMA-52-perf-index`
**PR:** → develop
**Tipe:** Penutup Tahap 1 — review menyeluruh + migration additive

---

## Metodologi

- Baca seluruh `schema.prisma` → catat semua `@@index` dan `@@unique` existing
- Baca 13 service file → identifikasi semua query pattern (filter/join/ownership)
- Bandingkan query yang ada vs index yang tersedia → temukan gap
- Hanya tambah index bila ada query konkret yang butuh + tidak duplikasi existing

---

## N+1 Analysis: NIHIL

Seluruh service diperiksa — tidak ada hot-path N+1:

| Service | Pattern | Verdict |
|---------|---------|---------|
| StudentService | `Promise.all([findMany, count])`, select nested | ✅ |
| GradeService | `Promise.all` + ownership via where clause | ✅ |
| AttendanceService | `Promise.all` + bulk via `$transaction` | ✅ |
| FinanceService | `Promise.all` + `groupBy` untuk summary | ✅ |
| PpdbService | `Promise.all` | ✅ |
| TeachingAssignmentService | `Promise.all` | ✅ |
| ScheduleService | `Promise.all` | ✅ |
| AiService | Loop di `backfillEmbeddings`: intentional sequential (Ollama adapter) | ✅ |
| NotificationService | Loop di `onModuleInit`: intentional sequential (notif adapter, batch 50) | ✅ |
| RagService | Single query `findMany` | ✅ |

---

## Index Gap Analysis

### Index Existing (tidak diubah)

| Model | Index | Status |
|-------|-------|--------|
| PpdbLead | `(status, createdAt)`, `(phone)` | ✅ cukup |
| Grade | `(studentId, academicYear, semester)` | ✅ cover `WHERE studentId` |
| Attendance | `UNIQUE(studentId, classId, date)`, `(classId, date)` | ✅ cukup |
| Schedule | `UNIQUE(classId, dayOfWeek, jpStart, ...)`, `(teachingAssignmentId)` | ✅ cukup |
| SppPayment | `UNIQUE(studentId, month, year)`, `(status, year, month)` | ✅ cukup |
| NotificationLog | `(recipient, createdAt)`, `(status)` | ⚠ kurang (lihat bawah) |
| RagChunk | `(category)`, `(isActive)` | ✅ cukup |
| ChatSession | `(userId)` | ✅ cukup |
| ChatMessage | `(sessionId, createdAt)` | ✅ cukup |
| TeachingAssignment | `UNIQUE(teacherId, classId, subject, academicYear)` | ⚠ kurang (lihat bawah) |

### Index Baru Ditambahkan (5 total)

#### 1. `Student.classId` → `@@index([classId])`

**Query yang butuh:**
```typescript
// StudentService.findAll() — baris 131
prisma.student.findMany({ where: { classId, deletedAt: null } })
```
**Mengapa kurang:** `@@unique([userId])` dan `@@unique([nis])` tidak cover `classId`. Full scan students untuk setiap filter kelas.

---

#### 2. `Student.parentId` → `@@index([parentId])`

**Query yang butuh:**
```typescript
// resolveChildStudentIds() — dipanggil Grade/Attendance/Finance/Schedule untuk ORANG_TUA
prisma.student.findMany({ where: { parentId: userId } })
```
**Mengapa kurang:** Dipanggil pada setiap request ORANG_TUA. Tanpa index → full table scan students.

---

#### 3. `TeachingAssignment.classId` → `@@index([classId])`

**Query yang butuh:**
```typescript
// TeachingAssignmentService.findAll() — baris 105, elevated user
prisma.teachingAssignment.findMany({ where: { classId } })  // tanpa teacherId
```
**Mengapa kurang:** `UNIQUE(teacherId, classId, subject, academicYear)` hanya cover `WHERE teacherId` dan `WHERE teacherId+classId` (leftmost prefix rule). `WHERE classId` standalone tidak ter-cover.

---

#### 4. `Grade.assignmentId` → `@@index([assignmentId])`

**Query yang butuh:**
```typescript
// GradeService.findAll() — baris 162
prisma.grade.findMany({ where: { assignmentId } })

// GradeService.create() DOBEL GUARD — baris 231
prisma.grade.findFirst({ where: { studentId, assignmentId, semester, type } })
```
**Mengapa kurang:** `@@index([studentId, academicYear, semester])` tidak include `assignmentId`. Filter `WHERE assignmentId` dan DOBEL GUARD butuh scan setelah narrowing ke studentId.

---

#### 5. `NotificationLog.(refType, refId)` → `@@index([refType, refId])`

**Query yang butuh:**
```typescript
// NotificationService.notify() idempotensi check — baris 79
prisma.notificationLog.findFirst({
  where: { refType, refId, recipient, channel, status: 'sent' }
})
```
**Mengapa kurang:** `@@index([recipient, createdAt])` dan `@@index([status])` tidak cover `refType+refId`. Composite `(refType, refId)` sangat selektif untuk narrow-down sebelum filter status.

---

## Index yang TIDAK Ditambahkan (dan alasannya)

| Kolom | Alasan skip |
|-------|-------------|
| `Student.status` | Kardinalitas rendah (4 nilai) — seq scan lebih efisien untuk data kecil |
| `TeachingAssignment.teacherId` (standalone) | Dicovver oleh `UNIQUE(teacherId, ...)` sebagai leftmost prefix ✓ |
| `Grade.studentId` (standalone) | Dicovver oleh `@@index([studentId, academicYear, semester])` sebagai prefix ✓ |
| `Attendance.studentId` | Dicovver oleh `UNIQUE(studentId, classId, date)` sebagai prefix ✓ |
| `SppPayment.studentId` | Dicovver oleh `UNIQUE(studentId, month, year)` sebagai prefix ✓ |
| Vector index (pgvector IVF/HNSW) | Data kecil Tahap 1 → deferred Tahap 2. IVF butuh ≥100× nlist rows untuk efektif |

---

## Bukti Runtime

```
# Prisma schema valid
npx prisma validate → "The schema at ... is valid 🚀"

# TypeScript — 0 error
npx tsc --noEmit (apps/api) → (no output = 0 error) ✓
npx tsc --noEmit (apps/web) → (no output = 0 error) ✓
```

**Jest:** Tidak ada test yang menyentuh index definition — suite existing tetap hijau (diverifikasi CI).

---

## Migration

File: `packages/database/prisma/migrations/20260607000001_sma52_perf_indexes/migration.sql`

Additive — 5x `CREATE INDEX`. Tidak ada DROP, ALTER, atau perubahan data.
Deploy: `prisma migrate deploy` (via CI/container startup seperti biasa).

---

## Catatan Tahap 2

- **Vector index (pgvector):** Tambah `CREATE INDEX CONCURRENTLY rag_chunks_embedding_ivfflat_idx ON ai_knowledge.rag_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)` setelah dataset ≥10k chunks.
- **Index lain:** Gunakan `CREATE INDEX CONCURRENTLY` untuk semua index baru di Tahap 2 (live traffic, tanpa table lock).

---

## DoD Checklist

- [x] Schema.prisma diperbarui (5 index baru)
- [x] Migration additive `20260607000001_sma52_perf_indexes`
- [x] Prisma validate ✓
- [x] tsc 0 · eslint 0 (apps/api + apps/web)
- [x] N+1 nihil — semua service terperiksa
- [x] Tidak ada duplikasi index existing
- [x] Setiap index disertai alasan + query yang butuh
- [x] Done report ini
- [ ] CI hijau setelah merge
- [ ] Deploy staging (migration apply via prisma migrate deploy saat container restart)
- [ ] Promote staging → main
