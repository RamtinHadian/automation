// Workflows («گردشکار»): the types the server sends, and the words used to describe a package to people (see server/internal/workflow).

export interface WfRef { kind: string; ref?: string }
export interface WfField { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'person' | 'yesno'; required?: boolean; options?: string[]; hint?: string }
export interface WfCond { field?: string; op?: string; value?: unknown; all?: WfCond[]; any?: WfCond[] }
export interface WfStep {
  id: string; type: 'approval' | 'task' | 'condition' | 'notify' | 'end'; name?: string; who?: WfRef[]; mode?: string; hours?: number; escalate?: WfRef[];
  next?: string; onReject?: string; if?: WfCond; then?: string; else?: string; to?: WfRef[]; text?: string; outcome?: 'approved' | 'rejected' | 'done';
}
export interface WfPackageBody {
  id: string; version: number; name: string; description?: string; customer?: string;
  start: { allow?: WfRef[]; title?: string }; fields?: WfField[]; steps: WfStep[];
}
export interface WfPackageRow { id: string; version: number; name: string; enabled: boolean; keyId: string; uploadedAt: string; uploadedBy: string; running: number; package: WfPackageBody }
export interface WfStartable { id: string; version: number; name: string; description?: string; fields: WfField[] }
export interface WfEvent { at: string; step: string; stepName?: string; type: string; action?: string; by?: string; comment?: string; note?: string }
export interface WfInstance {
  id: string; packageId: string; packageName: string; title: string; status: 'running' | 'approved' | 'rejected' | 'done' | 'cancelled';
  startedBy: string; startedByName: string; startedAt: string; finishedAt?: string | null;
  step: string; stepName: string; stepType: string; waiting: { id: string; name: string }[]; dueAt?: string | null;
  fields: { label: string; value: string; type: string }[]; history: WfEvent[]; steps: { id: string; name: string; type: string }[];
  mine: boolean; actions: ('approve' | 'reject' | 'complete')[]; canCancel: boolean;
}

export const WF_STATUS: Record<WfInstance['status'], { label: string; cls: string }> = {
  running: { label: 'در جریان', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  approved: { label: 'تأیید شد', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  done: { label: 'انجام شد', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  rejected: { label: 'رد شد', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'لغو شد', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const WF_STEP_LABEL: Record<string, string> = { approval: 'تأیید', task: 'کار', condition: 'شرط', notify: 'اطلاع‌رسانی', end: 'پایان' };

const OPS: Record<string, string> = { '==': 'برابر', '!=': 'نابرابر', '>': 'بیشتر از', '>=': 'بیشتر یا برابر', '<': 'کمتر از', '<=': 'کمتر یا برابر', contains: 'شامل', empty: 'خالی', notEmpty: 'پر' };

/** The people of a «who / to / allow» list in plain words. */
export function describeRefs(refs: WfRef[] | undefined, fields: WfField[] = []): string {
  if (!refs || refs.length === 0) return '—';
  return refs
    .map((r) => {
      switch (r.kind) {
        case 'everyone': return 'همهٔ همکاران';
        case 'starter': return 'درخواست‌دهنده';
        case 'starterManager': return 'مدیر واحدِ درخواست‌دهنده';
        case 'ceo': return 'مدیرعامل';
        case 'admin': return 'مدیر سیستم';
        case 'user': return r.ref || '—';
        case 'unit': return `مدیر واحد «${r.ref}»`;
        case 'unitMembers': return `اعضای واحد «${r.ref}»`;
        case 'field': return `فردِ انتخاب‌شده در «${fields.find((f) => f.key === r.ref)?.label || r.ref}»`;
        default: return r.kind;
      }
    })
    .join(' + ');
}

export function describeCond(c: WfCond | undefined, fields: WfField[] = []): string {
  if (!c) return '';
  if (c.all?.length) return c.all.map((x) => describeCond(x, fields)).join(' و ');
  if (c.any?.length) return c.any.map((x) => describeCond(x, fields)).join(' یا ');
  const f = fields.find((x) => x.key === c.field)?.label || c.field;
  const op = OPS[c.op || ''] || c.op;
  return c.op === 'empty' || c.op === 'notEmpty' ? `«${f}» ${op} باشد` : `«${f}» ${op} ${String(c.value ?? '')}`;
}
