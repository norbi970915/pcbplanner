export interface SearchEntry { path: string; title: string; description: string; kind: 'Tool' | 'Guide'; group: string; keywords?: string }
const synonyms: Record<string, string> = {
  track: 'trace', tracks: 'trace', traces: 'trace', ohm: 'impedance', ohms: 'impedance',
  '3w': 'crosstalk',
};
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u03b8ja/g, 'junction').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).map(word => synonyms[word] ?? word).join(' ');
}
export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries.map((entry, index) => {
    const title = normalizeSearch(entry.title);
    const text = normalizeSearch(entry.title + ' ' + entry.description + ' ' + entry.group + ' ' + (entry.keywords ?? ''));
    if (!words.every(word => text.includes(word))) return null;
    const score = words.reduce((sum, word) => sum + (title.split(' ').includes(word) ? 4 : title.includes(word) ? 2 : 0), 0);
    return { entry, score, index };
  }).filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.entry);
}
