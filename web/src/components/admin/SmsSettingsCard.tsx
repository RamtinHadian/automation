import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Pencil, RefreshCw, Save, Send } from 'lucide-react';
import { api, SmsKV, SmsLogRow, SmsSettings } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { DEFAULT_SMS_KEYS, SMS_GROUPS, SMS_LIBRARY, smsFinalText, smsTemplateName } from '../../lib/smsLibrary';

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
  { label: 'مشتری جدید', title: 'مشتری یا فرصت جدید به نام شما سپرده شد' },
  { label: 'فرصت گیرکرده', title: 'فرصت فروش بی‌پیگیری' },
  { label: 'تایید پیش‌فاکتور', title: 'پیش‌فاکتور منتظر تأیید مدیرعامل' },
  { label: 'پیش‌فاکتور تایید شد', title: 'پیش‌فاکتور تأیید شد' },
  { label: 'پیش‌فاکتور رد شد', title: 'پیش‌فاکتور رد شد' },
  { label: 'انتقال مشتری', title: 'مشتری‌ها به شما منتقل شد' },
  { label: 'درخواست مرخصی', title: 'درخواست مرخصی (برای مدیر واحد)' },
  { label: 'مرخصی تایید شد', title: 'مرخصی شما تأیید شد' },
  { label: 'مرخصی رد شد', title: 'مرخصی شما رد شد' },
  { label: 'امضا شد', title: 'نامه‌ای که فرستادید امضا شد' },
  { label: 'ارجاع', title: 'نامه به شما ارجاع شد' },
  { label: 'پشتیبانی', title: 'درخواست پشتیبانی به شما سپرده شد' },
  { label: 'درخواست گارانتی', title: 'درخواست گارانتی به شما سپرده شد' },
];

const box = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block font-bold text-[#3A241F] mb-1.5';

const SAMPLE_VARS: Record<string, string> = { name: 'علی رضایی', company: 'شرکت نمونه', number: '۱۲۳۴', end: '۱۴۰۵/۰۹/۰۱', product: 'میل لنگ', subject: 'موضوع نمونه' };
const fillSample = (text: string) => text.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => SAMPLE_VARS[k] ?? m);
const PLACEHOLDERS: [string, string][] = [['{name}', 'نام'], ['{company}', 'شرکت'], ['{number}', 'شماره'], ['{end}', 'تاریخ پایان'], ['{product}', 'کالا'], ['{subject}', 'موضوع']];

/** The editor of one text: the administrator writes his own wording; an edited text is sent as a free text (no template in the panel is needed). */
/** The text as the Kavenegar panel wants it written: the parameters are %token, %token2 … */
const panelText = (text: string) => text.replace(/\{([A-Za-z]+)\}/g, (m, k: string) => ({ name: '%token', number: '%token2', end: '%token3', company: '%token20', product: '%token10', subject: '%token10' } as Record<string, string>)[k] ?? m);

