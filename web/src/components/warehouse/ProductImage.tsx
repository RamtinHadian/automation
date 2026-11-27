import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ImagePlus, Package, Trash2, X } from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

/**
 * The photos of a product (up to ten). They live on the server; the page only knows WHEN the photos of a product were last changed («imageAt») and how many there
 * are («imageCount»), fetches each picture with the sign-in token (an <img> tag cannot send it) and keeps it in memory, so a list asks for each photo once.
 */
export const MAX_PRODUCT_PHOTOS = 10;
const cache = new Map<string, Promise<string | null>>();

function loadImage(id: string, at: number, n: number): Promise<string | null> {
  const key = `${id}:${n}:${at}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/warehouse/products/${encodeURIComponent(id)}/image?n=${n}`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

export const useProductImage = (id?: string, at?: number, n = 0): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (id && at) void loadImage(id, at, n).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id, at, n]);
  return url;
};

/** One photo, as big as the box it is put in. */
export const ProductPhoto: React.FC<{ id: string; at: number; n: number; className?: string; fit?: 'cover' | 'contain' }> = ({ id, at, n, className = '', fit = 'cover' }) => {
  const url = useProductImage(id, at, n);
  return url ? <img src={url} alt="" loading="lazy" className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`} /> : <span className={`block bg-[#FAF5F1] animate-pulse ${className}`} />;
};

/**
 * The photos in a big window (a gallery): the arrows or the keys ← → go from one to the next, the little pictures below jump to one, Esc or a click outside closes.
 * Made to be shown to a customer across the desk.
 */
export const ProductGallery: React.FC<{ id: string; at: number; count: number; title: string; start?: number; onClose: () => void }> = ({ id, at, count, title, start = 0, onClose }) => {
  const [i, setI] = useState(Math.min(Math.max(0, start), Math.max(0, count - 1)));
  const go = (d: number) => setI((x) => (x + d + count) % count);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(1); // the page is right-to-left: the left arrow is «next»
      else if (e.key === 'ArrowRight') go(-1);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[400] bg-black/85 backdrop-blur-sm flex flex-col" dir="rtl" onMouseDown={onClose} onClick={stop} data-product-gallery>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onMouseDown={stop}>
        <div className="min-w-0"><div className="font-black text-sm truncate">{title}</div><div className="text-[11px] font-bold opacity-75">{toPersianDigits(i + 1)} از {toPersianDigits(count)}</div></div>
        <button type="button" onClick={onClose} className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer" aria-label="بستن"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 relative">
        {count > 1 && <button type="button" onMouseDown={stop} onClick={() => go(-1)} className="shrink-0 p-3 rounded-full bg-white/15 hover:bg-white/30 text-white cursor-pointer" aria-label="قبلی"><ChevronRight className="w-6 h-6" /></button>}
        <div className="flex-1 h-full min-w-0 flex items-center justify-center" onMouseDown={stop}>
          <ProductPhoto id={id} at={at} n={i} fit="contain" className="max-h-full max-w-full rounded-2xl shadow-2xl" />
        </div>
        {count > 1 && <button type="button" onMouseDown={stop} onClick={() => go(1)} className="shrink-0 p-3 rounded-full bg-white/15 hover:bg-white/30 text-white cursor-pointer" aria-label="بعدی"><ChevronLeft className="w-6 h-6" /></button>}
      </div>
      {count > 1 && (
        <div className="flex justify-center gap-2 px-3 py-3 overflow-x-auto" onMouseDown={stop} data-gallery-strip>
          {Array.from({ length: count }, (_, k) => (
            <button key={k} type="button" onClick={() => setI(k)} className={`shrink-0 rounded-xl overflow-hidden border-2 cursor-pointer ${k === i ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <ProductPhoto id={id} at={at} n={k} className="w-16 h-16" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
};

/**
 * The small picture in a list (or the package icon when the product has none). With `zoom` a click opens the gallery instead of whatever the row does;
 * a little number says how many photos there are when there are several.
 */
export const ProductThumb: React.FC<{ id?: string; at?: number; count?: number; title?: string; size?: number; className?: string; zoom?: boolean }> = ({ id, at, count = 1, title = '', size = 40, className = '', zoom }) => {
  const url = useProductImage(id, at, 0);
  const [open, setOpen] = useState(false);
  const body = url ? (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <img src={url} alt="" loading="lazy" className={`rounded-lg object-cover bg-white border border-[#EBDBCE] ${className}`} style={{ width: size, height: size }} data-product-thumb />
      {count > 1 && <span className="absolute -bottom-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-[#3A241F] text-white text-[9px] font-black flex items-center justify-center">{toPersianDigits(count)}</span>}
    </span>
  ) : (
    <span className={`flex items-center justify-center rounded-lg bg-[#FAF5F1] text-[#B8A39C] ${className}`} style={{ width: size, height: size }}><Package className="w-1/2 h-1/2" /></span>
  );
  if (!zoom || !url || !id || !at) return body;
  return (
    <>
      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen(true); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true); } }} className="cursor-zoom-in shrink-0" title="دیدن عکس‌ها" data-product-zoom>{body}</span>
      {open && <ProductGallery id={id} at={at} count={count} title={title} onClose={() => setOpen(false)} />}
    </>
  );
};

/** A big photo is shrunk in the browser first (longest side `max` pixels, JPEG), so what is sent is a few tens of kilobytes. */
export async function shrinkImage(file: Blob, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const g = c.getContext('2d');
  if (!g) throw new Error('مرورگر نتوانست عکس را کوچک کند.');
  g.fillStyle = '#fff'; // a transparent picture gets a white background (JPEG has none)
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('عکس ساخته نشد.'))), 'image/jpeg', 0.84));
}

