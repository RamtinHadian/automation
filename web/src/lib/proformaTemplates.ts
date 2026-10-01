import { ProformaSectionId, ProformaTemplate } from '../types';

export const SECTION_LABELS: Record<ProformaSectionId, string> = {
  meta: 'شماره و تاریخ‌ها',
  parties: 'فروشنده و خریدار',
  items: 'جدول اقلام',
  totals: 'جمع کل و مبلغ به حروف',
  terms: 'شرایط و اطلاعات پرداخت',
  signatures: 'مهر و امضا',
};

export const HEADER_LABELS = { logo: 'لوگو', company: 'نام و مشخصات شرکت', title: 'عنوان «پیش‌فاکتور»' } as const;

const BASE: ProformaTemplate = {
  presetId: 'classic',
  colors: { primary: '#6E1B1B', accent: '#D34A32', tableHead: '#3A241F', tableHeadText: '#FFFFFF', paper: '#FFFFFF', soft: '#FAF5F1', text: '#2A1F1C' },
  headerStyle: 'band',
  headerOrder: ['logo', 'company', 'title'],
  logoSize: 18,
  showLogo: true,
  contact: { address: true, phone: true, economicCode: false, website: false },
  title: 'پیش‌فاکتور فروش',
  titleEn: 'PROFORMA INVOICE',
  sections: [
    { id: 'meta', visible: true },
    { id: 'parties', visible: true },
    { id: 'items', visible: true },
    { id: 'totals', visible: true },
    { id: 'terms', visible: true },
    { id: 'signatures', visible: true },
  ],
  tableStyle: 'striped',
  radius: 10,
  fontSize: 12,
  totalsAlign: 'start',
  footerText: '',
  showFooterContact: true,
  numberFormat: 'PF-{YYYY}-{NNNN}',
  numberStart: 1,
};

type Look = Partial<Omit<ProformaTemplate, 'colors'>> & { colors?: Partial<ProformaTemplate['colors']> };

export const PROFORMA_PRESETS: { id: string; name: string; look: Look }[] = [
  { id: 'classic', name: 'کلاسیک زرشکی', look: {} },
  {
    id: 'modern-blue',
    name: 'مدرن آبی',
    look: { colors: { primary: '#1D4ED8', accent: '#38BDF8', tableHead: '#0F172A', soft: '#F1F5F9', text: '#0F172A' }, headerStyle: 'boxed', radius: 14 },
  },
  {
    id: 'green',
    name: 'اداری سبز',
    look: { colors: { primary: '#166534', accent: '#65A30D', tableHead: '#14532D', soft: '#F3F8F1', text: '#18281C' }, tableStyle: 'lined', radius: 6, totalsAlign: 'end' },
  },
  {
    id: 'minimal',
    name: 'مینیمال سیاه‌وسفید',
    look: { colors: { primary: '#111827', accent: '#6B7280', tableHead: '#111827', soft: '#F9FAFB', text: '#111827' }, headerStyle: 'plain', tableStyle: 'lined', radius: 0, fontSize: 11.5 },
  },
  {
    id: 'gold',
    name: 'طلایی لوکس',
    look: { colors: { primary: '#7A5C12', accent: '#C9A227', tableHead: '#2B2110', paper: '#FFFEFA', soft: '#FBF6E6', text: '#2B2110' }, headerStyle: 'boxed', tableStyle: 'grid', radius: 4 },
  },
  {
    id: 'violet',
    name: 'بنفش خلاق',
    look: { colors: { primary: '#5B21B6', accent: '#EC4899', tableHead: '#3B0764', soft: '#F6F0FD', text: '#24103F' }, headerOrder: ['logo', 'title', 'company'], radius: 18, totalsAlign: 'end' },
  },
];

export const presetTemplate = (id: string): ProformaTemplate => {
  const p = PROFORMA_PRESETS.find((x) => x.id === id) || PROFORMA_PRESETS[0];
  return { ...BASE, ...p.look, colors: { ...BASE.colors, ...(p.look.colors || {}) }, presetId: p.id, sections: BASE.sections.map((s) => ({ ...s })) };
};

/** Fills anything missing (older saved templates, new fields) so the generator can rely on a complete object. */
export function normalizeTemplate(t?: Partial<ProformaTemplate> | null): ProformaTemplate {
  const base = presetTemplate(t?.presetId || 'classic');
  if (!t) return base;
  const known = base.sections.map((s) => s.id);
  const given = (t.sections || []).filter((s) => known.includes(s.id));
  const sections = [...given, ...base.sections.filter((s) => !given.some((g) => g.id === s.id))];
  const order = (t.headerOrder || []).filter((h, i, a) => ['logo', 'company', 'title'].includes(h) && a.indexOf(h) === i);
  const headerOrder = [...order, ...base.headerOrder.filter((h) => !order.includes(h))];
  return {
    ...base,
    ...t,
    colors: { ...base.colors, ...(t.colors || {}) },
    contact: { ...base.contact, ...(t.contact || {}) },
    sections,
    headerOrder,
  };
}

export interface ProformaPalette {
  id: string;
  name: string;
  colors: ProformaTemplate['colors'];
}

const pal = (id: string, name: string, primary: string, accent: string, tableHead: string, soft: string, text: string, paper = '#FFFFFF'): ProformaPalette => ({
  id,
  name,
  colors: { primary, accent, tableHead, tableHeadText: '#FFFFFF', paper, soft, text },
});

/** Colour palettes for the designer: the colours of the six ready-made samples plus six more. */
export const PROFORMA_PALETTES: ProformaPalette[] = [
  ...PROFORMA_PRESETS.map((p) => ({ id: p.id, name: p.name, colors: { ...presetTemplate(p.id).colors } })),
  pal('teal', 'فیروزه‌ای', '#0F766E', '#14B8A6', '#134E4A', '#F0FDFA', '#0B2B29'),
  pal('rose', 'گل‌بهی', '#BE185D', '#F472B6', '#4A0D2B', '#FDF2F8', '#3B0A21'),
  pal('sunset', 'نارنجی غروب', '#C2410C', '#FB923C', '#431407', '#FFF7ED', '#2B1208'),
  pal('olive', 'زیتونی', '#4D7C0F', '#A3E635', '#1A2E05', '#F7FEE7', '#17260A'),
  pal('indigo', 'نیلی', '#4338CA', '#818CF8', '#1E1B4B', '#EEF2FF', '#14123A'),
  pal('mocha', 'موکا و قهوه‌ای', '#7C4A2D', '#C9A07A', '#2B1A10', '#FAF4EE', '#2A1A10'),
];
