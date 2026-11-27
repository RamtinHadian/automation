import { Customer, Deal, SystemSettings } from '../types';
import { formatMoney, unitName } from './money';
import { toPersianDigits } from './jalali';
import { formatTaskDate } from './taskDates';
import { invoiceTitle } from './invoice';
import { proformaTotals } from './proformaPdf';
import { code128Svg, latinDigits } from './code128';

/**
 * The invoice on a label / receipt printer (thermal, 58 or 80 mm roll, or a label sheet): narrow, black on white, no colours or boxes, big enough
 * to read when printed small. The page size is written in @page, so the printer driver takes it; the printer chosen in the print window must be
 * the label printer. The same text for every width, only the width changes.
 */
export type ThermalSize = '58' | '72' | '76' | '80' | '110' | 'label100x150' | 'label100x100' | 'label75x50' | 'custom';
export const THERMAL_SIZES: { id: ThermalSize; label: string; page: string; width: string }[] = [
  { id: '80', label: 'رسید ۸۰ میلی‌متر', page: '80mm auto', width: '72mm' },
  { id: '58', label: 'رسید ۵۸ میلی‌متر', page: '58mm auto', width: '50mm' },
  { id: '72', label: 'رسید ۷۲ میلی‌متر', page: '72mm auto', width: '64mm' },
  { id: '76', label: 'رسید ۷۶ میلی‌متر', page: '76mm auto', width: '68mm' },
  { id: '110', label: 'رسید ۱۱۰ میلی‌متر', page: '110mm auto', width: '102mm' },
  { id: 'label75x50', label: 'لیبل ۷۵×۵۰ میلی‌متر', page: '75mm 50mm', width: '69mm' },
  { id: 'custom', label: 'عرض دلخواه (میلی‌متر)…', page: '', width: '' },
  { id: 'label100x150', label: 'لیبل ۱۰۰×۱۵۰ میلی‌متر (۴×۶ اینچ)', page: '100mm 150mm', width: '94mm' },
  { id: 'label100x100', label: 'لیبل ۱۰۰×۱۰۰ میلی‌متر', page: '100mm 100mm', width: '94mm' },
];
const KEY = 'invoice-thermal-size';
const MM_KEY = 'invoice-thermal-mm';
export const rememberedThermalMm = (): number => {
  try {
    const n = Number(localStorage.getItem(MM_KEY));
    if (n >= 30 && n <= 200) return n;
  } catch {
    /* remembering is optional */
  }
  return 80;
};
export const rememberThermalMm = (n: number) => {
  try {
    localStorage.setItem(MM_KEY, String(n));
  } catch {
    /* remembering is optional */
  }
};

