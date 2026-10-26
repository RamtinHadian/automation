import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, Clock, Handshake, History, MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Tag, XCircle } from 'lucide-react';
import { ActivityType, CrmActivity, Customer, Deal } from '../../types';
import { api, VoipCall } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatDateTime, formatTaskDate } from '../../lib/taskDates';
import { CONTACT_TYPES, contactTypeOf } from '../../lib/contactTypes';
import { CustomerFinance } from '../sepidar/CustomerFinance';
import { useSepidarConnected } from '../../lib/sepidarCustomerFields';
import { CustomerAiAnalysis } from './CustomerAiAnalysis';

const ACT: Record<ActivityType, string> = { NOTE: 'یادداشت', CALL: 'تماس', MEETING: 'جلسه', FOLLOWUP: 'پیگیری', MISSING: 'کالای ناموجود', QUOTE: 'قیمت داده شد' };
const STAGE: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره', WON: 'فروش موفق', LOST: 'از دست رفت' };
const STATUS: Record<string, string> = { LEAD: 'مشتری بالقوه', ACTIVE: 'مشتری فعال', INACTIVE: 'غیرفعال' };
const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
const ago = (iso: string) => (daysAgo(iso) === 0 ? 'امروز' : `${toPersianDigits(daysAgo(iso))} روز پیش`);

const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }> = ({ icon, label, value, sub, tone = 'text-[#3A241F]' }) => (
  <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3">
    <div className="flex items-center gap-1.5 text-[11px] font-black text-[#8C6F66]">{icon}{label}</div>
    <div className={`mt-1 text-base font-black leading-6 ${tone}`}>{value}</div>
    {sub && <div className="text-[10px] font-bold text-[#8C6F66] leading-4">{sub}</div>}
  </div>
);

const Block: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; empty?: string; isEmpty?: boolean }> = ({ title, icon, children, empty, isEmpty }) => (
  <section className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-2">
    <h4 className="flex items-center gap-1.5 font-black text-xs text-[#3A241F]">{icon}{title}</h4>
    {isEmpty ? <div className="text-[11px] font-bold text-gray-400 py-2">{empty}</div> : children}
  </section>
);

