export const ANALYTICS_ID = 'G-YJ44N72Z8H';
export const ANALYTICS_CONSENT_KEY = 'pcbplanner:analytics-consent';

export type AnalyticsChoice = 'accepted' | 'declined';

type GoogleWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

let tagLoaded = false;

export function readAnalyticsChoice(): AnalyticsChoice | null {
  try {
    const record = JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY) || 'null');
    return record?.choice === 'accepted' || record?.choice === 'declined' ? record.choice : null;
  } catch { return null; }
}

export function saveAnalyticsChoice(choice: AnalyticsChoice) {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, updatedAt: new Date().toISOString() }));
  } catch { /* storage unavailable; the choice still applies for this page */ }
}

export function isAnalyticsHost() {
  return window.location.hostname === 'www.pcbplanner.com' || window.location.hostname === 'pcbplanner.com';
}

export function enableAnalytics(): boolean {
  if (!isAnalyticsHost()) return false;
  (window as unknown as Record<string, unknown>)[`ga-disable-${ANALYTICS_ID}`] = false;
  const googleWindow = window as GoogleWindow;
  if (tagLoaded) {
    googleWindow.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    return true;
  }

  googleWindow.dataLayer = googleWindow.dataLayer || [];
  googleWindow.gtag = (...args: unknown[]) => { googleWindow.dataLayer?.push(args); };
  googleWindow.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });
  googleWindow.gtag('consent', 'update', { analytics_storage: 'granted' });
  googleWindow.gtag('js', new Date());
  googleWindow.gtag('config', ANALYTICS_ID, {
    send_page_view: false,
    page_location: window.location.origin + window.location.pathname,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}`;
  document.head.appendChild(script);
  tagLoaded = true;
  return true;
}

export function disableAnalytics(clearCookies = false) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${ANALYTICS_ID}`] = true;
  (window as GoogleWindow).gtag?.('consent', 'update', { analytics_storage: 'denied' });
  if (!clearCookies) return;
  const names = document.cookie.split(';').map(cookie => cookie.trim().split('=')[0])
    .filter(name => /^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    if (window.location.hostname.endsWith('pcbplanner.com')) {
      document.cookie = `${name}=; Max-Age=0; Path=/; Domain=pcbplanner.com; SameSite=Lax`;
    }
  }
}
