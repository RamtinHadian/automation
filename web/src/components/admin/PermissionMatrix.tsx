import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Lock, Search, ShieldCheck } from 'lucide-react';
import { Department, User } from '../../types';
import { COLUMNS, Column, MENUS, adminHideId, colOn, colPatch, colPatchMany, isAdminUser } from '../../lib/permissions';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { PersonPicker, staffItems } from '../common/PersonPicker';
import { api, WhState } from '../../lib/api';
import { matchesAll } from '../../lib/searchAll';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'مدیر ارشد', DEPT_ADMIN: 'مدیر واحد', STAFF: 'کارمند' };

/**
 * One row per employee; the columns are every menu of the application, each followed by its sub-menus (lib/permissions.ts).
 * A tick gives the right and is saved at once. A sub-menu is open by default and a person sees it only when the menu itself is open for them.
 */
/** Under the name: whose customers this person works with (a tap re-opens the choosing window). */
const TeamCrmChip: React.FC<{ u: User; users: User[]; onOpen: () => void }> = ({ u, users, onOpen }) => {
  const n = (u.crmTeamIds || []).filter((id) => users.some((x) => x.id === id)).length;
  const m = (u.crmCustomerIds || []).length;
  return (
    <button type="button" onClick={onOpen} className="mt-1 text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5 cursor-pointer" data-team-crm-chip>
      {u.canSeeTeamCrm ? `مشتریان: ${n === 0 ? 'همهٔ همکاران' : `${toPersianDigits(n)} همکار`}` : 'مشتریان مشخص'}{m > 0 ? ` · ${toPersianDigits(m)} مشتری` : ''}
    </button>
  );
};

