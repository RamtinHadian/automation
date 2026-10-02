import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, DatabaseBackup, Download, HardDriveDownload, Loader2, Network, RotateCcw, Save, ShieldCheck, Wifi } from 'lucide-react';
import { api, BackupInfo, BackupSettings } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { formatJalaliFullTimestamp, toPersianDigits } from '../../lib/jalali';

const size = (n: number) => (n >= 1048576 ? `${toPersianDigits((n / 1048576).toFixed(1))} مگابایت` : `${toPersianDigits(Math.max(1, Math.round(n / 1024)))} کیلوبایت`);
const when = (iso: string) => toPersianDigits(formatJalaliFullTimestamp(new Date(iso)));
const KIND: Record<string, { label: string; cls: string }> = {
  auto: { label: 'خودکار', cls: 'bg-sky-100 text-sky-800' },
  manual: { label: 'دستی', cls: 'bg-amber-100 text-amber-800' },
  prerestore: { label: 'ایمنی قبل از بازگردانی', cls: 'bg-violet-100 text-violet-800' },
};
// stored like JS getDay(): 0 = Sunday ... 6 = Saturday; shown starting from Saturday
const DAYS: { n: number; label: string }[] = [
  { n: 6, label: 'شنبه' },
  { n: 0, label: 'یکشنبه' },
  { n: 1, label: 'دوشنبه' },
  { n: 2, label: 'سه‌شنبه' },
  { n: 3, label: 'چهارشنبه' },
  { n: 4, label: 'پنجشنبه' },
  { n: 5, label: 'جمعه' },
];
/** Plain-Persian explanation of the usual network-folder errors (the raw text stays visible after it). */
const smbHelp = (t?: string) => {
  const x = t || '';
  if (x.includes('PASSWORD_MUST_CHANGE') || x.includes('PASSWORD_EXPIRED')) return 'رمز این کاربر در ویندوز/NAS منقضی شده یا تیک «کاربر باید در ورود بعدی رمز را عوض کند» دارد. یک‌بار با همین کاربر وارد آن کامپیوتر شوید و رمز تازه بگذارید (یا تیک را بردارید و «رمز هرگز منقضی نشود» را بزنید)، سپس رمز تازه را اینجا بنویسید.';
  if (x.includes('LOGON_FAILURE')) return 'نام کاربری یا رمز اشتباه است.';
  if (x.includes('ACCOUNT_DISABLED') || x.includes('ACCOUNT_LOCKED')) return 'این کاربر در ویندوز/NAS غیرفعال یا قفل شده است.';
  if (x.includes('BAD_NETWORK_NAME')) return 'نام پوشهٔ اشتراکی (Share) روی آن سرور پیدا نشد؛ نامش را دقیق بنویسید.';
  if (x.includes('ACCESS_DENIED')) return 'این کاربر اجازهٔ نوشتن در این پوشه را ندارد؛ در تنظیمات اشتراک، دسترسی «تغییر / Write» به او بدهید.';
  if (x.includes('UNREACHABLE') || x.includes('CONNECTION_REFUSED') || x.includes('Connection to') || x.includes('timed out')) return 'به آن سرور دسترسی نیست؛ آدرس را بررسی کنید و مطمئن شوید روشن است و فایروال پورت ۴۴۵ را نبسته است.';
  return '';
};
const input = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block text-[11px] font-black text-[#3A241F] mb-1.5';
const card = 'bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 sm:p-6 space-y-4';

const Switch: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative w-11 h-6 rounded-full shrink-0 cursor-pointer transition-colors" style={{ background: on ? '#0E8F5B' : '#D6CBC4' }}>
    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ right: on ? 'calc(100% - 22px)' : 2 }} />
  </button>
);

