import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock } from 'lucide-react';
import { Column, MenuDef } from '../../lib/permissions';
import { User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

/**
 * One page with EVERY right of one menu for one person, each with its explanation: tick what is allowed.
 * (The table of the section no longer needs one narrow column per right.) Rights that have a window of their own (customers of colleagues,
 * warehouses, invoice details) show a button for it when they are on.
 */
export const MenuRightsDialog: React.FC<{
  user: User;
  menu: MenuDef;
  cols: Column[];
  isOn: (u: User, c: Column) => boolean;
  locked: (u: User, c: Column) => boolean;
  dimmed: (u: User, c: Column) => boolean;
  onToggle: (u: User, c: Column) => void;
  extra: (u: User, c: Column) => React.ReactNode;
  onAll: (u: User, on: boolean) => void;
  onClose: () => void;
}> = ({ user, menu, cols, isOn, locked, dimmed, onToggle, extra, onAll, onClose }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const n = cols.filter((c) => isOn(user, c)).length;
  return createPortal(
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-menu-rights-dialog={menu.id}>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col border border-[#EBDBCE] text-right max-h-[90vh]">
        <div className="px-5 py-3.5 text-white rounded-t-3xl" style={{ background: `linear-gradient(135deg, ${menu.tone}, color-mix(in srgb, ${menu.tone} 70%, #000))` }}>
          <h3 className="font-black text-sm">{menu.title} · {user.fullName}</h3>
          <p className="text-[11px] opacity-90 mt-1">{toPersianDigits(n)} از {toPersianDigits(cols.length)} مجوز داده شده؛ روی هر مورد بزنید تا تیک بخورد یا برداشته شود.</p>
        </div>
        <div className="p-3 overflow-y-auto space-y-1.5" data-menu-rights-list>
          {cols.map((c) => {
            const on = isOn(user, c);
            const lock = locked(user, c);
            const dim = dimmed(user, c);
            return (
              <div key={c.id} className={`rounded-xl border ${on ? 'bg-[#FAF5F1] border-[#E4CFC2]' : 'bg-white border-[#EBDBCE]'} ${dim ? 'opacity-60' : ''}`}>
                <button type="button" disabled={lock} onClick={() => onToggle(user, c)} className="w-full flex items-start gap-3 px-3 py-2.5 text-right cursor-pointer disabled:cursor-default" data-perm={c.id} data-user={user.id} role="checkbox" aria-checked={on}>
                  <span className="w-5 h-5 mt-0.5 rounded-md flex items-center justify-center shrink-0 border-2" style={on ? { background: menu.tone, borderColor: menu.tone } : { background: '#fff', borderColor: '#D9C7BC' }}>
                    {lock ? <Lock className="w-3 h-3 text-white" /> : on && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-[#3A241F]">{c.isMain ? `ورود به منوی «${menu.title}»` : c.label}</span>
                    <span className="block text-[10.5px] font-bold text-[#8C6F66] leading-5">{lock ? 'این مجوز جزو نقش مدیر است.' : dim ? 'خود منو برای این فرد بسته است؛ این مورد دیده نمی‌شود. ' + c.hint : c.hint}</span>
                  </span>
                </button>
                {on && !lock && <div className="px-3 pb-2.5 pr-11">{extra(user, c)}</div>}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <span className="flex gap-1.5">
            <button type="button" onClick={() => onAll(user, true)} className="px-3 py-2 rounded-xl text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer" data-menu-rights-all>همه را بده</button>
            <button type="button" onClick={() => onAll(user, false)} className="px-3 py-2 rounded-xl text-[11px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer" data-menu-rights-none>همه را بگیر</button>
          </span>
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer">بستن</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
