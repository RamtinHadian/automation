import React, { useState } from 'react';
import { ArrowUpRight, Check, MessageSquareText, Minus, Plus, Share2, X } from 'lucide-react';
import { Customer, SocialEntry } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { Modal } from './crmUi';
import { SendMessageDialog } from './MessageTemplates';
import { isMobileNumber, normPhone, normText } from '../../lib/customerImport';

export interface NetworkDef { id: string; name: string; hint: string; iran?: boolean; web?: boolean }

/** the networks a customer can be reached on: three from Iran first, then the others */
export const NETWORKS: NetworkDef[] = [
  { id: 'bale', name: 'بله', hint: 'نام کاربری (@username)، شناسهٔ عددی (uid) یا شمارهٔ موبایل', iran: true },
  { id: 'eitaa', name: 'ایتا', hint: 'نام کاربری (@username)، شناسهٔ عددی (Numeric ID) یا شمارهٔ موبایل', iran: true },
  { id: 'rubika', name: 'روبیکا', hint: 'نام کاربری (@username) یا شمارهٔ موبایل', iran: true },
  { id: 'instagram', name: 'اینستاگرام', hint: 'نام کاربری (@username)' },
  { id: 'whatsapp', name: 'واتس‌اپ', hint: 'شمارهٔ موبایل' },
  { id: 'whatsappBusiness', name: 'واتس‌اپ بیزینس', hint: 'شمارهٔ موبایل' },
  { id: 'website', name: 'وب‌سایت', hint: 'آدرس سایت (مثل example.com)', web: true },
  { id: 'telegram', name: 'تلگرام', hint: 'نام کاربری (@username) یا شمارهٔ موبایل' },
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
    case 'website':
      // a globe on a teal-to-blue disc
      return (
        <svg {...s} viewBox="0 0 100 100">
          <defs><linearGradient id="web-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#14B8A6" /><stop offset="1" stopColor="#2563EB" /></linearGradient></defs>
          <circle cx="50" cy="50" r="50" fill="url(#web-g)" />
          <g fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round">
            <circle cx="50" cy="50" r="29" />
            <ellipse cx="50" cy="50" rx="12.5" ry="29" />
            <path d="M21 50h58M26 34h48M26 66h48" />
          </g>
        </svg>
      );
    case 'bale':
      // the logo of Bale: a green bubble with a corner at the top left and a white tick
      return (
        <svg width={size} height={size} viewBox="0 0 1280 1280" aria-hidden>
          <circle cx="640" cy="640" r="637" fill="#0BCC9C" />
          <path d="M3 640V75Q3 3 75 6Q120 12 267 123L640 640Z" fill="#0BCC9C" />
          <path d="M355 643L554 840L925 471" fill="none" stroke="#fff" strokeWidth="250" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'eitaa':
      // Eitaa: an orange rounded square with the white swirl «e»
      return (
        <svg {...s} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="22" fill="#F28A12" />
          <path d="M80 34C70 14 34 20 26 54c-6 26 22 38 48 24 12-6 20-14 26-22" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" />
          <path d="M44 56c4-10 20-14 26-6 2 4-2 10-8 12l-8 2 2 14-12-8c-2-4-2-10 0-14z" fill="#fff" />
        </svg>
      );
    case 'rubika': {
      // Rubika: a white tile with the colourful hexagon and the white cube in its middle
      const q = (pts: string, c: string) => <polygon points={pts} fill={c} />;
      return (
        <svg {...s} viewBox="0 0 100 100">
          <rect x="1.5" y="1.5" width="97" height="97" rx="20" fill="#fff" stroke="#DDD" strokeWidth="2" />
          {q('14,29 50,8 50,28 31,39', '#8CBF2F')}{q('14,29 31,39 31,61 14,71', '#E8503A')}
          {q('50,8 86,29 69,39 50,28', '#2DB7A3')}{q('86,29 86,71 69,61 69,39', '#7B3F97')}
          {q('14,29 31,39 50,28 36,22', '#F28C1E')}{q('86,29 69,39 50,28 64,20', '#4EC9B6')}
          {q('86,71 50,92 50,72 69,61', '#F5A623')}{q('14,71 50,92 50,72 31,61', '#2BA6D1')}
          {q('86,29 86,50 69,50 69,39', '#E8505B')}{q('14,50 14,71 31,61 31,50', '#5B2D8A')}
          {q('86,71 68,82 50,72 69,61', '#F08A24')}{q('14,71 32,82 50,72 31,61', '#1B73AE')}
          {q('50,28 69,39 50,50 31,39', '#F6F6F6')}{q('31,39 50,50 50,72 31,61', '#E2E2E2')}{q('50,50 69,39 69,61 50,72', '#EBEBEB')}
        </svg>
      );
    }
    default:
      return <Share2 style={{ width: size, height: size }} />;
  }
};

