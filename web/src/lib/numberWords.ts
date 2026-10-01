const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'هزار میلیارد', 'میلیون میلیارد'];

function threeDigits(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o ? `${TENS[t]} و ${ONES[o]}` : TENS[t]);
    }
  }
  return parts.join(' و ');
}

/** 1250000 → «یک میلیون و دویست و پنجاه هزار». */
export function numberToPersianWords(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (!isFinite(n)) return '';
  if (n === 0) return 'صفر';
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (!groups[i]) continue;
    const scale = SCALES[i] || '';
    out.push(scale ? `${threeDigits(groups[i])} ${scale}` : threeDigits(groups[i]));
  }
  return out.join(' و ');
}
