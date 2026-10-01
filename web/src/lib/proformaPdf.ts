/// <reference types="vite/client" />
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { Customer, Deal, ProformaItem, SystemSettings } from '../types';
import { toPersianDigits } from './jalali';
import { formatTaskDate, isoToJalaliParts, todayIso } from './taskDates';
import { numberToPersianWords } from './numberWords';

export interface ProformaTotals {
  subtotal: number;
  discount: number;
  afterDiscount: number;
  tax: number;
  payable: number;
}

export const itemTotal = (i: ProformaItem) => Math.max(0, i.qty * i.unitPrice - (i.discount || 0));

/** Items → totals. The discount percentage applies to the sum of the items, tax to what is left. */
export function proformaTotals(items: ProformaItem[], discountPercent: number, taxPercent: number): ProformaTotals {
  const subtotal = items.reduce((s, i) => s + itemTotal(i), 0);
  const discount = Math.round((subtotal * (discountPercent || 0)) / 100);
  const afterDiscount = subtotal - discount;
  const tax = Math.round((afterDiscount * (taxPercent || 0)) / 100);
  return { subtotal, discount, afterDiscount, tax, payable: afterDiscount + tax };
}

const fmt = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

/** Next number of the form PF-1405-0007 (the sequence restarts every Jalali year). */
export function nextProformaNumber(deals: Deal[]): string {
  const year = isoToJalaliParts(todayIso())?.[0] || 1400;
  const prefix = `PF-${year}-`;
  const max = deals.reduce((m, d) => {
    const n = d.proformaNumber && d.proformaNumber.startsWith(prefix) ? parseInt(d.proformaNumber.slice(prefix.length), 10) : 0;
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return prefix + String(max + 1).padStart(4, '0');
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_PROFORMA_TERMS = [
  'اعتبار این پیش‌فاکتور تا تاریخ ذکرشده است و پس از آن قیمت‌ها قابل تغییر است.',
  'این پیش‌فاکتور صرفاً جهت اعلام قیمت است و ارزش فاکتور رسمی ندارد.',
  'شروع کار / تحویل پس از تأیید و پرداخت پیش‌پرداخت انجام می‌شود.',
].join('\n');

/**
 * Opens a print-ready proforma invoice in a new window (use «Save as PDF» in the print dialog).
 * The window must be opened from a click so the browser does not block it.
 */
export function openProformaPdf(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string) {
  const items = deal.items && deal.items.length ? deal.items : [];
  const t = proformaTotals(items, deal.discountPercent || 0, deal.taxPercent ?? 0);
  const date = deal.proformaAt || todayIso();
  const valid = deal.validUntil || addDaysIso(date, settings.proformaValidDays || 7);
  const company = settings.proformaCompanyName?.trim() || settings.companyName || 'شرکت';
  const logo = settings.companyLogoUrl;
  const terms = (deal.terms ?? settings.proformaTerms ?? DEFAULT_PROFORMA_TERMS).trim();
  const contact = [settings.companyAddress, settings.companyPhone && `تلفن: ${settings.companyPhone}`, settings.companyWebsite, settings.companyEconomicCode && `کد اقتصادی: ${settings.companyEconomicCode}`]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ');

  const rows = items
    .map(
      (i, idx) => `
      <tr>
        <td class="c">${toPersianDigits(idx + 1)}</td>
        <td>${esc(i.title)}${i.description ? `<div class="sub">${nl(i.description)}</div>` : ''}</td>
        <td class="c">${toPersianDigits(i.qty)}${i.unit ? ' ' + esc(i.unit) : ''}</td>
        <td class="n">${fmt(i.unitPrice)}</td>
        <td class="n">${i.discount ? fmt(i.discount) : '—'}</td>
        <td class="n b">${fmt(itemTotal(i))}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>پیش‌فاکتور ${esc(deal.proformaNumber || '')} - ${esc(customer?.name || deal.customerName)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e9e4de; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #2a1f1c; font-size: 12px; line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 14mm 14mm 12mm; position: relative; display: flex; flex-direction: column; }
  .band { position: absolute; top: 0; right: 0; left: 0; height: 6mm; background: linear-gradient(90deg, #6E1B1B, #D34A32); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 6mm; padding-bottom: 8px; border-bottom: 2px solid #6E1B1B; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { height: 18mm; max-width: 40mm; object-fit: contain; }
  .brand h1 { margin: 0; font-size: 18px; font-weight: 900; color: #6E1B1B; }
  .brand .sub { font-size: 10.5px; color: #8C6F66; }
  .title { text-align: left; }
  .title .t { font-size: 24px; font-weight: 900; color: #3A241F; letter-spacing: -.5px; }
  .title .en { font-size: 10px; letter-spacing: 3px; color: #C98B6A; font-weight: 700; direction: ltr; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
  .meta div { background: #FAF5F1; border: 1px solid #EBDBCE; border-radius: 8px; padding: 6px 10px; }
  .meta span { display: block; font-size: 9.5px; color: #8C6F66; }
  .meta b { font-size: 12.5px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .box { border: 1px solid #EBDBCE; border-radius: 10px; overflow: hidden; }
  .box h3 { margin: 0; padding: 5px 12px; background: #6E1B1B; color: #fff; font-size: 11px; font-weight: 800; }
  .box .in { padding: 8px 12px; font-size: 11.5px; }
  .box .in div { margin: 1px 0; }
  .box .in .lbl { color: #8C6F66; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  thead th { background: #3A241F; color: #fff; font-size: 10.5px; font-weight: 700; padding: 7px 8px; }
  thead th:first-child { border-radius: 0 8px 0 0; } thead th:last-child { border-radius: 8px 0 0 0; }
  tbody td { padding: 7px 8px; border-bottom: 1px solid #EBDBCE; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #FCF9F6; }
  .c { text-align: center; } .n { text-align: left; white-space: nowrap; } .b { font-weight: 800; }
  .sub { font-size: 10px; color: #8C6F66; margin-top: 1px; }
  .bottom { display: grid; grid-template-columns: 1.15fr 1fr; gap: 12px; margin-top: 12px; align-items: start; }
  .totals { border: 1px solid #EBDBCE; border-radius: 10px; overflow: hidden; }
  .totals .r { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid #F3E8DF; font-size: 11.5px; }
  .totals .r.pay { background: #6E1B1B; color: #fff; font-size: 13.5px; font-weight: 900; border: 0; padding: 9px 12px; }
  .words { margin-top: 8px; padding: 8px 12px; border: 1px dashed #C98B6A; border-radius: 10px; background: #FFFBF7; font-size: 11px; }
  .words b { color: #6E1B1B; }
  .terms h4, .bank h4 { margin: 0 0 3px; font-size: 11.5px; color: #6E1B1B; font-weight: 800; }
  .terms ol { list-style-type: persian; margin: 0; padding: 0 16px 0 0; font-size: 10.5px; color: #4a3b36; }
  .bank { margin-top: 8px; font-size: 10.5px; color: #4a3b36; }
  .sign { margin-top: auto; padding-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sign .s { height: 30mm; border: 1px solid #EBDBCE; border-radius: 10px; padding: 6px 12px; font-size: 10.5px; color: #8C6F66; position: relative; text-align: center; }
  .sign .s .who { position: absolute; bottom: 4px; right: 0; left: 0; font-size: 9.5px; color: #4a3b36; }
  .sign .s img { position: absolute; max-height: 22mm; max-width: 40mm; left: 62%; top: 50%; transform: translate(-50%, -45%); mix-blend-mode: multiply; opacity: .92; }
  footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #EBDBCE; display: flex; justify-content: space-between; font-size: 9.5px; color: #8C6F66; }
  .toolbar { position: fixed; top: 10px; left: 10px; display: flex; gap: 8px; }
  .toolbar button { font-family: inherit; font-weight: 800; border: 0; border-radius: 10px; padding: 9px 16px; cursor: pointer; background: #6E1B1B; color: #fff; }
  @media print { html, body { background: #fff; } .page { margin: 0; } .toolbar { display: none; } }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">چاپ / ذخیره به‌صورت PDF</button></div>
<div class="page">
  <div class="band"></div>
  <header>
    <div class="brand">
      ${logo ? `<img src="${esc(logo)}" alt="" />` : ''}
      <div>
        <h1>${esc(company)}</h1>
        ${settings.companySubtitle ? `<div class="sub">${esc(settings.companySubtitle)}</div>` : ''}
      </div>
    </div>
    <div class="title"><div class="t">پیش‌فاکتور فروش</div><div class="en">PROFORMA INVOICE</div></div>
  </header>

  <div class="meta">
    <div><span>شمارهٔ پیش‌فاکتور</span><b>${toPersianDigits(deal.proformaNumber || '—')}</b></div>
    <div><span>تاریخ صدور</span><b>${formatTaskDate(date)}</b></div>
    <div><span>اعتبار تا</span><b>${formatTaskDate(valid)}</b></div>
  </div>

  <div class="parties">
    <div class="box"><h3>فروشنده</h3><div class="in">
      <div><b>${esc(company)}</b></div>
      ${settings.companyAddress ? `<div><span class="lbl">نشانی:</span> ${esc(settings.companyAddress)}</div>` : ''}
      ${settings.companyPhone ? `<div><span class="lbl">تلفن:</span> ${toPersianDigits(esc(settings.companyPhone))}</div>` : ''}
      ${settings.companyEconomicCode ? `<div><span class="lbl">کد اقتصادی:</span> ${toPersianDigits(esc(settings.companyEconomicCode))}</div>` : ''}
      <div><span class="lbl">تنظیم‌کننده:</span> ${esc(issuerName)}</div>
    </div></div>
    <div class="box"><h3>خریدار</h3><div class="in">
      <div><b>${esc(customer?.name || deal.customerName)}</b></div>
      ${customer?.company ? `<div><span class="lbl">شرکت:</span> ${esc(customer.company)}</div>` : ''}
      ${customer?.phones?.length ? `<div><span class="lbl">تلفن:</span> ${customer.phones.map((p) => toPersianDigits(esc(p))).join('، ')}</div>` : ''}
      ${customer?.address ? `<div><span class="lbl">نشانی:</span> ${esc(customer.address)}</div>` : ''}
      ${customer?.email ? `<div><span class="lbl">ایمیل:</span> <span dir="ltr">${esc(customer.email)}</span></div>` : ''}
      <div><span class="lbl">موضوع:</span> ${esc(deal.title)}</div>
    </div></div>
  </div>

  <table>
    <thead><tr><th style="width:34px">ردیف</th><th>شرح کالا / خدمات</th><th style="width:70px">تعداد</th><th style="width:100px">قیمت واحد (تومان)</th><th style="width:80px">تخفیف</th><th style="width:110px">مبلغ کل (تومان)</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="c">—</td></tr>'}</tbody>
  </table>

  <div class="bottom">
    <div class="terms">
      <h4>شرایط و توضیحات</h4>
      <ol>${terms.split('\n').filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      ${deal.notes ? `<div style="margin-top:6px;font-size:10.5px"><b>توضیح:</b> ${nl(deal.notes)}</div>` : ''}
      ${settings.proformaBankInfo ? `<div class="bank"><h4>اطلاعات پرداخت</h4>${nl(settings.proformaBankInfo)}</div>` : ''}
    </div>
    <div>
      <div class="totals">
        <div class="r"><span>جمع کل</span><b>${fmt(t.subtotal)}</b></div>
        ${t.discount ? `<div class="r"><span>تخفیف (${toPersianDigits(deal.discountPercent || 0)}٪)</span><b>${fmt(t.discount)}</b></div>` : ''}
        ${t.tax ? `<div class="r"><span>مالیات بر ارزش افزوده (${toPersianDigits(deal.taxPercent || 0)}٪)</span><b>${fmt(t.tax)}</b></div>` : ''}
        <div class="r pay"><span>مبلغ قابل پرداخت (تومان)</span><span>${fmt(t.payable)}</span></div>
      </div>
      <div class="words">مبلغ به حروف: <b>${numberToPersianWords(t.payable)} تومان</b></div>
    </div>
  </div>

  <div class="sign">
    <div class="s"><b>مهر و امضای فروشنده</b>${settings.ceoName ? `<div class="who">${esc(settings.ceoName)}${settings.ceoTitle ? ' — ' + esc(settings.ceoTitle) : ''}</div>` : ''}${settings.companyStampUrl ? `<img src="${esc(settings.companyStampUrl)}" alt="" />` : ''}${settings.ceoSignatureUrl ? `<img src="${esc(settings.ceoSignatureUrl)}" alt="" style="left: 36%" />` : ''}</div>
    <div class="s">تأیید و امضای خریدار</div>
  </div>

  <footer><span>${contact || esc(company)}</span><span>${toPersianDigits(deal.proformaNumber || '')}</span></footer>
</div>
<script>
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 400); });
</script>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ پیش‌فاکتور را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
