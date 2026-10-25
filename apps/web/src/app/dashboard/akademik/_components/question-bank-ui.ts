export const QB_FIELD =
  'min-h-11 w-full rounded-lg border border-[var(--qb-line)] bg-[var(--qb-bg)] px-3 py-2 text-sm text-[var(--qb-ink)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60';
export const QB_BUTTON =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const QB_OUTLINE =
  'border border-[var(--qb-line)] bg-[var(--qb-bg)] text-[var(--qb-ink)] hover:bg-[var(--qb-soft)]';
export const QB_PRIMARY = 'bg-emerald-700 text-white hover:bg-emerald-800';
// Scoped tokens: both the DIIS theme switch and OS dark preference work, without changing global Tailwind behavior.
export const QUESTION_BANK_STYLE = `
.diis-question-bank{--qb-bg:#fff;--qb-soft:#f4f7f5;--qb-ink:#0f2e25;--qb-muted:#526b62;--qb-line:#dfe9e4;--qb-ok-bg:#ecfdf5;--qb-ok-ink:#065f46;--qb-warn-bg:#fffbeb;--qb-warn-ink:#92400e;--qb-error-bg:#fff1f2;--qb-error-ink:#9f1239;--qb-ai-bg:#f5f3ff;--qb-ai-ink:#6d28d9;color:var(--qb-ink);background:var(--qb-bg)}
:root[data-theme="dark"] .diis-question-bank,:root.dark .diis-question-bank{--qb-bg:#0f172a;--qb-soft:#172335;--qb-ink:#f1f5f9;--qb-muted:#bdcbd5;--qb-line:#3e5063;--qb-ok-bg:#052e24;--qb-ok-ink:#a7f3d0;--qb-warn-bg:#452a08;--qb-warn-ink:#fde68a;--qb-error-bg:#4c1026;--qb-error-ink:#fecdd3;--qb-ai-bg:#2e1065;--qb-ai-ink:#ddd6fe}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .diis-question-bank{--qb-bg:#0f172a;--qb-soft:#172335;--qb-ink:#f1f5f9;--qb-muted:#bdcbd5;--qb-line:#3e5063;--qb-ok-bg:#052e24;--qb-ok-ink:#a7f3d0;--qb-warn-bg:#452a08;--qb-warn-ink:#fde68a;--qb-error-bg:#4c1026;--qb-error-ink:#fecdd3;--qb-ai-bg:#2e1065;--qb-ai-ink:#ddd6fe}}
.diis-question-bank ::selection{background:#a7f3d0;color:#064e3b}
.diis-question-bank input,.diis-question-bank textarea{caret-color:#059669}
.diis-question-bank input::placeholder,.diis-question-bank textarea::placeholder{color:var(--qb-muted);opacity:1}
.diis-question-bank input[type=checkbox]{accent-color:#047857}
.diis-question-bank :focus-visible{outline-offset:3px}
.diis-question-bank .qb-scroll{scrollbar-color:#94a3b8 var(--qb-soft);scrollbar-width:thin}
`;
export const questionTypeLabels = {
  multiple_choice: 'Pilihan ganda',
  true_false: 'Benar / salah',
  matching: 'Menjodohkan',
  essay: 'Uraian',
};
export const questionDifficultyLabels = { easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' };
