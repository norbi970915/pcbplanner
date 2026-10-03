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
    date: '2026-10-03',
    title: 'Keep your favorite tools close',
    text: 'Star the tools you use most to pin them at the top of the sidebar. Your favorites stay saved in the same browser—even after closing and reopening the app. Available on desktop and mobile, with no account needed.',
  },
  {
    date: '2026-09-26',
    title: 'Works offline and installs as an app',
    text: 'After your first visit every calculator keeps working without a network connection, including the field solver. In Chrome or Edge choose File › Install as App; on an iPhone use Share › Add to Home Screen.',
  },
];
