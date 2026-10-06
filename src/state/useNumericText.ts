import { useEffect, useRef, useState } from 'react';
import { RESET_EVENT } from './useUrlState';

export function useSyncedText(value: number, toText: (v: number) => string) {
  const [text, setText] = useState(() => toText(value));
  const emitted = useRef(value);
  const latest = useRef({ value, toText });
  latest.current = { value, toText };
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(toText(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Reset must also clear text the user typed that never parsed (the value did not change).
  useEffect(() => {
    const onReset = () => {
      emitted.current = latest.current.value;
      setText(latest.current.toText(latest.current.value));
    };
    window.addEventListener(RESET_EVENT, onReset);
    return () => window.removeEventListener(RESET_EVENT, onReset);
  }, []);
  return { text, setText, emit: (v: number) => { emitted.current = v; } };
}

