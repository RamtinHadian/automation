import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

type Finance = Awaited<ReturnType<typeof api.sepidarFinance>>;

const unitOf = (t?: string) => (t ? ` ${t}` : '');
const fmt = (n: number) => toPersianDigits(Math.abs(Number(n || 0)).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const timeOf = (iso?: string) => (iso ? `${formatTaskDate(iso)} ${toPersianDigits(new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}` : '');

/**
 * The financial position of a customer in Sepidar: the balance (who owes whom), the credit left and the latest invoices. It is read from the copy
 * the Sepidar program keeps up to date, so the time of that copy is shown. Nothing is drawn for a person who may not see it (no Sepidar right, or
 * a colleague's customer), and `compact` is the one-line version for the call pop-up (also drawn only for a customer that is in Sepidar).
 */
export const CustomerFinance: React.FC<{ customerId: string; compact?: boolean }> = ({ customerId, compact }) => {
  const [data, setData] = useState<Finance | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'hidden'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    api
      .sepidarFinance(customerId, !!compact)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState('ok');
      })
      .catch(() => alive && setState('hidden'));
    return () => {
      alive = false;
    };
  }, [customerId, compact]);

  if (state !== 'ok' || !data) return null;
  if (!data.linked) {
    return compact ? null : <div className="rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] px-4 py-3 text-[11px] font-bold text-[#8C6F66]">این مشتری هنوز در سپیدار ثبت نشده است؛ وضعیت مالی ندارد.</div>;
  }

  const rem = data.remainder;
  const hasBalance = typeof rem === 'number';
  // in Sepidar's accounts a positive balance is what the customer still owes the company
  const tone = !hasBalance ? '' : rem > 0 ? 'text-rose-700' : 'text-emerald-700';
  // a debtor is red; a settled or creditor customer is green; no figure at all stays neutral
  const debtor = hasBalance && rem > 0;
  const paid = hasBalance && rem <= 0;
  const word = !hasBalance ? 'مانده نامشخص' : rem > 0 ? 'بدهکار' : rem < 0 ? 'بستانکار' : 'تسویه‌شده';
  const stale = data.balanceAt ? Date.now() - new Date(data.balanceAt).getTime() > 24 * 3600 * 1000 : false;

  const hasCredit = typeof data.creditRemainder === 'number';
  const hasInvoices = !!data.invoices && data.invoices.length > 0;
  if (!hasBalance && !hasCredit && !hasInvoices && data.invoiceCount === undefined) return null; // nothing this person may see (e.g. no right to the money)

  if (compact) {
    return (
      <div className={`px-3.5 border-t flex items-center justify-between gap-2 font-bold ${debtor ? 'py-3 border-rose-100 bg-rose-100 text-rose-950 text-[13px]' : paid ? 'py-2 border-emerald-100 bg-emerald-50 text-emerald-950 text-[11px]' : 'py-2 border-slate-100 bg-slate-50 text-slate-900 text-[11px]'}`} data-call-finance>
        <span className="flex items-center gap-1.5 min-w-0">
          <Landmark className={`w-3.5 h-3.5 shrink-0 ${debtor ? 'text-rose-700' : paid ? 'text-emerald-700' : 'text-slate-500'}`} />
          <span className="truncate">وضعیت مالی (سپیدار):</span>
          {hasBalance ? (
            <span className={`font-black ${tone}`}>
              {word}
              {rem !== 0 ? ` ${fmt(rem)}${unitOf(data.currencyTitle)}` : ''}
            </span>
          ) : hasCredit ? (
            <span className="font-black text-[#3A241F]">اعتبار {fmt(data.creditRemainder!)}{unitOf(data.currencyTitle)}</span>
          ) : (
            <span className="font-black text-slate-600">مانده نامشخص</span>
          )}
        </span>
        {data.invoices && data.invoices[0] && <span className="shrink-0 text-[10px] text-[#8C6F66]">آخرین فاکتور {toPersianDigits(data.invoices[0].number)}</span>}
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${debtor ? 'border-rose-200 bg-rose-50/50' : paid ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50/50'}`} data-customer-finance>
      <div className={`flex items-center gap-2 text-xs font-black ${debtor ? 'text-rose-900' : paid ? 'text-emerald-900' : 'text-slate-800'}`}>
        <Landmark className={`w-4 h-4 ${debtor ? 'text-rose-700' : paid ? 'text-emerald-700' : 'text-slate-500'}`} />
        وضعیت مالی در سپیدار{data.title ? ` · ${data.title}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-bold text-[#8C6F66]">مانده حساب</div>
          <div className={`text-sm font-black ${hasBalance ? tone : 'text-slate-600'}`}>
            {word}
            {hasBalance && rem !== 0 ? ` ${fmt(rem)}${unitOf(data.currencyTitle)}` : ''}
          </div>
          {!hasBalance && <div className="mt-1 text-[10px] font-bold text-[#8C6F66] leading-5">سپیدار برای این مشتری مانده‌ای نفرستاده است؛ بدهی یا تسویه‌بودنش را از همین‌جا نمی‌شود فهمید.</div>}
        </div>
        {hasCredit && (
          <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">مانده اعتبار</div>
          <div className="text-sm font-black text-[#3A241F]">{typeof data.creditRemainder === 'number' ? `${fmt(data.creditRemainder)}${unitOf(data.currencyTitle)}` : '—'}</div>
        </div>
        )}
        {data.invoiceCount !== undefined && (
          <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">تعداد فاکتورها</div>
          <div className="text-sm font-black text-[#3A241F]">{toPersianDigits(data.invoiceCount ?? 0)}</div>
        </div>
        )}
        {data.invoiceCount !== undefined && (
          <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">جمع فاکتورها</div>
          <div className="text-sm font-black text-[#3A241F]">{fmt(data.invoiceTotal ?? 0)}{unitOf(data.currencyTitle)}</div>
        </div>
        )}
      </div>
      {data.invoices && data.invoices.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-black text-[#8C6F66]">آخرین فاکتورها</div>
          {data.invoices.map((i) => (
            <div key={i.number} className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#3A241F] bg-white rounded-lg border border-[#EBDBCE] px-3 py-1.5">
              <span>فاکتور {toPersianDigits(i.number)}</span>
              <span className="text-[#8C6F66]">{i.date ? formatTaskDate(i.date) : ''}</span>
              <span className="font-black">{fmt(i.net)}{unitOf(data.currencyTitle)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`text-[10px] font-bold ${stale ? 'text-amber-700' : 'text-[#8C6F66]'}`}>
        {data.balanceAt ? `آخرین بروزرسانی از سپیدار: ${timeOf(data.balanceAt)}${stale ? ' (قدیمی است؛ «بروزرسانی اطلاعات سپیدار» را بزنید)' : ''}` : 'اطلاعات مانده هنوز از سپیدار نیامده است.'} · ارقام به واحد پولی سپیدار است{data.currencyTitle ? ` (${data.currencyTitle})` : ''}.
      </div>
    </div>
  );
};


// ---- the short word on a customer card: «بدهکار …» / «تسویه‌شده» / «بستانکار …» (one request for all the cards of a page) ----
type Brief = { rem?: number; unit?: string };
const briefCache = new Map<string, Brief | null>();
const briefWaiting = new Set<string>();
const briefListeners = new Set<() => void>();
let briefTimer: ReturnType<typeof setTimeout> | undefined;
let briefOff = false; // the person has no right to the balance (or Sepidar is off): stop asking

const askBriefs = () => {
  briefTimer = undefined;
  const ids = [...briefWaiting].slice(0, 120);
  ids.forEach((i) => briefWaiting.delete(i));
  if (!ids.length) return;
  api
    .sepidarFinanceBrief(ids)
    .then((r) => {
      for (const id of ids) briefCache.set(id, id in r.items ? { rem: Number(r.items[id]), unit: r.currencyTitle } : null);
    })
    .catch(() => {
      briefOff = true;
      for (const id of ids) briefCache.set(id, null);
    })
    .finally(() => {
      briefListeners.forEach((f) => f());
      if (briefWaiting.size) briefTimer = setTimeout(askBriefs, 30);
    });
};

export const FinanceChip: React.FC<{ customerId: string; small?: boolean }> = ({ customerId, small }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    briefListeners.add(f);
    if (!briefOff && !briefCache.has(customerId)) {
      briefWaiting.add(customerId);
      if (!briefTimer) briefTimer = setTimeout(askBriefs, 40);
    }
    return () => {
      briefListeners.delete(f);
    };
  }, [customerId]);
  const b = briefCache.get(customerId);
  if (!b || typeof b.rem !== 'number') return null;
  const rem = b.rem;
  const cls = rem > 0 ? 'bg-rose-50 text-rose-800 border-rose-200' : rem < 0 ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200';
  const word = rem > 0 ? 'بدهکار' : rem < 0 ? 'بستانکار' : 'تسویه‌شده';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-black ${small ? 'text-[9.5px] px-1.5 py-px' : 'text-[10px] px-2 py-0.5'} ${cls}`} title="وضعیت مالی در سپیدار" data-finance-chip>
      <Landmark className="w-3 h-3 shrink-0" />
      {word}
      {rem !== 0 ? ` ${fmt(rem)}${unitOf(b.unit)}` : ''}
    </span>
  );
};
