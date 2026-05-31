# SMA-31 — Foundation Schema (N-1, N-2, T-12) — DONE

**Status:** ✅ Schema + migration file selesai  
**Branch:** `feat/SMA-31-foundation-schema`  
**Tanggal:** 2026-05-31  
**Model:** Claude Sonnet 4.6  

---

## Ringkasan Perubahan

### N-2: Konsolidasi RAG Model
- **Dihapus:** `KnowledgeDocument` (ai_knowledge.documents) + `AiDocument` (ai_knowledge.ai_documents)
- **Ditambah:** `RagChunk` (ai_knowledge.rag_chunks)
- Embedding: `vector(768)` — model `nomic-embed-text` via Ollama
- ⚠️ TIDAK ada `vector(1536)` di schema (dikonfirmasi via grep)

### T-12: Academic Models Baru (boundary: academic = operasional)
- **TeachingAssignment** — jadwal mengajar (teacher × class × subject × academicYear)
- **Grade** + enum `GradeType` (uts/uh/uas/praktik/sikap)
- **Attendance** + enum `AttendanceStatus` (hadir/izin/sakit/alpha)
- Boundary ditegakkan: `teacher` schema = identitas SDM, `academic` schema = operasional

### N-1: Finance & Notification Schema (tidak lagi kosong)
- **SppPayment** + enum `PaymentStatus` (unpaid/paid/late/waived) di schema `finance`
- **NotificationLog** + enum `NotifChannel` (whatsapp/email/push) + `NotifStatus` (pending/sent/failed) di schema `notification`
- Deklarasi schema di datasource TIDAK dihapus (sesuai keputusan — berbahaya untuk migration)

### Relasi Prisma Cross-Schema
- `TeachingAssignment.teacher` → `teacher.Teacher` (cross-schema)
- `TeachingAssignment.class` → `academic.Class` (same-schema)
- `Grade.student` → `student.Student` (cross-schema)
- `Grade.assignment` → `academic.TeachingAssignment` (same-schema)
- `Attendance.student` → `student.Student` (cross-schema)
- `Attendance.class` → `academic.Class` (same-schema)
- `SppPayment.student` → `student.Student` (cross-schema)
- Backrelations ditambah ke `Teacher`, `Class`, `Student`

### Audit Fields — Konsistensi (setelah review Kang Sholah)
- `Grade.submittedBy`, `Attendance.recordedBy`, `SppPayment.recordedBy` → semua menyimpan **userId** (auth.users)
- Komentar eksplisit: "userId pelaku (auth.users, audit — no FK; jika perlu teacher, trace via user→teacher)"
- Konsisten di tiga tabel, query "siapa yang input ini" tidak ambigu

### Seed Update
- `prisma.knowledgeDocument` → `prisma.ragChunk` (seed tidak akan error setelah migration)

---

## File yang Diubah

```
packages/database/prisma/schema.prisma          — schema utama
packages/database/prisma/seed.ts                — update knowledgeDocument → ragChunk
packages/database/prisma/migrations/
  20260531000001_sprint1_foundation/
    migration.sql                               — migration SQL (manual, siap di-apply)
```

---

## Bukti Runtime

```
npx prisma validate
  → The schema at prisma\schema.prisma is valid 🚀

npx prisma generate
  → ✔ Generated Prisma Client (v5.22.0) to node_modules/@prisma/client in 97ms

npx tsc --noEmit (packages/database)
  → (no output = 0 errors)

grep -c "vector(768)" prisma/schema.prisma
  → 2   (≥ 1 ✓)

grep -n "vector(1536)" prisma/schema.prisma
  → (kosong ✓ — tidak ada vector(1536))
```

### ⚠️ migrate dev — PENDING (butuh SSH tunnel ke VPS)

`npx prisma migrate dev` gagal dengan `P1001: Can't reach database server at localhost:5432`.

**Untuk menyelesaikan verifikasi DB**, Kang Sholah perlu:

```powershell
# Terminal 1 — buka SSH tunnel
! ssh -L 5432:localhost:5432 root@204.168.242.123 -N

# Terminal 2 — dalam project
cd packages/database
npx prisma migrate dev --name sprint1_foundation
# Atau jika migration file sudah ada, lebih aman:
npx prisma migrate deploy
```

Migration SQL file sudah tersedia di `migrations/20260531000001_sprint1_foundation/migration.sql` — tinggal di-apply.

### Cek Data Sebelum Merge (WAJIB)

Sebelum merge (karena migration DROP tabel lama):
```sql
docker exec smk-postgres psql -U diis_admin -d diis_db -c \
  "SELECT (SELECT count(*) FROM ai_knowledge.documents) AS docs,
          (SELECT count(*) FROM ai_knowledge.ai_documents) AS ai_docs;"
```
Pastikan keduanya 0 (atau hanya seed data) sebelum approve merge.

---

## Catatan untuk Sprint Berikutnya

| Issue | Handle di |
|---|---|
| `grades` tidak punya unique constraint untuk uts/uas — guard di app layer | SMA-37 |
| `Grade.academicYear` denormalisasi dari `TeachingAssignment.academicYear` — pastikan konsisten saat input | SMA-37 |
| FK ke auth.users untuk audit fields (submittedBy/recordedBy) — opsional, bila perlu integritas DB level | SMA-37/38/41 |

---

## Model + Enum yang Dibuat

| Model/Enum | Schema | Tipe |
|---|---|---|
| `TeachingAssignment` | academic | model |
| `Grade` | academic | model |
| `GradeType` | academic | enum: uts/uh/uas/praktik/sikap |
| `Attendance` | academic | model |
| `AttendanceStatus` | academic | enum: hadir/izin/sakit/alpha |
| `SppPayment` | finance | model |
| `PaymentStatus` | finance | enum: unpaid/paid/late/waived |
| `NotificationLog` | notification | model |
| `NotifChannel` | notification | enum: whatsapp/email/push |
| `NotifStatus` | notification | enum: pending/sent/failed |
| `RagChunk` | ai_knowledge | model (mengganti 2 model lama) |

## Model yang Dihapus

| Model | Schema | Alasan |
|---|---|---|
| `KnowledgeDocument` | ai_knowledge | diganti RagChunk (N-2) |
| `AiDocument` | ai_knowledge | diganti RagChunk (N-2), had vector(1536) |
