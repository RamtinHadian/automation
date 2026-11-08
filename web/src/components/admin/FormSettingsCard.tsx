import React, { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { CustomerForm } from '../crm/CustomerForm';
import { DealForm } from '../crm/CrmView';
import { Customer, Deal } from '../../types';
import { TUNABLE_FORMS } from '../../lib/formConfig';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';

const blankDeal = (): Deal => ({
  id: 'design-sample-deal', title: '', customerId: '', customerName: '', amount: 0, stage: 'NEW', ownerId: '', ownerName: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

const blankCustomer = (): Customer => ({
  id: 'design-sample', name: '', phones: [], status: 'LEAD', tags: [], ownerId: '', ownerName: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

/**
 * Tuning of the forms: the administrator opens a form (here «مشتری جدید»), and every field shows a small bar with three choices: whether
 * it exists, whether it is required, and where Enter goes from it. Each tick is saved on the spot; users see it from their next opening.
 */
export const FormSettingsCard: React.FC = () => {
  const { settings, setSettings, staffList, showToast } = useAppContext();
  const [open, setOpen] = useState<string | null>(null);
  const cfgOf = (id: string) => (settings.formConfig || {})[id] || {};

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('hoormand-form-design', { detail: open }));
    return () => { window.dispatchEvent(new CustomEvent('hoormand-form-design', { detail: null })); };
  }, [open]);

  return (
    <div className="space-y-4" data-form-settings>
      <section className="bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><ListChecks className="w-4 h-4 text-[#6E1B1B]" />فرم‌ها و کلید Enter</h3>
        <p className="text-[12px] font-bold text-[#8C6F66] leading-7">فرم را باز کنید؛ زیر هر فیلد سه گزینه می‌آید: <b>نمایش</b> (این فیلد در فرم باشد یا نه)، <b>اجباری</b> (بدون پر کردنش ذخیره نشود) و <b>Enter برود به</b> (بعد از این فیلد Enter به کدام فیلد برود). هر تیک همان لحظه ذخیره می‌شود و کاربران از دفعهٔ بعد که فرم را باز کنند اثرش را می‌بینند. فیلدهای خاموش‌شده فقط پنهان می‌شوند و اطلاعات ثبت‌شده‌شان پاک نمی‌شود.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TUNABLE_FORMS.map((f) => {
            const c = cfgOf(f.id);
            return (
              <div key={f.id} className="border border-[#EBDBCE] rounded-2xl p-4 space-y-2 bg-[#FAF5F1]/60">
                <div className="font-black text-xs text-[#3A241F]">{f.title}</div>
                <div className="text-[11px] font-bold text-[#8C6F66]">{f.hint}</div>
                <div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits((c.hidden || []).length)} فیلد پنهان · {toPersianDigits((c.required || []).length)} اجباری · {toPersianDigits(Object.keys(c.enterTo || {}).length)} مسیر Enter</div>
                <label className="flex items-center gap-2 text-[11px] font-black text-[#3A241F] cursor-pointer">
                  <input type="checkbox" className="accent-violet-600" checked={!!c.enterNext} onChange={(e) => setSettings((prev) => ({ ...prev, formConfig: { ...(prev.formConfig || {}), [f.id]: { ...((prev.formConfig || {})[f.id] || {}), enterNext: e.target.checked } } }))} />
                  Enter در هر فیلد یک‌خطی، به فیلد بعدی برود (به‌جای ذخیرهٔ فرم)
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setOpen(f.id)} className="px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:opacity-90 cursor-pointer">باز کردن فرم برای تنظیم</button>
                  <button type="button" onClick={async () => {
                    if (!(await askConfirm('همهٔ تنظیم‌های این فرم (فیلدهای پنهان، اجباری‌ها و مسیر Enter) پاک شود و فرم به حالت اول برگردد؟', { title: 'بازگشت به حالت اول؟', confirmText: 'بله، پاک شود' }))) return;
                    setSettings((prev) => { const fc = { ...(prev.formConfig || {}) }; delete fc[f.id]; return { ...prev, formConfig: fc }; });
                  }} className="px-4 py-2 rounded-xl text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer">بازگشت به حالت اول</button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] font-bold text-[#8C6F66]">فعلاً فرم مشتری و فرم فرصت فروش قابل تنظیم‌اند. فرم‌های دیگر (پیش‌فاکتور، نامه…) را هر کدام بخواهید، به همین روش اضافه می‌کنم.</p>
      </section>
      {open === 'deal' && (
        <DealForm initial={blankDeal()} isNew customers={[]} staff={staffList} canDelete={false} onClose={() => setOpen(null)} onSave={() => showToast('این فرم نمونه است؛ فقط تیک‌ها ذخیره می‌شوند.')} onProforma={() => undefined} onDelete={() => undefined} onCreateCustomer={() => undefined} />
      )}
      {open === 'customer' && (
        <CustomerForm initial={blankCustomer()} isNew staff={staffList} customers={[]} canDelete={false} onClose={() => setOpen(null)} onSave={() => showToast('این فرم نمونه است؛ فقط تیک‌ها ذخیره می‌شوند.')} onDelete={() => undefined} />
      )}
    </div>
  );
};
