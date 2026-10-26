/** Versioned text envelope: old questions remain literal text, including HTML/code examples. */
export const QUESTION_HTML_PREFIX = '<!--diis-question-html:v1-->';

export function questionBodyForEditor(body: string): string {
  if (body.startsWith(QUESTION_HTML_PREFIX)) return body.slice(QUESTION_HTML_PREFIX.length);
  const escaped = body.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
  return `<p>${escaped.replace(/\r?\n/g, '<br>')}</p>`;
}
