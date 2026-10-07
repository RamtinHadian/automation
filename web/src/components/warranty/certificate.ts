import { Warranty, WarrantySettings } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { dayText, codeText } from '../../lib/warranty';
import { todayIso } from '../../lib/taskDates';
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Opens the printable warranty certificate (A5-ish page: logo, the details, the terms and the signature boxes). */
export const printCertificate = (w: Warranty, settings: WarrantySettings, company: string): boolean => {
  const win = window.open('', '_blank');
  if (!win) return false;
  const issued = dayText(todayIso());
  const autoSeal = `<svg class="seal" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" font-family="Vazirmatn, Tahoma, sans-serif" fill="#1F4E8C" text-anchor="middle">
    <circle cx="80" cy="80" r="76" fill="none" stroke="#1F4E8C" stroke-width="3"/><circle cx="80" cy="80" r="68" fill="none" stroke="#1F4E8C" stroke-width="1"/>
    <text x="80" y="52" font-size="13" font-weight="800">${esc(company.slice(0, 22))}</text>
    <text x="80" y="82" font-size="15" font-weight="800">مهر دیجیتال</text>
    <text x="80" y="104" font-size="11" direction="ltr" unicode-bidi="plaintext">${esc(codeText(w.warrantyNo))}</text>
    <text x="80" y="124" font-size="10">${esc(issued)}</text></svg>`;
  const stampHtml = settings.stampImage ? `<img class="seal" src="${settings.stampImage}" alt="">` : autoSeal;
  const signHtml = (settings.signatureImage ? `<img class="sigimg" src="${settings.signatureImage}" alt="">` : '') + (settings.signerName ? `<div class="signer">${esc(settings.signerName)}${settings.signerTitle ? ` — ${esc(settings.signerTitle)}` : ''}</div>` : '');
  const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '');
  const km = w.maxKm && w.maxKm > 0 ? `${toPersianDigits(w.maxKm.toLocaleString('en-US')).replace(/,/g, '٬')} کیلومتر` : '';
  const terms = (settings.terms || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => `<li>${esc(l.trim())}</li>`).join('');
  win.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گواهی گارانتی ${esc(w.warrantyNo)}</title>
<style>
  @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Vazirmatn', Tahoma, sans-serif; color: #3A241F; margin: 0; }
  .sheet { border: 2px solid #6E1B1B; border-radius: 14px; padding: 22px 26px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #EBDBCE; padding-bottom: 14px; }
  .top img { height: 54px; }
  .top .co { font-weight: 800; font-size: 15px; }
  h1 { text-align: center; font-size: 22px; margin: 18px 0 4px; color: #6E1B1B; }
  .no { text-align: center; font-size: 13px; color: #8C6F66; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { width: 32%; text-align: right; background: #FAF5F1; padding: 8px 12px; border: 1px solid #EBDBCE; font-weight: 700; }
  td { padding: 8px 12px; border: 1px solid #EBDBCE; }
  h2 { font-size: 14px; margin: 18px 0 6px; }
  ol { margin: 0; padding-right: 20px; font-size: 12px; line-height: 2; }
  .sign { display: flex; gap: 20px; margin-top: 100px; }
  .sign > div { flex: 1; border-top: 1px solid #8C6F66; padding-top: 6px; text-align: center; font-size: 12px; color: #8C6F66; }
  .foot { margin-top: 18px; font-size: 11px; color: #8C6F66; text-align: center; }
  .sign > div { position: relative; min-height: 40px; }
  .seal { position: absolute; left: 50%; top: -96px; margin-left: 6px; width: 100px; height: 100px; opacity: .9; }
  .sigimg { position: absolute; right: 50%; top: -70px; margin-right: 6px; height: 64px; max-width: 120px; }
  .signer { margin-top: 4px; font-weight: 700; color: #3A241F; }
  .sign .seller { padding-top: 6px; }
  body.plain .seal, body.plain .sigimg, body.plain .signer { display: none; }
  .noprint label { margin-inline: 12px; font-size: 13px; cursor: pointer; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin: 14px; }
  .noprint button { font: inherit; padding: 8px 22px; border-radius: 10px; border: 0; background: #6E1B1B; color: #fff; cursor: pointer; }
</style></head><body>
<div class="noprint"><label><input type="checkbox" id="dg" checked> مهر و امضای دیجیتال</label><button onclick="window.print()">چاپ گواهی</button></div>
<div class="sheet">
  <div class="top"><img src="/images/logo-full.png" alt=""><div class="co">${esc(company)}</div></div>
  <h1>گواهی گارانتی</h1>
  <div class="no">شمارهٔ گارانتی: <b>${esc(codeText(w.warrantyNo))}</b></div>
  <table>
    ${row('نام مشتری', w.customerName)}
    ${row('نام کالا', w.productName)}
    ${row('کد کالا', w.productCode ? toPersianDigits(w.productCode) : '')}
    ${row('شمارهٔ سریال / بچ', w.serial ? toPersianDigits(w.serial) : '')}
    ${row('شمارهٔ فاکتور فروش', w.invoiceNumber ? toPersianDigits(w.invoiceNumber) : '')}
    ${row('تاریخ فروش', dayText(w.saleDate))}
    ${row('شروع گارانتی', dayText(w.startDate))}
    ${row('پایان گارانتی', dayText(w.endDate))}
    ${row('مدت گارانتی', `${toPersianDigits(w.months)} ماه`)}
    ${row('سقف کارکرد', km)}
    ${row('توضیحات', w.notes || '')}
  </table>
  ${terms ? `<h2>شرایط گارانتی</h2><ol>${terms}</ol>` : ''}
  <div class="sign"><div class="seller">${stampHtml}مهر و امضای فروشنده${signHtml}</div><div>امضای مشتری</div></div>
  <div class="foot">این گواهی همراه با فاکتور خرید معتبر است.</div>
</div>
<script>
document.getElementById('dg').addEventListener('change', function (e) { document.body.classList.toggle('plain', !e.target.checked); });
window.addEventListener('load', function () { (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(function () { window.print(); }, 300); }); });
</script>
</body></html>`);
  win.document.close();
  return true;
};
