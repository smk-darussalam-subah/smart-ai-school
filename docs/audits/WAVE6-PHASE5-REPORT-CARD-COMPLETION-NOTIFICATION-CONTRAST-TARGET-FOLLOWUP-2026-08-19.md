# Wave 6 Report Card Completion - Notification Contrast and Parent Target Follow-up

Tanggal: 2026-08-19
Branch: `fix/wave6-notification-contrast-target-20260819`
Status: SOURCE REMEDIATION COMPLETE - STAGING QA PENDING DEPLOYMENT

## Scope

Menutup dua P2 dari final staging sign-off review:

1. Kontras tab aktif SISWA dan ORANG_TUA belum memenuhi WCAG AA.
2. Notifikasi Rapor ORANG_TUA belum terikat ke anak pemilik rapor dan masih dapat memakai anak aktif di UI.

Tidak ada perubahan Prisma schema, migration, dependency, Keycloak, queue, scheduler, atau production.

## Perbaikan

- Active tab dan filter tab pada modal notifikasi SISWA memakai warna terukur AA, bukan teks putih di aksen terang.
- Active tab pada modal notifikasi ORANG_TUA memakai warna terukur AA.
- Status step Rapor yang selesai memakai foreground/background terukur AA.
- API `/push/my-notifications` tetap membaca `NotificationLog.refId` secara internal, tetapi tidak mengembalikan `refId` mentah ke browser.
- API mengembalikan `targetHref` yang di-resolve server-side dari `NotificationLog.refId` ke `ReportCard.studentId` dengan ownership `SISWA.userId` atau `ORANG_TUA.parentId`.
- Web Push payload juga memakai target server-side yang sama saat log adalah `report-card`.
- Modal notifikasi ORANG_TUA memakai `targetHref` dari server sebagai sumber utama. `activeStudentId` hanya fallback untuk notifikasi non-rapor.
- Link Dashboard/Beranda dari shell Rapor ORANG_TUA mempertahankan `studentId` terpilih.
- Helper frontend menolak target unsafe: URL eksternal, protocol-relative, backslash path, non-dashboard path, dan path malformed.

## Contrast Matrix

| Elemen | Foreground | Background | Rasio |
| --- | --- | --- | --- |
| SISWA active tab/filter | `#022c22` | `#d1fae5` | 13.36:1 |
| ORANG_TUA active tab | `#172554` | `#dbeafe` | 12.04:1 |
| Rapor completed step | `#022c22` | `#d1fae5` | 13.36:1 |
| CTA Rapor existing | `#020617` | `#34d399` | 10.49:1 |
| Dark nav inactive existing | `#8896a8` | `#0a0f1a` | 6.36:1 |
| Dark parent nav inactive existing | `#7a8ba0` | `#0a0f1a` | 5.50:1 |
| Light nav inactive existing | `#64748b` | `#ffffff` | 4.76:1 |

## Verification

- API focused:
  - `npm.cmd --workspace @smk/api test -- --runInBand apps/api/src/__tests__/p16-ai-push.spec.ts`
  - Result: 15/15 pass.
- API focused with report distribution:
  - `npm.cmd --workspace @smk/api test -- --runInBand apps/api/src/__tests__/report-cards-activities.spec.ts apps/api/src/__tests__/p16-ai-push.spec.ts`
  - Result: 89/89 pass.
- Web focused:
  - `npm.cmd --workspace @smk/web test -- --runInBand apps/web/src/__tests__/learner-notification-navigation.test.ts apps/web/src/__tests__/academic-operational-ui.test.ts`
  - Result: 27/27 pass.
- Type-check:
  - API: pass.
  - Web: pass.
- Lint:
  - API: pass.
  - Web: pass, with existing Next lint deprecation/plugin notice only.
- Diff:
  - `git diff --check`: pass.
  - `git diff --cached --check`: pass.

## QA Still Required After Staging Deployment

- Reopen notification modal as SISWA and ORANG_TUA in staging and confirm active tab contrast in both themes.
- Use ORANG_TUA fixture with two children and distributed report notifications for both children.
- While child B is active, open notification for child A and verify it opens `/dashboard/rapor?studentId=<child-a>`.
- Verify Dashboard/Beranda links from the parent Rapor shell preserve the same `studentId`.
- Confirm no raw report-card UUID appears in notification history response body or browser-rendered UI.

## Git Safety

No files are staged at the time of this report. Historical `.tmp` folders and unrelated untracked audit files remain untracked and must not be included by broad staging.
