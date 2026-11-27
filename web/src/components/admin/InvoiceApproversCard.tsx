import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { SystemSettings, User } from '../../types';
import { PersonPicker, staffItems } from '../common/PersonPicker';

const faDigit = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * «گردش تأیید فاکتورها»: ONE flow for every invoice. Whoever issues an invoice (except the administrator) sends it through these steps, one person after the
 * other; after the last approval it gets its number and goes to Sepidar. Without a defined flow nobody but the administrator can issue.
 */
export const InvoiceApproversCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void; staff: User[] }> = ({ settings, setSettings, staff }) => {
  const active = staff.filter((u) => u.isActive !== false);
  const ids = settings.invoiceApprovalChain || [];
  const set = (l: string[]) => setSettings({ ...settings, invoiceApprovalChain: l });
  const move = (i: number, d: number) => { const l = ids.slice(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(l); };
  const used = ids.filter(Boolean);
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-3" data-invoice-approvers>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><ShieldCheck className="w-4 h-4 text-[#D34A32]" />گردش تأیید فاکتورها</div>
      <p className="text-[11px] font-medium text-[#8C6F66] leading-6">
        یک گردش برای همهٔ فاکتورها: فاکتورِ هر کسی که صادر می‌کند اول برای مرحلهٔ ۱ می‌رود، بعد از تأییدش برای نفر بعدی و همین‌طور تا آخر؛ بعد از تأیید نفر آخر شماره می‌گیرد و به سپیدار می‌رود.
        مدیر کل سیستم بدون تأیید صادر می‌کند و اگر خود صادرکننده در گردش باشد، مرحلهٔ خودش رد می‌شود. تا گردش تعریف نشود کسی غیر از مدیر کل فاکتور صادر نمی‌کند. با «ذخیره و اعمال کلیه تغییرات» اعمال می‌شود.
      </p>
      {used.length === 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-900">گردش تعریف نشده؛ فقط مدیر کل سیستم می‌تواند فاکتور صادر کند.</div>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {ids.map((id, i) => (
          <div key={i} className="flex items-center gap-2 rounded-xl border border-[#EBDBCE] bg-[#FDFAF7] px-3 py-2" data-approval-step>
            <span className="shrink-0 w-14 font-black text-[#6E1B1B]">مرحلهٔ {faDigit(i + 1)}</span>
            <div className="flex-1 min-w-0">
              <PersonPicker title={`تأییدکنندهٔ مرحلهٔ ${i + 1}`} items={staffItems(active.filter((x) => x.id === id || !ids.includes(x.id)))} value={id} onChange={(v) => set(ids.map((x, k) => (k === i ? v : x)))} emptyLabel="یک نفر را انتخاب کنید" />
            </div>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="shrink-0 px-2 py-1 rounded-lg border border-[#EBDBCE] bg-white font-black disabled:opacity-30 cursor-pointer" title="مرحلهٔ زودتر">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} className="shrink-0 px-2 py-1 rounded-lg border border-[#EBDBCE] bg-white font-black disabled:opacity-30 cursor-pointer" title="مرحلهٔ دیرتر">↓</button>
            <button type="button" onClick={() => set(ids.filter((_, k) => k !== i))} className="shrink-0 px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 font-black cursor-pointer">حذف</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => set([...ids, ''])} disabled={ids.some((x) => !x)} className="px-3 py-1.5 rounded-xl border border-[#6E1B1B]/30 text-[#6E1B1B] font-black bg-white hover:bg-[#FAF5F1] disabled:opacity-40 cursor-pointer" data-add-invoice-step>+ افزودن مرحله</button>
    </div>
  );
};
