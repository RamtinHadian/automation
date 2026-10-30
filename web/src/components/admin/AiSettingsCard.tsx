import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, CalendarClock, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { SupportSettings } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatDateTime } from '../../lib/taskDates';
import { useAppContext } from '../../context/AppContext';
import { field, label } from '../crm/crmUi';
import { whenText } from './AiSalesReport';
import { MENUS, canSub, isAdminUser } from '../../lib/permissions';

type Schedule = { enabled: boolean; everyDays: number; periodDays: number; lastRunAt?: string; lastError?: string };
const EVERY = [1, 2, 3, 7, 14, 30];
const PERIODS = [7, 14, 30, 60, 90, 180, 365];

/** Everything about the AI service in one place: the connection (togpt), the support assistant, the scheduled sales analysis and where the AI is used. */
export const AiSettingsCard: React.FC = () => {
  const { showToast, staffList, handleUpdateUser } = useAppContext();
  const aiSubs = MENUS.find((m) => m.id === 'ai')?.subs || [];
  const people = staffList.filter((u) => u.isActive !== false && !isAdminUser(u));
  const setAccess = (ids: string[], ids2: string[], on: boolean) => {
    // ids: the people, ids2: the rights; on = allowed
    for (const uid of ids) {
      const u = staffList.find((x) => x.id === uid);
      if (!u) continue;
      const rest = (u.hiddenSub || []).filter((x) => !ids2.includes(x));
      handleUpdateUser(uid, { hiddenSub: on ? rest : [...rest, ...ids2] });
    }
  };
  const [sset, setSset] = useState<SupportSettings | null>(null);
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiStt, setAiStt] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOn, setAiOn] = useState(false);
  const [aiTest, setAiTest] = useState('');
  const [sch, setSch] = useState<Schedule | null>(null);
  const [schBusy, setSchBusy] = useState(false);

  const load = useCallback(() => {
    api.supportGetSettings().then((r) => {
      setSset(r);
      setAiModel(r.aiModel);
      setAiStt(r.aiSttModel);
      setAiPrompt(r.aiPrompt);
      setAiOn(r.aiEnabled);
    }).catch(() => showToast('تنظیمات هوش مصنوعی خوانده نشد.'));
    api.reportAiScheduleGet().then(setSch).catch(() => setSch(null));
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  const save = async (extra: Record<string, unknown> = {}) => {
    try {
      setSset(await api.supportSaveSettings({ aiEnabled: aiOn, aiModel: aiModel.trim(), aiSttModel: aiStt.trim(), aiPrompt, aiKey: aiKey.trim(), ...extra }));
      setAiKey('');
      showToast('تنظیمات هوش مصنوعی ذخیره شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    }
  };
  const saveSch = async (next: Schedule) => {
    setSchBusy(true);
    try {
      setSch(await api.reportAiSchedulePut({ enabled: next.enabled, everyDays: next.everyDays, periodDays: next.periodDays }));
      showToast(next.enabled ? `تحلیل خودکار هر ${toPersianDigits(next.everyDays)} روز روشن است.` : 'تحلیل خودکار خاموش است.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setSchBusy(false);
    }
  };
  const sel = 'p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F]';
  const card = 'bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3';

  return (
    <div className="space-y-5 max-w-5xl" data-ai-settings>
      <div>
        <h3 className="font-black text-lg text-[#3A241F] flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-600" />هوش مصنوعی</h3>
        <p className="text-xs text-[#8C6F66] mt-1">همهٔ تنظیم‌های هوش مصنوعی سامانه اینجاست: اتصال به سرویس، پاسخ هوشمند پشتیبانی و تحلیل خودکار فروش.</p>
      </div>

      <section className={card} data-ai-connection>
        <h4 className="font-black text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-violet-600" />اتصال به سرویس (togpt)</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">یک کلید برای همهٔ بخش‌ها کافی است. کلید API را از حساب togpt خودتان بگیرید. هر بار استفاده از حساب شما هزینه دارد.</p>
        {sset?.aiLastError && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 space-y-1" data-ai-health>
            <div className="font-black text-xs text-rose-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {sset.aiLastError.kind === 'credit' ? 'شارژ پنل togpt.ir شما تمام شده است' : sset.aiLastError.kind === 'key' ? 'togpt.ir کلید API شما را نپذیرفت' : sset.aiLastError.kind === 'connection' ? 'ارتباط با togpt.ir برقرار نیست' : 'سرویس togpt.ir خطا می‌دهد'}
            </div>
            <p className="text-[11px] font-bold text-rose-900 leading-6">{sset.aiLastError.message}</p>
            <p className="text-[10px] font-bold text-rose-700">{formatDateTime(sset.aiLastError.at)} · تا اولین استفادهٔ موفق این پیام می‌ماند.</p>
          </div>
        )}
        <div>
          <label className={label}>نشانی سرویس (ثابت است و تغییر نمی‌کند)</label>
          <input className={`${field} opacity-70`} dir="ltr" readOnly value={sset?.aiBaseUrl || 'https://togpt.ir/api/v1'} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>کلید API {sset?.aiKeySet ? '(ذخیره شده؛ برای تغییر، کلید تازه را بنویسید)' : ''}</label>
            <input className={field} dir="ltr" type="password" autoComplete="new-password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder={sset?.aiKeySet ? '••••••••••' : 'sk-…'} data-ai-key />
          </div>
          <div>
            <label className={label}>نام مدل (نوشتن متن و تحلیل)</label>
            <input className={field} dir="ltr" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="نام مدل را از togpt بگیرید" data-ai-model />
          </div>
        </div>
        <div>
          <label className={label}>نام مدل تبدیل صدا به متن (مکالمه‌های ضبط‌شده و ویس جلسه)</label>
          <input className={field} dir="ltr" value={aiStt} onChange={(e) => setAiStt(e.target.value)} placeholder="google/gemini-3.7-flash" />
        </div>
        {aiTest && <div className="text-[11px] font-bold bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 leading-6">{aiTest}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} className="px-6 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer" data-ai-save>ذخیرهٔ تنظیمات</button>
          <button
            type="button"
            disabled={!sset?.aiKeySet}
            onClick={async () => {
              setAiTest('در حال آزمایش…');
              try {
                setAiTest('پاسخ آزمایشی: ' + (await api.supportAiTest()).reply);
              } catch (e) {
                setAiTest(e instanceof Error ? e.message : 'آزمایش انجام نشد.');
              }
              load();
            }}
            className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-white border border-violet-200 text-violet-800 disabled:opacity-50 text-xs font-black cursor-pointer"
          >
            آزمایش اتصال
          </button>
          {sset?.aiKeySet && <button type="button" onClick={async () => { await save({ aiEnabled: false, aiKey: '', clearKey: true }); setAiOn(false); }} className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl text-rose-700 text-xs font-black cursor-pointer">پاک‌کردن کلید</button>}
        </div>
      </section>

      <section className={card} data-ai-assistant>
        <h4 className="font-black text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-teal-600" />پاسخ هوشمند پشتیبانی</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">اگر روشن باشد، دستیار به پیام‌های مشتری در صفحهٔ مشتریان یک جواب اولیه می‌دهد. جواب او «پاسخ هوشمند» نام دارد، وضعیت و مهلت درخواست را عوض نمی‌کند و همکار شما همچنان درخواست را می‌بیند.</p>
        <label className="flex items-center gap-2 text-xs font-black cursor-pointer min-h-[36px]"><input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} />پاسخ هوشمند روشن باشد</label>
        <div>
          <label className={label}>اطلاعات شرکت و محصولات برای دستیار (اختیاری)</label>
          <textarea className={`${field} min-h-[96px] leading-6`} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="مثلاً: ساعت کاری، شمارهٔ تماس، پاسخ سؤال‌های پرتکرار، روش نصب و عیب‌یابی محصولات…" />
        </div>
        <button type="button" onClick={() => save()} className="px-6 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer">ذخیرهٔ تنظیمات</button>
      </section>

      <section className={card} data-ai-schedule>
        <h4 className="font-black text-sm flex items-center gap-2"><CalendarClock className="w-4 h-4 text-violet-700" />تحلیل خودکار فروش</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">اگر روشن باشد، خود سرور هر چند روز یک بار اعداد فروش را از سامانه می‌خواند، هوش مصنوعی را صدا می‌زند و گزارش را نگه می‌دارد؛ مدیران سامانه اعلان می‌گیرند و گزارش در «گزارش‌های هوشمند قبلی» (گزارشات آماری مدیریتی) می‌ماند. هر بار از حساب togpt شما هزینه دارد.</p>
        {sch ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-black cursor-pointer"><input type="checkbox" checked={sch.enabled} disabled={schBusy} onChange={(e) => saveSch({ ...sch, enabled: e.target.checked })} data-ai-schedule-on />روشن باشد</label>
              <label className="flex items-center gap-1.5 text-xs font-bold">هر
                <select className={sel} value={sch.everyDays} disabled={schBusy} onChange={(e) => saveSch({ ...sch, everyDays: Number(e.target.value) })}>{(EVERY.includes(sch.everyDays) ? EVERY : [...EVERY, sch.everyDays].sort((x, y) => x - y)).map((n) => <option key={n} value={n}>{toPersianDigits(n)}</option>)}</select>
                روز</label>
              <label className="flex items-center gap-1.5 text-xs font-bold">داده‌های
                <select className={sel} value={sch.periodDays} disabled={schBusy} onChange={(e) => saveSch({ ...sch, periodDays: Number(e.target.value) })}>{(PERIODS.includes(sch.periodDays) ? PERIODS : [...PERIODS, sch.periodDays].sort((x, y) => x - y)).map((n) => <option key={n} value={n}>{toPersianDigits(n)}</option>)}</select>
                روز اخیر</label>
            </div>
            <div className="text-[10.5px] font-bold text-[#8C6F66] leading-6">
              {sch.lastRunAt ? `آخرین اجرای خودکار: ${whenText(sch.lastRunAt).date} ساعت ${whenText(sch.lastRunAt).time}` : 'هنوز اجرای خودکاری نشده است.'}
              {sch.enabled && sch.lastRunAt ? ` · بعدی حدود ${whenText(new Date(new Date(sch.lastRunAt).getTime() + sch.everyDays * 86400000).toISOString()).date}` : ''}
            </div>
            {sch.lastError && <div className="text-[11px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 leading-6">آخرین اجرای خودکار انجام نشد: {sch.lastError}</div>}
          </>
        ) : <div className="text-[11px] font-bold text-[#8C6F66]">تنظیم تحلیل خودکار خوانده نشد.</div>}
      </section>

      <section className={card} data-ai-access>
        <h4 className="font-black text-sm">چه کسانی از هوش مصنوعی استفاده کنند</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">تیک یعنی آن همکار این بخش را می‌بیند و می‌تواند از آن استفاده کند. بدون تیک، دکمه‌اش برای او نمایش داده نمی‌شود و سرور هم درخواستش را قبول نمی‌کند. مدیران سیستم همیشه دسترسی دارند. همین تیک‌ها در «جدول مجوزها» (گروه «هوش مصنوعی») هم هست.</p>
        {people.length === 0 ? <div className="text-[11px] font-bold text-[#8C6F66]">همکاری برای تنظیم پیدا نشد.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#8C6F66] text-[11px]">
                  <th className="text-right font-black p-2">همکار</th>
                  {aiSubs.map((c) => (
                    <th key={c.id} className="font-black p-2 text-center" title={c.hint}>
                      <div>{c.label}</div>
                      <button type="button" onClick={() => setAccess(people.map((u) => u.id), [c.id], !people.every((u) => canSub(u, c.id)))} className="text-[10px] text-violet-700 font-black cursor-pointer" data-ai-col-all={c.id}>{people.every((u) => canSub(u, c.id)) ? 'برداشتن همه' : 'همه'}</button>
                    </th>
                  ))}
                  <th className="font-black p-2 text-center">همه</th>
                </tr>
              </thead>
              <tbody>
                {people.map((u) => (
                  <tr key={u.id} className="border-t border-[#F3E8DF]" data-ai-person={u.id}>
                    <td className="p-2 font-black text-[#3A241F]">{u.fullName}<span className="block text-[10px] font-bold text-[#8C6F66]">{u.departmentName}</span></td>
                    {aiSubs.map((c) => (
                      <td key={c.id} className="p-2 text-center"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={canSub(u, c.id)} onChange={(e) => setAccess([u.id], [c.id], e.target.checked)} aria-label={`${c.label} برای ${u.fullName}`} data-ai-right={c.id} /></td>
                    ))}
                    <td className="p-2 text-center"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={aiSubs.every((c) => canSub(u, c.id))} onChange={(e) => setAccess([u.id], aiSubs.map((c) => c.id), e.target.checked)} aria-label={`همهٔ بخش‌ها برای ${u.fullName}`} data-ai-right-all /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card} data-ai-where>
        <h4 className="font-black text-sm">هوش مصنوعی کجاها کار می‌کند</h4>
        <ul className="text-[11px] font-bold text-[#8C6F66] leading-7 list-disc pr-5">
          <li>نامه‌نگاری: دکمهٔ «هوش مصنوعی» در ویرایشگر نامه، متن کامل می‌نویسد.</li>
          <li>صورتجلسه: نوشتن صورتجلسه از یادداشت یا ویس، و خلاصهٔ شرح مذاکرات.</li>
          <li>تماس‌ها: تبدیل مکالمهٔ ضبط‌شده به متن، با تأیید کاربر.</li>
          <li>گزارشات آماری مدیریتی: گزارش هوشمند فروش و تحلیل گزارش‌های روزانه.</li>
          <li>مشتریان: تحلیل سطح مشتری (در ۵ سطح).</li>
          <li>پشتیبانی: پاسخ هوشمند به پیام مشتری (بالا).</li>
        </ul>
        <p className="text-[10.5px] font-bold text-[#8C6F66] leading-6">اینکه چه کسی هر بخش را می‌بیند در «جدول مجوزها» تنظیم می‌شود.</p>
      </section>
    </div>
  );
};
