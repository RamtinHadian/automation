import React, { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';

/**
 * «سپیدار دارم / ندارم»: the one choice that decides whether this Hoormand works with the Sepidar accounting program.
 * With Sepidar: its menus, the Sepidar part of the customer and the Sepidar way of keeping the warehouse. Without it: none of them, and the warehouse is
 * Hoormand's own (stock typed in here).
 */
export const SepidarSwitchCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [state, setState] = useState<{ connected: boolean; choice: 'yes' | 'no' | 'auto'; seen: boolean } | null>(null);
  useEffect(() => {
    api.sepidarConnected().then(setState).catch(() => {});
  }, []);
  const pick = async (value: 'yes' | 'no') => {
    if (value === 'no' && !(await askConfirm('منوهای سپیدار از همهٔ کاربران برداشته می‌شود و انبار کاملاً داخلی (مستقل) می‌شود. اطلاعاتی که قبلاً از سپیدار آمده پاک نمی‌شود. ادامه می‌دهید؟', { title: 'سپیدار ندارم؟', confirmText: 'بله، سپیدار ندارم' }))) return;
    try {
      await api.sepidarSetSwitch(value);
      showToast(value === 'yes' ? 'منوهای سپیدار فعال شد.' : 'منوهای سپیدار برداشته شد و انبار مستقل شد.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };
  const on = state?.connected;
  return (
    <div className="bg-white rounded-3xl border border-[#EBDBCE] p-5 space-y-3 mb-4" data-sepidar-switch>
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center"><Landmark className="w-5 h-5" /></span>
        <div>
          <h3 className="font-black text-sm text-[#3A241F]">حسابداری سپیدار</h3>
          <p className="text-[11px] font-bold text-[#8C6F66]">این سازمان از نرم‌افزار حسابداری سپیدار استفاده می‌کند؟</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([['yes', 'سپیدار دارم', 'منوی سپیدار، اتصال مشتری و فاکتور، و انبارِ هماهنگ با سپیدار'], ['no', 'سپیدار ندارم', 'بدون منوی سپیدار؛ انبار کاملاً داخلی و موجودی را همین‌جا ثبت می‌کنید']] as const).map(([v, t, hint]) => {
          const active = state ? (v === 'yes') === !!on : false;
          return (
            <button key={v} type="button" onClick={() => void pick(v)} disabled={!state} className={`text-right rounded-2xl border p-3 cursor-pointer ${active ? (v === 'yes' ? 'bg-rose-50 border-rose-300' : 'bg-amber-50 border-amber-300') : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
              <div className="text-sm font-black text-[#3A241F]">{t}{active ? ' ✓' : ''}</div>
              <div className="text-[11px] font-bold text-[#8C6F66] leading-5">{hint}</div>
            </button>
          );
        })}
      </div>
      {state?.choice === 'auto' && <p className="text-[11px] font-bold text-[#8C6F66]">هنوز انتخاب نشده؛ فعلاً {state.seen ? 'چون برنامهٔ سپیدار وصل بوده، فعال است' : 'چون برنامهٔ سپیدار هیچ‌وقت وصل نشده، غیرفعال است'}. با زدن یکی از دو گزینه ثابت می‌شود.</p>}
    </div>
  );
};
