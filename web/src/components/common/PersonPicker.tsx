import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/** One person (colleague or customer) that can be chosen. */
export interface PickerItem {
  id: string;
  name: string;
  /** second line: department, company, phone… */
  sub?: string;
}

interface Common {
  items: PickerItem[];
  title: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

interface Box extends Common {
  selected: string[];
  multiple: boolean;
  onPick: (ids: string[]) => void;
  onClose: () => void;
  /** single choice only: a first row that clears the choice */
  emptyLabel?: string;
}

/** The choosing box: a window in the middle of the page with a search field and the list inside it (never a list under the page). */
const PickerBox: React.FC<Box> = ({ items, title, selected, multiple, onPick, onClose, emptyLabel }) => {
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<string[]>(selected);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => `${i.name} ${i.sub || ''}`.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const choose = (id: string) => {
    if (!multiple) {
      onPick(id ? [id] : []);
      onClose();
      return;
    }
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };

  // React events travel through portals to the windows underneath (that close on a press outside them): stop them here.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} onSubmit={stop} data-person-picker>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col border border-[#EBDBCE] text-right max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer" aria-label="بستن">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام…" className="w-full pr-9 pl-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#6E1B1B]" />
          </div>
        </div>
        <div className="p-3 overflow-y-auto flex-1 space-y-1" data-picker-list>
          {!multiple && emptyLabel !== undefined && (
            <button type="button" onClick={() => choose('')} className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[46px] rounded-xl text-xs font-bold text-right cursor-pointer ${selected.length === 0 ? 'bg-[#F6D9CD]' : 'hover:bg-[#FAF5F1]'}`}>
              <span className="flex-1 text-[#8C6F66]">{emptyLabel}</span>
              {selected.length === 0 && <Check className="w-4 h-4 text-[#6E1B1B]" />}
            </button>
          )}
          {shown.length === 0 ? (
            <div className="py-8 text-center text-xs font-bold text-gray-400">موردی پیدا نشد.</div>
          ) : (
            shown.map((i) => {
              const on = (multiple ? draft : selected).includes(i.id);
              return (
                <button key={i.id} type="button" onClick={() => choose(i.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[46px] rounded-xl text-right cursor-pointer ${on ? 'bg-[#F6D9CD]' : 'hover:bg-[#FAF5F1]'}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{i.name}</span>
                    {i.sub && <span className="block text-[10px] text-[#8C6F66] truncate">{i.sub}</span>}
                  </span>
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-[#6E1B1B] text-white' : multiple ? 'border border-[#EBDBCE]' : ''}`}>
                    {on && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                </button>
              );
            })
          )}
        </div>
        {multiple && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#EBDBCE]">
            <span className="text-[11px] font-bold text-[#8C6F66]">{draft.length.toLocaleString('fa-IR')} نفر انتخاب شده</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDraft([])} className="px-3 py-2 rounded-xl text-[11px] font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">پاک کردن</button>
              <button type="button" onClick={() => { onPick(draft); onClose(); }} className="px-5 py-2 rounded-xl text-[11px] font-black text-white bg-[#6E1B1B] cursor-pointer">تأیید</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

const triggerClass = 'w-full min-h-[40px] flex items-center justify-between gap-2 px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] text-right cursor-pointer hover:border-[#C98B6A] disabled:opacity-50 disabled:cursor-not-allowed';

/** Choose ONE person: a button with the chosen name that opens the choosing box. */
export const PersonPicker: React.FC<Common & { value: string; onChange: (id: string) => void; emptyLabel?: string }> = ({ value, onChange, emptyLabel, ...c }) => {
  const [open, setOpen] = useState(false);
  const cur = c.items.find((i) => i.id === value);
  return (
    <>
      <button type="button" disabled={c.disabled} onClick={() => setOpen(true)} className={`${triggerClass} ${c.className || ''}`} data-person-trigger>
        <span className={`truncate ${cur ? '' : 'text-[#8C6F66] font-medium'}`}>{cur ? cur.name : emptyLabel ?? c.placeholder ?? 'انتخاب کنید…'}</span>
        <ChevronDown className="w-4 h-4 text-[#8C6F66] shrink-0" />
      </button>
      {open && <PickerBox {...c} selected={value ? [value] : []} multiple={false} emptyLabel={emptyLabel} onPick={(ids) => onChange(ids[0] || '')} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Choose SEVERAL people: the button lists the chosen names; the box has a confirm button. */
export const PersonPickerMulti: React.FC<Common & { values: string[]; onChange: (ids: string[]) => void }> = ({ values, onChange, ...c }) => {
  const [open, setOpen] = useState(false);
  const names = values.map((id) => c.items.find((i) => i.id === id)?.name).filter(Boolean) as string[];
  return (
    <>
      <button type="button" disabled={c.disabled} onClick={() => setOpen(true)} className={`${triggerClass} ${c.className || ''}`} data-person-trigger>
        <span className={`truncate ${names.length ? '' : 'text-[#8C6F66] font-medium'}`}>
          {names.length === 0 ? c.placeholder ?? 'انتخاب کنید…' : names.length <= 2 ? names.join('، ') : `${names.slice(0, 2).join('، ')} و ${(names.length - 2).toLocaleString('fa-IR')} نفر دیگر`}
        </span>
        <ChevronDown className="w-4 h-4 text-[#8C6F66] shrink-0" />
      </button>
      {open && <PickerBox {...c} selected={values} multiple onPick={onChange} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Colleagues as picker items. */
export const staffItems = (list: { id: string; fullName: string; departmentName?: string; avatarUrl?: string }[]): PickerItem[] =>
  list.map((u) => ({ id: u.id, name: u.fullName, sub: u.departmentName }));

/** Customers as picker items. */
export const customerItems = (list: { id: string; name: string; company?: string; phones?: string[] }[]): PickerItem[] =>
  list.map((c) => ({ id: c.id, name: c.name, sub: [c.company && c.company !== c.name ? c.company : '', (c.phones || [])[0] || ''].filter(Boolean).join(' · ') }));
