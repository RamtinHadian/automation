import React, { useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Search, Trash2, X } from 'lucide-react';
import { LETTERHEADS, LETTERHEAD_DESIGNS, LETTERHEAD_PALETTES, LetterheadChoice, letterheadSvg } from '../../lib/letterheads';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';

const PAGE = 60;
const MINE_KEY = 'my_letterheads_v1';
const loadMine = (): string[] => {
  try {
    const l = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
    return Array.isArray(l) ? l.filter((x) => typeof x === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
};
const saveMine = (l: string[]) => {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(l.slice(0, 8)));
  } catch {
    /* storage full or blocked: the design still works for this letter */
  }
};

/** A picture file becomes a data URL no bigger than a sheet needs (SVG is kept as it is). */
function readDesign(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('فقط فایل تصویر (PNG، JPG، SVG یا WebP) را می‌توان بارگذاری کرد.'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('حجم تصویر بیش از ۱۲ مگابایت است.'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('خواندن فایل ممکن نشد.'));
    fr.onload = () => {
      const src = String(fr.result);
      if (file.type === 'image/svg+xml') return resolve(src);
      const img = new Image();
      img.onerror = () => reject(new Error('این تصویر باز نشد.'));
      img.onload = () => {
        const w = Math.min(1240, img.width);
        const h = Math.round((img.height * w) / img.width);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('پردازش تصویر ممکن نشد.'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}

/** The page that opens at the right when «سربرگ رسمی با آرم» is chosen: ready letterheads, the person's own design, and the address / phone of the footer. */
export const LetterheadPanel: React.FC<{
  value: LetterheadChoice | null;
  onChange: (v: LetterheadChoice | null) => void;
  defaults: { address: string; phone: string };
  onClose: () => void;
}> = ({ value, onChange, defaults, onClose }) => {
  const { showToast } = useAppContext();
  const [design, setDesign] = useState(-1);
  const [palette, setPalette] = useState(-1);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [mine, setMine] = useState<string[]>(loadMine);
  const file = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const n = Number(q.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    return LETTERHEADS.filter((l) => (design < 0 || l.design === design) && (palette < 0 || l.palette === palette) && (!q.trim() || (Number.isFinite(n) && n === l.id) || l.name.includes(q.trim())));
  }, [design, palette, q]);

  const base = (): Omit<LetterheadChoice, 'id' | 'image'> => ({
    showAddress: value?.showAddress ?? !!defaults.address,
    showPhone: value?.showPhone ?? !!defaults.phone,
    address: value?.address ?? defaults.address,
    phone: value?.phone ?? defaults.phone,
    offsetX: value?.offsetX,
    offsetY: value?.offsetY,
  });
  const pick = (id: number) => onChange({ ...base(), id });
  const pickOwn = (image: string) => onChange({ ...base(), id: 0, image });
  const patch = (u: Partial<LetterheadChoice>) => value && onChange({ ...value, ...u });

  const upload = async (f?: File | null) => {
    if (!f) return;
    try {
      const img = await readDesign(f);
      const next = [img, ...mine.filter((x) => x !== img)].slice(0, 8);
      setMine(next);
      saveMine(next);
      pickOwn(img);
      showToast('طرح شما روی نامه نشست. اگر سربرگتان جای متن را گرفته، متن و بخش‌ها را با ماوس جابه‌جا کنید.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'بارگذاری نشد.');
    } finally {
      if (file.current) file.current.value = '';
    }
  };
  const dropMine = (img: string) => {
    const next = mine.filter((x) => x !== img);
    setMine(next);
    saveMine(next);
    if (value?.image === img) onChange(null);
  };

  const field = 'w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-amber-300/40';

  return (
    <div className="h-full flex flex-col bg-white text-right" dir="rtl" data-letterhead-panel>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#EBDBCE] bg-amber-50/60">
        <div>
          <div className="font-black text-sm text-[#3A241F]">قالب‌های سربرگ</div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(LETTERHEADS.length)} قالب آماده، یا طرح خودتان · روی هر کدام بزنید تا روی نامه بنشیند</div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-[#8C6F66] hover:bg-white cursor-pointer" title="بستن"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* the person's own design */}
        <div className="px-4 py-3 border-b border-[#EBDBCE] space-y-2.5">
          <div className="text-[11px] font-black text-[#3A241F]">طرح سربرگ خودتان</div>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-letterhead-upload />
          <button type="button" onClick={() => file.current?.click()} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/60 hover:bg-amber-50 text-amber-900 text-xs font-black cursor-pointer">
            <ImagePlus className="w-4 h-4" />
            بارگذاری طرح (تصویر کاملِ صفحه، PNG یا JPG)
          </button>
          <p className="text-[10px] text-[#8C6F66] leading-5">تصویر را به اندازهٔ یک صفحهٔ A4 عمودی طراحی کنید؛ همان‌طور که هست پشت نامه می‌نشیند و متن و بخش‌های نامه روی آن چیده می‌شوند.</p>
          {mine.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {mine.map((img, i) => {
                const on = value?.image === img;
                return (
                  <div key={i} className="relative group">
                    <button type="button" onClick={() => pickOwn(img)} className={`block w-full rounded-lg overflow-hidden border-2 cursor-pointer ${on ? 'border-amber-500' : 'border-[#E1D6CC] hover:border-amber-300'}`} style={{ aspectRatio: '210 / 297' }} title="طرح من">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                    {on && <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                    <button type="button" onClick={() => dropMine(img)} className="absolute bottom-1 right-1 p-1 rounded-md bg-white/90 text-rose-600 opacity-0 group-hover:opacity-100 cursor-pointer" title="حذف از طرح‌های من"><Trash2 className="w-3 h-3" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* the address and the phone in the footer */}
        <div className="px-4 py-3 border-b border-[#EBDBCE] space-y-2.5 bg-[#FAF5F1]">
          <div className="text-[11px] font-black text-[#3A241F]">نشانی و تلفن در پایین نامه</div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
            <input type="checkbox" disabled={!value} checked={!!value?.showAddress} onChange={(e) => patch({ showAddress: e.target.checked })} className="accent-amber-600" />
            نمایش نشانی
          </label>
          <input className={field} disabled={!value} value={value?.address ?? defaults.address} onChange={(e) => patch({ address: e.target.value })} placeholder="نشانی شرکت" />
          <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
            <input type="checkbox" disabled={!value} checked={!!value?.showPhone} onChange={(e) => patch({ showPhone: e.target.checked })} className="accent-amber-600" />
            نمایش تلفن
          </label>
          <input className={field} disabled={!value} value={value?.phone ?? defaults.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="شمارهٔ تلفن" />
          <p className="text-[10px] text-[#8C6F66] leading-5">این خط روی نامه با ماوس یا انگشت جابه‌جا می‌شود، مثل بقیهٔ بخش‌های سربرگ. مقدار پیش‌فرض از اطلاعات شرکت در تنظیمات می‌آید.</p>
        </div>

        {/* filters */}
        <div className="px-4 py-3 border-b border-[#EBDBCE] space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#B8A39C] absolute right-3 top-2.5" />
            <input className={`${field} pr-8`} value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="شمارهٔ قالب یا نام (مثلاً ۴۲۰ یا موج)" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className={field} value={design} onChange={(e) => { setDesign(Number(e.target.value)); setLimit(PAGE); }}>
              <option value={-1}>همهٔ طرح‌ها</option>
              {LETTERHEAD_DESIGNS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <select className={field} value={palette} onChange={(e) => { setPalette(Number(e.target.value)); setLimit(PAGE); }}>
              <option value={-1}>همهٔ رنگ‌ها</option>
              {LETTERHEAD_PALETTES.map((p, i) => <option key={p} value={i}>{p}</option>)}
            </select>
          </div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(list.length)} قالب</div>
        </div>

        {/* the ready templates, sixty at a time */}
        <div className="p-3">
          {list.length === 0 && <div className="text-center text-xs font-bold text-[#8C6F66] py-10">قالبی با این مشخصات پیدا نشد.</div>}
          <div className="grid grid-cols-3 gap-2.5">
            {list.slice(0, limit).map((l) => {
              const on = !value?.image && value?.id === l.id;
              return (
                <button key={l.id} type="button" onClick={() => pick(l.id)} title={l.name} className={`group text-center cursor-pointer rounded-xl p-1.5 border-2 transition-all ${on ? 'border-amber-500 bg-amber-50 shadow' : 'border-transparent hover:border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                  <div className="relative bg-white border border-[#E1D6CC] rounded-md overflow-hidden shadow-sm" style={{ aspectRatio: '210 / 297' }}>
                    <div className="absolute inset-x-0 top-0" dangerouslySetInnerHTML={{ __html: letterheadSvg(l.id, 'top') }} />
                    <div className="absolute inset-x-0 bottom-0" dangerouslySetInnerHTML={{ __html: letterheadSvg(l.id, 'bottom') }} />
                    <div className="absolute inset-x-[14%] top-[26%] space-y-[5px]">
                      {[100, 86, 94, 70, 90, 78, 60].map((w, i) => <div key={i} className="h-[2.5px] rounded bg-[#E7DFD8] mr-auto" style={{ width: `${w}%` }} />)}
                    </div>
                    {on && <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                  </div>
                  <div className="mt-1 text-[9.5px] font-black text-[#3A241F] leading-4 truncate">{toPersianDigits(l.id)} · {LETTERHEAD_DESIGNS[l.design]}</div>
                  <div className="text-[9px] font-bold text-[#8C6F66] leading-4 truncate">{LETTERHEAD_PALETTES[l.palette]}</div>
                </button>
              );
            })}
          </div>
          {list.length > limit && (
            <button type="button" onClick={() => setLimit(limit + PAGE)} className="mt-3 w-full py-2.5 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[11px] font-black text-[#6E1B1B] hover:bg-amber-50 cursor-pointer">
              نمایش {toPersianDigits(Math.min(PAGE, list.length - limit))} قالب بعدی
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-[#EBDBCE] flex items-center justify-between gap-2 bg-[#FAF5F1]">
        <span className="text-[11px] font-bold text-[#5A4640]">{value ? (value.image ? 'طرح خودتان انتخاب شد' : `قالب ${toPersianDigits(value.id)} انتخاب شد`) : 'هنوز قالبی انتخاب نشده'}</span>
        {value && <button type="button" onClick={() => onChange(null)} className="text-[11px] font-black text-rose-600 hover:underline cursor-pointer">برداشتن سربرگ</button>}
      </div>
    </div>
  );
};
