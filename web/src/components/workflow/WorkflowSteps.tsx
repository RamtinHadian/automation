import React from 'react';
import { ArrowDown, Bell, CheckCircle2, ClipboardCheck, GitBranch, Flag } from 'lucide-react';
import { describeCond, describeRefs, WF_STEP_LABEL, WfPackageBody, WfStep } from '../../lib/workflow';
import { toPersianDigits } from '../../lib/jalali';

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { approval: CheckCircle2, task: ClipboardCheck, condition: GitBranch, notify: Bell, end: Flag };
const TONE: Record<string, string> = {
  approval: 'border-emerald-200 bg-emerald-50/50 text-emerald-800',
  task: 'border-sky-200 bg-sky-50/50 text-sky-800',
  condition: 'border-amber-200 bg-amber-50/60 text-amber-800',
  notify: 'border-violet-200 bg-violet-50/50 text-violet-800',
  end: 'border-slate-200 bg-slate-50 text-slate-700',
};

/** A package's steps in order, each with who does it and where it goes next: what the customer reads to be sure the workflow is the one they asked for. */
export const WorkflowSteps: React.FC<{ pkg: WfPackageBody }> = ({ pkg }) => {
  const fields = pkg.fields || [];
  const nameOf = (id?: string) => {
    const s = pkg.steps.find((x) => x.id === id);
    return s ? s.name || s.id : id || '';
  };
  const line = (s: WfStep): string[] => {
    const out: string[] = [];
    if (s.type === 'approval' || s.type === 'task') {
      out.push(`${s.type === 'approval' ? 'تأییدکننده' : 'انجام‌دهنده'}: ${describeRefs(s.who, fields)}${s.mode === 'all' ? ' (همه باید تأیید کنند)' : ''}`);
      if (s.hours) out.push(`مهلت: ${toPersianDigits(s.hours)} ساعت${s.escalate?.length ? `، بعد از آن ${describeRefs(s.escalate, fields)} هم خبر می‌گیرد` : ''}`);
      if (s.type === 'approval') out.push(`اگر رد شد: ${s.onReject ? 'برگشت به «' + nameOf(s.onReject) + '»' : 'درخواست رد می‌شود'}`);
      if (s.next) out.push(`بعد: ${nameOf(s.next)}`);
    } else if (s.type === 'condition') {
      out.push(`اگر ${describeCond(s.if, fields)} ← ${nameOf(s.then)}`);
      out.push(`وگرنه ← ${nameOf(s.else)}`);
    } else if (s.type === 'notify') {
      out.push(`به: ${describeRefs(s.to, fields)}`);
      out.push(`پیام: ${s.text}`);
      if (s.next) out.push(`بعد: ${nameOf(s.next)}`);
    } else if (s.type === 'end') {
      out.push(s.outcome === 'approved' ? 'درخواست تأیید می‌شود' : s.outcome === 'rejected' ? 'درخواست رد می‌شود' : 'درخواست انجام‌شده بسته می‌شود');
    }
    return out;
  };
  return (
    <div className="space-y-1.5" data-wf-steps>
      <div className="rounded-xl border border-[#EBDBCE] bg-white px-3 py-2 text-[11px] font-bold text-[#503730]">
        شروع: {describeRefs(pkg.start.allow, fields)} {fields.length ? `· فرم: ${fields.map((f) => f.label).join('، ')}` : ''}
      </div>
      {pkg.steps.map((s, i) => {
        const Icon = ICON[s.type] || Flag;
        return (
          <React.Fragment key={s.id}>
            <div className="flex justify-center text-[#C98B6A]"><ArrowDown className="w-3.5 h-3.5" /></div>
            <div className={`rounded-xl border px-3 py-2 ${TONE[s.type] || TONE.end}`}>
              <div className="flex items-center gap-2 text-[11.5px] font-black">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{toPersianDigits(i + 1)}. {s.name || s.id}</span>
                <span className="text-[9.5px] font-bold opacity-70">({WF_STEP_LABEL[s.type]})</span>
              </div>
              <div className="mt-1 space-y-0.5 text-[10.5px] font-bold leading-5 text-[#503730]">{line(s).map((l, k) => <div key={k}>{l}</div>)}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
