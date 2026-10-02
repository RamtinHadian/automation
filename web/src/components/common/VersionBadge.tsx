import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

/** The running release («نسخه ۱.۰.۴۲»). When the server has been updated since this page was opened, a button offers a refresh. */
export const VersionBadge: React.FC<{ className?: string; withDate?: boolean }> = ({ className = '', withDate }) => {
  const [v, setV] = useState<{ version: string; date?: string } | null>(null);
  const [fresh, setFresh] = useState(false);
  const first = useRef('');
  useEffect(() => {
    let stop = false;
    const load = () =>
      api.version().then((x) => {
        if (stop) return;
        if (!first.current) first.current = x.version;
        else if (x.version !== first.current) setFresh(true);
        setV(x);
      }).catch(() => {});
    load();
    const t = window.setInterval(load, 5 * 60 * 1000);
    return () => { stop = true; window.clearInterval(t); };
  }, []);
  if (!v) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} dir="rtl" title={v.date ? `تاریخ: ${v.date}` : undefined}>
      <span>نسخه {v.version === 'dev' ? 'آزمایشی' : toPersianDigits(v.version)}</span>
      {fresh && (
        <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black cursor-pointer">
          <RefreshCw className="w-3 h-3" />
          نسخهٔ جدید آماده است؛ تازه‌سازی
        </button>
      )}
    </span>
  );
};
