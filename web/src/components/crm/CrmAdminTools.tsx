import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, GitMerge } from 'lucide-react';
import { Customer, CrmActivity, Deal, User } from '../../types';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { PersonPicker, customerItems, staffItems } from '../common/PersonPicker';
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
      <span className="text-violet-700">{fromId ? toPersianDigits(counts[k]) : '—'}</span>
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
          <PersonPicker title="از همکار" items={staffItems(staff)} value={fromId} onChange={setFromId} emptyLabel="انتخاب همکار…" />
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
