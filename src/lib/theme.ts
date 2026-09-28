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
];

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
  
  root.setAttribute('data-theme', theme.id);
  
  if (document.body) {
    document.body.setAttribute('data-theme', theme.id);
    document.body.style.backgroundColor = theme.darkBg;
  }
};
