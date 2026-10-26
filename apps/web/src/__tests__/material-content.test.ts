import { formatMaterialInput, materialHasText, safeMaterialLink } from '@/lib/material-content';

describe('material content compatibility and link boundary', () => {
  it('preserves existing HTML for the sanitizer rather than escaping it as literal lesson text', () => {
    expect(formatMaterialInput('<h2>Literasi</h2><p>4 dari 8</p>')).toBe(
      '<h2>Literasi</h2><p>4 dari 8</p>',
    );
  });
  it('escapes plain comparisons and retains paragraph/line breaks', () => {
    expect(formatMaterialInput('2 < 3 & 4 > 1\nBaris kedua\n\nBagian lain')).toBe(
      '<p>2 &lt; 3 &amp; 4 &gt; 1<br>Baris kedua</p><p>Bagian lain</p>',
    );
  });
  it('distinguishes empty editor markup from actual lesson content', () => {
    expect(materialHasText('<p><br></p>')).toBe(false);
    expect(materialHasText('<p>&nbsp; &#160; &#xA0;</p>')).toBe(false);
    expect(materialHasText('<p>Materi</p>')).toBe(true);
  });
  it.each([
    'https://example.invalid/materi',
    'http://example.invalid/',
    'mailto:guru@example.invalid',
    '/dashboard/akademik',
    '#bagian-2',
  ])('allows explicit safe link %s', (href) => expect(safeMaterialLink(href)).not.toBeNull());
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//example.invalid',
    '/\\example.invalid',
    'file:///C:/test',
    'https://user:password@example.invalid/',
    'example.invalid',
    '',
  ])('rejects unsafe/ambiguous link %s', (href) => expect(safeMaterialLink(href)).toBeNull());
});
