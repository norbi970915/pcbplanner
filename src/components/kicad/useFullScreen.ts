// Full screen for a board panel: the browser's own where it is offered for elements, else a window-filling
// overlay (iPhone Safari). `box` goes on the element to show; `full` tells how it is shown.
import { useEffect, useRef, useState } from 'react';

export function useFullScreen() {
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<'' | 'api' | 'overlay'>('');
  useEffect(() => {
    const change = () => setFull((f) => (document.fullscreenElement && document.fullscreenElement === box.current ? 'api' : f === 'api' ? '' : f));
    document.addEventListener('fullscreenchange', change);
    return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  useEffect(() => {
    if (full !== 'overlay') return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFull('');
    window.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = overflow;
    };
  }, [full]);
  const toggle = () => {
    if (full === 'api') void document.exitFullscreen?.();
    else if (full === 'overlay') setFull('');
    else if (box.current?.requestFullscreen && document.fullscreenEnabled) box.current.requestFullscreen().catch(() => setFull('overlay'));
    else setFull('overlay');
  };
  return { box, full, toggle };
}
