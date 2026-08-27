import type { HelpContentBlock } from './help-schema';

export interface HelpTocItem {
  blockIndex: number;
  id: string;
  level: 2 | 3;
  text: string;
}

function normalizeAnchor(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'bagian';
}

export function buildHelpTableOfContents(blocks: HelpContentBlock[]): HelpTocItem[] {
  const occurrences = new Map<string, number>();
  return blocks.flatMap((block, blockIndex) => {
    if (block.kind !== 'heading') return [];
    const base = normalizeAnchor(block.text);
    const occurrence = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occurrence);
    return [{
      blockIndex,
      id: occurrence === 1 ? base : `${base}-${occurrence}`,
      level: block.level,
      text: block.text,
    }];
  });
}
