import type { CSSProperties } from 'react';

/**
 * The colours the menus can have (chosen in «رنگبندی»): the main bar / rail (main) and the sub-menu bar / panel (deep, a little different so it
 * stands out). `light` colours get dark writing; `ink` overrides the writing colours for a cool white.
 */
export interface MenuTone {
  id: string;
  name: string;
  main: string;
  deep: string;
  /** the text of the open sub-menu tab (the tab is the page's own colour) */
  activeFg: string;
  light?: boolean;
  ink?: { fg: string; soft: string; hov: string; act: string; ind: string };
}

const COOL: NonNullable<MenuTone['ink']> = { fg: '#374151', soft: '#4B5563', hov: 'rgba(17, 24, 39, 0.05)', act: '#E8ECF2', ind: '#6B7280' };

export const MENU_TONES: MenuTone[] = [
  { id: 'white', name: 'سفید (پیش‌فرض)', main: '#FFFFFF', deep: '#F1F3F6', activeFg: '#374151', light: true, ink: COOL },
  { id: 'mist', name: 'مه‌آلود', main: '#EEF0F3', deep: '#E1E5EA', activeFg: '#374151', light: true, ink: COOL },
  { id: 'pearl', name: 'صدفی', main: '#EFEBE4', deep: '#E1DBD0', activeFg: '#3F3A33', light: true },
  { id: 'sky', name: 'آسمانی', main: '#E3EEF9', deep: '#D2E2F3', activeFg: '#2D5B87', light: true, ink: { ...COOL, fg: '#2F4A66', soft: '#3C5A7A', act: '#D2E2F3' } },
  { id: 'mint', name: 'نعنایی', main: '#E2F1E9', deep: '#CFE5D9', activeFg: '#2F6A52', light: true, ink: { ...COOL, fg: '#2F5646', soft: '#3A6A57', act: '#CFE5D9' } },
  { id: 'lavender', name: 'یاسی', main: '#EAE6F7', deep: '#DAD3F0', activeFg: '#51438F', light: true, ink: { ...COOL, fg: '#443A73', soft: '#554A87', act: '#DAD3F0' } },
  { id: 'rose', name: 'صورتی ملایم', main: '#F8E7EC', deep: '#F0D4DD', activeFg: '#8A3550', light: true, ink: { ...COOL, fg: '#6E2C42', soft: '#82384F', act: '#F0D4DD' } },
  { id: 'sand', name: 'شنی', main: '#F2EBDD', deep: '#E6DCC6', activeFg: '#6B5A2E', light: true, ink: { ...COOL, fg: '#58492A', soft: '#6B5A38', act: '#E6DCC6' } },
  { id: 'gray', name: 'خاکستری', main: '#6B7280', deep: '#4B5563', activeFg: '#374151' },
  { id: 'slate', name: 'دودی', main: '#475569', deep: '#334155', activeFg: '#334155' },
  { id: 'graphite', name: 'گرافیتی', main: '#3A3F47', deep: '#272B31', activeFg: '#1F2937' },
  { id: 'navy', name: 'سرمه‌ای', main: '#34476B', deep: '#243352', activeFg: '#243352' },
  { id: 'forest', name: 'سبز جنگلی', main: '#41695A', deep: '#2E4D41', activeFg: '#2E4D41' },
  { id: 'wine', name: 'شرابی', main: '#7C3A4B', deep: '#5E2937', activeFg: '#5E2937' },
  { id: 'theme', name: 'هم‌رنگ تم سایت', main: 'var(--theme-primary, #6E1B1B)', deep: 'color-mix(in srgb, var(--theme-primary, #6E1B1B) 84%, #000)', activeFg: 'var(--theme-primary, #6E1B1B)' },
];

export const MENU_TONE_KEY = 'menu_tone';
export const MENU_SOUND_KEY = 'menu_sound';
export const DEFAULT_MENU_TONE = 'white';
export const loadMenuTone = (): string => {
  try {
    const v = localStorage.getItem(MENU_TONE_KEY);
    return MENU_TONES.some((t) => t.id === v) ? (v as string) : DEFAULT_MENU_TONE;
  } catch {
    return DEFAULT_MENU_TONE;
  }
};

/** the CSS variables of one colour choice (the menu's style sheet reads them) */
export const menuToneVars = (id: string): CSSProperties => {
  const t = MENU_TONES.find((x) => x.id === id) || MENU_TONES[0];
  const v: Record<string, string> = { '--side-main': t.main, '--side-deep': t.deep, '--side-active-fg': t.activeFg };
  if (t.light) {
    const k = t.ink || { fg: '#3F3A33', soft: '#4A443B', hov: 'rgba(0, 0, 0, 0.06)', act: 'rgba(0, 0, 0, 0.09)', ind: '#6B6459' };
    v['--side-fg'] = k.fg;
    v['--side-fg-soft'] = k.soft;
    v['--side-hov'] = k.hov;
    v['--side-act-bg'] = k.act;
    v['--side-ind'] = k.ind;
  }
  return v as CSSProperties;
};
