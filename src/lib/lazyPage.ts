import { createElement, lazy, useState, type ComponentType } from 'react';

/** A code-split page whose chunk can be fetched before React renders it. */
export type LazyPage = ComponentType & { preload: () => Promise<void> };

/**
 * Like React.lazy, but once `preload()` has finished the page renders without
 * suspending. main.tsx preloads the page of the first URL, so the first paint
 * already has the tool in place instead of an empty shell that fills in later
 * (a large layout shift on phones).
 */
export function lazyPage(load: () => Promise<{ default: ComponentType }>): LazyPage {
  let loaded: ComponentType | undefined;
  let pending: Promise<void> | undefined;
  const preload = () =>
    (pending ??= load().then(
      (m) => {
        loaded = m.default;
      },
      (err) => {
        pending = undefined; // allow a retry on the next navigation
        throw err;
      },
    ));
  const Lazy = lazy(() => preload().then(() => ({ default: loaded! })));
  // pick the component once per mount, so a re-render never swaps it and resets the page's state
  const Page = () => createElement(useState<ComponentType>(() => loaded ?? Lazy)[0]);
  return Object.assign(Page, { preload });
}
