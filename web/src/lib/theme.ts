export interface ColorTheme {
  id: string;
  name: string;
  description: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  accent: string;
  darkBg: string;
  darkBgVia: string;
  darkBgEnd: string;
  darkBgSub: string;
  darkBorder: string;
  lightBg: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  swatchColors: [string, string, string, string];
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: 'cherry',
    name: 'یاقوتی و سفالی (پیش‌فرض)',
    description: 'تم اصیل و گرم پالت سازمانی با سرخ یاقوتی و رنگ سفالی',
    primary: '#6E1B1B',
    primaryHover: '#581717',
    secondary: '#D34A32',
    accent: '#C98B6A',
    darkBg: '#3A241F',
    darkBgVia: '#4A2620',
    darkBgEnd: '#2E1A16',
    darkBgSub: '#2E1A16',
    darkBorder: '#563D34',
    lightBg: '#FAF5F1',
    border: '#EBDBCE',
    badgeBg: '#F6D9CD',
    badgeText: '#6E1B1B',
    swatchColors: ['#6E1B1B', '#D34A32', '#C98B6A', '#3A241F'],
  },
  {
    id: 'ocean',
    name: 'اقیانوس و لاجوردی',
    description: 'طراحی مدرن و شفاف سازمانی با آبی درباری و نیلی',
    primary: '#1E40AF',
    primaryHover: '#1D4ED8',
    secondary: '#0284C7',
    accent: '#38BDF8',
    darkBg: '#0B192C',
    darkBgVia: '#1E293B',
    darkBgEnd: '#0F172A',
    darkBgSub: '#1E293B',
    darkBorder: '#334155',
    lightBg: '#F0F7FF',
    border: '#BFDBFE',
    badgeBg: '#DBEAFE',
    badgeText: '#1E40AF',
    swatchColors: ['#1E40AF', '#0284C7', '#38BDF8', '#0B192C'],
  },
  {
    id: 'purple',
    name: 'بنفش سلطنتی و نئون',
    description: 'استایل لوکس و تکنولوژی با بنفش سلطنتی و ارغوانی',
    primary: '#6D28D9',
    primaryHover: '#5B21B6',
    secondary: '#8B5CF6',
    accent: '#A78BFA',
    darkBg: '#1E1B4B',
    darkBgVia: '#2E1065',
    darkBgEnd: '#1E1B4B',
    darkBgSub: '#2E1065',
    darkBorder: '#4C1D95',
    lightBg: '#F5F3FF',
    border: '#DDD6FE',
    badgeBg: '#EDE9FE',
    badgeText: '#6D28D9',
    swatchColors: ['#6D28D9', '#8B5CF6', '#A78BFA', '#1E1B4B'],
  },
  {
    id: 'emerald',
    name: 'زمردی و جنگل سبز',
    description: 'حس پایداری و آرامش با سبز زمردی و نعنایی',
    primary: '#065F46',
    primaryHover: '#044E39',
    secondary: '#059669',
    accent: '#34D399',
    darkBg: '#062C22',
    darkBgVia: '#064E3B',
    darkBgEnd: '#022C22',
    darkBgSub: '#064E3B',
    darkBorder: '#047857',
    lightBg: '#ECFDF5',
    border: '#A7F3D0',
    badgeBg: '#D1FAE5',
    badgeText: '#065F46',
    swatchColors: ['#065F46', '#059669', '#34D399', '#062C22'],
  },
  {
    id: 'amber',
    name: 'کهربا و غروب آفتاب',
    description: 'انرژی‌بخش و متمایز با نارنجی کهربایی و برنز طلایی',
    primary: '#B45309',
    primaryHover: '#92400E',
    secondary: '#EA580C',
    accent: '#F59E0B',
    darkBg: '#291809',
    darkBgVia: '#3E2310',
    darkBgEnd: '#1C0F05',
    darkBgSub: '#3E2310',
    darkBorder: '#78350F',
    lightBg: '#FFFBEB',
    border: '#FDE68A',
    badgeBg: '#FEF3C7',
    badgeText: '#B45309',
    swatchColors: ['#B45309', '#EA580C', '#F59E0B', '#291809'],
  },
  {
    id: 'midnight',
    name: 'میدنایت و خاکستری ذغالی',
    description: 'تم رسمی و شیک با خاکستری سربی و ذغالی تیره',
    primary: '#334155',
    primaryHover: '#1E293B',
    secondary: '#475569',
    accent: '#64748B',
    darkBg: '#0F172A',
    darkBgVia: '#1E293B',
    darkBgEnd: '#020617',
    darkBgSub: '#1E293B',
    darkBorder: '#334155',
    lightBg: '#F8FAFC',
    border: '#CBD5E1',
    badgeBg: '#E2E8F0',
    badgeText: '#1E293B',
    swatchColors: ['#334155', '#475569', '#64748B', '#0F172A'],
  },
  {
    id: 'rose',
    name: 'گل‌بهی و رز',
    description: 'تم گرم و دوستانه با صورتی تیره و رز',
    primary: '#BE185D',
    primaryHover: '#9D174D',
    secondary: '#EC4899',
    accent: '#F472B6',
    darkBg: '#4A0D2B',
    darkBgVia: '#5B1236',
    darkBgEnd: '#2F0719',
    darkBgSub: '#3A0A22',
    darkBorder: '#6B2145',
    lightBg: '#FDF2F8',
    border: '#FBCFE8',
    badgeBg: '#FCE7F3',
    badgeText: '#9D174D',
    swatchColors: ['#BE185D', '#EC4899', '#F472B6', '#4A0D2B'],
  },
  {
    id: 'teal',
    name: 'فیروزه‌ای و سبزآبی',
    description: 'تم تازه و آرام با فیروزه‌ای و سبزآبی تیره',
    primary: '#0F766E',
    primaryHover: '#115E59',
    secondary: '#14B8A6',
    accent: '#2DD4BF',
    darkBg: '#042F2E',
    darkBgVia: '#134E4A',
    darkBgEnd: '#021F1E',
    darkBgSub: '#0B3B38',
    darkBorder: '#1F5F5B',
    lightBg: '#F0FDFA',
    border: '#99F6E4',
    badgeBg: '#CCFBF1',
    badgeText: '#115E59',
    swatchColors: ['#0F766E', '#14B8A6', '#2DD4BF', '#042F2E'],
  },
  {
    id: 'sunset',
    name: 'نارنجی غروب',
    description: 'تم پرانرژی با نارنجی سوخته و رنگ غروب',
    primary: '#C2410C',
    primaryHover: '#9A3412',
    secondary: '#F97316',
    accent: '#FB923C',
    darkBg: '#431407',
    darkBgVia: '#7C2D12',
    darkBgEnd: '#2B0D04',
    darkBgSub: '#3A1206',
    darkBorder: '#7C3A1B',
    lightBg: '#FFF7ED',
    border: '#FED7AA',
    badgeBg: '#FFEDD5',
    badgeText: '#9A3412',
    swatchColors: ['#C2410C', '#F97316', '#FB923C', '#431407'],
  },
  {
    id: 'olive',
    name: 'زیتونی و سبز خاکی',
    description: 'تم طبیعی و آرام با سبز زیتونی',
    primary: '#4D7C0F',
    primaryHover: '#3F6212',
    secondary: '#84CC16',
    accent: '#A3E635',
    darkBg: '#1A2E05',
    darkBgVia: '#365314',
    darkBgEnd: '#0F1C03',
    darkBgSub: '#243B0A',
    darkBorder: '#3F6212',
    lightBg: '#F7FEE7',
    border: '#D9F99D',
    badgeBg: '#ECFCCB',
    badgeText: '#3F6212',
    swatchColors: ['#4D7C0F', '#84CC16', '#A3E635', '#1A2E05'],
  },
  {
    id: 'indigo',
    name: 'نیلی و آبی عمیق',
    description: 'تم رسمی و مطمئن با نیلی تیره',
    primary: '#4338CA',
    primaryHover: '#3730A3',
    secondary: '#6366F1',
    accent: '#818CF8',
    darkBg: '#1E1B4B',
    darkBgVia: '#312E81',
    darkBgEnd: '#0F0D2E',
    darkBgSub: '#272463',
    darkBorder: '#3F3C8F',
    lightBg: '#EEF2FF',
    border: '#C7D2FE',
    badgeBg: '#E0E7FF',
    badgeText: '#3730A3',
    swatchColors: ['#4338CA', '#6366F1', '#818CF8', '#1E1B4B'],
  },
  {
    id: 'mocha',
    name: 'موکا و قهوه‌ای',
    description: 'تم گرم و کلاسیک با قهوه‌ای و رنگ شیری',
    primary: '#7C4A2D',
    primaryHover: '#633A22',
    secondary: '#A8673E',
    accent: '#C9A07A',
    darkBg: '#2B1A10',
    darkBgVia: '#3D2616',
    darkBgEnd: '#1B0F08',
    darkBgSub: '#2F1D12',
    darkBorder: '#5A3A28',
    lightBg: '#FAF4EE',
    border: '#E7D5C4',
    badgeBg: '#F1E2D3',
    badgeText: '#633A22',
    swatchColors: ['#7C4A2D', '#A8673E', '#C9A07A', '#2B1A10'],
  },
];

