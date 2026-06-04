# N-18 — Gitflow Realign: smoke-test ke produksi — DONE

**Status:** ✅ CLOSED  
**Tanggal:** 2026-06-04  
**Branch:** develop / staging / main (semua sama)  
**Model:** Sonnet 4.6

---

## Ringkasan

Sinkronisasi semua branch ke superset `origin/main` + smoke-test N-15a +
ledger Cowork. Smoke-test `SELECT 1 FROM auth.users LIMIT 1` kini berjalan
di container produksi setiap container start.

## Situasi sebelum (basi)

| Branch | State |
|---|---|
| `origin/main` | `ee1d481` — CSP fix PR#41, tanpa smoke-test |
| `origin/develop` | `b9c4dcf` — smoke-test ada, tapi basi 34 commit dari main |
| `origin/staging` | `3997aa4` — sangat lama (@2026-05-26) |

## Langkah eksekusi

| Step | Perintah | Hasil |
|---|---|---|
| 1 | `git checkout main && git pull origin main` | ff ke ee1d481 |
| 2 | `git branch -f develop origin/main` | reset develop ke main |
| 2b | `git cherry-pick 3011725` | apply smoke-test (84d1603, no conflict) |
| 3 | `git branch -f staging origin/main` | reset staging ke main |
| 4 | `git stash pop` + `git add` + commit N-18 | f677d9e |
| 5 | `git push --force-with-lease origin develop` | b9c4dcf→f677d9e ✓ |
| 5b | `git push --force-with-lease origin staging` | 3997aa4→ee1d481 ✓ |
| 6 | `git checkout staging; git merge --ff-only develop; git push` | ee1d481→f677d9e ✓ |
| 7 | `git checkout main; git merge --ff-only staging; git push` | ee1d481→f677d9e ✓ |

## Bukti runtime

```
# 1. Smoke-test ada di prod (grep count = 5 baris matching)
git show origin/main:apps/api/start.sh | grep -c "smoke-test\|db execute"
→ 5

# 2. Divergence nol — tiga branch identik
git rev-list --left-right --count origin/main...origin/develop
→ 0	0

# 3. Health endpoint produksi
(Invoke-WebRequest https://api.smkdarussalamsubah.sch.id/health).StatusCode
→ 200
```

Deploy Staging: run 26943737882 — ✅ HIJAU 3m9s  
Deploy Produksi: run 26943929775 — ✅ HIJAU 3m18s

## State akhir

```
origin/main    = f677d9e  (= staging = develop)
origin/staging = f677d9e  (ff dari develop)
origin/develop = f677d9e  (cherry-pick 84d1603 + ledger f677d9e)
```

`start.sh` di produksi kini:
1. `migrate deploy` gagal → exit 1
2. `SELECT 1 FROM auth.users LIMIT 1` gagal → exit 1 + rujuk INCIDENT-N14
3. Server start

## Catatan

Coverage artifact (`coverage-*/`) yang muncul sebagai untracked di-exclude dari
commit karena noise (ratusan HTML). Queue.md & WAYS-OF-WORKING.md dari stash
`cowork-ledger-0604` berhasil diaplikasikan + commit N-18.

Coverage dirs harus ditambahkan ke `.gitignore` (follow-up terpisah).
