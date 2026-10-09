import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, Save, Send } from 'lucide-react';
import { api, SmsLogRow, SmsSettings } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { DEFAULT_SMS_KEYS, SMS_GROUPS, SMS_LIBRARY } from '../../lib/smsLibrary';

/** Which notifications may also arrive as an SMS (for people who have a mobile number). */
const EVENTS: { label: string; title: string }[] = [
  { label: 'جهت امضا', title: 'نامه‌ای که باید امضا کنند' },
  { label: 'وظیفه جدید', title: 'وظیفهٔ جدید' },
  { label: 'موعد امروز', title: 'موعد وظیفه امروز است' },
  { label: 'موعد گذشته', title: 'موعد وظیفه گذشته است' },
  { label: 'تماس بی‌پاسخ', title: 'تماس بی‌پاسخ' },
  { label: 'پیگیری امروز', title: 'پیگیری مشتری امروز' },
  { label: 'پیگیری عقب‌افتاده', title: 'پیگیری مشتری عقب‌افتاده' },
  { label: 'فروش موفق', title: 'فروش موفق (مدیران)' },
];

const box = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block font-bold text-[#3A241F] mb-1.5';

export const SmsSettingsCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [s, setS] = useState<SmsSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [balance, setBalance] = useState('');
  const [testTo, setTestTo] = useState('');
  const [log, setLog] = useState<SmsLogRow[]>([]);
  const [templates, setTemplates] = useState<{ key: string; title: string; when: string; sample: string }[]>([]);
  const [preview, setPreview] = useState<string | null>(null);

  const loadLog = useCallback(() => api.smsLog().then((r) => setLog(r.log)).catch(() => {}), []);
  useEffect(() => {
    api.smsSettings().then(setS).catch(() => showToast('خواندن تنظیمات پیامک ممکن نشد.'));
    api.smsTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
    void loadLog();
  }, [loadLog, showToast]);

  if (!s) return <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] text-xs text-gray-400 font-bold">در حال بارگذاری...</div>;

  const patch = (u: Partial<SmsSettings>) => setS((p) => (p ? { ...p, ...u } : p));
  const chosen = s.library ?? DEFAULT_SMS_KEYS;
  const toggleReady = (k: string) => patch({ library: chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k] });
  const toggleAuto = (k: string) => patch({ auto: (s.auto || []).includes(k) ? (s.auto || []).filter((x) => x !== k) : [...(s.auto || []), k] });
  const toggleLabel = (l: string) => patch({ labels: s.labels.includes(l) ? s.labels.filter((x) => x !== l) : [...s.labels, l] });

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.smsSave({ footer: s.footer, auto: s.auto || [], library: s.library ?? DEFAULT_SMS_KEYS, custom: [], sender: s.sender, enabled: s.enabled, labels: s.labels, apiKey });
      setS(r);
      setApiKey('');
      showToast('تنظیمات پیامک ذخیره شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };

  const checkBalance = async () => {
    setBalance('...');
    try {
      setBalance((await api.smsBalance()).balance);
    } catch (e) {
      setBalance(e instanceof Error ? e.message : 'خطا');
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      await api.smsTest(testTo);
      showToast('پیامک آزمایشی ارسال شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
      void loadLog();
    }
  };

  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-5 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-sky-700" />
          اتصال به پنل پیامک
          <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black ${s.enabled && s.hasKey ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {s.enabled && s.hasKey ? 'فعال' : 'غیرفعال'}
          </span>
        </h3>
        <button type="button" disabled={busy} onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] disabled:opacity-50 cursor-pointer">
          <Save className="w-4 h-4" />
          ذخیرهٔ تنظیمات پیامک
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={lab}>سرویس‌دهنده:</label>
          <div className={`${box} opacity-80`}>کاوه‌نگار (kavenegar.com)</div>
        </div>
        <div>
          <label className={lab}>شمارهٔ خط ارسال‌کننده:</label>
          <input className={box} dir="ltr" value={s.sender} onChange={(e) => patch({ sender: e.target.value })} placeholder="مثلاً 10004346 (فقط عدد)" />
        </div>
        <div className="md:col-span-2">
          <label className={lab}>
            کلید API {s.hasKey && <span className="text-emerald-700">(ثبت شده، آخرین چهار نویسه: {s.keyTail})</span>}
          </label>
          <input
            className={`${box} font-mono`}
            dir="ltr"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={s.hasKey ? 'برای نگه‌داشتن کلید فعلی خالی بگذارید' : 'کلید API را از پنل کاوه‌نگار بردارید'}
          />
          <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">کلید فقط روی سرور نگه‌داری می‌شود و دوباره نمایش داده نمی‌شود.</p>
        </div>
      </div>

      <div>
        <label className={lab}>خط پایانی همهٔ پیامک‌ها (نشانی وب‌سایت یا نام شرکت):</label>
        <input className={box} value={s.footer} maxLength={100} onChange={(e) => patch({ footer: e.target.value })} placeholder={s.defaultFooter || 'نام شرکت'} />
        <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">این خط زیر متن هر پیامکی که سامانه می‌فرستد (اعلان‌ها، پیامک مشتریان، آزمایشی و …) خودکار اضافه می‌شود. اگر خالی بگذارید، نام شرکت نوشته می‌شود.</p>
        {(s.footer || s.defaultFooter) && <div className="mt-2 rounded-xl border border-dashed border-[#EBDBCE] bg-[#FDFAF7] px-3 py-2 text-[11px] font-bold text-[#503730] leading-6 whitespace-pre-line">{'نمونه: متن پیامک' + '\n' + (s.footer || s.defaultFooter)}</div>}
      </div>

      <label className="flex items-center gap-2 font-bold text-[#3A241F]">
        <input type="checkbox" checked={s.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        ارسال پیامک در سامانه فعال باشد
      </label>

      <div>
        <div className="font-bold text-[#3A241F] mb-1.5">این ناتیف‌ها علاوه بر خود سامانه، پیامک هم بشوند (برای کسانی که شمارهٔ موبایل دارند):</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {EVENTS.map((ev) => (
            <label key={ev.label} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] font-bold text-[#3A241F] cursor-pointer">
              <input type="checkbox" checked={s.labels.includes(ev.label)} onChange={() => toggleLabel(ev.label)} />
              {ev.title}
            </label>
          ))}
        </div>
        <p className="text-[10px] text-[#8C6F66] mt-1.5 leading-5">شمارهٔ موبایل هر کاربر را در «کاربران و سهمیه‌ها ← ویرایش» وارد کنید.</p>
      </div>

      <div data-sms-library>
        <div className="font-bold text-[#3A241F] mb-1">قالب‌های آمادهٔ پیامک (برای پنجرهٔ «ارسال پیامک» در پروندهٔ مشتری):</div>
        <p className="text-[10px] text-[#8C6F66] mb-2 leading-5">هر قالبی را که تیک بزنید، به‌صورت یک دکمه در پنجرهٔ ارسال پیامک می‌آید و همکار با یک لمس متنش را برمی‌دارد (می‌تواند قبل از ارسال ویرایشش کند). در متن، «{'{name}'}» با نام مشتری عوض می‌شود. نیازی به ذخیره‌ی جدا نیست؛ همان دکمهٔ «ذخیرهٔ تنظیمات پیامک» بالای کارت.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          <button type="button" onClick={() => patch({ library: SMS_LIBRARY.map((t) => t.key) })} className="px-3 py-1.5 min-h-[34px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black cursor-pointer">انتخاب همه</button>
          <button type="button" onClick={() => patch({ library: [] })} className="px-3 py-1.5 min-h-[34px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black cursor-pointer">برداشتن همه</button>
          <button type="button" onClick={() => patch({ library: DEFAULT_SMS_KEYS })} className="px-3 py-1.5 min-h-[34px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black cursor-pointer">فقط چهار قالب اصلی</button>
          <span className="self-center text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(chosen.length)} دکمه در پنجرهٔ ارسال</span>
        </div>
        <div className="space-y-3">
          {SMS_GROUPS.map((g) => (
            <div key={g}>
              <div className="text-[11px] font-black text-[#6E1B1B] mb-1">{g}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {SMS_LIBRARY.filter((t) => t.group === g).map((t) => (
                  <div key={t.key} className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE]">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <label className="flex-1 min-w-0 flex items-center gap-2 font-bold text-[#3A241F] cursor-pointer">
                        <input type="checkbox" checked={chosen.includes(t.key)} onChange={() => toggleReady(t.key)} />
                        <span className="truncate">{t.label}</span>
                      </label>
                      <button type="button" onClick={() => setPreview(preview === 'lib-' + t.key ? null : 'lib-' + t.key)} className="shrink-0 px-2.5 py-1 min-h-[30px] rounded-lg bg-white border border-[#EBDBCE] text-[10px] font-black text-[#6E1B1B] cursor-pointer">{preview === 'lib-' + t.key ? 'بستن' : 'مشاهده'}</button>
                    </div>
                    {preview === 'lib-' + t.key && <div className="mx-3 mb-2.5 rounded-lg border border-dashed border-[#C98B6A] bg-white px-3 py-2 text-[11.5px] font-bold text-[#3A241F] leading-6">{t.text}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div data-sms-auto>
        <div className="font-bold text-[#3A241F] mb-1.5">پیامک خودکار به مشتریان (متن هر کدام ثابت است؛ فقط روشن یا خاموش می‌کنید):</div>
        <div className="space-y-1.5">
          {templates.map((t) => {
            const on = (s.auto || []).includes(t.key);
            const footer = s.footer || s.defaultFooter || '';
            return (
              <div key={t.key} className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <label className="flex-1 min-w-0 flex items-start gap-2 font-bold text-[#3A241F] cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggleAuto(t.key)} />
                    <span className="min-w-0">
                      {t.title}
                      <span className="block text-[10px] font-medium text-[#8C6F66] leading-5">{t.when}</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => setPreview(preview === t.key ? null : t.key)} className="shrink-0 px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#6E1B1B] cursor-pointer">
                    {preview === t.key ? 'بستن' : 'مشاهده'}
                  </button>
                </div>
                {preview === t.key && (
                  <div className="mx-3 mb-3 rounded-xl border border-dashed border-[#C98B6A] bg-white px-3 py-2.5 text-[12px] font-bold text-[#3A241F] leading-7 whitespace-pre-line" data-sms-preview>
                    {t.sample}
                    {footer ? String.fromCharCode(10) + footer : ''}
                    <span className="block mt-1 text-[10px] font-medium text-[#8C6F66]">نمونه با مشخصات فرضی؛ هنگام ارسال، نام و شمارهٔ واقعی می‌نشیند و خط پایانی تنظیمات زیرش می‌آید.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[#8C6F66] mt-1.5 leading-5">پیامک برای اولین شمارهٔ موبایل پروندهٔ مشتری می‌رود. اگر مشتری موبایل ندارد، چیزی فرستاده نمی‌شود. یک متن در ده دقیقه به یک شماره فقط یک‌بار می‌رود.</p>
      </div>

      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={checkBalance} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-[#3A241F] bg-white border border-[#EBDBCE] cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
            اعتبار پنل
          </button>
          {balance && <span className="font-black text-emerald-800">{toPersianDigits(balance)}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <input className={`${box} flex-1 min-w-40`} dir="ltr" inputMode="tel" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="شمارهٔ موبایل برای پیامک آزمایشی" />
          <button type="button" disabled={busy || !testTo.trim() || !s.hasKey} onClick={sendTest} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 cursor-pointer">
            <Send className="w-3.5 h-3.5" />
            ارسال پیامک آزمایشی
          </button>
        </div>
        <p className="text-[10px] text-[#8C6F66]">اول تنظیمات را ذخیره کنید، بعد آزمایش کنید.</p>
      </div>

      <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
        <div className="px-3 py-2 bg-[#FAF5F1] font-black flex items-center justify-between">
          <span>آخرین پیامک‌های ارسالی</span>
          <button type="button" onClick={loadLog} className="text-[10px] text-[#6E1B1B] cursor-pointer">تازه‌سازی</button>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-[#EBDBCE]/60">
          {log.length === 0 ? (
            <div className="py-6 text-center text-gray-400 font-bold">هنوز پیامکی ارسال نشده است.</div>
          ) : (
            log.map((l, i) => (
              <div key={i} className="px-3 py-2 flex gap-3">
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${l.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[#3A241F] truncate">{l.text}</span>
                  <span className="block text-[10px] text-[#8C6F66]">
                    <span dir="ltr">{toPersianDigits(l.to)}</span> · {l.by === 'system' ? 'خودکار' : l.by} {l.detail ? `· ${l.detail}` : ''}
                  </span>
                </span>
                <span className="text-[10px] text-[#8C6F66] shrink-0 text-left">
                  {formatTaskDate(l.at.slice(0, 10))}
                  <br />
                  {toPersianDigits(new Date(l.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
