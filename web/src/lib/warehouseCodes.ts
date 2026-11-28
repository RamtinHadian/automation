import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * The code of a warehouse product is never typed over: a row of a proforma, an invoice, an opportunity or a warranty that was filled from the warehouse
 * (its code and its title are the product's) keeps its code locked; to have another code the row is removed and another product is chosen.
 * A row typed by hand (a code nobody has, or a code with another title) stays free.
 */
let cache: { at: number; map: Promise<Map<string, string>> } | null = null;

const load = (): Promise<Map<string, string>> => {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = {
      at: Date.now(),
      map: api
        .crmProducts()
        .then((r) => new Map(r.products.filter((p) => p.code).map((p) => [p.code.trim(), (p.title || '').trim()] as [string, string])))
        .catch(() => new Map<string, string>()),
    };
  }
  return cache.map;
};

/** Returns a function: is this code (with this title) the code of a warehouse product? */
export const useWarehouseCodeLock = () => {
  const [codes, setCodes] = useState<Map<string, string> | null>(null);
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
    const t = codes.get(c);
    return t !== undefined && t === (title || '').trim();
  };
};

export const CODE_LOCK_HINT = 'کد از انبار آمده و قابل تغییر نیست؛ برای کد دیگر، ردیف را حذف کنید و کالای دیگری انتخاب کنید.';
export const CODE_LOCK_CLASS = ' bg-[#F3EEE8] text-[#6B5048] cursor-not-allowed';