const KvEditor: React.FC<{ t: SmsKV; onChange: (list: SmsKV[]) => void; showToast: (m: string) => void }> = ({ t, onChange, showToast }) => {
  const [text, setText] = useState(t.override || t.text);
  const [via, setVia] = useState(!!t.viaTemplate);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const save = async (value: string, viaTemplate: boolean) => {
    setBusy(true);
    try {
      const r = await api.smsOverride(t.key, value, viaTemplate);
      onChange(r.templates);
      if (value) {
        setNotice(true);
        showToast(`متن در هورمند ذخیره شد. برای یکی‌شدن با پنل پیامک، قالب «${t.name}» را در پنل کاوه‌نگار خودتان هم ویرایش کنید؛ تأیید قالب ممکن است کمی زمان ببرد و دست مدیریت پنل پیامک شماست.`);
      } else {
        setNotice(false);
        setText(t.text);
        setVia(false);
        showToast('به متن اصلی برگشت.');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };
  const insert = (p: string) => {
    const el = ref.current;
    if (!el) { setText((x) => x + p); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    setText(text.slice(0, a) + p + text.slice(b));
    setTimeout(() => { el.focus(); el.setSelectionRange(a + p.length, a + p.length); }, 0);
  };
  const edited = !!t.override;
  const changed = text.trim() !== (t.override || t.text).trim() || via !== !!t.viaTemplate;
  return (
    <div className="mx-3 mb-3 rounded-xl border border-[#C98B6A] bg-white p-3 space-y-2" data-sms-editor>
      <textarea ref={ref} rows={4} value={text} onChange={(e) => setText(e.target.value)} className={`${box} leading-7`} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-[#8C6F66]">جایگزین‌ها (روی هرکدام بزنید):</span>
        {PLACEHOLDERS.map(([p, l]) => <button key={p} type="button" onClick={() => insert(p)} className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-[10px] font-black text-sky-800 cursor-pointer" dir="ltr">{p} <span dir="rtl" className="text-sky-600">{l}</span></button>)}
      </div>
      <div className="rounded-lg bg-[#FAF5F1] border border-dashed border-[#C98B6A] px-3 py-2 text-[11.5px] font-bold leading-6 whitespace-pre-line">{fillSample(text)}<span className="block text-[10px] font-medium text-[#8C6F66]">نمونه با مشخصات فرضی</span></div>
      {(notice || edited) && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-[11px] font-bold text-amber-950 leading-6" data-sms-panel-note>
          <b>توجه:</b> این متن در هورمند ذخیره شد، ولی برای اینکه با «قالب» پنل پیامک شما هم یکی باشد، باید خودتان در پنل کاوه‌نگار قالب <span className="font-mono" dir="ltr">{t.name}</span> را به همین متن ویرایش یا دوباره ثبت کنید. تأیید قالب ممکن است کمی زمان ببرد و دست مدیریت پنل پیامک شماست، نه هورمند. تا آن موقع پیامک همین متن را به‌صورت پیامک آزاد می‌فرستد.
          <div className="mt-1.5 rounded-md bg-white border border-amber-200 px-2 py-1.5 text-[11px] font-mono whitespace-pre-line" dir="rtl">{panelText(text)}</div>
          <div className="mt-1 text-[10px] font-medium text-amber-900">متن بالا را همین‌طور (با %token ها) در کاوه‌نگار بگذارید.</div>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(panelText(text)).then(() => showToast('متن برای کاوه‌نگار کپی شد.')).catch(() => showToast('کپی نشد.')); }} className="mt-1.5 px-3 py-1 rounded-lg bg-white border border-amber-300 text-[10px] font-black cursor-pointer">کپی متن برای کاوه‌نگار</button>
        </div>
      )}
      {edited && (
        <label className="flex items-start gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={via} onChange={(e) => setVia(e.target.checked)} />
          <span>قالب را در پنل کاوه‌نگار هم عوض کرده‌ام و تأیید شده است؛ از این به بعد با قالب ثبت‌شده بفرست (به‌جای پیامک آزاد).</span>
        </label>
      )}
      <p className="text-[10px] font-bold text-[#8C6F66] leading-5">اگر تغییر را نگه ندارید، پیامک با قالب ثبت‌شدهٔ «{t.name}» در پنل کاوه‌نگار و با متن اصلی فرستاده می‌شود. پیامک آزاد لازم است خط پیامک شما اجازهٔ ارسال آزاد داشته باشد.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !text.trim() || !changed} onClick={() => void save(text.trim() === t.text.trim() ? '' : text.trim(), via)} className="px-4 py-2 rounded-xl bg-[#6E1B1B] text-white text-[11px] font-black cursor-pointer disabled:opacity-40">ذخیرهٔ متن</button>
        {edited && <button type="button" disabled={busy} onClick={() => void save('', false)} className="px-4 py-2 rounded-xl bg-white border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer">برگشت به متن اصلی</button>}
      </div>
    </div>
  );
};

/** Why a message was not sent, in plain words, with what to do. */
const failureHint = (detail: string, kv: SmsKV[]): { text: string; key?: string } | null => {
  if (!detail) return null;
  if (/ساخته یا تأیید نشده/.test(detail)) {
    const name = /hm[a-z0-9]+/.exec(detail)?.[0];
    const t = kv.find((x) => x.name === name);
    return { text: 'این قالب در پنل کاوه‌نگار شما ساخته یا تأیید نشده است (کاوه‌نگار فقط متن‌های ثبت‌شده را با قالب می‌فرستد). دو راه دارید: ۱) در کاوه‌نگار قالب را با همین نام و متن بسازید و تأیید بگیرید؛ ۲) همین‌جا متن را «ویرایش» و ذخیره کنید تا به‌صورت پیامک آزاد فرستاده شود.', key: t?.key };
  }
  if (/اتصال به پنل پیامک برقرار نشد/.test(detail)) {
    return { text: 'سرور هورمند در همان لحظه به پنل کاوه‌نگار نرسید (پاسخ نیامد). معمولاً علت یکی از این‌هاست: قطعی یا کندی لحظه‌ای اینترنت سرور، یا بسته‌بودن/کندبودن مسیر سرور تا کاوه‌نگار (اغلب وقتی سرور خارج از ایران است). با دکمهٔ «اعتبار پنل» پایین امتحان کنید؛ اگر جواب می‌دهد، مشکل لحظه‌ای بوده و همان پیامک خودکار دوباره فرستاده نمی‌شود.' };
  }
  if (/کد 4(01|02)|کلید|apikey/i.test(detail)) return { text: 'کلید API کاوه‌نگار درست نیست یا حساب محدود است؛ کلید را در همین صفحه دوباره وارد و ذخیره کنید.' };
  return null;
};

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
  const [kv, setKv] = useState<SmsKV[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const loadLog = useCallback(() => api.smsLog().then((r) => setLog(r.log)).catch(() => {}), []);
  useEffect(() => {
    api.smsSettings().then(setS).catch(() => showToast('خواندن تنظیمات پیامک ممکن نشد.'));
    api.smsTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
    api.smsKV().then((r) => setKv(r.templates)).catch(() => {});
    void loadLog();
  }, [loadLog, showToast]);

  if (!s) return <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] text-xs text-gray-400 font-bold">در حال بارگذاری...</div>;

  const kvOf = (key: string) => kv.find((x) => x.key === key);
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

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-3.5 py-3 text-[11px] font-bold text-sky-900 leading-6" data-sms-templates-note>
        پیامک‌های مشتریان با «الگوی کاوه‌نگار» فرستاده می‌شوند: متن هر پیامک ثابت است و آخرش همیشه «اتوماسیون هورمند» می‌آید؛ فقط نام مشتری و نام شرکت (همان «نام رسمی شرکت» در تنظیمات سازمان) در آن می‌نشیند.
        هر الگو باید یک‌بار در پنل کاوه‌نگار، با همان نامی که پایین هر قالب نوشته شده، ساخته و تأیید شود (فایل آمادهٔ همهٔ الگوها و ابزار ثبت خودکار را از ما بگیرید).
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
        <p className="text-[10px] text-[#8C6F66] leading-5">پیامک همکاران هم مثل پیامک مشتریان با «الگوی کاوه‌نگار» می‌رود (۸ الگوی جدید با نام‌هایی که با hmstaff شروع می‌شود)؛ آن‌ها را هم یک‌بار با ابزار ثبت خودکار یا از فایل آمادهٔ الگوها در پنل کاوه‌نگار بسازید و تأیید کنید، وگرنه پیامک «قالب ساخته یا تأیید نشده است» می‌دهد.</p>
      </div>

      <div data-sms-library>
        <div className="font-bold text-[#3A241F] mb-1">قالب‌های آمادهٔ پیامک (برای پنجرهٔ «ارسال پیامک» در پروندهٔ مشتری):</div>
        <p className="text-[10px] text-[#8C6F66] mb-2 leading-5">هر قالبی را که تیک بزنید، به‌صورت یک دکمه در پنجرهٔ ارسال پیامک و در «پیامک گروهی» می‌آید. همکار فقط نوع پیامک را انتخاب می‌کند و متن را نمی‌تواند تغییر دهد. نام مشتری و نام شرکت خودکار در متن می‌نشیند. نیازی به ذخیرهٔ جدا نیست؛ همان دکمهٔ «ذخیرهٔ تنظیمات پیامک» بالای کارت.</p>
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
                        <span className="min-w-0">
                          <span className="block truncate">{t.label}</span>
                          <span className="block text-[10px] font-mono font-medium text-sky-800" dir="ltr">{smsTemplateName(t.key)}</span>
                        </span>
                      </label>
                      <button type="button" onClick={() => setPreview(preview === 'lib-' + t.key ? null : 'lib-' + t.key)} className="shrink-0 px-2.5 py-1 min-h-[30px] rounded-lg bg-white border border-[#EBDBCE] text-[10px] font-black text-[#6E1B1B] cursor-pointer">{preview === 'lib-' + t.key ? 'بستن' : 'مشاهده'}</button>
                      <button type="button" onClick={() => setEditing(editing === 'lib-' + t.key ? null : 'lib-' + t.key)} className="shrink-0 px-2.5 py-1 min-h-[30px] rounded-lg bg-white border border-[#EBDBCE] text-[10px] font-black text-[#3A241F] cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" />{kvOf(t.key)?.override ? 'ویرایش‌شده' : 'ویرایش'}</button>
                    </div>
                    {preview === 'lib-' + t.key && <div className="mx-3 mb-2.5 rounded-lg border border-dashed border-[#C98B6A] bg-white px-3 py-2 text-[11.5px] font-bold text-[#3A241F] leading-6 whitespace-pre-line">{kvOf(t.key)?.override ? fillSample(kvOf(t.key)!.override) : smsFinalText(t.key, 'علی رضایی', 'شرکت نمونه')}</div>}
                    {editing === 'lib-' + t.key && kvOf(t.key) && <KvEditor key={t.key + (kvOf(t.key)!.override || '')} t={kvOf(t.key)!} onChange={setKv} showToast={showToast} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div data-sms-auto>
        <div className="font-bold text-[#3A241F] mb-1.5">پیامک خودکار به مشتریان (روشن یا خاموش کنید؛ با «ویرایش» متن هر کدام را می‌توانید عوض کنید):</div>
        <div className="space-y-1.5">
          {templates.map((t) => {
            const on = (s.auto || []).includes(t.key);
            return (
              <div key={t.key} className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <label className="flex-1 min-w-0 flex items-start gap-2 font-bold text-[#3A241F] cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggleAuto(t.key)} />
                    <span className="min-w-0">
                      {t.title}
                      <span className="block text-[10px] font-medium text-[#8C6F66] leading-5">{t.when}</span>
                      <span className="block text-[10px] font-mono text-sky-800" dir="ltr">{'hm' + t.key.replace(/_/g, '')}</span>
                    </span>
                  </label>
                  <button type="button" onClick={() => setPreview(preview === t.key ? null : t.key)} className="shrink-0 px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#6E1B1B] cursor-pointer">
                    {preview === t.key ? 'بستن' : 'مشاهده'}
                  </button>
                  <button type="button" onClick={() => setEditing(editing === t.key ? null : t.key)} className="shrink-0 px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" />{kvOf(t.key)?.override ? 'ویرایش‌شده' : 'ویرایش'}</button>
                </div>
                {preview === t.key && (
                  <div className="mx-3 mb-3 rounded-xl border border-dashed border-[#C98B6A] bg-white px-3 py-2.5 text-[12px] font-bold text-[#3A241F] leading-7 whitespace-pre-line" data-sms-preview>
                    {kvOf(t.key)?.override ? fillSample(kvOf(t.key)!.override) : t.sample}
                    <span className="block mt-1 text-[10px] font-medium text-[#8C6F66]">نمونه با مشخصات فرضی؛ هنگام ارسال، نام و شمارهٔ واقعی و نام شرکت می‌نشیند.</span>
                  </div>
                )}
                {editing === t.key && kvOf(t.key) && <KvEditor key={t.key + (kvOf(t.key)!.override || '')} t={kvOf(t.key)!} onChange={setKv} showToast={showToast} />}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[#8C6F66] mt-1.5 leading-5">پیامک برای اولین شمارهٔ موبایل پروندهٔ مشتری می‌رود. اگر مشتری موبایل ندارد، چیزی فرستاده نمی‌شود. یک متن در ده دقیقه به یک شماره فقط یک‌بار می‌رود.</p>
      </div>

      <div data-sms-staff>
        <div className="font-bold text-[#3A241F] mb-1.5">پیامک به همکاران (اعلان‌هایی که برای کارکنان پیامک هم می‌شوند):</div>
        <div className="space-y-1.5">
          {kv.filter((x) => x.staff).map((t) => (
            <div key={t.key} className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE]">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[#3A241F] truncate">{fillSample(t.override || t.text).split('\n')[0]}</span>
                  <span className="block text-[10px] font-mono text-sky-800" dir="ltr">{t.name}</span>
                </span>
                <button type="button" onClick={() => setEditing(editing === 'staff-' + t.key ? null : 'staff-' + t.key)} className="shrink-0 px-3 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer flex items-center gap-1"><Pencil className="w-3 h-3" />{t.override ? 'ویرایش‌شده' : 'ویرایش'}</button>
              </div>
              {editing === 'staff-' + t.key && <KvEditor key={t.key + (t.override || '')} t={t} onChange={setKv} showToast={showToast} />}
            </div>
          ))}
        </div>
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
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${l.status === 'ok' ? 'bg-emerald-500' : l.status === 'skipped' ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[#3A241F] truncate">{l.text}</span>
                  <span className="block text-[10px] text-[#8C6F66]">
                    <span dir="ltr">{toPersianDigits(l.to)}</span> · {l.by === 'system' ? 'خودکار' : l.by} {l.detail ? `· ${l.detail}` : ''}
                  </span>
                  {l.status !== 'ok' && (() => { const h = failureHint(l.detail || '', kv); return h ? (<span className="block mt-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10.5px] font-bold text-amber-950 leading-5" data-sms-hint>چرا ارسال نشد؟ {h.text}{h.key && <button type="button" onClick={() => { setEditing(kvOf(h.key!)?.staff ? 'staff-' + h.key : kvOf(h.key!)?.auto ? h.key! : 'lib-' + h.key); setTimeout(() => document.querySelector('[data-sms-editor]')?.scrollIntoView({ block: 'center' }), 150); }} className="mr-2 px-2 py-0.5 rounded-md bg-white border border-amber-300 text-[10px] font-black cursor-pointer">ویرایش متن این پیامک</button>}</span>) : null; })()}
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
