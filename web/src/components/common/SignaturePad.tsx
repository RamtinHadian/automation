import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, Undo2, Upload, Trash2, X, Check } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';

type Pt = { x: number; y: number; p: number };

const INK = '#1B2A63';
/** the saved image is never larger than this (keeps the staff list light) */
const MAX_W = 640;
const MAX_H = 280;

/** crops the empty margins of a canvas and scales it down; returns a transparent PNG */
function trimToDataUrl(src: HTMLCanvasElement | HTMLImageElement): string | null {
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height;
  if (!w || !h) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const k = Math.min(1, MAX_W / cw, MAX_H / ch);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cw * k));
  out.height = Math.max(1, Math.round(ch * k));
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(c, minX, minY, cw, ch, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** reads a picture file (a scan or a photo of a signature) and returns a small transparent-cropped PNG; white paper becomes transparent */
export function fileToSignature(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(null);
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const k = Math.min(1, 1600 / Math.max(w, h));
        const c = document.createElement('canvas');
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const px = ctx.getImageData(0, 0, c.width, c.height);
        const d = px.data;
        // a scan on white paper: the lighter the pixel, the more transparent it becomes
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          if (lum > 235) d[i + 3] = 0;
          else if (lum > 170) d[i + 3] = Math.round(d[i + 3] * ((235 - lum) / 65));
        }
        ctx.putImageData(px, 0, 0);
        resolve(trimToDataUrl(c));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/** The drawing window: sign with a pen, finger or mouse; the result is a small transparent PNG. */
export const SignaturePadDialog: React.FC<{ title?: string; onSave: (dataUrl: string) => void; onClose: () => void }> = ({ title = 'امضا با قلم', onSave, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const current = useRef<Pt[] | null>(null);
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState('');

  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const dpr = cv.width / cv.getBoundingClientRect().width || 1;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      if (s.length === 1) {
        ctx.beginPath();
        ctx.arc(s[0].x, s[0].y, 1.4 + s[0].p * 1.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1];
        const b = s[i];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const prevMid = i > 1 ? { x: (s[i - 2].x + a.x) / 2, y: (s[i - 2].y + a.y) / 2 } : a;
        ctx.lineWidth = 1.6 + ((a.p + b.p) / 2) * 2.6;
        ctx.beginPath();
        ctx.moveTo(prevMid.x, prevMid.y);
        ctx.quadraticCurveTo(a.x, a.y, mid.x, mid.y);
        ctx.stroke();
      }
    }
  }, []);

  useEffect(() => {
    const fit = () => {
      const cv = canvasRef.current;
      const wrap = wrapRef.current;
      if (!cv || !wrap) return;
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      redraw();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [redraw]);

  const pos = (e: React.PointerEvent): Pt => {
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === 'mouse' ? 0.45 : e.pressure > 0 ? e.pressure : 0.5 };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    current.current = [pos(e)];
    setMsg('');
    redraw();
  };
  const move = (e: React.PointerEvent) => {
    if (!current.current) return;
    e.preventDefault();
    // coalesced events make a pen stroke smooth even when the screen draws slower than the pen reports
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [];
    const list = evs.length ? evs : [e.nativeEvent as PointerEvent];
    const r = (canvasRef.current as HTMLCanvasElement).getBoundingClientRect();
    for (const ev of list) {
      current.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, p: ev.pointerType === 'mouse' ? 0.45 : ev.pressure > 0 ? ev.pressure : 0.5 });
    }
    redraw();
  };
  const up = () => {
    if (!current.current) return;
    strokes.current.push(current.current);
    current.current = null;
    setCount(strokes.current.length);
    redraw();
  };

  const undo = () => {
    strokes.current.pop();
    setCount(strokes.current.length);
    redraw();
  };
  const clear = () => {
    strokes.current = [];
    setCount(0);
    redraw();
  };
  const save = () => {
    const cv = canvasRef.current;
    if (!cv || !strokes.current.length) {
      setMsg('هنوز چیزی نکشیده‌اید.');
      return;
    }
    const url = trimToDataUrl(cv);
    if (!url) {
      setMsg('امضا خوانده نشد؛ دوباره بکشید.');
      return;
    }
    onSave(url);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-3 sm:p-6" dir="rtl" onMouseDown={(e) => e.target === e.currentTarget && undefined}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-[#EBDBCE] overflow-hidden flex flex-col max-h-[96dvh]">
        <div className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-l from-[#6E1B1B] to-[#D34A32] text-white">
          <PenTool className="w-5 h-5" />
          <h3 className="font-black text-sm flex-1">{title}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer" aria-label="بستن">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <p className="text-[11px] text-[#8C6F66] leading-5">امضا را با قلم دیجیتال، انگشت یا ماوس در کادر بکشید. زمینهٔ امضا شفاف ذخیره می‌شود و حاشیهٔ خالی خودکار بریده می‌شود.</p>
          <div ref={wrapRef} className="relative w-full h-[min(46dvh,260px)] rounded-2xl border-2 border-dashed border-[#C98B6A] bg-[#FFFDFB] overflow-hidden">
            <div className="absolute inset-x-6 bottom-[28%] border-b border-dashed border-[#EBDBCE] pointer-events-none" />
            {count === 0 && !current.current && <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-[#C9B8AE] pointer-events-none select-none">اینجا امضا کنید</span>}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={up}
            />
          </div>
          {msg && <div className="text-[11px] font-bold text-rose-600">{msg}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={undo} disabled={!count} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] disabled:opacity-40 cursor-pointer">
              <Undo2 className="w-3.5 h-3.5" />
              برگرداندن آخرین خط
            </button>
            <button type="button" onClick={clear} disabled={!count} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] disabled:opacity-40 cursor-pointer">
              <Eraser className="w-3.5 h-3.5" />
              پاک کردن همه
            </button>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[#F5ECE6] text-xs font-bold text-[#3A241F] cursor-pointer">
              انصراف
            </button>
            <button type="button" onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-black cursor-pointer">
              <Check className="w-4 h-4" />
              ثبت امضا
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Preview + «draw with pen» + «upload a sample» + delete. The parent keeps the value. */
export const SignatureField: React.FC<{ value?: string; onChange: (v: string | undefined) => void; who?: string; compact?: boolean }> = ({ value, onChange, who = 'این فرد', compact }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pad, setPad] = useState(false);
  const [err, setErr] = useState('');

  const pick = async (f: File) => {
    setErr('');
    const url = await fileToSignature(f);
    if (!url) setErr('تصویر خوانده نشد یا چیزی در آن دیده نشد؛ تصویر روشن‌تری انتخاب کنید.');
    else onChange(url);
  };

  return (
    <div className="space-y-2.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      <div className={`${compact ? 'h-24' : 'h-28'} w-full bg-white rounded-xl border border-[#EBDBCE] flex items-center justify-center p-2 overflow-hidden`}>
        {value ? <img src={value} alt="نمونه امضا" className="max-h-full max-w-full object-contain" /> : <span className="text-[11px] text-gray-400 font-bold">هنوز نمونه امضایی ثبت نشده است</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <button type="button" onClick={() => setPad(true)} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl cursor-pointer">
          <PenTool className="w-3.5 h-3.5" />
          {value ? 'امضای دوباره با قلم' : 'امضا با قلم'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#C98B6A] text-[#6E1B1B] text-xs font-bold rounded-xl cursor-pointer">
          <Upload className="w-3.5 h-3.5" />
          بارگذاری نمونه امضا
        </button>
        {value && (
          <button
            type="button"
            onClick={async () => (await askConfirm(`نمونه امضای ${who} حذف شود؟`, { confirmText: 'بله، حذف شود' })) && onChange(undefined)}
            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
            title="حذف نمونه امضا"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {err && <div className="text-[11px] font-bold text-rose-600 text-center">{err}</div>}
      {pad && (
        <SignaturePadDialog
          title={`امضای ${who} با قلم`}
          onClose={() => setPad(false)}
          onSave={(u) => {
            setPad(false);
            onChange(u);
          }}
        />
      )}
    </div>
  );
};