// 12 more colour sets (24 in all). Each one is built from one main hue so the whole interface (buttons, borders, dark mode, badges) stays in tune.
const hex = (h: number, sat: number, l: number) => {
  const a = (sat / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
};
const buildTheme = (id: string, name: string, description: string, h: number, sat: number, secondaryHue: number, secondarySat = 70): ColorTheme => {
  const primary = hex(h, sat, 32);
  const secondary = hex(secondaryHue, secondarySat, 48);
  const accent = hex(secondaryHue, Math.min(sat, 65), 68);
  const darkBg = hex(h, Math.min(sat, 45), 13);
  return {
    id, name, description, primary, primaryHover: hex(h, sat, 26), secondary, accent,
    darkBg, darkBgVia: hex(h, Math.min(sat, 42), 18), darkBgEnd: hex(h, Math.min(sat, 45), 9), darkBgSub: hex(h, Math.min(sat, 42), 11), darkBorder: hex(h, Math.min(sat, 28), 26),
    lightBg: hex(h, Math.min(sat, 60) + 10, 97), border: hex(h, Math.min(sat, 45), 87), badgeBg: hex(h, Math.min(sat + 5, 70), 92), badgeText: primary,
    swatchColors: [primary, secondary, accent, darkBg],
  };
};
COLOR_THEMES.push(
  buildTheme('crimson', 'سرخ کارمین و مرجانی', 'تم پرانرژی و جسور با سرخ کارمین و مرجانی', 350, 70, 14),
  buildTheme('coral', 'مرجانی و هلویی', 'تم گرم و دوستانه با مرجانی و هلویی', 12, 68, 28),
  buildTheme('gold', 'طلایی و عسلی', 'تم شاد و درخشان با طلایی و عسلی', 40, 75, 28),
  buildTheme('lime', 'لیمویی و سبز جنگلی', 'تم تازه و پرطراوت با سبز لیمویی و جنگلی', 100, 60, 150),
  buildTheme('jade', 'یشمی و نعنایی', 'تم آرام و طبیعی با سبز یشمی و نعنایی', 158, 62, 178),
  buildTheme('aqua', 'آکوا و فیروزه‌ای', 'تم خنک و شفاف با آبی آکوا و فیروزه‌ای', 188, 78, 168),
  buildTheme('sky', 'آسمانی و آبی روشن', 'تم سبک و روشن با آسمانی و آبی دریایی', 205, 80, 224),
  buildTheme('navy', 'سرمه‌ای و نقره‌ای', 'تم رسمی و باوقار با سرمه‌ای و خاکستری نقره‌ای', 224, 55, 215, 25),
  buildTheme('violet', 'یاسی و بنفش ملایم', 'تم لطیف و آرام با یاسی و بنفش ملایم', 268, 50, 285),
  buildTheme('magenta', 'سرخابی و ارغوانی', 'تم پرجنب‌وجوش با سرخابی و ارغوانی', 320, 62, 340),
  buildTheme('slate', 'خاکستری و آبی فولادی', 'تم ساده و حرفه‌ای با خاکستری و آبی فولادی', 214, 18, 205, 45),
  buildTheme('graphite', 'گرافیتی و نارنجی', 'تم مدرن و تیره با گرافیتی و نارنجی', 215, 12, 24, 85),
);

/** Hue (0-360) of a #rrggbb colour. */
const hueOf = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

export const applyTheme = (themeId: string) => {
  const theme = COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0];
  const root = document.documentElement;
  
  root.style.setProperty('--theme-primary', theme.primary);
  root.style.setProperty('--theme-primary-hover', theme.primaryHover);
  root.style.setProperty('--theme-secondary', theme.secondary);
  root.style.setProperty('--theme-accent', theme.accent);
  root.style.setProperty('--theme-dark-bg', theme.darkBg);
  root.style.setProperty('--theme-dark-bg-via', theme.darkBgVia);
  root.style.setProperty('--theme-dark-bg-end', theme.darkBgEnd);
  root.style.setProperty('--theme-dark-bg-sub', theme.darkBgSub);
  root.style.setProperty('--theme-dark-border', theme.darkBorder);
  root.style.setProperty('--theme-light-bg', theme.lightBg);
  root.style.setProperty('--theme-border', theme.border);
  root.style.setProperty('--theme-badge-bg', theme.badgeBg);
  root.style.setProperty('--theme-badge-text', theme.badgeText);
  
  // the Hoormand logo takes the colour of the theme: its blue is turned to the hue of the theme's main colour
  const h = hueOf(theme.primary);
  root.style.setProperty('--logo-hue', `${Math.round(h - 220)}deg`);
  root.style.setProperty('--word-hue', `${Math.round(h - 255)}deg`);

  root.setAttribute('data-theme', theme.id);
  
  if (document.body) {
    document.body.setAttribute('data-theme', theme.id);
    document.body.style.backgroundColor = theme.darkBg;
  }
};