/** The place in the product window where the photos are added, looked at (click = gallery) or removed (for a product that already exists). */
export const ProductImageEditor: React.FC<{ id?: string; at?: number; count?: number; title?: string; onChanged: () => void }> = ({ id, at, count = 0, title = '', onChanged }) => {
  const [stamp, setStamp] = useState<number | undefined>(at); // the photos of this window change at once; the list behind it is told through onChanged
  const [n, setN] = useState(count);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState<number | null>(null);
  if (!id) return <div className="text-[11px] font-bold text-[#8C6F66] rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2.5">بعد از ثبت کالا، می‌توانید عکس‌هایش را بگذارید.</div>;
  const add = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setErr('');
    try {
      let next = n;
      for (const f of Array.from(files)) {
        if (next >= MAX_PRODUCT_PHOTOS) break;
        await api.whProductImagePut(id, await shrinkImage(f), next);
        next += 1;
      }
      setN(next);
      setStamp(Math.floor(Date.now() / 1000) + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'عکس گذاشته نشد.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const remove = async (k: number) => {
    setBusy(true);
    try {
      await api.whProductImageDelete(id, k);
      setN((x) => Math.max(0, x - 1));
      setStamp(Math.floor(Date.now() / 1000) + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حذف نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-[#EBDBCE] bg-[#FAF5F1] p-2.5 space-y-2" data-product-image-editor>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-black text-[#3A241F]">عکس‌های کالا {n > 0 && <span className="font-bold text-[#8C6F66]">({toPersianDigits(n)} از {toPersianDigits(MAX_PRODUCT_PHOTOS)})</span>}</div>
        <button type="button" disabled={busy || n >= MAX_PRODUCT_PHOTOS} onClick={() => file.current?.click()} className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white bg-[#6E1B1B] cursor-pointer disabled:opacity-50 flex items-center gap-1.5" data-product-image-pick><ImagePlus className="w-3.5 h-3.5" />افزودن عکس</button>
      </div>
      {n === 0 ? (
        <div className="text-[11px] font-bold text-[#8C6F66]">هنوز عکسی نیست. چند عکس هم می‌شود گذاشت؛ مشتری به‌صورت گالری می‌بیند.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: n }, (_, k) => (
            <div key={`${k}:${stamp}`} className="relative group">
              <button type="button" onClick={() => setView(k)} className="block rounded-xl overflow-hidden border border-[#EBDBCE] bg-white cursor-zoom-in" title="دیدن بزرگ‌تر">
                <ProductPhoto id={id} at={stamp || 1} n={k} className="w-20 h-20" />
              </button>
              {k === 0 && <span className="absolute top-1 right-1 text-[9px] font-black rounded-full px-1.5 bg-[#3A241F] text-white">اصلی</span>}
              <button type="button" disabled={busy} onClick={() => void remove(k)} className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-white border border-rose-200 text-rose-600 flex items-center justify-center cursor-pointer shadow-sm" aria-label="حذف این عکس"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] font-bold text-[#8C6F66]">هر عکسی (JPG، PNG، WebP)؛ برنامه خودش کوچکش می‌کند. عکس اول در فهرست‌ها دیده می‌شود.</div>
      {err && <div className="text-[11px] font-bold text-rose-700">{err}</div>}
      <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      {view !== null && n > 0 && <ProductGallery id={id} at={stamp || 1} count={n} title={title} start={view} onClose={() => setView(null)} />}
    </div>
  );
};

/** The photos of a product in a row (in the product's card): click one and the gallery opens at it. */
export const ProductPhotoStrip: React.FC<{ id: string; at: number; count: number; title: string }> = ({ id, at, count, title }) => {
  const [view, setView] = useState<number | null>(null);
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" data-product-photo-strip>
      {Array.from({ length: count }, (_, k) => (
        <button key={k} type="button" onClick={() => setView(k)} className="shrink-0 rounded-xl overflow-hidden border border-[#EBDBCE] bg-white cursor-zoom-in" title="دیدن بزرگ‌تر">
          <ProductPhoto id={id} at={at} n={k} className="w-24 h-24" />
        </button>
      ))}
      {view !== null && <ProductGallery id={id} at={at} count={count} title={title} start={view} onClose={() => setView(null)} />}
    </div>
  );
};
