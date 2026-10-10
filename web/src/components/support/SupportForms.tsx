import React, { useMemo, useState } from 'react';
import { Customer, PlanColor, SupportPlan, SupportSub, TicketChannel, TicketPriority, User } from '../../types';
import { api } from '../../lib/api';
import { formatMoney, fromDisplay, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { todayIso } from '../../lib/taskDates';
import { CHANNEL, PLAN_COLOR, PRIORITY, subRemaining, subState, SUB_STATE, subEnd, dayText, codeText } from '../../lib/support';
import { Modal, field, label } from '../crm/crmUi';
import { JalaliDateField } from '../tasks/TasksView';
import { CustomerPicker, toEn } from '../warranty/WarrantyForms';
import { PersonPicker, staffItems } from '../common/PersonPicker';

const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const MONTH_CHOICES = [1, 3, 6, 12, 24, 36];
const cancelBtn = 'px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer';
const okBtn = 'px-5 py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer';

export const planLines = (p: { features: string }) => p.features.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** A plan as a small card (name, price, promised answer time, visits and its bullet points). */
export const PlanCard: React.FC<{ plan: SupportPlan; selected?: boolean; onClick?: () => void; footer?: React.ReactNode }> = ({ plan, selected, onClick, footer }) => {
  const c = PLAN_COLOR[plan.color] || PLAN_COLOR.teal;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-black ${c.chip}`}>{plan.name}</span>
        {!plan.active && <span className="text-[10px] font-black text-rose-600">غیرفعال</span>}
      </div>
      <div className="mt-2 text-lg font-black text-[#3A241F]">{formatMoney(plan.price)} <span className="text-[11px] font-bold text-[#8C6F66]">{unitName()} / {toPersianDigits(plan.months)} ماه</span></div>
      <ul className="mt-2 space-y-1 text-[11px] font-bold text-[#503730] leading-5">
        <li>پاسخ‌گویی ظرف {toPersianDigits(plan.responseHours)} ساعت</li>
        <li>حل مشکل ظرف {toPersianDigits(plan.resolveHours)} ساعت</li>
        <li>{plan.visits > 0 ? `${toPersianDigits(plan.visits)} بازدید حضوری` : 'بدون بازدید حضوری'}</li>
        {planLines(plan).map((l, i) => <li key={i} className="text-[#8C6F66] font-medium">{l}</li>)}
      </ul>
      {footer}
    </>
  );
  const cls = `block w-full text-right bg-white rounded-2xl p-3.5 border-2 ${selected ? 'border-teal-500' : 'border-[#EBDBCE]'}`;
  return onClick ? <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:shadow-md transition-all`} data-plan-card>{body}</button> : <div className={cls} data-plan-card>{body}</div>;
};

