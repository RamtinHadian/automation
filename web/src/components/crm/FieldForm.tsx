import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FIELD_FORM } from '../../lib/formConfig';
import { PAPER_AREA, PAPER_BUTTON, PAPER_INPUT, PAPER_LABEL } from '../common/paperStyles';
import { PaperNotice } from '../common/PaperNotice';

export type FieldValues = { name: string; phone: string; company: string; city: string; event: string; note: string };
export const emptyField = (event = ''): FieldValues => ({ name: '', phone: '', company: '', city: '', event, note: '' });

const input = PAPER_INPUT;
const lab = PAPER_LABEL;

/**
 * The very short registration form: name, mobile and a few optional fields. Which of the optional ones exist and which are required is decided in
 * the management console (form «field»). With `cfg` the form applies that itself (the public pages have no console data); without it the form carries
 * data-form-id so that the console's design mode can draw its tuning bars on it.
 */
export const FieldForm: React.FC<{
  cfg?: { hidden?: string[]; required?: string[] };
  onSubmit: (v: FieldValues) => Promise<string | null>;
  keepEvent?: boolean;
  submitText?: string;
  /** the hidden «website» box that catches robots (public pages) */
  trap?: boolean;
}> = ({ cfg, onSubmit, keepEvent = true, submitText = 'ثبت مشتری', trap }) => {
  const [v, setV] = useState<FieldValues>(emptyField());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [bot, setBot] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const hidden = cfg?.hidden || [];
  const required = cfg?.required || ['نام و نام خانوادگی', 'موبایل'];
  const on = (label: string) => !hidden.includes(label) || !cfg;
  const req = (label: string) => !cfg ? false : required.includes(label);
  const set = (k: keyof FieldValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!cfg) return; // the design sample of the console
    const miss = (Object.entries(FIELD_FORM) as [keyof FieldValues, string][]).find(([k, label]) => on(label) && req(label) && !String(v[k]).trim());
    if (miss) { setErr(`«${miss[1]}» را وارد کنید.`); return; }
    setBusy(true);
    const failure = await onSubmit({ ...v, ...(trap ? { website: bot } : {}) } as FieldValues);
    setBusy(false);
    if (failure) { setErr(failure); return; }
    setDone(`«${v.name.trim()}» ثبت شد`);
    setV(emptyField(keepEvent ? v.event : ''));
    setTimeout(() => nameRef.current?.focus(), 30);
  };

  const star = (label: string) => (req(label) ? <span className="text-rose-600"> *</span> : null);

  return (
    <form onSubmit={submit} data-form-id={cfg ? undefined : 'field'} className="space-y-3" noValidate>
      <div>
        <label className={lab}>{FIELD_FORM.name}{star(FIELD_FORM.name)}</label>
        <input ref={nameRef} className={input} value={v.name} onChange={set('name')} autoComplete="off" autoFocus enterKeyHint="next" placeholder="مثلاً علی رضایی" />
      </div>
      <div>
        <label className={lab}>{FIELD_FORM.phone}{star(FIELD_FORM.phone)}</label>
        <input className={input} dir="ltr" inputMode="tel" autoComplete="off" enterKeyHint="next" value={v.phone} onChange={set('phone')} placeholder="09123456789" style={{ textAlign: 'right' }} />
      </div>
      {on(FIELD_FORM.company) && (
        <div>
          <label className={lab}>{FIELD_FORM.company}{star(FIELD_FORM.company)}</label>
          <input className={input} value={v.company} onChange={set('company')} autoComplete="off" enterKeyHint="next" />
        </div>
      )}
      {on(FIELD_FORM.city) && (
        <div>
          <label className={lab}>{FIELD_FORM.city}{star(FIELD_FORM.city)}</label>
          <input className={input} value={v.city} onChange={set('city')} autoComplete="off" enterKeyHint="next" />
        </div>
      )}
      {on(FIELD_FORM.event) && (
        <div>
          <label className={lab}>{FIELD_FORM.event}{star(FIELD_FORM.event)}</label>
          <input className={input} value={v.event} onChange={set('event')} autoComplete="off" enterKeyHint="next" placeholder="مثلاً نمایشگاه ماشین‌آلات راهسازی" />
        </div>
      )}
      {on(FIELD_FORM.note) && (
        <div>
          <label className={lab}>{FIELD_FORM.note}{star(FIELD_FORM.note)}</label>
          <textarea className={PAPER_AREA} rows={3} value={v.note} onChange={set('note')} placeholder="به چه چیزی علاقه دارد؟" />
        </div>
      )}
      {trap && <input type="text" name="website" tabIndex={-1} autoComplete="off" value={bot} onChange={(e) => setBot(e.target.value)} className="absolute left-0 top-0 w-0 h-0 opacity-0 overflow-hidden pointer-events-none" aria-hidden="true" />}
      {err && <PaperNotice kind="err" text={err} onClose={() => setErr('')} />}
      {done && <PaperNotice kind="ok" text={done} onClose={() => setDone('')} />}
      {/* the button stays at the bottom of the screen: no scrolling to reach it on a phone */}
      <div className="sticky bottom-0 -mx-1 px-1 pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] bg-transparent">
        <button type="submit" disabled={busy} className={PAPER_BUTTON}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {busy ? 'در حال ثبت…' : submitText}
        </button>
      </div>
    </form>
  );
};
