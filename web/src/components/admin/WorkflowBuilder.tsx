import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { WfPackageBody, WfRef } from '../../lib/workflow';
import { ALLOW_KINDS, BState, BStep, FIELD_TYPES, fromPackage, newStep, OPS, OUTCOMES, presetState, presetTrigger, freshState, STEP_NAME, stepLabel, toPackage, TRIGGERS, TRIGGER_FIELDS, WHO_KINDS } from '../../lib/workflowBuilder';
import { WorkflowSteps } from '../workflow/WorkflowSteps';
import { askConfirm } from '../../lib/confirmDialog';

const input = 'w-full px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#C98B6A]';
const lbl = 'block text-[11.5px] font-black text-[#503730] mb-1 mt-2.5';
const TONE: Record<string, string> = { approval: '#0D9488', task: '#2563EB', condition: '#D97706', notify: '#7C3AED', end: '#64748B' };
const fa = toPersianDigits;

/**
 * «ساز گردشکار» inside Hoormand: the administrator builds a workflow with forms and pickers; it is checked while they work and saved as «ساختهٔ مدیر سامانه».
 * On our own server (the only one with the signing key) the same page can also sign the file and hand it over for a customer.
 */
export const WorkflowBuilder: React.FC<{ initial?: WfPackageBody; onClose: () => void; onSaved: () => void }> = ({ initial, onClose, onSaved }) => {
  const { staffList, departments, showToast } = useAppContext();
  const [s, setS] = useState<BState>(() => (initial ? fromPackage(initial) : freshState()));
  const [verdict, setVerdict] = useState<{ ok: boolean; error?: string } | null>(null);
  const [canSign, setCanSign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enable, setEnable] = useState(true);
  const timer = useRef<number>();
  const upd = (fn: (d: BState) => void) => setS((p) => { const d: BState = JSON.parse(JSON.stringify(p)); fn(d); return d; });
  const pkg = useMemo(() => toPackage(s), [s]);
  const people = useMemo(() => staffList.filter((u) => u.isActive).map((u) => u.fullName), [staffList]);
  const units = useMemo(() => departments.map((d) => d.name), [departments]);

  useEffect(() => { api.wfStudio().then((r) => setCanSign(r.canSign)).catch(() => {}); }, []);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { api.wfCheck(pkg).then(setVerdict).catch(() => setVerdict(null)); }, 300);
    return () => window.clearTimeout(timer.current);
  }, [pkg]);

  const save = async () => {
    setBusy(true);
    try {
      await api.wfLocalSave(pkg, enable);
      showToast(enable ? 'گردشکار ذخیره و روشن شد.' : 'گردشکار ذخیره شد (خاموش است).');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };
  const sign = async () => {
    setBusy(true);
    try {
      const r = await api.wfSign(pkg);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.file], { type: 'application/json' }));
      a.download = `${s.id}-v${s.version}.signed.json`;
      a.click();
      showToast('فایل امضاشده دانلود شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'امضا نشد.');
    } finally {
      setBusy(false);
    }
  };

  const personFields = s.fields.filter((f) => f.type === 'person');
  const whoRows = (list: WfRef[], kinds: [string, string][], set: (l: WfRef[]) => void) => (
    <div className="space-y-1.5">
      {list.map((w, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[#EBDBCE] bg-white p-2">
          <select className={input + ' !w-auto flex-1 min-w-[160px]'} value={w.kind} onChange={(e) => set(list.map((x, k) => (k === i ? { kind: e.target.value } : x)))}>
            {kinds.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
          {w.kind === 'user' && <select className={input + ' !w-auto flex-1 min-w-[160px]'} value={w.ref || ''} onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, ref: e.target.value } : x)))}><option value="">انتخاب همکار…</option>{people.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
          {(w.kind === 'unit' || w.kind === 'unitMembers') && <select className={input + ' !w-auto flex-1 min-w-[160px]'} value={w.ref || ''} onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, ref: e.target.value } : x)))}><option value="">انتخاب واحد…</option>{units.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
          {w.kind === 'field' && <select className={input + ' !w-auto flex-1 min-w-[160px]'} value={w.ref || ''} onChange={(e) => set(list.map((x, k) => (k === i ? { ...x, ref: e.target.value } : x)))}><option value="">فیلد «انتخاب همکار»…</option>{personFields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}</select>}
          {list.length > 1 && <button type="button" onClick={() => set(list.filter((_, k) => k !== i))} className="px-2 text-rose-700 cursor-pointer" aria-label="حذف"><X className="w-4 h-4" /></button>}
        </div>
      ))}
      <button type="button" onClick={() => set([...list, { kind: 'user' }])} className="text-[11px] font-black text-[#6E1B1B] cursor-pointer">+ نفر دیگر</button>
    </div>
  );
  const targets = (st: BStep, i: number, cur: string, first: string) => (
    <><option value="">{first}</option>{s.steps.map((x, j) => (j === i ? null : <option key={x.uid} value={x.uid}>{fa(j + 1)}. {stepLabel(x, j)}</option>))}</>
  );
  const chips = (onPick: (label: string) => void) => (
    <div className="flex flex-wrap gap-1.5 mt-1">{s.fields.filter((f) => f.label.trim()).map((f) => <button key={f.key} type="button" onClick={() => onPick(f.label)} className="px-2.5 py-0.5 rounded-full bg-[#F6D9CD] text-[10.5px] font-black text-[#6E1B1B] cursor-pointer">{f.label}</button>)}</div>
  );

  const stepBox = (st: BStep, i: number) => {
    const c = TONE[st.type];
    const set = (fn: (d: BStep) => void) => upd((d) => fn(d.steps[i]));
    return (
      <div key={st.uid} className="relative rounded-2xl border bg-[#FFFBF8] p-3.5 mb-5" style={{ borderColor: '#EBDBCE', borderRightWidth: 6, borderRightColor: c }} data-wfb-step>
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full text-white text-[12px] font-black flex items-center justify-center shrink-0" style={{ background: c }}>{fa(i + 1)}</span>
          <span className="text-[10.5px] font-black rounded-full px-2.5 py-0.5 shrink-0" style={{ color: c, background: c + '1A' }}>{STEP_NAME[st.type]}</span>
          <input className={input} value={st.name} onChange={(e) => set((d) => { d.name = e.target.value; })} placeholder="نام مرحله (مثلاً تأیید مدیر واحد)" />
          <button type="button" onClick={() => upd((d) => { if (i > 0) [d.steps[i - 1], d.steps[i]] = [d.steps[i], d.steps[i - 1]]; })} className="p-1.5 rounded-lg border border-[#EBDBCE] cursor-pointer" aria-label="بالا"><ArrowUp className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => upd((d) => { if (i < d.steps.length - 1) [d.steps[i + 1], d.steps[i]] = [d.steps[i], d.steps[i + 1]]; })} className="p-1.5 rounded-lg border border-[#EBDBCE] cursor-pointer" aria-label="پایین"><ArrowDown className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={() => upd((d) => { const u = d.steps[i].uid; d.steps.splice(i, 1); d.steps.forEach((x) => (['reject', 'next', 'then', 'else'] as const).forEach((k) => { if (x[k] === u) x[k] = ''; })); })} className="p-1.5 rounded-lg border border-rose-200 text-rose-700 cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>
        </div>
        {(st.type === 'approval' || st.type === 'task') && (
          <>
            <label className={lbl}>{st.type === 'approval' ? 'چه کسی تأیید می‌کند؟' : 'چه کسی انجام می‌دهد؟'}</label>
            {whoRows(st.who, WHO_KINDS, (l) => set((d) => { d.who = l; }))}
            {st.type === 'approval' && st.who.length > 1 && (
              <select className={input + ' mt-2'} value={st.mode} onChange={(e) => set((d) => { d.mode = e.target.value as 'any' | 'all'; })}><option value="any">تأیید یکی از آن‌ها کافی است</option><option value="all">همه باید تأیید کنند</option></select>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lbl}>مهلت (ساعت؛ خالی = بدون مهلت)</label><input className={input} inputMode="numeric" value={st.hours} onChange={(e) => set((d) => { d.hours = e.target.value.replace(/\D/g, ''); })} /></div>
              {st.type === 'approval' && <div><label className={lbl}>اگر رد شد</label><select className={input} value={st.reject} onChange={(e) => set((d) => { d.reject = e.target.value; })}>{targets(st, i, st.reject, 'درخواست رد می‌شود و تمام می‌شود')}</select></div>}
            </div>
          </>
        )}
        {st.type === 'condition' && (
          <>
            <label className={lbl}>شرط</label>
            <div className="flex flex-wrap gap-2">
              <select className={input + ' !w-auto flex-1'} value={st.cond.field} onChange={(e) => set((d) => { d.cond.field = e.target.value; })}><option value="">فیلد…</option>{s.fields.map((f) => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}</select>
              <select className={input + ' !w-auto flex-1'} value={st.cond.op} onChange={(e) => set((d) => { d.cond.op = e.target.value; })}>{OPS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
              {!['empty', 'notEmpty'].includes(st.cond.op) && <input className={input + ' !w-auto flex-1'} value={st.cond.value} onChange={(e) => set((d) => { d.cond.value = e.target.value; })} placeholder="مقدار" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={lbl}>اگر بله ← برو به</label><select className={input} value={st.then} onChange={(e) => set((d) => { d.then = e.target.value; })}>{targets(st, i, st.then, 'مرحلهٔ بعد (پیش‌فرض)')}</select></div>
              <div><label className={lbl}>اگر نه ← برو به</label><select className={input} value={st.else} onChange={(e) => set((d) => { d.else = e.target.value; })}>{targets(st, i, st.else, 'مرحلهٔ بعد (پیش‌فرض)')}</select></div>
            </div>
          </>
        )}
        {st.type === 'notify' && (
          <>
            <label className={lbl}>به چه کسی خبر داده شود؟</label>
            {whoRows(st.to, WHO_KINDS, (l) => set((d) => { d.to = l; }))}
            <label className={lbl}>متن پیام</label>
            <input className={input} value={st.text} onChange={(e) => set((d) => { d.text = e.target.value; })} />
            {chips((t) => set((d) => { d.text += '{{' + t + '}}'; }))}
          </>
        )}
        {st.type === 'end' && (
          <><label className={lbl}>نتیجه</label><select className={input} value={st.outcome} onChange={(e) => set((d) => { d.outcome = e.target.value as BStep['outcome']; })}>{OUTCOMES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></>
        )}
        {(st.type === 'approval' || st.type === 'task' || st.type === 'notify') && (
          <><label className={lbl}>بعد از این مرحله</label><select className={input} value={st.next} onChange={(e) => set((d) => { d.next = e.target.value; })}>{targets(st, i, st.next, 'مرحلهٔ بعد (پیش‌فرض)')}</select></>
        )}
        {i < s.steps.length - 1 && <div className="absolute right-[18px] -bottom-5 h-5 w-0 border-r-2 border-dashed border-[#C98B6A]" />}
      </div>
    );
  };

  return (
    <div className="space-y-4" data-wf-builder>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#EBDBCE] bg-white text-[#6E1B1B] text-xs font-black cursor-pointer">← بازگشت به فهرست</button>
        {!initial && (
          <>
            <button type="button" onClick={() => setS(presetTrigger('invoice.issue'))} className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-900 cursor-pointer" data-wfb-preset-invoice>نمونه: تأیید صدور فاکتور (خودکار)</button>
            <button type="button" onClick={() => setS(presetTrigger('proforma.issue'))} className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-black text-emerald-900 cursor-pointer" data-wfb-preset-proforma>نمونه: تأیید پیش‌فاکتور (خودکار)</button>
            <button type="button" onClick={() => setS(presetState('buy'))} className="px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[11px] font-black text-[#6E1B1B] cursor-pointer">نمونه: تأیید خرید با شرط مبلغ</button>
            <button type="button" onClick={() => setS(presetState('simple'))} className="px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[11px] font-black text-[#6E1B1B] cursor-pointer">نمونه: تأیید ساده</button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5">
            <div className="text-[13px] font-black text-[#6E1B1B] mb-1">۱) مشخصات</div>
            <label className={lbl}>نام گردشکار (کاربر می‌بیند)</label>
            <input className={input} value={s.name} onChange={(e) => upd((d) => { d.name = e.target.value; })} placeholder="مثلاً درخواست خرید تجهیزات" data-wfb-name />
            <label className={lbl}>توضیح کوتاه</label>
            <input className={input} value={s.description} onChange={(e) => upd((d) => { d.description = e.target.value; })} />
            <label className={lbl}>شناسهٔ انگلیسی (برای سیستم؛ فقط حرف کوچک، عدد و خط تیره)</label>
            <input className={input} dir="ltr" value={s.id} disabled={!!initial} onChange={(e) => upd((d) => { d.id = e.target.value.trim(); })} />
            <label className={lbl}>این گردشکار برای چه کاری است؟</label>
            <select className={input} value={s.trigger} data-wfb-trigger onChange={(e) => upd((d) => {
              d.trigger = e.target.value;
              if (d.trigger) d.fields = d.fields.filter((f) => TRIGGER_FIELDS.some(([k]) => k === f.key)); // a tied workflow can only use the values the system gives
            })}>
              {TRIGGERS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {s.trigger ? (
              <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-900 leading-6">
                این گردشکار را خود سامانه شروع می‌کند: هر بار کسی (غیر از مدیر کل) این کار را بکند، گردشکار شروع می‌شود و کار فقط وقتی انجام می‌شود که با «تأیید شد» تمام شود؛ «رد شد» آن را لغو می‌کند. فقط یک گردشکار برای هر کار روشن است (روشن‌کردن این، قبلی را خاموش می‌کند). مدیر کل بدون گردشکار انجام می‌دهد.
              </p>
            ) : (
              <>
                <label className={lbl}>چه کسانی می‌توانند این درخواست را شروع کنند؟</label>
                {whoRows(s.allow, ALLOW_KINDS, (l) => upd((d) => { d.allow = l; }))}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5">
            <div className="text-[13px] font-black text-[#6E1B1B] mb-2">{s.trigger ? '۲) مقدارهایی که سامانه می‌دهد (برای شرط و متن‌ها)' : '۲) فرم (چه چیزهایی از درخواست‌دهنده پرسیده شود)'}</div>
            {s.trigger && (
              <div className="flex flex-wrap gap-2" data-wfb-trigger-fields>
                {TRIGGER_FIELDS.map(([k, t, ty]) => {
                  const on = s.fields.some((f) => f.key === k);
                  return (
                    <label key={k} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black cursor-pointer ${on ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-white border-[#EBDBCE] text-[#503730]'}`}>
                      <input type="checkbox" checked={on} onChange={(e) => upd((d) => { d.fields = e.target.checked ? [...d.fields, { key: k, label: t, type: ty, required: false, options: '' }] : d.fields.filter((f) => f.key !== k); })} />{t}
                    </label>
                  );
                })}
              </div>
            )}
            {!s.trigger && s.fields.length === 0 && <p className="text-[11px] font-bold text-[#8C6F66]">هنوز فیلدی نیست. اگر درخواست چیزی لازم ندارد، فرم را خالی بگذارید.</p>}
            {!s.trigger && s.fields.map((f, i) => (
              <div key={f.key} className="rounded-xl border border-dashed border-[#EBDBCE] p-2 mb-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input className={input + ' !w-auto flex-1 min-w-[150px]'} value={f.label} onChange={(e) => upd((d) => { d.fields[i].label = e.target.value; })} placeholder="عنوان فیلد (مثلاً مبلغ)" />
                  <select className={input + ' !w-auto'} value={f.type} onChange={(e) => upd((d) => { d.fields[i].type = e.target.value as BState['fields'][number]['type']; })}>{FIELD_TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                  <label className="flex items-center gap-1 text-[11px] font-bold"><input type="checkbox" checked={f.required} onChange={(e) => upd((d) => { d.fields[i].required = e.target.checked; })} />لازم</label>
                  <button type="button" onClick={() => upd((d) => { d.fields.splice(i, 1); })} className="p-1.5 rounded-lg border border-rose-200 text-rose-700 cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>
                </div>
                {f.type === 'select' && <input className={input} value={f.options} onChange={(e) => upd((d) => { d.fields[i].options = e.target.value; })} placeholder="گزینه‌ها را با ویرگول جدا کنید: الف، ب، ج" />}
              </div>
            ))}
            {!s.trigger && <button type="button" onClick={() => upd((d) => { d.nf += 1; d.fields.push({ key: 'f' + d.nf, label: '', type: 'text', required: false, options: '' }); })} className="px-3 py-1.5 rounded-xl border border-dashed border-[#C98B6A] text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-wfb-add-field><Plus className="w-3.5 h-3.5 inline ml-1" />افزودن فیلد</button>}
            <label className={lbl}>عنوان هر درخواست (اختیاری)</label>
            <input className={input} value={s.title} onChange={(e) => upd((d) => { d.title = e.target.value; })} placeholder="مثلاً خرید {{کالا}}" />
            {chips((t) => upd((d) => { d.title += '{{' + t + '}}'; }))}
          </div>

          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5">
            <div className="text-[13px] font-black text-[#6E1B1B] mb-3">۳) مرحله‌ها (به ترتیب؛ هر مرحله به مرحلهٔ بعدی می‌رود)</div>
            {s.steps.map(stepBox)}
            {s.steps.length === 0 && <p className="text-[11px] font-bold text-[#8C6F66] mb-2">مرحله‌ای نیست؛ با دکمه‌های زیر اضافه کنید.</p>}
            <div className="flex flex-wrap gap-2">
              {(['approval', 'task', 'condition', 'notify', 'end'] as const).map((t) => (
                <button key={t} type="button" onClick={() => upd((d) => { d.steps.push(newStep(d, t)); })} className="px-3 py-1.5 rounded-xl border border-dashed border-[#C98B6A] bg-[#FFFBF8] text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-wfb-add-step={t}>+ {STEP_NAME[t]}</button>
              ))}
            </div>
            <p className="text-[10.5px] font-bold text-[#8C6F66] mt-2">اگر آخرین مرحله «پایان» نباشد، خودکار یک «پایان (انجام شد)» اضافه می‌شود.</p>
          </div>
        </div>

        <div className="space-y-4 xl:sticky xl:top-3">
          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5 space-y-3">
            <div className="text-[13px] font-black text-[#6E1B1B]">بررسی و ذخیره</div>
            {verdict && (verdict.ok
              ? <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11.5px] font-black px-3 py-2" data-wfb-ok>✓ گردشکار درست است ({fa(pkg.steps.length)} مرحله).</div>
              : <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[11.5px] font-black px-3 py-2 leading-6" data-wfb-error>{verdict.error}</div>)}
            <label className="flex items-center gap-2 text-[11.5px] font-bold"><input type="checkbox" checked={enable} onChange={(e) => setEnable(e.target.checked)} />بعد از ذخیره روشن شود</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy || !verdict?.ok} onClick={() => void save()} className="flex-1 px-4 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-50" data-wfb-save>ذخیره</button>
              {canSign && <button type="button" disabled={busy || !verdict?.ok} onClick={() => void sign()} className="px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-50" data-wfb-sign>امضا و دانلود</button>}
            </div>
            {!canSign && <p className="text-[10.5px] font-bold text-[#8C6F66] leading-5">امضای رسمی هورمند فقط روی سرور خود هورمند انجام می‌شود. گردشکاری که اینجا می‌سازید با برچسب «ساختهٔ مدیر سامانه» نگه داشته می‌شود.</p>}
            <button type="button" onClick={async () => { if (!s.steps.length || await askConfirm('همهٔ تغییرات پاک شود و از نو شروع کنیم؟', { tone: 'danger', confirmText: 'بله، از نو' })) setS(freshState()); }} className="text-[11px] font-black text-rose-700 cursor-pointer">از نو شروع کن</button>
          </div>
          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5">
            <div className="text-[13px] font-black text-[#6E1B1B] mb-2">پیش‌نمایش</div>
            <WorkflowSteps pkg={pkg} />
          </div>
        </div>
      </div>
    </div>
  );
};

