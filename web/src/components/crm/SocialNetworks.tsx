import React, { useState } from 'react';
import { Minus, Plus, Share2, X } from 'lucide-react';
import { Customer, SocialEntry } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { Modal } from './crmUi';

export interface NetworkDef { id: string; name: string; hint: string; iran?: boolean }

/** the networks a customer can be reached on: three from Iran first, then the others */
export const NETWORKS: NetworkDef[] = [
  { id: 'bale', name: 'بله', hint: 'شمارهٔ موبایل یا شناسه', iran: true },
  { id: 'eitaa', name: 'ایتا', hint: 'شمارهٔ موبایل یا شناسه', iran: true },
  { id: 'rubika', name: 'روبیکا', hint: 'شمارهٔ موبایل یا شناسه', iran: true },
  { id: 'instagram', name: 'اینستاگرام', hint: 'نام کاربری، بدون @' },
  { id: 'whatsapp', name: 'واتس‌اپ', hint: 'شمارهٔ موبایل' },
  { id: 'whatsappBusiness', name: 'واتس‌اپ بیزینس', hint: 'شمارهٔ موبایل' },
  { id: 'telegram', name: 'تلگرام', hint: 'نام کاربری یا شمارهٔ موبایل' },
];

/** a small stylised mark of each network (drawn here, not the official artwork) */
export const SocialLogo: React.FC<{ id: string; size?: number }> = ({ id, size = 22 }) => {
  const s = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true } as const;
  switch (id) {
    case 'instagram':
      return (
        <svg {...s}>
          <defs><linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA77" /><stop offset=".35" stopColor="#F58529" /><stop offset=".6" stopColor="#DD2A7B" /><stop offset="1" stopColor="#515BD4" /></linearGradient></defs>
          <rect width="24" height="24" rx="6.5" fill="url(#ig-g)" />
          <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" />
          <circle cx="16.1" cy="7.9" r="1" fill="#fff" />
        </svg>
      );
    case 'telegram':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="12" fill="#229ED9" />
          <path d="M5.2 11.6l12.4-4.8c.6-.2 1.1.1.9 1l-2.1 10c-.15.7-.6.9-1.2.55l-3.2-2.4-1.55 1.5c-.17.17-.3.3-.65.3l.23-3.3 6-5.4c.26-.23-.06-.36-.4-.13l-7.4 4.7-3.2-1c-.7-.2-.7-.7.15-1.03z" fill="#fff" />
        </svg>
      );
    case 'whatsapp':
    case 'whatsappBusiness':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="12" fill={id === 'whatsapp' ? '#25D366' : '#128C7E'} />
          <path d="M12 5.2a6.8 6.8 0 0 0-5.8 10.3L5.3 18.7l3.3-.9A6.8 6.8 0 1 0 12 5.2z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
          {id === 'whatsapp'
            ? <path d="M9.6 9c.2-.5.6-.4.8 0l.5 1.1c.1.3-.4.9-.5 1.1.5 1 1.3 1.7 2.3 2.1.2-.2.7-.8 1-.7l1.1.5c.4.2.4.6 0 .9-.8.7-1.7.7-2.8.1a6 6 0 0 1-2.6-2.5c-.5-1-.4-1.8.2-2.6z" fill="#fff" />
            : <text x="12" y="15.4" textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif">B</text>}
        </svg>
      );
    case 'bale':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="12" fill="#2EB67D" />
          <path d="M6.6 8.4c0-1 .8-1.8 1.8-1.8h7.2c1 0 1.8.8 1.8 1.8v5.2c0 1-.8 1.8-1.8 1.8h-4l-3 2.3v-2.3c-1 0-2-.8-2-1.8z" fill="#fff" />
          <circle cx="9.7" cy="11" r=".9" fill="#2EB67D" /><circle cx="12" cy="11" r=".9" fill="#2EB67D" /><circle cx="14.3" cy="11" r=".9" fill="#2EB67D" />
        </svg>
      );
    case 'eitaa':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="12" fill="#F26B21" />
          <path d="M16.8 7.3c-.9-.7-2.2-.7-3.1.1l-1.2 1.1c-.8.7-1.6 1-2.6 1.1 1 1.1 1.4 2 1.4 3.2 0 1.7-1.3 3-3 3 1.3 1.4 3.3 1.9 5.2 1.2 2.2-.8 3.6-2.9 3.5-5.2 0-1.5-.3-3.4-.2-4.5z" fill="#fff" />
        </svg>
      );
    case 'rubika':
      return (
        <svg {...s}>
          <defs><linearGradient id="rb-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E040A0" /><stop offset="1" stopColor="#7B2FD6" /></linearGradient></defs>
          <circle cx="12" cy="12" r="12" fill="url(#rb-g)" />
          <path d="M8.2 17.4V6.8h4.2c2 0 3.3 1 3.3 2.8 0 1.4-.8 2.4-2.1 2.7l2.5 5.1h-2.3l-2.2-4.7h-1.5v4.7zm2-6.4h2c.9 0 1.4-.5 1.4-1.3s-.5-1.2-1.4-1.2h-2z" fill="#fff" />
        </svg>
      );
    default:
      return <Share2 style={{ width: size, height: size }} />;
  }
};

