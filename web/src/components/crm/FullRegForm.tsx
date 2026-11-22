import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PAPER_AREA, PAPER_BUTTON, PAPER_INPUT, PAPER_LABEL } from '../common/paperStyles';
import { PaperNotice } from '../common/PaperNotice';

// The full registration form a COMPANY fills in about itself. The labels are the keys of the console's form tuning (form «selfreg»): which fields exist and
// which are required. The names and labels must match server/internal/api/selfreg.go.

type Kind = 'text' | 'tel' | 'num' | 'email' | 'url' | 'area' | 'select';
interface F { key: string; label: string; kind: Kind; hint?: string; maxLength?: number }

export const SELF_FIELDS: F[] = [
  { key: 'company', label: 'نام شرکت', kind: 'text' },
  { key: 'companyType', label: 'نوع شرکت', kind: 'select' },
  { key: 'nationalId', label: 'شناسهٔ ملی (۱۱ رقم)', kind: 'num', maxLength: 11 },
  { key: 'economicCode', label: 'کد اقتصادی (۱۲ رقم)', kind: 'num', maxLength: 12 },
  { key: 'registrationNumber', label: 'شمارهٔ ثبت', kind: 'num' },
  { key: 'repName', label: 'نام و نام خانوادگی نماینده', kind: 'text' },
  { key: 'repPosition', label: 'سمت نماینده', kind: 'text' },
  { key: 'phone', label: 'موبایل', kind: 'tel', hint: '09123456789' },
  { key: 'landline', label: 'تلفن ثابت', kind: 'tel', hint: '02112345678' },
  { key: 'email', label: 'ایمیل', kind: 'email' },
  { key: 'website', label: 'وب‌سایت', kind: 'url', hint: 'example.com' },
  { key: 'province', label: 'استان', kind: 'text' },
  { key: 'city', label: 'شهر', kind: 'text' },
  { key: 'postalCode', label: 'کد پستی (۱۰ رقم)', kind: 'num', maxLength: 10 },
  { key: 'address', label: 'نشانی کامل', kind: 'area' },
  { key: 'industry', label: 'زمینهٔ فعالیت', kind: 'text' },
  { key: 'note', label: 'توضیحات', kind: 'area' },
];
export const SELF_DEFAULT_REQUIRED = ['نام شرکت', 'نام و نام خانوادگی نماینده', 'موبایل'];
const COMPANY_TYPES = ['سهامی خاص', 'سهامی عام', 'مسئولیت محدود', 'تضامنی', 'نسبی', 'تعاونی', 'مختلط', 'دیگر'];

const input = PAPER_INPUT;
const lab = PAPER_LABEL;

/** With `cfg` the form applies the tuning itself (the public page has no console data); without it the form carries data-form-id for the console's design mode. */
export const FullRegForm: React.FC<{
  cfg?: { hidden?: string[]; required?: string[] };
  onSubmit: (fields: Record<string, string>, trap: string) => Promise<string | null>;
  submitText?: string;
}> = ({ cfg, onSubmit, submitText = 'ثبت مشخصات' }) => {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [trap, setTrap] = useState('');
  const hidden = cfg?.hidden || [];
  const required = cfg?.required || SELF_DEFAULT_REQUIRED;
  const on = (label: string) => !cfg || !hidden.includes(label);
  const req = (label: string) => !!cfg && required.includes(label);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !cfg) return;
    setErr('');
    const miss = SELF_FIELDS.find((f) => on(f.label) && req(f.label) && !(v[f.key] || '').trim());
    if (miss) { setErr(`«${miss.label}» را وارد کنید.`); return; }
    setBusy(true);
    const failure = await onSubmit(v, trap);
    setBusy(false);
    if (failure) setErr(failure);
  };

  return (
    <form onSubmit={submit} data-form-id={cfg ? undefined : 'selfreg'} className="space-y-3" noValidate>
      {SELF_FIELDS.filter((f) => on(f.label)).map((f) => (
        <div key={f.key}>
          <label className={lab}>{f.label}{req(f.label) && <span className="text-rose-600"> *</span>}</label>
          {f.kind === 'area' ? (
            <textarea className={PAPER_AREA} rows={3} value={v[f.key] || ''} onChange={set(f.key)} />
          ) : f.kind === 'select' ? (
            <select className={input} value={v[f.key] || ''} onChange={set(f.key)}>
              <option value="">انتخاب کنید</option>
              {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <input
              className={input}
              value={v[f.key] || ''}
              onChange={set(f.key)}
              autoComplete="off"
              maxLength={f.maxLength}
              inputMode={f.kind === 'tel' ? 'tel' : f.kind === 'num' ? 'numeric' : f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : undefined}
              dir={f.kind === 'tel' || f.kind === 'num' || f.kind === 'email' || f.kind === 'url' ? 'ltr' : undefined}
              style={f.kind === 'tel' || f.kind === 'num' || f.kind === 'email' || f.kind === 'url' ? { textAlign: 'right' } : undefined}
              placeholder={f.hint}
            />
          )}
        </div>
      ))}
      {cfg && <input type="text" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute left-0 top-0 w-0 h-0 opacity-0 overflow-hidden pointer-events-none" aria-hidden="true" />}
      {err && <PaperNotice kind="err" text={err} onClose={() => setErr('')} />}
      <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] bg-transparent">
        <button type="submit" disabled={busy} className={PAPER_BUTTON}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {busy ? 'در حال ارسال…' : submitText}
        </button>
      </div>
    </form>
  );
};
