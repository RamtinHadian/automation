import { getToken } from './api';
import './desktop';

export type NotificationKind = 'file' | 'letter' | 'task' | 'alert';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  /** Short status shown as a badge, e.g. «فایل جدید», «جهت امضا», «در حال انجام». */
  label?: string;
  title: string;
  body: string;
  ref: { type: 'file' | 'letter' | 'task'; id: string } | null;
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

const NOTES: Record<NotificationKind, number[]> = {
  file: [783.99, 1046.5, 1318.51], // G5 C6 E6 – bright rising
  letter: [659.25, 830.61, 987.77, 1318.51], // E5 G#5 B5 E6 – warm and formal
  task: [880, 1108.73, 1318.51], // A5 C#6 E6 – cheerful
  alert: [987.77, 739.99, 987.77], // B5 F#5 B5 – attention
};

/** Returns false when the sound could not be played (muted, or the browser has not unlocked audio yet). */
export function playChime(kind: NotificationKind = 'file'): boolean {
  if (!isSoundEnabled()) return false;
  const c = getCtx();
  if (!c) return false;
  if (c.state !== 'running') void c.resume().catch(() => {});
  if (c.state !== 'running') return false;

  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = 0.55;
  // A little echo makes the bell sound soft and spacious.
  const delay = c.createDelay();
  delay.delayTime.value = 0.18;
  const feedback = c.createGain();
  feedback.gain.value = 0.3;
  const wet = c.createGain();
  wet.gain.value = 0.35;
  master.connect(c.destination);
  master.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(c.destination);

  NOTES[kind].forEach((freq, i) => {
    const start = t0 + i * 0.13;
    const end = start + 1.3;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.5, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(master);
    // Fundamental + soft octave and a tiny inharmonic partial give a glassy bell timbre.
    [
      { f: freq, type: 'sine' as OscillatorType, g: 1 },
      { f: freq * 2, type: 'sine' as OscillatorType, g: 0.22 },
      { f: freq * 2.76, type: 'triangle' as OscillatorType, g: 0.06 },
    ].forEach(({ f, type, g }) => {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.type = type;
      osc.frequency.value = f;
      og.gain.value = g;
      osc.connect(og);
      og.connect(gain);
      osc.start(start);
      osc.stop(end + 0.05);
    });
  });
  setTimeout(() => master.disconnect(), 4000);
  return true;
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
  // The Windows app shows its own native notification (works on any address, with the system sound).
  if (window.desktop) {
    window.desktop.notify(n);
    return;
  }
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

export function startNotifyStream(onNotification: (n: AppNotification) => void, onConnected: () => void) {
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
                onNotification(JSON.parse(line.slice(6)));
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
