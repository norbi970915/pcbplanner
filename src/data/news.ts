// "What's new" on the home page. Newest first; the home page shows the first three.
// Only announcements the site owner chooses go here, not every new tool or guide.

export interface NewsItem {
  date: string; // ISO date
  title: string;
  text: string;
  links?: { to: string; label: string }[];
}

export const NEWS: NewsItem[] = [
  {
    date: '2026-09-26',
    title: 'Works offline and installs as an app',
    text: 'After your first visit every calculator keeps working without a network connection, including the field solver. In Chrome or Edge choose File › Install as App; on an iPhone use Share › Add to Home Screen.',
  },
];
