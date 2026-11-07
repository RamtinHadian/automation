import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, BookOpen, ClipboardList, Contact, MessageCircle, Megaphone, MessagesSquare, Pencil, Plus, Search, Target, Trash2, TrendingUp, X } from 'lucide-react';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { CONTACT_TYPES, contactTypeOf } from '../../lib/contactTypes';
import { Campaign, Customer, Deal, SurveyQuestion, User } from '../../types';
import { NETWORKS, SocialLogo } from './SocialNetworks';
import { InboxPanel } from './InboxPanel';
import { C, ChartCard, compact, Donut, HBars, SERIES } from '../admin/charts';

/**
 * «بازاریابی»: the marketing menu of the CRM. It follows the standard lists of Vtiger (lead sources, lead status, rating, campaign
 * types and statuses, expected and real revenue, ROI), worked out from the customers and opportunities already in the CRM, and keeps
 * the campaigns in its own list.
 */

// ---- the Vtiger standard lists, in Persian ----
export const LEAD_SOURCES = ['تماس سرد', 'مشتری قبلی', 'تولید شخصی', 'کارمند', 'شریک تجاری', 'روابط عمومی', 'پست مستقیم', 'همایش', 'نمایشگاه', 'وب‌سایت', 'معرفی دوستان', 'تبلیغات', 'شبکه‌های اجتماعی', 'دیگر'];
export const CAMPAIGN_TYPES = ['همایش', 'وبینار', 'نمایشگاه', 'روابط عمومی', 'شرکای تجاری', 'برنامهٔ معرفی', 'تبلیغات', 'بنر', 'پست مستقیم', 'ایمیل', 'پیامک', 'تلفنی (تله‌مارکتینگ)', 'شبکه‌های اجتماعی', 'دیگر'];
export const CAMPAIGN_STATUS: Record<Campaign['status'], { label: string; cls: string }> = {
  PLANNING: { label: 'در حال برنامه‌ریزی', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  ACTIVE: { label: 'فعال', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE: { label: 'غیرفعال', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  COMPLETE: { label: 'تکمیل‌شده', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  CANCELLED: { label: 'لغو شده', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const LEAD_STATUS = [
  { id: 'NOT_CONTACTED', label: 'تماس گرفته نشده' }, { id: 'ATTEMPTED', label: 'تلاش برای تماس' }, { id: 'CONTACTED', label: 'تماس گرفته شد' },
  { id: 'COLD', label: 'سرد' }, { id: 'WARM', label: 'گرم' }, { id: 'HOT', label: 'داغ' }, { id: 'LOST', label: 'از دست رفته' }, { id: 'JUNK', label: 'بی‌ارزش' },
];
const RATINGS = ['تازه‌به‌دست‌آمده', 'فعال', 'بازار شکست‌خورده', 'پروژه لغو شد', 'تعطیل‌شده'];
const RESPONSES = ['عالی', 'خوب', 'متوسط', 'ضعیف'];
const INDUSTRIES = ['کشاورزی', 'بانکداری', 'ساخت‌وساز', 'آموزش', 'انرژی', 'مالی', 'سلامت و درمان', 'فناوری اطلاعات', 'بیمه', 'تولید', 'رسانه', 'خرده‌فروشی', 'حمل‌ونقل', 'خدمات', 'دیگر'];

type Section = 'overview' | 'campaigns' | 'leads' | 'surveys' | 'messages' | 'messengers' | 'contacts' | 'standards';
const SECTIONS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'نمای کلی', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { id: 'campaigns', label: 'کمپین‌های تبلیغاتی', icon: <Megaphone className="w-3.5 h-3.5" /> },
  { id: 'leads', label: 'سرنخ‌های فروش', icon: <Target className="w-3.5 h-3.5" /> },
  { id: 'surveys', label: 'نظرسنجی‌ها', icon: <ClipboardList className="w-3.5 h-3.5" /> },
  { id: 'messages', label: 'کمپین‌های پیام', icon: <MessagesSquare className="w-3.5 h-3.5" /> },
  { id: 'messengers', label: 'پیام‌رسان‌ها', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { id: 'contacts', label: 'مخاطبین', icon: <Contact className="w-3.5 h-3.5" /> },
  { id: 'standards', label: 'استانداردها', icon: <BookOpen className="w-3.5 h-3.5" /> },
];

const QUESTION_TYPES: { id: SurveyQuestion['type']; label: string }[] = [
  { id: 'TEXT', label: 'سؤال متنی' }, { id: 'SCALE', label: 'سؤال طیفی' }, { id: 'MULTI', label: 'سؤال چندگزینه‌ای (چندانتخابی)' }, { id: 'SINGLE', label: 'سؤال چندگزینه‌ای (تک‌انتخابی)' },
];
const SURVEY_STATUS: Partial<Record<Campaign['status'], { label: string; cls: string }>> = {
  PLANNING: { label: 'پیش‌نویس', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  ACTIVE: { label: 'منتشرشده', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  COMPLETE: { label: 'بسته‌شده', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const field = 'w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-violet-300';
const label = 'block text-[11px] font-black text-[#8C6F66] mb-1';
const newId = () => 'cm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);

/** a lead's status in the Vtiger list, taken from what the CRM already knows (status of the customer and of his latest opportunity) */
const leadStatusOf = (c: Customer, deals: Deal[]): string => {
  const own = LEAD_STATUS.find((x) => x.label === c.leadStatus);
  if (own) return own.id;
  const mine = deals.filter((d) => d.customerId === c.id);
  if (c.status === 'INACTIVE') return mine.some((d) => d.stage === 'LOST') ? 'LOST' : 'JUNK';
  if (mine.some((d) => d.stage === 'NEGOTIATION' || d.stage === 'PROPOSAL')) return 'HOT';
  if (mine.some((d) => d.stage === 'CONTACTED')) return 'WARM';
  if (mine.length > 0) return 'COLD';
  return 'NOT_CONTACTED';
};

const Kpi: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string }> = ({ icon, label: l, value, sub }) => (
  <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 flex items-center gap-3 min-w-0">
    <span className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">{icon}</span>
    <div className="min-w-0">
      <div className="text-sm font-black text-[#3A241F] truncate">{value}</div>
      <div className="text-[11px] font-bold text-[#8C6F66] truncate">{l}</div>
      {sub && <div className="text-[10px] font-bold text-[#8C6F66]/80 truncate">{sub}</div>}
    </div>
  </div>
);

const blank = (owner: string, kind: 'CAMPAIGN' | 'SURVEY' | 'MESSAGE' = 'CAMPAIGN'): Campaign => ({ id: newId(), kind, module: kind === 'MESSAGE' ? 'CUSTOMERS' : undefined, frequency: kind === 'MESSAGE' ? 'DAILY' : undefined, perDay: kind === 'MESSAGE' ? 4 : undefined, startHour: kind === 'MESSAGE' ? '09:00' : undefined, name: '', type: kind === 'SURVEY' ? 'نظرسنجی' : kind === 'MESSAGE' ? 'پیام' : CAMPAIGN_TYPES[0], status: 'PLANNING', ownerName: owner, startDate: todayIso(), expectedResponse: RESPONSES[1], questions: kind === 'SURVEY' ? [] : undefined });

const CampaignForm: React.FC<{ value: Campaign; customers: Customer[]; staff: User[]; onSave: (c: Campaign) => void; onClose: () => void }> = ({ value, customers, staff, onSave, onClose }) => {
  const survey = value.kind === 'SURVEY';
  const [preview, setPreview] = useState(false);
  const [c, setC] = useState<Campaign>(value);
  const [q, setQ] = useState('');
  const p = (patch: Partial<Campaign>) => setC((x) => ({ ...x, ...patch }));
  const money = (k: keyof Campaign) => (
    <input className={field} inputMode="numeric" dir="ltr" value={c[k] ? String(toDisplay(num(c[k]))) : ''} onChange={(e) => p({ [k]: fromDisplay(Number(e.target.value.replace(/[^0-9]/g, '')) || 0) } as Partial<Campaign>)} />
  );
  const count = (k: keyof Campaign) => (
    <input className={field} inputMode="numeric" dir="ltr" value={c[k] ? String(c[k]) : ''} onChange={(e) => p({ [k]: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 } as Partial<Campaign>)} />
  );
  const chosen = new Set(c.customerIds || []);
  const list = customers.filter((x) => !q || x.name.includes(q) || (x.company || '').includes(q)).slice(0, 40);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Megaphone className="w-4 h-4 text-violet-700" />{survey ? (value.name ? 'ویرایش نظرسنجی' : 'نظرسنجی تازه') : value.name ? 'ویرایش کمپین تبلیغاتی' : 'کمپین تبلیغاتی تازه'}</h3>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className={label}>{survey ? 'نام نظرسنجی' : 'نام کمپین تبلیغاتی'} <span className="text-rose-600">*</span></label><input className={field} value={c.name} onChange={(e) => p({ name: e.target.value })} autoFocus /></div>
            <div><label className={label}>ارجاع به <span className="text-rose-600">*</span></label>
              <select className={field} value={c.ownerName || ''} onChange={(e) => p({ ownerName: e.target.value })}>
                {[...new Set([c.ownerName || '', ...staff.map((u) => u.fullName)])].filter(Boolean).map((n) => <option key={n}>{n}</option>)}
              </select></div>
            <div><label className={label}>{survey ? 'وضعیت نظرسنجی' : 'وضعیت کمپین تبلیغاتی'}</label><select className={field} value={c.status} onChange={(e) => p({ status: e.target.value as Campaign['status'] })}>{(survey ? (Object.keys(SURVEY_STATUS) as Campaign['status'][]) : (Object.keys(CAMPAIGN_STATUS) as Campaign['status'][])).map((k) => <option key={k} value={k}>{survey ? SURVEY_STATUS[k]?.label : CAMPAIGN_STATUS[k].label}</option>)}</select></div>
            {!survey && <div><label className={label}>نوع کمپین تبلیغاتی</label><select className={field} value={c.type} onChange={(e) => p({ type: e.target.value })}>{CAMPAIGN_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>}
            {!survey && <div><label className={label}>محصول</label><input className={field} value={c.product || ''} onChange={(e) => p({ product: e.target.value })} placeholder="نام یا کد کالا" /></div>}
            <div><label className={label}>جامعهٔ هدف تبلیغات</label><input className={field} value={c.audience || ''} onChange={(e) => p({ audience: e.target.value })} placeholder="مثلاً پیمانکاران شبکه" /></div>
            <div><label className={label}>وسعت بازار هدف (نفر)</label>{count('targetSize')}</div>
            <div><label className={label}>تاریخ شروع (مثل 2026-11-07)</label><input className={field} dir="ltr" value={c.startDate || ''} onChange={(e) => p({ startDate: e.target.value })} placeholder="YYYY-MM-DD" /></div>
            <div><label className={label}>تاریخ مورد انتظار بسته شدن <span className="text-rose-600">*</span></label><input className={field} dir="ltr" value={c.expectedClose || ''} onChange={(e) => p({ expectedClose: e.target.value })} placeholder="YYYY-MM-DD" /></div>
          </div>
          {survey ? (
            <div className="space-y-3">
              <div><label className={label}>متن خوشامدگویی</label><textarea className={field + ' min-h-[70px]'} value={c.welcomeText || ''} onChange={(e) => p({ welcomeText: e.target.value })} /></div>
              <div><label className={label}>متن تشکر</label><textarea className={field + ' min-h-[70px]'} value={c.thanksText || ''} onChange={(e) => p({ thanksText: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer"><input type="checkbox" className="accent-violet-600" checked={!!c.collectParticipant} onChange={(e) => p({ collectParticipant: e.target.checked })} />دریافت مشخصات شرکت‌کننده (نام و شمارهٔ تماس)</label>
              <div className="font-black text-[12px] text-[#3A241F] pt-1">سؤال‌های نظرسنجی</div>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((qt) => (
                  <button key={qt.id} type="button" onClick={() => p({ questions: [...(c.questions || []), { id: newId(), type: qt.id, text: '', options: qt.id === 'MULTI' || qt.id === 'SINGLE' ? ['', ''] : undefined }] })} className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] hover:border-violet-300 cursor-pointer">+ {qt.label}</button>
                ))}
              </div>
              {(c.questions || []).length === 0 && <div className="text-center text-[11px] font-bold text-gray-400 py-5 border border-dashed border-[#EBDBCE] rounded-2xl">برای افزودن سؤال، یکی از نوع‌های بالا را بزنید.</div>}
              {(c.questions || []).map((qn, i) => {
                const setQ = (patch: Partial<SurveyQuestion>) => p({ questions: (c.questions || []).map((x) => (x.id === qn.id ? { ...x, ...patch } : x)) });
                return (
                  <div key={qn.id} className="border border-[#EBDBCE] rounded-2xl p-3 space-y-2 bg-[#FAF5F1]/60">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black rounded-lg bg-violet-100 text-violet-700 px-2 py-1 shrink-0">{toPersianDigits(i + 1)} · {QUESTION_TYPES.find((x) => x.id === qn.type)?.label}</span>
                      <input className={field} value={qn.text} onChange={(e) => setQ({ text: e.target.value })} placeholder="متن سؤال" />
                      <button type="button" aria-label="حذف سؤال" onClick={() => p({ questions: (c.questions || []).filter((x) => x.id !== qn.id) })} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {(qn.type === 'MULTI' || qn.type === 'SINGLE') && (
                      <div className="space-y-1.5 pr-3">
                        {(qn.options || []).map((o, k) => (
                          <div key={k} className="flex items-center gap-2">
                            <input className={field} value={o} onChange={(e) => setQ({ options: (qn.options || []).map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`گزینهٔ ${toPersianDigits(k + 1)}`} />
                            <button type="button" aria-label="حذف گزینه" onClick={() => setQ({ options: (qn.options || []).filter((_, j) => j !== k) })} className="p-1 rounded-lg text-[#8C6F66] hover:bg-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => setQ({ options: [...(qn.options || []), ''] })} className="text-[11px] font-black text-violet-700 cursor-pointer">+ گزینهٔ تازه</button>
                      </div>
                    )}
                    {qn.type === 'SCALE' && <div className="text-[10.5px] font-bold text-[#8C6F66] pr-1">پاسخ‌دهنده عددی از ۱ تا ۱۰ انتخاب می‌کند.</div>}
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div><label className={label}>تعداد پاسخ‌دهندگان</label>{count('responses')}</div>
                <div><label className={label}>میانگین رضایت (۱ تا ۵)</label><input className={field} dir="ltr" inputMode="decimal" value={c.satisfaction ?? ''} onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9.]/g, '')); p({ satisfaction: isFinite(n) ? Math.min(5, n) : 0 }); }} /></div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="font-black text-[12px] text-[#3A241F]">انتظارات و واقعیت‌ها</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className={label}>هزینهٔ در نظر گرفته‌شده ({unitName()})</label>{money('expectedCost')}</div>
                <div><label className={label}>بهای واقعی ({unitName()})</label>{money('actualCost')}</div>
                <div><label className={label}>پاسخ مورد انتظار</label><select className={field} value={c.expectedResponse || ''} onChange={(e) => p({ expectedResponse: e.target.value })}>{RESPONSES.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className={label}>درآمد مورد انتظار ({unitName()})</label>{money('expectedRevenue')}</div>
                <div><label className={label}>تعداد فروش مورد انتظار</label>{count('expectedSales')}</div>
                <div><label className={label}>تعداد فروش واقعی</label>{count('actualSales')}</div>
                <div><label className={label}>مقدار دریافتی مورد انتظار ({unitName()})</label>{money('expectedReceived')}</div>
                <div><label className={label}>مقدار دریافتی واقعی ({unitName()})</label>{money('actualReceived')}</div>
                <div><label className={label}>نرخ بازگشت سرمایهٔ مورد انتظار (٪)</label>{count('expectedRoi')}</div>
                <div><label className={label}>درآمد واقعی ({unitName()})</label>{money('actualRevenue')}</div>
                <div className="sm:col-span-2 flex items-end text-[11px] font-bold text-[#8C6F66]">نرخ بازگشت سرمایهٔ واقعی خودکار حساب می‌شود: (درآمد واقعی − بهای واقعی) ÷ بهای واقعی.</div>
              </div>
            </div>
          )}
          <div><label className={label}>توضیحات</label><textarea className={field + ' min-h-[80px]'} value={c.goal || ''} onChange={(e) => p({ goal: e.target.value })} /></div>
          <div>
            <label className={label}>مشتریان این کمپین ({toPersianDigits(chosen.size)} نفر)</label>
            <input className={field + ' mb-2'} placeholder="جستجوی مشتری…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-40 overflow-y-auto border border-[#EBDBCE] rounded-xl divide-y divide-[#EBDBCE]/60">
              {list.map((x) => (
                <label key={x.id} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-[#3A241F] cursor-pointer hover:bg-[#FAF5F1]">
                  <input type="checkbox" className="accent-violet-600" checked={chosen.has(x.id)} onChange={(e) => { const s = new Set(chosen); if (e.target.checked) s.add(x.id); else s.delete(x.id); p({ customerIds: [...s] }); }} />
                  <span className="truncate">{x.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#EBDBCE]">
          {survey && <button type="button" onClick={() => setPreview(true)} className="ml-auto px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">پیش‌نمایش</button>}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer">انصراف</button>
          <button type="button" disabled={!c.name.trim() || !(c.expectedClose || '').trim()} onClick={() => onSave(c)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer">ذخیره</button>
        </div>
      </div>
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3" onMouseDown={() => setPreview(false)}>
          <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto border border-[#EBDBCE] p-5 space-y-3 text-right">
            <div className="flex items-center justify-between"><h4 className="font-black text-sm text-[#3A241F]">پیش‌نمایش: {c.name || 'نظرسنجی'}</h4><button type="button" aria-label="بستن" onClick={() => setPreview(false)} className="p-1.5 text-[#8C6F66] cursor-pointer"><X className="w-4 h-4" /></button></div>
            {c.welcomeText && <p className="text-xs font-bold text-[#3A241F] whitespace-pre-line">{c.welcomeText}</p>}
            {c.collectParticipant && <div className="grid grid-cols-2 gap-2"><input className={field} placeholder="نام و نام خانوادگی" readOnly /><input className={field} placeholder="شمارهٔ تماس" readOnly /></div>}
            {(c.questions || []).map((qn, i) => (
              <div key={qn.id} className="space-y-1.5">
                <div className="text-xs font-black text-[#3A241F]">{toPersianDigits(i + 1)}. {qn.text || '—'}</div>
                {qn.type === 'TEXT' && <textarea className={field} readOnly rows={2} />}
                {qn.type === 'SCALE' && <div className="flex gap-1 flex-wrap">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <span key={n} className="w-8 h-8 rounded-lg border border-[#EBDBCE] flex items-center justify-center text-[11px] font-black text-[#8C6F66]">{toPersianDigits(n)}</span>)}</div>}
                {(qn.type === 'MULTI' || qn.type === 'SINGLE') && (qn.options || []).filter(Boolean).map((o) => <label key={o} className="flex items-center gap-2 text-xs font-bold text-[#3A241F]"><input type={qn.type === 'MULTI' ? 'checkbox' : 'radio'} disabled />{o}</label>)}
              </div>
            ))}
            {c.thanksText && <p className="text-xs font-bold text-emerald-700 whitespace-pre-line border-t border-[#EBDBCE] pt-3">{c.thanksText}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

const FREQ: Record<NonNullable<Campaign['frequency']>, string> = { DAILY: 'روزانه', WEEKLY: 'هفتگی', MONTHLY: 'ماهانه' };

/** The three steps of a message campaign: details, conditions (who gets it) and tasks (what is sent). */
const MessageWizard: React.FC<{ value: Campaign; customers: Customer[]; staff: User[]; onSave: (c: Campaign) => void; onClose: () => void }> = ({ value, customers, staff, onSave, onClose }) => {
  const [step, setStep] = useState(1);
  const [c, setC] = useState<Campaign>(value);
  const p = (patch: Partial<Campaign>) => setC((x) => ({ ...x, ...patch }));
  const cond = c.conditions || {};
  const setCond = (patch: NonNullable<Campaign['conditions']>) => p({ conditions: { ...cond, ...patch } });
  const pool = customers.filter((x) => (c.module === 'LEADS' ? x.status === 'LEAD' : true));
  const matches = pool.filter((x) => (!cond.status || x.status === cond.status) && (!cond.source || (x.source || '') === cond.source) && (!cond.city || (x.city || '') === cond.city) && (!cond.tag || (x.tags || []).includes(cond.tag)));
  const uniq = (f: (x: Customer) => string | undefined) => [...new Set(pool.map(f).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'fa'));
  const tasks = c.tasks || [];
  const days = c.perDay ? Math.ceil(matches.length / c.perDay) : 0;
  const steps = ['جزئیات کمپین', 'شرایط کمپین', 'وظایف کمپین'];
  const ok1 = !!c.name.trim() && !!c.ownerName && !!c.perDay && !!c.startHour;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><MessagesSquare className="w-4 h-4 text-violet-700" />{value.name ? 'ویرایش کمپین پیام' : 'ایجاد کمپین پیام'}</h3>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2 px-5 pt-4">
          {steps.map((n, i) => (
            <button key={n} type="button" onClick={() => (i === 0 || ok1) && setStep(i + 1)} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${step === i + 1 ? 'bg-violet-600 text-white' : step > i + 1 ? 'bg-emerald-500 text-white' : 'bg-[#FAF5F1] text-[#8C6F66]'}`}>{toPersianDigits(i + 1)}</span>
              <span className={`text-[11px] font-black ${step === i + 1 ? 'text-violet-700' : 'text-[#8C6F66]'}`}>{n}</span>
            </button>
          ))}
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className={label}>موضوع <span className="text-rose-600">*</span></label><input className={field} value={c.name} onChange={(e) => p({ name: e.target.value })} autoFocus /></div>
              <div><label className={label}>ارجاع به <span className="text-rose-600">*</span></label>
                <select className={field} value={c.ownerName || ''} onChange={(e) => p({ ownerName: e.target.value })}>{[...new Set([c.ownerName || '', ...staff.map((u) => u.fullName)])].filter(Boolean).map((n) => <option key={n}>{n}</option>)}</select></div>
              <div><label className={label}>ماژول مرتبط <span className="text-rose-600">*</span></label>
                <select className={field} value={c.module || 'CUSTOMERS'} onChange={(e) => p({ module: e.target.value as Campaign['module'] })}><option value="CUSTOMERS">مخاطبین (همهٔ مشتریان)</option><option value="LEADS">سرنخ‌ها (مشتریان بالقوه)</option></select></div>
              <div><label className={label}>تناوب <span className="text-rose-600">*</span></label>
                <select className={field} value={c.frequency || 'DAILY'} onChange={(e) => p({ frequency: e.target.value as Campaign['frequency'] })}>{(Object.keys(FREQ) as (keyof typeof FREQ)[]).map((k) => <option key={k} value={k}>{FREQ[k]}</option>)}</select></div>
              <div><label className={label}>تعداد ارسال در هر نوبت <span className="text-rose-600">*</span></label><input className={field} dir="ltr" inputMode="numeric" value={c.perDay ? String(c.perDay) : ''} onChange={(e) => p({ perDay: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} /></div>
              <div><label className={label}>راس ساعت <span className="text-rose-600">*</span></label><input className={field} dir="ltr" value={c.startHour || ''} onChange={(e) => p({ startHour: e.target.value })} placeholder="09:00" /></div>
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer self-end pb-2"><input type="checkbox" className="accent-violet-600" checked={!!c.skipHolidays} onChange={(e) => p({ skipHolidays: e.target.checked })} />در تعطیلات ارسال نکن</label>
              <div><label className={label}>تاریخ شروع (مثل 2026-11-07)</label><input className={field} dir="ltr" value={c.startDate || ''} onChange={(e) => p({ startDate: e.target.value, expectedClose: c.expectedClose || e.target.value })} placeholder="YYYY-MM-DD" /></div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-[#8C6F66]">مخاطبان کمپین را با شرط‌ها محدود کنید. اگر شرطی نگذارید، همهٔ مشتریان این ماژول انتخاب می‌شوند.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className={label}>وضعیت مشتری</label><select className={field} value={cond.status || ''} onChange={(e) => setCond({ status: e.target.value || undefined })}><option value="">همه</option><option value="LEAD">مشتری بالقوه</option><option value="ACTIVE">مشتری فعال</option><option value="INACTIVE">غیرفعال</option></select></div>
                <div><label className={label}>منبع آشنایی</label><select className={field} value={cond.source || ''} onChange={(e) => setCond({ source: e.target.value || undefined })}><option value="">همه</option>{uniq((x) => x.source).map((x) => <option key={x}>{x}</option>)}</select></div>
                <div><label className={label}>شهر</label><select className={field} value={cond.city || ''} onChange={(e) => setCond({ city: e.target.value || undefined })}><option value="">همه</option>{uniq((x) => x.city).map((x) => <option key={x}>{x}</option>)}</select></div>
                <div><label className={label}>برچسب</label><select className={field} value={cond.tag || ''} onChange={(e) => setCond({ tag: e.target.value || undefined })}><option value="">همه</option>{[...new Set(pool.flatMap((x) => x.tags || []))].map((x) => <option key={x}>{x}</option>)}</select></div>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3 text-xs font-black text-violet-800">{toPersianDigits(matches.length)} مخاطب با این شرط‌ها انتخاب می‌شود{days > 0 ? ` · با ${toPersianDigits(c.perDay || 0)} ارسال در هر نوبت، حدود ${toPersianDigits(days)} نوبت طول می‌کشد` : ''}.</div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => p({ tasks: [...tasks, { id: newId(), channel: 'SMS', text: '' }] })} className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] hover:border-violet-300 cursor-pointer">+ پیامک</button>
                <button type="button" onClick={() => p({ tasks: [...tasks, { id: newId(), channel: 'MESSENGER', text: '' }] })} className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] hover:border-violet-300 cursor-pointer">+ پیام در پیام‌رسان (بله، ایتا، واتس‌اپ…)</button>
              </div>
              {tasks.length === 0 && <div className="text-center text-[11px] font-bold text-gray-400 py-6 border border-dashed border-[#EBDBCE] rounded-2xl">هنوز وظیفه‌ای نیست. یک پیام اضافه کنید؛ «{'{name}'} جای نام مشتری می‌نشیند.</div>}
              {tasks.map((tk, i) => (
                <div key={tk.id} className="border border-[#EBDBCE] rounded-2xl p-3 space-y-2 bg-[#FAF5F1]/60">
                  <div className="flex items-center justify-between"><span className="text-[10px] font-black rounded-lg bg-violet-100 text-violet-700 px-2 py-1">{toPersianDigits(i + 1)} · {tk.channel === 'SMS' ? 'پیامک' : 'پیام‌رسان'}</span>
                    <button type="button" aria-label="حذف" onClick={() => p({ tasks: tasks.filter((x) => x.id !== tk.id) })} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button></div>
                  <textarea className={field + ' min-h-[80px]'} value={tk.text} onChange={(e) => p({ tasks: tasks.map((x) => (x.id === tk.id ? { ...x, text: e.target.value } : x)) })} placeholder="متن پیام؛ {name} = نام مشتری" />
                </div>
              ))}
              <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-3 leading-6">این کمپین الان به‌صورت برنامه ذخیره می‌شود (مخاطبان، زمان‌بندی و متن). ارسال خودکار در ساعت تعیین‌شده هنوز فعال نیست؛ برای ارسال، از «پیامک گروهی» استفاده کنید.</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer">لغو</button>
          <span className="flex items-center gap-2">
            {step > 1 && <button type="button" onClick={() => setStep(step - 1)} className="px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">قبلی</button>}
            {step < 3 ? <button type="button" disabled={step === 1 && !ok1} onClick={() => setStep(step + 1)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer">بعدی</button>
              : <button type="button" onClick={() => onSave({ ...c, status: c.status || 'PLANNING', expectedClose: c.expectedClose || c.startDate || todayIso() })} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer">ذخیره</button>}
          </span>
        </div>
      </div>
    </div>
  );
};

export const MarketingView: React.FC<{ customers: Customer[]; allContacts: Customer[]; deals: Deal[]; staff: User[]; currentUserName: string; showToast: (m: string) => void; onOpenCustomer: (id: string) => void; onOpenSms: () => void; canPhonebook: boolean; onOpenPhoneBook: () => void; isAdmin: boolean }> = ({ customers, allContacts, deals, staff, currentUserName, showToast, onOpenCustomer, onOpenSms, canPhonebook, onOpenPhoneBook, isAdmin }) => {
  const [sec, setSec] = useState<Section>('overview');
  const [all, setAll] = useState<Campaign[]>([]);
  const campaigns = useMemo(() => all.filter((x) => x.kind !== 'SURVEY' && x.kind !== 'MESSAGE'), [all]);
  const messageCamps = useMemo(() => all.filter((x) => x.kind === 'MESSAGE'), [all]);
  const surveys = useMemo(() => all.filter((x) => x.kind === 'SURVEY'), [all]);
  const [contactQ, setContactQ] = useState('');
  type Sent = { key: string; at: string; by: string; platform: string; to: string; text: string; status?: string };
  const [sent, setSent] = useState<Sent[]>([]);
  const [sentAll, setSentAll] = useState(true);
  const [pf, setPf] = useState('ALL');
  const loadSent = useCallback(async () => {
    const rows: Sent[] = [];
    try {
      const r = await api.socialLogList();
      setSentAll(r.all);
      for (const x of r.log) rows.push({ key: 'sl' + x.at + x.account, at: x.at, by: x.by, platform: x.platformName || x.platform, to: [x.customerName, x.account].filter(Boolean).join(' · '), text: x.text });
    } catch { /* no messenger rows */ }
    if (isAdmin) {
      try { for (const x of (await api.smsLog()).log) rows.push({ key: 'sm' + x.at + x.to, at: x.at, by: x.by, platform: 'پیامک', to: x.to, text: x.text, status: x.status }); } catch { /* the SMS log is for administrators only */ }
    }
    setSent(rows.sort((a, b) => b.at.localeCompare(a.at)));
  }, [isAdmin]);
  const [loaded, setLoaded] = useState(false);
  const [edit, setEdit] = useState<Campaign | null>(null);
  const [leadFilter, setLeadFilter] = useState<string>('ALL');

  const load = useCallback(async () => {
    try { setAll((await api.campaignList()).campaigns || []); } catch { /* the list stays empty; the message comes with the next action */ }
    setLoaded(true);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (sec === 'messengers') void loadSent(); }, [sec, loadSent]);

  const save = async (c: Campaign) => {
    try { await api.campaignSave(c); setEdit(null); showToast('ذخیره شد.'); await load(); } catch (e) { showToast((e as Error).message || 'ذخیرهٔ کمپین نشد.'); }
  };
  const remove = async (c: Campaign) => {
    if (!(await askConfirm(`کمپین «${c.name}» حذف شود؟`, { title: 'حذف کمپین؟', confirmText: 'بله، حذف شود' }))) return;
    try { await api.campaignDelete(c.id); showToast('کمپین حذف شد.'); await load(); } catch (e) { showToast((e as Error).message || 'حذف نشد.'); }
  };

  const real = useMemo(() => customers.filter((c) => !c.contactType), [customers]);
  const wonBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) if (d.stage === 'WON' && !d.mergedInto) m.set(d.customerId, (m.get(d.customerId) || 0) + d.amount);
    return m;
  }, [deals]);
  const leads = useMemo(() => real.filter((c) => c.status === 'LEAD' || !wonBy.has(c.id)).map((c) => ({ c, st: leadStatusOf(c, deals) })), [real, deals, wonBy]);
  const sourceOf = (c: Customer) => (c.source || '').trim() || (c.referrer?.name ? 'معرفی دوستان' : 'نامشخص');

  const sources = useMemo(() => {
    const m = new Map<string, { total: number; won: number; revenue: number }>();
    for (const c of real) {
      const k = sourceOf(c);
      const row = m.get(k) || { total: 0, won: 0, revenue: 0 };
      row.total += 1;
      if (wonBy.has(c.id)) { row.won += 1; row.revenue += wonBy.get(c.id) || 0; }
      m.set(k, row);
    }
    return [...m.entries()].map(([name, v]) => ({ name, ...v, rate: v.total ? Math.round((v.won / v.total) * 100) : 0 })).sort((a, b) => b.total - a.total);
  }, [real, wonBy]);

  const camp = useMemo(() => {
    const cost = campaigns.reduce((s, c) => s + num(c.actualCost), 0);
    const rev = campaigns.reduce((s, c) => s + num(c.actualRevenue), 0);
    return { active: campaigns.filter((c) => c.status === 'ACTIVE').length, cost, rev, roi: cost > 0 ? Math.round(((rev - cost) / cost) * 100) : null };
  }, [campaigns]);

  const wonCustomers = real.filter((c) => wonBy.has(c.id)).length;
  const conv = real.length ? Math.round((wonCustomers / real.length) * 100) : 0;

  const statusCount = LEAD_STATUS.map((s) => ({ ...s, n: leads.filter((l) => l.st === s.id).length }));
  const shownLeads = leads.filter((l) => leadFilter === 'ALL' || l.st === leadFilter).slice(0, 200);

  return (
    <div className="space-y-4" data-marketing>
      <div className="flex flex-wrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={sec === s.id} onClick={() => setSec(s.id)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black cursor-pointer ${sec === s.id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {sec === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={<Target className="w-5 h-5" />} label="سرنخ‌های باز" value={toPersianDigits(leads.length)} sub={`${toPersianDigits(real.length)} مشتری در کل`} />
            <Kpi icon={<TrendingUp className="w-5 h-5" />} label="نرخ تبدیل به خریدار" value={`${toPersianDigits(conv)}٪`} sub={`${toPersianDigits(wonCustomers)} خریدار`} />
            <Kpi icon={<Megaphone className="w-5 h-5" />} label="کمپین فعال" value={toPersianDigits(camp.active)} sub={`${toPersianDigits(campaigns.length)} کمپین ثبت‌شده`} />
            <Kpi icon={<BadgeDollarSign className="w-5 h-5" />} label="بازگشت سرمایه (ROI) کمپین‌ها" value={camp.roi === null ? '—' : `${toPersianDigits(camp.roi)}٪`} sub={`${formatMoney(camp.rev)} درآمد از ${formatMoney(camp.cost)} هزینه`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="سرنخ‌ها بر اساس وضعیت" subtitle="طبق فهرست استاندارد وضعیت سرنخ">
              <HBars rows={statusCount.map((s, i) => ({ label: s.label, segments: [{ value: s.n, color: SERIES[i % SERIES.length] }] }))} />
            </ChartCard>
            <ChartCard title="مشتری از چه راهی آمده؟" subtitle="سهم هر منبع آشنایی">
              <Donut data={sources.slice(0, 8).map((s, i) => ({ label: s.name, value: s.total, color: SERIES[i % SERIES.length] }))} centerLabel="مشتری" size={170} />
            </ChartCard>
            <ChartCard className="xl:col-span-2" title="منابع آشنایی" subtitle="هر منبع چند مشتری آورده و چند نفرشان خرید کرده‌اند" legend={[{ label: 'خریدار شده', color: C.aqua }, { label: 'هنوز نخریده', color: C.blue }]}>
              <HBars
                rows={sources.map((x) => ({ label: `${x.name} (${toPersianDigits(x.rate)}٪ تبدیل)`, segments: [{ value: x.won, color: C.aqua, name: 'خریدار' }, { value: x.total - x.won, color: C.blue, name: 'نخریده' }], note: x.revenue ? `${compact(toDisplay(x.revenue))} ${unitName()}` : undefined }))}
                empty="منبع آشنایی هنوز ثبت نشده است."
              />
            </ChartCard>
            <ChartCard className="xl:col-span-2" title="کمپین‌ها: هزینه و درآمد" subtitle="هزینه و درآمد واقعی هر کمپین" legend={[{ label: 'هزینه', color: C.orange }, { label: 'درآمد', color: C.aqua }]}>
              <HBars
                rows={campaigns.slice(0, 10).map((c) => ({ label: c.name, segments: [{ value: toDisplay(num(c.actualCost)), color: C.orange, name: 'هزینه' }, { value: toDisplay(num(c.actualRevenue)), color: C.aqua, name: 'درآمد' }] }))}
                format={compact}
                empty="هنوز کمپینی ثبت نشده است."
              />
            </ChartCard>
          </div>
        </div>
      )}

      {sec === 'campaigns' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-[#8C6F66]">کمپین‌های بازاریابی با بودجه، هزینه و درآمد واقعی؛ بازگشت سرمایه خودکار حساب می‌شود.</p>
            <button type="button" onClick={() => setEdit(blank(currentUserName))} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer shrink-0"><Plus className="w-3.5 h-3.5" />کمپین تازه</button>
          </div>
          {!loaded ? (
            <div className="text-center text-[11px] font-bold text-gray-400 py-8">در حال بارگذاری…</div>
          ) : campaigns.length === 0 ? (
            <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">هنوز کمپینی ثبت نشده است. با «کمپین تازه» شروع کنید.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {campaigns.map((c) => {
                const st = CAMPAIGN_STATUS[c.status] || CAMPAIGN_STATUS.PLANNING;
                const cost = num(c.actualCost), rev = num(c.actualRevenue);
                const roi = cost > 0 ? Math.round(((rev - cost) / cost) * 100) : null;
                return (
                  <div key={c.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-black text-sm text-[#3A241F] truncate">{c.name}</div>
                        <div className="text-[11px] font-bold text-[#8C6F66]">{c.type}{c.ownerName ? ` · ${c.ownerName}` : ''}</div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-black rounded-full px-2 py-0.5 border ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div className="bg-[#FAF5F1] rounded-xl p-2"><div className="font-bold text-[#8C6F66]">بودجه</div><div className="font-black text-[#3A241F]">{compact(toDisplay(num(c.budget)))}</div></div>
                      <div className="bg-[#FAF5F1] rounded-xl p-2"><div className="font-bold text-[#8C6F66]">هزینهٔ واقعی</div><div className="font-black text-[#3A241F]">{compact(toDisplay(cost))}</div></div>
                      <div className="bg-[#FAF5F1] rounded-xl p-2"><div className="font-bold text-[#8C6F66]">درآمد واقعی</div><div className="font-black text-emerald-700">{compact(toDisplay(rev))}</div></div>
                      <div className="bg-[#FAF5F1] rounded-xl p-2"><div className="font-bold text-[#8C6F66]">ROI</div><div className={`font-black ${roi !== null && roi < 0 ? 'text-rose-700' : 'text-[#3A241F]'}`}>{roi === null ? '—' : `${toPersianDigits(roi)}٪`}</div></div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#8C6F66]">
                      <span>{c.startDate ? formatTaskDate(c.startDate) : '—'}{c.endDate ? ` تا ${formatTaskDate(c.endDate)}` : ''} · {toPersianDigits((c.customerIds || []).length)} مشتری</span>
                      <span className="flex items-center gap-1">
                        <button type="button" aria-label="ویرایش" onClick={() => setEdit(c)} className="p-1.5 rounded-lg hover:bg-[#FAF5F1] cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label="حذف" onClick={() => void remove(c)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sec === 'leads' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setLeadFilter('ALL')} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${leadFilter === 'ALL' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`}>همه ({toPersianDigits(leads.length)})</button>
            {statusCount.map((s) => (
              <button key={s.id} type="button" onClick={() => setLeadFilter(s.id)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${leadFilter === s.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`}>{s.label} ({toPersianDigits(s.n)})</button>
            ))}
          </div>
          {shownLeads.length === 0 ? (
            <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">سرنخی در این وضعیت نیست.</div>
          ) : (
            <div className="bg-white border border-[#EBDBCE] rounded-2xl divide-y divide-[#EBDBCE]/60">
              {shownLeads.map(({ c, st }) => (
                <button key={c.id} type="button" onClick={() => onOpenCustomer(c.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-[#FAF5F1] cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-xs text-[#3A241F] truncate">{c.name}</div>
                    <div className="text-[10.5px] font-bold text-[#8C6F66] truncate">{sourceOf(c)}{c.city ? ` · ${c.city}` : ''}{c.industry ? ` · ${c.industry}` : ''}{c.role ? ` · ${c.role}` : ''}</div>
                  </div>
                  <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200">{LEAD_STATUS.find((s) => s.id === st)?.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sec === 'surveys' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-[#8C6F66]">پرسشنامه با سؤال متنی، طیفی و چندگزینه‌ای؛ متن خوشامد و تشکر دارد و پیش‌نمایش می‌دهد.</p>
            <button type="button" onClick={() => setEdit(blank(currentUserName, 'SURVEY'))} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer shrink-0"><Plus className="w-3.5 h-3.5" />نظرسنجی تازه</button>
          </div>
          {surveys.length === 0 ? (
            <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">هنوز نظرسنجی‌ای ساخته نشده است.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {surveys.map((sv) => {
                const st = SURVEY_STATUS[sv.status] || SURVEY_STATUS.PLANNING!;
                return (
                  <div key={sv.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><div className="font-black text-sm text-[#3A241F] truncate">{sv.name}</div><div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits((sv.questions || []).length)} سؤال · {sv.ownerName || ''}</div></div>
                      <span className={`shrink-0 text-[10px] font-black rounded-full px-2 py-0.5 border ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#8C6F66]">
                      <span>{toPersianDigits(num(sv.responses))} پاسخ{sv.satisfaction ? ` · رضایت ${toPersianDigits(sv.satisfaction)} از ۵` : ''}</span>
                      <span className="flex items-center gap-1">
                        <button type="button" aria-label="ویرایش" onClick={() => setEdit(sv)} className="p-1.5 rounded-lg hover:bg-[#FAF5F1] cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label="حذف" onClick={() => void remove(sv)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {sec === 'messages' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-[#8C6F66]">برنامهٔ ارسال پیام به مخاطبان در سه مرحله: جزئیات، شرایط و وظایف.</p>
            <span className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={onOpenSms} className="px-3 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">پیامک گروهی</button>
              <button type="button" onClick={() => setEdit(blank(currentUserName, 'MESSAGE'))} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer"><Plus className="w-3.5 h-3.5" />کمپین پیام تازه</button>
            </span>
          </div>
          {messageCamps.length === 0 ? (
            <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">هنوز کمپین پیامی ساخته نشده است.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {messageCamps.map((mc) => (
                <div key={mc.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-black text-sm text-[#3A241F] truncate">{mc.name}</div><div className="text-[11px] font-bold text-[#8C6F66]">{mc.module === 'LEADS' ? 'سرنخ‌ها' : 'مخاطبین'} · {FREQ[mc.frequency || 'DAILY']} · {toPersianDigits(num(mc.perDay))} ارسال در هر نوبت · ساعت {toPersianDigits(mc.startHour || '')}</div></div>
                    <span className="shrink-0 text-[10px] font-black rounded-full px-2 py-0.5 border bg-slate-100 text-slate-700 border-slate-200">{(mc.tasks || []).length ? `${toPersianDigits((mc.tasks || []).length)} وظیفه` : 'بدون وظیفه'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#8C6F66]">
                    <span>{mc.ownerName || ''}{mc.skipHolidays ? ' · بدون ارسال در تعطیلات' : ''}</span>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label="ویرایش" onClick={() => setEdit(mc)} className="p-1.5 rounded-lg hover:bg-[#FAF5F1] cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" aria-label="حذف" onClick={() => void remove(mc)} className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sec === 'messengers' && (
        <div className="space-y-4">
          <ChartCard title="پیام‌رسان‌های مشتریان" subtitle="چند مشتری در هر شبکه فعال‌اند و چند بار با آن‌ها در تماس بوده‌ایم">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {NETWORKS.map((n) => {
                const on = real.filter((c) => c.social?.[n.id]?.on).length;
                const touches = real.reduce((sum, c) => sum + num(c.social?.[n.id]?.count), 0);
                return (
                  <div key={n.id} className="bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-3 flex items-center gap-3">
                    <SocialLogo id={n.id} size={26} />
                    <div className="min-w-0"><div className="font-black text-xs text-[#3A241F] truncate">{n.name}</div><div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(on)} مشتری · {toPersianDigits(touches)} تماس</div></div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
          <ChartCard title="صندوق پیام‌های دریافتی" subtitle="پیام مشتریان به ربات شرکت در تلگرام و بله، خودکار اینجا می‌نشیند؛ پاسخ از همین‌جا به همان پیام‌رسان می‌رود">
            <InboxPanel showToast={showToast} onOpenCustomer={onOpenCustomer} />
          </ChartCard>
          <ChartCard title="گزارش ارسال‌ها" subtitle={`هر پیام با تاریخ و ساعت دقیق، پلتفرم و نام ارسال‌کننده${sentAll ? '' : ' (فقط ارسال‌های خودتان)'}`}>
            <div className="flex flex-wrap gap-1.5">
              {['ALL', ...[...new Set(sent.map((x) => x.platform))]].map((x) => (
                <button key={x} type="button" onClick={() => setPf(x)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${pf === x ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`}>{x === 'ALL' ? `همه (${toPersianDigits(sent.length)})` : `${x} (${toPersianDigits(sent.filter((y) => y.platform === x).length)})`}</button>
              ))}
            </div>
            {sent.length === 0 ? (
              <div className="text-center text-[11px] font-bold text-gray-400 py-8 border border-dashed border-[#EBDBCE] rounded-2xl">هنوز پیامی ثبت نشده است؛ از این پس هر پیام در پیام‌رسان‌ها (و پیامک، برای مدیر) اینجا نوشته می‌شود.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[#8C6F66]"><tr><th className="text-right font-black py-1.5">تاریخ و ساعت</th><th className="text-right font-black py-1.5">پلتفرم</th><th className="text-right font-black py-1.5">ارسال‌کننده</th><th className="text-right font-black py-1.5">گیرنده</th><th className="text-right font-black py-1.5">متن</th></tr></thead>
                  <tbody>
                    {sent.filter((x) => pf === 'ALL' || x.platform === pf).slice(0, 300).map((x) => (
                      <tr key={x.key} className="border-t border-[#EBDBCE]/60 align-top">
                        <td className="py-2 font-bold whitespace-nowrap">{formatTaskDate(x.at.slice(0, 10))} · {toPersianDigits(new Date(x.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</td>
                        <td className="py-2"><span className="rounded-full bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 text-[10px] font-black">{x.platform}</span></td>
                        <td className="py-2 font-black text-[#3A241F] whitespace-nowrap">{x.by || '—'}</td>
                        <td className="py-2 text-[#3A241F]" dir="auto">{toPersianDigits(x.to || '—')}</td>
                        <td className="py-2 text-[#8C6F66] max-w-[320px]"><div className="line-clamp-2">{x.text || '—'}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {sec === 'contacts' && (canPhonebook ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1"><Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" /><input className={field + ' pr-10'} placeholder="جستجوی مخاطب: نام، شرکت، شماره…" value={contactQ} onChange={(e) => setContactQ(e.target.value)} /></div>
            <button type="button" onClick={onOpenPhoneBook} className="shrink-0 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer">دفتر تلفن هورمند</button>
          </div>
          <p className="text-[11px] font-bold text-[#8C6F66]">همان مخاطبین دفتر تلفن هورمند، با همان دسترسی‌هایی که مدیر در کنسول تنظیم کرده: هر کس فقط مخاطب‌هایی را می‌بیند که سرور به او داده است و شماره‌های پنهان نشان داده نمی‌شود.</p>
          <div className="bg-white border border-[#EBDBCE] rounded-2xl divide-y divide-[#EBDBCE]/60">
            {allContacts.filter((c) => !contactQ || [c.name, c.company || '', ...(c.phones || [])].some((x) => x.includes(contactQ))).slice(0, 150).map((c) => (
              <button key={c.id} type="button" onClick={() => onOpenCustomer(c.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-[#FAF5F1] cursor-pointer">
                <div className="flex-1 min-w-0"><div className="font-black text-xs text-[#3A241F] truncate">{c.name}</div><div className="text-[10.5px] font-bold text-[#8C6F66] truncate">{c.company || ''}</div></div>
                <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#FAF5F1] text-[#8C6F66] border border-[#EBDBCE]">{CONTACT_TYPES.find((t) => t.id === contactTypeOf(c))?.label || 'مشتری'}</span>
                <div className="text-[11px] font-bold text-[#3A241F] w-32 text-left" dir="ltr">{c.hiddenContact ? '••••' : toPersianDigits(c.phones?.[0] || '')}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-[11px] font-bold text-gray-400 py-10 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">دسترسی شما به «دفتر تلفن» بسته است؛ از مدیر بخواهید در جدول مجوزها باز کند.</div>
      ))}

      {sec === 'standards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ['منابع سرنخ', LEAD_SOURCES], ['وضعیت سرنخ', LEAD_STATUS.map((s) => s.label)], ['امتیاز (رتبه) سرنخ', RATINGS],
            ['نوع کمپین', CAMPAIGN_TYPES], ['وضعیت کمپین', (Object.keys(CAMPAIGN_STATUS) as Campaign['status'][]).map((k) => CAMPAIGN_STATUS[k].label)],
            ['پاسخ مورد انتظار', RESPONSES], ['صنعت', INDUSTRIES],
          ].map(([title, items]) => (
            <section key={title as string} className="bg-white border border-[#EBDBCE] rounded-2xl p-4">
              <h4 className="font-black text-[13px] text-[#3A241F] mb-2">{title as string}</h4>
              <div className="flex flex-wrap gap-1.5">{(items as string[]).map((t) => <span key={t} className="text-[11px] font-bold rounded-full bg-[#FAF5F1] text-[#8C6F66] border border-[#EBDBCE] px-2.5 py-1">{t}</span>)}</div>
            </section>
          ))}
          <section className="bg-white border border-[#EBDBCE] rounded-2xl p-4 md:col-span-2 text-[11px] font-bold text-[#8C6F66] leading-7">
            <h4 className="font-black text-[13px] text-[#3A241F] mb-1">شاخص‌های بازاریابی که خودکار حساب می‌شوند</h4>
            نرخ تبدیل = خریداران ÷ همهٔ مشتریان · بازگشت سرمایه (ROI) = (درآمد واقعی − هزینهٔ واقعی) ÷ هزینهٔ واقعی · هزینهٔ جذب هر مشتری = هزینهٔ کمپین ÷ مشتریان آن · وضعیت سرنخ از آخرین مرحلهٔ فرصت‌های مشتری برداشته می‌شود.
          </section>
        </div>
      )}

      {edit && edit.kind === 'MESSAGE' && <MessageWizard value={edit} customers={real} staff={staff} onSave={(c) => void save(c)} onClose={() => setEdit(null)} />}
      {edit && edit.kind !== 'MESSAGE' && <CampaignForm value={edit} customers={real} staff={staff} onSave={(c) => void save(c)} onClose={() => setEdit(null)} />}
    </div>
  );
};
