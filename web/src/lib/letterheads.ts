/**
 * Ready-made letterheads («سربرگ رسمی با آرم»): 10 designs x 10 colour sets = 100 templates. Each one is a thin decoration drawn at the top and the
 * bottom of the sheet (an SVG, so it prints sharp), and the letter can carry the address and the phone number in its footer.
 * The same markup is used by the editor, the preview and the printed page, so the three always look alike.
 */
export interface LetterheadChoice {
  /** 1..100 */
  id: number;
  showAddress: boolean;
  showPhone: boolean;
  address: string;
  phone: string;
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
];

export const LETTERHEAD_DESIGNS = ['خطوط ساده', 'نوار رنگی', 'موج', 'گوشهٔ هندسی', 'قاب گوشه‌ای', 'گرادیان', 'کمان', 'الماس', 'پله‌ای', 'دایره‌ای'];
export const LETTERHEAD_PALETTES = PALETTES.map((p) => p.name);

export interface LetterheadDef {
  id: number;
  name: string;
  design: number;
  palette: number;
}

export const LETTERHEADS: LetterheadDef[] = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  design: Math.floor(i / 10),
  palette: i % 10,
  name: `${LETTERHEAD_DESIGNS[Math.floor(i / 10)]} ${PALETTES[i % 10].name}`,
}));

export const letterheadById = (id: number) => LETTERHEADS.find((l) => l.id === id) || LETTERHEADS[0];
export const letterheadColor = (id: number) => PALETTES[letterheadById(id).palette].c1;

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
  if (c.showPhone && c.phone.trim()) parts.push(`تلفن: ${c.phone.trim()}`);
  return parts.join('  •  ');
}
