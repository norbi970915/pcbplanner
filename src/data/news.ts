// "What's new" on the home page. Newest first; the home page shows the first three.
// Keep each item to a sentence or two with links to what changed.

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
  {
    date: '2026-09-26',
    title: 'Four component tools',
    text: 'Decode resistor colour bands and SMD resistor and capacitor markings, and design 555 timer circuits.',
    links: [
      { to: '/resistor-color-code', label: 'Resistor color code' },
      { to: '/smd-resistor-code', label: 'SMD resistor code' },
      { to: '/capacitor-code', label: 'Capacitor code' },
      { to: '/555-timer', label: '555 timer' },
    ],
  },
  {
    date: '2026-09-26',
    title: 'Three new guides',
    text: 'Worked examples for buck and boost converter design and for via fence spacing.',
    links: [
      { to: '/guides/buck-converter-formulas', label: 'Buck converter formulas' },
      { to: '/guides/boost-converter-formulas', label: 'Boost converter formulas' },
      { to: '/guides/via-fence-spacing', label: 'Via fence spacing' },
    ],
  },
];
