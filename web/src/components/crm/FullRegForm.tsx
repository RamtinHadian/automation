import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PAPER_AREA, PAPER_BUTTON, PAPER_INPUT, PAPER_LABEL } from '../common/paperStyles';
import { PaperNotice } from '../common/PaperNotice';

// The full registration form: every field of the «new customer» form except the Sepidar part and the internal ones. The list of fields comes from the
// server (server/internal/api/selfreg.go is the only place that knows them). The label of a field is the key of the console's form tuning (form «selfreg»).

export interface SelfField {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'num' | 'email' | 'url' | 'area' | 'select' | 'date' | 'check';
  kinds?: string[];
  options?: string[];
  max?: number;
  hint?: string;
  defHidden?: boolean;
  group: string;
}

const kindOf = (label: string) => (label.startsWith('حقیقی') ? 'PERSON' : label.startsWith('فروشگاه') ? 'SHOP' : 'COMPANY');
const LTR_TYPES = ['tel', 'num', 'email', 'url', 'date'];

/**
 * With `cfg` the form applies the tuning itself (the public page has no console data). Without it (the console's sample) every field is drawn, whatever the kind,
 * and the form carries data-form-id so that the console's design mode can draw its tuning bars on it.
 */
export const FullRegForm: React.FC<{
  spec: SelfField[];
  cfg?: { hidden?: string[]; required?: string[] };
  onSubmit: (fields: Record<string, string>, trap: string) => Promise<string | null>;
  submitText?: string;
}> = ({ spec, cfg, onSubmit, submitText = 'ثبت مشخصات' }) => {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [trap, setTrap] = useState('');
  const hidden = cfg?.hidden || [];
  const required = cfg?.required || [];
  const kindField = spec.find((f) => f.key === 'kind');
  const kind = !cfg || (kindField && hidden.includes(kindField.label)) ? 'COMPANY' : kindOf(v.kind || kindField?.options?.[0] || '');
  const shown = (f: SelfField) => !cfg || (!hidden.includes(f.label) && (!f.kinds || f.kinds.includes(kind)));
  const req = (f: SelfField) => !!cfg && required.includes(f.label);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !cfg) return;
    setErr('');
    const miss = spec.find((f) => shown(f) && req(f) && (f.type === 'check' ? v[f.key] !== '1' : !(v[f.key] || '').trim()));
    if (miss) { setErr(`«${miss.label}» را ${miss.type === 'check' ? 'تأیید' : 'وارد'} کنید.`); return; }
    setBusy(true);
    const failure = await onSubmit({ ...v, kind: v.kind || kindField?.options?.[0] || '' }, trap);
    setBusy(false);
    if (failure) setErr(failure);
  };

  let lastGroup = '';
  return (
    <form onSubmit={submit} data-form-id={cfg ? undefined : 'selfreg'} className="space-y-3" noValidate>
      {spec.filter(shown).map((f) => {
        const head = f.group !== lastGroup && f.group !== 'نوع' ? f.group : '';
        lastGroup = f.group;
        const star = req(f) ? <span className="text-rose-600"> *</span> : null;
        return (
          <React.Fragment key={f.key}>
            {head && <div className="pt-2 text-[12px] font-black text-[#3e574b] border-b border-[#d5ddd8] pb-1 mr-3">{head}</div>}
            {f.type === 'check' ? (
              <div className="flex flex-row-reverse items-center justify-end gap-2 mr-3">
                <label htmlFor={'sf-' + f.key} className="text-[13px] font-bold text-[#3a4a41] cursor-pointer">{f.label}{star}</label>
                <input id={'sf-' + f.key} type="checkbox" className="w-5 h-5 accent-[#3e574b]" checked={v[f.key] === '1'} onChange={(e) => setV((p) => ({ ...p, [f.key]: e.target.checked ? '1' : '' }))} />
              </div>
            ) : (
              <div>
                <label htmlFor={'sf-' + f.key} className={PAPER_LABEL}>{f.label}{star}</label>
                {f.type === 'area' ? (
                  <textarea id={'sf-' + f.key} className={PAPER_AREA} rows={3} value={v[f.key] || ''} onChange={set(f.key)} placeholder={f.hint} />
                ) : f.type === 'select' ? (
                  <select id={'sf-' + f.key} className={PAPER_INPUT} value={v[f.key] ?? (f.key === 'kind' ? f.options?.[0] || '' : '')} onChange={set(f.key)}>
                    {f.key !== 'kind' && <option value="">انتخاب کنید</option>}
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    id={'sf-' + f.key}
                    className={PAPER_INPUT}
                    value={v[f.key] || ''}
                    onChange={set(f.key)}
                    autoComplete="off"
                    maxLength={f.max}
                    inputMode={f.type === 'tel' ? 'tel' : f.type === 'num' ? 'numeric' : f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined}
                    dir={LTR_TYPES.includes(f.type) ? 'ltr' : undefined}
                    style={LTR_TYPES.includes(f.type) ? { textAlign: 'right' } : undefined}
                    placeholder={f.hint}
                  />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
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
