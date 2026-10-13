import { lazyPage } from '../lib/lazyPage';

/** Layout-guideline page of one interface; the page reads which one from the URL. */
export const InterfacePageRoute = lazyPage(() => import('./InterfacePage'));
