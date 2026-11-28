import { CODE_LOCK_CLASS, CODE_LOCK_HINT, useWarehouseCodeLock } from '../../lib/warehouseCodes';
import { PriceBox } from '../common/PriceBox';
import { enterNextKeyDown } from '../../lib/enterNext';
import React, { useEffect, useMemo, useState } from 'react';
import { PackageSearch, Plus, Receipt, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { fold, matchesQuery } from '../../lib/customerSearch';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { WarehousePicker, WarehouseProduct } from './WarehousePicker';
import { issuerById, issuersOf, officialProblems } from '../../lib/proformaIssuer';
import { proformaTotals } from '../../lib/proformaPdf';
import { canIssueInvoice } from '../../lib/invoice';
import { PersonPicker, customerItems } from '../common/PersonPicker';
import { MoneyInput, digitsOf } from '../common/MoneyInput';
import { askConfirm } from '../../lib/confirmDialog';
import { InvoiceSepidarFields, InvoiceExtra, emptyInvoiceExtra } from './InvoiceSepidarFields';

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
  const [paidTick, setPaidTick] = useState(false);
  const [extra, setExtra] = useState<InvoiceExtra>(emptyInvoiceExtra);
  const [busy, setBusy] = useState(false);
  // the warehouse: its products come with their prices; the seller puts one of them in the price box of the row
  const codeLocked = useWarehouseCodeLock();
  const [catalog, setCatalog] = useState<WarehouseProduct[]>([]);
  const [pickFor, setPickFor] = useState<number | 'new' | null>(null);
  const [sugRow, setSugRow] = useState<number | null>(null);
  const catLines = useMemo(() => new Map(catalog.map((p) => [p.id, fold([p.code, p.title, p.group || ''].join(' '))])), [catalog]);
  const suggestionsFor = (text: string) => (text.trim() ? catalog.filter((p) => matchesQuery(catLines.get(p.id), text)).slice(0, 7) : []);
  const lineOf = (p: WarehouseProduct, keepQty?: string): Row => ({ title: p.title, code: p.code || '', unit: p.unit || '', qty: keepQty || '1', price: p.prices && p.prices[0] ? String(toDisplay(p.prices[0].amount)) : '', discount: '' });
  const fillRow = (i: number, p: WarehouseProduct) => { setRows((cur) => cur.map((x, j) => (j === i ? { ...lineOf(p, x.qty), discount: x.discount } : x))); setSugRow(null); };
  useEffect(() => { api.crmProducts().then((r) => setCatalog(r.products as WarehouseProduct[])).catch(() => setCatalog([])); }, []);
  const pickProduct = (p: WarehouseProduct) => {
    setRows((cur) => {
      if (typeof pickFor === 'number' && cur[pickFor]) return cur.map((x, j) => (j === pickFor ? { ...lineOf(p, x.qty), discount: x.discount } : x));
      const last = cur[cur.length - 1];
      return last && !last.title.trim() && !last.code && !last.price ? [...cur.slice(0, -1), lineOf(p)] : [...cur, lineOf(p)];
    });
    setPickFor(null);
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
  const problem = !canIssueInvoice(currentUser) ? 'صدور فاکتور به شما اجازه داده نشده است.' : !customer ? 'مشتری را انتخاب کنید.' : items.length === 0 ? 'دست‌کم یک ردیف با عنوان بنویسید.' : items.some((i) => i.qty <= 0) ? 'تعداد هر ردیف باید بیشتر از صفر باشد.' : items.some((i) => !(i.unitPrice > 0)) ? 'مبلغ (قیمت واحد) هر ردیف اجباری است.' : lacks.length ? `فاکتور رسمی این موارد را کم دارد: ${lacks.join('، ')}.` : '';

  const issue = async () => {
    const ok = await askConfirm(`«${kind === 'OFFICIAL' ? 'فاکتور رسمی' : 'فاکتور'}» برای «${customer?.name || ''}» به مبلغ ${formatMoney(totals.payable)} ${unitName()} صادر شود؟ بعد از صدور قابل ویرایش نیست (فقط ابطال).`, { tone: 'info', title: 'صدور فاکتور', confirmText: 'بله، صادر شود' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await api.invoiceStandalone({ customerId, issuerId, kind, items: items.map(({ id: _id, ...x }) => ({ ...x, discount: x.discount || undefined })), discountPercent: Number(discountPercent) || 0, taxPercent: Number(taxPercent) || 0, note, paid: paidTick, ...extra });
      showToast(`فاکتور ${toPersianDigits(r.number || '')} صادر شد.`);
      onIssued();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'صدور فاکتور انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-3" onClick={onClose} dir="rtl" data-standalone-invoice onKeyDown={enterNextKeyDown}>
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
                  <div className="relative flex-1 min-w-0">
                    <input className={inp} value={r.title} onChange={(e) => { set(i, 'title', e.target.value); setSugRow(i); }} onFocus={() => setSugRow(i)} onBlur={() => setSugRow((x) => (x === i ? null : x))} autoComplete="off" placeholder="عنوان کالا یا خدمت (برای پیشنهاد از انبار بنویسید)" data-title-input />
                    {sugRow === i && (() => {
                      const list = suggestionsFor(r.title).filter((p) => !(p.code && p.code === r.code && p.title === r.title));
                      if (list.length === 0) return null;
                      return (
                        <div className="absolute z-30 inset-x-0 top-full mt-1 rounded-xl border border-[#EBDBCE] bg-white shadow-xl overflow-hidden" data-title-suggestions>
                          {list.map((p) => (
                            <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fillRow(i, p)} className="w-full text-right flex items-center justify-between gap-3 px-3 py-2 hover:bg-violet-50 cursor-pointer border-b border-[#EBDBCE]/50 last:border-b-0">
                              <span className="min-w-0">
                                <span className="block text-xs font-black text-[#3A241F] truncate">{p.title}</span>
                                <span className="block text-[10px] font-bold text-[#8C6F66] truncate" dir="ltr">{p.code}{p.group ? ` · ${p.group}` : ''}</span>
                              </span>
                              <span className="shrink-0 text-left">
                                <span className="block text-[11px] font-black text-violet-700">{p.prices && p.prices[0] ? `${formatMoney(p.prices[0].amount)} ${unitName()}` : 'بدون قیمت'}</span>
                                {p.kind === 'service' ? <span className="block text-[10px] font-black text-sky-700">خدمات</span> : p.noStock ? null : <span className={`block text-[10px] font-bold ${p.total > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>موجودی: {toPersianDigits(p.total)} {p.unit}</span>}
                              </span>
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <button type="button" onClick={() => setPickFor(i)} className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl text-[11px] font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer" title="پر کردن این ردیف از انبار" data-row-from-warehouse><PackageSearch className="w-3.5 h-3.5" />از انبار</button>
                  {rows.length > 1 && <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="px-2 text-rose-700 cursor-pointer" aria-label="حذف ردیف"><X className="w-4 h-4" /></button>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <input className={inp + (codeLocked(r.code, r.title) ? CODE_LOCK_CLASS : '')} value={r.code} readOnly={codeLocked(r.code, r.title)} title={codeLocked(r.code, r.title) ? CODE_LOCK_HINT : undefined} onChange={(e) => set(i, 'code', e.target.value)} placeholder={kind === 'OFFICIAL' ? 'شناسهٔ کالا *' : 'شناسهٔ کالا'} />
                  <input className={inp} value={r.unit} onChange={(e) => set(i, 'unit', e.target.value)} placeholder={kind === 'OFFICIAL' ? 'واحد *' : 'واحد'} />
                  <input className={inp} inputMode="numeric" value={r.qty} onChange={(e) => set(i, 'qty', digitsOf(e.target.value))} placeholder="تعداد" />
                  <PriceBox value={r.price} onChange={(d) => set(i, 'price', d)} placeholder={`قیمت واحد (${unitName()})`} className={inp} prices={catalog.find((x) => x.code && x.code === r.code.trim())?.prices || []} onPick={(a) => set(i, 'price', String(toDisplay(a)))} />
                  <MoneyInput value={r.discount} onChange={(d) => set(i, 'discount', d)} placeholder="تخفیف ردیف" unit={false} className={inp} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setPickFor('new')} className="mt-2 ml-2 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-black cursor-pointer" data-pick-product><PackageSearch className="w-3.5 h-3.5 inline ml-1" />انتخاب کالا از انبار</button>
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
        <InvoiceSepidarFields value={extra} onChange={setExtra} />
        <label className="flex items-center gap-2 text-[11px] font-black text-[#3A241F] cursor-pointer" data-paid-tick><input type="checkbox" className="w-4 h-4 accent-emerald-700" checked={paidTick} onChange={(e) => setPaidTick(e.target.checked)} />این فاکتور پرداخت شده است (فروش نقدی)؛ بدون این تیک تا پرداخت‌شدن در سپیدار «تسویه‌نشده» می‌ماند</label>
        {problem && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11.5px] font-bold text-amber-900 leading-6" data-invoice-problem>{problem}</div>}
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={busy || !!problem} onClick={() => void issue()} className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-50" data-standalone-issue>صدور فاکتور {kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white border border-[#EBDBCE] text-[#6E1B1B] text-xs font-black cursor-pointer">انصراف</button>
        </div>
      </div>
      {/* a click inside the picker must not reach this dialog's backdrop (it would close the dialog) */}
      {pickFor !== null && <div onClick={(e) => e.stopPropagation()}><WarehousePicker products={catalog} priceFor={(p) => (p.prices && p.prices[0] ? p.prices[0].amount : 0)} onPick={pickProduct} onClose={() => setPickFor(null)} /></div>}
    </div>
  );
};
