import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { Customer, Deal, SystemSettings } from '../types';
import { formatMoney, unitName } from './money';
import { toPersianDigits } from './jalali';
import { formatTaskDate } from './taskDates';
import { invoiceTitle } from './invoice';
import { proformaTotals } from './proformaPdf';
import { code128Svg, latinDigits } from './code128';
import { directPrintOn } from './directPrint';

/**
 * The invoice on a label / receipt printer (thermal roll or label sheet): a window with the paper drawn at its real width, a print button, and
 * a choice of the paper. A web page cannot ask the computer which printers it has, so the default is «خودکار»: the page takes the width of the paper
 * of the printer chosen in the print window (80 mm, 58 mm, a label…) and sizes the letters from it; the fixed sizes are there for a driver that
 * reports a wrong paper.
 */
export type ThermalSize = 'auto' | '58' | '72' | '76' | '80' | '110' | 'label100x150' | 'label100x100' | 'label75x50' | 'custom';
export const THERMAL_SIZES: { id: ThermalSize; label: string; page: string; width: string }[] = [
  { id: 'auto', label: 'خودکار (طبق پرینتر انتخاب‌شده)', page: 'auto', width: '' },
  { id: '80', label: 'رسید ۸۰ میلی‌متر', page: '80mm auto', width: '72mm' },
  { id: '58', label: 'رسید ۵۸ میلی‌متر', page: '58mm auto', width: '50mm' },
  { id: '72', label: 'رسید ۷۲ میلی‌متر', page: '72mm auto', width: '64mm' },
  { id: '76', label: 'رسید ۷۶ میلی‌متر', page: '76mm auto', width: '68mm' },
  { id: '110', label: 'رسید ۱۱۰ میلی‌متر', page: '110mm auto', width: '102mm' },
  { id: 'label75x50', label: 'لیبل ۷۵×۵۰ میلی‌متر', page: '75mm 50mm', width: '69mm' },
  { id: 'label100x150', label: 'لیبل ۱۰۰×۱۵۰ میلی‌متر (۴×۶ اینچ)', page: '100mm 150mm', width: '94mm' },
  { id: 'label100x100', label: 'لیبل ۱۰۰×۱۰۰ میلی‌متر', page: '100mm 100mm', width: '94mm' },
  { id: 'custom', label: 'عرض دلخواه (میلی‌متر)…', page: '', width: '' },
];
const KEY = 'invoice-thermal-size';
const MM_KEY = 'invoice-thermal-mm';
export const rememberedThermalSize = (): ThermalSize => {
  try {
    const v = localStorage.getItem(KEY) as ThermalSize | null;
    if (v && THERMAL_SIZES.some((s) => s.id === v)) return v;
  } catch {
    /* remembering is optional */
  }
  return 'auto';
};
export const rememberThermalSize = (s: ThermalSize) => {
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* remembering is optional */
  }
};
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

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function buildThermalHtml(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string, size: ThermalSize, customMm = 80): string {
  const inv = deal.invoice!;
  const issuer = (settings.proformaIssuers || []).find((i) => i.id === (inv.issuerId ?? deal.proformaIssuerId));
  const seller = (inv.fields?.sellerName as string | undefined) || issuer?.name || settings.proformaCompanyName || settings.companyName || '';
  const t = proformaTotals(inv.items, inv.discountPercent || 0, inv.taxPercent || 0);
  const fmt = (n: number) => toPersianDigits(formatMoney(n));
  const code = latinDigits(inv.number || '');
  const rows = inv.items
    .filter((i) => (i.title || '').trim())
    .map(
      (i) => `<div class="it"><div class="nm">${esc(i.title)}</div><div class="ln"><span class="q">${toPersianDigits(i.qty)}${i.unit ? ' ' + esc(i.unit) : ''} × ${fmt(i.unitPrice)}</span><b>${fmt(Math.max(0, i.qty * i.unitPrice - (i.discount || 0)))}</b></div></div>`
    )
    .join('');
  const phone = (customer?.phones || [])[0] || '';
  const sizes = THERMAL_SIZES.map((s) => ({ id: s.id, label: s.label, page: s.page, width: s.width }));
  const opts = sizes.map((s) => `<option value="${s.id}"${s.id === size ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${esc(invoiceTitle(inv.kind))} ${esc(inv.number || '')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style id="pg">@page { size: auto; margin: 2mm; }</style>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; font-display: swap; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; background: #ECE7E1; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 16px; background: #3A241F; color: #fff; }
  .bar h2 { margin: 0; font-size: 14px; font-weight: 800; flex: 1 1 140px; }
  .bar select, .bar input { font: inherit; font-size: 12px; font-weight: 700; padding: 8px 10px; border-radius: 10px; border: 0; background: #fff; color: #3A241F; }
  .bar input { width: 78px; text-align: center; }
  .bar button { font: inherit; font-size: 13px; font-weight: 800; padding: 9px 18px; border-radius: 12px; border: 0; cursor: pointer; }
  .bar .go { background: #16A34A; color: #fff; }
  .bar .go:hover { background: #15803D; }
  .bar .x { background: rgba(255,255,255,.15); color: #fff; }
  .hint { max-width: 460px; margin: 10px auto 0; padding: 0 16px; font-size: 11px; font-weight: 600; color: #6B5A53; line-height: 1.9; text-align: center; }
  .stage { padding: 18px 12px 40px; display: flex; justify-content: center; }
  .paper { width: 80mm; background: #fff; padding: 4mm 3.5mm 5mm; border-radius: 6px; box-shadow: 0 8px 28px rgba(58,36,31,.22); font-size: 12.5px; line-height: 1.7; }
  .shop { text-align: center; font-size: 1.28em; font-weight: 900; line-height: 1.5; }
  .kind { display: block; width: fit-content; margin: 4px auto 0; padding: 1px 14px; border: 1.5px solid #111; border-radius: 999px; font-size: .92em; font-weight: 800; }
  .hr { border: 0; border-top: 1.5px dashed #444; margin: 8px 0; }
  .kv { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .kv .k { font-weight: 600; color: #444; }
  .kv .v { font-weight: 800; text-align: left; }
  .it { padding: 5px 0; border-bottom: 1px dotted #888; }
  .it .nm { font-weight: 800; line-height: 1.6; }
  .ln { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; }
  .ln b { font-weight: 900; }
  .sum { margin-top: 6px; }
  .pay { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 8px; padding: 6px 10px; background: #111; color: #fff; border-radius: 10px; font-weight: 900; font-size: 1.12em; }
  .paid { margin-top: 8px; text-align: center; font-weight: 900; border: 2px solid #111; border-radius: 8px; padding: 2px 0; }
  .bc { margin-top: 10px; }
  .bc .num { text-align: center; direction: ltr; font-size: .86em; font-weight: 800; letter-spacing: 1.5px; margin-top: 2px; }
  .ft { text-align: center; margin-top: 8px; font-size: .82em; font-weight: 600; color: #444; line-height: 1.8; }
  @media print {
    body { background: #fff; }
    .bar, .hint { display: none !important; }
    .stage { padding: 0; display: block; }
    .paper { width: 100% !important; box-shadow: none; border-radius: 0; padding: 0; font-size: clamp(9px, 3.55vw, 15px); }
  }
</style></head><body>
<div class="bar">
  <h2>چاپ فاکتور ${toPersianDigits(esc(inv.number || ''))}</h2>
  <select id="sz" aria-label="کاغذ">${opts}</select>
  <input id="mm" type="number" min="30" max="200" value="${Math.min(200, Math.max(30, Math.round(customMm) || 80))}" style="display:${size === 'custom' ? 'inline-block' : 'none'}" aria-label="عرض کاغذ به میلی‌متر" title="عرض کاغذ (میلی‌متر)">
  <button class="go" id="go" type="button">چاپ</button>
  <button class="x" id="cl" type="button">بستن</button>
</div>
<div class="hint" id="hint"></div>
<div class="stage"><div class="paper" id="paper">
  <div class="shop">${esc(seller || 'فاکتور')}</div>
  <span class="kind">${esc(invoiceTitle(inv.kind))}</span>
  <hr class="hr">
  <div class="kv"><span class="k">شمارهٔ فاکتور</span><span class="v">${toPersianDigits(inv.number || '—')}</span></div>
  <div class="kv"><span class="k">تاریخ</span><span class="v">${toPersianDigits(formatTaskDate(inv.issuedAt.slice(0, 10)))}</span></div>
  <div class="kv"><span class="k">مشتری</span><span class="v">${esc(deal.customerName || customer?.name || '')}</span></div>
  ${phone ? `<div class="kv"><span class="k">تلفن</span><span class="v" dir="ltr">${toPersianDigits(esc(phone))}</span></div>` : ''}
  <hr class="hr">
  ${rows || '<div style="text-align:center">—</div>'}
  <div class="sum">
    ${t.totalDiscount ? `<div class="kv"><span class="k">تخفیف</span><span class="v">${fmt(t.totalDiscount)}</span></div>` : ''}
    ${t.tax ? `<div class="kv"><span class="k">مالیات (${toPersianDigits(inv.taxPercent || 0)}٪)</span><span class="v">${fmt(t.tax)}</span></div>` : ''}
  </div>
  <div class="pay"><span>قابل پرداخت (${unitName()})</span><span>${fmt(t.payable)}</span></div>
  ${inv.paid ? '<div class="paid">پرداخت شده</div>' : ''}
  ${inv.note ? `<hr class="hr"><div style="font-weight:600">${esc(inv.note)}</div>` : ''}
  ${code ? `<div class="bc">${code128Svg(code, 44)}<div class="num">${esc(code)}</div></div>` : ''}
  <hr class="hr">
  <div class="ft">صادرکننده: ${esc(inv.issuedByName || issuerName)}<br>سپاس از خرید شما</div>
</div></div>
</body></html>`;
}

/**
 * The new window cannot carry a script of its own (the site's security policy, script-src 'self', forbids inline scripts in it), so the buttons are
 * wired from here: the window is of the same site, and these functions run in the page that opened it.
 */
function wireThermalWindow(w: Window, size: ThermalSize): (() => void) | undefined {
  const d = w.document;
  const sel = d.getElementById('sz') as HTMLSelectElement | null;
  const mm = d.getElementById('mm') as HTMLInputElement | null;
  const paper = d.getElementById('paper') as HTMLElement | null;
  const pg = d.getElementById('pg') as HTMLStyleElement | null;
  const hint = d.getElementById('hint') as HTMLElement | null;
  if (!sel || !mm || !paper || !pg || !hint) return undefined;
  const apply = () => {
    const id = sel.value as ThermalSize;
    const s = THERMAL_SIZES.find((x) => x.id === id) || THERMAL_SIZES[0];
    let width = 80;
    let page = s.page;
    if (id === 'custom') {
      width = Math.min(200, Math.max(30, Number(mm.value) || 80));
      page = `${width}mm auto`;
    } else if (id !== 'auto') {
      width = parseFloat(s.width) + 8;
    }
    mm.style.display = id === 'custom' ? 'inline-block' : 'none';
    paper.style.width = `${width}mm`;
    pg.textContent = `@page { size: ${page}; margin: 2mm; }`;
    hint.textContent = id === 'auto'
      ? 'اندازهٔ کاغذ را همان پرینتری که در پنجرهٔ چاپ انتخاب می‌کنید تعیین می‌کند؛ حروف و بارکد خودکار با عرض آن تنظیم می‌شوند. پیش‌نمایش بالا فقط نمونه‌ای ۸۰ میلی‌متری است.'
      : `کاغذ روی «${s.label}» ثابت شده است. اگر پرینتر چیز دیگری نشان می‌دهد، در پنجرهٔ چاپ اندازهٔ کاغذ همان پرینتر را هم انتخاب کنید.`;
    rememberThermalSize(id);
    if (id === 'custom') rememberThermalMm(Number(mm.value) || 80);
  };
  const print = () => {
    const fonts = (w.document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    void (fonts ? fonts.ready : Promise.resolve()).then(() => w.print());
  };
  sel.addEventListener('change', apply);
  mm.addEventListener('input', apply);
  d.getElementById('go')?.addEventListener('click', print);
  d.getElementById('cl')?.addEventListener('click', () => w.close());
  w.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (e.key === 'Enter' && tag !== 'SELECT' && tag !== 'INPUT') {
      e.preventDefault();
      print();
    }
    if (e.key === 'Escape') w.close();
  });
  apply();
  return print;
}

/** Opens the narrow invoice in a window of its own with a print button; the person picks the printer in the print window. Must be called from a click. */
export function openInvoiceThermal(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string, size: ThermalSize, customMm = 80) {
  if (!deal.invoice) return;
  rememberThermalSize(size);
  if (size === 'custom') rememberThermalMm(customMm);
  const w = window.open('', '_blank', 'width=460,height=760');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(buildThermalHtml(deal, customer, settings, issuerName, size, customMm));
  w.document.close();
  const print = wireThermalWindow(w, size);
  // «چاپ مستقیم» is installed on this computer (the browser starts with --kiosk-printing): the invoice goes to the printer at once and the window closes
  if (print && directPrintOn()) {
    w.addEventListener('afterprint', () => w.close());
    window.setTimeout(print, 400);
  }
}
