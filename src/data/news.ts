// "What's new" on the home page. Newest first; the home page shows the latest two (the owner's choice).
// Only announcements the site owner chooses go here, not every new tool or guide.

export interface NewsItem {
  date: string; // ISO date
  title: string;
  text: string;
  links?: { to: string; label: string }[];
}

export const NEWS: NewsItem[] = [
  {
    date: '2026-10-18',
    title: 'Load your KiCad project and check its routing',
    text: 'Drop your KiCad project folder once to see its stackup, net classes and differential pairs, the trace widths for 50, 90 and 100 Ω on every layer, and a routing check of each pair’s impedance, skew, length and loss. Impedance, Interface rules, Trace loss, Delay & timing, Crosstalk and PDN can then import values from the project. The files stay in your browser.',
    links: [{ to: '/kicad-project', label: 'Open KiCad project' }],
  },
  {
    date: '2026-10-15',
    title: 'Inspect Gerbers and compare board revisions',
    text: 'Open one PCB layout to inspect its layers, or load revisions A and B to highlight their differences. Choose layers independently, zoom into changes and export the view. Gerber files and ZIP archives are processed on your device, with no uploads.',
    links: [{ to: '/gerber-viewer', label: 'Open Gerber Viewer & Compare' }],
  },
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
