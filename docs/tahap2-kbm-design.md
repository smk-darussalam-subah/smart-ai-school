# Desain Modul DIIS-KBM (Knowledge & Learning Management)

> **Status:** Design spec — modul direncanakan **Tahap 2** (core monitoring) + **Tahap 4** (otomasi).
> **Dibuat:** 2026-05-31 oleh System Analyst. **JANGAN diimplementasi di Sprint 1.**
> **Prinsip kunci:** KBM **memperluas** fondasi Tahap 1, **tidak menduplikasi**. Setiap kebutuhan
> dipetakan ke entitas/komponen yang sudah ada (lihat §6 Anti-Duplikasi).
> Referensi: `docs/tahap1-sprint-plan.md` (schema & event Tahap 1).

---

## 1. Ringkasan

DIIS-KBM = platform operasional pembelajaran **berbasis sesi (session-based)**. Setiap kegiatan
mengajar diperlakukan sebagai **satu sesi unik** (guru × kelas × mapel × jam × ruang × tanggal ×
status), bukan sekadar absensi harian. Tujuannya: tidak ada kelas tak terpantau, kesiapan guru
diketahui sebelum KBM mulai, kelas tetap jalan saat guru berhalangan, dan semua terdokumentasi
untuk analisis. Singkatnya: **"menara kontrol pembelajaran sekolah."**

## 2. Keputusan Penerapan (kapan dibangun)

| Bagian KBM | Tahap | Alasan |
|---|---|---|
| Timetable + Room + generate sesi harian | Tahap 2 | Butuh academic core (Teacher/Class/TeachingAssignment) stabil dulu |
| Konfirmasi kesiapan guru + state machine sesi | Tahap 2 | Inti workflow; bergantung sesi & notifikasi |
| Dashboard monitoring real-time | Tahap 2 | Sejalan dashboard KS Tahap 2 |
| Log aktivitas / histori sesi | Tahap 2 | Audit dasar |
| Penanganan kelas pengganti (manual-assisted) | Tahap 2 | Workflow petugas piket |
| AI bantu susun perangkat pembelajaran (otomatis) | **Tahap 4** | Otomasi; pakai AIGateway + RagChunk |
| Rekomendasi pengganti cerdas / prediksi kelas berisiko kosong | **Tahap 4** | Predictive analytics |

**Tidak ada yang masuk Sprint 1.** Sprint 1 tetap fokus Student/Academic/PPDB.

## 3. Entitas Baru (semua ADDITIVE — migrasi non-destruktif)

Semua di schema `academic` kecuali disebut lain. Pola sama dengan Tahap 1 (UUID PK, timestamps).

| Entitas | Inti | Relasi |
|---|---|---|
| `Room` | Ruang belajar: name, type, capacity | — |
| `TimetableEntry` | Slot mingguan berulang: dayOfWeek, jpStart, jpEnd | → TeachingAssignment, → Room |
| `ClassSession` | Instance harian konkret 1 sesi + status | → TeachingAssignment (atau teacher/class/subject), → Room, substituteTeacherId? → Teacher, date, jp, topic?, confirmedAt?, startedAt?, endedAt? |
| `Substitution` | Penanganan guru berhalangan | → ClassSession, originalTeacherId, substituteTeacherId?, reason, assignedBy (userId), plan |
| `SessionEventLog` | Rekam jejak operasional tiap sesi | → ClassSession, eventType, actorUserId, payload(Json), createdAt |

Enum `SessionStatus`: `scheduled · awaiting_confirmation · confirmed · active · problem · covered · completed · cancelled`.

> **`TimetableEntry` mengisi kekosongan Tahap 1:** `TeachingAssignment` hanya punya `hoursPerWeek`
> (statis), belum jadwal konkret. TimetableEntry menambahkan hari + JP + ruang → menjadi sumber
> generate sesi. Inilah satu-satunya penyempurnaan jadwal yang perlu diantisipasi sejak Tahap 1.

## 4. State Machine Status Sesi

```
                 generate harian (cron)
scheduled ───────────────────────────────▶ awaiting_confirmation
                                                   │  guru respon
                          ┌────────────────────────┴───────────────────────┐
                       HADIR                                          BERHALANGAN
                          ▼                                                ▼
                      confirmed                                        problem
                          │ guru mulai mengajar                            │ petugas piket tangani
                          ▼                                                ▼
                       active ◀───────────────── covered ◀──── substitute_assigned
                          │ sesi selesai                                   │ (atau tak ada pengganti)
                          ▼                                                ▼
                      completed                                       cancelled
```

## 5. Alur Event (memperluas EventEmitter2 Tahap 1)

