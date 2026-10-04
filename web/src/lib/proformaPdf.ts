/// <reference types="vite/client" />
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { issuerOf, MAIN_ISSUER_ID, titleFor } from './proformaIssuer';
import { proformaReleased } from './proformaApproval';
import { Customer, Deal, ProformaHeaderItem, ProformaItem, ProformaSectionId, ProformaTemplate, SystemSettings } from '../types';
import { normalizeTemplate } from './proformaTemplates';
import { toPersianDigits } from './jalali';
import { formatTaskDate, isoToJalaliParts, todayIso } from './taskDates';
import { numberToPersianWords } from './numberWords';
import { formatMoney, toDisplay, unitName } from './money';

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

const fmt = (n: number) => formatMoney(n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const nl = (s: string) => esc(s).replace(/\n/g, '<br>');

export const DEFAULT_NUMBER_FORMAT = 'PF-{YYYY}-{NNNN}';

const jalaliYear = () => isoToJalaliParts(todayIso())?.[0] || 1400;
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fills a number pattern: {YYYY}/{YY} the Jalali year, {NNNN} the running number padded to as many digits as N's. */
export function formatProformaNumber(format: string, seq: number, year = jalaliYear()): string {
  const y = String(year);
  return (format || DEFAULT_NUMBER_FORMAT)
    .replace(/\{(YYYY|YY)\}/g, (_m, t) => (t === 'YY' ? y.slice(-2) : y))
    .replace(/\{(N+)\}/g, (_m, n: string) => String(seq).padStart(n.length, '0'));
}

/** The next free number for the pattern: the highest running number already used this year + 1 (never below the start). */
export function nextProformaNumber(deals: Deal[], tpl?: { numberFormat?: string; numberStart?: number }): string {
  let format = tpl?.numberFormat?.trim() || DEFAULT_NUMBER_FORMAT;
  if (!/\{N+\}/.test(format)) format += '-{NNNN}'; // a number without a running part could never be unique
  const start = Math.max(0, Math.floor(tpl?.numberStart ?? 1));
  const year = String(jalaliYear());
  let pattern = '';
  let last = 0;
  for (const m of format.matchAll(/\{(YYYY|YY|N+)\}/g)) {
    pattern += escapeRe(format.slice(last, m.index));
    pattern += m[1] === 'YYYY' ? year : m[1] === 'YY' ? year.slice(-2) : '(\\d+)';
    last = (m.index ?? 0) + m[0].length;
  }
  pattern += escapeRe(format.slice(last));
  const re = new RegExp('^' + pattern + '$');
  const max = deals.reduce((mx, d) => {
    const m = d.proformaNumber ? re.exec(d.proformaNumber) : null;
    return m ? Math.max(mx, parseInt(m[1], 10) || 0) : mx;
  }, -1);
  return formatProformaNumber(format, max < 0 ? start : Math.max(max + 1, start));
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

export interface ProformaRenderInput {
  deal: Deal;
  customer?: Customer;
  settings: SystemSettings;
  issuerName: string;
  template?: ProformaTemplate | null;
}

/**
 * Builds the invoice page. `mode` print = opened for printing, preview = shown as is (used by the designer),
 * design = preview whose sections and header items can be dragged to reorder (posts `pf-reorder` to the parent).
 */
export function buildProformaHtml(input: ProformaRenderInput, mode: 'print' | 'preview' | 'design' = 'print'): string {
  const { deal, customer, settings, issuerName } = input;
  const tpl = normalizeTemplate(input.template ?? settings.proformaTemplate);
  const c = tpl.colors;
  const items = deal.items && deal.items.length ? deal.items : [];
  const t = proformaTotals(items, deal.discountPercent || 0, deal.taxPercent ?? 0);
  const date = deal.proformaAt || todayIso();
  const valid = deal.validUntil || addDaysIso(date, settings.proformaValidDays || 7);
  const f = deal.proformaFields || {};
  // with the approval setting on, the CEO's stamp and signature appear only after the CEO approved the proforma
  const released = proformaReleased(deal, settings);
  // A name that was cleared on purpose stays blank; only a name that was never set falls back to the company name.
  // The company that issues it: the organisation itself or one of the other companies / offices.
  const issuer = issuerOf(deal, settings);
  const isMain = issuer.id === MAIN_ISSUER_ID;
  const official = issuer.kind === 'OFFICIAL';
  const company = f.sellerName ?? issuer.name;
  const sellerAddress = f.sellerAddress ?? issuer.address ?? '';
  const sellerPhone = f.sellerPhone ?? issuer.phone ?? '';
  const sellerEco = f.sellerEconomicCode ?? issuer.economicCode ?? '';
  const sellerNid = f.sellerNationalId ?? issuer.nationalId ?? '';
  const sellerReg = f.sellerRegistrationNumber ?? issuer.registrationNumber ?? '';
  const sellerPostal = f.sellerPostalCode ?? issuer.postalCode ?? '';
  const buyerNid = f.buyerNationalId ?? (customer?.kind === 'COMPANY' ? customer.nationalId : customer?.nationalCode) ?? '';
  const buyerEco = f.buyerEconomicCode ?? customer?.economicCode ?? '';
  const buyerPostal = f.buyerPostalCode ?? customer?.postalCode ?? '';
  const hasCodes = official || items.some((i) => i.code);
  const buyerName = f.buyerName ?? (customer?.name || deal.customerName);
  const buyerCompany = f.buyerCompany ?? customer?.company ?? '';
  const buyerPhones = f.buyerPhones ?? (customer?.phones || []).join('، ');
  const buyerAddress = f.buyerAddress ?? customer?.address ?? '';
  const buyerEmail = f.buyerEmail ?? customer?.email ?? '';
  const subject = f.subject ?? deal.title;
  const bankInfo = f.bankInfo ?? issuer.bankInfo ?? '';
  const titleText = f.title ?? titleFor(issuer, tpl.title);
  const footerText = f.footerText ?? tpl.footerText;
  const logo = isMain ? tpl.logoUrl || issuer.logoUrl : issuer.logoUrl;
  const stampImg = issuer.stampUrl;
  const signatureImg = issuer.signatureUrl;
  const terms = (deal.terms ?? settings.proformaTerms ?? DEFAULT_PROFORMA_TERMS).trim();
  const design = mode === 'design';

  const contactLines = [
    tpl.contact.address && sellerAddress,
    tpl.contact.phone && sellerPhone && `تلفن: ${sellerPhone}`,
    tpl.contact.economicCode && sellerEco && `کد اقتصادی: ${sellerEco}`,
    tpl.contact.website && issuer.website,
  ].filter(Boolean) as string[];
  const allContact = [sellerAddress, sellerPhone && `تلفن: ${sellerPhone}`, sellerEco && `کد اقتصادی: ${sellerEco}`, issuer.website].filter(Boolean) as string[];

  // ---- header ----
  const last = tpl.headerOrder.length - 1;
  const headerItem = (id: ProformaHeaderItem, idx: number) => {
    const attr = `data-hdr="${id}"`;
    if (id === 'logo') {
      if (logo && tpl.showLogo) return `<div class="h-logo" ${attr}><img src="${esc(logo)}" alt="" style="height:${tpl.logoSize}mm" /></div>`;
      if (design && tpl.showLogo) return `<div class="h-logo ph" ${attr} style="height:${tpl.logoSize}mm;width:${tpl.logoSize}mm">لوگو</div>`;
      return '';
    }
    if (id === 'company') {
      return `<div class="h-company" ${attr}>${company.trim() ? `<h1>${esc(company)}</h1>` : ''}${issuer.subtitle ? `<div class="sub0">${esc(issuer.subtitle)}</div>` : ''}${contactLines.length ? `<div class="contact">${contactLines.map((l) => toPersianDigits(esc(l))).join('<br>')}</div>` : ''}</div>`;
    }
    const align = idx === last ? 'left' : idx === 0 ? 'right' : 'center';
    return `<div class="h-title" ${attr} style="text-align:${align}"><div class="t">${esc(titleText)}</div>${tpl.titleEn ? `<div class="en">${esc(tpl.titleEn)}</div>` : ''}</div>`;
  };
  const header = `<header class="hd-${tpl.headerStyle}">${tpl.headerOrder.map(headerItem).join('')}</header>`;

  // ---- sections ----
  const rows = items
    .map(
      (i, idx) => `
      <tr>
        <td class="c">${toPersianDigits(idx + 1)}</td>
        ${hasCodes ? `<td class="c">${i.code ? toPersianDigits(esc(i.code)) : '—'}</td>` : ''}
        <td>${esc(i.title)}${i.description ? `<div class="sub">${nl(i.description)}</div>` : ''}</td>
        <td class="c">${toPersianDigits(i.qty)}${i.unit ? ' ' + esc(i.unit) : ''}</td>
        <td class="n">${fmt(i.unitPrice)}</td>
        <td class="n">${i.discount ? fmt(i.discount) : '—'}</td>
        <td class="n b">${fmt(itemTotal(i))}</td>
      </tr>`
    )
    .join('');

  const body: Record<ProformaSectionId, string> = {
    meta: `<div class="meta">
      <div><span>شمارهٔ پیش‌فاکتور</span><b>${toPersianDigits(deal.proformaNumber || '—')}</b></div>
      <div><span>تاریخ صدور</span><b>${formatTaskDate(date)}</b></div>
      <div><span>اعتبار تا</span><b>${formatTaskDate(valid)}</b></div>
    </div>`,
    parties: `<div class="parties">
      <div class="box"><h3>فروشنده</h3><div class="in">
        ${company.trim() ? `<div><b>${esc(company)}</b></div>` : ''}
        ${sellerAddress ? `<div><span class="lbl">نشانی:</span> ${toPersianDigits(esc(sellerAddress))}</div>` : ''}
        ${sellerPhone ? `<div><span class="lbl">تلفن:</span> ${toPersianDigits(esc(sellerPhone))}</div>` : ''}
        ${sellerEco ? `<div><span class="lbl">کد اقتصادی:</span> ${toPersianDigits(esc(sellerEco))}</div>` : ''}
        ${sellerNid ? `<div><span class="lbl">شناسه ملی:</span> ${toPersianDigits(esc(sellerNid))}</div>` : ''}
        ${sellerReg ? `<div><span class="lbl">شمارهٔ ثبت:</span> ${toPersianDigits(esc(sellerReg))}</div>` : ''}
        ${sellerPostal ? `<div><span class="lbl">کد پستی:</span> ${toPersianDigits(esc(sellerPostal))}</div>` : ''}
        <div><span class="lbl">تنظیم‌کننده:</span> ${esc(issuerName)}</div>
      </div></div>
      <div class="box"><h3>خریدار</h3><div class="in">
        <div><b>${esc(buyerName)}</b></div>
        ${buyerCompany ? `<div><span class="lbl">شرکت:</span> ${esc(buyerCompany)}</div>` : ''}
        ${buyerPhones ? `<div><span class="lbl">تلفن:</span> ${toPersianDigits(esc(buyerPhones))}</div>` : ''}
        ${buyerAddress ? `<div><span class="lbl">نشانی:</span> ${esc(buyerAddress)}</div>` : ''}
        ${buyerNid ? `<div><span class="lbl">کد / شناسه ملی:</span> ${toPersianDigits(esc(buyerNid))}</div>` : ''}
        ${buyerEco ? `<div><span class="lbl">کد اقتصادی:</span> ${toPersianDigits(esc(buyerEco))}</div>` : ''}
        ${buyerPostal ? `<div><span class="lbl">کد پستی:</span> ${toPersianDigits(esc(buyerPostal))}</div>` : ''}
        ${buyerEmail ? `<div><span class="lbl">ایمیل:</span> <span dir="ltr">${esc(buyerEmail)}</span></div>` : ''}
        <div><span class="lbl">موضوع:</span> ${esc(subject)}</div>
      </div></div>
    </div>`,
    items: `<table class="ts-${tpl.tableStyle}">
      <thead><tr><th style="width:34px">ردیف</th>${hasCodes ? '<th style="width:90px">شناسه کالا / خدمت</th>' : ''}<th>شرح کالا / خدمات</th><th style="width:70px">تعداد</th><th style="width:100px">قیمت واحد (${unitName()})</th><th style="width:80px">تخفیف</th><th style="width:110px">مبلغ کل (تومان)</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${hasCodes ? 7 : 6}" class="c">—</td></tr>`}</tbody>
    </table>`,
    totals: `<div class="totals-wrap" style="justify-content:${tpl.totalsAlign === 'start' ? 'flex-start' : 'flex-end'}"><div class="tw">
      <div class="totals">
        <div class="r"><span>جمع کل</span><b>${fmt(t.subtotal)}</b></div>
        ${t.discount ? `<div class="r"><span>تخفیف (${toPersianDigits(deal.discountPercent || 0)}٪)</span><b>${fmt(t.discount)}</b></div>` : ''}
        ${t.tax ? `<div class="r"><span>مالیات بر ارزش افزوده (${toPersianDigits(deal.taxPercent || 0)}٪)</span><b>${fmt(t.tax)}</b></div>` : ''}
        <div class="r pay"><span>مبلغ قابل پرداخت (${unitName()})</span><span>${fmt(t.payable)}</span></div>
      </div>
      <div class="words">مبلغ به حروف: <b>${numberToPersianWords(toDisplay(t.payable))} ${unitName()}</b></div>
    </div></div>`,
    terms: `<div class="terms">
      <h4>شرایط و توضیحات</h4>
      <ol>${terms.split('\n').filter(Boolean).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      ${deal.notes ? `<div style="margin-top:6px;font-size:10.5px"><b>توضیح:</b> ${nl(deal.notes)}</div>` : ''}
      ${bankInfo ? `<div class="bank"><h4>اطلاعات پرداخت</h4>${nl(bankInfo)}</div>` : ''}
    </div>`,
    signatures: `<div class="sign">
      <div class="s"><b>مهر و امضای فروشنده</b>${issuer.ceoName ? `<div class="who">${esc(issuer.ceoName)}${issuer.ceoTitle ? ' — ' + esc(issuer.ceoTitle) : ''}</div>` : ''}${released && stampImg && f.showStamp !== false ? `<img src="${esc(stampImg)}" alt="" style="left:62%" />` : ''}${released && signatureImg && f.showSignature !== false ? `<img src="${esc(signatureImg)}" alt="" style="left:36%" />` : ''}</div>
      <div class="s"><b>تأیید و امضای خریدار</b></div>
    </div>${released ? '' : '<div style="text-align:center;color:#b42318;font-weight:bold;font-size:11px;margin-top:6px">پیش‌نویس — هنوز توسط مدیرعامل تأیید نشده است</div>'}`,
  };
  const visible = tpl.sections.filter((s) => s.visible);
  const sectionsHtml = visible
    .map((s, i) => `<section data-sec="${s.id}"${s.id === 'signatures' && i === visible.length - 1 ? ' class="push"' : ''}>${body[s.id]}</section>`)
    .join('');

  const footerContact = tpl.showFooterContact ? allContact.map((l) => toPersianDigits(esc(l))).join(' &nbsp;|&nbsp; ') : '';
  const footer = `<footer><span>${[footerText && esc(footerText), footerContact].filter(Boolean).join(' &nbsp;—&nbsp; ') || esc(company)}</span><span>${toPersianDigits(deal.proformaNumber || '')}</span></footer>`;

  const dragScript = design
    ? `<script>(function(){var drag=null;document.querySelectorAll('[data-sec],[data-hdr]').forEach(function(el){el.setAttribute('draggable','true');
el.addEventListener('dragstart',function(e){drag=el;el.classList.add('dragging');e.dataTransfer.setData('text/plain','x');e.dataTransfer.effectAllowed='move';});
el.addEventListener('dragend',function(){el.classList.remove('dragging');document.querySelectorAll('.over').forEach(function(x){x.classList.remove('over')});drag=null;});
el.addEventListener('dragover',function(e){if(!drag||drag===el)return;var ok=(drag.dataset.sec&&el.dataset.sec)||(drag.dataset.hdr&&el.dataset.hdr);if(!ok)return;e.preventDefault();el.classList.add('over');});
el.addEventListener('dragleave',function(){el.classList.remove('over')});
el.addEventListener('drop',function(e){e.preventDefault();if(!drag||drag===el)return;var k=drag.dataset.sec?'sec':'hdr';parent.postMessage({type:'pf-reorder',kind:k,from:drag.dataset.sec||drag.dataset.hdr,to:el.dataset.sec||el.dataset.hdr},'*');drag=null;});});})();</script>`
    : '';
  const printScript =
    mode === 'print'
      ? `<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 400); });</script>`
      : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>پیش‌فاکتور ${esc(deal.proformaNumber || '')} - ${esc(customer?.name || deal.customerName)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  :root { --p: ${c.primary}; --a: ${c.accent}; --th: ${c.tableHead}; --tht: ${c.tableHeadText}; --paper: ${c.paper}; --soft: ${c.soft}; --tx: ${c.text}; --r: ${tpl.radius}px; --fs: ${tpl.fontSize}px;
    --bd: color-mix(in srgb, var(--p) 16%, #fff); --mut: color-mix(in srgb, var(--tx) 55%, #fff); }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${mode === 'print' ? '#e9e4de' : '#fff'}; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: var(--tx); font-size: var(--fs); line-height: 1.7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: var(--paper); padding: 14mm 14mm 12mm; position: relative; display: flex; flex-direction: column; gap: 12px; }
  .band { position: absolute; top: 0; right: 0; left: 0; height: 6mm; background: linear-gradient(90deg, var(--p), var(--a)); }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; }
  header.hd-band { padding-top: 6mm; border-bottom: 2px solid var(--p); }
  header.hd-plain { border-bottom: 2px solid var(--p); }
  header.hd-boxed { background: var(--p); color: #fff; padding: 12px 16px; border-radius: var(--r); border-bottom: 4px solid var(--a); }
  .h-logo img { object-fit: contain; max-width: 52mm; display: block; }
  .h-logo.ph { display: flex; align-items: center; justify-content: center; border: 2px dashed var(--a); color: var(--a); font-size: 11px; border-radius: 8px; }
  .h-company { flex: 1; min-width: 0; }
  .h-company h1 { margin: 0; font-size: 1.5em; font-weight: 900; color: var(--p); }
  .hd-boxed .h-company h1 { color: #fff; }
  .h-company .sub0 { font-size: .88em; color: var(--mut); }
  .hd-boxed .h-company .sub0, .hd-boxed .h-company .contact { color: rgba(255,255,255,.85); }
  .h-company .contact { font-size: .8em; color: var(--mut); margin-top: 2px; }
  .h-title { white-space: nowrap; }
  .h-title .t { font-size: 2em; font-weight: 900; color: var(--tx); letter-spacing: -.5px; }
  .hd-boxed .h-title .t { color: #fff; }
  .h-title .en { font-size: .8em; letter-spacing: 3px; color: var(--a); font-weight: 700; direction: ltr; }
  .hd-boxed .h-title .en { color: #fff; opacity: .85; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .meta div { background: var(--soft); border: 1px solid var(--bd); border-radius: var(--r); padding: 6px 10px; }
  .meta span { display: block; font-size: .8em; color: var(--mut); }
  .meta b { font-size: 1.05em; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .box { border: 1px solid var(--bd); border-radius: var(--r); overflow: hidden; }
  .box h3 { margin: 0; padding: 5px 12px; background: var(--p); color: #fff; font-size: .95em; font-weight: 800; }
  .box .in { padding: 8px 12px; font-size: .96em; }
  .box .in div { margin: 1px 0; }
  .lbl { color: var(--mut); }
  table { width: 100%; border-collapse: separate; border-spacing: 0; }
  thead th { background: var(--th); color: var(--tht); font-size: .88em; font-weight: 700; padding: 7px 8px; }
  thead th:first-child { border-top-right-radius: var(--r); } thead th:last-child { border-top-left-radius: var(--r); }
  tbody td { padding: 7px 8px; vertical-align: top; }
  .ts-striped tbody td { border-bottom: 1px solid var(--bd); }
  .ts-striped tbody tr:nth-child(even) td { background: var(--soft); }
  .ts-lined tbody td { border-bottom: 1px solid var(--bd); }
  .ts-grid tbody td { border: 1px solid var(--bd); border-top: 0; border-left: 0; }
  .ts-grid tbody td:last-child { border-left: 1px solid var(--bd); }
  .c { text-align: center; } .n { text-align: left; white-space: nowrap; } .b { font-weight: 800; }
  .sub { font-size: .85em; color: var(--mut); margin-top: 1px; }
  .totals-wrap { display: flex; }
  .tw { width: 56%; }
  .totals { border: 1px solid var(--bd); border-radius: var(--r); overflow: hidden; }
  .totals .r { display: flex; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--bd); font-size: .96em; }
  .totals .r.pay { background: var(--p); color: #fff; font-size: 1.15em; font-weight: 900; border: 0; padding: 9px 12px; }
  .words { margin-top: 8px; padding: 8px 12px; border: 1px dashed var(--a); border-radius: var(--r); background: var(--soft); font-size: .93em; }
  .words b { color: var(--p); }
  .terms h4 { margin: 0 0 3px; font-size: .98em; color: var(--p); font-weight: 800; }
  .terms ol { list-style-type: persian; margin: 0; padding: 0 16px 0 0; font-size: .88em; color: var(--tx); }
  .bank { margin-top: 8px; font-size: .88em; }
  .bank h4 { margin: 0 0 3px; font-size: 1.1em; color: var(--p); font-weight: 800; }
  section.push { margin-top: auto; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .sign .s { height: 30mm; border: 1px solid var(--bd); border-radius: var(--r); padding: 6px 12px; font-size: .88em; color: var(--mut); position: relative; text-align: center; }
  .sign .s .who { position: absolute; bottom: 4px; right: 0; left: 0; font-size: .8em; color: var(--tx); }
  .sign .s img { position: absolute; max-height: 22mm; max-width: 40mm; top: 50%; transform: translate(-50%, -45%); mix-blend-mode: multiply; opacity: .92; }
  footer { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--bd); display: flex; justify-content: space-between; gap: 10px; font-size: .8em; color: var(--mut); }
  ${mode === 'print' ? `.toolbar { position: fixed; top: 10px; left: 10px; display: flex; gap: 8px; }
  .toolbar button { font-family: inherit; font-weight: 800; border: 0; border-radius: 10px; padding: 9px 16px; cursor: pointer; background: var(--p); color: #fff; }
  @media print { html, body { background: #fff; } .page { margin: 0; } .toolbar { display: none; } }` : ''}
  ${design ? `[data-sec], [data-hdr] { cursor: grab; outline: 1px dashed transparent; outline-offset: 3px; border-radius: 6px; user-select: none; }
  [data-sec]:hover, [data-hdr]:hover { outline-color: var(--a); }
  .dragging { opacity: .4; } .over { outline: 2px solid var(--a) !important; background-image: linear-gradient(rgba(0,0,0,.04), rgba(0,0,0,.04)); }
  img { -webkit-user-drag: none; pointer-events: none; }` : ''}
</style>
</head>
<body>
${mode === 'print' ? '<div class="toolbar"><button onclick="window.print()">چاپ / ذخیره به‌صورت PDF</button></div>' : ''}
<div class="page">
  ${tpl.headerStyle === 'band' ? '<div class="band"></div>' : ''}
  ${header}
  ${sectionsHtml}
  ${footer}
</div>
${printScript}${dragScript}
</body>
</html>`;
}

/** A made-up proforma used by the designer and the sample gallery. */
export function sampleProforma(settings: SystemSettings): ProformaRenderInput {
  const today = todayIso();
  return {
    settings,
    issuerName: 'کارشناس فروش',
    customer: { id: 'sample', name: 'علی رضایی', company: 'شرکت نمونه', phones: ['09121234567'], address: 'تهران، خیابان ولیعصر، پلاک ۱۰', email: 'ali@example.com', status: 'ACTIVE', tags: [], ownerId: '', ownerName: '', createdAt: today, updatedAt: today },
    deal: {
      id: 'sample', title: 'قرارداد پشتیبانی سالانه', customerId: 'sample', customerName: 'علی رضایی', amount: 0, stage: 'PROPOSAL', ownerId: '', ownerName: '', createdAt: today, updatedAt: today,
      proformaNumber: 'PF-1405-0001', proformaAt: today, validUntil: addDaysIso(today, settings.proformaValidDays || 7), discountPercent: 5, taxPercent: settings.proformaTaxPercent ?? 10,
      items: [
        { title: 'پشتیبانی و نگهداری سامانه', description: 'شامل پشتیبانی تلفنی و حضوری', qty: 12, unit: 'ماه', unitPrice: 4500000 },
        { title: 'نصب و راه‌اندازی', qty: 1, unit: 'مورد', unitPrice: 8000000, discount: 500000 },
        { title: 'آموزش کاربران', qty: 3, unit: 'جلسه', unitPrice: 2000000 },
      ],
    },
  };
}

/**
 * Opens a print-ready proforma invoice in a new window (use «Save as PDF» in the print dialog).
 * The window must be opened from a click so the browser does not block it.
 */
export function openProformaPdf(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string) {
  const html = buildProformaHtml({ deal, customer, settings, issuerName }, 'print');
  const w = window.open('', '_blank');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ پیش‌فاکتور را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
