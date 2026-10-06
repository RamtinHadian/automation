import { getToken } from './api';
import { NotifySettings } from '../types';
import { DEFAULT_NOTIFY, inQuietHours, resolveRule } from './notifyConfig';
import { isCustom, loadCustomSound, NO_SOUND, playCustom, playPreset } from './sounds';

export type NotificationKind = 'file' | 'letter' | 'task' | 'alert' | 'call' | 'chat';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  /** Short status shown as a badge, e.g. «فایل جدید», «جهت امضا», «در حال انجام». */
  label?: string;
  title: string;
  body: string;
  ref: { type: 'file' | 'letter' | 'task' | 'report' | 'customer' | 'deal' | 'chat' | 'phone' | 'leave'; id: string } | null;
  createdAt: string;
  read: boolean;
}

// ---------- sound ----------
// The chime is synthesised with Web Audio (no asset to download) and scheduled on the audio clock rather
// than with timers, so it still plays on time when the window is minimised or hidden behind others.

const SOUND_KEY = 'notif_sound_v1';
let ctx: AudioContext | null = null;

export const isSoundEnabled = () => {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setSoundEnabled = (on: boolean) => {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
};

const getCtx = () => {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
};

/**
 * Browsers only allow sound after a user gesture; the first tap/click/keypress unlocks it for the whole session.
 * Phones do not count `pointerdown` as a gesture, so touchend / click / pointerup are listened to as well, and the
 * audio is resumed again whenever the window comes back to the front.
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

export function installAudioUnlock() {
  const unlock = () => {
    const c = getCtx();
    if (c && c.state !== 'running') void c.resume().catch(() => {});
  };
  const onVisible = () => {
    if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  };
  UNLOCK_EVENTS.forEach((e) => window.addEventListener(e, unlock, true));
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    UNLOCK_EVENTS.forEach((e) => window.removeEventListener(e, unlock, true));
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}

export const isAudioReady = () => !!ctx && ctx.state === 'running';

// The organisation's choices (sounds, volume, quiet hours...) come from the admin settings.
let cfg: NotifySettings | undefined;

export function setNotifyConfig(c: NotifySettings | undefined) {
  cfg = c;
}
export const getNotifyConfig = () => cfg;

/** The rule that applies to one notification. */
export const ruleFor = (n: Pick<AppNotification, 'kind' | 'label'>) => resolveRule(cfg, n.kind, n.label);

/** Plays one sound by id (a built-in melody, an uploaded one or silence). Returns false when nothing could be played. */
export function playSound(soundId: string, volume?: number): boolean {
  if (!isSoundEnabled() || soundId === NO_SOUND) return false;
  const c = getCtx();
  if (!c) return false;
  const vol = volume ?? cfg?.volume ?? DEFAULT_NOTIFY.volume;
  const run = () => {
    if (isCustom(soundId)) void playCustom(c, soundId, vol);
    else playPreset(c, soundId, vol);
  };
  if (c.state !== 'running') {
    // The browser may have suspended the audio after a while; wake it and play as soon as it is running.
    void c.resume().then(() => { if (c.state === 'running') run(); }).catch(() => {});
    return false;
  }
  run();
  return true;
}

/** Makes uploaded sounds ready before they are needed (the first play would otherwise wait for the download). */
export function preloadSounds(ids: string[]) {
  const c = getCtx();
  if (!c) return;
  ids.filter(isCustom).forEach((id) => void loadCustomSound(c, id));
}

/** The sound of a notification, honouring the organisation's rule and quiet hours. */
export function playForNotification(n: Pick<AppNotification, 'kind' | 'label'>): boolean {
  const r = ruleFor(n);
  if (!r.enabled || inQuietHours(cfg)) return false;
  return playSound(r.sound);
}

/** Returns false when the sound could not be played (muted, or the browser has not unlocked audio yet). */
export function playChime(kind: NotificationKind = 'file'): boolean {
  return playSound(resolveRule(cfg, kind).sound);
}

// ---------- system (OS level) notifications ----------
// These pop up over other windows and play the system sound. Browsers only allow them on HTTPS or localhost.

export const osNotificationsSupported = () => typeof Notification !== 'undefined' && (window.isSecureContext ?? false);
export const osPermission = (): NotificationPermission | 'unsupported' =>
  osNotificationsSupported() ? Notification.permission : 'unsupported';

export async function requestOsPermission() {
  if (!osNotificationsSupported()) return 'unsupported' as const;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showOsNotification(n: AppNotification, onClick: () => void) {
  const rule = ruleFor(n);
  if (!rule.enabled || !rule.os) return;
  if (osPermission() !== 'granted') return;
  try {
    const os = new Notification(n.title, { body: n.body, tag: n.id, lang: 'fa', dir: 'rtl', requireInteraction: false });
    os.onclick = () => {
      window.focus();
      onClick();
      os.close();
    };
  } catch {
    /* some browsers only allow notifications through a service worker */
  }
}

// ---------- title flashing while the window is not in front ----------

let baseTitle = '';
let flashTimer: ReturnType<typeof setInterval> | null = null;

export function flashTitle(text: string) {
  if (!document.hidden) return;
  if (!baseTitle) baseTitle = document.title;
  if (flashTimer) clearInterval(flashTimer);
  let on = false;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? `🔔 ${text}` : baseTitle;
  }, 1000);
  const stop = () => {
    if (document.hidden) return;
    if (flashTimer) clearInterval(flashTimer);
    flashTimer = null;
    if (baseTitle) document.title = baseTitle;
    baseTitle = '';
    document.removeEventListener('visibilitychange', stop);
  };
  document.addEventListener('visibilitychange', stop);
}

// ---------- live stream from the server ----------

export function startNotifyStream(onNotification: (n: AppNotification) => void, onConnected: () => void, onBeat?: () => void) {
  const controller = new AbortController();
  const { signal } = controller;
  void (async () => {
    let backoff = 1000;
    while (!signal.aborted) {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch('/api/notify/stream', { headers: { Authorization: `Bearer ${token}` }, signal });
        if (res.status === 401) return;
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        backoff = 1000;
        onBeat?.();
        onConnected();
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = block.split('\n').find((l) => l.startsWith('data: '));
            if (line) {
              try {
                const msg = JSON.parse(line.slice(6));
                onBeat?.();
                if (msg && msg.id) onNotification(msg);
              } catch {
                /* ignore malformed message */
              }
            }
          }
        }
      } catch {
        if (signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 15000);
    }
  })();
  return () => controller.abort();
}
