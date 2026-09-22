import { useEffect, useState, type ReactNode } from 'react';
import { APP_NAME } from '../config';
import { AdSlot, PartnerBox } from './Ads';

export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} – ${APP_NAME}`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
  }, [title, description]);
}

export function ToolPage({
  title,
  description,
  onReset,
  children,
  method,
}: {
  title: string;
  description: string;
  onReset?: () => void;
  children: ReactNode;
  method?: ReactNode;
}) {
  useDocumentMeta(title, description);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight tracking-tight">{title}</h1>
          <p className="mt-0.5 max-w-[80ch] text-[13px] text-muted">{description}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={copyLink} title="Copy a link that reproduces these inputs">
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          {onReset && (
            <button className="btn" onClick={onReset}>
              Reset
            </button>
          )}
        </div>
      </div>

      {children}

      <div className="mt-6 2xl:hidden">
        <div className="grid gap-4 md:grid-cols-[1fr_300px]">
          <AdSlot slot="inline-responsive" minHeight={120} />
          <PartnerBox />
        </div>
      </div>

      {method && (
        <details className="group mt-6 rounded border border-line bg-panel" open>
          <summary className="cursor-pointer select-none border-b border-line px-3 py-2 text-[13px] font-semibold">Method, formulas and references</summary>
          <div className="prose-doc px-4 py-3">{method}</div>
        </details>
      )}
    </div>
  );
}
