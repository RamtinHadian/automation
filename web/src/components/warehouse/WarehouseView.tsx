import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Ban, Download, FileText, Package, Plus, Search, Warehouse as WarehouseIcon, X } from 'lucide-react';
import { api, WhCard, WhDoc, WhKind, WhProduct, WhState, WhWarehouse } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { JalaliDateField } from '../tasks/TasksView';
import { PersonPicker, customerItems } from '../common/PersonPicker';
import { Modal, field, label } from '../crm/crmUi';

const KIND_LABEL: Record<WhKind, string> = { receipt: 'رسید ورود', issue: 'حواله خروج', transfer: 'انتقال بین انبارها', adjust: 'تعدیل انبارگردانی' };
const KIND_COLOR: Record<WhKind, string> = {
  receipt: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  issue: 'bg-rose-50 text-rose-800 border-rose-200',
  transfer: 'bg-sky-50 text-sky-800 border-sky-200',
  adjust: 'bg-amber-50 text-amber-800 border-amber-200',
};

const fmt = (n: number) => toPersianDigits(Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 }));
const parseNum = (s: string) => Number(String(s).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,،]/g, '.').trim());

type Tab = 'stock' | 'docs' | 'products' | 'warehouses';

export const WarehouseView: React.FC = () => {
  const { currentUser, customers, showToast } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const [st, setSt] = useState<WhState | null>(null);
  const [tab, setTab] = useState<Tab>('stock');
  const [err, setErr] = useState('');
  const [docForm, setDocForm] = useState<WhKind | null>(null);
  const [cardOf, setCardOf] = useState<WhProduct | null>(null);
  const [docOpen, setDocOpen] = useState<WhDoc | null>(null);
  const [prodEdit, setProdEdit] = useState<Partial<WhProduct> | null>(null);
  const [whEdit, setWhEdit] = useState<Partial<WhWarehouse> | null>(null);

  const load = useCallback(async () => {
    try {
      setSt(await api.warehouse());
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات انبار');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <div className="bg-white rounded-3xl border border-[#EBDBCE] p-6 text-xs font-bold text-rose-700">{err}</div>;
  if (!st) return <div className="p-8 text-center text-xs font-bold text-[#8C6F66]">در حال دریافت…</div>;

  const sepidar = st.mode === 'sepidar';
  const low = st.products.filter((p) => (p.minQty || 0) > 0 && p.total < (p.minQty || 0));
  const tabs: [Tab, string][] = [
    ['stock', 'موجودی'],
    ['docs', 'اسناد'],
    ['products', 'کالاها'],
    ['warehouses', 'انبارها'],
  ];

  const setMode = async (mode: 'standalone' | 'sepidar') => {
    if (!window.confirm(mode === 'standalone' ? 'موجودی از این پس در خود هورمند نگهداری شود و سندها را همین‌جا ثبت کنید؟' : 'حالت «متصل به سپیدار» فعال شود؟ ثبت دستی سند بسته می‌شود.')) return;
    try {
      await api.whSetMode(mode);
      showToast('حالت انبار تغییر کرد.');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-2 text-[11px] font-bold ${sepidar ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
        <WarehouseIcon className="w-4 h-4 shrink-0" />
        {sepidar ? (
          <span>
            موجودی از {st.source || 'سپیدار'} می‌آید{st.lastSyncAt ? ` (آخرین همگام‌سازی: ${formatTaskDate(st.lastSyncAt)} ${toPersianDigits(st.lastSyncAt.slice(11, 16))})` : ''}. رسید و حواله را در سپیدار ثبت کنید.
          </span>
        ) : (
          <span>موجودی در خود هورمند نگهداری می‌شود.</span>
        )}
        {isAdmin && (
          <button type="button" onClick={() => setMode(sepidar ? 'standalone' : 'sepidar')} className="mr-auto text-[11px] font-black underline cursor-pointer">
            {sepidar ? 'برگشت به حالت مستقل' : 'حالت متصل به سپیدار'}
          </button>
        )}
      </div>

      {low.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] font-bold text-rose-900 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>زیر حداقل موجودی:</span>
          {low.slice(0, 12).map((p) => (
            <button key={p.id} type="button" onClick={() => setCardOf(p)} className="bg-white border border-rose-200 rounded-full px-2.5 py-0.5 cursor-pointer">
              {p.title} ({fmt(p.total)} از {fmt(p.minQty || 0)})
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto">
          {tabs.map(([k, t]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-4 py-2 min-h-[40px] rounded-xl text-xs font-black whitespace-nowrap cursor-pointer border ${tab === k ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {!sepidar && (
          <div className="mr-auto flex flex-wrap gap-1.5">
            {(Object.keys(KIND_LABEL) as WhKind[]).map((k) => (
              <button key={k} type="button" onClick={() => setDocForm(k)} className={`px-3 py-2 min-h-[40px] rounded-xl text-[11px] font-black border cursor-pointer ${KIND_COLOR[k]}`}>
                + {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'stock' && <StockTab st={st} onCard={setCardOf} />}
      {tab === 'docs' && <DocsTab st={st} onOpen={setDocOpen} />}
      {tab === 'products' && <ProductsTab st={st} sepidar={sepidar} onEdit={setProdEdit} onCard={setCardOf} />}
      {tab === 'warehouses' && <WarehousesTab st={st} sepidar={sepidar} onEdit={setWhEdit} />}

      {docForm && (
        <DocForm
          st={st}
          kind={docForm}
          customers={customers}
          onClose={() => setDocForm(null)}
          onSaved={(d) => {
            setDocForm(null);
            showToast(`${KIND_LABEL[d.kind]} شماره ${toPersianDigits(d.number)} ثبت شد.`);
            load();
          }}
        />
      )}
      {cardOf && <CardModal st={st} product={cardOf} onClose={() => setCardOf(null)} onOpenDoc={async (id) => {
        const r = await api.warehouseDocs({ limit: '500' }).catch(() => null);
        const d = r?.docs.find((x) => x.id === id);
        if (d) setDocOpen(d);
      }} />}
      {docOpen && <DocModal doc={docOpen} isAdmin={isAdmin && !sepidar} onClose={() => setDocOpen(null)} onChanged={() => { setDocOpen(null); load(); }} />}
      {prodEdit && <ProductModal p={prodEdit} sepidar={sepidar} isAdmin={isAdmin} onClose={() => setProdEdit(null)} onSaved={() => { setProdEdit(null); load(); }} />}
      {whEdit && <WarehouseModal w={whEdit} sepidar={sepidar} isAdmin={isAdmin} onClose={() => setWhEdit(null)} onSaved={() => { setWhEdit(null); load(); }} />}
    </div>
  );
};

// ---------- stock ----------

const csvDownload = (name: string, rows: (string | number)[][]) => {
  const body = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const StockTab: React.FC<{ st: WhState; onCard: (p: WhProduct) => void }> = ({ st, onCard }) => {
  const [q, setQ] = useState('');
  const [wh, setWh] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return st.products.filter((p) => p.active !== false && (!t || `${p.code} ${p.title} ${p.group || ''}`.toLowerCase().includes(t)) && (!onlyLow || ((p.minQty || 0) > 0 && p.total < (p.minQty || 0))) && (!wh || (p.byWarehouse[wh] || 0) !== 0));
  }, [st, q, wh, onlyLow]);
  const qtyOf = (p: WhProduct) => (wh ? p.byWarehouse[wh] || 0 : p.total);
  const whName = (id: string) => st.warehouses.find((w) => w.id === id)?.title || '';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C6F66]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کد یا نام کالا" className={field + ' pr-9'} />
        </div>
        <select value={wh} onChange={(e) => setWh(e.target.value)} className={field + ' !w-auto'}>
          <option value="">همهٔ انبارها</option>
          {st.warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.title}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#3A241F] cursor-pointer">
          <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="w-4 h-4" /> فقط کمبودها
        </label>
        <button
          type="button"
          onClick={() => csvDownload('موجودی-انبار.csv', [['کد', 'نام کالا', 'واحد', 'گروه', 'حداقل', 'موجودی', ...st.warehouses.map((w) => w.title)], ...rows.map((p) => [p.code, p.title, p.unit, p.group || '', p.minQty || 0, p.total, ...st.warehouses.map((w) => p.byWarehouse[w.id] || 0)])])}
          className="flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black cursor-pointer"
        >
          <Download className="w-4 h-4" /> خروجی اکسل
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty text={st.products.length ? 'کالایی با این شرط پیدا نشد.' : 'هنوز کالایی تعریف نشده است. از «کالاها» شروع کنید.'} />
      ) : (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">
          {rows.map((p) => {
            const lowRow = (p.minQty || 0) > 0 && p.total < (p.minQty || 0);
            return (
              <button key={p.id} type="button" onClick={() => onCard(p)} className="w-full text-right px-4 py-3 flex items-center gap-3 hover:bg-[#FAF5F1] cursor-pointer">
                <Package className="w-4 h-4 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-[#3A241F] truncate">{p.title}</div>
                  <div className="text-[10px] font-bold text-[#8C6F66] truncate">
                    {toPersianDigits(p.code)}
                    {p.group ? ` · ${p.group}` : ''}
                    {!wh && st.warehouses.length > 1 ? ' · ' + st.warehouses.filter((w) => p.byWarehouse[w.id]).map((w) => `${w.title}: ${fmt(p.byWarehouse[w.id])}`).join('، ') : ''}
                  </div>
                </div>
                <div className={`text-sm font-black whitespace-nowrap ${lowRow ? 'text-rose-700' : qtyOf(p) === 0 ? 'text-[#8C6F66]' : 'text-[#3A241F]'}`}>
                  {fmt(qtyOf(p))} <span className="text-[10px] font-bold text-[#8C6F66]">{p.unit}</span>
                </div>
                {lowRow && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
      {wh && <div className="text-[10px] font-bold text-[#8C6F66]">موجودی نشان‌داده‌شده فقط برای «{whName(wh)}» است.</div>}
    </div>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="bg-white rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">{text}</div>;

// ---------- documents ----------

const DocsTab: React.FC<{ st: WhState; onOpen: (d: WhDoc) => void }> = ({ st, onOpen }) => {
  const [kind, setKind] = useState('');
  const [wh, setWh] = useState('');
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [docs, setDocs] = useState<WhDoc[] | null>(null);
  useEffect(() => {
    const q: Record<string, string> = { limit: '200' };
    if (kind) q.kind = kind;
    if (wh) q.warehouse = wh;
    if (from) q.from = from;
    if (to) q.to = to;
    let live = true;
    api.warehouseDocs(q).then((r) => live && setDocs(r.docs)).catch(() => live && setDocs([]));
    return () => {
      live = false;
    };
  }, [kind, wh, from, to, st]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          <option value="">همهٔ انواع</option>
          {(Object.keys(KIND_LABEL) as WhKind[]).map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        <select value={wh} onChange={(e) => setWh(e.target.value)} className={field}>
          <option value="">همهٔ انبارها</option>
          {st.warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.title}</option>
          ))}
        </select>
        <div>
          <JalaliDateField value={from} onChange={setFrom} />
        </div>
        <div>
          <JalaliDateField value={to} onChange={setTo} />
        </div>
      </div>
      <div className="text-[10px] font-bold text-[#8C6F66]">تاریخ‌های بالا: از تاریخ و تا تاریخ (اختیاری)</div>
      {!docs ? (
        <Empty text="در حال دریافت…" />
      ) : docs.length === 0 ? (
        <Empty text="سندی پیدا نشد." />
      ) : (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">
          {docs.map((d) => (
            <button key={d.id} type="button" onClick={() => onOpen(d)} className={`w-full text-right px-4 py-3 flex items-center gap-3 hover:bg-[#FAF5F1] cursor-pointer ${d.voided ? 'opacity-60' : ''}`}>
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg border whitespace-nowrap ${KIND_COLOR[d.kind]}`}>{KIND_LABEL[d.kind]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-[#3A241F] truncate">
                  شمارهٔ {toPersianDigits(d.number)} · {d.warehouseName}
                  {d.toWarehouseName ? ` ← ${d.toWarehouseName}` : ''}
                </div>
                <div className="text-[10px] font-bold text-[#8C6F66] truncate">
                  {formatTaskDate(d.date)} · {toPersianDigits(d.lines.length)} ردیف{d.party ? ` · ${d.party}` : ''}
                </div>
              </div>
              {d.voided && <span className="text-[10px] font-black text-rose-700 border border-rose-200 rounded-lg px-2 py-0.5">باطل</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const DocModal: React.FC<{ doc: WhDoc; isAdmin: boolean; onClose: () => void; onChanged: () => void }> = ({ doc, isAdmin, onClose, onChanged }) => {
  const { showToast } = useAppContext();
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const doVoid = async () => {
    if (!reason.trim()) return showToast('دلیل ابطال را بنویسید.');
    setBusy(true);
    try {
      await api.whDocVoid(doc.id, reason.trim());
      showToast('سند باطل شد.');
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${KIND_LABEL[doc.kind]} شمارهٔ ${toPersianDigits(doc.number)}`}
      onClose={onClose}
      onTop
      footer={
        <>
          {isAdmin && !doc.voided ? (
            asking ? (
              <button type="button" disabled={busy} onClick={doVoid} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black cursor-pointer">ابطال قطعی سند</button>
            ) : (
              <button type="button" onClick={() => setAsking(true)} className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-black cursor-pointer">
                <Ban className="w-4 h-4" /> ابطال سند
              </button>
            )
          ) : <span />}
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">بستن</button>
        </>
      }
    >
      {doc.voided && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] font-bold text-rose-800">این سند باطل شده است{doc.voidReason ? `: ${doc.voidReason}` : ''}{doc.voidedByName ? ` (${doc.voidedByName})` : ''}</div>}
      <div className="grid grid-cols-2 gap-3 text-[11px] font-bold text-[#3A241F]">
        <div>تاریخ: {formatTaskDate(doc.date)}</div>
        <div>انبار: {doc.warehouseName}{doc.toWarehouseName ? ` ← ${doc.toWarehouseName}` : ''}</div>
        {doc.party && <div>طرف حساب: {doc.party}</div>}
        {doc.createdByName && <div>ثبت‌کننده: {doc.createdByName}</div>}
        {doc.reason && <div className="col-span-2">دلیل: {doc.reason}</div>}
        {doc.note && <div className="col-span-2">توضیح: {doc.note}</div>}
      </div>
      <div className="border border-[#EBDBCE] rounded-xl divide-y divide-[#F3E8DF] overflow-hidden">
        {doc.lines.map((l, i) => (
          <div key={i} className="px-3 py-2 flex items-center gap-2 text-xs">
            <div className="min-w-0 flex-1 font-black truncate">{l.title} <span className="text-[10px] text-[#8C6F66]">{toPersianDigits(l.code)}</span></div>
            <div className="font-black whitespace-nowrap">
              {doc.kind === 'adjust' && l.before !== undefined ? `${fmt(l.before)} ← ${fmt(l.qty)}` : fmt(l.qty)} <span className="text-[10px] text-[#8C6F66]">{l.unit}</span>
            </div>
          </div>
        ))}
      </div>
      {asking && !doc.voided && <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل ابطال (لازم است)" className={field} autoFocus />}
    </Modal>
  );
};

// ---------- new document ----------

interface Row {
  productId: string;
  qty: string;
}

const DocForm: React.FC<{ st: WhState; kind: WhKind; customers: { id: string; name: string; company?: string; phones?: string[] }[]; onClose: () => void; onSaved: (d: WhDoc) => void }> = ({ st, kind: k0, customers, onClose, onSaved }) => {
  const { showToast } = useAppContext();
  const [kind, setKind] = useState<WhKind>(k0);
  const warehouses = st.warehouses.filter((w) => w.active !== false);
  const [date, setDate] = useState<string | undefined>(todayIso());
  const [wid, setWid] = useState(warehouses[0]?.id || '');
  const [to, setTo] = useState('');
  const [party, setParty] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([{ productId: '', qty: '' }]);
  const [busy, setBusy] = useState(false);
  const prods = st.products.filter((p) => p.active !== false);
  const items = prods.map((p) => ({ id: p.id, name: p.title, sub: `${toPersianDigits(p.code)} · موجودی ${fmt(p.byWarehouse[wid] || 0)} ${p.unit}` }));
  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const unitOf = (id: string) => prods.find((p) => p.id === id)?.unit || '';

  const save = async () => {
    if (!date) return showToast('تاریخ سند را بنویسید.');
    if (!wid) return showToast('انبار را انتخاب کنید.');
    const lines = rows.filter((r) => r.productId || r.qty.trim()).map((r) => ({ productId: r.productId, qty: parseNum(r.qty) }));
    if (!lines.length || lines.some((l) => !l.productId)) return showToast('کالای همهٔ ردیف‌ها را انتخاب کنید.');
    if (lines.some((l) => !Number.isFinite(l.qty) || l.qty < 0 || (kind !== 'adjust' && l.qty <= 0))) return showToast('مقدار همهٔ ردیف‌ها را درست بنویسید.');
    setBusy(true);
    try {
      const d = await api.whDocCreate({ kind, date, warehouseId: wid, toWarehouseId: kind === 'transfer' ? to : '', party: party.trim(), customerId: kind === 'issue' || kind === 'receipt' ? customerId : '', reason: reason.trim(), note: note.trim(), lines });
      onSaved(d);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
      setBusy(false);
    }
  };
  if (!warehouses.length || !prods.length) {
    return (
      <Modal title="سند جدید" onClose={onClose} footer={<button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">بستن</button>}>
        <div className="text-xs font-bold text-[#3A241F] leading-7">برای ثبت سند، اول باید دست‌کم یک انبار (در بخش «انبارها») و یک کالا (در بخش «کالاها») تعریف کنید.</div>
      </Modal>
    );
  }
  return (
    <Modal
      title={KIND_LABEL[kind]}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
          <button type="button" disabled={busy} onClick={save} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer disabled:opacity-60">{busy ? 'در حال ثبت…' : 'ثبت سند'}</button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABEL) as WhKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black border cursor-pointer ${kind === k ? KIND_COLOR[k] + ' ring-2 ring-amber-300' : 'bg-white border-[#EBDBCE]'}`}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={label}>تاریخ</span>
          <JalaliDateField value={date} onChange={setDate} />
        </div>
        <div>
          <span className={label}>{kind === 'transfer' ? 'از انبار' : 'انبار'}</span>
          <select value={wid} onChange={(e) => setWid(e.target.value)} className={field}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.title}</option>
            ))}
          </select>
        </div>
        {kind === 'transfer' && (
          <div>
            <span className={label}>به انبار</span>
            <select value={to} onChange={(e) => setTo(e.target.value)} className={field}>
              <option value="">انتخاب کنید</option>
              {warehouses.filter((w) => w.id !== wid).map((w) => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
          </div>
        )}
        {(kind === 'receipt' || kind === 'issue') && (
          <>
            <div>
              <span className={label}>{kind === 'receipt' ? 'تأمین‌کننده / تحویل‌دهنده' : 'تحویل‌گیرنده'} (اختیاری)</span>
              <input value={party} onChange={(e) => setParty(e.target.value)} className={field} />
            </div>
            <div>
              <span className={label}>مشتری (اختیاری)</span>
              <PersonPicker value={customerId} onChange={setCustomerId} items={customerItems(customers)} title="انتخاب مشتری" placeholder="بدون مشتری" emptyLabel="بدون مشتری" />
            </div>
          </>
        )}
        {kind === 'adjust' && (
          <div className="sm:col-span-2">
            <span className={label}>دلیل تعدیل (لازم است)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً انبارگردانی پایان سال" className={field} />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <span className={label}>{kind === 'adjust' ? 'کالاها و مقدار شمارش‌شده' : 'کالاها'}</span>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <PersonPicker value={r.productId} onChange={(id) => setRow(i, { productId: id })} items={items} title="انتخاب کالا" placeholder="انتخاب کالا" />
            </div>
            <input value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} inputMode="decimal" placeholder="مقدار" className={field + ' !w-24'} />
            <span className="text-[10px] font-bold text-[#8C6F66] w-10 truncate">{unitOf(r.productId)}</span>
            <button type="button" onClick={() => setRows((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))} className="p-1.5 text-[#8C6F66] cursor-pointer" aria-label="حذف ردیف">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((x) => [...x, { productId: '', qty: '' }])} className="flex items-center gap-1 text-[11px] font-black text-amber-700 cursor-pointer">
          <Plus className="w-4 h-4" /> ردیف دیگر
        </button>
      </div>
      <div>
        <span className={label}>توضیح (اختیاری)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      </div>
    </Modal>
  );
};

// ---------- card (kardex) ----------

const CardModal: React.FC<{ st: WhState; product: WhProduct; onClose: () => void; onOpenDoc: (id: string) => void }> = ({ st, product, onClose, onOpenDoc }) => {
  const [wh, setWh] = useState('');
  const [card, setCard] = useState<WhCard | null>(null);
  useEffect(() => {
    let live = true;
    setCard(null);
    api.warehouseCard(product.id, wh).then((c) => live && setCard(c)).catch(() => live && setCard({ product, rows: [], balance: 0 }));
    return () => {
      live = false;
    };
  }, [product, wh]);
  const whName = (id: string) => st.warehouses.find((w) => w.id === id)?.title || '';
  return (
    <Modal title={`کاردکس: ${product.title}`} onClose={onClose} wide onTop footer={
      <>
        <button type="button" onClick={() => card && csvDownload(`کاردکس-${product.code}.csv`, [['تاریخ', 'نوع', 'شماره', 'انبار', 'طرف حساب', 'ورود', 'خروج', 'مانده'], ...card.rows.map((r) => [r.date, KIND_LABEL[r.kind], r.number, whName(r.warehouseId), r.party, r.in, r.out, r.balance])])} className="flex items-center gap-1 px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">
          <Download className="w-4 h-4" /> خروجی اکسل
        </button>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">بستن</button>
      </>
    }>
      <div className="flex flex-wrap items-center gap-2">
        <select value={wh} onChange={(e) => setWh(e.target.value)} className={field + ' !w-auto'}>
          <option value="">همهٔ انبارها</option>
          {st.warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.title}</option>
          ))}
        </select>
        <span className="text-xs font-black text-[#3A241F]">موجودی: {fmt(card ? card.balance : wh ? product.byWarehouse[wh] || 0 : product.total)} {product.unit}</span>
      </div>
      {!card ? (
        <Empty text="در حال دریافت…" />
      ) : card.rows.length === 0 ? (
        <Empty text="هنوز گردشی برای این کالا ثبت نشده است." />
      ) : (
        <div className="border border-[#EBDBCE] rounded-xl overflow-x-auto">
          <table className="w-full text-[11px] font-bold text-[#3A241F] min-w-[520px]">
            <thead className="bg-[#FAF5F1] text-[#8C6F66]">
              <tr>
                <th className="p-2 text-right">تاریخ</th>
                <th className="p-2 text-right">سند</th>
                <th className="p-2 text-right">انبار</th>
                <th className="p-2 text-right">ورود</th>
                <th className="p-2 text-right">خروج</th>
                <th className="p-2 text-right">مانده</th>
              </tr>
            </thead>
            <tbody>
              {[...card.rows].reverse().map((r, i) => (
                <tr key={i} className="border-t border-[#F3E8DF]">
                  <td className="p-2 whitespace-nowrap">{formatTaskDate(r.date)}</td>
                  <td className="p-2"><button type="button" onClick={() => onOpenDoc(r.docId)} className="underline cursor-pointer">{KIND_LABEL[r.kind]} {toPersianDigits(r.number)}</button></td>
                  <td className="p-2">{whName(r.warehouseId)}</td>
                  <td className="p-2 text-emerald-700">{r.in ? fmt(r.in) : ''}</td>
                  <td className="p-2 text-rose-700">{r.out ? fmt(r.out) : ''}</td>
                  <td className="p-2">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

// ---------- products and warehouses ----------

const ProductsTab: React.FC<{ st: WhState; sepidar: boolean; onEdit: (p: Partial<WhProduct>) => void; onCard: (p: WhProduct) => void }> = ({ st, sepidar, onEdit }) => {
  const [q, setQ] = useState('');
  const rows = st.products.filter((p) => !q.trim() || `${p.code} ${p.title} ${p.group || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کد یا نام کالا" className={field + ' flex-1'} />
        {!sepidar && (
          <button type="button" onClick={() => onEdit({ unit: 'عدد', active: true })} className="flex items-center gap-1 px-4 py-2 min-h-[40px] rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer">
            <Plus className="w-4 h-4" /> کالای جدید
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <Empty text="کالایی ثبت نشده است." />
      ) : (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">
          {rows.map((p) => (
            <button key={p.id} type="button" onClick={() => onEdit(p)} className={`w-full text-right px-4 py-3 flex items-center gap-3 hover:bg-[#FAF5F1] cursor-pointer ${p.active === false ? 'opacity-50' : ''}`}>
              <FileText className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-[#3A241F] truncate">{p.title}</div>
                <div className="text-[10px] font-bold text-[#8C6F66] truncate">{toPersianDigits(p.code)} · {p.unit}{p.group ? ` · ${p.group}` : ''}{p.minQty ? ` · حداقل ${fmt(p.minQty)}` : ''}{(p.prices || []).map((x) => ` · ${x.title}: ${fmt(x.amount)}`).join('')}</div>
              </div>
              <div className="text-xs font-black whitespace-nowrap">{fmt(p.total)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

const ProductModal: React.FC<{ p: Partial<WhProduct>; sepidar: boolean; isAdmin: boolean; onClose: () => void; onSaved: () => void }> = ({ p, sepidar, isAdmin, onClose, onSaved }) => {
  const { showToast } = useAppContext();
  const isNew = !p.id;
  const [f, setF] = useState({ code: p.code || '', title: p.title || '', unit: p.unit || 'عدد', group: p.group || '', barcode: p.barcode || '', minQty: p.minQty ? String(p.minQty) : '', note: p.note || '', active: p.active !== false });
  const [prices, setPrices] = useState<{ title: string; amount: string }[]>((p.prices || []).map((x) => ({ title: x.title, amount: String(x.amount) })));
  const [busy, setBusy] = useState(false);
  const lockBase = sepidar; // code, name and unit belong to the accounting program
  const save = async () => {
    if (!f.code.trim() || !f.title.trim()) return showToast('کد و نام کالا را بنویسید.');
    const minQty = f.minQty.trim() ? parseNum(f.minQty) : 0;
    if (!Number.isFinite(minQty) || minQty < 0) return showToast('حداقل موجودی درست نیست.');
    const pr = prices.filter((x) => x.title.trim() || x.amount.trim()).map((x) => ({ title: x.title.trim(), amount: parseNum(x.amount) }));
    if (pr.some((x) => !x.title || !Number.isFinite(x.amount) || x.amount < 0)) return showToast('برای هر قیمت، عنوان و مبلغ را درست بنویسید.');
    setBusy(true);
    try {
      await api.whProductSave(p.id || newId('p'), { ...f, minQty, prices: pr });
      showToast('کالا ذخیره شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
      setBusy(false);
    }
  };
  const del = async () => {
    if (!p.id || !window.confirm('این کالا حذف شود؟')) return;
    try {
      await api.whProductDelete(p.id);
      showToast('کالا حذف شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };
  return (
    <Modal title={isNew ? 'کالای جدید' : 'ویرایش کالا'} onClose={onClose} footer={
      <>
        {isAdmin && !isNew && !sepidar ? <button type="button" onClick={del} className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-black cursor-pointer">حذف</button> : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
          <button type="button" disabled={busy} onClick={save} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer disabled:opacity-60">ذخیره</button>
        </div>
      </>
    }>
      {sepidar && <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-[11px] font-bold text-sky-900">کد، نام و واحد از سپیدار می‌آید؛ فقط حداقل موجودی و یادداشت را می‌توانید تغییر دهید.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span className={label}>کد کالا</span><input value={f.code} disabled={lockBase} onChange={(e) => setF({ ...f, code: e.target.value })} className={field} /></div>
        <div><span className={label}>واحد</span><input value={f.unit} disabled={lockBase} onChange={(e) => setF({ ...f, unit: e.target.value })} className={field} /></div>
        <div className="sm:col-span-2"><span className={label}>نام کالا</span><input value={f.title} disabled={lockBase} onChange={(e) => setF({ ...f, title: e.target.value })} className={field} /></div>
        <div><span className={label}>گروه</span><input value={f.group} disabled={lockBase} onChange={(e) => setF({ ...f, group: e.target.value })} className={field} /></div>
        <div><span className={label}>بارکد</span><input value={f.barcode} disabled={lockBase} onChange={(e) => setF({ ...f, barcode: e.target.value })} className={field} /></div>
        <div><span className={label}>حداقل موجودی (برای هشدار)</span><input value={f.minQty} onChange={(e) => setF({ ...f, minQty: e.target.value })} inputMode="decimal" className={field} /></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" disabled={lockBase} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="w-4 h-4" /> فعال</label></div>
        <div className="sm:col-span-2"><span className={label}>یادداشت</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={field} /></div>
        <div className="sm:col-span-2 space-y-2">
          <span className={label}>قیمت‌ها (مثلاً خرده‌فروشی، عمده، نمایندگی)</span>
          {prices.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={x.title} onChange={(e) => setPrices((r) => r.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} placeholder="عنوان قیمت" className={field} />
              <input value={x.amount} onChange={(e) => setPrices((r) => r.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} inputMode="decimal" placeholder="مبلغ" className={field + ' !w-36'} />
              <button type="button" onClick={() => setPrices((r) => r.filter((_, j) => j !== i))} className="p-1.5 text-[#8C6F66] cursor-pointer" aria-label="حذف قیمت"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {prices.length < 12 && (
            <button type="button" onClick={() => setPrices((r) => [...r, { title: '', amount: '' }])} className="flex items-center gap-1 text-[11px] font-black text-amber-700 cursor-pointer"><Plus className="w-4 h-4" /> قیمت دیگر</button>
          )}
        </div>
      </div>
    </Modal>
  );
};

const WarehousesTab: React.FC<{ st: WhState; sepidar: boolean; onEdit: (w: Partial<WhWarehouse>) => void }> = ({ st, sepidar, onEdit }) => {
  const { staffList } = useAppContext();
  const keeper = (id?: string) => staffList.find((u) => u.id === id)?.fullName || '';
  return (
    <div className="space-y-3">
      {!sepidar && (
        <button type="button" onClick={() => onEdit({ active: true })} className="flex items-center gap-1 px-4 py-2 min-h-[40px] rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer">
          <Plus className="w-4 h-4" /> انبار جدید
        </button>
      )}
      {st.warehouses.length === 0 ? (
        <Empty text="هنوز انباری تعریف نشده است." />
      ) : (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">
          {st.warehouses.map((w) => (
            <button key={w.id} type="button" onClick={() => onEdit(w)} className={`w-full text-right px-4 py-3 flex items-center gap-3 hover:bg-[#FAF5F1] cursor-pointer ${w.active === false ? 'opacity-50' : ''}`}>
              <ArrowLeftRight className="w-4 h-4 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-[#3A241F] truncate">{w.title}</div>
                <div className="text-[10px] font-bold text-[#8C6F66] truncate">{[w.code && toPersianDigits(w.code), w.location, keeper(w.keeperId) && 'انباردار: ' + keeper(w.keeperId)].filter(Boolean).join(' · ')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const WarehouseModal: React.FC<{ w: Partial<WhWarehouse>; sepidar: boolean; isAdmin: boolean; onClose: () => void; onSaved: () => void }> = ({ w, sepidar, isAdmin, onClose, onSaved }) => {
  const { showToast, staffList } = useAppContext();
  const isNew = !w.id;
  const [f, setF] = useState({ title: w.title || '', code: w.code || '', location: w.location || '', keeperId: w.keeperId || '', note: w.note || '', active: w.active !== false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.title.trim()) return showToast('نام انبار را بنویسید.');
    setBusy(true);
    try {
      await api.whWarehouseSave(w.id || newId('wh'), f);
      showToast('انبار ذخیره شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
      setBusy(false);
    }
  };
  const del = async () => {
    if (!w.id || !window.confirm('این انبار حذف شود؟')) return;
    try {
      await api.whWarehouseDelete(w.id);
      showToast('انبار حذف شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };
  return (
    <Modal title={isNew ? 'انبار جدید' : 'ویرایش انبار'} onClose={onClose} footer={
      <>
        {isAdmin && !isNew && !sepidar ? <button type="button" onClick={del} className="px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 text-xs font-black cursor-pointer">حذف</button> : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
          <button type="button" disabled={busy} onClick={save} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer disabled:opacity-60">ذخیره</button>
        </div>
      </>
    }>
      {sepidar && <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-[11px] font-bold text-sky-900">نام و کد انبار از سپیدار می‌آید؛ فقط انباردار، محل و یادداشت را می‌توانید تغییر دهید.</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span className={label}>نام انبار</span><input value={f.title} disabled={sepidar} onChange={(e) => setF({ ...f, title: e.target.value })} className={field} /></div>
        <div><span className={label}>کد</span><input value={f.code} disabled={sepidar} onChange={(e) => setF({ ...f, code: e.target.value })} className={field} /></div>
        <div><span className={label}>محل</span><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={field} /></div>
        <div>
          <span className={label}>انباردار</span>
          <PersonPicker value={f.keeperId} onChange={(id) => setF({ ...f, keeperId: id })} items={staffList.map((u) => ({ id: u.id, name: u.fullName, sub: u.departmentName }))} title="انتخاب انباردار" placeholder="بدون انباردار" emptyLabel="بدون انباردار" />
        </div>
        <div className="sm:col-span-2"><span className={label}>یادداشت</span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={field} /></div>
        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer"><input type="checkbox" disabled={sepidar} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="w-4 h-4" /> فعال</label>
      </div>
    </Modal>
  );
};