```
session.created              (cron harian)        → SessionEventLog
session.confirmation.requested                    → NotificationService (WA ke guru)
session.confirmed            (guru: hadir)         → Dashboard update + log
session.teacher_absent       (guru: berhalangan)   → NotificationService (WA guru piket)
                                                    + buat Substitution (status problem)
session.substitute_assigned                        → NotificationService (WA guru pengganti)
session.started / session.completed                → Dashboard + log
(opsional Tahap 4) session.confirmed              → AIService (susun perangkat ajar dari topic)
```

## 6. Anti-Duplikasi — Pemetaan ke Komponen yang Sudah Ada ⭐

Ini menjawab kekhawatiran utama: KBM **tidak** membuat sistem tandingan.

| Kebutuhan KBM | Pakai ulang (JANGAN buat baru) | Tambahan KBM |
|---|---|---|
| Identitas guru | `teacher.Teacher` (Tahap 1) | — |
| Kelas | `academic.Class` (Tahap 1) | — |
| "Guru mengajar apa di kelas mana" | `academic.TeachingAssignment` (Tahap 1) | TimetableEntry (hari+JP+ruang) |
| Kehadiran SISWA per sesi | `academic.Attendance` (Tahap 1) | tambah kolom **`sessionId?`** (nullable, additive) |
| Notifikasi WA (guru/piket/ortu) | `NotificationAdapter` + `NotificationLog` (SMA-42/N-1) | event-event baru saja |
| Dukungan AI perangkat ajar | `AIGateway` + `RagChunk` (SMA-45/N-2) | prompt/template khusus |
| Dashboard pimpinan | Dashboard KS (SMA-47) | panel KBM real-time |
| RBAC | `RolesGuard` + 7 role (Tahap 1) | resource baru: sessions, substitutions |

**Kesimpulan duplikasi:** nol entitas duplikat. KBM = `ClassSession/Timetable/Room/Substitution/
SessionLog` (baru) + komposisi blok Tahap 1. Inilah kenapa mendesain sekarang penting — agar saat
dibangun, ia menempel rapi, bukan menumpuk sistem paralel.

## 7. Permukaan API (sketsa, Tahap 2)

```
GET  /kbm/sessions?date=&status=&classId=&teacherId=   [SA,KS,Wakil,TU,Piket]
POST /kbm/sessions/generate        (cron/internal)      [SA / scheduler]
PATCH/kbm/sessions/:id/confirm     {hadir|berhalangan, topic?}  [Guru pemilik sesi]
PATCH/kbm/sessions/:id/start | /complete                [Guru pemilik sesi]
POST /kbm/sessions/:id/substitution {substituteTeacherId, plan} [SA,Piket]
GET  /kbm/dashboard                 (agregat real-time)  [SA,KS,Wakil,TU,Piket]
GET  /kbm/sessions/:id/logs                              [SA,KS,Wakil]
```

## 8. Dashboard Monitoring (Tahap 2)

Panel real-time untuk KS / wakil / TU / guru piket: guru sudah konfirmasi, belum merespon,
berhalangan; kelas sedang berlangsung; kelas perlu penanganan; statistik aktivitas. Sumber data =
agregasi `ClassSession` per hari (real-time via polling/refresh; SSE/websocket opsional Tahap 4).

## 9. Yang Perlu Dilakukan SEKARANG di Tahap 1 (forward-compatibility)

Murah sekarang, mahal kalau diretrofit. **Tidak mengubah SMA-31 yang sudah jadi.**

1. **Attendance siswa:** tetap `studentId+classId+date` untuk MVP. Saat KBM dibangun, tambah kolom
   **`sessionId UUID?` (nullable)** + FK ke `ClassSession` — migrasi additive, aman. Catat rencana ini.
2. **Jadwal (SMA-39 `GET /schedules`):** rancang agar konsep **JP (jam pelajaran) + ruang** sudah
   terakomodasi minimal di model/representasi, supaya nanti jadi sumber `TimetableEntry` tanpa rombak.
   Jangan bangun jadwal yang hanya tahu `hoursPerWeek`.
3. **Reserve nama:** jangan pakai nama tabel `sessions`, `rooms`, `timetable_entries`,
   `substitutions`, `session_event_logs` untuk hal lain.

## 10. Risiko bila ditunda tanpa desain (mitigasi oleh dokumen ini)

| Risiko | Mitigasi |
|---|---|
| Attendance terkunci ke class+date → sulit jadi per-sesi | Rencana `sessionId?` additive (§9.1) |
| Jadwal Tahap 1 terlalu tipis untuk generate sesi | Antisipasi JP+ruang sejak SMA-39 (§9.2) |
| Tim membangun sistem absensi guru terpisah → duplikasi | Spec §6 memaksa reuse TeachingAssignment/Attendance |

---

*Dokumen desain — bukan untuk dikoding sekarang. Dibangun saat Tahap 2 dibuka, setelah academic core Tahap 1 stabil & diverifikasi.*