/** what the person typed or pasted (@name, a name, a full link, a number) → the bare user name or number */
export const cleanAccount = (raw: string, id = ''): string =>
  id === 'website' ? normText(raw).replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase() : normText(raw)
    .replace(/^https?:\/\/(www\.)?/i, '')
    .replace(/^web\.rubika\.ir\/#c=/i, '')
    .replace(/^(t\.me|telegram\.me|eitaa\.com|rubika\.ir|ble\.ir|instagram\.com|wa\.me)\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
    .trim();
const isNumberLike = (v: string) => /^[0-9+\s-]+$/.test(v);
const isBaleUid = (v: string) => /^[1-9]\d{5,9}$/.test(v) && !/^98\d{10}$/.test(v); // Bale's chat code: web.bale.ai/chat?uid=306094847
const isEitaaNumericId = (v: string) => /^\d{5,9}$/.test(v); // «Numeric ID» of Eitaa: web.eitaa.com/#4752207 opens that chat
const validAccount = (v: string, id = '') =>
  id === 'website' ? /^([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(v)
  : (id === 'eitaa' && isEitaaNumericId(v)) || (id === 'bale' && isBaleUid(v)) ? true
  : isNumberLike(v) ? normPhone(v).length >= 10
  : /^[A-Za-z0-9_.]{3,}$/.test(v);
/** how an account is shown: a user name with @, a number in Persian digits */
/** a mobile number in groups (۰۹۱۲ ۳۴۵ ۶۷۸۹); any other number just in Persian digits */
const prettyNumber = (a: string) => {
  const d = normPhone(a);
  return toPersianDigits(/^09\d{9}$/.test(d) ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d || a);
};
const isRubikaGuid = (a: string) => /^[ugc]0[A-Za-z0-9]{20,}$/.test(a); // the chat code that web.rubika.ir/#c=… uses
export const showAccount = (a: string, id = '') => (id === 'website' || (id === 'rubika' && isRubikaGuid(a)) ? a : /^[0-9۰-۹+]+$/.test(a) ? prettyNumber(a) : '@' + a);

export const entryOf = (c: Customer, id: string): SocialEntry => {
  const saved = c.social?.[id];
  // the web address already written on the customer's form shows here too, until one is entered on this page
  if (id === 'website' && !saved?.accounts?.length && c.website?.trim()) return { on: true, accounts: [cleanAccount(c.website, 'website')], count: saved?.count || 0 };
  return { on: false, accounts: [], count: 0, ...(saved || {}) };
};

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

/** the customer's own numbers (mobiles first): the ones a network can be joined with */
const numbersOf = (c: Customer) => {
  const all = (c.phones || []).filter(Boolean);
  const mobiles = all.filter((p) => isMobileNumber(p));
  return mobiles.length ? mobiles : all;
};

const NetworkCard: React.FC<{ def: NetworkDef; entry: SocialEntry; phones: string[]; onChange: (e: SocialEntry) => void; readOnly?: boolean }> = ({ def, entry, phones, onChange, readOnly }) => {
  const [draft, setDraft] = useState('');
  const [pick, setPick] = useState(false);
  const [err, setErr] = useState('');
  const [chosen, setChosen] = useState('');
  const memberWith = phones.filter((p) => entry.accounts.includes(p));
  const isMember = memberWith.length > 0;
  const tick = () => {
    if (isMember) return onChange({ ...entry, accounts: entry.accounts.filter((a) => !phones.includes(a)) });
    if (phones.length === 1) return onChange({ ...entry, on: true, accounts: [...entry.accounts, phones[0]] });
    setChosen(phones[0] || '');
    setPick(true);
  };
  const add = () => {
    const v = cleanAccount(draft, def.id);
    if (!v) { setErr(''); return setDraft(''); }
    if (!validAccount(v, def.id)) return setErr(def.id === 'website' ? 'آدرس سایت را درست بنویسید، مثل example.com یا https://example.com' : 'نام کاربری فقط حروف انگلیسی، عدد، _ و نقطه دارد (حداقل ۳ حرف)؛ یا یک شمارهٔ موبایل بنویسید.');
    setErr('');
    if (entry.accounts.includes(v)) return setDraft('');
    onChange({ ...entry, on: true, accounts: [...entry.accounts, v] });
    setDraft('');
  };
  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 transition-colors ${entry.on ? 'border-violet-300 bg-violet-50/60 shadow-sm' : 'border-[#EBDBCE] bg-white'}`} data-social-card={def.id} data-on={entry.on ? '1' : '0'}>
      <div className="flex items-center gap-2.5">
        <SocialLogo id={def.id} size={30} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-[#3A241F] truncate">{def.name}</div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{def.web ? 'نشانی اینترنتی' : def.iran ? 'پیام‌رسان ایرانی' : 'شبکهٔ جهانی'}</div>
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
      {def.id !== 'instagram' && !def.web && (
        <label className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-black cursor-pointer ${isMember ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-[#FAF5F1] text-[#503730] border border-[#EBDBCE]'} ${phones.length === 0 || readOnly ? 'opacity-50 cursor-not-allowed' : ''}`} data-social-same>
          <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={isMember} disabled={phones.length === 0 || readOnly} onChange={tick} />
          <span className="min-w-0">
            {phones.length === 0 ? 'مشتری شماره‌ای ثبت‌شده ندارد' : isMember ? <>این شماره در {def.name} عضو است: <span dir="ltr" className="font-black">{memberWith.map((m) => toPersianDigits(m)).join('، ')}</span></> : <>همین شماره در {def.name} عضو است</>}
          </span>
        </label>
      )}
      {pick && (
        <Modal
          onTop="max"
          title={`شمارهٔ عضو ${def.name}`}
          onClose={() => setPick(false)}
          footer={
            <>
              <button type="button" onClick={() => setPick(false)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              <button type="button" disabled={!chosen} onClick={() => { onChange({ ...entry, on: true, accounts: entry.accounts.includes(chosen) ? entry.accounts : [...entry.accounts, chosen] }); setPick(false); }} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer" data-social-pick-ok>ثبت</button>
            </>
          }
        >
          <div className="space-y-2" data-social-pick>
            <div className="flex items-center gap-2.5"><SocialLogo id={def.id} size={28} /><p className="text-xs font-bold text-[#503730] leading-6">این مشتری چند شماره دارد؛ کدام یک در {def.name} عضو است؟</p></div>
            {phones.map((p) => (
              <button key={p} type="button" onClick={() => setChosen(p)} className={`w-full flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 cursor-pointer text-right transition-colors ${chosen === p ? 'border-violet-400 bg-violet-50' : 'border-[#EBDBCE] bg-white hover:bg-[#FAF5F1]'}`} data-social-pick-row>
                <span dir="ltr" className="text-sm font-black text-[#3A241F]">{toPersianDigits(p)}</span>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center ${chosen === p ? 'bg-violet-600 text-white' : 'border border-[#D9CCC4]'}`}>{chosen === p && <Check className="w-3.5 h-3.5" />}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {entry.on && (
        <>
          <div className="space-y-1.5">
            {entry.accounts.map((a) => (
              <div key={a} className="flex items-center justify-between gap-2 bg-white border border-[#EBDBCE] rounded-xl px-2.5 py-1.5">
                <span className="text-xs font-black text-[#3A241F] truncate" dir="ltr">{showAccount(a, def.id)}</span>
                {!readOnly && <button type="button" onClick={() => onChange({ ...entry, accounts: entry.accounts.filter((x) => x !== a) })} className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>}
              </div>
            ))}
            {!readOnly && (
              <input
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                onBlur={add}
                placeholder={`${def.hint}؛ بنویسید و Enter بزنید`}
                className="w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-300"
                data-social-input
                dir="ltr"
              />
            )}
            {err && <div className="text-[11px] font-black text-rose-700 leading-5" data-social-err>{err}</div>}
            {!readOnly && !err && <div className="text-[10px] font-bold text-[#8C6F66] leading-5">{def.web ? 'آدرس را با یا بدون https:// بنویسید؛ چند سایت هم می‌شود ثبت کرد.' : 'نام کاربری را با یا بدون @ بنویسید؛ لینک کامل (مثل t.me/نام) را هم می‌شود چسباند.'}</div>}
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
  const section = (title: string, group: 'iran' | 'world' | 'web') => (
    <section className="space-y-2">
      <h4 className="text-[11px] font-black text-violet-700 flex items-center gap-2"><span className="h-px flex-1 bg-violet-100" />{title}<span className="h-px w-4 bg-violet-100" /></h4>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {NETWORKS.filter((n) => (n.iran ? 'iran' : n.web ? 'web' : 'world') === group).map((n) => <NetworkCard key={n.id} def={n} entry={social[n.id]} phones={numbersOf(customer)} onChange={(e) => set(n.id, e)} />)}
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
        {section('پیام‌رسان‌های ایرانی', 'iran')}
        {section('شبکه‌های جهانی', 'world')}
        {section('وب‌سایت', 'web')}
      </div>
    </Modal>
  );
};

/** the address that opens a conversation with this account (a user name or a mobile number) on the network; '' when only the number can be copied */
export const socialLink = (id: string, account: string, text = ''): string => {
  const a = normText(account).replace(/^@/, '');
  const isNumber = /^[0-9+\s-]+$/.test(a);
  const intl = isNumber ? normPhone(a).replace(/^0/, '98') : '';
  switch (id) {
    // with a message the official t.me link is used (it carries ?text= to the app or the web); without one the web opens straight on the chat
    case 'telegram': return text ? `https://t.me/${isNumber ? '+' + intl : a}?text=${encodeURIComponent(text)}` : isNumber ? `https://t.me/+${intl}` : `https://web.telegram.org/k/#@${a}`;
    case 'whatsapp':
    case 'whatsappBusiness': return isNumber ? `https://web.whatsapp.com/send?phone=${intl}${text ? '&text=' + encodeURIComponent(text) : ''}` : '';
    case 'instagram': return isNumber ? '' : `https://instagram.com/${a}`;
    case 'bale': return isBaleUid(a) ? `https://web.bale.ai/chat?uid=${a}` : 'https://web.bale.ai/chat'; // Bale web opens on its chat page; the user name or number is copied to search there
    case 'eitaa': return isEitaaNumericId(a) ? `https://web.eitaa.com/#${a}` : isNumber ? 'https://web.eitaa.com/' : `https://web.eitaa.com/#@${a}`; // the web version of Eitaa; a number cannot be linked, so it is copied
    case 'rubika': return isRubikaGuid(a) ? `https://web.rubika.ir/#c=${a}` : 'https://web.rubika.ir/'; // Rubika publishes no link that opens a person's chat: its web opens and the name or number is copied to search there
    case 'website': return `https://${a}`;
    default: return '';
  }
};

/** the address that opens the installed desktop / phone app (Telegram, WhatsApp); '' for the others */
export const socialAppLink = (id: string, account: string, text = ''): string => {
  const a = normText(account).replace(/^@/, '');
  const isNumber = /^[0-9+\s-]+$/.test(a);
  const intl = isNumber ? normPhone(a).replace(/^0/, '98') : '';
  const t = text ? `&text=${encodeURIComponent(text)}` : '';
  if (id === 'telegram') return isNumber ? `tg://resolve?phone=${intl}${t}` : `tg://resolve?domain=${a}${t}`; // the links of Telegram's own documentation
  if ((id === 'whatsapp' || id === 'whatsappBusiness') && isNumber) return `whatsapp://send?phone=${intl}${text ? '&text=' + encodeURIComponent(text) : ''}`;
  // Eitaa and Bale desktop apps are built like Telegram's: the same «resolve» address under their own name (if the app is not there nothing happens and the web opens)
  if (id === 'eitaa' && isEitaaNumericId(a)) return '';
  if (id === 'eitaa') return isNumber ? `eitaa://resolve?phone=${intl}${t}` : `eitaa://resolve?domain=${a}${t}`;
  if (id === 'bale' && isBaleUid(a)) return '';
  if (id === 'bale') return isNumber ? `bale://resolve?phone=${intl}${t}` : `bale://resolve?domain=${a}${t}`;
  if (id === 'rubika') return isNumber ? '' : `rubika://resolve?domain=${a}`;
  if (id === 'instagram' && !isNumber) return `instagram://user?username=${a}`;
  return '';
};

/** Try the installed app first; when nothing took over (the window kept its focus) open the web version instead. */
/** One separate tab per network that is used again for every click (it is named), so the web of Telegram, WhatsApp, Eitaa, Bale and Rubika never piles up new tabs. */
const webTabs: Record<string, Window | null> = {};
const openWebTab = (id: string, url: string) => {
  if (id === 'whatsappBusiness') id = 'whatsapp'; // the same web page serves both, and WhatsApp allows one open web page at a time
  // the tab opened before is remembered: it is sent to the new address (a browser may forget a tab's name when it moves to another site)
  const prev = webTabs[id];
  if (prev && !prev.closed) {
    try {
      prev.location.href = url;
      prev.focus();
      return;
    } catch { /* the tab can not be reached any more: open it again below */ }
  }
  const w = window.open(url, 'hoormand_' + id);
  webTabs[id] = w;
  try { w?.focus(); } catch { /* the browser keeps the focus rule */ }
};

const openAppOrWeb = (id: string, app: string, web: string) => {
  let left = false;
  const onBlur = () => { left = true; };
  const onVis = () => { if (document.hidden) left = true; };
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);
  const a = document.createElement('a');
  a.href = app;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVis);
    if (!left) openWebTab(id, web);
  }, 1600);
};

/** The Hoormand browser extension (for Rubika, Bale and Eitaa web) is switched on in this browser; the person says so once. */
const EXT_KEY = 'hoormand_chat_ext';
const EXT_SEND_KEY = 'hoormand_chat_ext_send';
const readFlag = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const writeFlag = (k: string, on: boolean) => { try { localStorage.setItem(k, on ? '1' : '0'); } catch { /* not kept */ } };
export const chatExtOn = () => readFlag(EXT_KEY);
export const setChatExt = (on: boolean) => writeFlag(EXT_KEY, on);
export const chatExtSend = () => readFlag(EXT_SEND_KEY);
export const setChatExtSend = (on: boolean) => writeFlag(EXT_SEND_KEY, on);
export const EXT_NETWORKS = ['rubika', 'bale', 'eitaa'];
const EXT_BASE: Record<string, string> = { rubika: 'https://web.rubika.ir/', bale: 'https://web.bale.ai/chat', eitaa: 'https://web.eitaa.com/' };
/** the job for the extension, as it goes into the address after #hoormand= (URL-safe base64 of UTF-8 JSON) */
const encodeJob = (job: Record<string, unknown>) => {
  const bytes = new TextEncoder().encode(JSON.stringify(job));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Opens the chat with a customer's account on a network (the installed app first, then the web in its own tab) and returns the note to show.
 * With a `text` WhatsApp gets it already written in the message box; the other networks cannot be given a text from outside, so it is copied to be pasted (Ctrl+V).
 */
export const openChat = (id: string, name: string, account: string, text = '', customerName = ''): string => {
  const plain = normText(account).replace(/^@/, '');
  const isNumber = /^[0-9+\s-]+$/.test(plain);
  const url = socialLink(id, account, text);
  const app = socialAppLink(id, account, text);
  const isWa = id === 'whatsapp' || id === 'whatsappBusiness';
  const textInLink = !!text && ((isWa && isNumber) || id === 'telegram'); // the networks whose own links carry the text
  const who = isNumber ? normPhone(account) : '@' + plain;
  const copy = (v: string) => { try { void navigator.clipboard?.writeText(v); } catch { /* no clipboard */ } };
  // sending by itself is only possible in the WEB of WhatsApp / Telegram (the installed apps give no way to press «send» from outside):
  // with the extension and «send by itself» on, the web is opened with the text already in place and the extension presses send
  if (text && chatExtOn() && chatExtSend() && ((isWa && isNumber) || id === 'telegram')) {
    const job = encodeJob({ prefilled: true, send: true, text });
    const web = isWa
      ? `${socialLink(id, account, text)}#hoormand=${job}`
      : `https://web.telegram.org/k/?hoormand=${job}#?tgaddr=${encodeURIComponent(socialAppLink('telegram', account, text))}`;
    // the installed app comes first (the message waits in its box, «send» is yours: an app cannot be pressed from outside); the web with the extension is the second choice and sends by itself
    openAppOrWeb(id, socialAppLink(id, account, text), web);
    copy(text);
    return `${name}: اول برنامهٔ نصب‌شده روی این سیستم باز می‌شود (پیام در کادر می‌نشیند و «ارسال» با شماست)؛ اگر برنامه نبود، وب باز می‌شود و افزونهٔ هورمند پیام را می‌فرستد. اگر نشد، متن کپی شده است.`;
  }
  // with the extension the chat is found, opened and written by the extension: the job travels in the address
  if (EXT_NETWORKS.includes(id) && chatExtOn()) {
    // a chat that the address opens by itself (Bale uid): the extension only writes
    if (id === 'bale' && isBaleUid(plain)) {
      openWebTab(id, `${EXT_BASE.bale}?uid=${plain}#hoormand=${encodeJob({ prefilled: true, send: chatExtSend(), text })}`);
      if (text) copy(text);
      return `${name} وب باز شد و افزونهٔ هورمند ${text ? 'پیام را می‌نویسد' : 'گفتگو را باز می‌کند'}${text && chatExtSend() ? ' و می‌فرستد' : ''}.`;
    }
    const job = { who: isNumber ? normPhone(account) : plain, name: customerName, text, send: chatExtSend(), guid: id === 'rubika' && isRubikaGuid(plain) ? plain : undefined,
      // Eitaa opens a chat straight from the address: #@username or #numeric-id
      peer: id === 'eitaa' ? (isEitaaNumericId(plain) ? plain : isNumber ? undefined : '@' + plain) : undefined };
    openWebTab(id, `${EXT_BASE[id]}#hoormand=${encodeJob(job)}`);
    if (text) copy(text);
    return `${name} وب باز شد و افزونهٔ هورمند گفتگوی «${who}» را پیدا می‌کند${text ? ' و پیام را می‌نویسد' : ''}${text && chatExtSend() ? ' و می‌فرستد' : ''}. اگر چیزی نشد، متن کپی شده است.`;
  }
  // what the person has to paste: the message when there is one, else the name / number to search for
  const needSearch = (id === 'bale' && !isBaleUid(plain)) || (id === 'rubika' && !isRubikaGuid(plain)) || (id === 'eitaa' && isNumber && !isEitaaNumericId(plain)) || !url;
  if (text && !(isWa && isNumber)) copy(text); // a copy is kept for every network but WhatsApp, in case the text does not land in the box
  else if (!text && needSearch) copy(who);
  const pasteNote = text && textInLink && id === 'telegram' ? ' متن پیام به تلگرام داده شد (و کپی هم شد)؛ اگر در کادر پیام ننشست، Ctrl+V بزنید.' : text && !textInLink ? ` ${name} راه رسمی برای گذاشتن متن در گفتگو ندارد؛ متن پیام کپی شد، در گفتگو Ctrl+V بزنید${needSearch ? ` و برای پیدا کردن مشتری «${who}» را جست‌وجو کنید` : ''}.` : '';
  if (app && url) {
    openAppOrWeb(id, app, url);
    return `${name}: اگر برنامه روی این سیستم نصب باشد مستقیم داخل آن باز می‌شود، وگرنه نسخهٔ وب.${pasteNote}${!text && needSearch ? ` «${who}» کپی شد؛ در جست‌وجو بچسبانید.` : ''}`;
  }
  if (url) {
    if (id === 'website' || id === 'instagram') window.open(url, '_blank', 'noopener,noreferrer');
    else openWebTab(id, url);
    return `${name} باز شد.${pasteNote}${!text && needSearch ? ` «${who}» کپی شد؛ در جست‌وجوی ${name} بچسبانید.` : ''}`;
  }
  return `${name} لینک مستقیم ندارد؛ «${text ? 'متن پیام' : who}» کپی شد، در خود برنامه جست‌وجو و بچسبانید.`;
};

/** The small logos of the networks a customer is in (the customer list): a click gives the network that was pressed. */
export const CustomerSocialIcons: React.FC<{ customer: Customer; onPick: (networkId: string) => void }> = ({ customer, onPick }) => {
  const mine = NETWORKS.filter((n) => (customer.social?.[n.id]?.accounts?.length || 0) > 0);
  if (!mine.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-customer-social onClick={(e) => e.stopPropagation()}>
      {mine.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={(e) => { e.stopPropagation(); onPick(n.id); }}
          title={n.web ? `${n.name}: ${customer.social![n.id].accounts[0]}` : `ارسال پیام در ${n.name}`}
          className="rounded-full hover:scale-110 hover:shadow-md transition-transform cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          data-customer-social-icon={n.id}
        >
          <SocialLogo id={n.id} size={22} />
        </button>
      ))}
    </div>
  );
};

/** All networks of a customer in one row (the full summary): the ones not entered are dim; a click opens the chat with him there. */
export const SocialStrip: React.FC<{ customer: Customer }> = ({ customer }) => {
  const [note, setNote] = useState('');
  const [sendOpen, setSendOpen] = useState(false);
  const open = (id: string, name: string, account: string) => setNote(openChat(id, name, account, '', customer.name));
  return (
    <section className="rounded-2xl bg-white/10 border border-white/20 overflow-hidden" data-social-strip>
      <div className="px-4 py-2.5 bg-white/10 text-xs font-black flex items-center justify-between">
        <span>شبکه‌های اجتماعی مشتری</span>
        <span className="flex items-center gap-3">
          <span className="opacity-80 text-[10px] font-bold hidden sm:inline">برای پیام دادن روی هر کدام بزنید</span>
          <button type="button" onClick={(ev) => { ev.stopPropagation(); setSendOpen(true); }} className="flex items-center gap-1.5 bg-white text-violet-800 rounded-lg px-2.5 py-1 text-[11px] font-black hover:bg-violet-100 cursor-pointer" data-msg-open>
            <MessageSquareText className="w-3.5 h-3.5" />
            ارسال پیام آماده
          </button>
        </span>
      </div>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* the ones that are entered come first, the empty (dim) ones go to the end of the list */}
        {[...NETWORKS].sort((x, y) => Number(entryOf(customer, x.id).accounts.length === 0) - Number(entryOf(customer, y.id).accounts.length === 0)).map((n) => {
          const e = entryOf(customer, n.id);
          const set = e.accounts.length > 0;
          return (
            <div key={n.id} className={`rounded-xl border px-3 py-2 min-w-0 ${set ? 'bg-white/15 border-white/30' : 'bg-black/20 border-white/10 opacity-55'}`} data-social-strip-item={n.id} data-set={set ? '1' : '0'}>
              <div className="flex items-center gap-2">
                <span className={set ? '' : 'grayscale'}><SocialLogo id={n.id} size={22} /></span>
                <span className="text-[11px] font-black truncate">{n.name}</span>
                {e.count > 0 && <span className="ms-auto text-[10px] font-black bg-white/20 rounded-full px-1.5">{toPersianDigits(e.count)} تعامل</span>}
              </div>
              {set ? (
                <div className="mt-2 flex flex-col gap-1.5">
                  {e.accounts.map((a) => (
                    <button key={a} type="button" onClick={(ev) => { ev.stopPropagation(); open(n.id, n.name, a); }} title={`پیام دادن در ${n.name}`} className="group w-full flex items-center justify-between gap-2 text-[12px] font-black bg-white/95 text-[#2B1A55] rounded-lg px-2.5 py-1.5 shadow-sm hover:bg-white hover:shadow-md hover:-translate-y-px transition cursor-pointer" dir="ltr" data-social-strip-link>
                      <span className="truncate tracking-wide text-left">{showAccount(a, n.id)}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-violet-500 group-hover:text-violet-700" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-1.5 text-[10px] font-bold">{e.on ? 'روشن است ولی شناسه‌ای وارد نشده' : 'ثبت نشده'}</div>
              )}
            </div>
          );
        })}
      </div>
      {note && <div className="px-4 pb-3 text-[11px] font-bold text-amber-200" data-social-strip-note>{note}</div>}
      {sendOpen && <SendMessageDialog customer={customer} onClose={() => setSendOpen(false)} />}
    </section>
  );
};
