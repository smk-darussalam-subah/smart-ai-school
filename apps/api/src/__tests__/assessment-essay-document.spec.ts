
import { essayDocumentText, readEssayDocument, type EssayDocument } from '@smk/types';
import { EssayAnswerSchema } from '../assessment/assessment-contract';
import { AutosaveResponseSchema, SubmitResponseSchema } from '../assessment/dto/assessment.dto';

const id = '34ba8cef-98a9-4cb2-b52d-17cf9ab8ac54';
const mutationId = '7a580a7c-1d51-4355-a2a2-1ac3d12f1dd9';
const document: EssayDocument = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [
      { type: 'text', text: 'Jarak', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' terhadap waktu', marks: [{ type: 'italic' }] },
      { type: 'hardBreak' },
      { type: 'questionFormula', attrs: { latex: String.raw`\frac{6}{2}`, display: false } },
    ] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Satuan m/s' }] }] },
    ] },
  ],
};

describe('assessment essay document', () => {
  it('reads old essays literally and keeps the old text-only representation', () => {
    expect(EssayAnswerSchema.parse({ type: 'essay', text: ' <b>teks lama</b> ' }))
      .toEqual({ type: 'essay', text: '<b>teks lama</b>' });
  });

  it('preserves the same document through autosave and submit DTOs', () => {
    const text = 'Jarak terhadap waktu\n\\frac{6}{2}\nSatuan m/s';
    expect(essayDocumentText(document)).toBe(text);
    const payload = { answers: { [id]: { type: 'essay', text, document } }, revision: 3, mutationId };
    expect(AutosaveResponseSchema.parse(payload).answers).toEqual(payload.answers);
    expect(SubmitResponseSchema.parse(payload).answers).toEqual(payload.answers);
  });

  it('rejects conflicting text so a retry cannot save a different visible answer', () => {
    expect(EssayAnswerSchema.safeParse({ type: 'essay', text: 'Berbeda', document }).success).toBe(false);
  });

  it.each([
    { type: 'link', attrs: { href: 'https://example.invalid/path' } },
    { type: 'questionImage', attrs: { mediaId: id } },
    { type: 'text', text: 'teks', marks: [{ type: 'bold', attrs: { unexpected: 'x' } }] },
    { type: 'questionFormula', attrs: { latex: '\\href{https://example.invalid}{x}', display: false } },
    { type: 'text', text: 'x'.repeat(10_001) },
  ])('rejects invalid inline content at the DTO boundary', (item) => {
    expect(EssayAnswerSchema.safeParse({
      type: 'essay', text: 'x', document: { type: 'doc', content: [{ type: 'paragraph', content: [item] }] },
    }).success).toBe(false);
  });

  it('bounds nested lists and the number of nodes', () => {
    const paragraph = { type: 'paragraph' } as const;
    let nested: unknown = paragraph;
    for (let i = 0; i < 12; i++)
      nested = { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph, nested] }] };
    expect(readEssayDocument({ type: 'doc', content: [nested] })).toBeNull();
    expect(readEssayDocument({ type: 'doc', content: Array(501).fill(paragraph) })).toBeNull();
  });
});
