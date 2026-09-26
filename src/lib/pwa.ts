// Installable offline app: service worker registration (production builds only), the browser's
// install prompt, and the online/offline state for the status bar.
import { useSyncExternalStore } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let installEvent: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Chromium offers installation once the page has a service worker; keep the event for the menu
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    notify();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline support is optional; the site works without it
    });
  });
}

/** Shows the browser's install dialog, or null when the browser has not offered installation. */
export function useInstall(): (() => void) | null {
  const available = useSyncExternalStore(subscribe, () => installEvent !== null, () => false);
  if (!available) return null;
  return () => {
    const e = installEvent;
    if (!e) return;
    installEvent = null;
    notify();
    void e.prompt();
  };
}

const subscribeOnline = (l: () => void) => {
  window.addEventListener('online', l);
  window.addEventListener('offline', l);
  return () => {
    window.removeEventListener('online', l);
    window.removeEventListener('offline', l);
  };
};

export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
