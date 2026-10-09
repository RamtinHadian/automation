import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquare, Search, Send, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { smsButtons } from '../../lib/smsLibrary';
import { useAppContext } from '../../context/AppContext';
import { Customer, CustomerStatus, Deal, User } from '../../types';

const STATUS: Record<CustomerStatus, string> = { LEAD: 'مشتری بالقوه', ACTIVE: 'مشتری فعال', INACTIVE: 'غیرفعال' };
const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const hasMobile = (c: Customer) => c.phones.some((p) => /^(\+98|0098|98|0)?9\d{9}$/.test(faToEn(p).replace(/[\s-]/g, '')));
const sel = 'px-3 py-2 min-h-[40px] bg-white border border-[#EBDBCE] rounded-xl text-[11px] font-black text-[#3A241F] outline-hidden cursor-pointer';

interface Progress { id: string; total: number; sent: number; failed: number; skipped: number; done: boolean; error: string }

/** Group SMS: choose customers by their type, choose or write the text, check the preview, confirm, follow the progress. */
export const BulkSms: React.FC<{ customers: Customer[]; deals: Deal[]; me: User; isAdmin: boolean; enabled: boolean }> = ({ customers, deals, me, isAdmin, enabled }) => {
  const { showToast, staffList } = useAppContext();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | CustomerStatus>('ALL');
  const [kind, setKind] = useState<'ALL' | 'PERSON' | 'COMPANY'>('ALL');
  const [tag, setTag] = useState('');
  const [source, setSource] = useState('');
  const [province, setProvince] = useState('');
  const [dealsF, setDealsF] = useState<'ALL' | 'OPEN' | 'WON' | 'NONE'>('ALL');
  const [owner, setOwner] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const [buttons, setButtons] = useState(() => smsButtons(null, []));
  const [confirming, setConfirming] = useState(false);
  const [job, setJob] = useState<Progress | null>(null);
  const timer = useRef(0);

  useEffect(() => {
    api.smsStatus().then((r) => setButtons(smsButtons(r.library, r.custom))).catch(() => {});
    return () => window.clearInterval(timer.current);
  }, []);

  const mine = useMemo(() => customers.filter((c) => isAdmin || c.ownerId === me.id), [customers, isAdmin, me.id]);
  const tags = useMemo(() => [...new Set(mine.flatMap((c) => c.tags || []))].sort(), [mine]);
  const sources = useMemo(() => [...new Set(mine.map((c) => c.source || '').filter(Boolean))].sort(), [mine]);
  const provinces = useMemo(() => [...new Set(mine.map((c) => c.province || '').filter(Boolean))].sort(), [mine]);
  const dealState = useMemo(() => {
    const m = new Map<string, { open: boolean; won: boolean }>();
    for (const d of deals) {
      const e = m.get(d.customerId) || { open: false, won: false };
      if (d.stage === 'WON') e.won = true;
      else if (d.stage !== 'LOST') e.open = true;
      m.set(d.customerId, e);
    }
    return m;
  }, [deals]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return mine.filter((c) => {
      if (status !== 'ALL' && c.status !== status) return false;
      if (kind !== 'ALL' && (c.kind || 'PERSON') !== kind) return false;
      if (tag && !(c.tags || []).includes(tag)) return false;
      if (source && c.source !== source) return false;
      if (province && c.province !== province) return false;
      if (owner && c.ownerId !== owner) return false;
      const ds = dealState.get(c.id);
      if (dealsF === 'OPEN' && !ds?.open) return false;
      if (dealsF === 'WON' && !ds?.won) return false;
      if (dealsF === 'NONE' && ds) return false;
      return !t || `${c.name} ${c.company || ''} ${c.phones.join(' ')}`.toLowerCase().includes(t);
    });
  }, [mine, q, status, kind, tag, source, province, owner, dealsF, dealState]);

  const reachable = shown.filter(hasMobile);
  const chosen = mine.filter((c) => picked.has(c.id) && hasMobile(c));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sample = chosen[0]?.name || 'نام مشتری';
  const len = [...text].length;
  const MAX = 300;
  const busy = !!job && !job.done;

  const start = async () => {
    setConfirming(false);
    try {
      const j = await api.smsBulkStart({ customerIds: chosen.map((c) => c.id), text: text.trim() });
      setJob(j);
      window.clearInterval(timer.current);
      timer.current = window.setInterval(async () => {
        try {
          const p = await api.smsBulkProgress(j.id);
          setJob(p);
          if (p.done) {
            window.clearInterval(timer.current);
            showToast(`ارسال تمام شد: ${toPersianDigits(p.sent)} موفق${p.failed ? `، ${toPersianDigits(p.failed)} ناموفق` : ''}.`);
          }
        } catch {
          window.clearInterval(timer.current);
        }
      }, 1500);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال شروع نشد.');
    }
  };

  if (!enabled) {
    return <div className="rounded-3xl border border-[#EBDBCE] bg-white p-8 text-center text-xs font-bold text-[#8C6F66] leading-7">ارسال پیامک در سامانه فعال نیست. از مدیر بخواهید در «کنسول مدیریت ← تنظیمات سیستم ← پیامک» پنل کاوه‌نگار را وصل و فعال کند.</div>;
  }

  return (
    <div className="space-y-4" data-bulk-sms>
      <div className="rounded-3xl border border-[#EBDBCE] bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><Users className="w-4 h-4 text-violet-600" />۱. مشتریان را انتخاب کنید</div>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام، شرکت یا شماره…" className="w-full pr-9 pl-3 py-2 min-h-[40px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden" />
          </div>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as 'ALL' | CustomerStatus)}>
            <option value="ALL">همهٔ وضعیت‌ها</option>
            {(Object.keys(STATUS) as CustomerStatus[]).map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
          </select>
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as 'ALL' | 'PERSON' | 'COMPANY')}>
            <option value="ALL">شخص و شرکت</option>
            <option value="PERSON">فقط اشخاص</option>
            <option value="COMPANY">فقط شرکت‌ها</option>
          </select>
          <select className={sel} value={dealsF} onChange={(e) => setDealsF(e.target.value as 'ALL' | 'OPEN' | 'WON' | 'NONE')}>
            <option value="ALL">با هر وضعیت فروش</option>
            <option value="OPEN">فرصت فروش باز دارند</option>
            <option value="WON">خرید موفق داشته‌اند</option>
            <option value="NONE">هیچ فرصتی ندارند</option>
          </select>
          {tags.length > 0 && (
            <select className={sel} value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">همهٔ برچسب‌ها</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {sources.length > 0 && (
            <select className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">همهٔ منبع‌ها</option>
              {sources.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {provinces.length > 0 && (
            <select className={sel} value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">همهٔ استان‌ها</option>
              {provinces.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {isAdmin && (
            <select className={sel} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">همهٔ مسئول‌ها</option>
              {staffList.filter((u) => u.isActive).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
          <button type="button" onClick={() => setPicked(new Set([...picked, ...reachable.map((c) => c.id)]))} className="px-3 py-1.5 min-h-[36px] rounded-lg bg-violet-50 border border-violet-200 text-violet-800 cursor-pointer">انتخاب همهٔ فهرست ({toPersianDigits(reachable.length)})</button>
          <button type="button" onClick={() => setPicked(new Set())} className="px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[#3A241F] cursor-pointer">برداشتن انتخاب‌ها</button>
          <span className="text-[#8C6F66]">{toPersianDigits(shown.length)} مشتری در فهرست · {toPersianDigits(shown.length - reachable.length)} بدون موبایل</span>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE]/60" data-bulk-list>
          {shown.length === 0 ? (
            <div className="py-10 text-center text-xs font-bold text-gray-400">مشتری‌ای با این فیلتر پیدا نشد.</div>
          ) : (
            shown.map((c) => {
              const ok = hasMobile(c);
              return (
                <label key={c.id} className={`flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] cursor-pointer ${ok ? 'hover:bg-[#FAF5F1]' : 'opacity-50'}`}>
                  <input type="checkbox" disabled={!ok} checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ''}</span>
                    <span className="block text-[10px] text-[#8C6F66]">{STATUS[c.status]}{ok ? '' : ' · موبایل ندارد'}</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[#EBDBCE] bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><MessageSquare className="w-4 h-4 text-sky-700" />۲. نوع و متن پیامک</div>
        <div className="flex flex-wrap gap-1.5">
          {buttons.map((t) => (
            <button key={t.id} type="button" title={t.text} onClick={() => setText(t.text)} className={`px-3 py-1.5 min-h-[34px] rounded-lg border text-[11px] font-bold cursor-pointer ${text === t.text ? 'bg-sky-600 text-white border-sky-600' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>{t.label}</button>
          ))}
        </div>
        <textarea className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs leading-6 min-h-[110px] outline-hidden" value={text} onChange={(e) => setText(e.target.value)} maxLength={700} placeholder="یکی از نوع‌های بالا را بزنید یا متن را خودتان بنویسید. «{name}» به نام هر مشتری تبدیل می‌شود." />
        <div className="text-[10px] text-[#8C6F66]">{toPersianDigits(len)} نویسه · حدود {toPersianDigits(Math.max(1, Math.ceil(len / 70)))} پیامک برای هر نفر · زیر هر پیامک «خط پایانی» تنظیمات (نام شرکت یا نشانی سایت) خودکار اضافه می‌شود</div>
        {text.trim() && (
          <div className="rounded-xl border border-dashed border-[#C98B6A] bg-[#FDFAF7] px-3 py-2.5 text-[12px] font-bold text-[#3A241F] leading-7 whitespace-pre-line" data-bulk-preview>
            <span className="block text-[10px] text-[#8C6F66] font-medium">پیش‌نمایش برای «{sample}»</span>
            {text.replace(/\{name\}/g, sample)}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-[#EBDBCE] bg-white p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><Send className="w-4 h-4 text-teal-700" />۳. ارسال</div>
        {chosen.length > MAX && <div className="text-[11px] font-black text-rose-600">در هر ارسال حداکثر {toPersianDigits(MAX)} نفر ممکن است؛ انتخاب را کم کنید.</div>}
        {job && (
          <div className="space-y-1.5" data-bulk-progress>
            <div className="h-2.5 rounded-full bg-[#EBDBCE] overflow-hidden"><div className="h-full bg-teal-600 transition-all duration-500" style={{ width: `${Math.round(((job.sent + job.failed) / Math.max(1, job.total)) * 100)}%` }} /></div>
            <div className="text-[11px] font-black text-[#3A241F] flex items-center gap-1.5">
              {job.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Loader2 className="w-4 h-4 animate-spin text-teal-600" />}
              {toPersianDigits(job.sent)} ارسال شد از {toPersianDigits(job.total)}{job.failed ? ` · ${toPersianDigits(job.failed)} ناموفق` : ''}{job.skipped ? ` · ${toPersianDigits(job.skipped)} رد شد` : ''}
            </div>
            {job.error && <div className="text-[10px] font-bold text-rose-600">{job.error}</div>}
          </div>
        )}
        {confirming ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 space-y-2">
            <div className="text-xs font-black text-amber-900 leading-6">این پیامک برای {toPersianDigits(chosen.length)} نفر فرستاده می‌شود و پس‌گرفتن آن ممکن نیست. ادامه می‌دهید؟</div>
            <div className="flex gap-2">
              <button type="button" onClick={start} className="px-5 py-2 min-h-[40px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer">بله، ارسال شود</button>
              <button type="button" onClick={() => setConfirming(false)} className="px-4 py-2 min-h-[40px] rounded-xl bg-white border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={busy || chosen.length === 0 || chosen.length > MAX || !text.trim()} onClick={() => setConfirming(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer" data-bulk-send>
            <Send className="w-4 h-4" />
            ارسال به {toPersianDigits(chosen.length)} نفر
          </button>
        )}
      </div>
    </div>
  );
};
