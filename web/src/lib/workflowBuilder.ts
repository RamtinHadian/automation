import type { WfField, WfRef, WfStep, WfPackageBody } from './workflow';

// The model of the in-app workflow builder («ساز گردشکار») and its conversion to / from the package file (server/internal/workflow).
// The builder keeps a plain list of steps; every step flows into the next one in the list unless it says otherwise.

export interface BField { key: string; label: string; type: WfField['type']; required: boolean; options: string }
export interface BStep {
  uid: string; type: WfStep['type']; name: string; who: WfRef[]; mode: 'any' | 'all'; hours: string; reject: string; next: string;
  cond: { field: string; op: string; value: string }; then: string; else: string; to: WfRef[]; text: string; outcome: 'approved' | 'rejected' | 'done';
}
export interface BState { id: string; version: number; name: string; description: string; allow: WfRef[]; title: string; fields: BField[]; steps: BStep[]; nf: number; nu: number }

export const WHO_KINDS: [string, string][] = [
  ['starter', 'درخواست‌دهنده'], ['starterManager', 'مدیر واحدِ درخواست‌دهنده'], ['ceo', 'مدیرعامل'], ['admin', 'مدیر سیستم'],
  ['user', 'یک نفر مشخص'], ['unit', 'مدیر یک واحد'], ['unitMembers', 'همهٔ اعضای یک واحد'], ['field', 'فردِ انتخاب‌شده در فرم'],
];
export const ALLOW_KINDS: [string, string][] = [['everyone', 'همهٔ همکاران'], ...WHO_KINDS.filter(([k]) => k !== 'starter' && k !== 'starterManager')];
export const FIELD_TYPES: [WfField['type'], string][] = [['text', 'متن کوتاه'], ['textarea', 'متن بلند'], ['number', 'عدد'], ['money', 'مبلغ'], ['date', 'تاریخ'], ['select', 'انتخاب از فهرست'], ['person', 'انتخاب همکار'], ['yesno', 'بله / خیر']];
export const OPS: [string, string][] = [['>', 'بیشتر از'], ['>=', 'بیشتر یا برابر'], ['<', 'کمتر از'], ['<=', 'کمتر یا برابر'], ['==', 'برابر'], ['!=', 'نابرابر'], ['contains', 'شامل'], ['notEmpty', 'پر باشد'], ['empty', 'خالی باشد']];
export const STEP_NAME: Record<string, string> = { approval: 'تأیید', task: 'کار', condition: 'شرط', notify: 'اطلاع‌رسانی', end: 'پایان' };
export const OUTCOMES: ['approved' | 'rejected' | 'done', string][] = [['approved', 'تأیید شد'], ['done', 'انجام شد'], ['rejected', 'رد شد']];

export const freshState = (): BState => ({ id: 'flow-' + Math.random().toString(36).slice(2, 6), version: 1, name: '', description: '', allow: [{ kind: 'everyone' }], title: '', fields: [], steps: [], nf: 0, nu: 0 });

export function newStep(s: BState, type: WfStep['type']): BStep {
  s.nu += 1;
  return {
    uid: 'u' + s.nu, type, name: '', who: [{ kind: type === 'task' ? 'user' : 'starterManager' }], mode: 'any', hours: '', reject: '', next: '',
    cond: { field: s.fields[0]?.key || '', op: '>', value: '' }, then: '', else: '', to: [{ kind: 'starter' }], text: '', outcome: type === 'end' ? 'approved' : 'done',
  };
}

export const fieldLabel = (s: BState, key: string) => s.fields.find((f) => f.key === key)?.label || key;
export const stepLabel = (st: BStep, i: number) => st.name.trim() || `${STEP_NAME[st.type]} ${i + 1}`;

const cleanRefs = (l: WfRef[]): WfRef[] => l.map((w) => (['user', 'unit', 'unitMembers', 'field'].includes(w.kind) ? { kind: w.kind, ref: (w.ref || '').trim() } : { kind: w.kind }));

