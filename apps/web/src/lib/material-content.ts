import DOMPurify from 'dompurify';

/** Existing plain text stays plain text; formatted modules share this browser-only policy. */
export function formatMaterialInput(value: string): string {
  if (/<\/?[a-z][\w:-]*(?:\s[^>]*|\/?)>/i.test(value)) return value;
  const escaped = value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
  return escaped
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => `<p>${paragraph.replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
}

export function safeMaterialLink(value: string): string | null {
  const href = value.trim();
  if (/^[#]/.test(href) || /^\/(?![\\/])/.test(href)) return href;
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Never call on the server. No image/embed/style/event handler or arbitrary attributes. */
export function sanitizeMaterialHtml(value: string): string {
  if (typeof DOMPurify.sanitize !== 'function') return '';
  return DOMPurify.sanitize(formatMaterialInput(value), {
    ALLOWED_TAGS: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'a',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'colgroup',
      'col',
    ],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'start'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/(?![\\/]))/i,
  });
}

export function materialHasText(value: string): boolean {
  return (
    value
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|#160|#xA0);/gi, ' ')
      .trim().length > 0
  );
}

export const MATERIAL_STYLE = `
.diis-material{max-width:70ch;overflow-wrap:anywhere;color:inherit;font-size:1rem;line-height:1.8}
.diis-material[role=textbox]{max-width:none}
.diis-material>*+*{margin-top:1rem}.diis-material h1,.diis-material h2{margin-top:1.75rem;font-size:1.35rem;line-height:1.4;font-weight:700}
.diis-material h3,.diis-material h4,.diis-material h5,.diis-material h6{margin-top:1.5rem;font-size:1.1rem;line-height:1.5;font-weight:700}
.diis-material>:first-child{margin-top:0}.diis-material ul,.diis-material ol{padding-inline-start:1.6rem}.diis-material ul{list-style:disc}.diis-material ol{list-style:decimal}
.diis-material li+li{margin-top:.45rem}.diis-material li>p{margin:.2rem 0}.diis-material blockquote{border-inline-start:2px solid #10b981;padding-inline-start:1rem}
.diis-material a{color:var(--material-link,var(--em,#047857));text-decoration:underline;text-underline-offset:3px}.diis-material a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.diis-material pre{max-width:100%;overflow:auto;white-space:pre;background:var(--material-code,var(--surface2,#f1f5f9));border-radius:.5rem;padding:1rem;font-size:.875rem;line-height:1.6}
.diis-material code{font-family:ui-monospace,monospace}.diis-material table{display:block;max-width:100%;overflow-x:auto;border-collapse:collapse;font-size:.9rem}
.diis-material th,.diis-material td{min-width:5rem;border:1px solid var(--material-line,var(--border,#cbd5e1));padding:.65rem .8rem;text-align:start;vertical-align:top}
.diis-material th{font-weight:700}.diis-material hr{margin:1.5rem 0;border-color:var(--material-line,var(--border,#cbd5e1))}
.diis-material [contenteditable=true]:focus{outline:none}
`;
