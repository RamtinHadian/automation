import React, { useEffect, useMemo, useState } from 'react';
import { PackageSearch, Plus, Receipt, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { WarehousePicker, WarehouseProduct } from './WarehousePicker';
import { issuerById, issuersOf, officialProblems } from '../../lib/proformaIssuer';
import { proformaTotals } from '../../lib/proformaPdf';
import { canIssueInvoice } from '../../lib/invoice';
import { PersonPicker, customerItems } from '../common/PersonPicker';
import { MoneyInput, digitsOf } from '../common/MoneyInput';
import { askConfirm } from '../../lib/confirmDialog';

interface Row { title: string; code: string; unit: string; qty: string; price: string; discount: string }
const blank = (): Row => ({ title: '', code: '', unit: '', qty: '1', price: '', discount: '' });
const inp = 'w-full px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#C98B6A]';
const lbl = 'block text-[11px] font-black text-[#503730] mb-1 mt-2';
const num = (v: string) => Number(digitsOf(v)) || 0;

/**
 * «صدور فاکتور»: an invoice issued straight to a customer, with no proforma and no opportunity. The server numbers it (as set in the console), keeps it
 * like any other invoice (print, cancel, send to Sepidar) and counts it as a sale.
 */
export const StandaloneInvoiceDialog: React.FC<{ onClose: () => void; onIssued: () => void }> = ({ onClose, onIssued }) => {
  const { customers, settings, currentUser, showToast } = useAppContext();
  const issuers = issuersOf(settings);
  const [customerId, setCustomerId] = useState('');
  const [issuerId, setIssuerId] = useState(issuers[0].id);
  const issuer = issuerById(settings, issuerId);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [taxPercent, setTaxPercent] = useState<string>(String(issuers[0].taxPercent ?? 0));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // the warehouse: its products come with their prices; the seller puts one of them in the price box of the row
  const [catalog, setCatalog] = useState<WarehouseProduct[]>([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => { api.crmProducts().then((r) => setCatalog(r.products as WarehouseProduct[])).catch(() => setCatalog([])); }, []);
  const pickProduct = (p: WarehouseProduct) => {
    const line: Row = { title: p.title, code: p.code || '', unit: p.unit || '', qty: '1', price: p.prices && p.prices[0] ? String(toDisplay(p.prices[0].amount)) : '', discount: '' };
    setRows((cur) => {
      const last = cur[cur.length - 1];
      return last && !last.title.trim() && !last.code && !last.price ? [...cur.slice(0, -1), line] : [...cur, line];
    });
    setPicking(false);
  };
  const customer = customers.find((c) => c.id === customerId);
  const kind = issuer.kind === 'OFFICIAL' ? 'OFFICIAL' : 'UNOFFICIAL';
  const items = useMemo(() => rows.filter((r) => r.title.trim()).map((r) => ({ id: '', title: r.title.trim(), code: r.code.trim(), unit: r.unit.trim(), qty: num(r.qty) || 0, unitPrice: fromDisplay(num(r.price)), discount: fromDisplay(num(r.discount)) })), [rows]);
  const totals = proformaTotals(items as never, Number(discountPercent) || 0, Number(taxPercent) || 0);
  const set = (i: number, k: keyof Row, v: string) => setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  // what an official invoice still lacks (the same rule as for the invoice of a proforma)
  const lacks = useMemo(() => {
    if (kind !== 'OFFICIAL' || !customer) return [] as string[];
    const merged = {
      sellerName: issuer.name, sellerNationalId: issuer.nationalId, sellerEconomicCode: issuer.economicCode, sellerAddress: issuer.address, sellerPostalCode: issuer.postalCode, sellerProvince: issuer.province, sellerCity: issuer.city,
      buyerName: customer.name || customer.company, buyerNationalId: customer.kind === 'COMPANY' ? customer.nationalId : customer.nationalCode, buyerAddress: customer.address, buyerPostalCode: customer.postalCode, buyerProvince: customer.province, buyerCity: customer.city,
    };
    return officialProblems(merged as Parameters<typeof officialProblems>[0], items as never);
  }, [kind, customer, issuer, items]);
  const problem = !canIssueInvoice(currentUser) ? 'صدور فاکتور به شما اجازه داده نشده است.' : !customer ? 'مشتری را انتخاب کنید.' : items.length === 0 ? 'دست‌کم یک ردیف با عنوان بنویسید.' : items.some((i) => i.qty <= 0) ? 'تعداد هر ردیف باید بیشتر از صفر باشد.' : lacks.length ? `فاکتور رسمی این موارد را کم دارد: ${lacks.join('، ')}.` : '';

  const issue = async () => {
    const ok = await askConfirm(`«${kind === 'OFFICIAL' ? 'فاکتور رسمی' : 'فاکتور'}» برای «${customer?.name || ''}» به مبلغ ${formatMoney(totals.payable)} ${unitName()} صادر شود؟ بعد از صدور قابل ویرایش نیست (فقط ابطال).`, { tone: 'info', title: 'صدور فاکتور', confirmText: 'بله، صادر شود' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.invoiceStandalone({ customerId, issuerId, kind, items: items.map(({ id: _id, ...x }) => ({ ...x, discount: x.discount || undefined })), discountPercent: Number(discountPercent) || 0, taxPercent: Number(taxPercent) || 0, note });
      showToast(`فاکتور ${toPersianDigits(r.number || '')} صادر شد.`);
      onIssued();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'صدور فاکتور انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-3" onClick={onClose} dir="rtl" data-standalone-invoice>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-[#3A241F]"><Receipt className="w-5 h-5 text-emerald-700" />صدور فاکتور (بدون پیش‌فاکتور)</div>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-1.5 rounded-lg hover:bg-[#FAF5F1] cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>مشتری</label>
            <PersonPicker items={customerItems(customers)} title="مشتری" value={customerId} onChange={setCustomerId} placeholder="انتخاب مشتری…" />
          </div>
          <div>
            <label className={lbl}>فاکتور با نام کدام شرکت صادر شود؟</label>
            <select className={inp} value={issuerId} onChange={(e) => { setIssuerId(e.target.value); setTaxPercent(String(issuerById(settings, e.target.value).taxPercent ?? 0)); }}>
              {issuers.map((i) => <option key={i.id} value={i.id}>{i.label} · {i.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</option>)}
            </select>
          </div>
        </div>

        <div>
          <div className="text-[11.5px] font-black text-[#503730] mb-1">ردیف‌های فاکتور</div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-[#EBDBCE] bg-[#FFFBF8] p-2.5 space-y-2" data-invoice-row-edit>
                <div className="flex gap-2">
                  <input className={inp} value={r.title} onChange={(e) => set(i, 'title', e.target.value)} placeholder="عنوان کالا یا خدمت" />
                  {rows.length > 1 && <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="px-2 text-rose-700 cursor-pointer" aria-label="حذف ردیف"><X className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <input className={inp} value={r.code} onChange={(e) => set(i, 'code', e.target.value)} placeholder={kind === 'OFFICIAL' ? 'شناسهٔ کالا *' : 'شناسهٔ کالا'} />
                  <input className={inp} value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder={kind === 'OFFICIAL' ? 'واحد *' : 'واحد'} />
                  <input className={inp} inputMode="numeric" value={r.qty} onChange={(e) => set(i, 'qty', digitsOf(e.target.value))} placeholder="تعداد" />
                  <MoneyInput value={r.price} onChange={(d) => set(i, 'price', d)} placeholder={`قیمت واحد (${unitName()})`} unit={false} className={inp} />
                  <MoneyInput value={r.discount} onChange={(d) => set(i, 'discount', d)} placeholder="تخفیف ردیف" unit={false} className={inp} />
                </div>
                {(() => {
                  const prod = catalog.find((x) => x.code && x.code === r.code.trim());
                  const ps = prod?.prices || [];
                  if (!ps.length) return null;
                  return (
                    <div className="flex flex-wrap items-center gap-1.5" data-product-prices>
                      <span className="text-[10px] font-black text-amber-800">قیمت‌های این کالا:</span>
                      {ps.map((x) => (
                        <button key={x.title} type="button" onClick={() => set(i, 'price', String(toDisplay(x.amount)))} className={`px-2.5 py-1 rounded-full border text-[10.5px] font-black cursor-pointer ${num(r.price) === toDisplay(x.amount) ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>{x.title}: {formatMoney(x.amount)}</button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPicking(true)} className="mt-2 ml-2 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-black cursor-pointer" data-pick-product><PackageSearch className="w-3.5 h-3.5 inline ml-1" />انتخاب کالا از انبار</button>
          <button type="button" onClick={() => setRows((p) => [...p, blank()])} className="mt-2 px-3 py-1.5 rounded-xl border border-dashed border-[#C98B6A] text-[11px] font-black text-[#6E1B1B] cursor-pointer"><Plus className="w-3.5 h-3.5 inline ml-1" />ردیف تازه</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className={lbl}>تخفیف کل (٪)</label><input className={inp} inputMode="decimal" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div><label className={lbl}>ارزش افزوده (٪)</label><input className={inp} inputMode="decimal" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="col-span-2"><label className={lbl}>توضیحات (اختیاری)</label><input className={inp} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>

        <div className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2 text-[11.5px] font-bold text-[#503730] flex flex-wrap gap-x-6 gap-y-1" data-invoice-total>
          <span>جمع: {formatMoney(totals.gross)} {unitName()}</span>
          <span>تخفیف: {formatMoney(totals.totalDiscount)}</span>
          <span>مالیات: {formatMoney(totals.tax)}</span>
          <span className="font-black text-[#3A241F]">قابل پرداخت: {formatMoney(totals.payable)} {unitName()}</span>
        </div>
        {problem && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11.5px] font-bold text-amber-900 leading-6" data-invoice-problem>{problem}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={busy || !!problem} onClick={() => void issue()} className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-50" data-standalone-issue>صدور فاکتور {kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white border border-[#EBDBCE] text-[#6E1B1B] text-xs font-black cursor-pointer">انصراف</button>
        </div>
      </div>
      {/* a click inside the picker must not reach this dialog's backdrop (it would close the dialog) */}
      {picking && <div onClick={(e) => e.stopPropagation()}><WarehousePicker products={catalog} priceFor={(p) => (p.prices && p.prices[0] ? p.prices[0].amount : 0)} onPick={pickProduct} onClose={() => setPicking(false)} /></div>}
    </div>
  );
};
