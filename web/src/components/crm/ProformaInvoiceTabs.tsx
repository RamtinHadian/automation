import React, { useMemo, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import { Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, toDisplay, unitName } from '../../lib/money';
import { formatTaskDate } from '../../lib/taskDates';
import { hasInvoice, invoiceTitle } from '../../lib/invoice';
import { ProformaOnly } from './ProformaListView';

type Kind = 'ALL' | 'OFFICIAL' | 'UNOFFICIAL' | 'CANCELLED';

/** «فاکتورها»: the sales invoices issued from the proformas (official and unofficial), newest first; a row opens the invoice for printing. */
const InvoiceList: React.FC<{ deals: Deal[]; canMoney: boolean; onOpenInvoice: (d: Deal) => void }> = ({ deals, canMoney, onOpenInvoice }) => {
  const [kind, setKind] = useState<Kind>('ALL');
  const [q, setQ] = useState('');
  const all = useMemo(() => deals.filter((d) => hasInvoice(d)).sort((a, b) => (b.invoice?.issuedAt || '').localeCompare(a.invoice?.issuedAt || '')), [deals]);
  const live = all.filter((d) => d.invoice?.status !== 'cancelled');
  const shown = all
    .filter((d) => kind === 'ALL' || (kind === 'CANCELLED' ? d.invoice?.status === 'cancelled' : d.invoice?.kind === kind && d.invoice?.status !== 'cancelled'))
    .filter((d) => !q || [d.invoice?.number, d.customerName, d.title, d.invoice?.issuedByName].some((x) => (x || '').includes(q)));
  const sum = live.reduce((t, d) => t + toDisplay(d.invoice?.amount ?? d.amount), 0);
  const chips: [Kind, string, number][] = [
    ['ALL', 'همه', all.length],
    ['OFFICIAL', 'رسمی', live.filter((d) => d.invoice?.kind === 'OFFICIAL').length],
    ['UNOFFICIAL', 'غیررسمی', live.filter((d) => d.invoice?.kind === 'UNOFFICIAL').length],
    ['CANCELLED', 'باطل‌شده', all.length - live.length],
  ];
  const tone = (i: number) => (i % 2 === 0 ? 'color-mix(in srgb, var(--theme-badge-bg, #F6D9CD) 55%, #fff)' : 'var(--theme-light-bg, #FAF5F1)');
  return (
    <div className="space-y-3" data-invoice-list>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3"><div className="text-[10px] font-bold text-[#8C6F66]">فاکتورهای صادرشده</div><div className="text-lg font-black text-[#3A241F]">{toPersianDigits(live.length)}</div></div>
        <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3"><div className="text-[10px] font-bold text-[#8C6F66]">باطل‌شده</div><div className="text-lg font-black text-rose-700">{toPersianDigits(all.length - live.length)}</div></div>
        {canMoney && <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3 col-span-2 sm:col-span-1"><div className="text-[10px] font-bold text-[#8C6F66]">جمع فاکتورهای صادرشده ({unitName()})</div><div className="text-lg font-black text-[#3A241F]">{formatMoney(sum)}</div></div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 flex-1">
          {chips.map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black border cursor-pointer ${kind === k ? 'bg-[#6E1B1B] text-white border-transparent' : 'bg-white text-[#6E1B1B] border-[#EBDBCE]'}`}>{label} ({toPersianDigits(n)})</button>
          ))}
        </div>
        <div className="relative w-full sm:w-56"><Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" /><input className="w-full px-3 pr-8 py-1.5 bg-white border border-[#EBDBCE] rounded-xl text-[11px] font-bold" placeholder="شماره، مشتری یا صادرکننده" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {shown.length === 0 ? (
        <div className="text-center text-[11px] font-bold text-gray-400 py-8 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">فاکتوری پیدا نشد. فاکتور از روی پیش‌فاکتور تأییدشده، با دکمهٔ «تبدیل به فاکتور» در پروندهٔ فرصت صادر می‌شود.</div>
      ) : (
        <div className="border border-[#EBDBCE] rounded-2xl overflow-hidden">
          {shown.slice(0, 300).map((d, i) => {
            const inv = d.invoice!;
            const cancelled = inv.status === 'cancelled';
            return (
              <button key={d.id} type="button" onClick={() => onOpenInvoice(d)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-right cursor-pointer hover:brightness-95 transition" style={{ background: tone(i) }} data-invoice-row>
                <Receipt className="w-3.5 h-3.5 text-[#8C6F66] shrink-0" />
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span className="font-black text-[11.5px] text-[#3A241F] truncate">{d.customerName}</span>
                  <span className="text-[10px] text-[#8C6F66] font-bold shrink-0" dir="ltr">{toPersianDigits(inv.number)}</span>
                  <span className="hidden md:inline text-[10.5px] font-bold text-[#8C6F66] truncate">{invoiceTitle(inv.kind)}</span>
                </div>
                <span className="hidden sm:inline text-[10.5px] font-bold text-[#8C6F66] shrink-0">{inv.issuedByName}{inv.issuedAt ? ` · ${formatTaskDate(inv.issuedAt.slice(0, 10))}` : ''}</span>
                {canMoney && <span className="text-[11px] font-black text-[#3A241F] shrink-0 w-32 text-left">{formatMoney(inv.amount ?? d.amount)} {unitName()}</span>}
                <span className={`shrink-0 text-[9.5px] font-black rounded-full px-2 py-0.5 border ${cancelled ? 'bg-rose-50 text-rose-700 border-rose-200' : inv.kind === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{cancelled ? 'باطل' : inv.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** The proformas and the invoices made from them, one switch apart. */
export const ProformaInvoiceTabs: React.FC<{ deals: Deal[]; canMoney: boolean; onOpen: (d: Deal) => void; onOpenInvoice: (d: Deal) => void }> = ({ deals, canMoney, onOpen, onOpenInvoice }) => {
  const [mode, setMode] = useState<'proforma' | 'invoice'>('proforma');
  const n = deals.filter((d) => hasInvoice(d)).length;
  const btn = (m: 'proforma' | 'invoice', label: string) => (
    <button type="button" onClick={() => setMode(m)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${mode === m ? 'bg-[#6E1B1B] text-white border-transparent' : 'bg-white text-[#6E1B1B] border-[#EBDBCE]'}`} data-list-mode={m}>{label}</button>
  );
  return (
    <div className="space-y-3">
      <div className="flex gap-2">{btn('proforma', 'پیش‌فاکتورها')}{btn('invoice', `فاکتورها (${toPersianDigits(n)})`)}</div>
      {mode === 'proforma' ? <ProformaOnly deals={deals} canMoney={canMoney} onOpen={onOpen} /> : <InvoiceList deals={deals} canMoney={canMoney} onOpenInvoice={onOpenInvoice} />}
    </div>
  );
};
