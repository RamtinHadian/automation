import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Package, Trash2 } from 'lucide-react';
import { api, getToken } from '../../lib/api';

/**
 * The photo of a product. The pictures live on the server (one per product); the page only knows WHEN a product's photo was last changed («imageAt»), fetches the
 * picture with the sign-in token (an <img> tag cannot send it) and keeps it in memory, so a list of products asks for each photo once.
 */
const cache = new Map<string, Promise<string | null>>();

function loadImage(id: string, at: number): Promise<string | null> {
  const key = `${id}:${at}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/warehouse/products/${encodeURIComponent(id)}/image`, { headers: { Authorization: `Bearer ${getToken() || ''}` } })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    cache.set(key, p);
  }
  return p;
}

export const useProductImage = (id?: string, at?: number): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (id && at) void loadImage(id, at).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id, at]);
  return url;
};

/** The small picture in a list (or the package icon when the product has none). */
export const ProductThumb: React.FC<{ id?: string; at?: number; size?: number; className?: string }> = ({ id, at, size = 40, className = '' }) => {
  const url = useProductImage(id, at);
  return url ? (
    <img src={url} alt="" loading="lazy" className={`rounded-lg object-cover bg-white border border-[#EBDBCE] ${className}`} style={{ width: size, height: size }} data-product-thumb />
  ) : (
    <span className={`flex items-center justify-center rounded-lg bg-[#FAF5F1] text-[#B8A39C] ${className}`} style={{ width: size, height: size }}><Package className="w-1/2 h-1/2" /></span>
  );
};

/** A big photo is shrunk in the browser first (longest side `max` pixels, JPEG), so what is sent is a few tens of kilobytes. */
export async function shrinkImage(file: Blob, max = 640): Promise<Blob> {
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
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('عکس ساخته نشد.'))), 'image/jpeg', 0.85));
}

/** The place in the product window where the photo is chosen, replaced or removed (for a product that already exists). */
export const ProductImageEditor: React.FC<{ id?: string; at?: number; onChanged: () => void }> = ({ id, at, onChanged }) => {
  const [stamp, setStamp] = useState<number | undefined>(at); // the photo of this window changes at once; the list behind it is told through onChanged
  const url = useProductImage(id, stamp);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!id) return <div className="text-[11px] font-bold text-[#8C6F66] rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2.5">بعد از ثبت کالا، می‌توانید عکسش را بگذارید.</div>;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      await api.whProductImagePut(id, await shrinkImage(f));
      setStamp(Math.floor(Date.now() / 1000) + 1);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'عکس گذاشته نشد.');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#EBDBCE] bg-[#FAF5F1] p-2.5" data-product-image-editor>
      {url ? <img src={url} alt="" className="w-20 h-20 rounded-xl object-cover bg-white border border-[#EBDBCE]" /> : <span className="w-20 h-20 rounded-xl flex items-center justify-center bg-white border border-dashed border-[#D9C7BC] text-[#B8A39C]"><ImagePlus className="w-7 h-7" /></span>}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="text-[11px] font-black text-[#3A241F]">عکس کالا</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => file.current?.click()} className="px-3 py-1.5 rounded-lg text-[11px] font-black text-white bg-[#6E1B1B] cursor-pointer disabled:opacity-50" data-product-image-pick>{url ? 'تعویض عکس' : 'انتخاب عکس'}</button>
          {url && <button type="button" disabled={busy} onClick={async () => { setBusy(true); try { await api.whProductImageDelete(id); setStamp(undefined); onChanged(); } catch (e) { setErr(e instanceof Error ? e.message : 'حذف نشد.'); } finally { setBusy(false); } }} className="px-3 py-1.5 rounded-lg text-[11px] font-black text-rose-700 bg-white border border-rose-200 cursor-pointer disabled:opacity-50 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" />حذف</button>}
        </div>
        <div className="text-[10px] font-bold text-[#8C6F66]">هر عکسی (JPG، PNG، WebP)؛ برنامه خودش کوچکش می‌کند.</div>
        {err && <div className="text-[11px] font-bold text-rose-700">{err}</div>}
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
};
