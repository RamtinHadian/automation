import React, { useMemo, useRef, useState } from 'react';
import { Bell, Play, PhoneOff, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { AppNotification, NotificationKind } from '../../lib/notifications';
import { useDemoInfo } from './DemoBanner';

type RefType = NonNullable<AppNotification['ref']>['type'];
interface Sample {
  label: string;
  kind: NotificationKind;
  title: string;
  body: string;
  ref?: RefType;
  /** 'customer' = a real customer of the demo (so the call card shows what is known about him), 'unknown' = a number nobody knows, 'ext' = an extension of a colleague */
  who?: 'customer' | 'unknown' | 'ext';
}

/** Every kind of notification the system sends, grouped as the people in the office think of them. */
const GROUPS: { name: string; items: Sample[] }[] = [
  { name: 'تماس', items: [
    { label: 'تماس ورودی', kind: 'call', title: 'تماس ورودی', body: 'مشتری شناخته‌شده زنگ می‌زند (کارت سابقه باز می‌شود)', ref: 'customer', who: 'customer' },
    { label: 'تماس ورودی', kind: 'call', title: 'تماس ورودی', body: 'شمارهٔ ناشناس (دکمهٔ «+ دفتر تلفن» می‌آید)', ref: 'phone', who: 'unknown' },
    { label: 'تماس ورودی', kind: 'call', title: 'تماس ورودی', body: 'یکی از همکاران با داخلی تماس گرفت', ref: 'phone', who: 'ext' },
    { label: 'تماس بی‌پاسخ', kind: 'call', title: 'تماس بی‌پاسخ', body: 'یک تماس را پاسخ ندادید', ref: 'customer', who: 'customer' },
  ] },
  { name: 'نامه', items: [
    { label: 'نامه جدید', kind: 'letter', title: 'نامهٔ جدید از سارا کریمی', body: 'درخواست همکاری در پروژهٔ تأمین قطعات', ref: 'letter' },
    { label: 'جهت امضا', kind: 'letter', title: 'نامه برای امضا', body: 'نامهٔ «قرارداد خرید» منتظر امضای شماست', ref: 'letter' },
    { label: 'امضا شد', kind: 'letter', title: 'نامه امضا شد', body: 'نامهٔ «قرارداد خرید» توسط مدیرعامل امضا شد', ref: 'letter' },
    { label: 'ارجاع', kind: 'letter', title: 'ارجاع نامه از علی احمدی', body: 'لطفاً بررسی و اقدام کنید', ref: 'letter' },
    { label: 'ویرایش نامه', kind: 'letter', title: 'نامه ویرایش شد', body: 'متن نامهٔ «پیشنهاد قیمت» تغییر کرد', ref: 'letter' },
    { label: 'رد شد', kind: 'alert', title: 'نامه رد شد', body: 'نامهٔ «ترخیص کالا» رد شد؛ دلیل: ناقص بودن پیوست', ref: 'letter' },
  ] },
  { name: 'فایل و صورتجلسه', items: [
    { label: 'فایل جدید', kind: 'file', title: 'فایل جدید از مریم رضایی', body: 'لیست قیمت آذر.xlsx', ref: 'file' },
    { label: 'دریافت شد', kind: 'file', title: 'فایل شما دریافت شد', body: 'حمید نوری فایل «قرارداد.pdf» را دریافت کرد', ref: 'file' },
    { label: 'صورتجلسه', kind: 'file', title: 'شما در صورتجلسه‌ای نام برده شده‌اید', body: 'جلسهٔ هماهنگی فصلی', ref: 'minutes' },
  ] },
  { name: 'وظایف', items: [
    { label: 'وظیفه جدید', kind: 'task', title: 'وظیفه جدید از علی احمدی', body: 'ارسال نمونهٔ کالا برای مشتری تا فردا', ref: 'task' },
    { label: 'واگذار شد', kind: 'task', title: 'وظیفه‌ای به شما واگذار شد', body: 'تهیهٔ گزارش فروش هفته', ref: 'task' },
    { label: 'نظر جدید', kind: 'task', title: 'نظر جدید در وظیفه «پیگیری ترخیص»', body: 'مریم: مدارک تکمیل شد', ref: 'task' },
    { label: 'موعد امروز', kind: 'task', title: 'موعد وظیفه امروز است', body: 'ارسال پیش‌فاکتور به شرکت آرمان', ref: 'task' },
    { label: 'موعد گذشته', kind: 'task', title: 'موعد وظیفه گذشته است', body: 'تماس با مشتری — دو روز تأخیر', ref: 'task' },
    { label: 'در انتظار بررسی', kind: 'task', title: 'وظیفه برای بررسی آماده است', body: 'تهیهٔ نمونه قرارداد — توسط حمید', ref: 'task' },
    { label: 'گزارش روزانه', kind: 'task', title: 'گزارش روزانه از حمید نوری', body: 'امروز ۶ تماس و ۲ پیش‌فاکتور', ref: 'report' },
  ] },
  { name: 'مشتریان و فروش', items: [
    { label: 'پیگیری جدید', kind: 'task', title: 'پیگیری جدید برای شما', body: 'تماس با شرکت آرمان راه دربارهٔ قیمت', ref: 'customer', who: 'customer' },
    { label: 'پیگیری امروز', kind: 'task', title: 'پیگیری امروز', body: 'ارسال نمونه به فروشگاه یدک شمال', ref: 'customer', who: 'customer' },
    { label: 'پیگیری عقب‌افتاده', kind: 'task', title: 'پیگیری عقب‌افتاده', body: 'سه روز از موعد پیگیری گذشته است', ref: 'customer', who: 'customer' },
    { label: 'فرصت فروش', kind: 'task', title: 'فرصت فروش جدید', body: 'شرکت پارس معدن — ۱۸۰ میلیون تومان', ref: 'deal' },
    { label: 'تغییر مرحله', kind: 'task', title: 'فرصت به مرحلهٔ «مذاکره» رفت', body: 'شرکت پارس معدن', ref: 'deal' },
    { label: 'پیش‌فاکتور', kind: 'task', title: 'پیش‌فاکتور تأیید شد', body: 'پیش‌فاکتور ۱۲۴ آمادهٔ ارسال برای مشتری است', ref: 'deal' },
    { label: 'فروش موفق', kind: 'task', title: 'فروش موفق شد 🎉', body: 'شرکت آرمان راه — ۹۵ میلیون تومان', ref: 'deal' },
    { label: 'سابقهٔ جدید', kind: 'task', title: 'سابقهٔ جدید در پروندهٔ مشتری', body: 'رضا از مشتری قیمت گرفت', ref: 'customer', who: 'customer' },
    { label: 'اتصال به ربات', kind: 'task', title: 'مشتری «آقای احمدی» به ربات تلگرام وصل شد', body: 'پیام‌هایش در صندوق پیام می‌نشیند', ref: 'customer', who: 'customer' },
  ] },
  { name: 'گفتگو', items: [
    { label: 'پیام جدید', kind: 'chat', title: 'پیام جدید از مریم رضایی', body: 'سلام، فایل قیمت را دیدید؟', ref: 'chat' },
    { label: 'پیام در تلگرام', kind: 'chat', title: 'پیام تازه از «فروشگاه یدک شمال»', body: 'قیمت فیلتر هیدرولیک چند است؟', ref: 'customer', who: 'customer' },
  ] },
  { name: 'اداری', items: [
    { label: 'گردشکار', kind: 'task', title: 'درخواست خرید تجهیزات — تأیید مدیر واحد', body: 'خرید لپ‌تاپ برای تأیید شما', ref: 'workflow' },
    { label: 'مرخصی', kind: 'task', title: 'درخواست مرخصی جدید', body: 'حمید نوری — سه‌شنبه تا پنجشنبه', ref: 'leave' },
    { label: 'یادآور', kind: 'alert', title: 'یادآور: جلسهٔ فروش', body: 'جلسه ساعت ۱۰ در سالن اجتماعات', ref: 'reminder' },
    { label: 'تابلو اعلانات', kind: 'alert', title: 'تعطیلی شرکت در روز سه‌شنبه', body: 'به‌مناسبت مراسم سالانهٔ شرکت', ref: 'announcement' },
  ] },
  { name: 'سپیدار', items: [
    { label: 'در سپیدار انجام شد', kind: 'task', title: 'پیش‌فاکتور در سپیدار ثبت شد', body: 'پیش‌فاکتور ۱۲۴ در حسابداری ثبت شد', ref: 'sepidar' },
    { label: 'در سپیدار ناقص انجام شد', kind: 'alert', title: 'ثبت در سپیدار ناقص بود', body: 'دو ردیف کالا کد نداشتند', ref: 'sepidar' },
    { label: 'سپیدار', kind: 'alert', title: 'ثبت مشتری در سپیدار انجام نشد', body: 'ارتباط با سپیدار برقرار نشد', ref: 'sepidar' },
  ] },
  { name: 'انبار، گارانتی، پشتیبانی', items: [
    { label: 'موجودی کم', kind: 'alert', title: 'موجودی «فیلتر هیدرولیک» به زیر حداقل رسید', body: 'موجودی فعلی: ۳ عدد', ref: 'warehouse' },
    { label: 'گارانتی', kind: 'task', title: 'گارانتی در حال پایان', body: 'گارانتی دستگاه ۱۲۰۴ تا هفت روز دیگر تمام می‌شود', ref: 'warranty' },
    { label: 'پشتیبانی', kind: 'task', title: 'درخواست پشتیبانی جدید', body: 'مشتری گزارش خرابی دستگاه را ثبت کرد', ref: 'support' },
  ] },
  { name: 'هشدار و هوش مصنوعی', items: [
    { label: 'فایل حذف شد', kind: 'alert', title: 'فایل حذف شد', body: 'فایل «قرارداد قدیمی» توسط مدیر پاک شد', ref: 'file' },
    { label: 'تغییر حساب', kind: 'alert', title: 'تغییر در حساب شما', body: 'رمز شما عوض شد' },
    { label: 'هشدار امنیتی', kind: 'alert', title: 'ورود از دستگاه جدید', body: 'یک ورود تازه با حساب شما انجام شد' },
    { label: 'گزارش هوشمند', kind: 'alert', title: 'گزارش هوشمند تحلیل فروش آماده شد', body: 'برای دیدن روی کارت بزنید', ref: 'report' },
    { label: 'هوش مصنوعی', kind: 'alert', title: 'هوش مصنوعی: اعتبار کم است', body: 'اعتبار togpt رو به پایان است' },
  ] },
];

let seq = 0;

/** «کلید دمو»: a switch in the corner of the demo only. It lists every kind of notification of the system; a tap announces the sample at once, exactly as a real one comes. */
export const DemoNotifyKey: React.FC = () => {
  const info = useDemoInfo();
  const { loggedInUser, customers, popups, dismissPopup } = useAppContext();
  const [open, setOpen] = useState(false);
  const [gi, setGi] = useState(0);
  const timers = useRef<number[]>([]);
  const customer = useMemo(() => customers[0], [customers]);
  if (!info || !loggedInUser) return null;

  const send = (s: Sample) => {
    seq += 1;
    let ref: AppNotification['ref'] = null;
    if (s.ref && s.who === 'customer' && customer) ref = { type: 'customer', id: customer.id };
    else if (s.ref && s.who === 'unknown') ref = { type: 'phone', id: '09121234567' };
    else if (s.ref && s.who === 'ext') ref = { type: 'phone', id: '600' };
    else if (s.ref) ref = { type: s.ref, id: 'demo-' + seq };
    const title = s.who === 'customer' && customer && s.kind === 'call' ? `${s.title} از «${customer.company || customer.name}»` : s.title;
    const n: AppNotification = { id: 'demo-' + Date.now() + '-' + seq, userId: loggedInUser.id, kind: s.kind, label: s.label, title, body: s.body, ref, createdAt: new Date().toISOString(), read: false };
    window.dispatchEvent(new CustomEvent('hoormand-demo-notify', { detail: n }));
  };
  const stopAll = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  const playGroup = (items: Sample[]) => {
    stopAll();
    items.forEach((s, i) => { timers.current.push(window.setTimeout(() => send(s), i * 6000)); });
  };
  const g = GROUPS[gi];
  const total = GROUPS.reduce((a, x) => a + x.items.length, 0);

  return (
    <div dir="rtl" className="fixed bottom-14 left-3 z-[61]" data-demo-key>
      {open && (
        <div className="mb-2 w-[min(92vw,380px)] max-h-[70vh] overflow-y-auto rounded-3xl bg-white border border-[#EBDBCE] shadow-2xl p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="text-[13px] font-black text-[#3A241F]">کلید دمو · آزمایش اعلان‌ها</div>
              <div className="text-[10px] font-bold text-[#7D6159] leading-5">{toPersianDigits(total)} نوع اعلان. روی هر مورد بزنید تا همان‌طور که واقعی می‌آید (کارت، صدا و زنگ) نشان داده شود. ظاهر و صدا طبق تنظیمات اعلان است؛ اگر نیامد، در تنظیمات خاموش است.</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="بستن" className="shrink-0 w-7 h-7 rounded-full hover:bg-[#FAF5F1] cursor-pointer text-[#6E1B1B]"><X size={15} className="mx-auto" /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {GROUPS.map((x, i) => (
              <button key={x.name} type="button" onClick={() => setGi(i)} className={`px-2.5 py-1 rounded-full text-[10.5px] font-black cursor-pointer border ${i === gi ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-[#FAF5F1] text-[#6E1B1B] border-[#EBDBCE]'}`}>{x.name} ({toPersianDigits(x.items.length)})</button>
            ))}
          </div>
          <div className="space-y-1.5">
            {g.items.map((s, i) => (
              <button key={i} type="button" onClick={() => send(s)} className="w-full text-right flex items-start gap-2 rounded-2xl border border-[#EBDBCE] bg-[#FFFBF8] hover:bg-[#FAF5F1] px-3 py-2 cursor-pointer" data-demo-sample>
                <Play size={13} className="mt-1 shrink-0 text-[#D34A32]" />
                <span className="min-w-0">
                  <span className="block text-[11.5px] font-black text-[#3A241F]">{s.label}{s.who === 'unknown' ? ' · شمارهٔ ناشناس' : s.who === 'ext' ? ' · همکار' : ''}</span>
                  <span className="block text-[10px] font-bold text-[#7D6159] leading-5">{s.title} — {s.body}</span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-[#EBDBCE]">
            <button type="button" onClick={() => playGroup(g.items)} className="px-3 py-1.5 rounded-xl bg-[#D34A32] text-white text-[10.5px] font-black cursor-pointer">پخش همهٔ «{g.name}» پشت‌سر هم</button>
            <button type="button" onClick={() => { stopAll(); popups.forEach((p) => dismissPopup(p.id)); }} className="px-3 py-1.5 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[#6E1B1B] text-[10.5px] font-black cursor-pointer">بستن همهٔ کارت‌ها</button>
            <button type="button" onClick={() => window.dispatchEvent(new Event('hoormand-call-ended'))} className="px-3 py-1.5 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[#6E1B1B] text-[10.5px] font-black cursor-pointer inline-flex items-center gap-1"><PhoneOff size={12} />پایان تماس</button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#D34A32] text-white text-[11px] font-black shadow-lg cursor-pointer" data-demo-key-toggle>
        <Bell size={14} />کلید دمو
      </button>
    </div>
  );
};
