import { Warranty, WarrantySettings } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { dayText } from '../../lib/warranty';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** Opens the printable warranty certificate (A5-ish page: logo, the details, the terms and the signature boxes). */
export const printCertificate = (w: Warranty, settings: WarrantySettings, company: string): boolean => {
  const win = window.open('', '_blank');
  if (!win) return false;
  const row = (k: string, v: string) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : '');
  const km = w.maxKm && w.maxKm > 0 ? `${toPersianDigits(w.maxKm.toLocaleString('en-US'))} کیلومتر` : '';
  const terms = (settings.terms || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => `<li>${esc(l.trim())}</li>`).join('');
  win.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گواهی گارانتی ${esc(w.warrantyNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; color: #3A241F; margin: 0; }
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
  .sign { display: flex; gap: 20px; margin-top: 34px; }
  .sign div { flex: 1; border-top: 1px solid #8C6F66; padding-top: 6px; text-align: center; font-size: 12px; color: #8C6F66; }
  .foot { margin-top: 18px; font-size: 11px; color: #8C6F66; text-align: center; }
  @media print { .noprint { display: none; } }
  .noprint { text-align: center; margin: 14px; }
  .noprint button { font: inherit; padding: 8px 22px; border-radius: 10px; border: 0; background: #6E1B1B; color: #fff; cursor: pointer; }
</style></head><body>
<div class="noprint"><button onclick="window.print()">چاپ گواهی</button></div>
<div class="sheet">
  <div class="top"><img src="/images/logo-full.png" alt=""><div class="co">${esc(company)}</div></div>
  <h1>گواهی گارانتی</h1>
  <div class="no">شمارهٔ گارانتی: <b>${esc(toPersianDigits(w.warrantyNo))}</b></div>
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
  <div class="sign"><div>مهر و امضای فروشنده</div><div>امضای مشتری</div></div>
  <div class="foot">این گواهی همراه با فاکتور خرید معتبر است.</div>
</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 400); });</script>
</body></html>`);
  win.document.close();
  return true;
};
