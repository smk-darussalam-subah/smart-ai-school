# Agent Harness DIIS — Subset Terkurasi (2026-06-11)

> Dipasang atas mandat Director untuk operasional yang lebih efektif, efisien,
> secure, dan terstruktur. Berlaku untuk Claude Code (project-level `.claude/`).

## Sumber & Lisensi
| Sumber | Versi | Lisensi | Diambil |
|---|---|---|---|
| [affaan-m/ECC](https://github.com/affaan-m/ECC) | 2.0.0 | MIT | 14 skill + 13 agent + 4 set rules (subset) |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | 2.5.0 | MIT | skill `ui-ux-pro-max` lengkap (SKILL.md + data CSV + script pencarian) |

## Yang DIPASANG
**Skills** (`.claude/skills/`): nestjs-patterns · prisma-patterns · postgres-patterns ·
react-patterns · react-performance · security-review · tdd-workflow · database-migrations ·
api-design · backend-patterns · e2e-testing · deployment-patterns · accessibility ·
coding-standards · **ui-ux-pro-max** (67 style, 161 palet, 57 font pairing, 99 UX guideline —
WAJIB dipakai untuk semua pekerjaan frontend/UI).

**Agents** (`.claude/agents/`): code-reviewer · security-reviewer · database-reviewer ·
typescript-reviewer · react-reviewer · planner · tdd-guide · performance-optimizer ·
refactor-cleaner · build-error-resolver · e2e-runner · a11y-architect · doc-updater.

**Rules** (`.claude/rules/`): typescript · react · web · common — referensi konvensi;
bila bertentangan dengan `CLAUDE.md` repo, **CLAUDE.md menang**.

## Yang SENGAJA TIDAK dipasang (keputusan keamanan)
- **ECC hooks** (`hooks.json` + scripts/): mengeksekusi node script otomatis pada tiap
  PreToolUse/Write — permukaan eksekusi pihak-ketiga yang tak perlu; quality-gate kita
  sudah dipegang CI + gerbang review Cowork.
- **ECC scripts/commands/installer & 230+ skill di luar stack** (cpp/django/flutter/defi/
  trading dst.): tidak relevan, bloat.
- `cli/` milik ui-ux-pro-max (installer Bun): tidak diperlukan, skill dipakai langsung.

## Audit keamanan (2026-06-11, oleh Cowork)
- Semua skill/agent ECC yang dipasang = **murni markdown** (0 file non-md), lolos grep
  pola berbahaya (`curl|sh`, `wget|sh`, `rm -rf /`, `eval $(...)`, `base64 -d`).
- Script python ui-ux-pro-max (`scripts/*.py`, pencarian CSV lokal): **tanpa** import
  network (requests/urllib/socket), tanpa subprocess/eval/exec. `data/_sync_all.py`
  (sinkronisasi upstream) dan `scripts/tests/` DIHAPUS dari vendor.
- Update upstream TIDAK otomatis — re-vendor manual + ulangi audit ini.

## Cara pakai (Claude Code)
- Skill terdeteksi otomatis dari `.claude/skills/` (project scope).
- UI/UX: mulai tugas frontend dengan membaca `skills/ui-ux-pro-max/SKILL.md`; cari
  rekomendasi via `python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>"`.
- Review wajib sebelum PR: jalankan persona `agents/code-reviewer.md` +
  `agents/security-reviewer.md` (+ `database-reviewer.md` bila menyentuh schema).
