import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * While an opportunity, a proforma, an invoice or a warranty is being written, the code of a row that was filled from the warehouse (its code and its title are the
 * product's) is locked, whichever way the warehouse is kept; to have another code the row is removed and another product is chosen.
 * (The code of the product itself is edited in the warehouse: free in Hoormand's own warehouse, locked when the products come from Sepidar.)
 * A row typed by hand (a code nobody has, or a code with another title) stays free.
 */
let cache: { at: number; map: Promise<{ codes: Map<string, string>; sepidar: boolean }> } | null = null;

const load = () => {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = {
      at: Date.now(),
      map: api
        .crmProducts()
        .then((r) => ({ codes: new Map(r.products.filter((p) => p.code).map((p) => [p.code.trim(), (p.title || '').trim()] as [string, string])), sepidar: r.mode === 'sepidar' }))
        .catch(() => ({ codes: new Map<string, string>(), sepidar: false })),
    };
  }
  return cache.map;
};

/** Returns a function: is this code (with this title) the code of a warehouse product? */
export const useWarehouseCodeLock = () => {
  const [codes, setCodes] = useState<{ codes: Map<string, string>; sepidar: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((m) => live && setCodes(m));
    return () => {
      live = false;
    };
  }, []);
  return (code?: string, title?: string): boolean => {
    const c = (code || '').trim();
    if (!c || !codes) return false;
    const t = codes.codes.get(c);
    return t !== undefined && t === (title || '').trim();
  };
};

export const CODE_LOCK_HINT = 'کد از انبار آمده و هنگام ثبت فرصت و صدور فاکتور و پیش‌فاکتور قابل تغییر نیست؛ برای کد دیگر، ردیف را حذف کنید و کالای دیگری انتخاب کنید.';
export const CODE_LOCK_CLASS = ' bg-[#F3EEE8] text-[#6B5048] cursor-not-allowed';
