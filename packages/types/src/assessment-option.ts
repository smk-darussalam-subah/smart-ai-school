export type OptionPart =
  | { type: 'text'; text: string }
  | { type: 'formula'; latex: string }
  | { type: 'image'; mediaId: string; alt: string };

export interface AssessmentOption {
  id: string;
  text: string;
  parts?: OptionPart[];
}

/** Option identity follows visible content and media references, excluding fallback alt text. */
export function assessmentOptionContentKey(option: AssessmentOption): string {
  const normalizeText = (text: string) => text.trim().toLocaleLowerCase('id-ID');
  return JSON.stringify(option.parts?.length
    ? ['rich', option.parts.map((part) => part.type === 'image' ? ['image', part.mediaId]
      : part.type === 'formula' ? ['formula', part.latex.trim()] : ['text', normalizeText(part.text)])]
    : ['plain', normalizeText(option.text)]);
}

/** Used with validated parts. Text is the fallback for legacy consumers. */
export function assessmentOptionText(parts: readonly OptionPart[]): string {
  return parts.map((part) => part.type === 'text' ? part.text
    : part.type === 'formula' ? part.latex : part.alt).join(' ').trim();
}
