import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

interface NetEvent { at: string; kind: 'update' | 'restart' | 'stall' | 'net-down'; seconds: number; version: string; detail: string }
interface NetInfo {
  version: string;
  events: NetEvent[];
  stallsAndOutagesNearUpdates: number;
  stallsAndOutagesElsewhere: number;
  state: { startedAt: string; tcpOK: boolean; dnsOK: boolean; downNow: boolean };
}

const KIND: Record<NetEvent['kind'], { label: string; color: string }> = {
  update: { label: 'به‌روزرسانی', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  restart: { label: 'راه‌اندازی دوبارهٔ ناخواسته', color: 'bg-rose-100 text-rose-800 border-rose-200' },
  stall: { label: 'کندی یا ایستادن سرور', color: 'bg-amber-100 text-amber-900 border-amber-200' },
  'net-down': { label: 'قطع اینترنت سرور', color: 'bg-rose-100 text-rose-800 border-rose-200' },
};

const when = (iso: string) => {
  const d = new Date(iso);
  return toPersianDigits(d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
};
const dur = (s: number) => (s >= 90 ? toPersianDigits(Math.round(s / 60)) + ' دقیقه' : toPersianDigits(s) + ' ثانیه');

/** Why was the system not reachable? Updates, a stalled server, the server's own internet, or a restart. */
export const NetWatchCard: React.FC = () => {
  const [info, setInfo] = useState<NetInfo | null>(null);
  const [error, setError] = useState('');
  const load = () => api.netWatch().then((r: NetInfo) => { setInfo(r); setError(''); }).catch((e: unknown) => setError(String((e as Error)?.message || e)));
  useEffect(() => { load(); }, []);

  const count = (k: NetEvent['kind']) => info?.events.filter((e) => e.kind === k).length || 0;
  const verdict = () => {
    if (!info) return '';
    if (info.events.length === 0) return 'در ۳۰ روز گذشته هیچ قطعی یا کندی ثبت نشده است.';
    const near = info.stallsAndOutagesNearUpdates;
    const other = info.stallsAndOutagesElsewhere;
    const parts: string[] = [];
    if (count('update')) parts.push(toPersianDigits(count('update')) + ' بار به‌روزرسانی (هر بار برنامه چند ثانیه تا چند دقیقه در دسترس نبوده)');
    if (count('restart')) parts.push(toPersianDigits(count('restart')) + ' بار خاموش‌شدن ناخواسته (قطع برق یا خرابی سرور)');
    if (near + other) parts.push(toPersianDigits(near) + ' کندی یا قطع اینترنت نزدیک به‌روزرسانی و ' + toPersianDigits(other) + ' مورد جدا از به‌روزرسانی');
    return parts.join('؛ ') + '.';
  };

  return (
    <div className="bg-white border border-[#EBDBCE] rounded-3xl p-4 sm:p-6 space-y-4" data-netwatch>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center"><Activity className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-black text-[#3A241F]">پایش اتصال و به‌روزرسانی</h3>
            <p className="text-[11px] text-[#8C6F66]">اگر سامانه گاهی در دسترس نیست، این‌جا می‌بینید علتش به‌روزرسانی بوده، کندی سرور، قطع اینترنت سرور یا خاموش‌شدن.</p>
          </div>
        </div>
        <button type="button" onClick={load} className="px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-xs font-black text-[#6E1B1B] flex items-center gap-1.5 cursor-pointer" aria-label="تازه‌سازی">
          <RefreshCw className="w-3.5 h-3.5" /> تازه‌سازی
        </button>
      </div>

      {error && <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</div>}

      {info && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3"><div className="text-lg font-black text-sky-700">{toPersianDigits(count('update'))}</div><div className="text-[11px] text-[#8C6F66] font-bold">به‌روزرسانی</div></div>
            <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3"><div className="text-lg font-black text-rose-700">{toPersianDigits(count('restart'))}</div><div className="text-[11px] text-[#8C6F66] font-bold">خاموشی ناخواسته</div></div>
            <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3"><div className="text-lg font-black text-amber-700">{toPersianDigits(count('stall'))}</div><div className="text-[11px] text-[#8C6F66] font-bold">کندی سرور</div></div>
            <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3"><div className="text-lg font-black text-rose-700">{toPersianDigits(count('net-down'))}</div><div className="text-[11px] text-[#8C6F66] font-bold">قطع اینترنت سرور</div></div>
          </div>
          <div className="text-xs font-bold text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5">{verdict()}</div>
          <div className="text-[11px] text-[#8C6F66] font-bold flex flex-wrap gap-x-4 gap-y-1">
            <span>اینترنت سرور الان: {info.state.tcpOK ? 'وصل' : 'قطع'}</span>
            <span>نام‌یابی (DNS): {info.state.dnsOK ? 'سالم' : 'مشکل دارد'}</span>
            <span>نسخهٔ در حال اجرا: {toPersianDigits(info.version)}</span>
          </div>
          {info.events.length > 0 && (
            <div className="divide-y divide-[#EBDBCE]/60 border border-[#EBDBCE] rounded-2xl overflow-hidden max-h-[360px] overflow-y-auto">
              {info.events.map((e, i) => (
                <div key={i} className="p-3 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs">
                  <span className={`shrink-0 self-start px-2.5 py-1 rounded-full border font-black text-[11px] ${KIND[e.kind].color}`}>{KIND[e.kind].label} · {dur(e.seconds)}</span>
                  <span className="text-[#3A241F] font-bold flex-1">{toPersianDigits(e.detail)}</span>
                  <span className="text-[#8C6F66] text-[11px] shrink-0">{when(e.at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
