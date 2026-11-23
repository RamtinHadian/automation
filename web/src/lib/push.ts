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

/** What this device knows about notifications: for the «تشخیص این گوشی» button. */
export async function deviceReport() {
  const lines: { ok: boolean; text: string }[] = [];
  const ua = navigator.userAgent;
  const iosVer = /OS (\d+)[_.](\d+)/.exec(ua);
  lines.push({ ok: true, text: `دستگاه: ${isIos() ? 'آیفون/آیپد' : /Android/i.test(ua) ? 'اندروید' : /Windows/i.test(ua) ? 'ویندوز' : /Mac/i.test(ua) ? 'مک' : 'نامشخص'}${iosVer ? ` · iOS ${iosVer[1]}.${iosVer[2]}` : ''} · ${isStandalone() ? 'از آیکن صفحهٔ اصلی باز شده' : 'در مرورگر (نه از آیکن صفحهٔ اصلی)'}` });
  if (isIos() && !isStandalone()) lines.push({ ok: false, text: 'در آیفون اعلان فقط برای برنامه‌ای کار می‌کند که با «افزودن به صفحهٔ اصلی» ساخته شده و از همان آیکن باز می‌شود.' });
  if (isIos() && iosVer && Number(iosVer[1]) < 16) lines.push({ ok: false, text: 'نسخهٔ iOS باید ۱۶٫۴ یا بالاتر باشد.' });
  if (!pushSupported()) { lines.push({ ok: false, text: 'این مرورگر یا این حالت از اعلان وب پشتیبانی نمی‌کند.' }); return { lines, endpoint: '' }; }
  const perm = Notification.permission;
  lines.push({ ok: perm === 'granted', text: `اجازهٔ اعلان در همین برنامه: ${perm === 'granted' ? 'داده شده' : perm === 'denied' ? 'بسته است (از تنظیمات گوشی باز کنید)' : 'هنوز پرسیده نشده'}` });
  const reg = await navigator.serviceWorker.getRegistration();
  lines.push({ ok: !!reg?.active, text: `سرویس‌ورکر: ${reg?.active ? 'فعال' : 'فعال نیست'}` });
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  let host = '';
  if (sub) { try { host = new URL(sub.endpoint).host; } catch { host = ''; } }
  lines.push({ ok: !!sub, text: `اشتراک اعلان این دستگاه: ${sub ? `دارد (${host})` : 'ندارد'}` });
  if (sub) {
    try {
      const r = await api.pushKnown(sub.endpoint);
      lines.push({ ok: r.known, text: `سرور این اشتراک را ${r.known ? 'می‌شناسد' : 'نمی‌شناسد (دکمهٔ «ثبت دوباره» را بزنید)'}` });
    } catch {
      lines.push({ ok: false, text: 'ارتباط با سرور برای بررسی اشتراک برقرار نشد.' });
    }
  }
  try {
    const c = await caches.open('hoormand-push-log');
    const r = await c.match('/push-log.json');
    const j = r ? ((await r.json()) as { at: number; title: string; shown: boolean; error: string }) : null;
    const ago = j ? Math.max(0, Math.round((Date.now() - j.at) / 60000)) : 0;
    lines.push(j ? { ok: j.shown, text: `آخرین اعلانی که به همین دستگاه رسید: ${ago < 1 ? 'همین حالا' : `${ago} دقیقه پیش`} — ${j.shown ? 'نشان داده شد' : `نشان داده نشد${j.error ? ` (${j.error})` : ''}`}` } : { ok: false, text: 'هنوز هیچ اعلانی به همین دستگاه نرسیده است (یعنی اپل یا اینترنت گوشی آن را به دستگاه نرسانده).' });
  } catch {
    /* the note is optional */
  }
  return { lines, endpoint: sub?.endpoint || '' };
}

/** Forget this device's subscription and make a new one (a stale subscription is the usual reason a phone gets nothing). */
export async function resubscribe(): Promise<'ok' | 'denied' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported';
  const sub = await currentSubscription();
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  return enablePush();
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
