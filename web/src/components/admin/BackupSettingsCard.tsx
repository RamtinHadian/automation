import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, HardDriveDownload, Loader2, ShieldCheck } from 'lucide-react';
import { api, BackupInfo } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { formatJalaliFullTimestamp, toPersianDigits } from '../../lib/jalali';

const size = (n: number) => (n >= 1048576 ? `${toPersianDigits((n / 1048576).toFixed(1))} مگابایت` : `${toPersianDigits(Math.max(1, Math.round(n / 1024)))} کیلوبایت`);
const when = (iso: string) => toPersianDigits(formatJalaliFullTimestamp(new Date(iso)));

/** Backup of the whole database: nightly copies made by the server, one-click extra copy, download, and how to restore. */
export const BackupSettingsCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const before = useRef<string>('');

  const load = useCallback(() => {
    api.backups().then((r) => { setInfo(r); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (waiting && info && !info.pending && info.items[0]?.name !== before.current) {
      setWaiting(false);
      showToast(info.status?.result === 'error' ? 'تهیهٔ پشتیبان ناموفق بود: ' + info.status.text : 'نسخهٔ پشتیبان آماده شد.');
    }
  }, [info, waiting, showToast]);

  const make = async () => {
    before.current = info?.items[0]?.name || '';
    setWaiting(true);
    try {
      await api.backupNow();
      load();
    } catch (e) {
      setWaiting(false);
      showToast(e instanceof Error ? e.message : 'درخواست ارسال نشد.');
    }
  };
  const download = async (name: string) => {
    try {
      await api.backupDownload(name);
    } catch {
      showToast('دانلود فایل پشتیبان ممکن نشد.');
    }
  };

  if (failed && !info) return <div className="bg-white rounded-3xl border border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">فقط «مدیر ارشد سامانه» به بخش پشتیبان‌گیری دسترسی دارد.</div>;
  if (!info) return <div className="py-16 text-center text-xs font-bold text-[#8C6F66]">در حال خواندن…</div>;
  const last = info.items[0];
  const err = info.status?.result === 'error';

  return (
    <div className="space-y-4 text-right">
      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-sm text-[#3A241F]">پشتیبان‌گیری از کل اطلاعات</h3>
              <p className="text-[11px] text-[#8C6F66] leading-6 mt-0.5">
                هر شب ساعت ۲ از تمام اطلاعات سامانه (کاربران، نامه‌ها، فایل‌ها، وظایف، مشتریان و تنظیمات) یک نسخهٔ کامل گرفته می‌شود و ۳۰ روز اخیر نگه‌داشته می‌شود.
              </p>
            </div>
          </div>
          <button type="button" onClick={make} disabled={waiting || info.pending || !info.enabled} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-60 text-white text-xs font-black cursor-pointer">
            {waiting || info.pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
            {waiting || info.pending ? 'در حال تهیهٔ نسخه…' : 'تهیهٔ پشتیبان همین حالا'}
          </button>
        </div>

        {!info.enabled ? (
          <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-800 font-bold">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            سرویس پشتیبان‌گیری روی این سرور فعال نیست (پوشهٔ backups پیدا نشد). پس از به‌روزرسانی سرور فعال می‌شود.
          </div>
        ) : err ? (
          <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-800 font-bold">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            آخرین تلاش ناموفق بود ({when(info.status!.at)}): {info.status!.text}
          </div>
        ) : last ? (
          <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-[12px] text-emerald-900 font-bold">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            آخرین نسخه: {when(last.at)} ({size(last.size)}) — پس از ساخت، خوانا بودنش بررسی شده است.
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900 font-bold">هنوز نسخه‌ای گرفته نشده؛ «تهیهٔ پشتیبان همین حالا» را بزنید.</div>
        )}

        {info.items.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-[#EBDBCE]">
            <table className="w-full text-[11px]">
              <thead className="bg-[#FAF5F1] text-[#8C6F66]">
                <tr>
                  <th className="text-right py-2 px-3 font-black">زمان تهیه</th>
                  <th className="text-right py-2 px-3 font-black">نوع</th>
                  <th className="text-right py-2 px-3 font-black">حجم</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBDBCE]/70">
                {info.items.slice(0, 15).map((b) => (
                  <tr key={b.name} className="hover:bg-[#FAF5F1]/60">
                    <td className="py-2 px-3 font-bold text-[#3A241F]">{when(b.at)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full font-black ${b.kind === 'auto' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>{b.kind === 'auto' ? 'خودکار شبانه' : 'دستی'}</span>
                    </td>
                    <td className="py-2 px-3 text-[#503730]">{size(b.size)}</td>
                    <td className="py-2 px-3 text-left">
                      <button type="button" onClick={() => download(b.name)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF5F1] hover:bg-[#EBDBCE] text-[#6E1B1B] font-black cursor-pointer">
                        <Download className="w-3.5 h-3.5" />
                        دانلود
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {info.items.length > 15 && <div className="p-2 text-center text-[10px] text-[#8C6F66] bg-[#FAF5F1]">{toPersianDigits(info.items.length - 15)} نسخهٔ قدیمی‌تر در پوشهٔ backups روی سرور هست.</div>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 sm:p-6 space-y-3 text-[12px] leading-7 text-[#3A241F]">
        <div className="flex items-center gap-2 font-black text-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          برای امن ماندن اطلاعات، چه کار کنیم؟
        </div>
        <ol className="list-decimal pr-5 space-y-1.5">
          <li>نسخه‌ها در پوشهٔ <b dir="ltr">backups</b> کنار برنامه روی سرور ذخیره می‌شوند. اگر هارد سرور خراب شود، آن‌ها هم از بین می‌روند؛ پس هفته‌ای یک‌بار آخرین نسخه را از همین صفحه دانلود کنید و روی یک دیسک یا کامپیوتر دیگر نگه دارید.</li>
          <li>فایل پشتیبان شامل همهٔ اطلاعات شرکت است؛ مثل رمز نگهداری‌اش کنید و در دسترس دیگران نگذارید. دانلود هر نسخه در گزارش رویدادها ثبت می‌شود.</li>
          <li>
            برای برگرداندن اطلاعات (فقط هنگام خرابی) روی سرور بنویسید: <code dir="ltr" className="bg-[#FAF5F1] border border-[#EBDBCE] rounded px-1.5 py-0.5 font-mono text-[11px]">./restore.sh backups/نام-فایل.dump</code>
            <br />
            این کار اول از وضعیت فعلی یک نسخهٔ ایمنی می‌گیرد، سپس اطلاعات را به زمان همان پشتیبان برمی‌گرداند. هرچه بعد از آن ثبت شده باشد از بین می‌رود.
          </li>
        </ol>
      </div>
    </div>
  );
};
