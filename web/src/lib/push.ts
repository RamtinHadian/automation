import { api } from './api';

// Web Push: lets the phone show a notification (with the system sound) even when the app is closed.
// Browsers only allow this on HTTPS (or localhost); on iPhone the app must also be added to the home screen.

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  typeof Notification !== 'undefined';

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask for permission (must be called from a tap) and register this device for push. */
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  await registerServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.pushKey();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  }
  await api.pushSubscribe(sub.toJSON());
  return 'ok';
}

/** After login: if this device already allowed notifications, make sure the server knows the subscription. */
export async function syncPushIfAllowed() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    await registerServiceWorker();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await api.pushKey();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    }
    await api.pushSubscribe(sub.toJSON());
  } catch {
    /* best effort */
  }
}

/** On logout: stop this device from receiving the previous user's notifications. */
export async function disablePush() {
  try {
    const sub = await currentSubscription();
    if (sub) {
      await api.pushUnsubscribe(sub.endpoint).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* best effort */
  }
}

// ---------- automatic opt-in ----------
// Browsers only show the permission question after a tap or key press, so the first interaction after login asks for it
// once (and registers push when the browser supports it). Someone who switched notifications off in the bell is not asked again.

const OPTOUT_KEY = 'notify_optout_v1';
export const setNotifyOptOut = (on: boolean) => {
  try {
    if (on) localStorage.setItem(OPTOUT_KEY, '1');
    else localStorage.removeItem(OPTOUT_KEY);
  } catch {
    /* storage unavailable */
  }
};
const optedOut = () => {
  try {
    return localStorage.getItem(OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
};

export function installAutoNotifyOptIn() {
  // Plain HTTP cannot show system notifications.
  if (typeof Notification === 'undefined' || !window.isSecureContext) return () => {};
  const events = ['pointerup', 'click', 'keydown', 'touchend'] as const;
  const off = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
  async function onGesture() {
    off();
    if (optedOut() || Notification.permission !== 'default') return;
    try {
      if (pushSupported()) await enablePush();
      else await Notification.requestPermission();
    } catch {
      /* the person can still switch it on in the bell */
    }
  }
  events.forEach((e) => window.addEventListener(e, onGesture, true));
  return off;
}
