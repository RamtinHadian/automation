import React, { useState } from 'react';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { Modal } from './crmUi';
import { toPersianDigits } from '../../lib/jalali';

export interface ImportSummary {
  add: number;
  renames: number;
  addrUpdates: number;
  duplicates: number;
  rejected: number;
  skipDup: boolean;
  syncAddr: boolean;
  mobileMust: boolean;
  sepidarOn: boolean;
}

/** The rules of the customer import, all in one place. `sections` is also what the page above the import window shows: nothing is hidden in small print. */
export const importRules = (o: Pick<ImportSummary, 'skipDup' | 'syncAddr' | 'mobileMust' | 'sepidarOn'>): { title: string; text: string }[] => [
  { title: 'نام', text: 'هر ردیف باید نام داشته باشد (نام کامل، یا نام و نام خانوادگی، یا نام شرکت). ردیف بدون نام وارد نمی‌شود و در فهرست «ردیف‌های ردشده» با شمارهٔ ردیفش می‌آید.' },
  {
    title: 'شمارهٔ موبایل',
    text: o.mobileMust
      ? 'هر ردیف باید دست‌کم یک موبایل کامل (۱۱ رقم، مثل ۰۹۱۲۳۴۵۶۷۸۹) داشته باشد؛ ردیف بدون آن وارد نمی‌شود. شماره‌ها با ارقام فارسی یا لاتین، و با +۹۸ یا ۰۰۹۸ هم خوانده و به شکل استاندارد درمی‌آیند. این الزام را مدیر کل می‌تواند در کنسول مدیریت ← تنظیمات ← سیاست‌ها بردارد.'
      : 'مدیر کل داشتن موبایل را اختیاری کرده است؛ ردیف بدون موبایل هم وارد می‌شود، ولی برای او پیامک، تماس یک‌کلیکی و ثبت در سپیدار کار نمی‌کند. شماره‌ها با ارقام فارسی یا لاتین خوانده و به شکل استاندارد درمی‌آیند.',
  },
  {
    title: 'یک شماره، یک نفر',
    text: o.skipDup
      ? 'هیچ‌وقت دو رکورد با یک شمارهٔ موبایل ساخته نمی‌شود. اگر شماره (یا کد ملی یا شناسهٔ ملی) از قبل در سامانه هست، یا در ردیفی بالاتر از همین فایل آمده، آن ردیف «تکراری» است و وارد نمی‌شود. مشتری موجود دست‌نخورده می‌ماند، مگر آنچه در دو قانون بعد می‌آید.'
      : 'تیک «افزودن‌نشدن تکراری‌ها» را برداشته‌اید؛ پس ردیفی که شمارهٔ آن از قبل در سامانه هست هم مشتری تازه می‌سازد و ممکن است دو نام با یک شماره ثبت شود. توصیه می‌شود این تیک روشن بماند.',
  },
  {
    title: 'نام متفاوت با همان شماره',
    text: 'اگر شمارهٔ ردیف از قبل برای مشتری دیگری است ولی نامش فرق دارد، نام او خودکار عوض نمی‌شود. در جعبهٔ «نام متفاوت» برای هر نفر جدا تصمیم می‌گیرید: «عوض کن»، «بعداً»، یا تیک و دکمهٔ یک‌جا. فقط نامِ همان مشتری موجود عوض می‌شود و مشتری دومی ساخته نمی‌شود. نام‌هایی مثل «شرکت» از قبل تیک دارند، بقیه با شما.',
  },
  {
    title: 'نشانی',
    text: o.syncAddr
      ? 'چون تیک به‌روزرسانی نشانی روشن است، نشانیِ مشتری موجود با همان شماره، اگر در فایل فرق داشته باشد، طبق فایل عوض می‌شود (فقط نشانی؛ بقیهٔ اطلاعات و سابقه دست‌نخورده می‌ماند). اگر یک شماره چند ردیف دارد، کامل‌ترین نشانی استفاده می‌شود.'
      : 'تیک به‌روزرسانی نشانی خاموش است؛ نشانی مشتری‌های موجود دست نمی‌خورد.',
  },
  { title: 'مشتری تازه', text: 'هر مشتریِ تازه با وضعیت و مسئولی که بالای پنجره انتخاب کرده‌اید، و با منبع «ورود از اکسل» (اگر فایل ستون منبع نداشته باشد) ثبت می‌شود. هر ردیفی که شهر نداشته باشد ولی نشانیِ دارای نام شهر داشته باشد، شهرش از نشانی حدس زده می‌شود.' },
  { title: 'انتخاب افراد', text: 'می‌توانید هر شخصِ تازه را جدا با «افزودن» به سامانه بیاورید، یا با برداشتن تیکش برای فرصتی دیگر نگه دارید. دکمهٔ پایین فقط تیک‌خورده‌ها را اضافه می‌کند. کسی که نیامد، با واردکردن دوبارهٔ همان فایل دوباره در فهرست می‌آید.' },
  ...(o.sepidarOn
    ? [{ title: 'سپیدار', text: 'چون سپیدار روشن است، برنامهٔ واسط مشتریانِ تازه‌ای را که موبایل دارند در دورهٔ بعدی به سپیدار هم می‌فرستد (سپیدار مشتری بدون شمارهٔ تلفن را نمی‌پذیرد). هر مشتری فقط یک شمارهٔ تلفن به سپیدار می‌دهد: موبایل در اولویت است و شماره‌های دیگر فقط در هورمند می‌مانند.' }]
    : []),
  { title: 'برگشت', text: 'ورود دسته‌ای با یک کلیک برگردانده نمی‌شود. اگر اشتباهی شد، مشتریان را باید یکی‌یکی (از کارت مشتری) حذف کنید؛ مدیر کل می‌تواند از پشتیبان هم بازگرداند. هر ورود در گزارش فعالیت ثبت می‌شود.' },
];

