import React, { useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { BUILTIN_COUNT, builtinImage, forgetLoginImages, readLoginImage, resolveLoginImage } from '../../lib/loginStyle';
import { toPersianDigits } from '../../lib/jalali';

const MAX = 12;
const LANDSCAPES = 20;

/**
 * The pictures behind the sign-in pages. Nothing chosen = all 50 built-in ones (20 landscapes, 30 Islamic patterns), one at random per visit.
 * Choose up to 12 (built-in ones by a tap, or the company's own uploads): only those are used. Saved at once.
 */
export const LoginImagesCard: React.FC<{ images: string[]; onChange: (list: string[]) => void; toast: (m: string) => void }> = ({ images, onChange, toast }) => {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'all' | 'land' | 'pattern'>('all');
  const commit = (list: string[]) => {
    forgetLoginImages();
    onChange(list);
  };
  const toggle = (id: string) => {
    if (images.includes(id)) return commit(images.filter((x) => x !== id));
    if (images.length >= MAX) return toast(`حداکثر ${toPersianDigits(MAX)} تصویر را می‌شود انتخاب کرد.`);
    commit([...images, id]);
  };
  const add = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      let next = [...images];
      for (const f of Array.from(files)) {
        if (next.length >= MAX) {
          toast(`حداکثر ${toPersianDigits(MAX)} تصویر را می‌شود انتخاب کرد.`);
          break;
        }
        next = [...next, await readLoginImage(f)];
      }
      commit(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'بارگذاری نشد.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const own = images.filter((x) => !x.startsWith('builtin:'));
  const ids = Array.from({ length: BUILTIN_COUNT }, (_, n) => n).filter((n) => (tab === 'all' ? true : tab === 'land' ? n < LANDSCAPES : n >= LANDSCAPES));
  const tabBtn = (k: typeof tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg border text-[11px] font-black cursor-pointer ${tab === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
      {label}
    </button>
  );
  return (
    <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4" data-login-images>
      <div>
        <h3 className="font-black text-sm text-[#3A241F]">تصاویر صفحهٔ ورود</h3>
        <p className="text-[11px] text-[#8C6F66] leading-6 mt-1">
          پشت صفحهٔ ورود کارکنان و مدیران، یک تصویر تمام‌صفحه با کادر شیشه‌ای دیده می‌شود. {toPersianDigits(BUILTIN_COUNT)} تصویر آماده دارید (۲۰ منظره و ۳۰ طرح اسلیمی). اگر چیزی انتخاب نکنید، هر بار یکی از همهٔ آن‌ها به‌تصادف می‌آید.
          اگر تا {toPersianDigits(MAX)} تصویر را با یک لمس انتخاب کنید (یا تصویر خودتان را بارگذاری کنید)، فقط همان‌ها استفاده می‌شوند.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tabBtn('all', `همه (${toPersianDigits(BUILTIN_COUNT)})`)}
        {tabBtn('land', 'منظره‌ها (۲۰)')}
        {tabBtn('pattern', 'طرح‌های اسلیمی (۳۰)')}
        <span className="text-[11px] font-bold text-[#8C6F66] mr-auto">
          {images.length ? `${toPersianDigits(images.length)} تصویر انتخاب شده` : 'همه به‌تصادف'}
        </span>
        {images.length > 0 && (
          <button type="button" onClick={async () => (await askConfirm('انتخاب‌ها برداشته شود و دوباره همهٔ تصاویر آماده به‌تصادف بیایند؟', { confirmText: 'بله' })) && commit([])} className="px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer">
            برداشتن همهٔ انتخاب‌ها
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[420px] overflow-y-auto p-1">
        {ids.map((n) => {
          const id = `builtin:${n}`;
          const on = images.includes(id);
          return (
            <button key={n} type="button" onClick={() => toggle(id)} className={`relative aspect-video rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${on ? 'border-[#6E1B1B] shadow-md scale-[1.02]' : 'border-transparent hover:border-[#C98B6A]'}`} title={n < LANDSCAPES ? 'منظره' : 'طرح اسلیمی'}>
              <img src={builtinImage(n)} alt="" loading="lazy" className="w-full h-full object-cover" draggable={false} />
              {on && <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-[#6E1B1B] text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-black text-[#3A241F]">تصاویر خودتان</div>
        <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
        <div className="flex items-center gap-3 flex-wrap">
          {own.map((src) => (
            <div key={src.slice(-40)} className="relative group w-28 aspect-video rounded-xl overflow-hidden border border-[#EBDBCE]">
              <img src={resolveLoginImage(src)} alt="" className="w-full h-full object-cover" draggable={false} />
              <button type="button" onClick={async () => (await askConfirm('این تصویر از صفحهٔ ورود برداشته شود؟', { confirmText: 'بله، برداشته شود' })) && commit(images.filter((x) => x !== src))} className="absolute top-1 left-1 p-1 rounded-md bg-white/90 text-rose-600 shadow cursor-pointer" title="حذف">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button type="button" disabled={busy || images.length >= MAX} onClick={() => file.current?.click()} className="flex items-center gap-1.5 px-4 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50">
            <ImagePlus className="w-4 h-4" />
            {busy ? 'در حال بارگذاری…' : 'افزودن تصویر'}
          </button>
        </div>
      </div>
    </div>
  );
};
