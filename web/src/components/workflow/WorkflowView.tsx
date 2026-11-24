import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Inbox, Play, Send, Workflow } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatDateTime, formatTaskDate } from '../../lib/taskDates';
import { askConfirm } from '../../lib/confirmDialog';
import { WF_STATUS, WfField, WfInstance, WfStartable } from '../../lib/workflow';
import { PersonPicker } from '../common/PersonPicker';
import { MoneyInput } from '../common/MoneyInput';
import { CalendarButton } from '../common/JalaliCalendar';

const input = 'w-full px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F]';
const ACTION: Record<string, { label: string; cls: string }> = {
  approve: { label: 'تأیید', cls: 'bg-emerald-700 text-white' },
  reject: { label: 'رد', cls: 'bg-rose-700 text-white' },
  complete: { label: 'انجام شد', cls: 'bg-sky-700 text-white' },
};
const EVENT: Record<string, string> = { start: 'شروع کرد', approve: 'تأیید کرد', reject: 'رد کرد', complete: 'انجام داد', cancel: 'لغو کرد' };

/** One request: what was asked, where it is, who it waits for, and what has happened; the buttons are the ones this person may press. */
const Card: React.FC<{ it: WfInstance; onChanged: () => void }> = ({ it, onChanged }) => {
  const { showToast } = useAppContext();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const st = WF_STATUS[it.status];
  const overdue = it.status === 'running' && it.dueAt && new Date(it.dueAt).getTime() < Date.now();
  const act = async (action: string) => {
    if (action === 'reject' && !comment.trim()) { showToast('دلیل رد را بنویسید.'); setOpen(true); return; }
    setBusy(true);
    try {
      await api.wfAct(it.id, action, comment);
      setComment('');
      showToast(action === 'reject' ? 'رد شد.' : action === 'approve' ? 'تأیید شد.' : 'انجام شد.');
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!(await askConfirm('این درخواست لغو شود؟', { tone: 'danger', title: 'لغو درخواست', confirmText: 'بله، لغو شود' }))) return;
    try { await api.wfCancel(it.id, ''); onChanged(); } catch (e) { showToast(e instanceof Error ? e.message : 'لغو نشد.'); }
  };
  const idx = it.steps.findIndex((s) => s.id === it.step);
  return (
    <div className={`rounded-2xl border bg-white ${it.mine ? 'border-amber-300 shadow-sm' : 'border-[#EBDBCE]'}`} data-wf-card>
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3 text-right cursor-pointer">
        <Workflow className="w-4 h-4 text-[#8C6F66] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-black text-[#3A241F] truncate">{it.title}</div>
          <div className="text-[10.5px] font-bold text-[#8C6F66] truncate">
            {it.packageName} · از {it.startedByName || '—'} · {formatTaskDate(it.startedAt.slice(0, 10))}
            {it.status === 'running' && it.stepName ? ` · مرحله: ${it.stepName}` : ''}
          </div>
        </div>
        {overdue && <span className="shrink-0 flex items-center gap-1 text-[10px] font-black text-rose-700"><Clock className="w-3 h-3" />مهلت گذشته</span>}
        <span className={`shrink-0 text-[10px] font-black rounded-full px-2 py-0.5 border ${st.cls}`}>{it.mine ? 'منتظر شما' : st.label}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[#8C6F66]" /> : <ChevronDown className="w-4 h-4 text-[#8C6F66]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#EBDBCE]/70 pt-3">
          {it.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {it.fields.map((f, i) => (
                <div key={i} className="text-[11px] leading-6"><span className="font-bold text-[#8C6F66]">{f.label}: </span><span className="font-black text-[#3A241F] whitespace-pre-wrap">{f.type === 'date' ? formatTaskDate(f.value) : f.type === 'money' || f.type === 'number' ? toPersianDigits(f.value.replace(/\B(?=(\d{3})+(?!\d))/g, '٬')) : f.value}</span></div>
              ))}
            </div>
          )}
          {it.steps.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-wf-progress>
              {it.steps.filter((s) => s.type !== 'condition' && s.type !== 'notify').map((s) => {
                const here = s.id === it.step && it.status === 'running';
                const passed = it.history.some((h) => h.step === s.id && h.action !== 'auto') || (it.steps.findIndex((x) => x.id === s.id) < idx && it.status === 'running');
                return <span key={s.id} className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${here ? 'bg-amber-100 text-amber-900 border-amber-300' : passed ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{s.name || s.id}</span>;
              })}
            </div>
          )}
          {it.status === 'running' && it.waiting.length > 0 && (
            <div className="text-[11px] font-bold text-[#503730]">منتظر: {it.waiting.map((w) => w.name || '—').join('، ')}{it.dueAt ? ` · مهلت تا ${formatDateTime(it.dueAt)}` : ''}</div>
          )}
          <div className="space-y-1" data-wf-history>
            {it.history.filter((h) => h.type !== 'reminder').map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-[10.5px] leading-5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#C98B6A] shrink-0" />
                <div className="text-[#503730]">
                  <b>{h.stepName || (h.type === 'start' ? 'درخواست' : '')}</b>
                  {h.by && h.action && h.action !== 'auto' ? ` · ${h.by} ${EVENT[h.action] || h.action}` : h.type === 'condition' ? ` · شرط: ${h.note}` : h.type === 'notify' ? ' · اطلاع داده شد' : h.type === 'end' && h.action === 'auto' ? ` · پایان` : ''}
                  <span className="text-[#8C6F66]"> · {formatDateTime(h.at)}</span>
                  {h.note && h.action !== 'auto' ? <span className="text-[#8C6F66]"> ({h.note})</span> : null}
                  {h.comment ? <div className="font-bold text-[#6E1B1B]">«{h.comment}»</div> : null}
                </div>
              </div>
            ))}
          </div>
          {it.actions.length > 0 && (
            <div className="space-y-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] p-3">
              {it.actions.includes('reject') && <input className={input} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="توضیح (برای رد لازم است)" />}
              <div className="flex flex-wrap gap-2">
                {it.actions.map((a) => (
                  <button key={a} type="button" disabled={busy} onClick={() => void act(a)} className={`px-4 py-2 rounded-xl text-[11.5px] font-black cursor-pointer disabled:opacity-60 ${ACTION[a].cls}`} data-wf-act={a}>{ACTION[a].label}</button>
                ))}
              </div>
            </div>
          )}
          {it.canCancel && <button type="button" onClick={() => void cancel()} className="text-[10.5px] font-black text-rose-700 cursor-pointer">لغو درخواست</button>}
        </div>
      )}
    </div>
  );
};

