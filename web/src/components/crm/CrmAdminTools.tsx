import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Eye, GitMerge } from 'lucide-react';
import { Customer, CrmActivity, Deal, User } from '../../types';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { PersonPicker, PersonPickerMulti, customerItems, staffItems } from '../common/PersonPicker';
import { Modal, label } from './crmUi';

const btnGhost = 'px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer';
const btnMain = 'px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer';

/** Two files of the same customer become one: the other customer's deals, history, warranties and calls move into this one. (Administrators.) */
export const MergeModal: React.FC<{ customer: Customer; customers: Customer[]; onClose: () => void; onDone: (keepId: string) => void }> = ({ customer, customers, onClose, onDone }) => {
  const { showToast, reloadState } = useAppContext();
  const [dropId, setDropId] = useState('');
  const [busy, setBusy] = useState(false);
  const drop = customers.find((c) => c.id === dropId);
  const go = async () => {
    if (!drop) return;
    if (!(await askConfirm(`پروندهٔ «${drop.name}» در پروندهٔ «${customer.name}» ادغام شود؟ همهٔ فرصت‌ها و سابقهٔ «${drop.name}» به «${customer.name}» می‌رود و پروندهٔ او حذف می‌شود. این کار برگشت‌پذیر نیست.`, { tone: 'danger', title: 'ادغام دو مشتری', confirmText: 'ادغام کن' }))) return;
    setBusy(true);
    try {
      const r = await api.crmMerge(customer.id, drop.id);
      showToast('دو مشتری یکی شدند.');
      reloadState();
      onDone(r.keepId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ادغام انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="ادغام با مشتری دیگر"
      onClose={onClose}
      onTop="max"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>انصراف</button>
          <button type="button" disabled={!drop || busy} onClick={go} className={btnMain}>ادغام</button>
        </>
      }
    >
      <div className="rounded-xl bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] font-bold text-violet-900 leading-6">
        پروندهٔ «{customer.name}» می‌ماند. مشتری‌ای را که تکراری است انتخاب کنید؛ اطلاعات خالی این پرونده از او پر می‌شود، شماره‌ها یکی می‌شوند و فرصت‌ها و سابقه‌اش به اینجا می‌آید.
      </div>
      <div>
        <label className={label}>مشتری تکراری (حذف می‌شود)</label>
        <PersonPicker title="انتخاب مشتری تکراری" items={customerItems(customers.filter((c) => c.id !== customer.id))} value={dropId} onChange={setDropId} emptyLabel="انتخاب مشتری…" />
      </div>
    </Modal>
  );
};

/** Hands one person's customers, open opportunities and open follow-ups to another person. (Administrators.) */
export const TransferModal: React.FC<{ staff: User[]; customers: Customer[]; deals: Deal[]; activities: CrmActivity[]; onClose: () => void }> = ({ staff, customers, deals, activities, onClose }) => {
  const { showToast, reloadState } = useAppContext();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [what, setWhat] = useState({ customers: true, deals: true, followups: true });
  const [busy, setBusy] = useState(false);
  // which of the three lists is opened under the rows (the names of what would be handed over)
  const [show, setShow] = useState<'customers' | 'deals' | 'followups' | null>(null);
  const counts = useMemo(
    () => ({
      customers: customers.filter((c) => c.ownerId === fromId).length,
      deals: deals.filter((d) => d.ownerId === fromId && d.stage !== 'WON' && d.stage !== 'LOST').length,
      followups: activities.filter((a) => a.type === 'FOLLOWUP' && !a.done && a.ownerId === fromId).length,
    }),
    [customers, deals, activities, fromId],
  );
  const nameOf = (id: string) => staff.find((u) => u.id === id)?.fullName || '';
  const total = (what.customers ? counts.customers : 0) + (what.deals ? counts.deals : 0) + (what.followups ? counts.followups : 0);
  const go = async () => {
    if (!fromId || !toId || fromId === toId || total === 0) return;
    if (!(await askConfirm(`کار «${nameOf(fromId)}» به «${nameOf(toId)}» سپرده شود؟ (${toPersianDigits(what.customers ? counts.customers : 0)} مشتری، ${toPersianDigits(what.deals ? counts.deals : 0)} فرصت باز، ${toPersianDigits(what.followups ? counts.followups : 0)} پیگیری)`, { tone: 'danger', title: 'انتقال مشتری‌ها', confirmText: 'انتقال بده' }))) return;
    setBusy(true);
    try {
      const r = await api.crmTransfer({ fromId, toId, ...what });
      showToast(`${toPersianDigits(r.customers)} مشتری، ${toPersianDigits(r.deals)} فرصت و ${toPersianDigits(r.followups)} پیگیری منتقل شد.`);
      reloadState();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'انتقال انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const row = (k: 'customers' | 'deals' | 'followups', text: string) => (
    <label className="flex items-center justify-between gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2.5 text-xs font-black text-[#3A241F] cursor-pointer">
      <span className="flex items-center gap-2">
        <input type="checkbox" checked={what[k]} onChange={(e) => setWhat({ ...what, [k]: e.target.checked })} />
        {text}
      </span>
      <button
        type="button"
        disabled={!fromId || counts[k] === 0}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow(show === k ? null : k); }}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 border text-violet-700 transition-all ${show === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-violet-200 hover:bg-violet-50'} disabled:opacity-40 disabled:cursor-default cursor-pointer`}
        title="دیدن اسم‌ها"
        data-transfer-list-btn={k}
      >
        <Eye className="w-3.5 h-3.5" />
        {fromId ? toPersianDigits(counts[k]) : '—'}
      </button>
    </label>
  );
  return (
    <Modal
      title="انتقال مشتری‌ها به همکار دیگر"
      onClose={onClose}
      onTop="max"
      footer={
        <>
          <button type="button" onClick={onClose} className={btnGhost}>انصراف</button>
          <button type="button" disabled={!fromId || !toId || fromId === toId || total === 0 || busy} onClick={go} className={btnMain}>انتقال</button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={label}>از همکار</label>
          <PersonPicker title="از همکار" items={staffItems(staff)} value={fromId} onChange={(id) => { setFromId(id); setShow(null); }} emptyLabel="انتخاب همکار…" />
        </div>
        <div>
          <label className={label}>به همکار</label>
          <PersonPicker title="به همکار" items={staffItems(staff.filter((u) => u.id !== fromId))} value={toId} onChange={setToId} emptyLabel="انتخاب همکار…" />
        </div>
      </div>
      <div className="space-y-2">
        {row('customers', 'مشتری‌هایی که مسئولشان است')}
        {row('deals', 'فرصت‌های فروش باز')}
        {row('followups', 'پیگیری‌های انجام‌نشده')}
      </div>
      {show && fromId && (
        <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden" data-transfer-list>
          <div className="px-3.5 py-2 bg-violet-50 text-[11px] font-black text-violet-900 flex items-center justify-between">
            <span>{show === 'customers' ? 'مشتری‌های' : show === 'deals' ? 'فرصت‌های باز' : 'پیگیری‌های انجام‌نشدهٔ'} {nameOf(fromId)} ({toPersianDigits(counts[show])})</span>
            <button type="button" onClick={() => setShow(null)} className="text-violet-700 hover:underline cursor-pointer">بستن</button>
          </div>
          <ul className="max-h-64 overflow-y-auto divide-y divide-[#EBDBCE]/60">
            {show === 'customers' && customers.filter((c) => c.ownerId === fromId).map((c) => (
              <li key={c.id} className="px-3.5 py-2 text-xs font-bold text-[#3A241F] flex items-center justify-between gap-2"><span className="truncate">{c.name}</span><span className="shrink-0 text-[10.5px] text-[#8C6F66]" dir="ltr">{toPersianDigits(c.phones?.[0] || '')}</span></li>
            ))}
            {show === 'deals' && deals.filter((d) => d.ownerId === fromId && d.stage !== 'WON' && d.stage !== 'LOST').map((d) => (
              <li key={d.id} className="px-3.5 py-2 text-xs font-bold text-[#3A241F]"><div className="truncate">{d.title}</div><div className="text-[10.5px] text-[#8C6F66] truncate">{d.customerName}</div></li>
            ))}
            {show === 'followups' && activities.filter((a) => a.type === 'FOLLOWUP' && !a.done && a.ownerId === fromId).map((a) => (
              <li key={a.id} className="px-3.5 py-2 text-xs font-bold text-[#3A241F]"><div className="truncate">{a.text || 'پیگیری'}</div><div className="text-[10.5px] text-[#8C6F66] truncate">{customers.find((c) => c.id === a.customerId)?.name || ''}</div></li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[10px] text-[#8C6F66] leading-5">فرصت‌های بسته‌شده (موفق یا ازدست‌رفته) پیش مسئول قبلی می‌ماند. همکار تازه از این انتقال با یک اعلان باخبر می‌شود.</p>
    </Modal>
  );
};

export const TransferButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-amber-200 text-amber-800 hover:bg-amber-50 text-xs font-black cursor-pointer" data-transfer-btn>
    <ArrowLeftRight className="w-4 h-4" />
    انتقال مشتری‌ها
  </button>
);

export const MergeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 cursor-pointer" data-merge-btn>
    <GitMerge className="w-4 h-4" />
    ادغام
  </button>
);

export const ShareButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-xs font-black cursor-pointer" data-share-agent-btn>
    <Eye className="w-4 h-4" />
    نمایش مشتری به نماینده
  </button>
);

/**
 * The top administrator or the managing director picks a sales representative and the customers (from the whole customer / phone book list) he may see.
 * The representative sees only the name of those customers, no number and no address; a «call» button rings his own mobile and connects him.
 */
export const ShareWithAgentModal: React.FC<{ customers: Customer[]; staff: User[]; onClose: () => void; onSave: (changed: Customer[]) => void }> = ({ customers, staff, onClose, onSave }) => {
  const agents = staff.filter((u) => u.isAgent && u.isActive !== false);
  const [agentId, setAgentId] = useState(agents[0]?.id || '');
  const initial = (id: string) => customers.filter((c) => (c.agentViewerIds || []).includes(id)).map((c) => c.id);
  const [picked, setPicked] = useState<string[]>(() => initial(agents[0]?.id || ''));
  const choose = (id: string) => {
    setAgentId(id);
    setPicked(initial(id));
  };
  const save = () => {
    const changed: Customer[] = [];
    for (const c of customers) {
      const has = (c.agentViewerIds || []).includes(agentId);
      const want = picked.includes(c.id);
      if (has === want) continue;
      const ids = (c.agentViewerIds || []).filter((x) => x !== agentId);
      changed.push({ ...c, agentViewerIds: want ? [...ids, agentId] : ids, updatedAt: new Date().toISOString() });
    }
    if (changed.length) onSave(changed);
    onClose();
  };
  const ag = agents.find((a) => a.id === agentId);
  return (
    <Modal
      title="نمایش مشتری به نماینده"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
          <button type="button" onClick={save} disabled={!agentId} className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer" data-share-save>ذخیره</button>
        </>
      }
    >
      <div className="space-y-4" data-share-agent>
        <div>
          <label className={label}>نماینده</label>
          <select className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold" value={agentId} onChange={(e) => choose(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.fullName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>مشتریانی که {ag?.fullName || 'نماینده'} ببیند (از فهرست مشتریان و دفتر تلفن)</label>
          <PersonPickerMulti title="انتخاب مشتریان" placeholder="انتخاب مشتری‌ها (با جست‌وجو)…" items={customerItems(customers)} values={picked} onChange={setPicked} />
        </div>
        <p className="text-[11px] leading-6 text-[#8C6F66]">
          نماینده فقط نام این مشتریان را می‌بیند؛ شماره و نشانی‌شان برایش پنهان است. کنار نام هر مشتری دکمهٔ «تماس» هست؛ با زدنش تلفن شرکت موبایل نماینده را زنگ می‌زند و پس از پاسخ، او را به مشتری وصل می‌کند.
        </p>
      </div>
    </Modal>
  );
};
