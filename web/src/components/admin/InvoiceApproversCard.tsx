import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { SystemSettings, User } from '../../types';
import { canIssueInvoice } from '../../lib/invoice';
import { PersonPickerMulti, staffItems } from '../common/PersonPicker';

/**
 * «تأییدکنندگان صدور فاکتور»: for every person who may issue invoices the administrator chooses who approves them (any one is enough). A person without
 * approvers cannot issue at all (the server refuses); the administrator, and a person who is in his own list, issue directly.
 */
export const InvoiceApproversCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void; staff: User[] }> = ({ settings, setSettings, staff }) => {
  const active = staff.filter((u) => u.isActive !== false);
  const issuers = active.filter((u) => u.role !== 'SUPER_ADMIN' && canIssueInvoice(u));
  const map = settings.invoiceApprovers || {};
  const set = (id: string, ids: string[]) => setSettings({ ...settings, invoiceApprovers: { ...map, [id]: ids } });
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-3" data-invoice-approvers>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><ShieldCheck className="w-4 h-4 text-[#D34A32]" />تأییدکنندگان صدور فاکتور</div>
      <p className="text-[11px] font-medium text-[#8C6F66] leading-6">
        برای هر کسی که فاکتور صادر می‌کند تأییدکننده تعریف کنید. فاکتور او شماره نمی‌گیرد و به سپیدار نمی‌رود تا یکی از تأییدکننده‌ها تأییدش کند. کسی که تأییدکننده‌اش تعریف نشده فاکتور صادر نمی‌کند.
        مدیر کل سیستم بدون تأیید صادر می‌کند. اگر نام خود شخص را هم در فهرست خودش بگذارید، فاکتورش بدون انتظار صادر می‌شود. با «ذخیره و اعمال کلیه تغییرات» اعمال می‌شود.
      </p>
      {issuers.length === 0 ? (
        <div className="text-[11px] font-bold text-[#8C6F66]">کسی با حق «صدور فاکتور» نیست.</div>
      ) : (
        <div className="space-y-2">
          {issuers.map((u) => {
            const ids = (map[u.id] || []).filter(Boolean);
            return (
              <div key={u.id} className={`rounded-xl border px-3 py-2.5 grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2 items-center ${ids.length ? 'border-[#EBDBCE]' : 'border-amber-300 bg-amber-50/50'}`} data-approver-row>
                <div className="font-black text-[12px] text-[#3A241F]">{u.fullName}{ids.length === 0 && <span className="block text-[10px] text-amber-800">تأییدکننده تعریف نشده؛ فاکتور نمی‌تواند صادر کند</span>}</div>
                <PersonPickerMulti items={staffItems(active)} title={`تأییدکنندگان فاکتور ${u.fullName}`} values={ids} onChange={(v) => set(u.id, v)} placeholder="انتخاب تأییدکننده‌ها…" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