/** The window that opens in the middle of the page when «مشتریان همکاران» is ticked: «همهٔ همکاران», or the names whose customers are visible. */
const TeamCrmDialog: React.FC<{ u: User; users: User[]; onSave: (ids: string[], customerIds: string[], seesTeam: boolean) => void; onClose: () => void }> = ({ u, users, onSave, onClose }) => {
  const { customers } = useAppContext();
  const [tab, setTab] = useState<'people' | 'customers'>(u.canSeeTeamCrm ? 'people' : 'customers');
  const [cq, setCq] = useState('');
  const [cust, setCust] = useState<string[]>(u.crmCustomerIds || []);
  const custShown = (cq.trim() ? customers.filter((c) => matchesAll(c, cq)) : customers).slice(0, 200);
  const people = users.filter((x) => x.isActive !== false && x.id !== u.id);
  const [all, setAll] = useState(!!u.canSeeTeamCrm && (u.crmTeamIds || []).length === 0);
  const [picked, setPicked] = useState<string[]>((u.crmTeamIds || []).filter((id) => people.some((x) => x.id === id)));
  const [q, setQ] = useState('');
  const shown = q.trim() ? people.filter((x) => matchesAll(x, q)) : people;
  const toggle = (id: string) => {
    setAll(false);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-team-crm-dialog>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col border border-[#EBDBCE] text-right max-h-[85vh]">
        <div className="px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">مشتریان کدام همکاران برای «{u.fullName}» دیده شود؟</h3>
          <p className="text-[11px] text-[#8C6F66] mt-1">نام همکاران را انتخاب کنید یا «همهٔ همکاران» را بزنید.</p>
          <p className="text-[11px] font-black text-violet-700 mt-1.5" data-team-summary>
            «{u.fullName}» مشتریان {all ? 'همهٔ همکاران' : picked.length === 0 ? 'هیچ همکاری (فقط مشتری‌های خودش)' : people.filter((x) => picked.includes(x.id)).map((x) => x.fullName).slice(0, 5).join('، ') + (picked.length > 5 ? ` و ${toPersianDigits(picked.length - 5)} نفر دیگر` : '')} را می‌بیند (به‌علاوهٔ مشتریان خودش).
          </p>
        </div>
        <div className="px-4 pt-3 flex gap-1.5" data-team-tabs>
          {([['people', 'مشتریان همکاران'], ['customers', `مشتری‌های مشخص${cust.length ? ' (' + toPersianDigits(cust.length) + ')' : ''}`]] as const).map(([id, l]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-black border cursor-pointer ${tab === id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white border-[#EBDBCE] text-[#3A241F]'}`}>{l}</button>
          ))}
        </div>
        {tab === 'people' ? (
          <>
        <div className="px-4 pt-3 space-y-2">
          <button type="button" onClick={() => { setAll(!all); setPicked([]); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-black cursor-pointer ${all ? 'bg-[#F6D9CD] border-[#C98B6A]' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-team-all>
            <span className={`w-5 h-5 rounded-md flex items-center justify-center ${all ? 'bg-[#6E1B1B] text-white' : 'border border-[#EBDBCE]'}`}>{all && <Check className="w-3.5 h-3.5" />}</span>
            همهٔ همکاران
          </button>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام…" className="w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#6E1B1B]" />
        </div>
        <div className="p-3 overflow-y-auto flex-1 space-y-1">
          {shown.map((x) => {
            const on = picked.includes(x.id);
            return (
              <button key={x.id} type="button" onClick={() => toggle(x.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right cursor-pointer ${on ? 'bg-[#F6D9CD]' : 'hover:bg-[#FAF5F1]'}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-black text-[#3A241F] truncate">{x.fullName}</span>
                  {x.departmentName && <span className="block text-[10px] text-[#8C6F66] truncate">{x.departmentName}</span>}
                </span>
                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-[#6E1B1B] text-white' : 'border border-[#EBDBCE]'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
              </button>
            );
          })}
          {shown.length === 0 && <div className="py-6 text-center text-xs font-bold text-gray-400">موردی پیدا نشد.</div>}
        </div>
          </>
        ) : (
          <>
        <div className="px-4 pt-3 space-y-2">
          <p className="text-[11px] text-[#8C6F66] leading-5">علاوه بر مشتری‌هایی که خودش ساخته، به این مشتری‌ها هم دسترسی داشته باشد (مشتری، فرصت و پیگیری‌هایشان). به مشتریان همکاران نیازی نیست.</p>
          <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="جستجوی مشتری…" className="w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#6E1B1B]" />
        </div>
        <div className="p-3 overflow-y-auto flex-1 space-y-1" data-team-customers>
          {custShown.map((c) => {
            const on = cust.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => setCust((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right cursor-pointer ${on ? 'bg-[#F6D9CD]' : 'hover:bg-[#FAF5F1]'}`}>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-black text-[#3A241F] truncate">{c.name}</span>
                  {(c.company || c.ownerName) && <span className="block text-[10px] text-[#8C6F66] truncate">{[c.company && c.company !== c.name ? c.company : '', c.ownerName ? 'مسئول: ' + c.ownerName : ''].filter(Boolean).join(' · ')}</span>}
                </span>
                <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-[#6E1B1B] text-white' : 'border border-[#EBDBCE]'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>
              </button>
            );
          })}
          {custShown.length === 0 && <div className="py-6 text-center text-xs font-bold text-gray-400">مشتری‌ای پیدا نشد.</div>}
        </div>
          </>
        )}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <span className="text-[11px] font-bold text-[#8C6F66]">{tab === 'customers' ? `${toPersianDigits(cust.length)} مشتری انتخاب شده` : all ? 'همهٔ همکاران' : picked.length === 0 ? 'هیچ همکاری (فقط مشتری‌های خودش)' : `${toPersianDigits(picked.length)} همکار انتخاب شده`}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
            <button type="button" onClick={() => { onSave(all ? [] : picked, cust, all || picked.length > 0); onClose(); }} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] disabled:opacity-50 cursor-pointer" data-team-save>تأیید</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Under the name of a person who may enter «انبار»: which warehouses, and which single products with their own ticks for the stock and the price. */
const WhChip: React.FC<{ u: User; onOpen: (tab: 'wh' | 'prod' | 'groups') => void }> = ({ u, onOpen }) => {
  const g = (u.whGroups || []).length;
  const w = (u.whWarehouseIds || []).length;
  const pr = (u.whProducts || []).length;
  const cls = 'mt-1 ml-1 text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 cursor-pointer';
  return (
    <>
      {w > 0 && <button type="button" onClick={() => onOpen('wh')} className={cls} data-wh-chip>فقط {toPersianDigits(w)} انبار</button>}
      {g > 0 && <button type="button" onClick={() => onOpen('groups')} className={cls} data-group-chip>فقط {toPersianDigits(g)} گروه کالا</button>}
      {pr > 0 && <button type="button" onClick={() => onOpen('prod')} className={cls} data-prod-chip>فقط {toPersianDigits(pr)} کالا</button>}
    </>
  );
};

type WhRule = { id: string; qty: boolean; price: boolean };

const WhDialog: React.FC<{ u: User; tab0?: 'wh' | 'prod' | 'groups'; onSave: (warehouses: string[], products: WhRule[], groups: string[]) => void; onClose: () => void }> = ({ u, tab0 = 'wh', onSave, onClose }) => {
  const [grps, setGrps] = useState<string[]>(u.whGroups || []);
  const [gq, setGq] = useState('');
  const [data, setData] = useState<WhState | null>(null);
  const [wq, setWq] = useState('');
  const [err, setErr] = useState('');
  const tab = tab0;
  const [whs, setWhs] = useState<string[]>(u.whWarehouseIds || []);
  const [prods, setProds] = useState<WhRule[]>(u.whProducts || []);
  const [q, setQ] = useState('');
  React.useEffect(() => {
    api.warehouse().then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'بارگیری نشد'));
  }, []);
  // the product groups of the warehouse (as Sepidar has them): how many products each holds and a few names, because a group is often only a number
  const groupList = useMemo(() => {
    const m = new Map<string, { name: string; count: number; samples: string[] }>();
    for (const p of data?.products || []) {
      const name = p.group || 'بدون گروه';
      const g = m.get(name) || { name, count: 0, samples: [] };
      g.count++;
      if (g.samples.length < 2) g.samples.push(p.title);
      m.set(name, g);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa', { numeric: true }));
  }, [data]);
  const shownGroups = groupList.filter((g) => !gq.trim() || matchesAll({ name: g.name, samples: g.samples.join(' ') }, gq));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const list = (data?.products || []).filter((p) => !q.trim() || matchesAll(p, q)).slice(0, 300);
  const rule = (id: string) => prods.find((x) => x.id === id);
  const setRule = (id: string, patch: Partial<WhRule> | null) =>
    setProds((cur) => (patch === null ? cur.filter((x) => x.id !== id) : cur.some((x) => x.id === id) ? cur.map((x) => (x.id === id ? { ...x, ...patch } : x)) : [...cur, { id, qty: true, price: false, ...patch }]));
  const allQty = prods.length > 0 && prods.every((x) => x.qty);
  const allPrice = prods.length > 0 && prods.every((x) => x.price);
  const box = (on: boolean) => `w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-[#D97706] text-white' : 'border border-[#EBDBCE]'}`;
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-wh-dialog>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-[#EBDBCE] text-right max-h-[88vh]">
        <div className="px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">{tab0 === 'groups' ? 'گروه‌های کالای' : tab0 === 'wh' ? 'انبارهای' : 'کالاهای'} «{u.fullName}»</h3>
          <p className="text-[11px] text-[#8C6F66] mt-1 leading-5">{tab0 === 'groups' ? 'هیچ گروهی انتخاب نشود یعنی همهٔ گروه‌ها را می‌بیند. با انتخاب گروه، فقط کالاهای همان گروه‌ها (موجودی، اسناد و کارت کالا) برایش باز است.' : tab0 === 'wh' ? 'هیچ انباری انتخاب نشود یعنی همهٔ انبارها.' : 'هیچ کالایی انتخاب نشود یعنی همهٔ کالاها (به‌علاوهٔ گروه‌هایی که در ویرایش کاربر تیک خورده). برای هر کالا می‌توانید موجودی و قیمت را جدا باز کنید.'}</p>
        </div>
        {err && <div className="px-5 pt-3 text-xs font-bold text-rose-600">{err}</div>}
        {tab === 'groups' ? (
          <div className="p-3 overflow-y-auto flex-1 space-y-2" data-wh-groups-dialog>
            <input value={gq} onChange={(e) => setGq(e.target.value)} placeholder="جستجوی گروه (نام گروه یا نام یکی از کالاها)…" className="w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#D97706] focus:outline-none" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setGrps((c) => [...new Set([...c, ...shownGroups.map((g) => g.name)])])} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-amber-300 text-amber-800 cursor-pointer" data-wh-groups-all>انتخاب همه{gq.trim() ? ' (نتیجهٔ جست‌وجو)' : ''}</button>
              <button type="button" onClick={() => setGrps((c) => (gq.trim() ? c.filter((x) => !shownGroups.some((g) => g.name === x)) : []))} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-[#EBDBCE] text-[#8C6F66] cursor-pointer">برداشتن همه</button>
            </div>
            <button type="button" onClick={() => setGrps([])} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-black cursor-pointer ${grps.length === 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'border-[#EBDBCE] text-[#3A241F]'}`}>
              <span className={box(grps.length === 0)}>{grps.length === 0 && <Check className="w-3.5 h-3.5" />}</span>
              همهٔ گروه‌ها (بدون محدودیت)
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {shownGroups.map((g) => {
                const on = grps.includes(g.name);
                return (
                  <button key={g.name} type="button" role="checkbox" aria-checked={on} onClick={() => setGrps((c) => (c.includes(g.name) ? c.filter((x) => x !== g.name) : [...c, g.name]))} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-right cursor-pointer ${on ? 'bg-amber-50 border-amber-300' : 'border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-wh-group={g.name}>
                    <span className={box(on)}>{on && <Check className="w-3.5 h-3.5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black text-[#3A241F] truncate">{g.name}</span>
                      <span className="block text-[10px] text-[#8C6F66] truncate">{toPersianDigits(g.count)} کالا · {g.samples.join('، ')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {data && shownGroups.length === 0 && <div className="py-6 text-center text-xs font-bold text-gray-400">گروهی پیدا نشد.</div>}
          </div>
        ) : tab === 'wh' ? (
          <div className="p-3 overflow-y-auto flex-1 space-y-1">
            <input value={wq} onChange={(e) => setWq(e.target.value)} placeholder="جستجوی انبار…" className="w-full mb-1 px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#D97706]" />
            <div className="flex gap-2 pb-1">
              <button type="button" onClick={() => setWhs((data?.warehouses || []).filter((w) => !wq.trim() || matchesAll(w, wq)).map((w) => w.id))} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-amber-300 text-amber-800 cursor-pointer" data-wh-select-all>انتخاب همه</button>
              <button type="button" onClick={() => setWhs([])} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-[#EBDBCE] text-[#8C6F66] cursor-pointer">برداشتن همه</button>
            </div>
            <button type="button" onClick={() => setWhs([])} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-black cursor-pointer ${whs.length === 0 ? 'bg-amber-50 border-amber-300' : 'bg-white border-[#EBDBCE]'}`}>
              <span className={box(whs.length === 0)}>{whs.length === 0 && <Check className="w-3.5 h-3.5" />}</span>
              همهٔ انبارها
            </button>
            {(data?.warehouses || []).filter((w) => !wq.trim() || matchesAll(w, wq)).map((w) => {
              const on = whs.includes(w.id);
              return (
                <button key={w.id} type="button" onClick={() => setWhs((p) => (p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right cursor-pointer ${on ? 'bg-amber-50' : 'hover:bg-[#FAF5F1]'}`}>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{w.title}</span>
                    {w.location && <span className="block text-[10px] text-[#8C6F66] truncate">{w.location}</span>}
                  </span>
                  <span className={box(on)}>{on && <Check className="w-3.5 h-3.5" />}</span>
                </button>
              );
            })}
            {data && data.warehouses.length === 0 && <div className="py-6 text-center text-xs font-bold text-gray-400">انباری تعریف نشده است.</div>}
          </div>
        ) : (
          <>
            <div className="px-4 pt-3 space-y-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کالا (نام یا کد)…" className="w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#D97706]" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setProds((c) => [...c, ...list.filter((p) => !c.some((x) => x.id === p.id)).map((p) => ({ id: p.id, qty: true, price: false }))])} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-amber-300 text-amber-800 cursor-pointer" data-wh-prod-all>انتخاب همه{q.trim() ? ' (نتیجهٔ جست‌وجو)' : ''}</button>
                <button type="button" onClick={() => setProds((c) => (q.trim() ? c.filter((x) => !list.some((p) => p.id === x.id)) : []))} className="px-3 py-1.5 rounded-lg text-[11px] font-black border border-[#EBDBCE] text-[#8C6F66] cursor-pointer">برداشتن همه</button>
              </div>
              {prods.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-black text-[#3A241F]" data-wh-all>
                  <span className="text-[#8C6F66]">برای همهٔ کالاهای انتخاب‌شده:</span>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={allQty} onChange={(e) => setProds((c) => c.map((x) => ({ ...x, qty: e.target.checked })))} />موجودی</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={allPrice} onChange={(e) => setProds((c) => c.map((x) => ({ ...x, price: e.target.checked })))} />قیمت (همراه موجودی)</label>
                </div>
              )}
            </div>
            <div className="p-3 overflow-y-auto flex-1 space-y-1" data-wh-products>
              {list.map((p) => {
                const r = rule(p.id);
                return (
                  <div key={p.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${r ? 'bg-amber-50' : 'hover:bg-[#FAF5F1]'}`}>
                    <button type="button" onClick={() => setRule(p.id, r ? null : {})} className="flex items-center gap-3 flex-1 min-w-0 text-right cursor-pointer">
                      <span className={box(!!r)}>{r && <Check className="w-3.5 h-3.5" />}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-black text-[#3A241F] truncate">{p.title}</span>
                        <span className="block text-[10px] text-[#8C6F66] truncate">{[p.code, p.group].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                    {r && (
                      <span className="flex items-center gap-2 text-[10px] font-black shrink-0">
                        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={r.qty} onChange={(e) => setRule(p.id, { qty: e.target.checked })} />موجودی</label>
                        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={r.price} onChange={(e) => setRule(p.id, { price: e.target.checked })} />قیمت</label>
                      </span>
                    )}
                  </div>
                );
              })}
              {data && list.length === 0 && <div className="py-6 text-center text-xs font-bold text-gray-400">کالایی پیدا نشد.</div>}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <span className="text-[11px] font-bold text-[#8C6F66]">
            {tab === 'groups' ? (grps.length === 0 ? 'همهٔ گروه‌ها' : `${toPersianDigits(grps.length)} گروه`) : tab === 'wh' ? (whs.length === 0 ? 'همهٔ انبارها' : `${toPersianDigits(whs.length)} انبار`) : prods.length ? `${toPersianDigits(prods.length)} کالای مشخص` : 'همهٔ کالاها'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
            <button type="button" onClick={() => { onSave(tab === 'wh' ? whs : (u.whWarehouseIds || []), tab === 'prod' ? prods : (u.whProducts || []), tab === 'groups' ? grps : (u.whGroups || [])); onClose(); }} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#D97706] cursor-pointer" data-wh-save>تأیید</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const PermissionMatrix: React.FC<{ users: User[]; departments: Department[]; onUpdateUser: (id: string, updates: Partial<User>) => void }> = ({ users, departments, onUpdateUser }) => {
  const { showToast } = useAppContext();
  const [whDlg, setWhDlg] = useState<{ u: User; tab: 'wh' | 'prod' | 'groups' } | null>(null);
  const [teamDlg, setTeamDlg] = useState<User | null>(null);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [onlyStaff, setOnlyStaff] = useState(false);

  const rows = useMemo(() => {
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => !dept || u.departmentId === dept)
      .filter((u) => !onlyStaff || !isAdminUser(u))
      .filter((u) => matchesAll(u, q))
      .sort((a, b) => Number(isAdminUser(a)) - Number(isAdminUser(b)) || a.fullName.localeCompare(b.fullName, 'fa'));
  }, [users, q, dept, onlyStaff]);

  const people = rows.filter((u) => !isAdminUser(u));
  const toneOf = (menuId: string) => MENUS.find((m) => m.id === menuId)!.tone;
  const menuOpen = (u: User, menuId: string) => {
    const m = MENUS.find((x) => x.id === menuId)!;
    if (m.main) return colOn(u, COLUMNS.find((c) => c.id === m.main!.id)!);
    if (m.id === 'sepidar') return m.subs.some((s) => colOn(u, COLUMNS.find((c) => c.id === s.id)!));
    return true;
  };

  // An administrator can be kept from seeing a menu or a sub-menu too (the ticks of the role itself, the flagged ones, stay)
  const adminEditable = (c: Column) => c.isMain || !c.def;
  const adminOn = (u: User, c: Column) => !(u.hiddenSub || []).includes(adminHideId(c));
  const toggle = (u: User, c: Column) => {
    if (c.id === 'warehouse.groups' && !isAdminUser(u)) {
      setWhDlg({ u, tab: 'groups' }); // a click always opens the window where the groups are chosen
      return;
    }
    if (isAdminUser(u)) {
      const id = adminHideId(c);
      const on = !adminOn(u, c);
      const cur = (u.hiddenSub || []).filter((x) => x !== id);
      onUpdateUser(u.id, { hiddenSub: on ? cur : [...cur, id] });
      showToast(`«${c.label}» برای ${u.fullName} ${on ? 'نمایش داده می‌شود' : 'نمایش داده نمی‌شود'}.`);
      return;
    }
    const on = !colOn(u, c);
    onUpdateUser(u.id, colPatch(u, c, on));
    if (on && c.id === 'warehouse.warehouses') setWhDlg({ u, tab: 'wh' });
    if (on && c.id === 'warehouse.products') setWhDlg({ u, tab: 'prod' });
    if (on && c.id === 'warehouse.groups') setWhDlg({ u, tab: 'groups' });
    if (on && c.id === 'crm.team') setTeamDlg({ ...u, canSeeTeamCrm: true }); // choose whose customers (or «all») right away
    showToast(`«${c.label}» برای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  const rowAll = (u: User, on: boolean) => {
    onUpdateUser(u.id, colPatchMany(u, COLUMNS, on));
    showToast(`همهٔ مجوزهای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  // «مشابه فلانی»: every right of the chosen employee is copied to this one (not his role, not the signature right, not the agent settings)
  const COPY_KEYS = ['canSendOfficialLetters', 'canUseTasks', 'canUseCrm', 'canUseWarranty', 'canSendSms', 'canUseWarehouse', 'canSeeTeamCrm', 'canSeeAllCalls', 'canViewStats', 'canPostAnnouncements', 'sepidarPerms', 'hiddenSub', 'whGroups', 'whWarehouseIds', 'whProducts', 'crmTeamIds', 'crmCustomerIds'] as const;
  const copyFrom = async (u: User, refId: string) => {
    const ref = users.find((x) => x.id === refId);
    if (!ref || ref.id === u.id) return;
    if (!(await askConfirm(`همهٔ مجوزهای «${u.fullName}» مثل «${ref.fullName}» بشود؟ مجوزهای فعلی او با مجوزهای ${ref.fullName} جایگزین می‌شود.`, { tone: 'warning', title: 'کپی مجوزها از یک کارمند', confirmText: 'بله، مثل او بشود' }))) return;
    const patch: Record<string, unknown> = {};
    for (const k of COPY_KEYS) patch[k] = (ref as unknown as Record<string, unknown>)[k] ?? (k.startsWith('can') ? false : []);
    onUpdateUser(u.id, patch as Partial<User>);
    showToast(`مجوزهای ${u.fullName} مثل ${ref.fullName} شد.`);
  };
  const colAll = async (c: Column) => {
    if (people.length === 0) return;
    const every = people.every((u) => colOn(u, c));
    if (!(await askConfirm(`«${c.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شود؟`, { tone: 'warning', title: 'تغییر مجوز برای همه؟', confirmText: 'بله، اعمال شود' }))) return;
    people.forEach((u) => onUpdateUser(u.id, colPatch(u, c, !every)));
    showToast(`«${c.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شد.`);
  };

  const menuCols = MENUS.map((m) => ({ m, cols: COLUMNS.filter((c) => c.menuId === m.id) })).filter((x) => x.cols.length > 0);

  return (
    <div className="space-y-4" data-permission-matrix>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کارمند…" className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none" />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none">
          <option value="">همهٔ واحدها</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-black text-[#3A241F] cursor-pointer">
          <input type="checkbox" checked={onlyStaff} onChange={(e) => setOnlyStaff(e.target.checked)} className="accent-[#6E1B1B]" />
          فقط کارمندان عادی
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-[#8C6F66]">
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-[#6E1B1B] inline-flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>باز است</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md border-2 border-[#D9C7BC] inline-block" />بسته است</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-[#6E1B1B]/30 inline-flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>خود منو بسته است؛ زیرمنو دیده نمی‌شود</span>
        <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" />مدیران همه‌چیز را دارند</span>
        <span>ستون‌ها: اول خود منو، بعد زیرمنوهایش (↳). با کلیک روی نام ستون برای همه تیک زده یا برداشته می‌شود.</span>
      </div>

      {/* wide screens: one table that fits the page (no sideways scrolling): the column titles stand upright */}
      <div className="hidden md:block bg-white rounded-2xl border border-[#EBDBCE] overflow-clip shadow-xs">
        <table className="w-full table-fixed text-right text-xs border-collapse">
          <colgroup>
            <col style={{ width: 168 }} />
            {COLUMNS.map((c) => (
              <col key={c.id} />
            ))}
            <col style={{ width: 104 }} />
          </colgroup>
          {/* the page area has padding (12 / 24 / 32px): the header sticks at minus that, flush with the top edge, so no row shows above it */}
          <thead className="sticky top-[-12px] sm:top-[-24px] lg:top-[-32px] z-20">
            <tr>
              <th rowSpan={2} className="bg-[#FAF5F1] border-b-2 border-b-[#EBDBCE] border-l border-[#EBDBCE] py-3 px-3 text-[11px] font-black text-[#8C6F66]">کارمند</th>
              {menuCols.map(({ m, cols }) =>
                cols.length === 1 ? (
                  // a menu with one column only (no sub-menus): its title stands upright over the whole header height, there is no room for it across
                  <th key={m.id} rowSpan={2} className="border-b border-l-2 border-white/60 px-0 py-2 text-center align-bottom text-white" style={{ background: m.tone }}>
                    <button type="button" title={cols[0].hint} onClick={() => colAll(cols[0])} className="mx-auto block h-[190px] text-[11px] font-black leading-4 cursor-pointer whitespace-nowrap text-white" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {m.title}
                    </button>
                    <div className="mt-2 mx-auto w-5 rounded-md bg-white/20 text-[9px] font-black text-white leading-[18px] mb-1.5" title="چند نفر دارند">{toPersianDigits(people.filter((u) => colOn(u, cols[0])).length)}</div>
                  </th>
                ) : (
                  <th key={m.id} colSpan={cols.length} className="border-b border-l-2 border-white/60 py-2 px-1 text-center text-[10px] font-black text-white leading-4" style={{ background: m.tone }}>
                    {m.title}
                  </th>
                ),
              )}
              <th rowSpan={2} className="bg-[#FAF5F1] border-b border-[#EBDBCE] py-3 px-1 text-[11px] font-black text-[#8C6F66]">همه / هیچ</th>
            </tr>
            <tr className="bg-[#FAF5F1]">
              {menuCols.filter(({ cols }) => cols.length > 1).flatMap(({ m, cols }) =>
                cols.map((c, i) => (
                  <th key={c.id} className={`border-b border-[#EBDBCE] px-0 pt-2 pb-1 text-center align-bottom ${i === 0 ? 'border-r-2 border-r-white' : 'border-l border-l-[#F3E8DF]'}`} style={{ background: c.isMain ? `linear-gradient(${m.tone}14, ${m.tone}14), #FAF5F1` : '#FAF5F1' }}>
                    <button type="button" title={c.hint} onClick={() => colAll(c)} className="mx-auto block h-[190px] text-[10.5px] font-black leading-4 cursor-pointer hover:underline whitespace-nowrap" style={{ color: m.tone, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {c.isMain ? '' : '↳ '}
                      {c.label}
                    </button>
                    <div className="mt-2 mx-auto w-5 rounded-md bg-[#F3E8DF] text-[9px] font-black text-[#8C6F66] leading-[18px] mb-1.5" title="چند نفر دارند">{toPersianDigits(people.filter((u) => colOn(u, c)).length)}</div>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const admin = isAdminUser(u);
              const given = COLUMNS.filter((c) => colOn(u, c)).length;
              return (
                <tr key={u.id} className="border-b border-[#F3E8DF] last:border-0">
                  <td className="bg-white border-l border-[#EBDBCE] py-2 px-3">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{u.fullName}</span>
                    <span className="block text-[10px] font-bold text-[#8C6F66] truncate">{ROLE_LABEL[u.role] || u.role} · {u.departmentName}</span>
                    {!admin && (u.canSeeTeamCrm || u.canUseCrm || (u.crmCustomerIds || []).length > 0) && <TeamCrmChip u={u} users={users} onOpen={() => setTeamDlg(u)} />}
                    {!admin && u.canUseWarehouse && <WhChip u={u} onOpen={(t) => setWhDlg({ u, tab: t })} />}
                  </td>
                  {COLUMNS.map((c) => {
                    const tone = toneOf(c.menuId);
                    const editableAdmin = admin && adminEditable(c);
                    const on = admin ? (editableAdmin ? adminOn(u, c) : true) : colOn(u, c);
                    const dim = !admin && !c.isMain && !menuOpen(u, c.menuId);
                    return (
                      <td key={c.id} className="border-l border-[#F3E8DF] text-center py-1.5 px-0">
                        {admin && !editableAdmin ? (
                          <span title="این مجوز جزو نقش مدیر است" className="inline-flex w-5 h-5 rounded-md items-center justify-center opacity-40" style={{ background: tone }}>
                            <Check className="w-3.5 h-3.5 text-white" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`${c.label} برای ${u.fullName}`}
                            title={dim ? 'خود منو برای این کارمند بسته است' : `${c.label}: ${u.fullName}`}
                            onClick={() => toggle(u, c)}
                            className={`inline-flex w-5 h-5 rounded-md items-center justify-center cursor-pointer border-2 ${dim ? 'opacity-45' : ''}`}
                            style={on ? { background: tone, borderColor: tone } : { background: '#fff', borderColor: '#D9C7BC' }}
                            data-perm={c.id}
                            data-user={u.id}
                          >
                            {on && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-1 text-center">
                    {admin ? (
                      <ShieldCheck className="w-4 h-4 text-[#6E1B1B] inline" />
                    ) : (
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className="inline-flex gap-1">
                          <button type="button" onClick={() => rowAll(u, true)} className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">همه</button>
                          <button type="button" onClick={() => rowAll(u, false)} className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer">هیچ</button>
                        </span>
                        <span className="w-[88px]"><PersonPicker title={`مجوزهای ${u.fullName} مثل چه کسی باشد؟`} items={staffItems(users.filter((x) => x.isActive !== false && x.id !== u.id && !isAdminUser(x)))} value="" onChange={(id) => id && copyFrom(u, id)} emptyLabel="مشابه…" className="!min-h-[22px] !py-0.5 !px-1.5 !text-[10px] !rounded-md" /></span>
                        <span className="text-[9px] font-bold text-[#B8A39C]">{toPersianDigits(given)}/{toPersianDigits(COLUMNS.length)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12">کارمندی پیدا نشد.</div>}
      </div>

      {/* phones: a card per employee, the menus one under the other, no sideways scrolling either */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12 bg-white border border-[#EBDBCE] rounded-2xl">کارمندی پیدا نشد.</div>}
        {rows.map((u) => {
          const admin = isAdminUser(u);
          return (
            <div key={u.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 ${admin ? 'bg-[#6E1B1B]' : 'bg-[#8C6F66]'}`}>{(u.fullName || '؟').trim().slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-[#3A241F] truncate">{u.fullName}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">{ROLE_LABEL[u.role] || u.role} · {u.departmentName}</div>
                </div>
                {admin ? (
                  <span className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B]"><ShieldCheck className="w-4 h-4" />همه‌چیز</span>
                ) : (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => rowAll(u, true)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">همه</button>
                    <button type="button" onClick={() => rowAll(u, false)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer">هیچ</button>
                    <span className="w-[96px]"><PersonPicker title={`مجوزهای ${u.fullName} مثل چه کسی باشد؟`} items={staffItems(users.filter((x) => x.isActive !== false && x.id !== u.id && !isAdminUser(x)))} value="" onChange={(id) => id && copyFrom(u, id)} emptyLabel="مشابه…" className="!text-[11px]" /></span>
                  </span>
                )}
              </div>
              {!admin && (u.canSeeTeamCrm || u.canUseCrm || (u.crmCustomerIds || []).length > 0) && <TeamCrmChip u={u} users={users} onOpen={() => setTeamDlg(u)} />}
                    {!admin && u.canUseWarehouse && <WhChip u={u} onOpen={(t) => setWhDlg({ u, tab: t })} />}
              {!admin &&
                menuCols.map(({ m, cols }) => (
                  <div key={m.id} className="space-y-1.5">
                    <div className="text-[11px] font-black" style={{ color: m.tone }}>{m.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cols.map((c) => {
                        const on = colOn(u, c);
                        const dim = !c.isMain && !menuOpen(u, c.menuId);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggle(u, c)}
                            className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-xl border text-[11px] font-black cursor-pointer ${dim ? 'opacity-50' : ''}`}
                            style={on ? { background: m.tone, borderColor: m.tone, color: '#fff' } : { background: '#fff', borderColor: '#D9C7BC', color: '#6B5650' }}
                          >
                            {on && <Check className="w-3.5 h-3.5" />}
                            {c.isMain ? 'ورود به منو' : c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-6 text-[#8C6F66]">
        برای مدیران هم می‌توانید منو و زیرمنو را تیک بزنید یا بردارید (فقط نمایش آن برایشان). «مدیرعامل / صاحب امضای مجاز» فقط یک نفر است و از «ویرایش کاربر» تعیین می‌شود. هر تیک همان لحظه ذخیره می‌شود و کارمند از تغییر مجوزهایش با یک اعلان باخبر می‌شود. هر منو یا زیرمنوی تازه‌ای که به سامانه اضافه شود، یک ستون در همین جدول می‌گیرد.
      </p>
      {whDlg && <WhDialog u={whDlg.u} tab0={whDlg.tab} onSave={(w, pr, gr) => onUpdateUser(whDlg.u.id, { whWarehouseIds: w, whProducts: pr, whGroups: gr })} onClose={() => setWhDlg(null)} />}
      {teamDlg && <TeamCrmDialog u={teamDlg} users={users} onSave={(ids, customerIds, seesTeam) => onUpdateUser(teamDlg.id, { crmTeamIds: ids, crmCustomerIds: customerIds, canSeeTeamCrm: seesTeam })} onClose={() => setTeamDlg(null)} />}
    </div>
  );
};