/** The package file the server checks and runs. */
export function toPackage(s: BState): WfPackageBody {
  const steps: BStep[] = [...s.steps];
  if (!steps.length || steps[steps.length - 1].type !== 'end') steps.push({ ...newStep({ ...s, nu: 0 }, 'end'), uid: '_end', name: 'پایان', outcome: 'done' });
  const ids = steps.map((_, i) => 's' + (i + 1));
  const idOf = (u: string) => { const i = steps.findIndex((x) => x.uid === u); return i < 0 ? '' : ids[i]; };
  const tpl = (t: string) => { let x = t || ''; s.fields.forEach((f) => { if (f.label.trim()) x = x.split('{{' + f.label.trim() + '}}').join('{{' + f.key + '}}'); }); return x; };
  const out: WfStep[] = steps.map((st, i) => {
    const nx = i + 1 < steps.length ? ids[i + 1] : '';
    const o: WfStep = { id: ids[i], type: st.type };
    if (st.name.trim()) o.name = st.name.trim();
    if (st.type === 'approval' || st.type === 'task') {
      o.who = cleanRefs(st.who);
      if (st.type === 'approval' && st.who.length > 1 && st.mode === 'all') o.mode = 'all';
      const h = parseFloat(st.hours); if (h > 0) o.hours = h;
      o.next = (st.next && idOf(st.next)) || nx;
      if (st.type === 'approval' && st.reject && idOf(st.reject)) o.onReject = idOf(st.reject);
    } else if (st.type === 'condition') {
      const f = s.fields.find((x) => x.key === st.cond.field);
      const c: NonNullable<WfStep['if']> = { field: st.cond.field, op: st.cond.op };
      if (!['empty', 'notEmpty'].includes(st.cond.op)) {
        const n = parseFloat(String(st.cond.value).replace(/[٬,\s]/g, ''));
        c.value = f && (f.type === 'number' || f.type === 'money') && !isNaN(n) ? n : st.cond.value;
      }
      o.if = c; o.then = (st.then && idOf(st.then)) || nx; o.else = (st.else && idOf(st.else)) || nx;
    } else if (st.type === 'notify') {
      o.to = cleanRefs(st.to); o.text = tpl(st.text); o.next = (st.next && idOf(st.next)) || nx;
    } else if (st.type === 'end') {
      o.outcome = st.outcome;
    }
    return o;
  });
  const p: WfPackageBody = { id: s.id, version: s.version, name: s.name.trim(), start: { allow: cleanRefs(s.allow) }, steps: out };
  if (s.description.trim()) p.description = s.description.trim();
  if (s.title.trim()) p.start.title = tpl(s.title);
  if (s.fields.length) p.fields = s.fields.map((f) => ({ key: f.key, label: f.label.trim(), type: f.type, ...(f.required ? { required: true } : {}), ...(f.type === 'select' ? { options: f.options.split(/[,،]/).map((x) => x.trim()).filter(Boolean) } : {}) }));
  return { format: 'hoormand-workflow/1', ...p } as WfPackageBody;
}

/** A saved package back into the builder (the steps keep their order; only jumps away from «the next step» are remembered). */
export function fromPackage(p: WfPackageBody): BState {
  const s = freshState();
  s.id = p.id; s.version = p.version; s.name = p.name; s.description = p.description || '';
  s.allow = (p.start.allow?.length ? p.start.allow : [{ kind: 'everyone' }]).map((w) => ({ kind: w.kind, ...(w.ref ? { ref: w.ref } : {}) }));
  s.fields = (p.fields || []).map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: (f.options || []).join('، ') }));
  s.nf = s.fields.reduce((m, f) => Math.max(m, parseInt((f.key.match(/\d+/) || ['0'])[0], 10) || 0), 0);
  const back = (t?: string) => { let x = t || ''; s.fields.forEach((f) => { x = x.split('{{' + f.key + '}}').join('{{' + f.label + '}}'); }); return x; };
  s.title = back(p.start.title);
  const U = p.steps.map((_, i) => 'u' + (i + 1));
  s.nu = p.steps.length;
  const at = (id?: string) => { const i = p.steps.findIndex((x) => x.id === id); return i < 0 ? '' : U[i]; };
  s.steps = p.steps.map((st, i) => {
    const nx = p.steps[i + 1]?.id;
    const b: BStep = {
      uid: U[i], type: st.type, name: st.name || '', who: (st.who?.length ? st.who : [{ kind: 'starterManager' }]).map((w) => ({ ...w })), mode: st.mode === 'all' ? 'all' : 'any',
      hours: st.hours ? String(st.hours) : '', reject: at(st.onReject), next: st.next && st.next !== nx ? at(st.next) : '', cond: { field: '', op: '>', value: '' }, then: '', else: '',
      to: (st.to?.length ? st.to : [{ kind: 'starter' }]).map((w) => ({ ...w })), text: back(st.text), outcome: st.outcome || 'done',
    };
    if (st.if) {
      b.cond = { field: st.if.field || '', op: st.if.op || '>', value: st.if.value == null ? '' : String(st.if.value) };
      b.then = st.then && st.then !== nx ? at(st.then) : '';
      b.else = st.else && st.else !== nx ? at(st.else) : '';
    }
    return b;
  });
  return s;
}

export function presetState(kind: 'buy' | 'simple'): BState {
  const s = freshState();
  s.name = kind === 'buy' ? 'درخواست خرید تجهیزات' : 'درخواست تأیید ساده';
  s.description = kind === 'buy' ? 'مدیر واحد تأیید می‌کند؛ اگر مبلغ از ۵۰ میلیون تومان بیشتر بود مدیرعامل هم می‌بیند.' : 'همکار درخواست می‌دهد و مدیر واحدش تأیید می‌کند.';
  s.fields = [{ key: 'f1', label: 'موضوع', type: 'text', required: true, options: '' }, { key: 'f2', label: 'مبلغ', type: 'money', required: kind === 'buy', options: '' }];
  s.nf = 2; s.title = '{{موضوع}}';
  const a = { ...newStep(s, 'approval'), name: 'تأیید مدیر واحد', hours: '24' };
  const e = { ...newStep(s, 'end'), name: 'تأیید شد' };
  if (kind === 'buy') {
    const c = { ...newStep(s, 'condition'), name: 'مبلغ بالاست؟', cond: { field: 'f2', op: '>', value: '50000000' } };
    const m = { ...newStep(s, 'approval'), name: 'تأیید مدیرعامل', who: [{ kind: 'ceo' }], hours: '48' };
    c.then = m.uid;
    c.else = e.uid;
    s.steps = [a, c, m, e];
  } else {
    s.steps = [a, e];
  }
  return s;
}
