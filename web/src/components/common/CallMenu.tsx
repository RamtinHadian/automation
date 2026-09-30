import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneCall, Search } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

interface Status {
  enabled: boolean;
  connected: boolean;
  extension: string;
}

/** Phone button in the header: call a colleague (or any number) with one click through the company phone system. */
export const CallMenu: React.FC = () => {
  const { staffList, currentUser, showToast } = useAppContext();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .voipStatus()
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currentUser.id, currentUser.extension]);

  const place = () => {
    const btn = box.current?.getBoundingClientRect();
    if (!btn) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const width = Math.min(360, vw - margin * 2);
    const left = Math.max(margin, Math.min(btn.left + btn.width / 2 - width / 2, vw - width - margin));
    const top = Math.min(btn.bottom + 8, vh - 240);
    setPos({ top, left, width, maxH: vh - top - margin });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    api.voipStatus().then(setStatus).catch(() => {});
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current && !box.current.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const colleagues = useMemo(
    () =>
      staffList
        .filter((u) => u.isActive && u.id !== currentUser.id && u.extension)
        .filter((u) => !q.trim() || u.fullName.includes(q.trim()) || (u.extension || '').includes(q.trim())),
    [staffList, currentUser.id, q]
  );

  if (!status?.enabled || !status.extension) return null;

  const call = async (to: string, label: string) => {
    setBusy(to);
    try {
      await api.voipCall(to);
      showToast(`تلفن داخلی شما (${toPersianDigits(status.extension)}) زنگ می‌خورد؛ گوشی را بردارید تا با ${label} وصل شود.`);
      setOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تماس برقرار نشد.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="تماس تلفنی"
        className="flex items-center justify-center w-9 h-9 rounded-2xl bg-white border border-[#EBDBCE] text-[#3A241F] hover:bg-emerald-50 transition-all cursor-pointer"
      >
        <Phone className="w-4 h-4 text-emerald-700" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panel}
            dir="rtl"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
            className="z-[110] bg-white rounded-3xl border border-[#EBDBCE] shadow-2xl text-right overflow-hidden flex flex-col"
          >
            <div className="px-4 py-3 border-b border-[#EBDBCE] bg-[#FAF5F1]">
              <div className="font-black text-xs text-[#3A241F]">تماس با یک کلیک</div>
              <div className="text-[10px] text-[#8C6F66] mt-0.5 leading-5">
                اول تلفن داخلی شما ({toPersianDigits(status.extension)}) زنگ می‌خورد و با برداشتن گوشی، تماس وصل می‌شود.
                {!status.connected && <span className="text-rose-600 font-bold"> اتصال به تلفن سازمان فعلاً برقرار نیست.</span>}
              </div>
            </div>

            <div className="p-3 border-b border-[#EBDBCE]/70 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="جستجوی همکار یا شمارهٔ داخلی"
                  className="w-full pr-9 pl-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden"
                />
              </div>
              <div className="flex gap-2">
                <input
                  dir="ltr"
                  inputMode="tel"
                  value={number}
                  onChange={(e) => setNumber(e.target.value.replace(/[^0-9*#+]/g, ''))}
                  placeholder="شمارهٔ دلخواه"
                  className="flex-1 min-w-0 px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-mono outline-hidden text-right"
                />
                <button
                  type="button"
                  disabled={!number || busy !== null}
                  onClick={() => call(number, number)}
                  className="px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-black cursor-pointer shrink-0"
                >
                  تماس
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#EBDBCE]/60">
              {colleagues.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-gray-400">همکاری با شمارهٔ داخلی پیدا نشد.</div>
              ) : (
                colleagues.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => call(u.id, u.fullName)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-emerald-50/60 disabled:opacity-60 cursor-pointer text-right"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-[#3A241F] truncate">{u.fullName}</span>
                      <span className="block text-[10px] text-[#8C6F66]">
                        داخلی {toPersianDigits(u.extension)} · {u.departmentName}
                      </span>
                    </span>
                    <PhoneCall className={`w-4 h-4 shrink-0 ${busy === u.id ? 'animate-pulse text-emerald-500' : 'text-emerald-700'}`} />
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
