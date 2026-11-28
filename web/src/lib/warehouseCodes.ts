import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * When the warehouse is Sepidar's (the products, with their codes, come from it) the code is never typed over: a row of a proforma, an invoice, an opportunity or a warranty
 * that was filled from the warehouse (its code and its title are the product's) keeps its code locked; to have another code the row is removed and another product is chosen.
 * In Hoormand's own warehouse (no Sepidar) products and their codes can be edited, and nothing is locked.
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
    if (!c || !codes || !codes.sepidar) return false; // only when the products come from Sepidar; in Hoormand's own warehouse the code is the company's to edit
    const t = codes.codes.get(c);
    return t !== undefined && t === (title || '').trim();
  };
};

export const CODE_LOCK_HINT = 'کد کالا از سپیدار آمده و قابل تغییر نیست؛ برای کد دیگر، ردیف را حذف کنید و کالای دیگری انتخاب کنید.';
export const CODE_LOCK_CLASS = ' bg-[#F3EEE8] text-[#6B5048] cursor-not-allowed';
