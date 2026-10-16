/**
 * Ready-made letterheads («سربرگ رسمی با آرم»): 25 designs x 400 colour sets = 10000 templates, and the person's own uploaded design. Each one is a thin decoration drawn at the top and the
 * bottom of the sheet (an SVG, so it prints sharp), and the letter can carry the address and the phone number in its footer.
 * The same markup is used by the editor, the preview and the printed page, so the three always look alike.
 */
export interface LetterheadChoice {
  /** 1..10000, or 0 when the person uploaded their own design (then `image` holds it) */
  id: number;
  /** the person's own letterhead design, as a data URL (picture), drawn as the background of the whole sheet */
  image?: string;
  showAddress: boolean;
  showPhone: boolean;
  address: string;
  phone: string;
  /** the web address of the company, printed in the footer line when ticked */
  showWebsite?: boolean;
  website?: string;
  /** where the person dragged the address / phone line */
  offsetX?: number;
  offsetY?: number;
}

interface Palette {
  name: string;
  c1: string;
  c2: string;
  c3: string;
}

const PALETTES: Palette[] = [
  { name: 'نیلی', c1: '#1b3a8a', c2: '#3b82f6', c3: '#dbeafe' },
  { name: 'عنابی و طلایی', c1: '#6e1b1b', c2: '#c9a227', c3: '#f6e8c4' },
  { name: 'زمرد', c1: '#0f6b4f', c2: '#34d399', c3: '#d1fae5' },
  { name: 'فیروزه‌ای و نارنجی', c1: '#0e7490', c2: '#f97316', c3: '#cffafe' },
  { name: 'بنفش و صورتی', c1: '#6d28d9', c2: '#ec4899', c3: '#ede9fe' },
  { name: 'زغالی و کهربایی', c1: '#1f2937', c2: '#d97706', c3: '#f3f4f6' },
  { name: 'آسمانی و ارغوانی', c1: '#0284c7', c2: '#6366f1', c3: '#e0f2fe' },
  { name: 'زیتونی و قهوه‌ای', c1: '#4d6b2f', c2: '#92400e', c3: '#ecf3dc' },
  { name: 'رز و خاکستری', c1: '#be185d', c2: '#64748b', c3: '#fce7f3' },
  { name: 'مشکی و زرین', c1: '#111111', c2: '#b8860b', c3: '#efe6c8' },
  { name: 'سرمه‌ای و نقره‌ای', c1: '#14213d', c2: '#9ca3af', c3: '#e5e7eb' },
  { name: 'آبی نفتی و مسی', c1: '#0b4f6c', c2: '#c8743f', c3: '#d9eef5' },
  { name: 'سبز جنگلی و طلایی', c1: '#1b4332', c2: '#d4a017', c3: '#d8f3dc' },
  { name: 'یاسی و فیروزه‌ای', c1: '#7e57c2', c2: '#14b8a6', c3: '#ede7f6' },
  { name: 'قرمز و طوسی', c1: '#b91c1c', c2: '#6b7280', c3: '#fee2e2' },
  { name: 'قهوه‌ای و کرم', c1: '#5b3a29', c2: '#d9b38c', c3: '#f4e8da' },
  { name: 'لاجوردی و زرد', c1: '#1e3a8a', c2: '#eab308', c3: '#dbe4ff' },
  { name: 'آبی یخی و نیلی', c1: '#38bdf8', c2: '#312e81', c3: '#e0f7ff' },
  { name: 'پسته‌ای و بنفش', c1: '#65a30d', c2: '#7c3aed', c3: '#ecfccb' },
  { name: 'نارنجی و سرمه‌ای', c1: '#ea580c', c2: '#1e3a5f', c3: '#ffedd5' },
  { name: 'شرابی و رز', c1: '#7f1d3a', c2: '#f472b6', c3: '#fde4ee' },
  { name: 'خاکی و سبز', c1: '#8a7a4a', c2: '#2f855a', c3: '#f1ecd9' },
  { name: 'آبی کاربنی و سرخ', c1: '#0f2c4a', c2: '#e11d48', c3: '#dbe7f3' },
  { name: 'ارغوانی و طلایی', c1: '#581c87', c2: '#f59e0b', c3: '#f3e8ff' },
  { name: 'مرجانی و آبی', c1: '#f4695d', c2: '#2563eb', c3: '#ffe6e3' },
  { name: 'کهربایی و قهوه‌ای', c1: '#b45309', c2: '#78350f', c3: '#fef3c7' },
  { name: 'فیروزه‌ای و بنفش', c1: '#0d9488', c2: '#8b5cf6', c3: '#ccfbf1' },
  { name: 'نعنایی و خاکستری', c1: '#10b981', c2: '#475569', c3: '#d1fae5' },
  { name: 'آلبالویی و کرم', c1: '#7a1130', c2: '#e6cfa8', c3: '#f9efe0' },
  { name: 'عسلی و سرمه‌ای', c1: '#c68a17', c2: '#1f2a44', c3: '#fbf0d0' },
  { name: 'خاکستری و آبی', c1: '#4b5563', c2: '#2563eb', c3: '#e5e7eb' },
  { name: 'صورتی و سبز', c1: '#db2777', c2: '#16a34a', c3: '#fce7f3' },
  { name: 'زرشکی و نقره‌ای', c1: '#8b1a2b', c2: '#a8b0b9', c3: '#f6e4e7' },
  { name: 'نیلگون و نارنجی', c1: '#1d4e89', c2: '#f28c28', c3: '#dbe9f7' },
  { name: 'جگری و طلایی', c1: '#4a0e1e', c2: '#c9a227', c3: '#f2dcc3' },
  { name: 'آبی دریایی و مرجانی', c1: '#0a3d62', c2: '#ff7f6e', c3: '#d6ecf8' },
  { name: 'لجنی و زرد', c1: '#556b2f', c2: '#e2b714', c3: '#e8efd6' },
  { name: 'بنفش تیره و نقره‌ای', c1: '#3b0764', c2: '#b0b7c3', c3: '#ece0fb' },
  { name: 'نخودی و آبی', c1: '#d9b779', c2: '#2b6cb0', c3: '#faf3e3' },
  { name: 'سیاه و قرمز', c1: '#0f0f10', c2: '#dc2626', c3: '#ececec' },
];

