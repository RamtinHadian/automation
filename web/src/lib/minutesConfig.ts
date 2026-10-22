import { Minutes, MinutesConfig, MinutesDesign, MinutesNumbering, MinutesType, SystemSettings } from '../types';
import { isoToJalaliParts, todayIso } from './taskDates';
import { toPersianDigits } from './jalali';

const ALL_OFF = { attendees: false, agenda: false, discussion: false, decisions: false, nextMeeting: false, copies: false, parties: false, goods: false };

/** The sorts of minutes that come with the system (the administrator can change their texts and parts, and add more). */
export const BUILTIN_MINUTES_TYPES: MinutesType[] = [
  {
    id: 'general',
    title: 'جلسهٔ عمومی / هماهنگی',
    printTitle: 'صورتجلسه',
    prefix: 'ص‌ج',
    intro: 'جلسهٔ {{title}} در تاریخ {{date}}{{time}}{{place}} با حضور {{count}} نفر از اعضا و دعوت‌شدگان تشکیل شد و مطالب زیر مورد بحث و تصمیم قرار گرفت.',
    closing: 'این صورتجلسه در {{decisions}} بند مصوبه تنظیم شد و به امضای رئیس و دبیر جلسه و حاضرین رسید.',
    sections: { ...ALL_OFF, attendees: true, agenda: true, discussion: true, decisions: true, nextMeeting: true, copies: true },
    partyLabels: ['طرف اول', 'طرف دوم'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'توضیحات',
    conditionsLabel: 'توضیحات',
    fields: [],
    defaultAgenda: [''],
    defaultConditions: '',
    signs: ['دبیر جلسه', 'رئیس جلسه'],
    builtin: true,
    active: true,
  },
  {
    id: 'delivery',
    title: 'تحویل کالا',
    printTitle: 'صورتجلسه تحویل کالا',
    prefix: 'ت‌ک',
    intro: 'در تاریخ {{date}}{{time}}{{place}} کالاهای مندرج در جدول زیر توسط تحویل‌دهنده به تحویل‌گیرنده تحویل شد و پس از بررسی، صورتجلسه حاضر تنظیم گردید.',
    closing: 'کالاهای فوق با مشخصات بالا تحویل و تحویل‌گیرنده رسید آن را اعلام کرد. این صورتجلسه در {{copies}} نسخه تنظیم و به امضای طرفین رسید.',
    sections: { ...ALL_OFF, parties: true, goods: true, attendees: false, copies: true },
    partyLabels: ['تحویل‌دهنده', 'تحویل‌گیرنده'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'وضعیت / ملاحظات',
    conditionsLabel: 'شرایط و ملاحظات تحویل',
    fields: [
      { id: 'invoice', label: 'شمارهٔ فاکتور / حواله', kind: 'text' },
      { id: 'order', label: 'شمارهٔ سفارش / قرارداد', kind: 'text' },
      { id: 'driver', label: 'نام راننده / وسیلهٔ حمل', kind: 'text' },
    ],
    defaultAgenda: [],
    defaultConditions: 'کالاها سالم، بدون آسیب ظاهری و مطابق فاکتور / سفارش تحویل شد.',
    signs: ['تحویل‌دهنده', 'تحویل‌گیرنده', 'شاهد / انباردار'],
    builtin: true,
    active: true,
  },
  {
    id: 'handover',
    title: 'تحویل و تحول (مسئولیت یا پروژه)',
    printTitle: 'صورتجلسه تحویل و تحول',
    prefix: 'ت‌ت',
    intro: 'در تاریخ {{date}}{{time}}{{place}} مسئولیت، اسناد و موارد مندرج زیر از طرف اول به طرف دوم تحویل شد و صورتجلسه حاضر تنظیم گردید.',
    closing: 'طرفین صحت موارد بالا را تأیید می‌کنند. این صورتجلسه در {{copies}} نسخه تنظیم و امضا شد.',
    sections: { ...ALL_OFF, parties: true, discussion: true, decisions: true, copies: true },
    partyLabels: ['تحویل‌دهنده', 'تحویل‌گیرنده'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'توضیحات',
    conditionsLabel: 'توضیحات',
    fields: [{ id: 'subject', label: 'موضوع تحویل (پروژه / سمت)', kind: 'text' }],
    defaultAgenda: [],
    defaultConditions: '',
    signs: ['تحویل‌دهنده', 'تحویل‌گیرنده', 'تأییدکننده'],
    builtin: true,
    active: true,
  },
  {
    id: 'customer',
    title: 'جلسه با مشتری',
    printTitle: 'صورتجلسه',
    prefix: 'ص‌م',
    intro: 'جلسه با موضوع «{{title}}» در تاریخ {{date}}{{time}}{{place}} با حضور {{count}} نفر برگزار شد.',
    closing: 'مفاد این صورتجلسه مورد تأیید طرفین است و در {{copies}} نسخه تنظیم شد.',
    sections: { ...ALL_OFF, attendees: true, agenda: true, discussion: true, decisions: true, nextMeeting: true, copies: true },
    partyLabels: ['نمایندهٔ سازمان', 'نمایندهٔ مشتری'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'توضیحات',
    conditionsLabel: 'توضیحات',
    fields: [{ id: 'customer', label: 'نام مشتری', kind: 'text' }],
    defaultAgenda: [''],
    defaultConditions: '',
    signs: ['نمایندهٔ سازمان', 'نمایندهٔ مشتری'],
    builtin: true,
    active: true,
  },
  {
    id: 'committee',
    title: 'کمیته / هیئت‌مدیره',
    printTitle: 'صورتجلسه',
    prefix: 'ص‌ک',
    intro: 'جلسهٔ {{title}} در تاریخ {{date}}{{time}}{{place}} با حضور {{count}} نفر از اعضا تشکیل شد و پس از بحث و تبادل نظر، مصوبات زیر اتخاذ گردید.',
    closing: 'این صورتجلسه در {{decisions}} بند مصوبه به امضای اعضای حاضر رسید.',
    sections: { ...ALL_OFF, attendees: true, agenda: true, discussion: true, decisions: true, nextMeeting: true, copies: true },
    partyLabels: ['طرف اول', 'طرف دوم'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'توضیحات',
    conditionsLabel: 'توضیحات',
    fields: [{ id: 'quorum', label: 'حد نصاب / تعداد اعضای هیئت', kind: 'text' }],
    defaultAgenda: [''],
    defaultConditions: '',
    signs: ['منشی هیئت', 'رئیس هیئت', 'نایب‌رئیس'],
    builtin: true,
    active: true,
  },
  {
    id: 'inspection',
    title: 'بازدید و بررسی',
    printTitle: 'صورتجلسه بازدید',
    prefix: 'ص‌ب',
    intro: 'در تاریخ {{date}}{{time}}{{place}} بازدید و بررسی با موضوع «{{title}}» با حضور افراد زیر انجام شد.',
    closing: 'گزارش بازدید فوق به امضای حاضرین رسید.',
    sections: { ...ALL_OFF, attendees: true, discussion: true, decisions: true, copies: true },
    partyLabels: ['طرف اول', 'طرف دوم'],
    goodsColumns: { code: true, unit: true, note: true },
    goodsNoteLabel: 'توضیحات',
    conditionsLabel: 'توضیحات',
    fields: [{ id: 'site', label: 'محل / مورد بازدید', kind: 'text' }],
    defaultAgenda: [],
    defaultConditions: '',
    signs: ['بازدیدکننده', 'نمایندهٔ محل'],
    builtin: true,
    active: true,
  },
];

export const MINUTES_DESIGN_PRESETS: { id: string; name: string; look: Partial<MinutesDesign> }[] = [
  { id: 'classic', name: 'کلاسیک (مشکی)', look: { primary: '#111111', accent: '#111111', headFill: '#e8e8e8', text: '#111111', headerStyle: 'classic', tableStyle: 'bordered', radius: 0, pageBorder: false } },
  { id: 'maroon', name: 'اداری زرشکی', look: { primary: '#6E1B1B', accent: '#D34A32', headFill: '#F6E7E2', text: '#2A1F1C', headerStyle: 'band', tableStyle: 'lined', radius: 6, pageBorder: false } },
  { id: 'blue', name: 'مدرن آبی', look: { primary: '#1D4ED8', accent: '#38BDF8', headFill: '#E6EEFB', text: '#0F172A', headerStyle: 'boxed', tableStyle: 'striped', radius: 10, pageBorder: false } },
  { id: 'green', name: 'اداری سبز', look: { primary: '#166534', accent: '#65A30D', headFill: '#E8F2E6', text: '#18281C', headerStyle: 'band', tableStyle: 'lined', radius: 4, pageBorder: true } },
  { id: 'minimal', name: 'مینیمال', look: { primary: '#111827', accent: '#6B7280', headFill: '#F3F4F6', text: '#111827', headerStyle: 'plain', tableStyle: 'lined', radius: 0, pageBorder: false } },
];

export const DEFAULT_MINUTES_DESIGN: MinutesDesign = {
  presetId: 'classic',
  primary: '#111111',
  accent: '#111111',
  headFill: '#e8e8e8',
  text: '#111111',
  headerStyle: 'classic',
  logoPosition: 'right',
  logoSize: 22,
  showLogo: true,
  showOrgName: true,
  showSubtitle: true,
  showNumberBox: true,
  fontSize: 12,
  tableStyle: 'bordered',
  radius: 0,
  pageBorder: false,
  showStatusColumn: true,
  showSignColumn: false,
  signHeight: 26,
  footerText: '',
  showFooterContact: false,
};

export const DEFAULT_MINUTES_NUMBERING: MinutesNumbering = { pattern: '{PREFIX}-{YYYY}-{NNN}', prefix: 'ص‌ج', start: 1, perType: true };

export const MINUTES_NUMBER_PATTERNS: { id: string; label: string }[] = [
  { id: '{PREFIX}-{YYYY}-{NNN}', label: 'پیشوند-سال-شمارهٔ سه‌رقمی (ص‌ج-۱۴۰۵-۰۰۱)' },
  { id: '{YYYY}/{NNNN}', label: 'سال/شمارهٔ چهاررقمی (۱۴۰۵/۰۰۰۱)' },
  { id: '{PREFIX}/{YY}/{NN}', label: 'پیشوند/سال دو رقمی/شمارهٔ دو رقمی (ص‌ج/۰۵/۰۱)' },
  { id: '{NNNN}', label: 'فقط شمارهٔ ترتیبی چهاررقمی (۰۰۰۱)' },
];

/** The settings of the minutes, with whatever the administrator did not set taken from the defaults. */
export function getMinutesConfig(settings?: Pick<SystemSettings, 'minutesConfig'> | null): MinutesConfig {
  const c = settings?.minutesConfig;
  const stored = new Map((c?.types || []).map((t) => [t.id, t]));
  const types = [
    ...BUILTIN_MINUTES_TYPES.map((b) => {
      const o = stored.get(b.id);
      return o ? { ...b, ...o, sections: { ...b.sections, ...o.sections }, goodsColumns: { ...b.goodsColumns, ...o.goodsColumns }, builtin: true } : b;
    }),
    ...(c?.types || []).filter((t) => !BUILTIN_MINUTES_TYPES.some((b) => b.id === t.id)),
  ];
  return {
    numbering: { ...DEFAULT_MINUTES_NUMBERING, ...(c?.numbering || {}) },
    design: { ...DEFAULT_MINUTES_DESIGN, ...(c?.design || {}) },
    types,
  };
}

export const typeOf = (cfg: MinutesConfig, id?: string): MinutesType => cfg.types.find((t) => t.id === (id || 'general')) || cfg.types[0];

const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const jy = (dateIso: string) => (isoToJalaliParts(dateIso) || isoToJalaliParts(todayIso()) || [1400, 1, 1])[0];

/** The number text of the sequence `seq` (the digits are Persian). */
export function formatMinutesNumber(num: MinutesNumbering, type: MinutesType, dateIso: string, seq: number): string {
  const y = jy(dateIso);
  const prefix = num.perType ? type.prefix || num.prefix : num.prefix;
  const out = num.pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{TYPE\}/g, type.prefix)
    .replace(/\{YYYY\}/g, String(y))
    .replace(/\{YY\}/g, String(y).slice(-2))
    .replace(/\{(N+)\}/g, (_, n: string) => String(seq).padStart(n.length, '0'));
  return toPersianDigits(out);
}

/** The next sequence in the year: the highest one found among the numbers that follow the same pattern. */
export function nextMinutesSeq(cfg: MinutesConfig, typeId: string, dateIso: string, list: Minutes[]): number {
  const type = typeOf(cfg, typeId);
  const probe = formatMinutesNumber(cfg.numbering, type, dateIso, 0);
  const n = /\{(N+)\}/.exec(cfg.numbering.pattern);
  if (!n) return cfg.numbering.start;
  // the sample with the sequence replaced by a hole, turned into a pattern that reads the sequence back
  const marker = '§§§';
  const sample = latin(formatMinutesNumber({ ...cfg.numbering, pattern: cfg.numbering.pattern.replace(/\{N+\}/, marker) }, type, dateIso, 0));
  void probe;
  const re = new RegExp('^' + esc(sample).replace(esc(marker), '(\\d+)') + '$');
  const used = list
    .filter((m) => !cfg.numbering.perType || (m.typeId || 'general') === typeId)
    .map((m) => re.exec(latin(m.number)))
    .filter(Boolean)
    .map((r) => Number(r![1]));
  return used.length ? Math.max(...used) + 1 : Math.max(1, cfg.numbering.start);
}

export function nextMinutesNumber(cfg: MinutesConfig, typeId: string, dateIso: string, list: Minutes[]): string {
  return formatMinutesNumber(cfg.numbering, typeOf(cfg, typeId), dateIso, nextMinutesSeq(cfg, typeId, dateIso, list));
}
