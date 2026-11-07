# Metabase removal — 27 October 2026

The Director confirms that Metabase reports and school data were disposable
mockups; DIIS uses native analytics. The dedicated production-host runtime was
removed under that explicit authorization. Application source changes remain
local and require review before Git packaging/release.

## Completed runtime work

- Removed only `smk-metabase`, its dedicated `docker_metabase_data` volume and
  image `sha256:06b9be23095d849d0f02cc7e62938acc6e3b5b3e96f2b8981b434cd385ddd711`.
- Matched 76 tables, 13 views and 54 sequence targets against migration/view
  definitions bundled in the exact Metabase v0.49.10 image. Unknown objects and
  foreign keys from protected tables: zero. Dropped exact names using RESTRICT.
- Preserved `smk_db`, schema `public`, all 56 Prisma migrations, shared extensions,
  65 protected application table fingerprints and the protected relation catalog.
- Preserved 20 other containers without restart/recreation. Production/staging
  login and API health all returned HTTP200; APIs reported ok.
- Removed only three obsolete embed keys from production/staging env files;
  file permissions remain0600. Running web container snapshots are unchanged.
- Available memory at verification: about1.71GiB. Measurements vary with workload.
- Full-system backup/recovery points are retained. This is runtime/data removal,
  not cryptographic erasure of historical full-database backups.

## Local source cleanup

Compose service/volume/startup dependency, web embed env mappings, env template,
obsolete init schema and CSP allowance are removed. System Health no longer has
the Metabase shortcut. The old analytics hostname returns HTTP410 in the candidate
Nginx config. Setup/architecture documentation and the old runbook reflect native
analytics. Historical audit evidence is retained.

Validation: actual Docker Compose production/staging configurations parse and
have no Metabase service/volume/dependency/env mapping; candidate Nginx syntax
passes in the installed production Nginx container without reload. Web type-check
and changed-file lint pass, five regression suites/67 tests pass, and two viewport
component browser checks/14 assertions pass. Desktop/mobile screenshots use the
actual production HealthClient component with a synthetic local health response.
The scoped Impeccable detector returned no findings.

## Remaining boundary

No commit, push, PR, application deployment or policy change was performed. Host
tracked source remains at production SHA
`9ace768b6eea276e289384b114029aecf6f57bc2`, clean. The running web bundle still has
the old shortcut/CSP snapshot and the running Nginx route can return502 for the
removed analytics backend until this source cleanup is reviewed/released. A
manual full-stack Compose startup from the old host source can recreate Metabase;
the official application-only deployment path does not select it. Do not claim
permanent source retirement is deployed until the reviewed cleanup is promoted.

Executor verification is not independent sign-off. Evidence and the full runtime
reconciliation report are held in the outer DIIS workspace under
`output/metabase-uninstall-20261027` and `docs/audits/`.

Rekomendasi model untuk tindak lanjut
Task berikutnya: independent review of the runtime removal, preservation proof
and local source cleanup; Git/application release remain unapproved.
Model / effort: GPT-5.6 Sol (gpt-5.6-sol) / high.
Alasan: shared production database and ingress require exact ownership/preservation.
Syarat kualitas: validate owned objects, remaining Prisma/business data, Compose
startup behavior and the distinction between removed runtime and unreleased UI/config.
Sesi laporan ini: model/effort aktual tidak terverifikasi.
