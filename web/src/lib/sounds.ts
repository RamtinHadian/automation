// Notification sounds: a set of pleasant melodies synthesised with Web Audio (nothing to download) and the playing of sounds an
// admin uploaded. Everything is scheduled on the audio clock, so it still plays on time when the window is hidden.

import { getToken } from './api';

export interface SoundPreset {
  id: string;
  name: string;
  description: string;
  notes: number[]; // Hz
  step: number; // seconds between notes
  wave: OscillatorType;
  decay: number; // seconds each note rings
  gain: number;
  glide?: number; // each note slides to this multiple of its pitch
  rich?: boolean; // add a soft octave and a glassy partial
}

export const SOUND_PRESETS: SoundPreset[] = [
  { id: 'bell', name: 'زنگوله', description: 'سه نت روشن و بالارونده', notes: [783.99, 1046.5, 1318.51], step: 0.13, wave: 'sine', decay: 1.3, gain: 0.5, rich: true },
  { id: 'formal', name: 'رسمی', description: 'چهار نت گرم و باوقار، مناسب نامه', notes: [659.25, 830.61, 987.77, 1318.51], step: 0.13, wave: 'sine', decay: 1.3, gain: 0.5, rich: true },
  { id: 'cheerful', name: 'شاد', description: 'سه نت سرزنده، مناسب وظیفه', notes: [880, 1108.73, 1318.51], step: 0.13, wave: 'sine', decay: 1.2, gain: 0.5, rich: true },
  { id: 'alert', name: 'هشدار', description: 'سه نت جلب‌توجه', notes: [987.77, 739.99, 987.77], step: 0.16, wave: 'sine', decay: 1.1, gain: 0.55, rich: true },
  { id: 'ring', name: 'زنگ تلفن', description: 'مثل زنگ تلفن', notes: [880, 659.25, 880, 659.25], step: 0.14, wave: 'sine', decay: 1.0, gain: 0.55, rich: true },
  { id: 'crystal', name: 'کریستال', description: 'جرنگ بلور، بسیار تمیز', notes: [1318.5, 1568, 2093, 2637], step: 0.09, wave: 'sine', decay: 1.0, gain: 0.4, rich: true },
  { id: 'marimba', name: 'ماریمبا', description: 'چوبی و گرم', notes: [523.25, 659.25, 783.99, 1046.5], step: 0.11, wave: 'triangle', decay: 0.55, gain: 0.7 },
  { id: 'harp', name: 'چنگ', description: 'آرپژ نرم و بلند', notes: [392, 523.25, 659.25, 783.99, 1046.5, 1318.5], step: 0.07, wave: 'sine', decay: 1.5, gain: 0.45, rich: true },
  { id: 'droplet', name: 'قطره', description: 'چکهٔ آب، کوتاه و آرام', notes: [1400, 1000], step: 0.07, wave: 'sine', decay: 0.4, gain: 0.6, glide: 0.62 },
  { id: 'pop', name: 'پاپ', description: 'یک تُق کوتاه', notes: [880], step: 0.1, wave: 'triangle', decay: 0.2, gain: 0.8, glide: 1.4 },
  { id: 'fanfare', name: 'فانفار', description: 'خبر خوب، برای موفقیت', notes: [523.25, 523.25, 523.25, 698.46, 659.25, 783.99], step: 0.11, wave: 'triangle', decay: 0.7, gain: 0.7 },
  { id: 'gentle', name: 'ملایم', description: 'دو نت آرام، بدون ترساندن', notes: [659.25, 783.99], step: 0.26, wave: 'sine', decay: 1.7, gain: 0.45, rich: true },
  { id: 'digital', name: 'دیجیتال', description: 'بوق‌های ریز و مدرن', notes: [1046.5, 1318.5, 1046.5, 1568], step: 0.08, wave: 'square', decay: 0.2, gain: 0.16 },
  { id: 'doorbell', name: 'زنگ در', description: 'دینگ‌دانگ', notes: [659.25, 523.25], step: 0.36, wave: 'sine', decay: 1.9, gain: 0.55, rich: true },
  { id: 'zen', name: 'ذن', description: 'عمیق و آرام', notes: [293.66, 440, 587.33], step: 0.22, wave: 'sine', decay: 2.2, gain: 0.55, rich: true },
];

export const NO_SOUND = 'none';
export const CUSTOM_PREFIX = 'custom:';

export const isCustom = (id: string) => id.startsWith(CUSTOM_PREFIX);
export const presetById = (id: string) => SOUND_PRESETS.find((p) => p.id === id);

/** Plays a built-in melody on the audio context (which must already be running). */
export function playPreset(c: AudioContext, id: string, volume: number) {
  const p = presetById(id);
  if (!p) return;
  const t0 = c.currentTime + 0.02;
  const master = c.createGain();
  master.gain.value = 0.55 * volume;
  // A little echo makes the sound soft and spacious.
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

  p.notes.forEach((freq, i) => {
    const start = t0 + i * p.step;
    const end = start + p.decay;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(p.gain, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(master);
    const partials = p.rich
      ? [
          { f: freq, type: p.wave, g: 1 },
          { f: freq * 2, type: 'sine' as OscillatorType, g: 0.22 },
          { f: freq * 2.76, type: 'triangle' as OscillatorType, g: 0.06 },
        ]
      : [{ f: freq, type: p.wave, g: 1 }];
    partials.forEach(({ f, type, g }) => {
      const osc = c.createOscillator();
      const og = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, start);
      if (p.glide) osc.frequency.exponentialRampToValueAtTime(f * p.glide, start + Math.min(p.decay, 0.25));
      og.gain.value = g;
      osc.connect(og);
      og.connect(gain);
      osc.start(start);
      osc.stop(end + 0.05);
    });
  });
  setTimeout(() => master.disconnect(), (p.notes.length * p.step + p.decay) * 1000 + 800);
}

// ---------- uploaded sounds ----------

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

/** Fetches an uploaded sound once and keeps it decoded in memory. */
export function loadCustomSound(c: AudioContext, id: string): Promise<AudioBuffer | null> {
  const key = id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : id;
  const have = buffers.get(key);
  if (have) return Promise.resolve(have);
  let p = loading.get(key);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`/api/sounds/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
        if (!res.ok) return null;
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        buffers.set(key, buf);
        return buf;
      } catch {
        return null;
      } finally {
        loading.delete(key);
      }
    })();
    loading.set(key, p);
  }
  return p;
}

export function forgetCustomSound(id: string) {
  buffers.delete(id.startsWith(CUSTOM_PREFIX) ? id.slice(CUSTOM_PREFIX.length) : id);
}

/** Plays an uploaded sound (at most the first 8 seconds of it). */
export async function playCustom(c: AudioContext, id: string, volume: number) {
  const buf = await loadCustomSound(c, id);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = Math.min(1, volume);
  src.connect(g);
  g.connect(c.destination);
  src.start(c.currentTime + 0.02, 0, Math.min(buf.duration, 8));
}
