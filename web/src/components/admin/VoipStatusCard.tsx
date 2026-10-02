import React, { useCallback, useEffect, useState } from 'react';
import { PhoneCall, RefreshCw } from 'lucide-react';
import { api, VoipStatRow, VoipCall } from '../../lib/api';
import { CallList } from '../common/CallLog';
import { formatTaskDate } from '../../lib/taskDates';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';

interface VoipLog {
  enabled: boolean;
  connected: boolean;
  eventCount: number;
  lastEvent: string | null;
  entries: { at: string; text: string }[];
}

const time = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

/** Connection state of the company phone system plus a diary of what happened to recent calls. */
export const VoipStatusCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [log, setLog] = useState<VoipLog | null>(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<{ byDay: VoipStatRow[]; byExt: VoipStatRow[] } | null>(null);
  const [recent, setRecent] = useState<VoipCall[]>([]);

  const load = useCallback(() => {
    api
      .voipLog()
      .then((l) => {
        setLog(l);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'خواندن وضعیت ممکن نشد.'));
  }, []);

  useEffect(() => {
    load();
    const loadCalls = () => {
      api.voipStats().then(setStats).catch(() => {});
      api.voipCalls({ scope: 'all', limit: 40 }).then((r) => setRecent(r.calls)).catch(() => {});
    };
    loadCalls();
    const t2 = setInterval(loadCalls, 20000);
    const t = setInterval(load, 5000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [load]);

  const state = !log ? null : !log.enabled ? 'off' : log.connected ? 'on' : 'down';
  const badge =
    state === 'on'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : state === 'down'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-slate-100 text-slate-600 border-slate-200';
  const stateText = state === 'on' ? 'متصل' : state === 'down' ? 'قطع' : state === 'off' ? 'تنظیم نشده' : '...';

  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-emerald-700" />
          ارتباط با تلفن سازمان (ویپ)
          <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black ${badge}`}>{stateText}</span>
        </h3>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
            تازه‌سازی
          </button>
          <button
            type="button"
            onClick={() =>
              api
                .voipTestPopup()
                .then(() => showToast('پاپ‌آپ آزمایشی برای شما فرستاده شد.'))
                .catch(() => showToast('ارسال آزمایش ممکن نشد.'))
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer"
          >
            ارسال پاپ‌آپ تماس آزمایشی
          </button>
        </div>
      </div>

      {error && <div className="text-rose-600 font-bold">{error}</div>}

      {log && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2">
              <span className="block text-[10px] text-[#8C6F66]">رویدادهای دریافتی از صندوق تلفن</span>
              <b>{toPersianDigits(log.eventCount)}</b>
            </div>
            <div className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2">
              <span className="block text-[10px] text-[#8C6F66]">آخرین رویداد</span>
              <b>{log.lastEvent ? time(log.lastEvent) : 'هنوز چیزی نیامده'}</b>
            </div>
            <div className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2">
              <span className="block text-[10px] text-[#8C6F66]">وضعیت</span>
              <b>{state === 'on' ? 'منتظر تماس' : state === 'down' ? 'در حال تلاش برای اتصال' : 'اتصال تنظیم نشده'}</b>
            </div>
          </div>

          {stats && stats.byDay.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
                <div className="px-3 py-2 bg-[#FAF5F1] font-black">تماس‌های ۷ روز اخیر</div>
                <table className="w-full text-center">
                  <thead><tr className="text-[10px] text-[#8C6F66]"><th className="py-1">روز</th><th>کل</th><th>پاسخ</th><th>بی‌پاسخ</th><th>مدت</th></tr></thead>
                  <tbody>
                    {stats.byDay.map((r) => (
                      <tr key={r.key} className="border-t border-[#EBDBCE]/60">
                        <td className="py-1.5 font-bold">{formatTaskDate(r.key)}</td>
                        <td>{toPersianDigits(r.total)}</td>
                        <td className="text-emerald-700 font-bold">{toPersianDigits(r.answered)}</td>
                        <td className="text-rose-600 font-bold">{toPersianDigits(r.missed)}</td>
                        <td>{toPersianDigits(Math.round(r.seconds / 60))} د</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
                <div className="px-3 py-2 bg-[#FAF5F1] font-black">به تفکیک شمارهٔ داخلی</div>
                <table className="w-full text-center">
                  <thead><tr className="text-[10px] text-[#8C6F66]"><th className="py-1">داخلی</th><th>کل</th><th>پاسخ</th><th>بی‌پاسخ</th><th>مدت</th></tr></thead>
                  <tbody>
                    {stats.byExt.map((r) => (
                      <tr key={r.key} className="border-t border-[#EBDBCE]/60">
                        <td className="py-1.5 font-bold">{toPersianDigits(r.key)}</td>
                        <td>{toPersianDigits(r.total)}</td>
                        <td className="text-emerald-700 font-bold">{toPersianDigits(r.answered)}</td>
                        <td className="text-rose-600 font-bold">{toPersianDigits(r.missed)}</td>
                        <td>{toPersianDigits(Math.round(r.seconds / 60))} د</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
              <div className="px-3 py-2 bg-[#FAF5F1] font-black">آخرین تماس‌های شرکت</div>
              <div className="max-h-72 overflow-y-auto">
                <CallList calls={recent} showUser />
              </div>
            </div>
          )}

          <p className="text-[#8C6F66] leading-6">
            با یک تماس واقعی به داخلی یکی از همکاران، باید چند خط در دفترچهٔ زیر بیاید. اگر «رویدادها» بالا نمی‌روند، صندوق تلفن رویدادی نمی‌فرستد. اگر «داخلی … زنگ می‌خورد اما کاربری ندارد» دیدید، شمارهٔ داخلی آن همکار را در فرم کاربر وارد کنید.
          </p>

          <div className="rounded-2xl border border-[#EBDBCE] max-h-64 overflow-y-auto divide-y divide-[#EBDBCE]/60">
            {log.entries.length === 0 ? (
              <div className="py-6 text-center text-gray-400 font-bold">هنوز چیزی ثبت نشده است.</div>
            ) : (
              log.entries.map((e, i) => (
                <div key={i} className="flex gap-3 px-3 py-2">
                  <span className="text-[#8C6F66] shrink-0 font-mono">{time(e.at)}</span>
                  <span className="text-[#3A241F] break-words min-w-0">{toPersianDigits(e.text)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
