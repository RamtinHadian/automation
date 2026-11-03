import React, { useMemo, useState } from 'react';
import { Tags, X } from 'lucide-react';
import { Customer } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { normText } from '../../lib/customerImport';
import { askConfirm } from '../../lib/confirmDialog';

type Kind = 'PERSON' | 'COMPANY' | 'SHOP';
const KIND_FA: Record<Kind, string> = { PERSON: 'حقیقی', COMPANY: 'حقوقی', SHOP: 'فروشگاه' };
const KIND_CLS: Record<Kind, string> = { PERSON: 'bg-sky-50 text-sky-800 border-sky-200', COMPANY: 'bg-indigo-50 text-indigo-800 border-indigo-200', SHOP: 'bg-orange-50 text-orange-800 border-orange-200' };

const COMPANY_WORD = /^(شرکت|موسسه|مؤسسه|سازمان|گروه|کارخانه|بنیاد|اتحادیه|تعاونی|co\b|company)/i;
const SHOP_WORD = /(فروشگاه|مغازه|نمایشگاه|سوپرمارکت|پاساژ)/;

/**
 * What the customer's own data says about his kind (nothing is guessed from thin air: a customer with no sign stays as he is).
 * Returns the kind and the reason in words, or null when there is nothing to say or it already is that kind.
 */
export const suggestKind = (c: Customer): { to: Kind; why: string } | null => {
  const name = normText(c.name);
  let to: Kind | null = null;
  let why = '';
  if (COMPANY_WORD.test(name)) { to = 'COMPANY'; why = 'نام با «شرکت / سازمان / موسسه…» شروع می‌شود'; }
  else if (SHOP_WORD.test(name)) { to = 'SHOP'; why = 'در نام «فروشگاه / مغازه / نمایشگاه» آمده'; }
  else if (c.shopType || c.licenseNumber) { to = 'SHOP'; why = 'نوع فروشگاه یا پروانهٔ کسب ثبت شده'; }
  else if ((c.nationalId && String(c.nationalId).length === 11) || c.economicCode || c.registrationNumber || c.companyType) { to = 'COMPANY'; why = 'شناسهٔ ملی، کد اقتصادی، شمارهٔ ثبت یا نوع شرکت ثبت شده'; }
  if (!to) return null;
  if ((c.kind || 'PERSON') === to) return null;
  return { to, why };
};

/** What changes with the kind: the kind itself, and the name of the company where it is empty. */
const patchFor = (c: Customer, to: Kind): Partial<Customer> => {
  const p: Partial<Customer> = { kind: to };
  if (to !== 'PERSON' && !c.company) p.company = c.name;
  return p;
};

/**
 * «اصلاح نوع مشتریان»: looks at every customer and lists those whose kind (حقیقی / حقوقی / فروشگاه) does not fit what his own data says.
 * Nothing is ticked from the start; only what is ticked is changed, after one question.
 */
