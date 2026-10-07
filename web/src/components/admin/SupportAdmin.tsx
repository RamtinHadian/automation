import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Copy, Headset, MessageCircle, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { SupportPlan, SupportSettings } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { PlanCard, PlanForm } from '../support/SupportForms';
import { field, label } from '../crm/crmUi';

/** Console section «پشتیبانی»: the plans the company sells, the customers' page and the optional AI answers. */
export const SupportAdmin: React.FC<{ toast: (m: string) => void }> = ({ toast }) => {
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sset, setSset] = useState<SupportSettings | null>(null);
  const [editing, setEditing] = useState<{ p: SupportPlan | null } | null>(null);
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiOn, setAiOn] = useState(false);
  const [portalOn, setPortalOn] = useState(true);
  const [aiTest, setAiTest] = useState('');
  const portalUrl = `${window.location.origin}/support`;

  const loadPlans = useCallback(() => {
    api.supportList().then((r) => {
      setPlans(r.plans);
      const c: Record<string, number> = {};
      const today = new Date().toISOString().slice(0, 10);
      for (const s of r.subs) if (s.status === 'ACTIVE' && s.endDate >= today) c[s.planId] = (c[s.planId] || 0) + 1;
      setCounts(c);
    }).catch(() => toast('پلن‌ها خوانده نشد.'));
  }, [toast]);
  useEffect(() => {
    loadPlans();
    api.supportGetSettings().then((r) => {
      setSset(r);
      setAiModel(r.aiModel);
      setAiPrompt(r.aiPrompt);
      setAiOn(r.aiEnabled);
      setPortalOn(r.portalEnabled);
    }).catch(() => toast('تنظیمات پشتیبانی خوانده نشد.'));
  }, [loadPlans, toast]);

  const copy = (t: string) => {
    try {
      navigator.clipboard.writeText(t).then(() => toast('کپی شد.'), () => toast('کپی نشد.'));
    } catch {
      toast('کپی نشد.');
    }
  };
  const save = async (extra: Record<string, unknown> = {}) => {
    try {
      setSset(await api.supportSaveSettings({ portalEnabled: portalOn, aiEnabled: aiOn, aiModel: aiModel.trim(), aiPrompt, aiKey: aiKey.trim(), ...extra }));
      setAiKey('');
      toast('تنظیمات ذخیره شد.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ذخیره نشد.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl" data-support-admin>
      <div>
        <h3 className="font-black text-lg text-[#3A241F] flex items-center gap-2"><Headset className="w-5 h-5 text-teal-600" />تنظیمات پشتیبانی</h3>
        <p className="text-xs text-[#8C6F66] mt-1">پلن‌ها، صفحهٔ مشتریان و پاسخ هوشمند. کارکنان از منوی «پشتیبانی» فقط از این‌ها استفاده می‌کنند.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-black text-sm text-[#3A241F]">پلن‌های پشتیبانی</h4>
          <button type="button" onClick={() => setEditing({ p: null })} className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer"><Plus className="w-4 h-4" />پلن تازه</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              footer={
                <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-black">
                  <span className="text-[#8C6F66]">{toPersianDigits(counts[p.id] || 0)} مشترک فعال</span>
                  <button type="button" onClick={() => setEditing({ p })} className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] cursor-pointer">ویرایش</button>
                </div>
              }
            />
          ))}
        </div>
        <p className="text-[11px] font-bold text-[#8C6F66]">پلن پاک نمی‌شود؛ برای کنارگذاشتن، در ویرایش «پلن فعال است» را بردارید تا اشتراک تازه با آن ساخته نشود.</p>
      </section>

      <section className="bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3" data-support-settings>
        <h4 className="font-black text-sm flex items-center gap-2"><MessageCircle className="w-4 h-4 text-teal-600" />صفحهٔ مشتریان</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">مشتری‌ای که پلن فعال دارد با «شمارهٔ موبایل ثبت‌شده در پروندهٔ خودش» و «چهار رقم آخر کد ملی» (برای شرکت‌ها، شناسهٔ ملی) وارد این صفحه می‌شود، مشکلش را می‌فرستد و درخواست در منوی «پشتیبانی» می‌نشیند. کد ملی را هنگام ثبت مشتری تازه در پرونده‌اش وارد کنید؛ مشتری بدون آن نمی‌تواند وارد شود.</p>
        <div className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
          <span className="flex-1 min-w-0 text-xs font-black text-[#3A241F] truncate" dir="ltr">{portalUrl}</span>
          <button type="button" onClick={() => copy(portalUrl)} className="shrink-0 flex items-center gap-1 text-[11px] font-black text-teal-700 cursor-pointer"><Copy className="w-3.5 h-3.5" />کپی</button>
        </div>
        <label className="flex items-center gap-2 text-xs font-black cursor-pointer min-h-[36px]"><input type="checkbox" checked={portalOn} onChange={(e) => setPortalOn(e.target.checked)} />ورود مشتریان باز باشد</label>
      </section>

      <section className="bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3">
        <h4 className="font-black text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-violet-600" />پاسخ هوشمند (togpt)</h4>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">اگر روشن باشد، دستیار هوش مصنوعی به پیام‌های مشتری در صفحهٔ مشتریان یک جواب اولیه می‌دهد. جواب او «پاسخ هوشمند» نام دارد، وضعیت و مهلت درخواست را عوض نمی‌کند و همکار شما همچنان درخواست را می‌بیند. کلید API را از حساب togpt خودتان بگیرید.</p>
        <div>
          <label className={label}>نشانی سرویس (ثابت است و تغییر نمی‌کند)</label>
          <input className={`${field} opacity-70`} dir="ltr" readOnly value={sset?.aiBaseUrl || 'https://togpt.ir/api/v1'} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>کلید API {sset?.aiKeySet ? '(ذخیره شده؛ برای تغییر، کلید تازه را بنویسید)' : ''}</label>
            <input className={field} dir="ltr" type="password" autoComplete="new-password" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder={sset?.aiKeySet ? '••••••••••' : 'sk-…'} />
          </div>
          <div>
            <label className={label}>نام مدل</label>
            <input className={field} dir="ltr" value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder="نام مدل را از togpt بگیرید" />
          </div>
        </div>
        <div>
          <label className={label}>اطلاعات شرکت و محصولات برای دستیار (اختیاری)</label>
          <textarea className={`${field} min-h-[96px] leading-6`} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="مثلاً: ساعت کاری، شمارهٔ تماس، پاسخ سؤال‌های پرتکرار، روش نصب و عیب‌یابی محصولات…" />
        </div>
        <label className="flex items-center gap-2 text-xs font-black cursor-pointer min-h-[36px]"><input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} />پاسخ هوشمند روشن باشد</label>
        {aiTest && <div className="text-[11px] font-bold bg-violet-50 border border-violet-200 rounded-xl px-3 py-2 leading-6">{aiTest}</div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} className="px-6 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer">ذخیرهٔ تنظیمات</button>
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
            }}
            className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-white border border-violet-200 text-violet-800 disabled:opacity-50 text-xs font-black cursor-pointer"
          >
            آزمایش اتصال
          </button>
          {sset?.aiKeySet && <button type="button" onClick={async () => { await save({ aiEnabled: false, aiKey: '', clearKey: true }); setAiOn(false); }} className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl text-rose-700 text-xs font-black cursor-pointer">پاک‌کردن کلید</button>}
        </div>
      </section>

      {editing && <PlanForm initial={editing.p} onClose={() => setEditing(null)} onError={toast} onSaved={() => { setEditing(null); toast('پلن ذخیره شد.'); loadPlans(); }} />}
    </div>
  );
};
