import React, { useState } from 'react';
import { ScrollText, ShieldCheck } from 'lucide-react';
import { Modal } from './crmUi';
import { toPersianDigits } from '../../lib/jalali';
import { ImportRulesConfig, RULE_GROUPS, RuleGroupId } from '../../lib/importRules';

export interface ImportSummary {
  add: number;
  renames: number;
  addrUpdates: number;
  fieldUpdates: number;
  numberAdds: number;
  duplicates: number;
  rejected: number;
  mobileMust: boolean;
  sepidarOn: boolean;
}

/** The rules that cannot be changed here (they follow from the rest of the system), written out so that nothing is hidden. */
const fixedRules = (rules: ImportRulesConfig, s: Pick<ImportSummary, 'mobileMust' | 'sepidarOn'>): { title: string; text: string }[] => [
  { title: 'نام', text: 'هر ردیف باید نام داشته باشد (نام کامل، یا نام و نام خانوادگی، یا نام شرکت). ردیف بدون نام وارد نمی‌شود و در فهرست «ردیف‌های ردشده» با شمارهٔ ردیفش می‌آید. نام و شماره‌ها همیشه منتقل می‌شوند.' },
  {
    title: 'شمارهٔ موبایل',
    text: s.mobileMust
      ? 'هر ردیف باید دست‌کم یک موبایل کامل (۱۱ رقم، مثل ۰۹۱۲۳۴۵۶۷۸۹) داشته باشد؛ ردیف بدون آن وارد نمی‌شود. شماره‌ها با ارقام فارسی یا لاتین، و با +۹۸ یا ۰۰۹۸ هم خوانده و استاندارد می‌شوند. این الزام را مدیر کل در کنسول مدیریت ← تنظیمات ← سیاست‌ها می‌تواند بردارد.'
      : 'مدیر کل داشتن موبایل را اختیاری کرده است؛ ردیف بدون موبایل هم وارد می‌شود، ولی برای او پیامک، تماس یک‌کلیکی و ثبت در سپیدار کار نمی‌کند. شماره‌ها با ارقام فارسی یا لاتین خوانده و استاندارد می‌شوند.',
  },
  {
    title: 'یک شماره، یک نفر',
    text: rules.skipDup
      ? 'دو رکورد با یک شمارهٔ موبایل ساخته نمی‌شود. اگر شماره (یا کد ملی یا شناسهٔ ملی) از قبل در سامانه هست، یا در ردیفی بالاتر از همین فایل آمده، آن ردیف «تکراری» است و به‌عنوان مشتری تازه وارد نمی‌شود.'
      : 'تیک «تکراری‌ها اضافه نشوند» را برداشته‌اید؛ ردیفی که شمارهٔ آن از قبل در سامانه هست هم مشتری تازه می‌سازد و ممکن است دو نام با یک شماره ثبت شود. توصیه می‌شود روشن بماند.',
  },
  { title: 'مشتری تازه', text: 'هر مشتریِ تازه با وضعیت و مسئولی که بالای پنجرهٔ ورود انتخاب کرده‌اید و با منبع «ورود از اکسل» (اگر فایل ستون منبع نداشته باشد) ثبت می‌شود. اگر شهر در فایل نباشد، از نشانی‌اش حدس زده می‌شود.' },
  { title: 'انتخاب افراد', text: 'هر شخصِ تازه را می‌توان جدا با «افزودن» به سامانه آورد یا با برداشتن تیکش برای فرصتی دیگر نگه داشت. دکمهٔ پایین فقط تیک‌خورده‌ها را اضافه می‌کند. کسی که نیامد، با واردکردن دوبارهٔ همان فایل دوباره در فهرست می‌آید.' },
  ...(s.sepidarOn
    ? [{ title: 'سپیدار', text: 'چون سپیدار روشن است، برنامهٔ واسط مشتریانی را که موبایل دارند در دورهٔ بعد به سپیدار هم می‌فرستد (سپیدار مشتری بدون شمارهٔ تلفن را نمی‌پذیرد). هر مشتری فقط یک شمارهٔ تلفن به سپیدار می‌دهد: موبایل در اولویت است.' }]
    : []),
  { title: 'برگشت', text: 'ورود دسته‌ای با یک کلیک برگردانده نمی‌شود. اگر اشتباهی شد، مشتریان را باید یکی‌یکی (از کارت مشتری) حذف کنید؛ مدیر کل می‌تواند از پشتیبان هم بازگرداند. هر ثبت در گزارش فعالیت می‌آید.' },
];

