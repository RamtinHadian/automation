import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, FilePlus2, Hammer, Printer, Search, Settings2, ShieldCheck, ShieldOff, Timer } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { todayIso } from '../../lib/taskDates';
import { CLAIM_STATUS, COVERAGE_TEXT, dayText, daysBetween, isOpenClaim, remainingText, SOON_DAYS, STATE_LABEL, warrantyState, WarrantyState, codeText } from '../../lib/warranty';
import { Warranty, WarrantyClaim, WarrantySettings } from '../../types';
import { C, ChartCard, Donut, HBars, Kpi } from '../admin/charts';
import { Modal, field, label } from '../crm/crmUi';
import { ClaimDetail } from './ClaimDetail';
import { printCertificate } from './certificate';
import { ClaimForm, WarrantyForm } from './WarrantyForms';

type Tab = 'overview' | 'warranties' | 'claims' | 'settings';
const DEFAULT_SETTINGS: WarrantySettings = { defaultMonths: 12, terms: '' };

/** Shrinks a picked stamp/signature picture to at most 420 px (keeps transparency) so it stays small. */
const shrinkImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 420 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });

/** The warranty menu: sold warranties, customers' claims with their whole history, a printable certificate and the numbers. */
export const WarrantyView: React.FC = () => {
  const { customers, staffList, currentUser, showToast, settings } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const [tab, setTab] = useState<Tab>('overview');
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [claims, setClaims] = useState<WarrantyClaim[]>([]);
  const [wset, setWset] = useState<WarrantySettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [editing, setEditing] = useState<{ w: Warranty | null; customerId?: string } | null>(null);
  const [claimFor, setClaimFor] = useState<string | null | undefined>(undefined); // undefined = closed, '' = choose
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Warranty | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | WarrantyState>('ALL');
  const [claimFilter, setClaimFilter] = useState<'OPEN' | 'ALL' | 'DONE'>('OPEN');
  const [terms, setTerms] = useState('');
  const [months, setMonths] = useState('12');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [stamp, setStamp] = useState('');
  const [signature, setSignature] = useState('');

  const load = useCallback(() => {
    api
      .warrantyList()
      .then((r) => {
        setWarranties(r.warranties);
        setClaims(r.claims);
        setWset(r.settings);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    setTerms(wset.terms);
    setMonths(String(wset.defaultMonths));
    setSignerName(wset.signerName || '');
    setSignerTitle(wset.signerTitle || '');
    setStamp(wset.stampImage || '');
    setSignature(wset.signatureImage || '');
  }, [wset]);

  // opened from a notification, or from a customer's page («ثبت گارانتی»)
  useEffect(() => {
    const go = () => {
      try {
        const raw = sessionStorage.getItem('warranty_open');
        if (!raw) return;
        sessionStorage.removeItem('warranty_open');
        const o = JSON.parse(raw) as { type: string; id?: string; customerId?: string };
        if (o.type === 'claim' && o.id) {
          setTab('claims');
          setClaimFilter('ALL');
          setOpenClaim(o.id);
        } else if (o.type === 'new') {
          setTab('warranties');
          setEditing({ w: null, customerId: o.customerId });
        } else if (o.type === 'customer') {
          setTab('warranties');
          setQ(o.customerId ? customers.find((c) => c.id === o.customerId)?.name || '' : '');
        }
      } catch {
        /* ignore */
      }
    };
    go();
    window.addEventListener('open-warranty-item', go);
    return () => window.removeEventListener('open-warranty-item', go);
  }, [customers]);

  const today = todayIso();
  const staff = useMemo(() => staffList.filter((u) => u.isActive && (u.canUseWarranty || u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN')), [staffList]);
  const company = settings?.proformaCompanyName || settings?.companyName || 'هورمند';

  const stats = useMemo(() => {
    const states = warranties.map((w) => warrantyState(w, today));
    const open = claims.filter(isOpenClaim);
    const done = claims.filter((c) => c.closedAt);
    const days = done.map((c) => Math.max(0, daysBetween(c.createdAt.slice(0, 10), c.closedAt!.slice(0, 10))));
    const byProduct = new Map<string, number>();
    for (const c of claims) byProduct.set(c.productName, (byProduct.get(c.productName) || 0) + 1);
    return {
      active: states.filter((s) => s === 'ACTIVE' || s === 'SOON').length,
      soon: warranties.filter((w, i) => states[i] === 'SOON').sort((a, b) => a.endDate.localeCompare(b.endDate)),
      open,
      outOfWarranty: claims.filter((c) => c.coverage !== 'IN').length,
      avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      byProduct: [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      byStatus: (Object.keys(CLAIM_STATUS) as (keyof typeof CLAIM_STATUS)[]).map((k) => ({ k, n: claims.filter((c) => c.status === k).length })),
    };
  }, [warranties, claims, today]);

  const shownWarranties = useMemo(() => {
    const t = q.trim().toLowerCase();
    return warranties.filter((w) => {
      if (stateFilter !== 'ALL' && warrantyState(w, today) !== stateFilter) return false;
      return !t || `${w.warrantyNo} ${w.customerName} ${w.productName} ${w.productCode || ''} ${w.serial || ''} ${w.invoiceNumber || ''}`.toLowerCase().includes(t);
    });
  }, [warranties, q, stateFilter, today]);
  const shownClaims = useMemo(() => {
    const t = q.trim().toLowerCase();
    return claims.filter((c) => {
      if (claimFilter === 'OPEN' && !isOpenClaim(c)) return false;
      if (claimFilter === 'DONE' && isOpenClaim(c)) return false;
      return !t || `${c.claimNo} ${c.warrantyNo} ${c.customerName} ${c.productName} ${c.serial || ''} ${c.description}`.toLowerCase().includes(t);
    });
  }, [claims, q, claimFilter]);

  const claimCount = (w: Warranty) => claims.filter((c) => c.warrantyId === w.id).length;
  const fail = (m: string) => showToast(m);

  const doVoid = async () => {
    if (!voiding) return;
    try {
      await api.warrantyVoid(voiding.id, voidReason.trim());
      setVoiding(null);
      setVoidReason('');
      showToast('گارانتی باطل شد.');
      load();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'باطل نشد.');
    }
  };

  const tabs: [Tab, string, React.ElementType][] = [
    ['overview', 'خلاصه', ShieldCheck],
    ['warranties', 'گارانتی‌های ثبت‌شده', ClipboardList],
    ['claims', 'درخواست‌های خرابی', Hammer],
    ...(isAdmin ? ([['settings', 'تنظیمات', Settings2]] as [Tab, string, React.ElementType][]) : []),
  ];

  const warrantyCard = (w: Warranty) => {
    const s = warrantyState(w, today);
    const st = STATE_LABEL[s];
    const n = claimCount(w);
    return (
      <div key={w.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-2 text-right" data-warranty-card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{w.productName}</div>
            <div className="text-[11px] text-[#8C6F66] truncate">{w.customerName}</div>
          </div>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
        </div>
        <div className="text-[11px] font-bold text-[#503730] leading-6">
          <div><span className="text-[#8C6F66] font-medium">شمارهٔ گارانتی: </span>{codeText(w.warrantyNo)}</div>
          {w.serial && <div><span className="text-[#8C6F66] font-medium">سریال: </span><span dir="ltr">{toPersianDigits(w.serial)}</span></div>}
          <div><span className="text-[#8C6F66] font-medium">از </span>{dayText(w.startDate)}<span className="text-[#8C6F66] font-medium"> تا </span>{dayText(w.endDate)}</div>
          <div className={s === 'SOON' ? 'text-amber-700' : s === 'ACTIVE' ? 'text-emerald-700' : 'text-[#8C6F66]'}>{remainingText(w, today)}{n > 0 && ` · ${toPersianDigits(n)} درخواست خرابی`}</div>
          {w.status === 'VOID' && w.voidReason && <div className="text-rose-700">دلیل باطل‌شدن: {w.voidReason}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button type="button" onClick={() => (printCertificate(w, wset, company) ? null : fail('پنجرهٔ چاپ باز نشد؛ اجازهٔ باز شدن پنجره را بدهید.'))} className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer"><Printer className="w-3.5 h-3.5" />گواهی</button>
          {w.status !== 'VOID' && (
            <>
              <button type="button" onClick={() => setClaimFor(w.id)} className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-teal-50 border border-teal-200 text-[11px] font-black text-teal-800 cursor-pointer"><Hammer className="w-3.5 h-3.5" />ثبت خرابی</button>
              {(isAdmin || w.createdById === currentUser.id) && (
                <>
                  <button type="button" onClick={() => setEditing({ w })} className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer">ویرایش</button>
                  <button type="button" onClick={() => { setVoiding(w); setVoidReason(''); }} className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-rose-200 text-[11px] font-black text-rose-700 cursor-pointer"><ShieldOff className="w-3.5 h-3.5" />باطل</button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const claimCard = (c: WarrantyClaim) => {
    const st = CLAIM_STATUS[c.status];
    return (
      <button key={c.id} type="button" onClick={() => setOpenClaim(c.id)} className="w-full text-right bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-1.5 hover:shadow-md transition-all cursor-pointer" data-claim-card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{c.productName}</div>
            <div className="text-[11px] text-[#8C6F66] truncate">{c.customerName} · {codeText(c.claimNo)}</div>
          </div>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
        </div>
        <p className="text-[11px] leading-5 text-[#503730] line-clamp-2">{c.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-[#8C6F66]">
          <span>{dayText(c.reportedAt)}</span>
          {c.handlerName && <span>مسئول: {c.handlerName}</span>}
          {c.coverage !== 'IN' && <span className="text-rose-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{COVERAGE_TEXT[c.coverage]}</span>}
        </div>
      </button>
    );
  };

  const tabBtn = ([id, text, Icon]: [Tab, string, React.ElementType]) => (
    <button key={id} type="button" onClick={() => { setTab(id); setQ(''); }} className={`flex-1 basis-[45%] sm:basis-auto sm:flex-initial min-h-[44px] sm:min-h-0 whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${tab === id ? 'bg-white text-teal-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>
      <Icon className="w-4 h-4" />
      {text}
      {id === 'claims' && stats.open.length > 0 && <span className="bg-amber-500 text-white text-[10px] rounded-full px-1.5">{toPersianDigits(stats.open.length)}</span>}
    </button>
  );

  const searchBox = (
    <div className="relative flex-1 min-w-[200px]">
      <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی مشتری، کالا، سریال، شمارهٔ گارانتی یا فاکتور…" className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs outline-hidden focus:ring-2 focus:ring-teal-500/20" />
    </div>
  );

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-32 sm:pb-8 select-none overflow-x-hidden" data-warranty-view>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">گارانتی</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">گارانتی کالاهای فروخته‌شده، درخواست‌های خرابی و پیگیری آن‌ها تا تحویل به مشتری.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button type="button" onClick={() => setClaimFor('')} className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 text-xs font-black cursor-pointer"><Hammer className="w-4 h-4" />ثبت خرابی</button>
          <button type="button" onClick={() => setEditing({ w: null })} className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-md shadow-teal-600/25 cursor-pointer"><FilePlus2 className="w-4 h-4" />ثبت گارانتی جدید</button>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 sm:overflow-x-auto">{tabs.map(tabBtn)}</div>

      {failed && !loaded && <div className="py-16 text-center text-xs font-bold text-rose-600">دریافت گارانتی‌ها ممکن نشد؛ اتصال یا دسترسی را بررسی کنید.</div>}
      {!loaded && !failed && <div className="py-16 text-center text-xs font-bold text-gray-400">در حال بارگذاری…</div>}

      {loaded && tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi accent={C.green} icon={<ShieldCheck className="w-5 h-5" />} label="گارانتی فعال" value={toPersianDigits(stats.active)} sub={`از ${toPersianDigits(warranties.length)} گارانتی ثبت‌شده`} />
            <Kpi accent={C.orange} icon={<Timer className="w-5 h-5" />} label={`پایان در ${toPersianDigits(SOON_DAYS)} روز آینده`} value={toPersianDigits(stats.soon.length)} sub={stats.soon.length ? 'فرصتی برای پیگیری فروش دوباره' : undefined} />
            <Kpi accent={C.red} icon={<Hammer className="w-5 h-5" />} label="درخواست خرابی باز" value={toPersianDigits(stats.open.length)} sub={stats.outOfWarranty ? `${toPersianDigits(stats.outOfWarranty)} مورد خارج از گارانتی (کل)` : undefined} />
            <Kpi accent={C.blue} icon={<ClipboardList className="w-5 h-5" />} label="میانگین زمان حل (روز)" value={stats.avgDays === null ? '—' : toPersianDigits(stats.avgDays)} sub={`${toPersianDigits(claims.length)} درخواست در کل`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="کدام کالاها بیشتر گارانتی خورده‌اند؟" subtitle="تعداد درخواست خرابی برای هر کالا">
              <HBars empty="هنوز درخواست خرابی ثبت نشده است." rows={stats.byProduct.map(([name, n]) => ({ label: name, segments: [{ value: n, color: C.red, name: 'درخواست' }] }))} />
            </ChartCard>
            <ChartCard title="وضعیت درخواست‌ها" subtitle="همهٔ درخواست‌های ثبت‌شده">
              <Donut centerLabel="درخواست" data={stats.byStatus.filter((s) => s.n > 0).map((s, i) => ({ label: CLAIM_STATUS[s.k].label, value: s.n, color: [C.blue, C.yellow, C.violet, C.red, C.green, C.magenta][i % 6] }))} />
            </ChartCard>
          </div>
          {stats.soon.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#EBDBCE] overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 font-black text-[12px] text-amber-900">گارانتی‌هایی که به‌زودی تمام می‌شوند</div>
              <div className="divide-y divide-[#EBDBCE]/60">
                {stats.soon.slice(0, 8).map((w) => (
                  <div key={w.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-black text-[#3A241F]">{w.productName} · {w.customerName}</span>
                    <span className="font-bold text-amber-700">{dayText(w.endDate)} ({remainingText(w, today)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.open.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-black text-xs text-[#3A241F]">درخواست‌های منتظر اقدام</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{stats.open.slice(0, 6).map(claimCard)}</div>
            </div>
          )}
        </div>
      )}

      {loaded && tab === 'warranties' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {searchBox}
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as 'ALL' | WarrantyState)} className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-[11px] font-black text-[#3A241F] outline-hidden cursor-pointer">
              <option value="ALL">همهٔ وضعیت‌ها</option>
              <option value="ACTIVE">فعال</option>
              <option value="SOON">نزدیک به پایان</option>
              <option value="EXPIRED">پایان‌یافته</option>
              <option value="VOID">باطل‌شده</option>
            </select>
          </div>
          {shownWarranties.length === 0 ? (
            <div className="text-center text-xs font-bold text-gray-400 py-14 bg-white border border-[#EBDBCE] rounded-3xl">{warranties.length === 0 ? 'هنوز گارانتی‌ای ثبت نشده است. با «ثبت گارانتی جدید» شروع کنید.' : 'گارانتی‌ای با این جستجو پیدا نشد.'}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{shownWarranties.map(warrantyCard)}</div>
          )}
        </div>
      )}

      {loaded && tab === 'claims' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {searchBox}
            <div className="flex gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1">
              {([['OPEN', 'باز'], ['DONE', 'پایان‌یافته'], ['ALL', 'همه']] as const).map(([id, text]) => (
                <button key={id} type="button" onClick={() => setClaimFilter(id)} className={`px-3.5 py-1.5 min-h-[36px] rounded-xl text-[11px] font-black cursor-pointer ${claimFilter === id ? 'bg-white text-teal-700 shadow-2xs' : 'text-[#8C6F66]'}`}>{text}</button>
              ))}
            </div>
          </div>
          {shownClaims.length === 0 ? (
            <div className="text-center text-xs font-bold text-gray-400 py-14 bg-white border border-[#EBDBCE] rounded-3xl">درخواستی با این فیلتر پیدا نشد.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{shownClaims.map(claimCard)}</div>
          )}
        </div>
      )}

      {loaded && tab === 'settings' && isAdmin && (
        <div className="bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-4 max-w-2xl">
          <div>
            <label className={label}>مدت پیش‌فرض گارانتی (ماه)</label>
            <input className={`${field} !w-28`} inputMode="numeric" value={toPersianDigits(months)} onChange={(e) => setMonths(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, ''))} />
          </div>
          <div>
            <label className={label}>شرایط گارانتی (روی گواهی چاپ می‌شود؛ هر خط یک بند)</label>
            <textarea className={`${field} min-h-[140px] leading-7`} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>
          <div className="border-t border-[#EBDBCE] pt-4 space-y-3">
            <div className="text-xs font-black text-[#3A241F]">مهر و امضای دیجیتال (روی گواهی چاپ می‌شود)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>نام امضاکننده</label>
                <input className={field} value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              <div>
                <label className={label}>سمت</label>
                <input className={field} value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} placeholder="مثلاً مدیر فروش" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([['مهر شرکت', stamp, setStamp], ['امضا', signature, setSignature]] as const).map(([title, value, set]) => (
                <div key={title} className="border border-[#EBDBCE] rounded-2xl p-3 text-center space-y-2">
                  <div className="text-[11px] font-black text-[#8C6F66]">{title}</div>
                  <div className="h-24 flex items-center justify-center bg-[#FAF5F1] rounded-xl">
                    {value ? <img src={value} alt="" className="max-h-20 max-w-full" /> : <span className="text-[10px] font-bold text-gray-400">{title === 'مهر شرکت' ? 'بدون تصویر، مهر خودکار ساخته می‌شود' : 'بدون تصویر، فقط نام چاپ می‌شود'}</span>}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <label className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] text-[11px] font-black cursor-pointer flex items-center">
                      انتخاب تصویر
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { set(await shrinkImage(f)); } catch { fail('تصویر خوانده نشد.'); } } }} />
                    </label>
                    {value && <button type="button" onClick={() => set('')} className="px-3 py-1.5 min-h-[36px] rounded-lg text-[11px] font-black text-red-600 cursor-pointer">حذف</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] font-bold text-[#8C6F66] leading-5">بهتر است تصویر مهر و امضا با پس‌زمینهٔ شفاف (PNG) باشد. در چاپ گواهی گزینهٔ «مهر و امضای دیجیتال» را می‌توان روشن یا خاموش کرد.</div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                setWset(await api.warrantySaveSettings({ defaultMonths: parseInt(months, 10) || 12, terms, signerName, signerTitle, stampImage: stamp, signatureImage: signature }));
                showToast('تنظیمات گارانتی ذخیره شد.');
              } catch (e) {
                fail(e instanceof Error ? e.message : 'ذخیره نشد.');
              }
            }}
            className="px-6 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer"
          >
            ذخیرهٔ تنظیمات
          </button>
        </div>
      )}

      {editing && (
        <WarrantyForm
          initial={editing.w}
          presetCustomerId={editing.customerId}
          customers={customers}
          settings={wset}
          onClose={() => setEditing(null)}
          onError={fail}
          onSaved={(w) => {
            setEditing(null);
            showToast(editing.w ? 'گارانتی ذخیره شد.' : `گارانتی ${codeText(w.warrantyNo)} ثبت شد.`);
            load();
          }}
        />
      )}
      {claimFor !== undefined && (
        <ClaimForm
          warranties={warranties}
          presetWarrantyId={claimFor || undefined}
          staff={staff}
          onClose={() => setClaimFor(undefined)}
          onError={fail}
          onSaved={() => {
            setClaimFor(undefined);
            setTab('claims');
            setClaimFilter('OPEN');
            showToast('درخواست گارانتی ثبت شد.');
            load();
          }}
        />
      )}
      {openClaim && claims.find((c) => c.id === openClaim) && (
        <ClaimDetail
          claim={claims.find((c) => c.id === openClaim)!}
          isAdmin={isAdmin}
          staff={staff}
          onClose={() => setOpenClaim(null)}
          onError={fail}
          onChange={(c) => {
            setClaims((list) => list.map((x) => (x.id === c.id ? c : x)));
            load();
          }}
        />
      )}
      {voiding && (
        <Modal
          title={`باطل‌کردن گارانتی ${codeText(voiding.warrantyNo)}`}
          onClose={() => setVoiding(null)}
          onTop
          footer={
            <>
              <button type="button" onClick={() => setVoiding(null)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              <button type="button" onClick={doVoid} disabled={!voidReason.trim()} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 cursor-pointer">باطل شود</button>
            </>
          }
        >
          <p className="text-xs leading-7 text-[#503730]">گارانتی حذف نمی‌شود؛ فقط «باطل» علامت می‌خورد و با دلیلش در فهرست می‌ماند. برای کالای <b>{voiding.productName}</b> ({voiding.customerName}).</p>
          <div>
            <label className={label}>دلیل باطل‌کردن *</label>
            <textarea className={`${field} min-h-[72px] leading-6`} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="مثلاً: اشتباه ثبت شده، فاکتور برگشت خورده" />
          </div>
        </Modal>
      )}
    </div>
  );
};
