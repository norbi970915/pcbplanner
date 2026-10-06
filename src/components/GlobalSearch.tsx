import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from 'radix-ui';
import { BookOpen, Search, X } from 'lucide-react';
import { Button } from './shadcn/button';
import { CategoryIcon } from './CategoryIcon';
import { TOOLS, GROUP_COLORS } from '../tools/registry';
import { GUIDES } from '../guides/registry';
import { searchEntries, type SearchEntry } from '../lib/siteSearch';

const entries: SearchEntry[] = [
  ...TOOLS.map(tool => ({ path: tool.path, title: tool.title, description: tool.summary, kind: 'Tool' as const, group: tool.group, keywords: tool.nav })),
  ...GUIDES.map(guide => ({ path: guide.path, title: guide.title, description: guide.description, kind: 'Guide' as const, group: guide.category, keywords: guide.seoTitle })),
];
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const matches = query.trim() ? searchEntries(entries, query) : entries.filter(entry => entry.kind === 'Tool').slice(0, 6);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault(); setOpen(value => !value); setQuery(''); setActive(0);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (open) document.getElementById(id + '-option-' + active)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);
  const choose = (entry: SearchEntry) => { setOpen(false); navigate(entry.path); };
  return <Dialog.Root open={open} onOpenChange={value => { setOpen(value); if (value) { setQuery(''); setActive(0); } }}>
    <Dialog.Trigger asChild><Button variant="ghost" size="sm" className="global-search-trigger" aria-label="Search tools and guides" title="Search tools and guides (Ctrl/Cmd+K)">
      <Search size={16} aria-hidden="true" /><span>Search</span><kbd>Ctrl K</kbd>
    </Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="workspace-dialog-overlay" />
      <Dialog.Content className="global-search-dialog" onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}>
        <Dialog.Title className="sr-only">Search tools and guides</Dialog.Title>
        <Dialog.Description className="sr-only">Search by name or topic. Use arrow keys to choose a result and Enter to open it.</Dialog.Description>
        <div className="global-search-input"><Search size={19} aria-hidden="true" />
          <input ref={input} role="combobox" aria-label="Search tools and guides" aria-autocomplete="list" aria-expanded="true"
            aria-controls={id + '-results'} aria-activedescendant={matches[active] ? id + '-option-' + active : undefined}
            placeholder="Find a tool or guide..." value={query} autoComplete="off" spellCheck={false}
            onChange={event => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={event => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault(); setActive(value => matches.length ? (value + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length : 0);
              }
              if (event.key === 'Enter' && matches[active]) { event.preventDefault(); choose(matches[active]); }
            }} />
          <Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close search"><X size={17} /></Button></Dialog.Close>
        </div>
        <p className="global-search-count" role="status">{query.trim() ? matches.length + ' result' + (matches.length === 1 ? '' : 's') : 'Popular starting points'}</p>
        <div className="global-search-results" id={id + '-results'} role="listbox" aria-label="Tools and guides">
          {matches.map((entry, index) => <div key={entry.path} id={id + '-option-' + index} role="option" aria-selected={active === index}
            className="global-search-result" onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(entry)}>
            {entry.kind === 'Tool' ? <CategoryIcon group={entry.group} color={GROUP_COLORS[entry.group]} size={20} /> : <BookOpen size={20} className="text-accent-ink" />}
            <div><strong>{entry.title}</strong><p>{entry.description}</p></div><span className="global-search-kind">{entry.kind}</span>
          </div>)}
          {!matches.length && <div className="global-search-empty"><strong>No matches yet</strong><p>Try a shorter term such as impedance, thermal, track width or 3W.</p></div>}
        </div>
        <div className="global-search-footer"><span>Tools and practical design guides</span><span>Arrow keys Choose | Enter Open | Esc Close</span></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
