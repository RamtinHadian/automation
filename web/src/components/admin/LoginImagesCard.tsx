import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { DEFAULT_LOGIN_IMAGES, forgetLoginImages, readLoginImage } from '../../lib/loginStyle';
import { toPersianDigits } from '../../lib/jalali';

const MAX = 6;

/** The pictures behind the sign-in pages: up to six; one is shown at random on every visit. Saved at once, like the signature and the stamp. */
export const LoginImagesCard: React.FC<{ images: string[]; onChange: (list: string[]) => void; toast: (m: string) => void }> = ({ images, onChange, toast }) => {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const commit = (list: string[]) => {
    forgetLoginImages();
    onChange(list);
  };
  const add = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      let next = [...images];
      for (const f of Array.from(files)) {
        if (next.length >= MAX) {
          toast(`حداکثر ${toPersianDigits(MAX)} تصویر می‌شود گذاشت.`);
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
  return (
    <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4" data-login-images>
      <div>
        <h3 className="font-black text-sm text-[#3A241F]">تصاویر صفحهٔ ورود</h3>
        <p className="text-[11px] text-[#8C6F66] leading-6 mt-1">
          پشت صفحهٔ ورود کارکنان و ورود مدیران، یک تصویر تمام‌صفحه با کادر شیشه‌ای نمایش داده می‌شود. تا {toPersianDigits(MAX)} تصویر بگذارید؛ هر بار یکی از آن‌ها به‌تصادف دیده می‌شود.
          تصویر افقی و با کیفیت (مثل منظره یا ساختمان شرکت) بهتر است؛ خودکار به اندازهٔ لازم کوچک می‌شود. اگر تصویری نگذارید، تصاویر آمادهٔ سامانه نمایش داده می‌شوند.
        </p>
      </div>
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(images.length ? images : DEFAULT_LOGIN_IMAGES).map((src, i) => (
          <div key={i} className="relative group rounded-2xl overflow-hidden border border-[#EBDBCE] aspect-video bg-[#FAF5F1]">
            <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
            {images.length > 0 ? (
              <button
                type="button"
                onClick={async () => (await askConfirm('این تصویر از صفحهٔ ورود برداشته شود؟', { confirmText: 'بله، برداشته شود' })) && commit(images.filter((_, k) => k !== i))}
                className="absolute top-2 left-2 p-1.5 rounded-lg bg-white/90 text-rose-600 shadow cursor-pointer"
                title="حذف"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <span className="absolute bottom-2 right-2 text-[10px] font-black bg-black/50 text-white px-2 py-0.5 rounded-full">آمادهٔ سامانه</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy || images.length >= MAX}
          onClick={() => file.current?.click()}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-black rounded-xl cursor-pointer disabled:opacity-50"
        >
          <ImagePlus className="w-4 h-4" />
          {busy ? 'در حال بارگذاری…' : 'افزودن تصویر'}
        </button>
        {images.length > 0 && (
          <button
            type="button"
            onClick={async () => (await askConfirm('همهٔ تصاویر شما برداشته شود و تصاویر آمادهٔ سامانه برگردد؟', { confirmText: 'بله' })) && commit([])}
            className="px-3 py-2 text-[11px] font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
          >
            بازگشت به تصاویر آماده
          </button>
        )}
      </div>
    </div>
  );
};
