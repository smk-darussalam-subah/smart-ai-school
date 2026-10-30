'use strict';
// Evaluated in the synthetic browser page; computed text/background colors, not an accessibility certification.
function measureTextContrast() {
  const rgb = (value) => {
    const m = value.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const n = m[1].match(/[\d.]+/g)?.map(Number);
    return n && n.length >= 3 ? [...n.slice(0, 3), n[3] ?? 1] : null;
  };
  const blend = (front, back) =>
    front.slice(0, 3).map((v, i) => v * front[3] + back[i] * (1 - front[3]));
  const luminance = (color) =>
    color
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const failures = [],
    skipped = [];
  let checked = 0,
    minimum = Infinity;
  for (const el of document.querySelectorAll(
    'h1,h2,h3,h4,p,span,button,label,dt,dd,th,td,summary,text',
  )) {
    if (![...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
      continue;
    const rect = el.getBoundingClientRect(),
      css = getComputedStyle(el);
    if (
      rect.width <= 1 ||
      rect.height <= 1 ||
      css.visibility !== 'visible' ||
      el.closest('[hidden]') ||
      (el.closest('details:not([open])') && !el.closest('summary'))
    )
      continue;
    const ancestors = [];
    let node = el,
      unsupported = false;
    while (node) {
      const s = getComputedStyle(node);
      if (Number(s.opacity) < 1 || s.backgroundImage !== 'none') unsupported = true;
      ancestors.push(s.backgroundColor);
      node = node.parentElement;
    }
    if (unsupported) {
      skipped.push(el.textContent.trim().slice(0, 70));
      continue;
    }
    let background = [255, 255, 255];
    for (const value of ancestors.reverse()) {
      const color = rgb(value);
      if (color) background = blend(color, background);
    }
    const ink = rgb(el.tagName.toLowerCase() === 'text' ? css.fill : css.color);
    if (!ink) continue;
    const foreground = blend(ink, background),
      l1 = luminance(foreground),
      l2 = luminance(background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const large =
      parseFloat(css.fontSize) >= 24 ||
      (Number(css.fontWeight) >= 700 && parseFloat(css.fontSize) >= 18.66);
    checked++;
    minimum = Math.min(minimum, ratio);
    if (ratio + 0.01 < (large ? 3 : 4.5))
      failures.push({
        text: el.textContent.trim().slice(0, 100),
        ratio: Math.round(ratio * 100) / 100,
        required: large ? 3 : 4.5,
        color: css.color,
        background,
      });
  }
  return { checked, minimum: Math.round(minimum * 100) / 100, failures, skipped };
}
module.exports = { measureTextContrast };
