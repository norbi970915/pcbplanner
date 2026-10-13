import { lazyPage } from '../lib/lazyPage';

/** Datasheet page of one laminate or solder mask; the page reads which one from the URL. */
export const MaterialPageRoute = lazyPage(() => import('./MaterialPage'));
