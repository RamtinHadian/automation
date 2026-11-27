import React from 'react';
import { FileText } from 'lucide-react';
import { SystemSettings } from '../../types';

/** «پیش‌فاکتور فعال باشد»: switched off, nobody can make a new proforma (the buttons go away and the server refuses); the ones already made, and the invoices, stay. */
export const ProformaSwitchCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void }> = ({ settings, setSettings }) => {
  const on = settings.proformaEnabled !== false;
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-2" data-proforma-switch>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><FileText className="w-4 h-4 text-[#D34A32]" />فعال یا غیرفعال بودن پیش‌فاکتور</div>
      <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer ${on ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
        <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-[#6E1B1B] cursor-pointer" checked={on} onChange={(e) => setSettings({ ...settings, proformaEnabled: e.target.checked })} data-proforma-enabled />
        <span className="text-[12px] font-black text-[#3A241F]">
          {on ? 'پیش‌فاکتور فعال است' : 'پیش‌فاکتور غیرفعال است'}
          <span className="block text-[10.5px] font-medium text-[#8C6F66] leading-5">
            با خاموش کردن، دکمه‌های «صدور پیش‌فاکتور» و بخش پیش‌فاکتور در پروندهٔ فرصت دیده نمی‌شوند و سرور هم پیش‌فاکتور تازه را نمی‌پذیرد. پیش‌فاکتورهای ساخته‌شده و فاکتورها می‌مانند. «صدور فاکتور» (مستقل از پیش‌فاکتور) همچنان کار می‌کند و منوی «پیش‌فاکتورها» به «فاکتورها» تبدیل می‌شود. با «ذخیره و اعمال کلیه تغییرات» اعمال می‌شود.
          </span>
        </span>
      </label>
    </div>
  );
};