/** New subscription of a customer to a plan / edit of one. The end date is counted in Persian months. */
export const SubForm: React.FC<{
  initial?: SupportSub | null;
  presetCustomerId?: string;
  customers: Customer[];
  plans: SupportPlan[];
  onClose: () => void;
  onSaved: (saved: SupportSub & { portalCode?: string }) => void;
  onError: (msg: string) => void;
}> = ({ initial, presetCustomerId, customers, plans, onClose, onSaved, onError }) => {
  const isNew = !initial;
  const usable = plans.filter((p) => p.active || p.id === initial?.planId);
  const [customerId, setCustomerId] = useState(initial?.customerId || presetCustomerId || '');
  const [planId, setPlanId] = useState(initial?.planId || '');
  const [startDate, setStartDate] = useState<string | undefined>(initial?.startDate || todayIso());
  const [months, setMonths] = useState(String(initial?.months || 12));
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  const plan = plans.find((p) => p.id === planId);
  const m = Math.min(120, Math.max(1, parseInt(toEn(months), 10) || 0));
  const end = startDate && m ? subEnd(startDate, m) : '';
  const valid = !!customerId && !!plan && !!startDate && m >= 1;
  const pick = (p: SupportPlan) => {
    setPlanId(p.id);
    if (isNew) {
      setMonths(String(p.months));
      setPrice(String(p.price));
    }
  };
  const save = async () => {
    if (!valid || saving || !startDate) return;
    setSaving(true);
    try {
      const saved = await api.supportSubPut(initial?.id || uid('ss'), { customerId, planId, startDate, months: m, endDate: end, price: fromDisplay(parseInt(toEn(price), 10) || 0), notes: notes.trim() });
      onSaved(saved);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={isNew ? 'اشتراک تازهٔ پشتیبانی' : `ویرایش اشتراک ${codeText(initial!.subNo)}`}
      onClose={onClose}
      onTop
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>انصراف</button>
          <button type="button" onClick={save} disabled={!valid || saving} className={okBtn}>{saving ? 'در حال ذخیره…' : isNew ? 'ثبت اشتراک' : 'ذخیره'}</button>
        </>
      }
    >
      <div>
        <label className={label}>مشتری *</label>
        <CustomerPicker customers={customers} value={customerId} onPick={setCustomerId} disabled={!isNew} />
      </div>
      <div>
        <label className={label}>پلن *</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">{usable.map((p) => <PlanCard key={p.id} plan={p} selected={p.id === planId} onClick={() => pick(p)} />)}</div>
        {usable.length === 0 && <div className="text-[11px] font-bold text-[#8C6F66]">هنوز پلنی تعریف نشده است؛ مدیر از زبانهٔ «پلن‌ها» پلن می‌سازد.</div>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={label}>شروع *</label>
          <JalaliDateField value={startDate} minYear={1395} onChange={setStartDate} />
        </div>
        <div>
          <label className={label}>مدت (ماه) *</label>
          <div className="flex flex-wrap gap-1.5">
            {MONTH_CHOICES.map((n) => <button key={n} type="button" onClick={() => setMonths(String(n))} className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${m === n ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{toPersianDigits(n)}</button>)}
            <input className={`${field} !w-16 text-center`} inputMode="numeric" value={toPersianDigits(months)} onChange={(e) => setMonths(toEn(e.target.value))} aria-label="مدت به ماه" />
          </div>
        </div>
        <div>
          <label className={label}>مبلغ ({unitName()})</label>
          <input className={field} inputMode="numeric" value={price ? toPersianDigits(price) : ''} onChange={(e) => setPrice(toEn(e.target.value))} />
        </div>
      </div>
      {end && <div className="rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5 text-[11px] font-black text-teal-900" data-sub-end>پایان اشتراک: {dayText(end)} ({subRemaining({ endDate: end, status: 'ACTIVE' } as SupportSub)})</div>}
      <div>
        <label className={label}>توضیحات</label>
        <textarea className={`${field} min-h-[56px] leading-6`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
};


/** A customer asks for support. The response time of the plan gives the ticket its deadline. */
export const TicketForm: React.FC<{
  customers: Customer[];
  subs: SupportSub[];
  presetCustomerId?: string;
  staff: User[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}> = ({ customers, subs, presetCustomerId, staff, onClose, onSaved, onError }) => {
  const [customerId, setCustomerId] = useState(presetCustomerId || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('NORMAL');
  const [channel, setChannel] = useState<TicketChannel>('PHONE');
  const [handlerId, setHandlerId] = useState('');
  const [subId, setSubId] = useState('');
  const [saving, setSaving] = useState(false);

  const today = todayIso();
  const running = useMemo(() => subs.filter((s) => s.customerId === customerId && s.status === 'ACTIVE' && s.startDate <= today && s.endDate >= today), [subs, customerId, today]);
  const chosen = running.find((s) => s.id === subId) || running[0];
  const valid = !!customerId && subject.trim() && description.trim();
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.ticketCreate({ customerId, subject: subject.trim(), description: description.trim(), priority, channel, handlerId, subId: chosen?.id || '' });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ثبت نشد.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="درخواست پشتیبانی تازه"
      onClose={onClose}
      onTop
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>انصراف</button>
          <button type="button" onClick={save} disabled={!valid || saving} className={okBtn}>{saving ? 'در حال ثبت…' : 'ثبت درخواست'}</button>
        </>
      }
    >
      <div>
        <label className={label}>مشتری *</label>
        <CustomerPicker customers={customers} value={customerId} onPick={(id) => { setCustomerId(id); setSubId(''); }} />
      </div>
      {customerId && (
        <div className={`rounded-xl px-3.5 py-2.5 text-[11px] font-black border ${chosen ? 'bg-teal-50 border-teal-200 text-teal-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`} data-ticket-plan>
          {chosen ? (
            <>
              پلن «{chosen.planName}» ({codeText(chosen.subNo)}) · پاسخ‌گویی ظرف {toPersianDigits(chosen.responseHours)} ساعت · {subRemaining(chosen)}
              {running.length > 1 && (
                <select className="mt-2 block w-full bg-white border border-[#EBDBCE] rounded-lg px-2 py-1.5 text-[11px]" value={chosen.id} onChange={(e) => setSubId(e.target.value)}>
                  {running.map((s) => <option key={s.id} value={s.id}>{s.planName} — {s.subNo}</option>)}
                </select>
              )}
            </>
          ) : (
            'این مشتری اشتراک فعال پشتیبانی ندارد. درخواست ثبت می‌شود، ولی با مهلت عادی شرکت (۴۸ ساعت) و علامت «بدون پلن».'
          )}
        </div>
      )}
      <div>
        <label className={label}>موضوع *</label>
        <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً خطا هنگام صدور فاکتور" />
      </div>
      <div>
        <label className={label}>شرح درخواست *</label>
        <textarea className={`${field} min-h-[88px] leading-6`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={label}>اولویت</label>
          <select className={field} value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            {(Object.keys(PRIORITY) as TicketPriority[]).map((k) => <option key={k} value={k}>{PRIORITY[k].label}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>راه ارتباط</label>
          <select className={field} value={channel} onChange={(e) => setChannel(e.target.value as TicketChannel)}>
            {(Object.keys(CHANNEL) as TicketChannel[]).map((k) => <option key={k} value={k}>{CHANNEL[k]}</option>)}
          </select>
        </div>
        <div>
          <label className={label}>مسئول پیگیری</label>
          <PersonPicker title="مسئول پیگیری" items={staffItems(staff)} value={handlerId} onChange={setHandlerId} emptyLabel="(بعداً)" />
        </div>
      </div>
      {(priority === 'HIGH' || priority === 'URGENT') && <div className="text-[10px] font-bold text-[#8C6F66]">اولویت {PRIORITY[priority].label} مهلت‌ها را کوتاه‌تر می‌کند ({priority === 'HIGH' ? 'نصف' : 'یک‌چهارم'}).</div>}
    </Modal>
  );
};

/** Admin: create or edit a plan. */
export const PlanForm: React.FC<{ initial?: SupportPlan | null; onClose: () => void; onSaved: () => void; onError: (msg: string) => void }> = ({ initial, onClose, onSaved, onError }) => {
  const [name, setName] = useState(initial?.name || '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [months, setMonths] = useState(String(initial?.months || 12));
  const [resp, setResp] = useState(String(initial?.responseHours || 8));
  const [resolve, setResolve] = useState(String(initial?.resolveHours || 48));
  const [visits, setVisits] = useState(String(initial?.visits ?? 0));
  const [features, setFeatures] = useState(initial?.features || '');
  const [color, setColor] = useState<PlanColor>(initial?.color || 'teal');
  const [active, setActive] = useState(initial?.active ?? true);
  const [saving, setSaving] = useState(false);
  const n = (v: string) => parseInt(toEn(v), 10) || 0;
  const valid = name.trim() && n(months) >= 1 && n(resp) >= 1 && n(resolve) >= n(resp);
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await api.supportPlanPut(initial?.id || uid('plan'), { name: name.trim(), price: fromDisplay(n(price)), months: n(months), responseHours: n(resp), resolveHours: n(resolve), visits: n(visits), features, color, active });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setSaving(false);
    }
  };
  const num = (v: string, set: (s: string) => void, aria: string) => <input className={field} inputMode="numeric" aria-label={aria} value={v ? toPersianDigits(v) : ''} onChange={(e) => set(toEn(e.target.value))} />;
  return (
    <Modal
      title={initial ? `ویرایش پلن «${initial.name}»` : 'پلن پشتیبانی تازه'}
      onClose={onClose}
      onTop
      footer={
        <>
          <button type="button" onClick={onClose} className={cancelBtn}>انصراف</button>
          <button type="button" onClick={save} disabled={!valid || saving} className={okBtn}>{saving ? 'در حال ذخیره…' : 'ذخیره'}</button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2"><label className={label}>نام پلن *</label><input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً طلایی" /></div>
        <div><label className={label}>قیمت ({unitName()})</label>{num(price, setPrice, 'قیمت')}</div>
        <div><label className={label}>مدت (ماه)</label>{num(months, setMonths, 'مدت')}</div>
        <div><label className={label}>پاسخ‌گویی ظرف (ساعت) *</label>{num(resp, setResp, 'پاسخ‌گویی')}</div>
        <div><label className={label}>حل مشکل ظرف (ساعت) *</label>{num(resolve, setResolve, 'حل مشکل')}</div>
        <div><label className={label}>بازدید حضوری در دوره</label>{num(visits, setVisits, 'بازدید')}</div>
      </div>
      {n(resolve) < n(resp) && <div className="text-[11px] font-black text-rose-600">زمان حل مشکل نباید از زمان پاسخ‌گویی کمتر باشد.</div>}
      <div>
        <label className={label}>ویژگی‌ها (هر خط یک مورد)</label>
        <textarea className={`${field} min-h-[72px] leading-6`} value={features} onChange={(e) => setFeatures(e.target.value)} />
      </div>
      <div>
        <label className={label}>رنگ</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PLAN_COLOR) as PlanColor[]).map((k) => <button key={k} type="button" onClick={() => setColor(k)} className={`px-3 py-1.5 rounded-full border text-[11px] font-black cursor-pointer ${PLAN_COLOR[k].chip} ${color === k ? 'ring-2 ring-offset-1 ring-teal-500' : ''}`}>{PLAN_COLOR[k].name}</button>)}
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs font-black text-[#3A241F] cursor-pointer"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />پلن فعال است (برای اشتراک تازه دیده می‌شود)</label>
    </Modal>
  );
};
