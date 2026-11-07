import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, FileText, Handshake, Package, Search, ShoppingCart, Tag, Wrench } from 'lucide-react';
import { api, WhState } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate } from '../../lib/taskDates';
import { Customer, CrmActivity, Deal } from '../../types';

/**
 * «موجودی»: the stock and sales-paper menu of the CRM. It only reads what Hoormand already keeps — the warehouse (products, services,
 * stock, price lists, receipts), the proformas and the opportunities — and the server decides what each person may see: the warehouse
 * reply carries the person's limits (numbers of stock, money, kinds of document), and these lists honour them.
 */

type Section = 'products' | 'services' | 'invoices' | 'sales' | 'purchase' | 'prices' | 'share';
const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'products', label: 'محصولات', icon: <Package className="w-3.5 h-3.5" /> },
  { id: 'services', label: 'سرویس‌ها', icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: 'invoices', label: 'فاکتورها', icon: <FileText className="w-3.5 h-3.5" /> },
  { id: 'sales', label: 'سفارش فروش', icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  { id: 'purchase', label: 'سفارش خرید', icon: <Boxes className="w-3.5 h-3.5" /> },
  { id: 'prices', label: 'دفترچه‌های قیمت', icon: <Tag className="w-3.5 h-3.5" /> },
  { id: 'share', label: 'مشارکت در فروش', icon: <Handshake className="w-3.5 h-3.5" /> },
];

const field = 'w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-violet-300';
const th = 'text-right font-black py-1.5 whitespace-nowrap';
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">{text}</div>;

