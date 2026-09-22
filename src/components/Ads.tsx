/**
 * Advertising placeholders. Paste the AdSense <ins class="adsbygoogle"> markup
 * (or load it in an effect) where marked. Slots keep their size so the layout
 * does not jump when ads load.
 */
export function AdSlot({ slot, minHeight = 250, className = '' }: { slot: string; minHeight?: number; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.08em] text-faint">Advertisement</div>
      <div className="flex items-center justify-center border border-line bg-sheet" style={{ minHeight }} data-ad-slot={slot}>
        {/* AdSense unit for slot "{slot}" goes here */}
      </div>
    </div>
  );
}

export function PartnerBox() {
  return (
    <div className="border border-line bg-sheet p-2.5">
      <div className="font-semibold">Getting boards made?</div>
      <p className="mt-0.5 text-muted">Controlled impedance, 1–3 oz copper and assembly are standard options at most prototype fabs.</p>
      <div className="mt-2 flex gap-2">
        {/* Replace with partner / referral URLs */}
        <a className="btn no-underline" href="https://jlcpcb.com/" target="_blank" rel="sponsored noopener noreferrer" data-partner="jlcpcb">
          JLCPCB
        </a>
        <a className="btn no-underline" href="https://www.pcbway.com/" target="_blank" rel="sponsored noopener noreferrer" data-partner="pcbway">
          PCBWay
        </a>
      </div>
    </div>
  );
}