const entryOf = (c: Customer, id: string): SocialEntry => ({ on: false, accounts: [], count: 0, ...(c.social?.[id] || {}) });

/** how many networks are switched on, and the total of the counts (for the button) */
export const socialSummary = (c: Customer) => {
  const list = NETWORKS.map((n) => entryOf(c, n.id)).filter((e) => e.on || e.accounts.length > 0 || e.count > 0);
  return { networks: list.length, total: list.reduce((t, e) => t + e.count, 0) };
};

/** The button next to the customer's name: opens the page of his networks. */
export const SocialButton: React.FC<{ customer: Customer; onClick: () => void }> = ({ customer, onClick }) => {
  const { networks } = socialSummary(customer);
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-[11px] font-black text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 rounded-full px-3 py-1 cursor-pointer" data-social-open>
      <Share2 className="w-3.5 h-3.5" />
      تعاملات مجازی
      {networks > 0 && <span className="bg-violet-600 text-white rounded-full px-1.5 min-w-[18px] text-center text-[10px]">{toPersianDigits(networks)}</span>}
    </button>
  );
};

const NetworkCard: React.FC<{ def: NetworkDef; entry: SocialEntry; onChange: (e: SocialEntry) => void; readOnly?: boolean }> = ({ def, entry, onChange, readOnly }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/^@/, '');
    if (!v || entry.accounts.includes(v)) return setDraft('');
    onChange({ ...entry, on: true, accounts: [...entry.accounts, v] });
    setDraft('');
  };
  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 transition-colors ${entry.on ? 'border-violet-300 bg-violet-50/60 shadow-sm' : 'border-[#EBDBCE] bg-white'}`} data-social-card={def.id} data-on={entry.on ? '1' : '0'}>
      <div className="flex items-center gap-2.5">
        <SocialLogo id={def.id} size={30} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-[#3A241F] truncate">{def.name}</div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{def.iran ? 'پیام‌رسان ایرانی' : 'شبکهٔ جهانی'}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={entry.on}
          aria-label={`${def.name} را برای این مشتری فعال کن`}
          disabled={readOnly}
          onClick={() => onChange({ ...entry, on: !entry.on })}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${entry.on ? 'bg-violet-600' : 'bg-[#D9CCC4]'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${entry.on ? 'left-0.5' : 'left-[1.375rem]'}`} />
        </button>
      </div>
      {entry.on && (
        <>
          <div className="space-y-1.5">
            {entry.accounts.map((a) => (
              <div key={a} className="flex items-center justify-between gap-2 bg-white border border-[#EBDBCE] rounded-xl px-2.5 py-1.5">
                <span className="text-xs font-black text-[#3A241F] truncate" dir="ltr">{/^[0-9۰-۹+]+$/.test(a) ? toPersianDigits(a) : a}</span>
                {!readOnly && <button type="button" onClick={() => onChange({ ...entry, accounts: entry.accounts.filter((x) => x !== a) })} className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
            {!readOnly && (
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                onBlur={add}
                placeholder={`${def.hint}؛ بنویسید و Enter بزنید`}
                className="w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-300"
                data-social-input
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-[#503730]">تعداد تعامل</span>
            <span className="flex items-center gap-1.5">
              <button type="button" disabled={readOnly || entry.count <= 0} onClick={() => onChange({ ...entry, count: Math.max(0, entry.count - 1) })} className="w-7 h-7 rounded-lg bg-white border border-[#EBDBCE] flex items-center justify-center disabled:opacity-30 cursor-pointer" aria-label="کم کن"><Minus className="w-3.5 h-3.5" /></button>
              <span className="min-w-[2rem] text-center text-sm font-black text-violet-800" data-social-count>{toPersianDigits(entry.count)}</span>
              <button type="button" disabled={readOnly} onClick={() => onChange({ ...entry, count: entry.count + 1 })} className="w-7 h-7 rounded-lg bg-violet-600 text-white flex items-center justify-center disabled:opacity-30 cursor-pointer" aria-label="یکی اضافه کن"><Plus className="w-3.5 h-3.5" /></button>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

/** The page of a customer's virtual interactions: every network can be switched on, with his accounts and how many times we were in touch there. */
export const SocialDialog: React.FC<{ customer: Customer; onClose: () => void; onSave: (social: Record<string, SocialEntry>) => void }> = ({ customer, onClose, onSave }) => {
  const [social, setSocial] = useState<Record<string, SocialEntry>>(() => Object.fromEntries(NETWORKS.map((n) => [n.id, entryOf(customer, n.id)])));
  const set = (id: string, e: SocialEntry) => setSocial((p) => ({ ...p, [id]: e }));
  const list = Object.values(social);
  const total = list.reduce((t, e) => t + (e.on ? e.count : 0), 0);
  const active = list.filter((e) => e.on).length;
  const section = (title: string, iran: boolean) => (
    <section className="space-y-2">
      <h4 className="text-[11px] font-black text-violet-700 flex items-center gap-2"><span className="h-px flex-1 bg-violet-100" />{title}<span className="h-px w-4 bg-violet-100" /></h4>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {NETWORKS.filter((n) => !!n.iran === iran).map((n) => <NetworkCard key={n.id} def={n} entry={social[n.id]} onChange={(e) => set(n.id, e)} />)}
      </div>
    </section>
  );
  return (
    <Modal
      wide
      onTop
      title={`تعاملات مجازی ${customer.name}`}
      onClose={onClose}
      footer={
        <>
          <span className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(active)} شبکه فعال · {toPersianDigits(total)} تعامل</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
            <button type="button" onClick={() => { onSave(social); onClose(); }} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer" data-social-save>ذخیره</button>
          </span>
        </>
      }
    >
      <div data-social-dialog className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-l from-[#7C3AED] to-[#BE123C] text-white px-4 py-3 flex items-center gap-3">
          <Share2 className="w-5 h-5 shrink-0" />
          <div className="text-[11px] font-bold leading-6">شبکه‌هایی که این مشتری در آن‌هاست را روشن کنید، شناسه یا شمارهٔ او را بنویسید و هر بار که آنجا با او در تماس بودید یکی به «تعداد تعامل» اضافه کنید.</div>
        </div>
        {section('پیام‌رسان‌های ایرانی', true)}
        {section('شبکه‌های جهانی', false)}
      </div>
    </Modal>
  );
};
