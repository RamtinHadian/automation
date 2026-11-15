import { MENU_SOUND_KEY } from './menuTone';

/** is the soft pop of the vertical menu switched on (default: on; the choice is kept in this browser) */
export const menuSoundOn = (): boolean => {
  try {
    return localStorage.getItem(MENU_SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
};

let ctx: AudioContext | null = null;

/** a very small, quiet «pop» (a short falling tone), made in the browser: no sound file */
export function playMenuPop() {
  if (!menuSoundOn()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(640, t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.1);
  } catch {
    /* no sound is fine */
  }
}
