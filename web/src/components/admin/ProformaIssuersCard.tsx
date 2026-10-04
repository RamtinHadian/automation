import React, { useState } from 'react';
import { Building2, ChevronDown, Plus, Trash2, Upload } from 'lucide-react';
import { ProformaIssuer, SystemSettings } from '../../types';

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

/**
 * One of the two proforma parts in the settings.
 * OFFICIAL: the companies that issue the tax-authority «صورتحساب فروش کالا و خدمات» form (the main company first).
 * UNOFFICIAL: other names / offices that issue an ordinary designed proforma.
 */
export const ProformaIssuersCard: React.FC<{ kind: ProformaIssuer['kind']; settings: SystemSettings; setSettings: (s: SystemSettings) => void; children?: React.ReactNode }> = ({ kind, settings, setSettings, children }) => {
  const all = settings.proformaIssuers || [];
  const issuers = all.filter((i) => i.kind === kind);
  const official = kind === 'OFFICIAL';
  const [open, setOpen] = useState<string | null>(null);

  const setIssuers = (list: ProformaIssuer[]) => setSettings({ ...settings, proformaIssuers: list });
  const patch = (id: string, u: Partial<ProformaIssuer>) => setIssuers(all.map((i) => (i.id === id ? { ...i, ...u } : i)));
  const add = () => {
    const n: ProformaIssuer = { id: uid(), label: official ? 'شرکت دوم (رسمی)' : 'دفتر دوم (غیررسمی)', kind, name: '', taxPercent: official ? settings.proformaTaxPercent ?? 10 : 0, numberPrefix: official ? 'B-' : 'N-' };
    setIssuers([...all, n]);
    setOpen(n.id);
  };
  const remove = (i: ProformaIssuer) => {
    if (!window.confirm(`«${i.label}» از فهرست صادرکننده‌ها حذف شود؟ پیش‌فاکتورهای قبلی که با آن ساخته شده‌اند به شرکت اصلی برمی‌گردند.`)) return;
    setIssuers(all.filter((x) => x.id !== i.id));
  };

  const text = (i: ProformaIssuer, key: keyof ProformaIssuer, title: string, ltr = false) => (
    <div>
      <label className={lab}>{title}</label>
      <input className={input} dir={ltr ? 'ltr' : undefined} value={(i[key] as string) || ''} onChange={(e) => patch(i.id, { [key]: e.target.value } as Partial<ProformaIssuer>)} />
    </div>
  );
  const main = (key: keyof SystemSettings, title: string, ltr = false) => (
    <div>
      <label className={lab}>{title}</label>
      <input
        className={input}
        dir={ltr ? 'ltr' : undefined}
        value={key === 'proformaCompanyName' && settings.proformaCompanyName === undefined ? settings.companyName || '' : ((settings[key] as string) || '')}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <div className={`bg-white p-6 sm:p-7 rounded-3xl border-2 shadow-sm space-y-4 text-xs ${official ? 'border-emerald-200' : 'border-[#EBDBCE]'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <Building2 className={`w-4 h-4 ${official ? 'text-emerald-700' : 'text-[#6E1B1B]'}`} />
          {official ? '۱. پیش‌فاکتور رسمی — فرم صورتحساب فروش کالا و خدمات (دارایی)' : '۲. پیش‌فاکتور غیررسمی — با نام و ظاهر دلخواه'}
        </h3>
        <button type="button" onClick={add} className={`flex items-center gap-1 px-3 py-2 rounded-xl text-white font-black cursor-pointer ${official ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#3A241F] hover:bg-black'}`}>
          <Plus className="w-3.5 h-3.5" />
          {official ? 'افزودن شرکت رسمی دیگر' : 'افزودن دفتر / نام غیررسمی'}
        </button>
      </div>
      <p className="text-[#8C6F66] leading-6">
        {official
          ? 'هر پیش‌فاکتورِ شرکتِ رسمی، همیشه با قالب ثابت «صورتحساب فروش کالا و خدمات» (برگهٔ افقی A4، مبالغ به ریال، با مشخصات فروشنده و خریدار، شناسهٔ کالا، مالیات و ردیف مهر و امضا) چاپ می‌شود و ظاهر آن قابل تغییر نیست. تا همهٔ مشخصات لازم کامل نشود، چاپ و ارسال نمی‌شود.'
          : 'برای دفتر یا نامی که رسمی نیست؛ این پیش‌فاکتور با قالبِ قابل‌طراحیِ خودتان (رنگ، لوگو، ترتیب بخش‌ها) صادر می‌شود و الزام شناسه‌های مالیاتی ندارد.'}
      </p>

      {official && (
        <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-black text-[#3A241F]">
              {settings.proformaCompanyName ?? (settings.companyName || 'شرکت اصلی')} <span className="mr-2 text-[10px] font-black rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200">شرکت اصلی</span>
            </div>
            <span className="text-[11px] text-[#8C6F66]">لوگو، مهر و امضای این شرکت در بخش‌های «نام و هویت سازمان» و «مهر و امضا» است.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {main('proformaCompanyName', 'نام شرکت روی برگه')}
            {main('companyEconomicCode', 'کد اقتصادی')}
            {main('companyNationalId', 'شناسه ملی')}
            {main('companyRegistrationNumber', 'شمارهٔ ثبت')}
            {main('companyPhone', 'تلفن / نمابر')}
            {main('companyPostalCode', 'کد پستی ۱۰ رقمی')}
            {main('companyProvince', 'استان')}
            {main('companyCounty', 'شهرستان')}
            {main('companyCity', 'شهر')}
            <div className="sm:col-span-3">{main('companyAddress', 'نشانی کامل')}</div>
            <div>
              <label className={lab}>مالیات بر ارزش افزودهٔ پیش‌فرض (٪)</label>
              <input type="number" min={0} max={100} className={input} value={settings.proformaTaxPercent ?? 10} onChange={(e) => setSettings({ ...settings, proformaTaxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
            </div>
            <div className="sm:col-span-2">
              <label className={lab}>اطلاعات پرداخت (شماره حساب / شبا)</label>
              <input className={input} value={settings.proformaBankInfo || ''} onChange={(e) => setSettings({ ...settings, proformaBankInfo: e.target.value })} />
            </div>
          </div>
        </div>
      )}

      {issuers.length === 0 && !official && <p className="rounded-xl bg-[#FAF5F1] border border-dashed border-[#EBDBCE] p-4 text-center text-[#8C6F66] font-bold">هنوز دفتر یا نام غیررسمی اضافه نکرده‌اید.</p>}

      {issuers.map((i) => (
        <div key={i.id} className="rounded-2xl border border-[#EBDBCE] bg-white">
          <button type="button" onClick={() => setOpen(open === i.id ? null : i.id)} className="w-full flex items-center justify-between gap-2 p-4 cursor-pointer">
            <span className="font-black text-[#3A241F]">{i.label || 'بدون نام'}</span>
            <ChevronDown className={`w-4 h-4 text-[#8C6F66] transition-transform ${open === i.id ? 'rotate-180' : ''}`} />
          </button>
          {open === i.id && (
            <div className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {text(i, 'label', 'نام در فهرست (فقط برای خودتان)')}
                {text(i, 'name', official ? 'نام شخص حقوقی روی برگه' : 'نام روی پیش‌فاکتور')}
                {text(i, 'numberPrefix', 'پیشوند شمارهٔ پیش‌فاکتور (مثلاً B-)', true)}
                {!official && text(i, 'subtitle', 'عنوان فرعی زیر نام')}
                {text(i, 'phone', 'تلفن')}
                {!official && text(i, 'website', 'وب‌سایت', true)}
                {official && (
                  <>
                    {text(i, 'economicCode', 'کد اقتصادی')}
                    {text(i, 'nationalId', 'شناسه ملی')}
                    {text(i, 'registrationNumber', 'شمارهٔ ثبت')}
                    {text(i, 'postalCode', 'کد پستی ۱۰ رقمی')}
                    {text(i, 'province', 'استان')}
                    {text(i, 'county', 'شهرستان')}
                    {text(i, 'city', 'شهر')}
                  </>
                )}
                <div className="sm:col-span-3">{text(i, 'address', official ? 'نشانی کامل' : 'نشانی')}</div>
                <div>
                  <label className={lab}>مالیات پیش‌فرض (٪)</label>
                  <input type="number" min={0} max={100} className={input} value={i.taxPercent ?? 0} onChange={(e) => patch(i.id, { taxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                </div>
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
                حذف
              </button>
            </div>
          )}
        </div>
      ))}
      {children}
    </div>
  );
};
