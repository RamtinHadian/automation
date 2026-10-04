/// <reference types="vite/client" />
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { issuerOf } from './proformaIssuer';
import { proformaReleased } from './proformaApproval';
import { toPersianDigits } from './jalali';
import { formatTaskDate, todayIso } from './taskDates';
import { numberToPersianWords } from './numberWords';
import type { ProformaRenderInput } from './proformaPdf';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');
const num = (v: string | number | undefined) => (v === undefined || v === '' ? '' : toPersianDigits(esc(String(v))));
/** Stored amounts are Toman; the official form is always in Rial. */
const rial = (toman: number) => toPersianDigits(Math.round(toman * 10).toLocaleString('en-US'));

/** Official issuers always get the tax-authority «صورتحساب فروش کالا و خدمات» form (landscape A4). */
export const usesOfficialForm = (input: Pick<ProformaRenderInput, 'deal' | 'settings'>) => issuerOf(input.deal, input.settings).kind === 'OFFICIAL';

interface Row {
  code: string;
  title: string;
  qty: number;
  unit: string;
  unitPrice: number;
  gross: number;
  discount: number;
  after: number;
  tax: number;
  total: number;
}

export function buildOfficialHtml(input: ProformaRenderInput, mode: 'print' | 'preview' | 'design' = 'print'): string {
  const { deal, customer, settings } = input;
  const issuer = issuerOf(deal, settings);
  const f = deal.proformaFields || {};
  const released = proformaReleased(deal, settings);
  const date = deal.proformaAt || todayIso();
  const dp = deal.discountPercent || 0;
  const tp = deal.taxPercent ?? 0;

  const rows: Row[] = (deal.items || [])
    .filter((i) => i.title.trim())
    .map((i) => {
      const gross = i.qty * i.unitPrice;
      const discount = Math.min(gross, (i.discount || 0) + Math.round(((gross - (i.discount || 0)) * dp) / 100));
      const after = gross - discount;
      const tax = Math.round((after * tp) / 100);
      return { code: i.code || '', title: i.title + (i.description ? ' — ' + i.description : ''), qty: i.qty, unit: i.unit || '', unitPrice: i.unitPrice, gross, discount, after, tax, total: after + tax };
    });
  const sum = (k: keyof Row) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const totalPayable = sum('total');

  const seller = {
    name: f.sellerName ?? issuer.name,
    eco: f.sellerEconomicCode ?? issuer.economicCode ?? '',
    nid: f.sellerNationalId ?? issuer.nationalId ?? '',
    reg: f.sellerRegistrationNumber ?? issuer.registrationNumber ?? '',
    province: f.sellerProvince ?? issuer.province ?? '',
    county: f.sellerCounty ?? issuer.county ?? '',
    city: f.sellerCity ?? issuer.city ?? '',
    address: f.sellerAddress ?? issuer.address ?? '',
    postal: f.sellerPostalCode ?? issuer.postalCode ?? '',
    phone: f.sellerPhone ?? issuer.phone ?? '',
  };
  const buyer = {
    name: f.buyerName ?? (customer?.kind === 'COMPANY' ? customer.company || customer.name : customer?.name || deal.customerName),
    eco: f.buyerEconomicCode ?? customer?.economicCode ?? '',
    nid: f.buyerNationalId ?? (customer?.kind === 'COMPANY' ? customer.nationalId : customer?.nationalCode) ?? '',
    reg: customer?.registrationNumber ?? '',
    province: f.buyerProvince ?? customer?.province ?? '',
    county: f.buyerCounty ?? '',
    city: f.buyerCity ?? customer?.city ?? '',
    address: f.buyerAddress ?? customer?.address ?? '',
    postal: f.buyerPostalCode ?? customer?.postalCode ?? '',
    phone: f.buyerPhones ?? (customer?.phones || []).join('، '),
  };
  const payment = f.paymentType || 'CASH';
  const serial = deal.proformaNumber || '';
  const logo = issuer.logoUrl;
  const stamp = released && issuer.stampUrl && f.showStamp !== false ? issuer.stampUrl : '';
  const sign = released && issuer.signatureUrl && f.showSignature !== false ? issuer.signatureUrl : '';
  const notes = [deal.notes, f.subject ?? deal.title ? `موضوع: ${f.subject ?? deal.title}` : ''].filter(Boolean).join(' — ');

  const cell = (label: string, value: string, wide = false) => `<div class="fd${wide ? ' w' : ''}"><span>${label}:</span><b>${value || '&nbsp;'}</b></div>`;
  const party = (title: string, p: typeof seller) => `
    <table class="sec"><tr><th class="side" rowspan="3">${title}</th>
      <td>${cell('نام شخص حقیقی / حقوقی', esc(p.name))}</td><td>${cell('شمارهٔ اقتصادی', num(p.eco))}</td><td>${cell('شمارهٔ ثبت / شمارهٔ شناسنامه', num(p.reg))}</td><td>${cell('شناسهٔ ملی / کد ملی', num(p.nid))}</td></tr>
      <tr><td>${cell('نشانی: استان', esc(p.province))}</td><td>${cell('شهرستان', esc(p.county))}</td><td>${cell('شهر', esc(p.city))}</td><td>${cell('کد پستی ۱۰ رقمی', num(p.postal))}</td></tr>
      <tr><td colspan="3">${cell('نشانی کامل', num(p.address), true)}</td><td>${cell('شمارهٔ تلفن / نمابر', num(p.phone))}</td></tr>
    </table>`;

  const body = rows
    .map(
      (r, i) => `<tr><td class="c">${toPersianDigits(i + 1)}</td><td class="c">${num(r.code)}</td><td>${esc(r.title)}</td><td class="c">${toPersianDigits(r.qty)}</td><td class="c">${esc(r.unit)}</td>
      <td class="n">${rial(r.unitPrice)}</td><td class="n">${rial(r.gross)}</td><td class="n">${rial(r.discount)}</td><td class="n">${rial(r.after)}</td><td class="n">${rial(r.tax)}</td><td class="n b">${rial(r.total)}</td></tr>`
    )
    .join('');
  const empty = Math.max(0, 4 - rows.length);
  const blankRows = Array.from({ length: empty }, (_, i) => `<tr class="e"><td class="c">${toPersianDigits(rows.length + i + 1)}</td>${'<td></td>'.repeat(10)}</tr>`).join('');

  const check = (on: boolean, text: string) => `<span class="ck"><i class="${on ? 'on' : ''}"></i>${text}</span>`;
  const printScript =
    mode === 'print' ? `<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 400); });</script>` : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>پیش‌فاکتور فروش ${esc(serial)} - ${esc(buyer.name)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${mode === 'print' ? '#e9e4de' : '#fff'}; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #000; font-size: 10.5px; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 297mm; min-height: 210mm; margin: 0 auto; background: #fff; padding: 8mm 9mm; position: relative; display: flex; flex-direction: column; gap: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
  .top { display: grid; grid-template-columns: 1fr 2fr 1fr; align-items: center; gap: 8px; }
  .top .logo img { max-height: 20mm; max-width: 48mm; object-fit: contain; display: block; }
  .top .ttl { text-align: center; font-size: 26px; font-weight: 900; }
  .top .ttl small { display: block; font-size: 9.5px; font-weight: 600; margin-top: 1px; }
  .top .nums { border: 1px solid #000; }
  .top .nums div { display: flex; justify-content: space-between; gap: 8px; padding: 2px 8px; }
  .top .nums div + div { border-top: 1px solid #000; }
  .sec th.side { width: 22px; background: #e8e8e8; font-weight: 800; writing-mode: vertical-rl; transform: rotate(180deg); text-align: center; padding: 2px; letter-spacing: 0; }
  .sec td { width: 25%; }
  .fd { display: flex; gap: 5px; align-items: baseline; min-height: 17px; }
  .fd span { white-space: nowrap; color: #333; font-size: 9.5px; }
  .fd b { font-weight: 700; word-break: break-word; }
  .head { background: #e8e8e8; text-align: center; font-weight: 800; padding: 3px; border: 1px solid #000; border-bottom: 0; }
  .items th { background: #e8e8e8; font-size: 9.5px; font-weight: 800; text-align: center; padding: 4px 3px; }
  .items td { font-size: 10.5px; padding: 3px 5px; }
  .items tr.e td { height: 19px; }
  .c { text-align: center; } .n { text-align: left; white-space: nowrap; direction: ltr; } .b { font-weight: 800; }
  .items tfoot td { background: #f3f3f3; font-weight: 800; }
  .words { border: 1px solid #000; padding: 4px 8px; font-weight: 700; }
  .cond { display: grid; grid-template-columns: 1fr 2fr; gap: 0; }
  .cond > div { border: 1px solid #000; padding: 4px 8px; min-height: 22mm; }
  .cond > div + div { border-right: 0; }
  .cond h5 { margin: 0 0 3px; font-size: 10.5px; font-weight: 800; }
  .ck { display: inline-flex; align-items: center; gap: 4px; margin-left: 14px; }
  .ck i { width: 11px; height: 11px; border: 1px solid #000; display: inline-block; position: relative; }
  .ck i.on::after { content: ''; position: absolute; inset: 1px; background: #000; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-top: auto; }
  .signs .s { border: 1px solid #000; height: 27mm; padding: 4px 8px; position: relative; font-weight: 800; }
  .signs .s + .s { border-right: 0; }
  .signs .s img { position: absolute; max-height: 21mm; max-width: 40mm; top: 50%; transform: translate(-50%, -45%); mix-blend-mode: multiply; opacity: .92; }
  .draft { text-align: center; color: #b42318; font-weight: 800; }
  ${mode === 'print' ? `.toolbar { position: fixed; top: 10px; left: 10px; } .toolbar button { font-family: inherit; font-weight: 800; border: 0; border-radius: 10px; padding: 9px 16px; cursor: pointer; background: #333; color: #fff; }
  @media print { html, body { background: #fff; } .page { margin: 0; } .toolbar { display: none; } }` : ''}
</style>
</head>
<body>
${mode === 'print' ? '<div class="toolbar"><button onclick="window.print()">چاپ / ذخیره به‌صورت PDF</button></div>' : ''}
<div class="page" data-official-form="1">
  <div class="top">
    <div class="logo">${logo ? `<img src="${esc(logo)}" alt="" />` : ''}</div>
    <div class="ttl">پیش‌فاکتور فروش</div>
    <div class="nums">
      <div><span>شمارهٔ سریال:</span><b>${num(serial)}</b></div>
      <div><span>تاریخ:</span><b>${formatTaskDate(date)}</b></div>
    </div>
  </div>
  ${party('مشخصات فروشنده', seller)}
  ${party('مشخصات خریدار', buyer)}
  <div>
    <div class="head">مشخصات کالا یا خدمات مورد معامله</div>
    <table class="items">
      <thead><tr><th style="width:26px">ردیف</th><th style="width:70px">کد کالا / شناسهٔ خدمت</th><th>شرح کالا یا خدمت</th><th style="width:44px">تعداد / مقدار</th><th style="width:50px">واحد اندازه‌گیری</th><th style="width:80px">مبلغ واحد (ریال)</th><th style="width:88px">مبلغ کل (ریال)</th><th style="width:76px">مبلغ تخفیف (ریال)</th><th style="width:88px">مبلغ کل پس از تخفیف (ریال)</th><th style="width:76px">جمع مالیات و عوارض (ریال)</th><th style="width:96px">جمع مبلغ کل پس از تخفیف به‌علاوهٔ مالیات و عوارض (ریال)</th></tr></thead>
      <tbody>${body}${blankRows}</tbody>
      <tfoot><tr><td colspan="6" class="c">جمع کل</td><td class="n">${rial(sum('gross'))}</td><td class="n">${rial(sum('discount'))}</td><td class="n">${rial(sum('after'))}</td><td class="n">${rial(sum('tax'))}</td><td class="n">${rial(totalPayable)}</td></tr></tfoot>
    </table>
  </div>
  <div class="words">مبلغ قابل پرداخت به حروف: ${numberToPersianWords(Math.round(totalPayable * 10))} ریال</div>
  <div class="cond">
    <div><h5>شرایط و نحوهٔ فروش</h5>${check(payment === 'CASH', 'نقدی')}${check(payment === 'CREDIT', 'غیرنقدی')}</div>
    <div><h5>توضیحات</h5>${nl(notes)}${f.bankInfo ?? issuer.bankInfo ? `<div style="margin-top:3px">${nl((f.bankInfo ?? issuer.bankInfo) as string)}</div>` : ''}</div>
  </div>
  <div class="signs">
    <div class="s">مهر و امضای فروشنده${stamp ? `<img src="${esc(stamp)}" alt="" style="left:62%" />` : ''}${sign ? `<img src="${esc(sign)}" alt="" style="left:36%" />` : ''}</div>
    <div class="s">مهر و امضای خریدار</div>
  </div>
  ${released ? '' : '<div class="draft">پیش‌نویس — هنوز توسط مدیرعامل تأیید نشده است</div>'}
</div>
${printScript}
</body>
</html>`;
}
