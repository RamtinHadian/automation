import React, { useState } from 'react';
import { Building2, ChevronDown, Plus, Trash2, Upload } from 'lucide-react';
import { ProformaIssuer, SystemSettings } from '../../types';
import { mainIssuer } from '../../lib/proformaIssuer';

const input = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block font-bold text-[#3A241F] mb-1.5';

const uid = () => 'iss-' + Math.random().toString(36).slice(2, 9);

/** A picture chosen from the computer, kept in the settings as a data URL (small ones only). */
const PictureField: React.FC<{ title: string; value?: string; onChange: (v: string | undefined) => void }> = ({ title, value, onChange }) => {
  const pick = (f?: File) => {
    if (!f) return;
    if (f.size > 900 * 1024) {
      window.alert('حجم تصویر باید کمتر از ۹۰۰ کیلوبایت باشد.');
      return;
    }
    const r = new FileReader();
    r.onload = () => onChange(String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <div className="rounded-xl border border-[#EBDBCE] bg-white p-3 flex items-center gap-3">
      <div className="w-14 h-14 shrink-0 rounded-lg bg-[#FAF5F1] border border-dashed border-[#EBDBCE] flex items-center justify-center overflow-hidden">
        {value ? <img src={value} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-[#8C6F66]">بدون تصویر</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="font-black text-[#3A241F]">{title}</div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#3A241F] text-white text-[11px] font-black cursor-pointer">
            <Upload className="w-3 h-3" />
            انتخاب
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {value && (
            <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-black text-rose-600 cursor-pointer">
              حذف
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** The companies / offices a proforma can be issued under: the main company (from the ordinary settings) and any number of others. */
export const ProformaIssuersCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void }> = ({ settings, setSettings }) => {
  const issuers = settings.proformaIssuers || [];
  const [open, setOpen] = useState<string | null>(null);
  const main = mainIssuer(settings);

  const setIssuers = (list: ProformaIssuer[]) => setSettings({ ...settings, proformaIssuers: list });
  const patch = (id: string, u: Partial<ProformaIssuer>) => setIssuers(issuers.map((i) => (i.id === id ? { ...i, ...u } : i)));
  const add = (kind: ProformaIssuer['kind']) => {
    const n: ProformaIssuer = { id: uid(), label: kind === 'OFFICIAL' ? 'شرکت دوم (رسمی)' : 'دفتر دوم (غیررسمی)', kind, name: '', taxPercent: kind === 'OFFICIAL' ? settings.proformaTaxPercent ?? 10 : 0, numberPrefix: kind === 'OFFICIAL' ? 'B-' : 'N-' };
    setIssuers([...issuers, n]);
    setOpen(n.id);
  };
  const remove = (i: ProformaIssuer) => {
    if (!window.confirm(`«${i.label}» از فهرست صادرکننده‌ها حذف شود؟ پیش‌فاکتورهای قبلی که با آن ساخته شده‌اند به شرکت اصلی برمی‌گردند.`)) return;
    setIssuers(issuers.filter((x) => x.id !== i.id));
  };

  const text = (i: ProformaIssuer, key: keyof ProformaIssuer, title: string, ltr = false) => (
    <div>
      <label className={lab}>{title}</label>
      <input className={input} dir={ltr ? 'ltr' : undefined} value={(i[key] as string) || ''} onChange={(e) => patch(i.id, { [key]: e.target.value } as Partial<ProformaIssuer>)} />
    </div>
  );

  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4 text-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#6E1B1B]" />
          شرکت‌ها و دفترهای صادرکنندهٔ پیش‌فاکتور
        </h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => add('OFFICIAL')} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            شرکت رسمی
          </button>
          <button type="button" onClick={() => add('UNOFFICIAL')} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#3A241F] hover:bg-black text-white font-black cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            دفتر غیررسمی
          </button>
        </div>
      </div>
      <p className="text-[#8C6F66] leading-6">
        اگر سازمان شما دو شرکت یا دو دفتر دارد، هر کدام را اینجا اضافه کنید. هنگام ساخت پیش‌فاکتور، صادرکننده را انتخاب می‌کنید و نام، نشانی، کدها، مهر، امضا، لوگو و شماره‌گذاری همان شرکت چاپ می‌شود.
        پیش‌فاکتور «رسمی» همهٔ شناسه‌های لازم صورتحساب (شناسه ملی، کد اقتصادی، کد پستی، شناسه کالا و ...) را می‌خواهد و تا کامل نشود چاپ و ارسال نمی‌شود؛ پیش‌فاکتور «غیررسمی» با نام دیگری و بدون این الزام‌هاست.
      </p>

      {/* the organisation itself */}
      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-black text-[#3A241F]">
            {main.name || 'شرکت اصلی'} <span className="mr-2 text-[10px] font-black rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200">اصلی · رسمی</span>
          </div>
          <span className="text-[11px] text-[#8C6F66]">نام، نشانی، تلفن، کد اقتصادی، لوگو، مهر و امضای آن در بخش‌های «نام و هویت سازمان» و «مهر و امضا» است.</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={lab}>شناسه ملی</label>
            <input className={input} value={settings.companyNationalId || ''} onChange={(e) => setSettings({ ...settings, companyNationalId: e.target.value })} />
          </div>
          <div>
            <label className={lab}>شمارهٔ ثبت</label>
            <input className={input} value={settings.companyRegistrationNumber || ''} onChange={(e) => setSettings({ ...settings, companyRegistrationNumber: e.target.value })} />
          </div>
          <div>
            <label className={lab}>کد پستی</label>
            <input className={input} value={settings.companyPostalCode || ''} onChange={(e) => setSettings({ ...settings, companyPostalCode: e.target.value })} />
          </div>
        </div>
      </div>

      {issuers.map((i) => (
        <div key={i.id} className="rounded-2xl border border-[#EBDBCE] bg-white">
          <button type="button" onClick={() => setOpen(open === i.id ? null : i.id)} className="w-full flex items-center justify-between gap-2 p-4 cursor-pointer">
            <span className="font-black text-[#3A241F]">
              {i.label || 'بدون نام'}
              <span className={`mr-2 text-[10px] font-black rounded-full px-2 py-0.5 border ${i.kind === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {i.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}
              </span>
            </span>
            <ChevronDown className={`w-4 h-4 text-[#8C6F66] transition-transform ${open === i.id ? 'rotate-180' : ''}`} />
          </button>
          {open === i.id && (
            <div className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {text(i, 'label', 'نام در فهرست (فقط برای خودتان)')}
                <div>
                  <label className={lab}>نوع</label>
                  <select className={input} value={i.kind} onChange={(e) => patch(i.id, { kind: e.target.value as ProformaIssuer['kind'] })}>
                    <option value="OFFICIAL">رسمی (با شناسه‌های مالیاتی)</option>
                    <option value="UNOFFICIAL">غیررسمی (با نام دیگر)</option>
                  </select>
                </div>
                {text(i, 'numberPrefix', 'پیشوند شمارهٔ پیش‌فاکتور (مثلاً B-)', true)}
                {text(i, 'name', 'نام روی پیش‌فاکتور')}
                {text(i, 'subtitle', 'عنوان فرعی زیر نام')}
                {text(i, 'phone', 'تلفن')}
                <div className="sm:col-span-3">{text(i, 'address', 'نشانی')}</div>
                {text(i, 'website', 'وب‌سایت', true)}
                <div>
                  <label className={lab}>مالیات پیش‌فرض (٪)</label>
                  <input type="number" min={0} max={100} className={input} value={i.taxPercent ?? 0} onChange={(e) => patch(i.id, { taxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                </div>
                {i.kind === 'OFFICIAL' && (
                  <>
                    {text(i, 'economicCode', 'کد اقتصادی')}
                    {text(i, 'nationalId', 'شناسه ملی')}
                    {text(i, 'registrationNumber', 'شمارهٔ ثبت')}
                    {text(i, 'postalCode', 'کد پستی')}
                  </>
                )}
                {text(i, 'ceoName', 'نام امضاکننده')}
                {text(i, 'ceoTitle', 'سمت امضاکننده')}
              </div>
              <div>
                <label className={lab}>اطلاعات پرداخت (شماره حساب / شبا)</label>
                <textarea className={`${input} min-h-[60px]`} value={i.bankInfo || ''} onChange={(e) => patch(i.id, { bankInfo: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PictureField title="لوگو" value={i.logoUrl} onChange={(v) => patch(i.id, { logoUrl: v })} />
                <PictureField title="مهر" value={i.stampUrl} onChange={(v) => patch(i.id, { stampUrl: v })} />
                <PictureField title="امضا" value={i.signatureUrl} onChange={(v) => patch(i.id, { signatureUrl: v })} />
              </div>
              <button type="button" onClick={() => remove(i)} className="flex items-center gap-1.5 text-rose-600 font-black cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
                حذف این صادرکننده
              </button>
            </div>
          )}
        </div>
      ))}
      <p className="text-[11px] text-[#8C6F66]">پس از تغییر، دکمهٔ «ذخیرهٔ کلیه تنظیمات» بالای صفحه را بزنید.</p>
    </div>
  );
};