export const LETTERHEAD_DESIGNS = ['خطوط ساده', 'نوار رنگی', 'موج', 'گوشهٔ هندسی', 'قاب گوشه‌ای', 'گرادیان', 'کمان', 'الماس', 'پله‌ای', 'دایره‌ای', 'خط و گوی', 'تیغه‌ها', 'نقطه‌چین', 'موج ظریف', 'مثلث‌های پشت‌سرهم', 'ستارهٔ هشت‌پر', 'نوار توخالی', 'کادر گوشه‌بریده', 'ردیف دایره‌ها', 'طاق‌ها', 'بلوک‌های رنگی', 'تیغهٔ مایل', 'کنگره‌ای', 'اسلیمی ساده', 'دو نقطه'];
// 360 more colour sets, made from 24 main hues and 15 partner hues: 40 hand-picked + 360 = 400 sets, so 25 designs give 10000 templates
const HUE_NAMES: [number, string][] = [[15, 'قرمز'], [40, 'نارنجی'], [65, 'زرد'], [95, 'لیمویی'], [150, 'سبز'], [175, 'زمردی'], [200, 'فیروزه‌ای'], [235, 'آبی'], [265, 'نیلی'], [290, 'بنفش'], [330, 'ارغوانی'], [346, 'صورتی'], [361, 'قرمز']];
const hueName = (h: number) => HUE_NAMES.find(([m]) => h < m)![1];
const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h) % 360} ${s}% ${l}%)`;
const PARTNER = [180, 150, 210, 30, 60, 120, 240, 90, 300, 330, 20, 270, 45, 195, 165];
for (let i = 0; i < 360; i++) {
  const h1 = (i % 24) * 15;
  const h2 = (h1 + PARTNER[Math.floor(i / 24)] + 360) % 360;
  PALETTES.push({ name: `${hueName(h1)} و ${hueName(h2)} ${i + 1}`.replace(/\d+$/, (d) => String(d).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[Number(x)])), c1: hsl(h1, 62 + (i % 3) * 6, 26 + (i % 4) * 3), c2: hsl(h2, 70, 48 + (i % 2) * 6), c3: hsl(h1, 55, 92) });
}

export const LETTERHEAD_PALETTES = PALETTES.map((p) => p.name);

export interface LetterheadDef {
  id: number;
  name: string;
  design: number;
  palette: number;
}

const PER = PALETTES.length;
export const LETTERHEADS: LetterheadDef[] = Array.from({ length: LETTERHEAD_DESIGNS.length * PER }, (_, i) => ({
  id: i + 1,
  design: Math.floor(i / PER),
  palette: i % PER,
  name: `${LETTERHEAD_DESIGNS[Math.floor(i / PER)]} ${PALETTES[i % PER].name}`,
}));

export const letterheadById = (id: number) => LETTERHEADS[id - 1] || LETTERHEADS[0];
/** colour of the address / phone line: the template's main colour, dark brown for the person's own design */
export const letterheadColor = (id: number) => (id === 0 ? '#3A241F' : PALETTES[letterheadById(id).palette].c1);

/** the person's own design as the background of the whole sheet (empty when the letterhead is a built-in template) */
export const letterheadBackground = (c?: LetterheadChoice | null): Record<string, string> =>
  c?.image ? { backgroundImage: `url("${c.image}")`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } : {};

const H = 52; // every decoration is drawn 800 wide and 52 high, from the top edge down

/** The drawing of one design (top edge); the bottom decoration is the same drawing turned upside down. */
function drawing(d: number, c: Palette, gid: string): string {
  const { c1, c2 } = c;
  switch (d) {
    case 0:
      return `<rect x="40" y="30" width="720" height="3.2" fill="${c1}"/><rect x="40" y="37" width="720" height="1.6" fill="${c2}"/><rect x="40" y="26" width="64" height="7" fill="${c2}"/><rect x="696" y="26" width="64" height="7" fill="${c2}"/>`;
    case 1:
      return `<rect width="800" height="14" fill="${c1}"/><rect y="14" width="800" height="3" fill="${c2}"/>`;
    case 2:
      return `<path d="M0 0H800V24C650 46 520 8 380 24C240 40 120 42 0 22Z" fill="${c1}"/><path d="M0 0H800V12C650 32 520 2 380 14C240 26 120 28 0 12Z" fill="${c2}" opacity=".55"/>`;
    case 3:
      return `<polygon points="800,0 800,52 690,0" fill="${c1}"/><polygon points="800,0 800,30 740,0" fill="${c2}"/><polygon points="0,0 0,34 78,0" fill="${c2}"/>`;
    case 4:
      return `<path d="M24 46V10H62" stroke="${c1}" stroke-width="3" fill="none"/><path d="M776 46V10H738" stroke="${c1}" stroke-width="3" fill="none"/><rect x="19" y="5" width="9" height="9" fill="${c2}"/><rect x="772" y="5" width="9" height="9" fill="${c2}"/>`;
    case 5:
      return `<defs><linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="800" height="12" fill="url(#${gid})"/><rect y="18" width="800" height="2" fill="url(#${gid})" opacity=".6"/>`;
    case 6:
      return `<path d="M0 0H300Q232 52 0 44Z" fill="${c1}"/><path d="M0 0H190Q140 34 0 30Z" fill="${c2}" opacity=".7"/><rect x="330" width="470" height="3" fill="${c1}" opacity=".5"/>`;
    case 7:
      return `<rect x="40" y="30" width="318" height="1.6" fill="${c1}"/><rect x="442" y="30" width="318" height="1.6" fill="${c1}"/><polygon points="400,17 413,31 400,45 387,31" fill="${c1}"/><polygon points="372,23 380,31 372,39 364,31" fill="${c2}"/><polygon points="428,23 436,31 428,39 420,31" fill="${c2}"/>`;
    case 8:
      return `<rect x="620" width="180" height="10" fill="${c1}"/><rect x="680" y="10" width="120" height="10" fill="${c2}"/><rect x="740" y="20" width="60" height="10" fill="${c1}"/><rect width="90" height="7" fill="${c2}"/><rect y="7" width="44" height="7" fill="${c1}"/>`;
    case 10:
      return `<rect x="60" y="30" width="680" height="2" fill="${c1}"/><rect x="60" y="36" width="680" height="1" fill="${c2}"/><circle cx="52" cy="31" r="7" fill="${c1}"/><circle cx="748" cy="31" r="7" fill="${c1}"/><circle cx="52" cy="31" r="3" fill="${c2}"/><circle cx="748" cy="31" r="3" fill="${c2}"/>`;
    case 11:
      return `<polygon points="560,0 800,0 800,34 760,34" fill="${c1}"/><polygon points="500,0 540,0 740,34 700,34" fill="${c2}"/><polygon points="440,0 470,0 670,34 640,34" fill="${c1}" opacity=".55"/>`;
    case 12:
      return `<rect x="40" y="28" width="90" height="6" fill="${c1}"/><line x1="150" y1="31" x2="760" y2="31" stroke="${c2}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>`;
    case 13:
      return `<path d="M0 26 Q50 6 100 26 T200 26 T300 26 T400 26 T500 26 T600 26 T700 26 T800 26" stroke="${c1}" stroke-width="2.4" fill="none"/><path d="M0 34 Q50 14 100 34 T200 34 T300 34 T400 34 T500 34 T600 34 T700 34 T800 34" stroke="${c2}" stroke-width="1.4" fill="none"/>`;
    case 14: {
      let z = '';
      for (let x = 0; x < 800; x += 40) z += `<polygon points="${x},0 ${x + 40},0 ${x + 20},22" fill="${(x / 40) % 2 ? c2 : c1}"/>`;
      return z;
    }
    case 15:
      return `<rect x="40" y="30" width="322" height="1.6" fill="${c1}"/><rect x="438" y="30" width="322" height="1.6" fill="${c1}"/><polygon points="400,12 405,25 418,20 413,31 426,36 413,41 418,52 405,47 400,60 395,47 382,52 387,41 374,36 387,31 382,20 395,25" fill="${c1}" transform="translate(0 -5) scale(1 .85)"/><circle cx="400" cy="31" r="4" fill="${c2}"/>`;
    case 16:
      return `<rect x="30" y="10" width="740" height="26" rx="4" fill="none" stroke="${c1}" stroke-width="3"/><rect x="38" y="18" width="724" height="10" rx="2" fill="${c2}" opacity=".35"/>`;
    case 17:
      return `<polygon points="30,12 770,12 770,26 750,42 50,42 30,26" fill="${c1}"/><polygon points="60,22 740,22 740,28 730,34 70,34 60,28" fill="${c2}" opacity=".6"/>`;
    case 18: {
      let z = `<rect x="40" y="29" width="720" height="1.6" fill="${c2}"/>`;
      for (let k = 0; k < 9; k++) z += `<circle cx="${760 - k * 34}" cy="30" r="${Math.max(2, 11 - k)}" fill="${k % 2 ? c2 : c1}"/>`;
      return z;
    }
    case 19: {
      let z = `<rect width="800" height="6" fill="${c1}"/>`;
      for (let x = 0; x < 800; x += 50) z += `<path d="M${x} 6 A25 24 0 0 0 ${x + 50} 6Z" fill="${(x / 50) % 2 ? c2 : c1}" opacity=".85"/>`;
      return z;
    }
    case 20: {
      let z = '';
      for (let k = 0; k < 16; k++) z += `<rect x="${k * 50}" y="0" width="46" height="${k % 2 ? 12 : 20}" fill="${k % 3 === 0 ? c2 : c1}" opacity="${(0.4 + (k % 4) * 0.2).toFixed(2)}"/>`;
      return z;
    }
    case 21:
      return `<polygon points="0,0 330,0 250,46 0,46" fill="${c1}"/><polygon points="330,0 372,0 292,46 250,46" fill="${c2}"/>`;
    case 22: {
      let z = `<rect y="14" width="800" height="8" fill="${c1}"/>`;
      for (let x = 0; x < 800; x += 40) z += `<rect x="${x + 6}" y="2" width="28" height="12" fill="${x % 80 ? c2 : c1}"/>`;
      return z;
    }
    case 23:
      return `<path d="M30 44 C30 12 80 6 96 26 C106 38 88 46 78 36 C72 30 80 24 86 28" stroke="${c1}" stroke-width="3" fill="none"/><path d="M770 44 C770 12 720 6 704 26 C694 38 712 46 722 36 C728 30 720 24 714 28" stroke="${c1}" stroke-width="3" fill="none"/><rect x="120" y="30" width="560" height="1.6" fill="${c2}"/>`;
    case 24:
      return `<rect x="60" y="30" width="680" height="1.4" fill="${c1}"/><circle cx="400" cy="31" r="6" fill="${c1}"/><circle cx="376" cy="31" r="3" fill="${c2}"/><circle cx="424" cy="31" r="3" fill="${c2}"/>`;
    default:
      return `<circle cx="792" cy="0" r="46" fill="${c1}"/><circle cx="742" cy="0" r="24" fill="${c2}"/><circle cx="8" cy="0" r="30" fill="${c2}" opacity=".8"/><circle cx="50" cy="0" r="14" fill="${c1}"/>`;
  }
}

/** The SVG markup of one template's top or bottom decoration (as wide as its box; about 5% of the width tall). */
export function letterheadSvg(id: number, part: 'top' | 'bottom'): string {
  const def = letterheadById(id);
  const inner = drawing(def.design, PALETTES[def.palette], `lhg${def.id}${part[0]}`);
  const g = part === 'bottom' ? `<g transform="translate(0 ${H}) scale(1 -1)">${inner}</g>` : inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${H}" width="100%" preserveAspectRatio="xMidYMin meet" style="display:block">${g}</svg>`;
}

/** The line printed in the footer: address and / or phone, whichever the person ticked. */
export function letterheadFooterText(c: LetterheadChoice): string {
  const parts: string[] = [];
  if (c.showAddress && c.address.trim()) parts.push(`نشانی: ${c.address.trim()}`);
  if (c.showPhone && c.phone.trim()) parts.push(`تلفن: ⁦${c.phone.trim().replace(/[‐-―−]/g, '-')}⁩`);
  if (c.showWebsite && c.website?.trim()) parts.push(`وب‌سایت: ⁦${c.website.trim()}⁩`);
  return parts.join('  •  ');
}