/** «خلاصهٔ مشتری»: everything known about this customer on one page, whether or not a proforma was ever issued. */
export const CustomerFullSummary: React.FC<{ customer: Customer; deals: Deal[]; activities: CrmActivity[]; seesTotals: boolean }> = ({ customer: c, deals, activities, seesTotals }) => {
  const sepidarOn = useSepidarConnected();
  const [calls, setCalls] = useState<VoipCall[] | null>(null);
  useEffect(() => {
    let live = true;
    api.voipCalls({ scope: 'all', customer: c.id, limit: 60 }).then((r) => live && setCalls(r.calls)).catch(() => live && setCalls([]));
    return () => {
      live = false;
    };
  }, [c.id]);

  const s = useMemo(() => {
    const won = deals.filter((d) => d.stage === 'WON');
    const lost = deals.filter((d) => d.stage === 'LOST');
    const open = deals.filter((d) => !['WON', 'LOST'].includes(d.stage));
    const sum = (xs: Deal[]) => xs.reduce((t, d) => t + (d.amount || 0), 0);
    const acts = activities.filter((a) => a.type !== 'MISSING').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const today = new Date().toISOString().slice(0, 10);
    const followups = activities.filter((a) => a.type === 'FOLLOWUP' && !a.done && a.dueDate).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    const count = (t: ActivityType) => activities.filter((a) => a.type === t).length;
    return {
      won, lost, open, wonSum: sum(won), openSum: sum(open), acts, followups, today,
      byType: (['CALL', 'MEETING', 'NOTE', 'QUOTE', 'FOLLOWUP'] as ActivityType[]).map((t) => ({ t, n: count(t) })),
      quotes: activities.filter((a) => a.type === 'QUOTE').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      missing: activities.filter((a) => a.type === 'MISSING').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
      lastWon: [...won].sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt)),
    };
  }, [deals, activities]);

  const lastCall = calls && calls[0];
  const lastTouch = [s.acts[0]?.createdAt, lastCall?.startedAt].filter(Boolean).sort().pop();
  const nextFu = s.followups[0];
  const type = CONTACT_TYPES.find((t) => t.id === contactTypeOf(c))?.label || 'مشتری';
  const callIcon = (x: VoipCall) => (x.status !== 'answered' && x.direction === 'in' ? PhoneMissed : x.direction === 'out' ? PhoneOutgoing : PhoneIncoming);

  return (
    <div className="space-y-3" data-customer-summary>
      <section className="rounded-2xl border border-[#EBDBCE] bg-gradient-to-l from-[#FAF5F1] to-white p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-black text-sm text-[#3A241F]">{c.name}</h3>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700">{type}</span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full border border-[#EBDBCE] bg-white text-[#503730]">{STATUS[c.status] || c.status}</span>
        </div>
        <div className="text-[11px] font-bold text-[#6b5048] leading-6 flex flex-wrap gap-x-4 gap-y-0.5">
          {c.company && c.company !== c.name && <span>شرکت: {c.company}</span>}
          {(c.city || c.province) && <span>شهر: {[c.province, c.city].filter(Boolean).join('، ')}</span>}
          {c.ownerName && <span>مسئول پیگیری: {c.ownerName}</span>}
          {c.createdAt && <span>مشتری از: {formatTaskDate(c.createdAt.slice(0, 10))}</span>}
          {c.source && <span>آشنایی: {c.source}</span>}
          {c.interest && <span>دنبال: {c.interest}</span>}
        </div>
        {(c.phones || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(c.phones || []).map((p) => (
              <span key={p} dir="ltr" className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-white border border-[#EBDBCE] text-[#3A241F] flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-600" />{toPersianDigits(p)}</span>
            ))}
          </div>
        )}
        {(c.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((t) => <span key={t} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-800 border border-violet-200 flex items-center gap-1"><Tag className="w-3 h-3" />{t}</span>)}
          </div>
        )}
        {c.notes && <p className="text-[11px] text-[#503730] leading-6 whitespace-pre-wrap bg-white/70 rounded-xl border border-[#EBDBCE] px-3 py-2">{c.notes}</p>}
      </section>

      <CustomerAiAnalysis customerId={c.id} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5" data-summary-tiles>
        <Tile icon={<BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />} label="خرید (فروش موفق)" value={toPersianDigits(s.won.length)} sub={seesTotals && s.won.length ? `${formatMoney(s.wonSum)} ${unitName()}` : s.lastWon[0] ? `آخرین: ${ago(s.lastWon[0].closedAt || s.lastWon[0].updatedAt)}` : 'هنوز خریدی ثبت نشده'} tone="text-emerald-700" />
        <Tile icon={<Handshake className="w-3.5 h-3.5 text-amber-600" />} label="فرصت باز" value={toPersianDigits(s.open.length)} sub={seesTotals && s.open.length ? `${formatMoney(s.openSum)} ${unitName()}` : undefined} tone="text-amber-700" />
        <Tile icon={<XCircle className="w-3.5 h-3.5 text-rose-600" />} label="از دست رفته" value={toPersianDigits(s.lost.length)} tone="text-rose-700" />
        <Tile icon={<Clock className="w-3.5 h-3.5 text-sky-600" />} label="آخرین تعامل" value={lastTouch ? ago(lastTouch) : 'ندارد'} sub={lastTouch ? formatDateTime(lastTouch) : 'تماس یا یادداشتی ثبت نشده'} />
        <Tile icon={<CalendarClock className="w-3.5 h-3.5 text-violet-600" />} label="پیگیری بعدی" value={nextFu?.dueDate ? formatTaskDate(nextFu.dueDate) : 'ندارد'} sub={nextFu?.dueDate && nextFu.dueDate < s.today ? 'عقب‌افتاده' : nextFu?.text ? nextFu.text.slice(0, 40) : undefined} tone={nextFu?.dueDate && nextFu.dueDate < s.today ? 'text-rose-700' : 'text-[#3A241F]'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Block title={`فرصت‌ها (${toPersianDigits(deals.length)})`} icon={<Handshake className="w-4 h-4 text-amber-600" />} isEmpty={deals.length === 0} empty="هنوز فرصت فروشی برای این مشتری ساخته نشده است.">
          <div className="divide-y divide-[#F3E8DF]">
            {[...deals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8).map((d) => (
              <div key={d.id} className="py-1.5 flex items-center gap-2 text-[11px]">
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-[#3A241F] truncate">{d.title}</span>
                  <span className="block text-[10px] text-[#8C6F66] truncate">{STAGE[d.stage]} · {d.ownerName}{d.expectedClose ? ` · بستن: ${formatTaskDate(d.expectedClose)}` : ''}{d.stage === 'LOST' && d.lostReason ? ` · دلیل: ${d.lostReason}` : ''}</span>
                </span>
                <span className="shrink-0 font-black text-[#3A241F]">{formatMoney(d.amount || 0)} <span className="text-[10px] font-bold text-[#8C6F66]">{unitName()}</span></span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="تماس‌های تلفنی" icon={<Phone className="w-4 h-4 text-emerald-600" />} isEmpty={!calls || calls.length === 0} empty={calls === null ? 'در حال بارگیری…' : 'تماسی با این مشتری ثبت نشده است.'}>
          {calls && calls.length > 0 && (
            <>
              <div className="text-[11px] font-bold text-[#6b5048]">
                {toPersianDigits(calls.length)} تماس · ورودی {toPersianDigits(calls.filter((x) => x.direction === 'in').length)} · خروجی {toPersianDigits(calls.filter((x) => x.direction === 'out').length)} · بی‌پاسخ {toPersianDigits(calls.filter((x) => x.direction === 'in' && x.status !== 'answered').length)}
              </div>
              <div className="divide-y divide-[#F3E8DF]">
                {calls.slice(0, 5).map((x) => {
                  const I = callIcon(x);
                  return (
                    <div key={x.id} className="py-1.5 flex items-center gap-2 text-[11px]">
                      <I className={`w-4 h-4 shrink-0 ${x.status !== 'answered' && x.direction === 'in' ? 'text-rose-500' : 'text-emerald-600'}`} />
                      <span className="flex-1 min-w-0 truncate font-bold text-[#3A241F]">{x.direction === 'in' ? 'ورودی' : 'خروجی'}{x.userName ? ` · ${x.userName}` : ''}{x.duration > 0 ? ` · ${toPersianDigits(Math.round(x.duration / 60) || 1)} دقیقه` : ''}</span>
                      <span className="shrink-0 text-[10px] font-bold text-[#8C6F66]">{formatDateTime(x.startedAt)}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Block>

        <Block title={`فعالیت‌ها و یادداشت‌ها (${toPersianDigits(s.acts.length)})`} icon={<History className="w-4 h-4 text-sky-600" />} isEmpty={s.acts.length === 0} empty="هنوز یادداشت یا پیگیری ثبت نشده است.">
          <div className="flex flex-wrap gap-1.5">
            {s.byType.filter((x) => x.n > 0).map((x) => <span key={x.t} className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#FAF5F1] border border-[#EBDBCE] text-[#503730]">{ACT[x.t]}: {toPersianDigits(x.n)}</span>)}
          </div>
          <div className="divide-y divide-[#F3E8DF]">
            {s.acts.slice(0, 7).map((a) => (
              <div key={a.id} className="py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#8C6F66]">
                  <span className="text-[#3A241F] font-black">{ACT[a.type]} · {a.authorName}</span>
                  <span>{formatDateTime(a.createdAt)}</span>
                </div>
                {a.text && <div className="text-[#503730] leading-5 line-clamp-2">{a.text}</div>}
              </div>
            ))}
          </div>
        </Block>

        <Block title="قیمت‌های داده‌شده و کالاهای ناموجود" icon={<MessageSquare className="w-4 h-4 text-amber-600" />} isEmpty={s.quotes.length === 0 && s.missing.length === 0} empty="قیمت یا درخواست کالای ناموجودی ثبت نشده است.">
          {s.quotes.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
              <span className="truncate font-bold text-[#3A241F]">قیمت «{a.itemName}»{a.spec ? ` (${a.spec})` : ''}</span>
              <span className="shrink-0 font-black text-amber-800">{formatMoney(a.price || 0)} {unitName()}</span>
            </div>
          ))}
          {s.missing.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] py-0.5">
              <span className="truncate font-bold text-rose-700">خواسته ولی نبوده: {a.itemName}</span>
              <span className="shrink-0 text-[10px] font-bold text-[#8C6F66]">{formatDateTime(a.createdAt)}</span>
            </div>
          ))}
        </Block>
      </div>

      {sepidarOn && (
        <section className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5">
          <CustomerFinance customerId={c.id} />
        </section>
      )}
    </div>
  );
};
