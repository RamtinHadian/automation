import React, { useState } from 'react';
import { Building2, Upload, UserSquare2 } from 'lucide-react';
import { ProformaIssuer, SystemSettings } from '../../types';
import { PersonPicker } from '../common/PersonPicker';

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

const input2 = input;

/** The tick «send to the CEO for approval» each of the two companies has. */
const ApprovalTick: React.FC<{ checked: boolean; onChange: (v: boolean) => void; approverId?: string; onApprover: (v: string) => void; staff: { id: string; name: string }[] }> = ({ checked, onChange, approverId, onApprover, staff }) => (
  <div className="rounded-xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2.5">
  <label className="flex items-start gap-2.5 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 w-4 h-4 accent-[#6E1B1B]" />
    <span>
      <span className="block font-black text-[#3A241F]">ارسال پیش‌فاکتور برای تایید و امضای مدیرعامل</span>
      <span className="block text-[11px] leading-6 text-[#8C6F66] font-medium">
        اگر روشن باشد، پیش‌فاکتور اول به «پیش‌فاکتورهای ارسالی» مدیرعامل می‌رود؛ پس از تایید، مهر و امضای همین شرکت پای آن درج می‌شود و بعد می‌شود آن را چاپ یا ارسال کرد.
      </span>
    </span>
  </label>
  {checked && (
    <div className="flex flex-wrap items-center gap-2 pr-6">
      <span className="font-black text-[#3A241F]">با تایید چه کسی مهر و امضا شود؟</span>
      <PersonPicker title="تأیید‌کنندهٔ مهر و امضا" items={staff.map((u) => ({ id: u.id, name: u.name }))} value={approverId || ''} onChange={onApprover} emptyLabel="هر کسی که اجازهٔ امضای نامهٔ رسمی دارد" className="min-w-[240px]" />
    </div>
  )}
  </div>
);

/**
 * The proforma settings: exactly two issuing companies.
 * 1. the official company (all the tax identity details, printed on the official form);
 * 2. an unofficial business, like an individual with a business licence (no economic code and the like).
 */