/** The form of a package (made from the file's «fields»). */
const StartDialog: React.FC<{ pkg: WfStartable; onClose: () => void; onStarted: () => void }> = ({ pkg, onClose, onStarted }) => {
  const { staffList, showToast } = useAppContext();
  const [v, setV] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => staffList.filter((u) => u.isActive).map((u) => ({ id: u.id, name: u.fullName})), [staffList]);
  const set = (k: string, x: unknown) => setV((p) => ({ ...p, [k]: x }));
  const field = (f: WfField) => {
    const val = v[f.key];
    switch (f.type) {
      case 'textarea': return <textarea className={input + ' min-h-[80px]'} value={(val as string) || ''} onChange={(e) => set(f.key, e.target.value)} />;
      case 'number': return <input className={input} inputMode="numeric" value={(val as string) || ''} onChange={(e) => set(f.key, e.target.value.replace(/[^\d.۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))} />;
      case 'money': return <MoneyInput value={(val as string) || ''} onChange={(d) => set(f.key, d)} />;
      case 'date': return <div className="flex gap-2 items-center"><div className={input + ' flex-1'}>{val ? formatTaskDate(val as string) : '—'}</div><CalendarButton value={val as string} onPick={(iso) => set(f.key, iso)} /></div>;
      case 'select': return <select className={input} value={(val as string) || ''} onChange={(e) => set(f.key, e.target.value)}><option value="">انتخاب کنید</option>{(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
      case 'person': return <PersonPicker items={people} title={f.label} value={(val as string) || ''} onChange={(id) => set(f.key, id)} placeholder="انتخاب فرد" />;
      case 'yesno': return <div className="flex gap-2">{[true, false].map((b) => <button key={String(b)} type="button" onClick={() => set(f.key, b)} className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${val === b ? 'bg-[#6E1B1B] text-white border-transparent' : 'bg-white text-[#6E1B1B] border-[#EBDBCE]'}`}>{b ? 'بله' : 'خیر'}</button>)}</div>;
      default: return <input className={input} value={(val as string) || ''} onChange={(e) => set(f.key, e.target.value)} />;
    }
  };
  const submit = async () => {
    setBusy(true);
    try {
      await api.wfStart(pkg.id, v);
      showToast('درخواست شما ثبت شد و به مرحلهٔ اول رفت.');
      onStarted();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ثبت نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-3" onClick={onClose} dir="rtl" data-wf-start-dialog>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <div className="text-sm font-black text-[#3A241F]">{pkg.name}</div>
          {pkg.description && <div className="text-[11px] font-bold text-[#8C6F66] leading-6 mt-1">{pkg.description}</div>}
        </div>
        {pkg.fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-[11px] font-black text-[#503730]">{f.label}{f.required ? <span className="text-rose-600"> *</span> : null}</label>
            {field(f)}
            {f.hint && <div className="text-[10px] font-bold text-[#8C6F66]">{f.hint}</div>}
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button type="button" disabled={busy} onClick={() => void submit()} className="px-5 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-60" data-wf-submit>ثبت درخواست</button>
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl bg-white border border-[#EBDBCE] text-[#6E1B1B] text-xs font-black cursor-pointer">انصراف</button>
        </div>
      </div>
    </div>
  );
};

type Tab = 'inbox' | 'start' | 'mine' | 'all';

/** «گردشکارها» in the administrative affairs: the requests waiting for me, the workflows I may start, and the ones I started. */
export const WorkflowView: React.FC<{ onWaiting?: (n: number) => void }> = ({ onWaiting }) => {
  const { currentUser } = useAppContext();
  const [tab, setTab] = useState<Tab>('inbox');
  const [inbox, setInbox] = useState<WfInstance[]>([]);
  const [mine, setMine] = useState<WfInstance[]>([]);
  const [all, setAll] = useState<WfInstance[]>([]);
  const [startable, setStartable] = useState<WfStartable[]>([]);
  const [starting, setStarting] = useState<WfStartable | null>(null);
  const [loaded, setLoaded] = useState(false);
  const admin = currentUser.role === 'SUPER_ADMIN';
  const load = useCallback(() => {
    void Promise.allSettled([api.wfInbox(), api.wfMine(), api.wfStartable(), admin ? api.wfAll() : Promise.resolve([] as WfInstance[])]).then(([a, b, c, d]) => {
      if (a.status === 'fulfilled') { setInbox(a.value); onWaiting?.(a.value.length); }
      if (b.status === 'fulfilled') setMine(b.value);
      if (c.status === 'fulfilled') setStartable(c.value);
      if (d.status === 'fulfilled') setAll(d.value);
      setLoaded(true);
    });
  }, [admin, onWaiting]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    const f = () => load();
    window.addEventListener('focus', f);
    window.addEventListener('hoormand-workflow-changed', f);
    return () => { window.clearInterval(t); window.removeEventListener('focus', f); window.removeEventListener('hoormand-workflow-changed', f); };
  }, [load]);
  // the first tab with something in it
  useEffect(() => {
    if (loaded && inbox.length === 0 && tab === 'inbox') setTab(startable.length ? 'start' : 'mine');
    // only once, when the data first arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  const tabs: [Tab, string, number, React.ComponentType<{ className?: string }>][] = [
    ['inbox', 'کارتابل من', inbox.length, Inbox],
    ['start', 'شروع درخواست', startable.length, Play],
    ['mine', 'درخواست‌های من', mine.length, Send],
  ];
  if (admin) tabs.push(['all', 'همهٔ درخواست‌ها', all.length, Workflow]);
  const list = tab === 'inbox' ? inbox : tab === 'mine' ? mine : all;
  const empty = {
    inbox: 'الان کاری منتظر شما نیست.',
    mine: 'هنوز درخواستی شروع نکرده‌اید.',
    all: 'هنوز درخواستی در سامانه نیست.',
  } as const;
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4" data-workflow-view>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, label, n, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${tab === k ? 'bg-[#6E1B1B] text-white border-transparent' : 'bg-white text-[#6E1B1B] border-[#EBDBCE]'}`} data-wf-tab={k}>
            <Icon className="w-3.5 h-3.5" />{label}
            {n > 0 && <span className={`text-[10px] rounded-full px-1.5 ${tab === k ? 'bg-white/25' : k === 'inbox' ? 'bg-rose-600 text-white' : 'bg-[#F6D9CD]'}`}>{toPersianDigits(n)}</span>}
          </button>
        ))}
      </div>
      {tab === 'start' ? (
        startable.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-wf-empty>گردشکاری برای شروع در دسترس شما نیست. گردشکارهای اختصاصی شرکت را ما می‌سازیم و مدیر سیستم روشن می‌کند.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {startable.map((p) => (
              <button key={p.id} type="button" onClick={() => setStarting(p)} className="text-right rounded-2xl border border-[#EBDBCE] bg-white hover:bg-[#FAF5F1] p-4 cursor-pointer space-y-1.5" data-wf-package>
                <div className="flex items-center gap-2 text-[13px] font-black text-[#3A241F]"><Workflow className="w-4 h-4 text-[#D34A32]" />{p.name}</div>
                {p.description && <div className="text-[11px] font-bold leading-6 text-[#8C6F66] line-clamp-3">{p.description}</div>}
                <div className="text-[10.5px] font-black text-[#6E1B1B]">شروع درخواست ←</div>
              </button>
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-wf-empty>{empty[tab as 'inbox' | 'mine' | 'all']}</div>
      ) : (
        <div className="space-y-2.5">{list.map((it) => <Card key={it.id} it={it} onChanged={load} />)}</div>
      )}
      {starting && <StartDialog pkg={starting} onClose={() => setStarting(null)} onStarted={() => { setStarting(null); setTab('mine'); load(); }} />}
    </div>
  );
};
