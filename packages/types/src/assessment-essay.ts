
export const MAX_ESSAY_TEXT = 10_000;
const MAX_ESSAY_NODES = 500;
const MAX_ESSAY_DEPTH = 9;
const MAX_ESSAY_FORMULAS = 30;
const MAX_FORMULA_LENGTH = 480;

type EssayMark = { type: 'bold' | 'italic' };
type EssayInline =
  | { type: 'text'; text: string; marks?: EssayMark[] }
  | { type: 'hardBreak' }
  | { type: 'questionFormula'; attrs: { latex: string; display: boolean } };
type EssayParagraph = { type: 'paragraph'; content?: EssayInline[] };
type EssayListItem = { type: 'listItem'; content: [EssayParagraph, ...EssayBlock[]] };
type EssayList = { type: 'bulletList'; content: EssayListItem[] };
export type EssayBlock = EssayParagraph | EssayList;
export type EssayDocument = { type: 'doc'; content: EssayBlock[] };
export const MAX_ESSAY_PHOTOS = 3;
export type AssessmentEssayAnswer = { type: 'essay'; text: string; document?: EssayDocument; photoIds?: string[] };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, ...keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function parseMarks(marks: unknown): EssayMark[] | null {
  if (!Array.isArray(marks) || marks.length > 2) return null;
  const output: EssayMark[] = [];
  for (const mark of marks) {
    if (!record(mark) || !only(mark, 'type') || (mark.type !== 'bold' && mark.type !== 'italic')
      || output.some((item) => item.type === mark.type)) return null;
    output.push({ type: mark.type });
  }
  return output;
}

/** Accept the small document subset used by the essay editor. No HTML or URLs are interpreted. */
export function readEssayDocument(input: unknown): EssayDocument | null {
  let nodes = 0;
  let formulas = 0;
  let textSize = 0;
  const take = (node: unknown): node is Record<string, unknown> =>
    ++nodes <= MAX_ESSAY_NODES && record(node);

  const inline = (node: unknown): EssayInline | null => {
    if (!take(node)) return null;
    if (node.type === 'hardBreak' && only(node, 'type')) return { type: 'hardBreak' };
    if (node.type === 'text' && only(node, 'type', 'text', 'marks')
      && typeof node.text === 'string' && node.text.length > 0) {
      textSize += node.text.length;
      if (textSize > MAX_ESSAY_TEXT) return null;
      const marks = node.marks === undefined ? [] : parseMarks(node.marks);
      if (!marks) return null;
      return { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) };
    }
    if (node.type !== 'questionFormula' || !only(node, 'type', 'attrs') || ++formulas > MAX_ESSAY_FORMULAS
      || !record(node.attrs) || !only(node.attrs, 'latex', 'display')) return null;
    const { latex, display } = node.attrs;
    if (typeof latex !== 'string' || !latex.trim() || latex.length > MAX_FORMULA_LENGTH || typeof display !== 'boolean'
      || /\\(?:def|gdef|edef|xdef|let|futurelet|global|includegraphics|html[A-Za-z]*|url|href)\b/.test(latex)) return null;
    textSize += latex.length;
    if (textSize > MAX_ESSAY_TEXT) return null;
    return { type: 'questionFormula', attrs: { latex, display } };
  };

  const block = (node: unknown, depth: number): EssayBlock | null => {
    if (depth > MAX_ESSAY_DEPTH || !take(node) || !only(node, 'type', 'content')) return null;
    const content = node.content;
    if (node.type === 'paragraph') {
      if (content === undefined) return { type: 'paragraph' };
      if (!Array.isArray(content) || content.length > MAX_ESSAY_NODES) return null;
      const parts: EssayInline[] = [];
      for (const item of content) {
        const part = inline(item);
        if (!part) return null;
        parts.push(part);
      }
      return { type: 'paragraph', ...(parts.length ? { content: parts } : {}) };
    }
    if (node.type !== 'bulletList' || !Array.isArray(content) || !content.length || content.length > MAX_ESSAY_NODES) return null;
    const items: EssayListItem[] = [];
    for (const item of content) {
      if (!take(item) || item.type !== 'listItem' || !only(item, 'type', 'content')
        || !Array.isArray(item.content) || !item.content.length || item.content.length > MAX_ESSAY_NODES) return null;
      const [first, ...rest] = item.content;
      const paragraph = block(first, depth + 2);
      if (paragraph?.type !== 'paragraph') return null;
      const children: [EssayParagraph, ...EssayBlock[]] = [paragraph];
      for (const child of rest) {
        const parsed = block(child, depth + 2);
        if (!parsed) return null;
        children.push(parsed);
      }
      items.push({ type: 'listItem', content: children });
    }
    return { type: 'bulletList', content: items };
  };

  if (!take(input) || input.type !== 'doc' || !only(input, 'type', 'content')
    || !Array.isArray(input.content) || !input.content.length || input.content.length > MAX_ESSAY_NODES) return null;
  const content: EssayBlock[] = [];
  for (const node of input.content) {
    const parsed = block(node, 1);
    if (!parsed) return null;
    content.push(parsed);
  }
  const document: EssayDocument = { type: 'doc', content };
  return essayDocumentText(document).length <= MAX_ESSAY_TEXT ? document : null;
}

/** A plain-text projection is always present so existing assessment consumers keep their contract. */
export function essayDocumentText(document: EssayDocument): string {
  const text = (blocks: EssayBlock[]): string => blocks.map((block) => {
    if (block.type === 'bulletList')
      return block.content.map((item) => text(item.content)).join('\n');
    return (block.content ?? []).map((part) => part.type === 'text' ? part.text
      : part.type === 'hardBreak' ? '\n' : part.attrs.latex).join('');
  }).join('\n');
  return text(document.content).trim();
}
