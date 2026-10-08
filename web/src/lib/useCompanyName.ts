import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';

let cached = '';

/** The official company name from «تنظیمات سیستم ← نام و هویت سازمان»: from the settings once signed in, from the public info before that. */
export const useCompanyName = (): string => {
  const { settings } = useAppContext();
  const fromSettings = (settings?.companyName || '').trim();
  const [pub, setPub] = useState(cached);
  useEffect(() => {
    if (fromSettings || cached) return;
    let alive = true;
    fetch('/api/portal/info', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && typeof j.company === 'string') {
          cached = j.company === 'شرکت' ? '' : j.company;
          setPub(cached);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fromSettings]);
  return fromSettings || pub;
};
