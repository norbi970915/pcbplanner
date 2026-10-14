import { Copy, ImageDown } from 'lucide-react';
import { useState } from 'react';
import { canCopyImage, cardPng, copyPng, downloadBlob, type ResultCard } from '../lib/resultImage';
import { Button } from './shadcn/button';

/** "Image" downloads the result card as a PNG; "Copy" puts it on the clipboard for a chat or a post. */
export function ResultImageButtons({ card, fileName, disabled }: { card: () => ResultCard | null; fileName: string; disabled?: boolean }) {
  const [note, setNote] = useState('');
  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(''), 2500);
  };
  const make = () => {
    const c = card();
    if (!c) return Promise.reject(new Error('No result to export yet.'));
    return cardPng(c);
  };
  const fail = () => flash('Image not available');
  return (
    <span className="flex items-center gap-1">
      <span role="status" aria-live="polite" className="text-faint">{note}</span>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} title="Download the result, inputs and drawing as a PNG image"
        onClick={() => make().then((b) => { downloadBlob(b, fileName); flash('Saved'); }).catch(fail)}>
        <ImageDown size={14} aria-hidden="true" />Image
      </Button>
      {canCopyImage() && (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} title="Copy the result image to the clipboard"
          onClick={() => copyPng(make).then(() => flash('Copied')).catch(fail)}>
          <Copy size={14} aria-hidden="true" />Copy
        </Button>
      )}
    </span>
  );
}