export const InventoryView: React.FC<{ deals: Deal[]; customers: Customer[]; activities: CrmActivity[]; canMoney: boolean; onOpenCustomer: (id: string) => void }> = ({ deals, customers, activities, canMoney, onOpenCustomer }) => {
  const [sec, setSec] = useState<Section>('products');
  const [wh, setWh] = useState<WhState | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    let live = true;
    api.warehouse().then((r) => { if (live) setWh(r); }).catch((e: Error) => { if (live) setErr(e.message || 'انبار در دسترس نیست.'); });
    return () => { live = false; };
  }, []);

  const showQty = wh ? wh.limits?.qty !== false : false;
  const showMoney = wh ? wh.limits?.money !== false : false;
  const match = (...parts: (string | undefined)[]) => !q || parts.some((p) => (p || '').includes(q));
  const money = (n: number) => `${formatMoney(n)} ${unitName()}`;
  const nameOf = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const goods = (wh?.products || []).filter((p) => p.kind !== 'service' && p.active !== false && match(p.title, p.code, p.group));
  const services = (wh?.products || []).filter((p) => p.kind === 'service' && p.active !== false && match(p.title, p.code, p.group));
  const proformas = deals.filter((d) => d.proformaNumber && !d.mergedInto && match(d.proformaNumber, d.customerName, d.title)).sort((a, b) => (b.proformaAt || b.updatedAt).localeCompare(a.proformaAt || a.updatedAt));
  const orders = deals.filter((d) => d.stage === 'WON' && !d.mergedInto && match(d.title, d.customerName)).sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt));
  const receipts = (wh?.recent || []).filter((d) => d.kind === 'receipt' && !d.voided && match(d.party, d.warehouseName, String(d.number)));
  const quotes = activities.filter((a) => a.type === 'QUOTE' && match(a.itemName, a.text, nameOf.get(a.customerId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shared = deals.filter((d) => (d.coOwnerNames || []).length > 0 && !d.mergedInto && match(d.title, d.customerName, d.ownerName, ...(d.coOwnerNames || [])));
  const approval = (d: Deal) => (d.proformaApproval?.status === 'APPROVED' ? 'تأیید شد' : d.proformaApproval?.status === 'REJECTED' ? 'رد شد' : d.proformaApproval?.status === 'PENDING' ? 'منتظر تأیید' : 'صادر شد');

  const warehouseNote = !wh && !err ? <Empty text="در حال بارگذاری…" /> : err ? <Empty text={`${err} (دسترسی شما به انبار بسته است یا سرور جواب نداد)`} /> : null;

  return (
    <div className="space-y-4" data-inventory>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 flex-1" role="tablist">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={sec === s.id} onClick={() => setSec(s.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black cursor-pointer ${sec === s.id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>{s.icon}{s.label}</button>
          ))}
        </div>
        <div className="relative w-full sm:w-64"><Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" /><input className={field + ' pr-9'} placeholder="جستجو…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      {(sec === 'products' || sec === 'services') && (warehouseNote || (
        (sec === 'products' ? goods : services).length === 0 ? <Empty text={sec === 'products' ? 'کالایی پیدا نشد.' : 'سرویسی پیدا نشد.'} /> : (
          <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[#8C6F66]"><tr><th className={th}>کد</th><th className={th}>نام</th><th className={th}>گروه</th><th className={th}>واحد</th>{sec === 'products' && showQty && <th className={th}>موجودی</th>}{showMoney && <th className={th}>قیمت</th>}{sec === 'products' && <th className={th}>گارانتی</th>}</tr></thead>
              <tbody>
                {(sec === 'products' ? goods : services).slice(0, 300).map((p) => (
                  <tr key={p.id} className="border-t border-[#EBDBCE]/60">
                    <td className="py-2 font-bold" dir="ltr">{p.code}</td><td className="py-2 font-black text-[#3A241F]">{p.title}</td><td className="py-2 text-[#8C6F66]">{p.group || '—'}</td><td className="py-2">{p.unit}</td>
                    {sec === 'products' && showQty && <td className={`py-2 font-black ${p.minQty && p.total <= p.minQty ? 'text-rose-700' : 'text-emerald-700'}`}>{toPersianDigits(num(p.total))}</td>}
                    {showMoney && <td className="py-2 font-bold">{p.prices && p.prices[0] ? money(p.prices[0].amount) : '—'}</td>}
                    {sec === 'products' && <td className="py-2 text-[#8C6F66]">{p.warrantyMonths ? `${toPersianDigits(p.warrantyMonths)} ماه` : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ))}

      {sec === 'invoices' && (proformas.length === 0 ? <Empty text="هنوز پیش‌فاکتوری صادر نشده است." /> : (
        <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#8C6F66]"><tr><th className={th}>شماره</th><th className={th}>مشتری</th><th className={th}>تاریخ</th><th className={th}>وضعیت</th>{canMoney && <th className={th}>مبلغ</th>}<th className={th}>مسئول</th></tr></thead>
            <tbody>
              {proformas.slice(0, 300).map((d) => (
                <tr key={d.id} className="border-t border-[#EBDBCE]/60 cursor-pointer hover:bg-[#FAF5F1]" onClick={() => onOpenCustomer(d.customerId)}>
                  <td className="py-2 font-black" dir="ltr">{d.proformaNumber}</td><td className="py-2 font-bold text-[#3A241F]">{d.customerName}</td><td className="py-2">{d.proformaAt ? formatTaskDate(d.proformaAt) : '—'}</td>
                  <td className="py-2"><span className="rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-black">{approval(d)}</span></td>
                  {canMoney && <td className="py-2 font-black">{money(d.amount)}</td>}<td className="py-2 text-[#8C6F66]">{d.ownerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {sec === 'sales' && (orders.length === 0 ? <Empty text="هنوز فروش موفقی ثبت نشده است." /> : (
        <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#8C6F66]"><tr><th className={th}>سفارش (فرصت)</th><th className={th}>مشتری</th><th className={th}>تاریخ بسته شدن</th>{canMoney && <th className={th}>مبلغ</th>}<th className={th}>مسئول</th></tr></thead>
            <tbody>
              {orders.slice(0, 300).map((d) => (
                <tr key={d.id} className="border-t border-[#EBDBCE]/60 cursor-pointer hover:bg-[#FAF5F1]" onClick={() => onOpenCustomer(d.customerId)}>
                  <td className="py-2 font-black text-[#3A241F]">{d.title}</td><td className="py-2 font-bold">{d.customerName}</td><td className="py-2">{formatTaskDate((d.closedAt || d.updatedAt).slice(0, 10))}</td>{canMoney && <td className="py-2 font-black text-emerald-700">{money(d.amount)}</td>}<td className="py-2 text-[#8C6F66]">{d.ownerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {sec === 'purchase' && (warehouseNote || (wh && wh.limits && !wh.limits.kinds.includes('receipt') ? <Empty text="دسترسی شما به رسید ورود (خرید) بسته است." /> : receipts.length === 0 ? <Empty text="رسید ورودی ثبت نشده است." /> : (
        <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#8C6F66]"><tr><th className={th}>شمارهٔ رسید</th><th className={th}>تاریخ</th><th className={th}>انبار</th><th className={th}>تأمین‌کننده</th><th className={th}>اقلام</th><th className={th}>ثبت‌کننده</th></tr></thead>
            <tbody>
              {receipts.slice(0, 300).map((d) => (
                <tr key={d.id} className="border-t border-[#EBDBCE]/60">
                  <td className="py-2 font-black">{toPersianDigits(d.number)}</td><td className="py-2">{formatTaskDate(d.date)}</td><td className="py-2">{d.warehouseName}</td><td className="py-2">{d.party || '—'}</td>
                  <td className="py-2 text-[#8C6F66]">{d.lines.map((l) => `${l.title}${showQty ? ` (${toPersianDigits(l.qty)})` : ''}`).join('، ')}</td><td className="py-2 text-[#8C6F66]">{d.createdByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )))}

      {sec === 'prices' && (
        <div className="space-y-4">
          {warehouseNote || (!showMoney ? <Empty text="دسترسی شما به قیمت‌ها (مرور مبلغی انبار) بسته است." /> : (
            <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
              <h4 className="font-black text-[13px] text-[#3A241F] mb-2">فهرست قیمت کالاها و سرویس‌ها</h4>
              <table className="w-full text-xs">
                <thead className="text-[#8C6F66]"><tr><th className={th}>کد</th><th className={th}>نام</th><th className={th}>قیمت‌ها</th></tr></thead>
                <tbody>
                  {(wh?.products || []).filter((p) => p.active !== false && (p.prices || []).length > 0 && match(p.title, p.code)).slice(0, 300).map((p) => (
                    <tr key={p.id} className="border-t border-[#EBDBCE]/60"><td className="py-2 font-bold" dir="ltr">{p.code}</td><td className="py-2 font-black text-[#3A241F]">{p.title}</td>
                      <td className="py-2">{(p.prices || []).map((x) => <span key={x.title} className="inline-block ml-2 text-[11px] font-bold">{x.title}: {money(x.amount)}</span>)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
            <h4 className="font-black text-[13px] text-[#3A241F] mb-2">قیمت‌هایی که به مشتری‌ها داده شده</h4>
            {quotes.length === 0 ? <Empty text="قیمتی به مشتری داده نشده است." /> : (
              <table className="w-full text-xs">
                <thead className="text-[#8C6F66]"><tr><th className={th}>کالا</th><th className={th}>مشتری</th><th className={th}>قیمت داده‌شده</th><th className={th}>قیمت خواستهٔ مشتری</th><th className={th}>تاریخ</th><th className={th}>ثبت‌کننده</th></tr></thead>
                <tbody>
                  {quotes.slice(0, 200).map((a) => (
                    <tr key={a.id} className="border-t border-[#EBDBCE]/60 cursor-pointer hover:bg-[#FAF5F1]" onClick={() => onOpenCustomer(a.customerId)}>
                      <td className="py-2 font-black text-[#3A241F]">{a.itemName || a.text || '—'}</td><td className="py-2">{nameOf.get(a.customerId) || '—'}</td>
                      <td className="py-2 font-bold">{canMoney && a.price ? money(a.price) : '—'}</td><td className="py-2">{canMoney && a.askedPrice ? money(a.askedPrice) : '—'}</td>
                      <td className="py-2">{formatTaskDate(a.createdAt.slice(0, 10))}</td><td className="py-2 text-[#8C6F66]">{a.authorName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {sec === 'share' && (shared.length === 0 ? <Empty text="فرصتی با چند مسئول ثبت نشده است." /> : (
        <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[#8C6F66]"><tr><th className={th}>فرصت</th><th className={th}>مشتری</th><th className={th}>مسئول اصلی</th><th className={th}>همکاران در فروش</th>{canMoney && <th className={th}>مبلغ</th>}</tr></thead>
            <tbody>
              {shared.slice(0, 300).map((d) => (
                <tr key={d.id} className="border-t border-[#EBDBCE]/60 cursor-pointer hover:bg-[#FAF5F1]" onClick={() => onOpenCustomer(d.customerId)}>
                  <td className="py-2 font-black text-[#3A241F]">{d.title}</td><td className="py-2">{d.customerName}</td><td className="py-2">{d.ownerName}</td><td className="py-2 text-[#8C6F66]">{(d.coOwnerNames || []).join('، ')}</td>{canMoney && <td className="py-2 font-black">{money(d.amount)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <p className="text-[10.5px] font-bold text-[#8C6F66]">«پرداخت‌ها» هنوز ساخته نشده است، چون هورمند جز دریافتی‌های سپیدار هیچ پرداختی نگه نمی‌دارد؛ برای ساختنش اسکرین‌شات فرم و ستون‌های آن لازم است.</p>
    </div>
  );
};
