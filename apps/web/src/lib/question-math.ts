import type { KatexOptions } from 'katex';

export const QUESTION_FORMULAS = [
  { label: 'Pecahan', latex: String.raw`\frac{a}{b}` },
  { label: 'Pangkat', latex: 'x^{2}' },
  { label: 'Akar', latex: String.raw`\sqrt{x}` },
  { label: 'Indeks bawah', latex: 'v_{0}' },
  { label: 'Gaya', latex: String.raw`F = m \times a` },
  { label: 'Kecepatan', latex: String.raw`v = \frac{\Delta s}{\Delta t}` },
] as const;

export const MAX_FORMULA_LENGTH = 480;
const OPTIONS: KatexOptions = {
  trust: false,
  maxExpand: 200,
  maxSize: 16,
  strict: 'ignore',
  throwOnError: true,
  output: 'htmlAndMathml',
};

export async function renderQuestionFormula(
  latex: string,
  displayMode: boolean,
  output: KatexOptions['output'] = OPTIONS.output,
): Promise<string> {
  // Keep stored formulas declarative and cap work even for pasted or imported LaTeX.
  if (!latex.trim() || latex.length > MAX_FORMULA_LENGTH ||
      /\\(?:def|gdef|edef|xdef|let|futurelet|global|includegraphics|html[A-Za-z]*|url|href)\b/.test(latex)) {
    throw new Error('Gunakan rumus singkat tanpa tautan, gambar, atau makro.');
  }
  const { default: katex } = await import('./question-katex');
  return katex.renderToString(latex, { ...OPTIONS, displayMode, output });
}
