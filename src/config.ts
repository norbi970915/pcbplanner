export const APP_NAME = 'PCB Planner';
export const SITE_URL = 'https://www.pcbplanner.com';
export const TAGLINE = 'PCB impedance, stackup and design calculators';

/**
 * Operator and contact shown on the Privacy and Terms pages (GDPR Art. 13 controller identity).
 * The build refuses to prerender those pages while either value is empty.
 */
// Shown only on /privacy and /terms (both noindex). The address is split so it never appears whole
// in the HTML or the bundle; ContactEmail assembles it in the browser.
export const OPERATOR = { name: 'Buchmüller Norbert', email: { user: 'norbi970915', domain: 'gmail.com' }, country: 'Romania' };
export const LEGAL_UPDATED = '2026-10-14';
