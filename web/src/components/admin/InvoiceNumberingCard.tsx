import React, { useCallback, useEffect, useState } from 'react';
import { Hash } from 'lucide-react';
import { api, InvoiceNumberingState } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';

type Mode = 'counter' | 'sepidar' | 'year';
const input = 'w-full px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#C98B6A]';

/**
 * «شماره‌گذاری فاکتور» in the console. Three ways: Hoormand's own counter that CONTINUES Sepidar's (the administrator says the last number used in Sepidar,
 * e.g. 50, and Hoormand gives 51, 52… so both stay the same); the number Sepidar gives (the invoice waits for it); or Hoormand's yearly FA-… / NF-….
 * The counters are changed by the server as invoices are issued, so they are saved with their own button (not with the page's «save all»).
 */
export const InvoiceNumberingCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [st, setSt] = useState<InvoiceNumberingState | null>(null);
  const [mode, setMode] = useState<Mode>('year');
  const [kinds, setKinds] = useState('both');
  const [cnt, setCnt] = useState({ last: '', prefix: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.invoiceNumbering().then((r) => {
      setSt(r);
      setMode(r.mode === 'default' ? (r.connected ? 'sepidar' : 'year') : (r.mode as Mode));
      setKinds(r.sepidarKinds === 'official' ? 'official' : 'both');
      setCnt({ last: r.ALL.set ? String(r.ALL.last) : '', prefix: r.ALL.prefix || '' });
    }).catch(() => setSt(null));
  }, []);
  useEffect(load, [load]);
  const save = async () => {
    setBusy(true);
    try {
      await api.invoiceNumberingSave({ mode, sepidarKinds: kinds, ALL: { last: cnt.last, prefix: cnt.prefix } });
      showToast('شماره‌گذاری فاکتور ذخیره شد.');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };
  const digits = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\D/g, '');
  const next = (c: { last: string; prefix: string }) => (c.last === '' ? '—' : toPersianDigits(c.prefix + String((parseInt(c.last, 10) || 0) + 1)));
  const opt = (m: Mode, title: string, text: string) => (
    <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer ${mode === m ? 'border-[#C98B6A] bg-[#FFF7F1]' : 'border-[#EBDBCE] bg-[#FDFAF7]'}`}>
      <input type="radio" name="invnum" className="mt-1 w-4 h-4 accent-[#6E1B1B]" checked={mode === m} onChange={() => setMode(m)} data-invnum-mode={m} />
      <span className="text-[12px] font-black text-[#3A241F]">{title}<span className="block text-[10.5px] font-medium text-[#8C6F66] leading-5">{text}</span></span>
    </label>
  );
  const counter = (title: string, c: { last: string; prefix: string }, set: (v: { last: string; prefix: string }) => void, used: number, key: string) => (
    <div className="rounded-xl border border-[#EBDBCE] bg-white p-3 space-y-2">
      <div className="text-[11.5px] font-black text-[#503730]">{title}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="block text-[10.5px] font-bold text-[#8C6F66] mb-1">آخرین شمارهٔ فاکتور در سپیدار</label><input className={input} inputMode="numeric" value={c.last} onChange={(e) => set({ ...c, last: digits(e.target.value) })} placeholder="مثلاً ۵۰" data-invnum-last={key} /></div>
        <div><label className="block text-[10.5px] font-bold text-[#8C6F66] mb-1">پیشوند (اختیاری)</label><input className={input} dir="ltr" value={c.prefix} onChange={(e) => set({ ...c, prefix: e.target.value.trim() })} placeholder="خالی" /></div>
      </div>
      <div className="text-[11px] font-black text-emerald-800" data-invnum-next={key}>فاکتور بعدی: {next(c)}</div>
      {used > 0 && <div className="text-[10.5px] font-bold text-[#8C6F66]">بیشترین شمارهٔ صادرشده در هورمند: {toPersianDigits(used)}</div>}
    </div>
  );
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-3" data-invoice-numbering>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><Hash className="w-4 h-4 text-[#D34A32]" />شماره‌گذاری فاکتور</div>
      {opt('counter', 'ادامهٔ شمارهٔ سپیدار (پیشنهاد)', 'شمارهٔ آخر فاکتور در سپیدار را اینجا می‌دهید (مثلاً ۵۰)؛ هورمند از همان ادامه می‌دهد: ۵۱، ۵۲، … و هر فاکتور خودکار به سپیدار هم می‌رود تا شماره‌ها همیشه یکی بماند. اگر در سپیدار فاکتور دیگری هم صادر شود و شماره‌ها از هم جدا شوند، هورمند اعلان می‌دهد و شمارنده را با سپیدار هم‌تراز می‌کند.')}
      {opt('sepidar', 'شمارهٔ خودِ سپیدار', 'فاکتور هورمند «در انتظار سپیدار» می‌ماند تا برنامهٔ حسابداری آن را در سپیدار صادر کند و شمارهٔ سپیدار را بیاورد؛ همان شماره شمارهٔ فاکتور هورمند می‌شود. اگر برنامهٔ سپیدار روشن نباشد، صدور انجام نمی‌شود.')}
      {opt('year', 'شمارهٔ مستقل هورمند', 'هورمند خودش شماره می‌دهد: FA-۱۴۰۵-۰۰۰۱ برای رسمی و NF-۱۴۰۵-۰۰۰۱ برای غیررسمی؛ هر سال از نو. با سپیدار یکی نمی‌شود.')}
      {mode === 'counter' && (
        <div className="space-y-2">
          {st && st.sepidarLast > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-sky-900 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2">
              آخرین شمارهٔ فاکتور در سپیدار (از آخرین بروزرسانی): <b>{toPersianDigits(st.sepidarLast)}</b>
              <button type="button" onClick={() => setCnt({ ...cnt, last: String(st.sepidarLast) })} className="px-2.5 py-1 rounded-lg bg-sky-700 text-white text-[10.5px] font-black cursor-pointer">همین را بنویس</button>
            </div>
          )}
          {counter('شمارنده (برای فاکتور رسمی و غیررسمی با هم؛ سپیدار یک ردیف شمارهٔ فاکتور دارد)', cnt, setCnt, st?.ALL.usedMax || 0, 'ALL')}
          <p className="text-[10.5px] font-bold text-[#8C6F66] leading-5">شمارهٔ آخر نباید از فاکتورهای صادرشده کمتر باشد. اگر برای مشتری فاکتور رسمی و غیررسمی هر دو به سپیدار می‌روند، همین یک شمارنده برای هر دو است. هر فاکتور بعد از صدور خودکار به سپیدار فرستاده می‌شود و شمارهٔ سپیدار با شمارهٔ هورمند مقایسه می‌شود.</p>
        </div>
      )}
      {mode === 'sepidar' && (
        <div>
          <label className="block text-[11px] font-black text-[#503730] mb-1">کدام فاکتورها از سپیدار شماره بگیرند؟</label>
          <select className={input + ' sm:w-80'} value={kinds} onChange={(e) => setKinds(e.target.value)}>
            <option value="both">رسمی و غیررسمی</option>
            <option value="official">فقط رسمی (غیررسمی شمارهٔ خودش را دارد)</option>
          </select>
        </div>
      )}
      {st && !st.connected && mode !== 'year' && <p className="text-[11px] font-bold text-amber-800">الان سپیدار وصل نیست؛ تا وصل نشود، فاکتورها شمارهٔ مستقل هورمند می‌گیرند.</p>}
      <button type="button" disabled={busy} onClick={() => void save()} className="px-5 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-60" data-invnum-save>ذخیرهٔ شماره‌گذاری</button>
    </div>
  );
};