const Radio: React.FC<{ name: string; value: string; current: string; onPick: (v: string) => void; title: string; hint: string }> = ({ name, value, current, onPick, title, hint }) => (
  <label className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 cursor-pointer ${current === value ? 'bg-violet-50 border-violet-400' : 'bg-white border-[#EBDBCE] hover:bg-violet-50/40'}`}>
    <input type="radio" name={name} className="mt-1.5 accent-violet-600" checked={current === value} onChange={() => onPick(value)} />
    <span className="text-[12px] leading-6"><span className="font-black text-[#3A241F]">{title}</span><span className="block text-[11px] font-bold text-[#8C6F66]">{hint}</span></span>
  </label>
);

/**
 * The page of the import rules: what is carried over and how, defined here, plus the fixed rules written out. It comes up first after «افزودن» (with a tick
 * «I read it»; the numbers are asked once more after it) and can be opened any time from the import window to define the rules before reading a file.
 * Changes apply to this import at once; the administrator can also keep them as the company's default.
 */
export const ImportRulesDialog: React.FC<{
  mode: 'confirm' | 'edit';
  rules: ImportRulesConfig;
  onChange: (r: ImportRulesConfig) => void;
  summary: ImportSummary;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
  onContinue: () => void;
}> = ({ mode, rules, onChange, summary: s, canSave, onSave, onCancel, onContinue }) => {
  const [read, setRead] = useState(false);
  const stat = (n: number, label: string, tone: string) => (
    <div className={`rounded-2xl border px-3 py-2 text-center ${tone}`}>
      <div className="text-lg font-black leading-6">{toPersianDigits(n)}</div>
      <div className="text-[10.5px] font-bold">{label}</div>
    </div>
  );
  const tick = (id: RuleGroupId, on: boolean) => onChange({ ...rules, fields: { ...rules.fields, [id]: on } });
  const fixed = fixedRules(rules, s);
  return (
    <Modal
      wide
      onTop="max"
      title={<span className="flex items-center gap-2"><ScrollText className="w-4 h-4 text-violet-600" />قوانین ورود مشتریان و شماره‌ها</span>}
      onClose={onCancel}
      footer={
        <>
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer" data-import-rules-cancel>{mode === 'confirm' ? 'بازگشت' : 'بستن'}</button>
          <span className="flex items-center gap-2">
            {canSave && (
              <button type="button" onClick={onSave} className="px-3 py-2 rounded-xl text-[11px] font-black text-violet-800 bg-white border border-violet-300 cursor-pointer" data-import-rules-save>ذخیره به‌عنوان قانون سازمان</button>
            )}
            {mode === 'confirm' && (
              <button type="button" disabled={!read} onClick={onContinue} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer flex items-center gap-1.5" data-import-rules-continue>
                <ShieldCheck className="w-4 h-4" />
                قوانین را پذیرفتم؛ ادامه
              </button>
            )}
          </span>
        </>
      }
    >
      <div data-import-rules className="space-y-4">
        <p className="text-[11px] font-bold text-[#8C6F66] leading-6">
          اینجا تعیین می‌کنید چه چیزهایی از فایل منتقل شود و چگونه. تغییر هر قانون همان لحظه روی همین ورود اثر می‌گذارد.
          {mode === 'confirm' ? ' بعد از تأیید این صفحه، یک بار دیگر هم با شمارهٔ دقیق کارها تأیید می‌گیریم.' : ''}
        </p>

        {mode === 'confirm' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-import-rules-summary>
            {stat(s.add, 'مشتری تازه', 'bg-violet-50 border-violet-200 text-violet-900')}
            {stat(s.fieldUpdates, 'اطلاعات تکمیل می‌شود', 'bg-teal-50 border-teal-200 text-teal-900')}
            {stat(s.renames, 'نام عوض می‌شود', 'bg-sky-50 border-sky-200 text-sky-900')}
            {stat(s.numberAdds, 'شماره به همنام اضافه می‌شود', 'bg-indigo-50 border-indigo-200 text-indigo-900')}
            {stat(s.addrUpdates, 'نشانی به‌روز می‌شود', 'bg-emerald-50 border-emerald-200 text-emerald-900')}
            {stat(s.duplicates, 'تکراری، وارد نمی‌شود', 'bg-amber-50 border-amber-200 text-amber-900')}
            {stat(s.rejected, 'ردیف ردشده', 'bg-rose-50 border-rose-200 text-rose-900')}
          </div>
        )}

        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3.5" data-import-rules-what>
          <h4 className="font-black text-[13px] text-violet-900">۱) چه چیزهایی منتقل شود؟</h4>
          <p className="text-[10.5px] font-bold text-[#8C6F66] mt-0.5 mb-2">فقط ستون‌های گروه‌های تیک‌خورده از فایل گرفته می‌شوند؛ بقیه نادیده گرفته می‌شوند. نام و شماره‌ها همیشه منتقل می‌شوند.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {RULE_GROUPS.map((g) => (
              <label key={g.id} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2 cursor-pointer ${rules.fields[g.id] ? 'bg-white border-violet-400' : 'bg-white/60 border-[#EBDBCE]'}`}>
                <input type="checkbox" className="mt-1.5 w-4 h-4 accent-violet-600" checked={rules.fields[g.id]} onChange={(e) => tick(g.id, e.target.checked)} data-rule-field={g.id} />
                <span className="text-[12px] leading-6"><span className="font-black text-[#3A241F]">{g.label}</span><span className="block text-[10.5px] font-bold text-[#8C6F66]">{g.hint}</span></span>
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3.5 space-y-3" data-import-rules-how>
          <h4 className="font-black text-[13px] text-violet-900">۲) چگونه منتقل شود؟</h4>
          <div>
            <div className="text-[11.5px] font-black text-[#3A241F] mb-1">کسی که با همین شماره از قبل در سامانه هست</div>
            <div className="grid grid-cols-1 gap-1.5">
              <Radio name="existing" value="none" current={rules.existing} onPick={(v) => onChange({ ...rules, existing: v as ImportRulesConfig['existing'] })} title="دست‌نخورده بماند" hint="هیچ اطلاعاتی از او عوض نمی‌شود (جز نام و نشانی، طبق دو قانون پایین)." />
              <Radio name="existing" value="fill" current={rules.existing} onPick={(v) => onChange({ ...rules, existing: v as ImportRulesConfig['existing'] })} title="فقط جاهای خالی‌اش پر شود" hint="هرچه او ندارد و فایل دارد (مثلاً کد ملی یا ایمیل) اضافه می‌شود؛ چیزی که دارد عوض نمی‌شود." />
              <Radio name="existing" value="overwrite" current={rules.existing} onPick={(v) => onChange({ ...rules, existing: v as ImportRulesConfig['existing'] })} title="با مقدار فایل جایگزین شود" hint="هرچه در فایل پر است جای مقدار فعلی می‌نشیند (برچسب‌ها فقط اضافه می‌شوند). پیش از اجرا فهرست هر نفر نشان داده می‌شود و می‌توانید برخی را کنار بگذارید." />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-black text-[#3A241F] mb-1">اگر نام فایل با نام او فرق داشت</div>
            <div className="grid grid-cols-1 gap-1.5">
              <Radio name="nameReview" value="ask" current={rules.nameReview} onPick={(v) => onChange({ ...rules, nameReview: v as ImportRulesConfig['nameReview'] })} title="برای هر نفر بپرس" hint="جعبهٔ «نام متفاوت»: عوض کن، بعداً، یا یک‌جا. نام‌هایی مثل «شرکت» از قبل تیک دارند." />
              <Radio name="nameReview" value="never" current={rules.nameReview} onPick={(v) => onChange({ ...rules, nameReview: v as ImportRulesConfig['nameReview'] })} title="نام هیچ‌کس عوض نشود" hint="نام مشتری‌های موجود دست نمی‌خورد و جعبه‌ای نشان داده نمی‌شود." />
            </div>
          </div>
          <div>
            <div className="text-[11.5px] font-black text-[#3A241F] mb-1">اگر همین نام در هورمند هست ولی شمارهٔ فایل نیست</div>
            <div className="grid grid-cols-1 gap-1.5">
              <Radio name="sameName" value="ask" current={rules.sameName} onPick={(v) => onChange({ ...rules, sameName: v as ImportRulesConfig['sameName'] })} title="گزینه بده: شماره را اضافه کن، یا بیخیال" hint="مشتری دومی با همان نام ساخته نمی‌شود؛ برای هر نفر خودتان تصمیم می‌گیرید (از قبل هیچ‌کدام تیک ندارد)." />
              <Radio name="sameName" value="off" current={rules.sameName} onPick={(v) => onChange({ ...rules, sameName: v as ImportRulesConfig['sameName'] })} title="مثل بقیه، مشتری تازه ثبت شود" hint="همنام‌ها هم با شمارهٔ تازه‌شان به‌عنوان مشتری تازه در فهرست می‌آیند." />
            </div>
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-1.5 w-4 h-4 accent-violet-600" checked={rules.skipDup} onChange={(e) => onChange({ ...rules, skipDup: e.target.checked })} data-rule-skipdup />
            <span className="text-[12px] leading-6"><span className="font-black text-[#3A241F]">تکراری‌ها (همان موبایل یا کد ملی) اضافه نشوند</span><span className="block text-[10.5px] font-bold text-[#8C6F66]">توصیه می‌شود روشن بماند: دو نام با یک شماره ثبت نمی‌شود.</span></span>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" className="mt-1.5 w-4 h-4 accent-violet-600" checked={rules.syncAddr} onChange={(e) => onChange({ ...rules, syncAddr: e.target.checked })} data-rule-syncaddr />
            <span className="text-[12px] leading-6"><span className="font-black text-[#3A241F]">نشانی مشتریان موجود هم‌اندازهٔ فایل شود</span><span className="block text-[10.5px] font-bold text-[#8C6F66]">فقط نشانی عوض می‌شود. اگر یک شماره چند ردیف دارد، کامل‌ترین نشانی استفاده می‌شود.</span></span>
          </label>
        </section>

        <section data-import-rules-fixed>
          <h4 className="font-black text-[13px] text-[#3A241F] mb-2">۳) قوانین ثابت</h4>
          <ol className="space-y-2">
            {fixed.map((r, i) => (
              <li key={r.title} className="flex gap-3 rounded-2xl border border-[#EBDBCE] bg-[#FFFDFB] px-3.5 py-2.5" data-import-rule>
                <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{toPersianDigits(i + 1)}</span>
                <span className="text-[12px] leading-6 text-[#3A241F]"><span className="font-black">{r.title}: </span><span className="font-bold text-[#503730]">{r.text}</span></span>
              </li>
            ))}
          </ol>
        </section>

        {mode === 'confirm' && (
          <label className="flex items-start gap-2.5 rounded-2xl border-2 border-violet-300 bg-violet-50/60 px-3.5 py-3 cursor-pointer" data-import-rules-read>
            <input type="checkbox" className="mt-1 w-4 h-4 accent-violet-600" checked={read} onChange={(e) => setRead(e.target.checked)} />
            <span className="text-[12px] font-black text-violet-900 leading-6">قوانین بالا را خواندم و می‌پذیرم.</span>
          </label>
        )}
      </div>
    </Modal>
  );
};
