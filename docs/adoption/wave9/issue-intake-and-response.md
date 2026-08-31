# Intake dan Respons Kendala

## Data Minimum Laporan

- Waktu dan zona waktu.
- Persona sintetis, halaman, dan tindakan terakhir.
- Expected dan actual.
- Status HTTP atau pesan UI tanpa token/cookie.
- Screenshot PII-safe bila diperlukan.
- Apakah retry aman sudah dicoba.

## Severity

| Severity | Contoh | Tindakan |
| --- | --- | --- |
| P0 | kebocoran data, bypass authority, korupsi data | hentikan pilot, containment, eskalasi segera |
| P1 | workflow inti salah atau dapat menulis state tidak sah | tahan gate, perbaiki akar masalah, re-review |
| P2 | UX, recovery, atau evidence tidak memenuhi kontrak | tindak lanjut dalam wave yang sama |
| P3 | hardening non-blocking | masukkan backlog dengan owner dan target |

## Respons

1. Reproduksi dengan fixture sintetis pada SHA yang sama.
2. Pisahkan defect source, environment, fixture, dan evidence.
3. Terapkan perbaikan melalui Gitflow; jangan patch container atau SQL langsung.
4. Ulangi hanya affected matrix, kecuali temuan mengubah authority atau shared contract.
5. Catat cleanup dan residual risk secara jujur.
