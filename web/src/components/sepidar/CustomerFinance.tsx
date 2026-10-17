import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

type Finance = Awaited<ReturnType<typeof api.sepidarFinance>>;

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
      .sepidarFinance(customerId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setState('ok');
      })
      .catch(() => alive && setState('hidden'));
    return () => {
      alive = false;
    };
  }, [customerId]);

  if (state !== 'ok' || !data) return null;
  if (!data.linked) {
    return compact ? null : <div className="rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] px-4 py-3 text-[11px] font-bold text-[#8C6F66]">این مشتری هنوز در سپیدار ثبت نشده است؛ وضعیت مالی ندارد.</div>;
  }

  const rem = data.remainder;
  const hasBalance = typeof rem === 'number';
  // in Sepidar's accounts a positive balance is what the customer still owes the company
  const tone = !hasBalance ? '' : rem > 0 ? 'text-rose-700' : rem < 0 ? 'text-emerald-700' : 'text-[#3A241F]';
  const word = !hasBalance ? 'مانده نامشخص' : rem > 0 ? 'بدهکار' : rem < 0 ? 'بستانکار' : 'تسویه‌شده';
  const stale = data.balanceAt ? Date.now() - new Date(data.balanceAt).getTime() > 24 * 3600 * 1000 : false;

  if (compact) {
    return (
      <div className="px-3.5 py-2 bg-rose-50 border-t border-rose-100 flex items-center justify-between gap-2 text-[11px] font-bold text-rose-950" data-call-finance>
        <span className="flex items-center gap-1.5 min-w-0">
          <Landmark className="w-3.5 h-3.5 shrink-0 text-rose-700" />
          <span className="truncate">وضعیت مالی (سپیدار):</span>
          <span className={`font-black ${tone}`}>
            {word}
            {hasBalance && rem !== 0 ? ` ${fmt(rem)}` : ''}
          </span>
        </span>
        {data.invoices && data.invoices[0] && <span className="shrink-0 text-[10px] text-[#8C6F66]">آخرین فاکتور {toPersianDigits(data.invoices[0].number)}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 space-y-3" data-customer-finance>
      <div className="flex items-center gap-2 text-xs font-black text-rose-900">
        <Landmark className="w-4 h-4 text-rose-700" />
        وضعیت مالی در سپیدار{data.title ? ` · ${data.title}` : ''}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">مانده حساب</div>
          <div className={`text-sm font-black ${tone}`}>
            {word}
            {hasBalance && rem !== 0 ? ` ${fmt(rem)}` : ''}
          </div>
        </div>
        <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">مانده اعتبار</div>
          <div className="text-sm font-black text-[#3A241F]">{typeof data.creditRemainder === 'number' ? fmt(data.creditRemainder) : '—'}</div>
        </div>
        <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">تعداد فاکتورها</div>
          <div className="text-sm font-black text-[#3A241F]">{toPersianDigits(data.invoiceCount ?? 0)}</div>
        </div>
        <div className="rounded-xl bg-white border border-[#EBDBCE] px-3 py-2">
          <div className="text-[10px] font-bold text-[#8C6F66]">جمع فاکتورها</div>
          <div className="text-sm font-black text-[#3A241F]">{fmt(data.invoiceTotal ?? 0)}</div>
        </div>
      </div>
      {data.invoices && data.invoices.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-black text-[#8C6F66]">آخرین فاکتورها</div>
          {data.invoices.map((i) => (
            <div key={i.number} className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#3A241F] bg-white rounded-lg border border-[#EBDBCE] px-3 py-1.5">
              <span>فاکتور {toPersianDigits(i.number)}</span>
              <span className="text-[#8C6F66]">{i.date ? formatTaskDate(i.date) : ''}</span>
              <span className="font-black">{fmt(i.net)}</span>
            </div>
          ))}
        </div>
      )}
      <div className={`text-[10px] font-bold ${stale ? 'text-amber-700' : 'text-[#8C6F66]'}`}>
        {data.balanceAt ? `آخرین بروزرسانی از سپیدار: ${timeOf(data.balanceAt)}${stale ? ' (قدیمی است؛ «بروزرسانی اطلاعات سپیدار» را بزنید)' : ''}` : 'اطلاعات مانده هنوز از سپیدار نیامده است.'} · ارقام به همان واحد پولی سپیدار است.
      </div>
    </div>
  );
};