/**
 * The first of the two questions after «افزودن»: a page with every rule of the import and what this file will do. The button is not alive until the
 * person ticks that they read it; the second question (the numbers, once more) is asked by the import window after this one.
 */
export const ImportRulesDialog: React.FC<{ summary: ImportSummary; onCancel: () => void; onContinue: () => void }> = ({ summary: s, onCancel, onContinue }) => {
  const [read, setRead] = useState(false);
  const rules = importRules(s);
  const stat = (n: number, label: string, tone: string) => (
    <div className={`rounded-2xl border px-3 py-2 text-center ${tone}`}>
      <div className="text-lg font-black leading-6">{toPersianDigits(n)}</div>
      <div className="text-[10.5px] font-bold">{label}</div>
    </div>
  );
  return (
    <Modal
      wide
      onTop="max"
      title={<span className="flex items-center gap-2"><ScrollText className="w-4 h-4 text-violet-600" />قوانین ورود مشتریان و شماره‌ها</span>}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer" data-import-rules-cancel>بازگشت</button>
          <button
            type="button"
            disabled={!read}
            onClick={onContinue}
            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
            data-import-rules-continue
          >
            <ShieldCheck className="w-4 h-4" />
            قوانین را پذیرفتم؛ ادامه
          </button>
        </>
      }
    >
      <div data-import-rules>
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">پیش از اضافه‌شدن، همهٔ قوانینی را که این ورود از آن‌ها پیروی می‌کند بخوانید. بعد از تأیید این صفحه، یک بار دیگر هم با شمارهٔ دقیق کارها تأیید می‌گیریم.</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3" data-import-rules-summary>
          {stat(s.add, 'مشتری تازه', 'bg-violet-50 border-violet-200 text-violet-900')}
          {stat(s.renames, 'نام عوض می‌شود', 'bg-sky-50 border-sky-200 text-sky-900')}
          {stat(s.addrUpdates, 'نشانی به‌روز می‌شود', 'bg-emerald-50 border-emerald-200 text-emerald-900')}
          {stat(s.duplicates, 'تکراری، وارد نمی‌شود', 'bg-amber-50 border-amber-200 text-amber-900')}
          {stat(s.rejected, 'ردیف ردشده', 'bg-rose-50 border-rose-200 text-rose-900')}
        </div>
        <ol className="space-y-2">
          {rules.map((r, i) => (
            <li key={r.title} className="flex gap-3 rounded-2xl border border-[#EBDBCE] bg-[#FFFDFB] px-3.5 py-3" data-import-rule>
              <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{toPersianDigits(i + 1)}</span>
              <span className="text-[12px] leading-6 text-[#3A241F]">
                <span className="font-black">{r.title}: </span>
                <span className="font-bold text-[#503730]">{r.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <label className="mt-3 flex items-start gap-2.5 rounded-2xl border-2 border-violet-300 bg-violet-50/60 px-3.5 py-3 cursor-pointer" data-import-rules-read>
          <input type="checkbox" className="mt-1 w-4 h-4 accent-violet-600" checked={read} onChange={(e) => setRead(e.target.checked)} />
          <span className="text-[12px] font-black text-violet-900 leading-6">همهٔ قوانین بالا را خواندم و می‌پذیرم.</span>
        </label>
      </div>
    </Modal>
  );
};
