const TD = 'style="border:1px solid #444;padding:6px;text-align:center"';
const TH = 'style="border:1px solid #444;padding:6px;text-align:center;background:#eee;font-weight:bold"';

/** a table of items and prices: row, description, quantity, unit, unit price, total */
export const itemsTable = (rows = 4): string =>
  '<table style="width:100%;border-collapse:collapse" border="1"><tr>' +
  ['ردیف', 'شرح کالا / خدمات', 'تعداد', 'واحد', 'قیمت واحد (ریال)', 'مبلغ کل (ریال)'].map((h) => `<th ${TH}>${h}</th>`).join('') +
  '</tr>' +
  Array.from({ length: rows }, (_, i) => `<tr><td ${TD}>${i + 1}</td>` + Array.from({ length: 5 }, () => `<td ${TD}>&nbsp;</td>`).join('') + '</tr>').join('') +
  `<tr><td colspan="5" style="border:1px solid #444;padding:6px;text-align:left;font-weight:bold">جمع کل</td><td ${TD}>&nbsp;</td></tr></table>`;

/** an empty table of the size the person asked for (first row is a header) */
export const blankTable = (rows: number, cols: number, header = true): string =>
  '<table style="width:100%;border-collapse:collapse" border="1">' +
  Array.from({ length: rows }, (_, r) => '<tr>' + Array.from({ length: cols }, () => (header && r === 0 ? `<th ${TH}>&nbsp;</th>` : `<td ${TD}>&nbsp;</td>`)).join('') + '</tr>').join('') +
  '</table><p><br></p>';

export interface InternalTemplate {
  id: string;
  title: string;
  subject: string;
  html: string;
}

/** ready-made texts for internal letters (the writer changes them freely) */
export const INTERNAL_TEMPLATES: InternalTemplate[] = [
  {
    id: 'general',
    title: 'نامهٔ داخلی عمومی',
    subject: 'درخواست بررسی و اقدام',
    html: '<p>با سلام و احترام،</p><p>بدین‌وسیله به استحضار می‌رساند [موضوع]. خواهشمند است دستور فرمایید نسبت به بررسی و اقدام لازم صورت پذیرد.</p><p>با تشکر</p>',
  },
  {
    id: 'purchase',
    title: 'درخواست خرید (با جدول)',
    subject: 'درخواست خرید',
    html: `<p>با سلام و احترام،</p><p>خواهشمند است نسبت به تأمین اقلام زیر دستور فرمایید:</p>${itemsTable()}<p>با تشکر</p>`,
  },
  {
    id: 'contract',
    title: 'جدول قرارداد / اقلام و مبالغ',
    subject: 'جدول اقلام و مبالغ قرارداد',
    html: `<p>با سلام و احترام،</p><p>اقلام و مبالغ قرارداد شماره [شماره قرارداد] به شرح جدول زیر است:</p>${itemsTable()}<p><b>شرایط پرداخت:</b> [درصد پیش‌پرداخت و زمان‌بندی پرداخت‌ها]</p><p><b>مدت قرارداد:</b> [تاریخ شروع] تا [تاریخ پایان]</p><p>خواهشمند است دستور اقدام مقتضی صادر فرمایید.</p>`,
  },
  {
    id: 'report',
    title: 'گزارش کار',
    subject: 'گزارش کار',
    html: '<p>با سلام و احترام،</p><p>گزارش اقدامات انجام‌شده در [بازهٔ زمانی] به شرح زیر است:</p><ol><li>[اقدام اول]</li><li>[اقدام دوم]</li></ol><p><b>موارد نیازمند تصمیم:</b> [..........]</p>',
  },
];
