import type { DataSource } from '../data/source';

/** Reference list for data-driven tools: where every table value comes from. */
export function Sources({ items }: { items: readonly DataSource[] }) {
  return (
    <>
      <h2>Data sources</h2>
      <ol>
        {items.map((s) => (
          <li key={s.url + s.title}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <div className="text-[12px] text-muted">{s.note}</div>
          </li>
        ))}
      </ol>
    </>
  );
}
