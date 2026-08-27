export interface HelpTopicSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  route: string;
  category: 'start' | 'task' | 'feature' | 'recovery' | 'governance' | 'contact';
  keywords: string[];
}

export function normalizeHelpSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchProjectedHelp(
  topics: HelpTopicSummary[],
  query: string,
  limit = 12,
): HelpTopicSummary[] {
  const normalized = normalizeHelpSearch(query);
  if (!normalized) return topics.slice(0, limit);
  const terms = normalized.split(/\s+/);
  return topics
    .map((topic, index) => {
      const title = normalizeHelpSearch(topic.title);
      const haystack = normalizeHelpSearch([topic.title, topic.summary, ...topic.keywords].join(' '));
      const matches = terms.every((term) => haystack.includes(term));
      const score = terms.reduce(
        (total, term) => total + (title.startsWith(term) ? 4 : title.includes(term) ? 2 : 1),
        0,
      );
      return { topic, index, matches, score };
    })
    .filter((item) => item.matches)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((item) => item.topic);
}