/** Backup of the whole database: schedule, network folder, extra copy, download and (after a clear question) restore. */
export const BackupSettingsCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const before = useRef<string>('');
  const [cfg, setCfg] = useState<BackupSettings | null>(null);
  const [pass, setPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [askRestore, setAskRestore] = useState<{ name: string; at: string } | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(() => {
    api.backups().then((r) => { setInfo(r); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    api.backupSettings().then(setCfg).catch(() => {});
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (waiting && info && !info.pending && info.items[0]?.name !== before.current) {
      setWaiting(false);
      showToast(info.status?.result === 'error' ? 'تهیهٔ پشتیبان ناموفق بود: ' + info.status.text : 'نسخهٔ پشتیبان آماده شد.');
    }
  }, [info, waiting, showToast]);
  useEffect(() => {
    if (testing && info && !info.nettestPending && info.nettest) setTesting(false);
  }, [info, testing]);

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
  const save = async (): Promise<boolean> => {
    if (!cfg) return false;
    setSaving(true);
    try {
      const saved = await api.backupSaveSettings({ ...cfg, netPassword: pass });
      setCfg(saved);
      setPass('');
      showToast('تنظیمات پشتیبان‌گیری ذخیره شد.');
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
      return false;
    } finally {
      setSaving(false);
    }
  };
  const testNet = async () => {
    if (!(await save())) return;
    setTesting(true);
    try {
      await api.backupNetTest();
      load();
    } catch {
      setTesting(false);
      showToast('درخواست آزمایش ارسال نشد.');
    }
  };
  const startRestore = async () => {
    if (!askRestore) return;
    const target = askRestore;
    setAskRestore(null);
    setUnderstood(false);
    try {
      await api.backupRestore(target.name);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'بازگردانی شروع نشد.');
      return;
    }
    setRestoring(target.name);
  };
  // while restoring: wait for the backup service to finish, then reload the page (the server restarts by itself)
  useEffect(() => {
    if (!restoring) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.restoreStatus();
        if (stop || s.restoring) return;
        if (s.result === 'ok') {
          stop = true;
          window.setTimeout(() => window.location.reload(), 7000);
        } else if (s.result === 'error') {
          stop = true;
          setRestoring(null);
          showToast('بازگردانی انجام نشد و اطلاعات فعلی دست‌نخورده ماند: ' + (s.text || ''));
        }
      } catch {
        /* the server is restarting: keep waiting */
      }
    };
    const t = window.setInterval(tick, 2000);
    return () => { stop = true; window.clearInterval(t); };
  }, [restoring, showToast]);

  if (failed && !info) return <div className="bg-white rounded-3xl border border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">فقط «مدیر ارشد سامانه» به بخش پشتیبان‌گیری دسترسی دارد.</div>;
  if (!info || !cfg) return <div className="py-16 text-center text-xs font-bold text-[#8C6F66]">در حال خواندن…</div>;
  const last = info.items.find((i) => i.kind !== 'prerestore');
  const err = info.status?.result === 'error';
  const set = (p: Partial<BackupSettings>) => setCfg({ ...cfg, ...p });
  const daily = cfg.scheduleMode !== 'interval';
  const days = cfg.scheduleDays?.length ? cfg.scheduleDays : [0, 1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-4 text-right">
      {restoring && (
        <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" dir="rtl">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-3 shadow-2xl">
            <Loader2 className="w-10 h-10 mx-auto text-[#6E1B1B] animate-spin" />
            <div className="font-black text-sm text-[#3A241F]">در حال بازگردانی اطلاعات…</div>
            <p className="text-[12px] leading-6 text-[#8C6F66]">لطفاً این صفحه را نبندید. سامانه چند لحظه در دسترس نیست و پس از پایان خودکار دوباره باز می‌شود.</p>
          </div>
        </div>
      )}

      {askRestore && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl border border-rose-200 shadow-2xl w-full max-w-md p-6 space-y-4 text-right">
            <div className="flex items-center gap-2 font-black text-sm text-rose-800">
              <AlertTriangle className="w-5 h-5" />
              آیا برای بازگردانی (ریستور) مطمئن هستید؟
            </div>
            <p className="text-[13px] leading-7 text-[#3A241F]">
              اطلاعات کل سامانه به نسخهٔ پشتیبان <b>{when(askRestore.at)}</b> برمی‌گردد. <b>هرچه بعد از آن زمان ثبت شده</b> (نامه، فایل، وظیفه، مشتری، کاربر و…) از بین می‌رود.
            </p>
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-3 text-[11px] leading-6 text-violet-900 font-bold">قبل از شروع، از وضعیت فعلی یک نسخهٔ ایمنی گرفته می‌شود تا در صورت پشیمانی بتوانید به همین الان برگردید. این کار در گزارش رویدادها ثبت می‌شود.</div>
            <label className="flex items-start gap-2 text-[12px] font-bold text-[#3A241F] cursor-pointer">
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-1 w-4 h-4 accent-rose-700" />
              می‌دانم که اطلاعات بعد از این نسخه از بین می‌رود و می‌خواهم ادامه دهم.
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setAskRestore(null); setUnderstood(false); }} className="px-4 py-2 text-xs font-bold text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] rounded-xl cursor-pointer">انصراف</button>
              <button type="button" disabled={!understood} onClick={startRestore} className="px-4 py-2 text-xs font-black text-white bg-rose-700 hover:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl cursor-pointer">بله، مطمئنم؛ بازگردانی کن</button>
            </div>
          </div>
        </div>
      )}

      {/* status + backup now */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shrink-0">
              <DatabaseBackup className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-sm text-[#3A241F]">پشتیبان‌گیری از کل اطلاعات</h3>
              <p className="text-[11px] text-[#8C6F66] leading-6 mt-0.5">از تمام اطلاعات سامانه (کاربران، نامه‌ها، فایل‌ها، وظایف، مشتریان و تنظیمات) یک نسخهٔ کامل گرفته می‌شود؛ ۳۰ روز اخیر روی سرور می‌ماند.</p>
            </div>
          </div>
          <button type="button" onClick={make} disabled={waiting || info.pending || !info.enabled} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-60 text-white text-xs font-black cursor-pointer">
            {waiting || info.pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDriveDownload className="w-4 h-4" />}
            {waiting || info.pending ? 'در حال تهیهٔ نسخه…' : 'تهیهٔ پشتیبان همین حالا'}
          </button>
        </div>
        {!info.enabled ? (
          <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-800 font-bold"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />سرویس پشتیبان‌گیری روی این سرور فعال نیست (پوشهٔ backups پیدا نشد). پس از به‌روزرسانی سرور فعال می‌شود.</div>
        ) : err ? (
          <div className="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-800 font-bold"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />آخرین تلاش ناموفق بود ({when(info.status!.at)}): {info.status!.text}</div>
        ) : last ? (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-[12px] text-emerald-900 font-bold"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />آخرین نسخه: {when(last.at)} ({size(last.size)}) — پس از ساخت، خوانا بودنش بررسی شده است.</div>
            {info.status?.net === 'ok' && <div className="text-[11px] font-bold text-emerald-800 px-1">✓ همین نسخه در پوشهٔ شبکه هم کپی شد.</div>}
            {info.status?.net === 'error' && <div className="text-[11px] font-bold text-rose-700 px-1">✗ کپی در پوشهٔ شبکه انجام نشد. {smbHelp(info.status.netText) || info.status.netText}</div>}
          </div>
        ) : (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900 font-bold">هنوز نسخه‌ای گرفته نشده؛ «تهیهٔ پشتیبان همین حالا» را بزنید.</div>
        )}
      </div>

      {/* schedule */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><CalendarClock className="w-4 h-4 text-[#6E1B1B]" />زمان‌بندی پشتیبان‌گیری خودکار</div>
          <Switch on={cfg.scheduleEnabled !== false} onChange={(v) => set({ scheduleEnabled: v })} label="پشتیبان‌گیری خودکار" />
        </div>
        {cfg.scheduleEnabled !== false && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {([['daily', 'در ساعت مشخص، روزهای انتخابی'], ['interval', 'هر چند ساعت یک‌بار']] as const).map(([m, t]) => (
                <button key={m} type="button" onClick={() => set({ scheduleMode: m })} className={`px-3.5 py-2 rounded-xl text-[11px] font-black cursor-pointer border ${(m === 'daily') === daily ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-[#FAF5F1] text-[#3A241F] border-[#EBDBCE]'}`}>{t}</button>
              ))}
            </div>
            {daily ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                <div>
                  <label className={lab}>ساعت پشتیبان‌گیری</label>
                  <div className="flex items-center gap-2" dir="ltr">
                    <select value={(cfg.scheduleTime || '02:00').split(':')[0]} onChange={(e) => set({ scheduleTime: `${e.target.value}:${(cfg.scheduleTime || '02:00').split(':')[1]}` })} className={input} aria-label="ساعت">
                      {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => <option key={h} value={h}>{toPersianDigits(h)}</option>)}
                    </select>
                    <span className="font-black text-[#3A241F]">:</span>
                    <select value={(cfg.scheduleTime || '02:00').split(':')[1]} onChange={(e) => set({ scheduleTime: `${(cfg.scheduleTime || '02:00').split(':')[0]}:${e.target.value}` })} className={input} aria-label="دقیقه">
                      {Array.from({ length: 12 }, (_, m) => String(m * 5).padStart(2, '0')).map((m) => <option key={m} value={m}>{toPersianDigits(m)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={lab}>روزهای هفته</label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const on = days.includes(d.n);
                      return (
                        <button key={d.n} type="button" onClick={() => set({ scheduleDays: on ? days.filter((x) => x !== d.n) : [...days, d.n] })} className={`px-3 py-2 rounded-xl text-[11px] font-black cursor-pointer border ${on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-[#FAF5F1] text-[#8C6F66] border-[#EBDBCE]'}`}>{d.label}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-xs">
                <label className={lab}>هر چند ساعت یک‌بار؟</label>
                <input type="number" min={1} max={168} value={cfg.scheduleEveryHours ?? 6} onChange={(e) => set({ scheduleEveryHours: parseInt(e.target.value) || 6 })} className={input} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* network folder */}
      <div className={card}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><Network className="w-4 h-4 text-[#6E1B1B]" />ارسال نسخه‌ها به پوشهٔ شبکه</div>
          <Switch on={!!cfg.netEnabled} onChange={(v) => set({ netEnabled: v })} label="ارسال به پوشهٔ شبکه" />
        </div>
        <p className="text-[11px] text-[#8C6F66] leading-6">هر نسخهٔ جدید، خودکار در یک پوشهٔ اشتراکی ویندوز یا NAS هم ذخیره می‌شود (مثل <b dir="ltr">\\192.168.1.20\Backup</b>). نسخه‌های روی پوشهٔ شبکه خودکار پاک نمی‌شوند.</p>
        {cfg.netEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lab}>آدرس سرور (IP یا نام)</label>
              <input dir="ltr" value={cfg.netHost || ''} onChange={(e) => set({ netHost: e.target.value })} placeholder="192.168.1.20" className={`${input} text-right font-mono`} />
            </div>
            <div>
              <label className={lab}>نام پوشهٔ اشتراکی (Share)</label>
              <input dir="ltr" value={cfg.netShare || ''} onChange={(e) => set({ netShare: e.target.value })} placeholder="Backup" className={`${input} text-right font-mono`} />
            </div>
            <div>
              <label className={lab}>زیرپوشه (اختیاری)</label>
              <input dir="ltr" value={cfg.netFolder || ''} onChange={(e) => set({ netFolder: e.target.value })} placeholder="hoormand" className={`${input} text-right font-mono`} />
            </div>
            <div>
              <label className={lab}>دامنه (اختیاری)</label>
              <input dir="ltr" value={cfg.netDomain || ''} onChange={(e) => set({ netDomain: e.target.value })} placeholder="WORKGROUP" className={`${input} text-right font-mono`} />
            </div>
            <div>
              <label className={lab}>نام کاربری</label>
              <input dir="ltr" value={cfg.netUser || ''} onChange={(e) => set({ netUser: e.target.value })} className={`${input} text-right font-mono`} />
            </div>
            <div>
              <label className={lab}>رمز عبور</label>
              <input type="password" dir="ltr" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={cfg.hasPassword ? 'ذخیره شده — برای تغییر، رمز جدید را بنویسید' : ''} autoComplete="new-password" className={`${input} text-right font-mono`} />
            </div>
          </div>
        )}
        {cfg.netEnabled && (
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={testNet} disabled={testing || saving} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAF5F1] hover:bg-[#EBDBCE] border border-[#EBDBCE] text-[#6E1B1B] text-xs font-black cursor-pointer disabled:opacity-60">
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
              ذخیره و آزمایش اتصال
            </button>
            {info.nettest && !testing && (
              <span className={`text-[11px] font-bold ${info.nettest.result === 'ok' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {info.nettest.result === 'ok' ? '✓ اتصال برقرار است و پوشه در دسترس است.' : '✗ اتصال برقرار نشد. ' + (smbHelp(info.nettest.text) || info.nettest.text)}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-60 text-white text-xs font-black cursor-pointer">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          ذخیرهٔ تنظیمات پشتیبان‌گیری
        </button>
      </div>

      {/* list */}
      {info.items.length > 0 && (
        <div className={card}>
          <div className="font-black text-sm text-[#3A241F]">نسخه‌های ذخیره‌شده روی سرور</div>
          <div className="overflow-x-auto rounded-2xl border border-[#EBDBCE]">
            <table className="w-full text-[11px] min-w-[420px]">
              <thead className="bg-[#FAF5F1] text-[#8C6F66]">
                <tr>
                  <th className="text-right py-2 px-3 font-black">زمان تهیه</th>
                  <th className="text-right py-2 px-3 font-black">نوع</th>
                  <th className="text-right py-2 px-3 font-black">حجم</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBDBCE]/70">
                {info.items.slice(0, 20).map((b) => (
                  <tr key={b.name} className="hover:bg-[#FAF5F1]/60">
                    <td className="py-2 px-3 font-bold text-[#3A241F]">{when(b.at)}</td>
                    <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full font-black whitespace-nowrap ${KIND[b.kind]?.cls}`}>{KIND[b.kind]?.label}</span></td>
                    <td className="py-2 px-3 text-[#503730] whitespace-nowrap">{size(b.size)}</td>
                    <td className="py-2 px-3 text-left whitespace-nowrap">
                      <button type="button" onClick={() => download(b.name)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF5F1] hover:bg-[#EBDBCE] text-[#6E1B1B] font-black cursor-pointer"><Download className="w-3.5 h-3.5" />دانلود</button>
                      <button type="button" onClick={() => { setUnderstood(false); setAskRestore({ name: b.name, at: b.at }); }} className="inline-flex items-center gap-1 px-2.5 py-1 mr-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-black cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />بازگردانی</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {info.items.length > 20 && <div className="p-2 text-center text-[10px] text-[#8C6F66] bg-[#FAF5F1]">{toPersianDigits(info.items.length - 20)} نسخهٔ قدیمی‌تر در پوشهٔ backups روی سرور هست.</div>}
          </div>
        </div>
      )}

      <div className={`${card} text-[12px] leading-7 text-[#3A241F]`}>
        <div className="flex items-center gap-2 font-black text-sm"><ShieldCheck className="w-4 h-4 text-emerald-700" />نکته‌های امنیتی</div>
        <ul className="list-disc pr-5 space-y-1.5">
          <li>اگر هارد سرور خراب شود نسخه‌های روی همان سرور هم از بین می‌روند؛ پوشهٔ شبکه را فعال کنید یا هر هفته یک نسخه را دانلود و جای دیگر نگه دارید.</li>
          <li>فایل پشتیبان همهٔ اطلاعات شرکت (و رمزهای سرویس‌ها) را دارد؛ مثل رمز نگهداری‌اش کنید. دانلود، تغییر تنظیمات و بازگردانی در گزارش رویدادها ثبت می‌شود.</li>
          <li>اگر سامانه کلاً بالا نمی‌آید، روی سرور بنویسید: <code dir="ltr" className="bg-[#FAF5F1] border border-[#EBDBCE] rounded px-1.5 py-0.5 font-mono text-[11px]">./restore.sh backups/نام-فایل.dump</code></li>
        </ul>
      </div>
    </div>
  );
};