export const rememberedThermalSize = (): ThermalSize => {
  try {
    const v = localStorage.getItem(KEY) as ThermalSize | null;
    if (v && THERMAL_SIZES.some((s) => s.id === v)) return v;
  } catch {
    /* remembering is optional */
  }
  return '80';
};
export const rememberThermalSize = (s: ThermalSize) => {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* remembering is optional */
  }
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function buildThermalHtml(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string, size: ThermalSize, customMm = 80): string {
  const inv = deal.invoice!;
  const mm = Math.min(200, Math.max(30, Math.round(customMm) || 80));
  const sz = size === 'custom' ? { page: `${mm}mm auto`, width: `${mm - 8}mm` } : THERMAL_SIZES.find((s) => s.id === size) || THERMAL_SIZES[0];
  const narrow = size === '58' || (size === 'custom' && mm < 66) || size === 'label75x50';
  const code = latinDigits(inv.number || '');
  const issuer = (settings.proformaIssuers || []).find((i) => i.id === (inv.issuerId ?? deal.proformaIssuerId));
  const seller = (inv.fields?.sellerName as string | undefined) || issuer?.name || settings.proformaCompanyName || settings.companyName || '';
  const t = proformaTotals(inv.items, inv.discountPercent || 0, inv.taxPercent || 0);
  const fmt = (n: number) => toPersianDigits(formatMoney(n));
  const rows = inv.items
    .filter((i) => (i.title || '').trim())
    .map(
      (i) => `<div class="it"><div class="nm">${esc(i.title)}</div><div class="ln"><span>${toPersianDigits(i.qty)}${i.unit ? ' ' + esc(i.unit) : ''} × ${fmt(i.unitPrice)}</span><b>${fmt(Math.max(0, i.qty * i.unitPrice - (i.discount || 0)))}</b></div></div>`
    )
    .join('');
  const phone = (customer?.phones || [])[0] || '';
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(invoiceTitle(inv.kind))} ${esc(inv.number || '')}</title>
<style>
  @page { size: ${sz.page}; margin: 2mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Vazirmatn, Tahoma, 'Segoe UI', sans-serif; font-size: ${narrow ? '10.5px' : '12px'}; line-height: 1.55; width: ${sz.width}; margin: 0 auto; }
  .c { text-align: center; }
  h1 { font-size: ${narrow ? '13px' : '15px'}; margin: 0 0 2px; text-align: center; }
  .sub { text-align: center; font-weight: 700; margin-bottom: 4px; }
  .hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
  .kv { display: flex; justify-content: space-between; gap: 6px; }
  .kv span:first-child { font-weight: 700; }
  .it { padding: 2px 0; border-bottom: 1px dotted #777; }
  .it .nm { font-weight: 700; }
  .ln { display: flex; justify-content: space-between; gap: 6px; }
  .tot .kv b { font-size: inherit; }
  .pay { font-size: ${narrow ? '13px' : '15px'}; font-weight: 900; border-top: 2px solid #000; margin-top: 3px; padding-top: 3px; }
  .bc { margin-top: 6px; }
  .bc .num { font-size: 11px; font-weight: 700; letter-spacing: 1px; direction: ltr; }
  .ft { text-align: center; margin-top: 6px; font-size: 10px; }
  @media print { body { width: ${sz.width}; } }
</style></head><body onload="setTimeout(function(){window.print()},250)">
  <h1>${esc(seller || 'فاکتور')}</h1>
  <div class="sub">${esc(invoiceTitle(inv.kind))}</div>
  <hr class="hr">
  <div class="kv"><span>شمارهٔ فاکتور</span><span>${toPersianDigits(inv.number || '—')}</span></div>
  <div class="kv"><span>تاریخ</span><span>${toPersianDigits(formatTaskDate(inv.issuedAt.slice(0, 10)))}</span></div>
  <div class="kv"><span>مشتری</span><span>${esc(deal.customerName || customer?.name || '')}</span></div>
  ${phone ? `<div class="kv"><span>تلفن</span><span dir="ltr">${toPersianDigits(esc(phone))}</span></div>` : ''}
  <hr class="hr">
  ${rows || '<div class="c">—</div>'}
  <div class="tot">
    ${t.totalDiscount ? `<div class="kv"><span>تخفیف</span><b>${fmt(t.totalDiscount)}</b></div>` : ''}
    ${t.tax ? `<div class="kv"><span>مالیات (${toPersianDigits(inv.taxPercent || 0)}٪)</span><b>${fmt(t.tax)}</b></div>` : ''}
    <div class="kv pay"><span>قابل پرداخت (${unitName()})</span><span>${fmt(t.payable)}</span></div>
  </div>
  ${inv.paid ? '<div class="c" style="font-weight:900;margin-top:4px">پرداخت شده</div>' : ''}
  ${inv.note ? `<hr class="hr"><div>${esc(inv.note)}</div>` : ''}
  ${code ? `<div class="bc">${code128Svg(code, narrow ? 30 : 40)}<div class="c num">${esc(code)}</div></div>` : ''}
  <hr class="hr">
  <div class="ft">صادرکننده: ${esc(inv.issuedByName || issuerName)}</div>
</body></html>`;
}

/** Opens the narrow invoice in a print window and starts the printing; the person picks the label printer there. Must be called from a click. */
export function openInvoiceThermal(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string, size: ThermalSize, customMm = 80) {
  if (!deal.invoice) return;
  rememberThermalSize(size);
  if (size === 'custom') rememberThermalMm(customMm);
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(buildThermalHtml(deal, customer, settings, issuerName, size, customMm));
  w.document.close();
}