export const ProformaIssuersCard: React.FC<{ staff: { id: string; name: string }[]; settings: SystemSettings; setSettings: (s: SystemSettings) => void; children?: React.ReactNode; unofficialChildren?: React.ReactNode }> = ({ staff, settings, setSettings, children, unofficialChildren }) => {
  const all = settings.proformaIssuers || [];
  const saved = all.find((i) => i.kind === 'UNOFFICIAL');
  const other: ProformaIssuer = saved || { id: 'personal', label: 'کسب‌وکار غیررسمی', kind: 'UNOFFICIAL', name: '', taxPercent: 0, numberPrefix: 'N-' };
  const patch = (u: Partial<ProformaIssuer>) => setSettings({ ...settings, proformaIssuers: saved ? all.map((i) => (i.id === saved.id ? { ...i, ...u } : i)) : [...all, { ...other, ...u }] });

  const main = (key: keyof SystemSettings, title: string, ltr = false) => (
    <div>
      <label className={lab}>{title}</label>
      <input
        className={input2}
        dir={ltr ? 'ltr' : undefined}
        value={key === 'proformaCompanyName' && settings.proformaCompanyName === undefined ? settings.companyName || '' : ((settings[key] as string) || '')}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
      />
    </div>
  );
  const text = (key: keyof ProformaIssuer, title: string, ltr = false) => (
    <div>
      <label className={lab}>{title}</label>
      <input className={input2} dir={ltr ? 'ltr' : undefined} value={(other[key] as string) || ''} onChange={(e) => patch({ [key]: e.target.value } as Partial<ProformaIssuer>)} />
    </div>
  );

  return (
    <>
      {/* 1. the official company */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border-2 border-emerald-200 shadow-sm space-y-4 text-xs">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-emerald-700" />
          ۱. شرکت رسمی
        </h3>
        <p className="text-[#8C6F66] leading-6">پیش‌فاکتور این شرکت همیشه با فرم رسمی «صورتحساب فروش کالا و خدمات» (A4 افقی، مبالغ به ریال) چاپ می‌شود و تا کامل‌بودن همهٔ مشخصات، چاپ و ارسال نمی‌شود.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {main('proformaCompanyName', 'نام شخص حقوقی')}
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
            <label className={lab}>مالیات بر ارزش افزوده (٪)</label>
            <input type="number" min={0} max={100} className={input2} value={settings.proformaTaxPercent ?? 10} onChange={(e) => setSettings({ ...settings, proformaTaxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>اطلاعات پرداخت (شماره حساب / شبا)</label>
            <input className={input2} value={settings.proformaBankInfo || ''} onChange={(e) => setSettings({ ...settings, proformaBankInfo: e.target.value })} />
          </div>
          {main('ceoName', 'نام امضاکننده (مدیرعامل)')}
          {main('ceoTitle', 'سمت امضاکننده')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PictureField title="لوگو" value={settings.companyLogoUrl} onChange={(v) => setSettings({ ...settings, companyLogoUrl: v })} />
          <PictureField title="مهر" value={settings.companyStampUrl} onChange={(v) => setSettings({ ...settings, companyStampUrl: v })} />
          <PictureField title="امضا" value={settings.ceoSignatureUrl} onChange={(v) => setSettings({ ...settings, ceoSignatureUrl: v })} />
        </div>
        <ApprovalTick staff={staff} checked={settings.proformaApprovalRequired === true} onChange={(v) => setSettings({ ...settings, proformaApprovalRequired: v })} approverId={settings.proformaApproverId} onApprover={(v) => setSettings({ ...settings, proformaApproverId: v || undefined })} />
        {children}
      </div>

      {/* 2. the unofficial business */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border-2 border-[#EBDBCE] shadow-sm space-y-4 text-xs">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
          <UserSquare2 className="w-4 h-4 text-[#6E1B1B]" />
          ۲. کسب‌وکار غیررسمی (شخص حقیقی با مجوز کسب‌وکار)
        </h3>
        <p className="text-[#8C6F66] leading-6">مثل فاکتور افراد حقیقی دارای مجوز؛ بدون کد اقتصادی و شناسهٔ ملی شرکت و بدون الزام مالیاتی. قالب این پیش‌فاکتور قابل طراحی است.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {text('name', 'نام و نام خانوادگی / نام کسب‌وکار')}
          {text('licenseNumber', 'شمارهٔ مجوز کسب‌وکار')}
          {text('nationalId', 'کد ملی')}
          {text('phone', 'تلفن')}
          {text('postalCode', 'کد پستی')}
          {text('numberPrefix', 'پیشوند شمارهٔ پیش‌فاکتور (مثلاً N-)', true)}
          <div className="sm:col-span-3">{text('address', 'نشانی')}</div>
          <div>
            <label className={lab}>مالیات (٪)</label>
            <input type="number" min={0} max={100} className={input2} value={other.taxPercent ?? 0} onChange={(e) => patch({ taxPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          </div>
          <div className="sm:col-span-2">{text('bankInfo', 'اطلاعات پرداخت (شماره حساب / شبا)')}</div>
          {text('ceoName', 'نام امضاکننده')}
          {text('ceoTitle', 'سمت امضاکننده')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PictureField title="لوگو" value={other.logoUrl} onChange={(v) => patch({ logoUrl: v })} />
          <PictureField title="مهر" value={other.stampUrl} onChange={(v) => patch({ stampUrl: v })} />
          <PictureField title="امضا" value={other.signatureUrl} onChange={(v) => patch({ signatureUrl: v })} />
        </div>
        <ApprovalTick staff={staff} checked={other.approvalRequired === true} onChange={(v) => patch({ approvalRequired: v })} approverId={other.approverId} onApprover={(v) => patch({ approverId: v || undefined })} />
        {unofficialChildren}
      </div>
    </>
  );
};