export const KindFixModal: React.FC<{
  customers: Customer[];
  onApply: (patches: { id: string; patch: Partial<Customer> }[]) => void;
  onClose: () => void;
}> = ({ customers, onApply, onClose }) => {
  const list = useMemo(() => {
    const out: { c: Customer; to: Kind; why: string }[] = [];
    for (const c of customers) {
      if (c.contactType) continue; // phone-book entries are not customers
      const s = suggestKind(c);
      if (s) out.push({ c, ...s });
    }
    return out;
  }, [customers]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [only, setOnly] = useState<'ALL' | Kind>('ALL');
  const [lim, setLim] = useState(100);
  const shown = list.filter((x) => only === 'ALL' || x.to === only);
  const picked = list.filter((x) => sel[x.c.id]);
  const count = (k: Kind) => list.filter((x) => x.to === k).length;
  const setMany = (ids: string[], on: boolean) => setSel((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, on])) }));

  const apply = async () => {
    if (!picked.length) return;
    const ok = await askConfirm(`نوع ${toPersianDigits(picked.length)} مشتری همین حالا عوض می‌شود (${(['COMPANY', 'SHOP', 'PERSON'] as Kind[]).map((k) => [k, picked.filter((x) => x.to === k).length] as const).filter(([, n]) => n > 0).map(([k, n]) => `${toPersianDigits(n)} به ${KIND_FA[k]}`).join('، ')}). مطمئن هستید؟`, { tone: 'warning', title: 'تأیید تغییر نوع مشتریان', confirmText: 'بله، عوض شود' });
    if (!ok) return;
    onApply(picked.map((x) => ({ id: x.c.id, patch: patchFor(x.c, x.to) })));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right" data-kind-fix>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Tags className="w-4 h-4 text-violet-700" />اصلاح نوع مشتریان (حقیقی، حقوقی، فروشگاه)</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <p className="text-[11.5px] font-bold text-[#8C6F66] leading-6">
            هورمند اطلاعات هر مشتری را می‌خواند و جاهایی که نوعش با آن نمی‌خواند پیشنهاد می‌دهد؛ مثلاً نامی که با «شرکت» شروع می‌شود ولی «حقیقی» ثبت شده، یا «فروشگاه» در نام، یا شناسهٔ ملی و کد اقتصادی. هیچ‌چیز از پیش تیک نخورده؛ فقط تیک‌خورده‌ها بعد از یک تأیید عوض می‌شوند. مشتری‌ای که نشانه‌ای ندارد دست نمی‌خورد.
          </p>
          {list.length === 0 ? (
            <div className="text-center text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl py-8">همهٔ مشتری‌ها با اطلاعاتشان هم‌خوانند؛ پیشنهادی نیست.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black" data-kind-fix-tabs>
                {([['ALL', 'همه', list.length], ['COMPANY', 'پیشنهاد حقوقی', count('COMPANY')], ['SHOP', 'پیشنهاد فروشگاه', count('SHOP')], ['PERSON', 'پیشنهاد حقیقی', count('PERSON')]] as const).filter(([k, , n]) => k === 'ALL' || n > 0).map(([k, t, n]) => (
                  <button key={k} type="button" onClick={() => { setOnly(k); setLim(100); }} className={`px-3 py-1.5 rounded-xl border cursor-pointer ${only === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{t} ({toPersianDigits(n)})</button>
                ))}
                <span className="flex-1" />
                <button type="button" onClick={() => setMany(shown.map((x) => x.c.id), true)} className="px-2.5 py-1.5 rounded-lg bg-white border border-violet-300 text-violet-800 cursor-pointer">همهٔ این فهرست را تیک بزن</button>
                <button type="button" onClick={() => setMany(shown.map((x) => x.c.id), false)} className="px-2.5 py-1.5 rounded-lg bg-white border border-violet-300 text-violet-800 cursor-pointer">هیچ‌کدام</button>
              </div>
              <div className="space-y-1.5">
                {shown.slice(0, lim).map(({ c, to, why }) => (
                  <label key={c.id} className={`flex items-start gap-2.5 rounded-xl border px-2.5 py-2 cursor-pointer ${sel[c.id] ? 'bg-white border-violet-400' : 'bg-white/60 border-[#EBDBCE]'}`} data-kind-fix-row>
                    <input type="checkbox" className="mt-1.5 w-4 h-4 accent-violet-600" checked={!!sel[c.id]} onChange={(e) => setSel((m) => ({ ...m, [c.id]: e.target.checked }))} />
                    <span className="flex-1 min-w-0 text-[11.5px] leading-6">
                      <span className="font-black text-[#3A241F]">{c.name}</span>
                      <span className="mr-1 inline-flex items-center gap-1 align-middle">
                        <span className={`text-[9.5px] font-black rounded-full px-1.5 border ${KIND_CLS[(c.kind || 'PERSON') as Kind]}`}>{KIND_FA[(c.kind || 'PERSON') as Kind]}</span>
                        <span className="text-[#8C6F66]">←</span>
                        <span className={`text-[9.5px] font-black rounded-full px-1.5 border ${KIND_CLS[to]}`}>{KIND_FA[to]}</span>
                      </span>
                      <span className="block text-[10px] font-bold text-[#8C6F66]">{why}</span>
                    </span>
                  </label>
                ))}
                {shown.length > lim && (
                  <button type="button" onClick={() => setLim((l) => l + 100)} className="w-full py-1.5 rounded-lg bg-white border border-[#EBDBCE] text-[10.5px] font-black text-[#3A241F] cursor-pointer">نمایش {toPersianDigits(Math.min(100, shown.length - lim))} مورد بیشتر</button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
          <button type="button" disabled={!picked.length} onClick={apply} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer" data-kind-fix-apply>
            عوض‌کردن نوع {toPersianDigits(picked.length)} مشتری
          </button>
        </div>
      </div>
    </div>
  );
};
