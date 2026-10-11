import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plug, Trash2 } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { api, ApiKeyRow } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { PersonPicker, staffItems } from '../common/PersonPicker';
import { toPersianDigits } from '../../lib/jalali';

const box = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block font-bold text-[#3A241F] mb-1.5';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fa-IR') : '—');

/** Keys for other programs: the administrator decides which program may do what, as which employee, and for how long. */
export const ApiKeysCard: React.FC = () => {
  const { showToast, staffList, currentUser } = useAppContext();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [scopes, setScopes] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [actAs, setActAs] = useState(currentUser.id);
  const [days, setDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api.apiKeys().then((r) => { setKeys(r.keys); setScopes(r.scopes); }).catch(() => showToast('خواندن کلیدها ممکن نشد.'));
  }, [showToast]);
  useEffect(load, [load]);

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const create = async () => {
    setBusy(true);
    try {
      const r = await api.apiKeyCreate({ name: name.trim(), scopes: picked, actAs, expiresDays: days });
      setFresh({ key: r.key, name: name.trim() });
      setCopied(false);
      setName('');
      setPicked([]);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ساخت کلید ممکن نشد.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: ApiKeyRow) => {
    if (!(await askConfirm(`کلید «${k.name}» غیرفعال و حذف شود؟ برنامه‌ای که از آن استفاده می‌کند فوراً دسترسی‌اش را از دست می‌دهد.`, { confirmText: 'بله، کلید حذف شود' }))) return;
    try {
      await api.apiKeyDelete(k.id);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'حذف نشد.');
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh.key);
      setCopied(true);
    } catch {
      showToast('کپی نشد؛ کلید را با ماوس انتخاب و کپی کنید.');
    }
  };

  const base = window.location.origin;

  return (
    <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-5 text-xs" data-api-keys>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shrink-0">
          <Plug className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-sm text-[#3A241F]">اتصال برنامه‌های دیگر (API)</h3>
          <p className="text-[#8C6F66] leading-6 mt-0.5">برای هر برنامه یک کلید جدا بسازید و دقیقاً مشخص کنید چه کاری می‌تواند بکند. هر زمان بخواهید کلید را حذف کنید، همان لحظه دسترسی برنامه قطع می‌شود.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-4 space-y-3">
        <div className="font-black text-[#3A241F]">ساخت کلید تازه</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lab}>نام برنامه</label>
            <input className={box} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: سایت فروشگاه" />
          </div>
          <div>
            <label className={lab}>به نام کدام همکار کار کند؟</label>
            <PersonPicker title="همکار" items={staffItems(staffList.filter((u) => u.isActive))} value={actAs} onChange={setActAs} />
            <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">هر مشتری یا فرصتی که این برنامه ثبت کند، مال همین همکار است و همان دسترسی‌های او را دارد.</p>
          </div>
        </div>
        <div>
          <label className={lab}>این برنامه چه کارهایی بتواند بکند؟</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(scopes).map(([k, label]) => (
              <label key={k} className={`flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] rounded-xl border cursor-pointer ${picked.includes(k) ? 'bg-[#F6D9CD] border-[#C98B6A]' : 'bg-white border-[#EBDBCE]'}`}>
                <input type="checkbox" className="w-5 h-5 accent-[#6E1B1B] shrink-0" checked={picked.includes(k)} onChange={() => toggle(k)} />
                <span className="font-bold text-[#3A241F]">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className={lab}>مدت اعتبار کلید</label>
            <div className="flex flex-wrap gap-2">
              {[[0, 'بدون انقضا'], [30, '۳۰ روز'], [90, '۹۰ روز'], [365, 'یک سال']].map(([d, l]) => (
                <button key={d} type="button" onClick={() => setDays(d as number)} className={`px-3 py-2 min-h-[40px] rounded-xl border text-[11px] font-black cursor-pointer ${days === d ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{l}</button>
              ))}
            </div>
          </div>
          <button type="button" disabled={busy || !name.trim() || picked.length === 0} onClick={create} className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#3A241F] hover:bg-[#6E1B1B] text-white font-black disabled:opacity-50 cursor-pointer">
            <KeyRound className="w-4 h-4" />
            ساخت کلید
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-black text-[#3A241F]">کلیدهای ساخته‌شده ({toPersianDigits(keys.length)})</div>
        {keys.length === 0 && <div className="py-6 text-center text-[#8C6F66] font-bold bg-[#FAF5F1] rounded-2xl border border-dashed border-[#EBDBCE]">هنوز کلیدی نساخته‌اید.</div>}
        {keys.map((k) => (
          <div key={k.id} className="rounded-2xl border border-[#EBDBCE] p-3.5 flex flex-col sm:flex-row sm:items-center gap-3" data-api-key-row>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black text-[#3A241F] text-sm">{k.name}</span>
                <span data-keep-digits className="font-mono text-[10px] text-[#8C6F66] bg-[#FAF5F1] border border-[#EBDBCE] rounded-md px-1.5 py-0.5" dir="ltr">{k.prefix}…</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {k.scopes.map((s) => <span key={s} className="text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-200 rounded-full px-2 py-0.5">{scopes[s] || s}</span>)}
              </div>
              <div className="text-[10px] text-[#8C6F66] leading-5">
                به نام: <b className="text-[#3A241F]">{k.actAsName || '—'}</b> · ساخته‌شده: {day(k.createdAt)} · آخرین استفاده: {day(k.lastUsedAt)} · {toPersianDigits(k.uses)} درخواست · انقضا: {k.expiresAt ? day(k.expiresAt) : 'ندارد'}
              </div>
            </div>
            <button type="button" onClick={() => revoke(k)} className="flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-rose-700 bg-rose-50 border border-rose-200 font-black cursor-pointer">
              <Trash2 className="w-4 h-4" />
              حذف کلید
            </button>
          </div>
        ))}
      </div>

      <details className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-4">
        <summary className="font-black text-[#3A241F] cursor-pointer">راهنمای برنامه‌نویس (آدرس‌ها و نمونه)</summary>
        <div className="mt-3 space-y-3 leading-6 text-[#3A241F]">
          <p>برنامهٔ دیگر در هر درخواست، کلید را در سرآیند زیر می‌فرستد:</p>
          <pre dir="ltr" className="bg-[#3A241F] text-[#F6D9CD] rounded-xl p-3 overflow-x-auto text-[11px] text-left">Authorization: Bearer hk_...</pre>
          <p>نمونهٔ آزمایش اتصال:</p>
          <pre dir="ltr" className="bg-[#3A241F] text-[#F6D9CD] rounded-xl p-3 overflow-x-auto text-[11px] text-left">{`curl ${base}/api/ext/v1/ping -H "Authorization: Bearer hk_..."`}</pre>
          <p>ثبت یک مشتری تازه:</p>
          <pre dir="ltr" className="bg-[#3A241F] text-[#F6D9CD] rounded-xl p-3 overflow-x-auto text-[11px] text-left">{`curl -X POST ${base}/api/ext/v1/customers \\
  -H "Authorization: Bearer hk_..." -H "Content-Type: application/json" \\
  -d '{"name":"علی رضایی","phones":["09121234567"],"company":"شرکت نمونه"}'`}</pre>
          <p>آدرس‌ها (همه با پیشوند <span dir="ltr" className="font-mono">/api/ext/v1</span>):</p>
          <div dir="ltr" className="font-mono text-[11px] bg-white border border-[#EBDBCE] rounded-xl p-3 space-y-1 text-left overflow-x-auto">
            <div>GET /ping</div>
            <div>GET /customers?q=&phone=&limit=&offset=</div>
            <div>GET /customers/&#123;id&#125;</div>
            <div>POST /customers</div>
            <div>PUT /customers/&#123;id&#125;</div>
            <div>GET /deals?customerId=</div>
            <div>POST /deals</div>
            <div>POST /customers/&#123;id&#125;/notes</div>
          </div>
          <p className="text-[#8C6F66]">هر کلید در هر دقیقه حداکثر ۱۲۰ درخواست می‌تواند بفرستد. اگر کلید اجازهٔ کاری را نداشته باشد، پاسخ ۴۰۳ می‌گیرد و اگر کلید معتبر نباشد یا منقضی شده باشد، ۴۰۱.</p>
        </div>
      </details>

      {fresh && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => e.stopPropagation()}>
          <div dir="rtl" className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-[#EBDBCE] p-5 space-y-3 text-right">
            <h3 className="font-black text-sm text-[#3A241F]">کلید «{fresh.name}» ساخته شد</h3>
            <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 font-bold leading-6">این کلید فقط همین یک‌بار نمایش داده می‌شود. همین حالا آن را کپی کنید و در برنامهٔ دیگر بگذارید؛ بعداً قابل دیدن نیست (اگر گم شد، کلید تازه بسازید).</p>
            <div dir="ltr" className="font-mono text-[12px] bg-[#3A241F] text-[#F6D9CD] rounded-xl p-3 break-all select-all text-left" data-api-key-secret data-keep-digits>{fresh.key}</div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={copy} className="flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-[#6E1B1B] text-white font-black cursor-pointer">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'کپی شد' : 'کپی کلید'}
              </button>
              <button type="button" onClick={() => setFresh(null)} className="px-5 py-2 min-h-[40px] rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] font-black text-[#3A241F] cursor-pointer">کپی کردم، بستن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
