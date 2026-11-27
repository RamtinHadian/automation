import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { SystemSettings, User } from '../../types';
import { canIssueInvoice } from '../../lib/invoice';
import { PersonPicker, staffItems } from '../common/PersonPicker';

/**
 * «تأییدکنندگان صدور فاکتور»: for every person who may issue invoices the administrator chooses who approves them (any one is enough). A person without
 * approvers cannot issue at all (the server refuses); the administrator, and a person who is in his own list, issue directly.
 */
export const InvoiceApproversCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void; staff: User[] }> = ({ settings, setSettings, staff }) => {
  const active = staff.filter((u) => u.isActive !== false);
  const issuers = active.filter((u) => u.role !== 'SUPER_ADMIN' && canIssueInvoice(u));
  const map = settings.invoiceApprovers || {};
  const set = (id: string, ids: string[]) => setSettings({ ...settings, invoiceApprovers: { ...map, [id]: ids } });
  const faDigit = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-3" data-invoice-approvers>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><ShieldCheck className="w-4 h-4 text-[#D34A32]" />تأییدکنندگان صدور فاکتور</div>
      <p className="text-[11px] font-medium text-[#8C6F66] leading-6">
        برای هر کسی که فاکتور صادر می‌کند، مرحله‌به‌مرحله تأییدکننده تعریف کنید: اول نفر مرحلهٔ ۱ تأیید می‌کند، بعد فاکتور خودکار برای نفر بعدی می‌رود و همین‌طور تا آخر؛ بعد از تأیید نفر آخر فاکتور شماره می‌گیرد و به سپیدار می‌رود.
        کسی که تأییدکننده‌اش تعریف نشده فاکتور صادر نمی‌کند. مدیر کل سیستم بدون تأیید صادر می‌کند. اگر نام خود شخص در فهرست خودش باشد، مرحلهٔ خودش رد می‌شود. با «ذخیره و اعمال کلیه تغییرات» اعمال می‌شود.
      </p>
      {issuers.length === 0 ? (
        <div className="text-[11px] font-bold text-[#8C6F66]">کسی با حق «صدور فاکتور» نیست.</div>
      ) : (
        <div className="space-y-2">
          {issuers.map((u) => {
            const ids = map[u.id] || [];
            const move = (i: number, d: number) => { const l = ids.slice(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; set(u.id, l); };
            const used = ids.filter(Boolean);
            return (
              <div key={u.id} className={`rounded-xl border px-3 py-2.5 space-y-2 ${used.length ? 'border-[#EBDBCE]' : 'border-amber-300 bg-amber-50/50'}`} data-approver-row>
                <div className="font-black text-[12px] text-[#3A241F]">{u.fullName}{used.length === 0 && <span className="mr-2 text-[10px] text-amber-800">تأییدکننده تعریف نشده؛ فاکتور نمی‌تواند صادر کند</span>}</div>
                {ids.map((id, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="w-16 shrink-0 font-black text-[#6E1B1B]">مرحلهٔ {faDigit(i + 1)}</span>
                    <PersonPicker title={`تأییدکنندهٔ مرحلهٔ ${i + 1} برای ${u.fullName}`} items={staffItems(active.filter((x) => x.id === id || !ids.includes(x.id)))} value={id} onChange={(v) => set(u.id, ids.map((x, k) => (k === i ? v : x)))} emptyLabel="یک نفر را انتخاب کنید" className="min-w-[220px]" />
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="px-2 py-1 rounded-lg border border-[#EBDBCE] bg-white font-black disabled:opacity-30 cursor-pointer" title="مرحلهٔ زودتر">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === ids.length - 1} className="px-2 py-1 rounded-lg border border-[#EBDBCE] bg-white font-black disabled:opacity-30 cursor-pointer" title="مرحلهٔ دیرتر">↓</button>
                    <button type="button" onClick={() => set(u.id, ids.filter((_, k) => k !== i))} className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 font-black cursor-pointer">حذف</button>
                  </div>
                ))}
                <button type="button" onClick={() => set(u.id, [...ids, ''])} disabled={ids.some((x) => !x)} className="px-3 py-1.5 rounded-xl border border-[#6E1B1B]/30 text-[#6E1B1B] font-black bg-white hover:bg-[#FAF5F1] disabled:opacity-40 cursor-pointer" data-add-invoice-step>+ افزودن مرحله</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
