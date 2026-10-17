import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, FileCheck2, FileText, RefreshCw, Search, Send, Unplug, Users, X } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { JalaliDateField } from '../tasks/TasksView';
import { Modal, field, label } from '../crm/crmUi';
import { matchesAll } from '../../lib/searchAll';
import { CustomerFinance } from './CustomerFinance';

interface Job {
  id: string;
  kind: string;
  data: Record<string, any>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled';
  by: string;
  createdAt: string;
  finishedAt?: string;
  result?: { message?: string };
}
interface Link {
  kind: 'customer' | 'quotation' | 'invoice' | 'receipt';
  ref: string;
  sepidarId: number;
  number?: number;
  data?: Record<string, any>;
}
interface State {
  perms: string[];
  connectorSeenAt: string;
  connectorName: string;
  jobKinds: Record<string, { Title: string }>;
  jobs: Job[];
  links: Link[];
  cache?: Record<string, { items: any[]; at: string }>;
}

const STATUS: Record<Job['status'], [string, string]> = {
  pending: ['در صف', 'bg-amber-50 text-amber-800 border-amber-200'],
  running: ['در حال انجام', 'bg-sky-50 text-sky-800 border-sky-200'],
  done: ['انجام شد', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  failed: ['انجام نشد', 'bg-rose-50 text-rose-800 border-rose-200'],
  cancelled: ['لغو شد', 'bg-gray-50 text-gray-600 border-gray-200'],
};
const fmt = (n: number) => toPersianDigits(Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const timeOf = (iso?: string) => (iso ? `${formatTaskDate(iso)} ${toPersianDigits(new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}` : '');

type Tab = 'deals' | 'customers' | 'invoices' | 'prices' | 'jobs';

export const SepidarView: React.FC = () => {
  const { customers, deals, showToast } = useAppContext();
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<Tab>('deals');
  const [q, setQ] = useState('');
  const [receiptFor, setReceiptFor] = useState<any | null>(null);
  // clicking a customer's name shows his financial position in Sepidar
  const [financeFor, setFinanceFor] = useState<{ id: string; name: string } | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  const { currentUser } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const load = useCallback(async () => {
    try {
      setSt((await api.sepidar()) as unknown as State);
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا در دریافت اطلاعات');
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 8000); // answers of the accounting computer arrive by themselves
    return () => window.clearInterval(t);
  }, [load]);

  const can = (p: string) => !!st?.perms.includes(p);
  const ask = async (body: Record<string, unknown>, ok: string) => {
    try {
      await api.sepidarJob(body);
      showToast(ok);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };

  const linkMap = useMemo(() => {
    const m = new Map<string, Link>();
    (st?.links || []).forEach((l) => m.set(l.kind + ':' + l.ref, l));
    return m;
  }, [st]);
  const busy = useMemo(() => {
    const s = new Set<string>();
    (st?.jobs || []).forEach((j) => (j.status === 'pending' || j.status === 'running') && s.add(j.kind + ':' + (j.data.dealId || j.data.customerId || '')));
    return s;
  }, [st]);

  if (err) return <div className="bg-white rounded-3xl border border-[#EBDBCE] p-6 text-xs font-bold text-rose-700">{err}</div>;
  if (!st) return <div className="p-8 text-center text-xs font-bold text-[#8C6F66]">در حال دریافت…</div>;

  const alive = st.connectorSeenAt && Date.now() - new Date(st.connectorSeenAt).getTime() < 3 * 60 * 1000;
  const tabs: [Tab, string, boolean][] = [
    ['deals', 'پیش‌فاکتور و فاکتور', can('quotation') || can('invoice') || can('receipt') || can('view')],
    ['customers', 'مشتریان', can('customer') || can('view')],
    ['invoices', 'فاکتورهای فروش', can('view')],
    ['prices', 'قیمت‌ها', can('view')],
    ['jobs', 'درخواست‌ها', true],
  ];
  const needle = q.trim().toLowerCase();
  const BtnS = 'px-3 py-1.5 min-h-[34px] rounded-lg text-[11px] font-black border cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  const dealRows = deals.filter((d: any) => d.proformaNumber && matchesAll(d, q));
  const custRows = customers.filter((c) => matchesAll(c, q));
  const balances = new Map<number, any>((st.cache?.balances?.items || []).map((b) => [b.CustomerID, b]));
  const accountName = new Map<number, string>((st.cache?.bankAccounts?.items || []).map((a) => [a.BankAccountID, a.DlTitle]));
  void accountName;
  const customerOfSepidar = new Map<number, string>();
  st.links.filter((l) => l.kind === 'customer').forEach((l) => customerOfSepidar.set(l.sepidarId, customers.find((c) => c.id === l.ref)?.name || ''));
  const invoiceRows = (st.cache?.invoices?.items || []).filter((i: any) => matchesAll(i, q, customerOfSepidar.get(i.CustomerRef) || ''));

  return (
    <div className="space-y-4" dir="rtl">
      <div className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-2 text-[11px] font-bold ${alive ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
        {alive ? <RefreshCw className="w-4 h-4" /> : <Unplug className="w-4 h-4" />}
        <span>
          {alive
            ? `برنامهٔ سپیدار وصل است (آخرین تماس: ${timeOf(st.connectorSeenAt)}).`
            : st.connectorSeenAt
              ? `برنامهٔ سپیدار چند دقیقه است جواب نمی‌دهد (آخرین تماس: ${timeOf(st.connectorSeenAt)}). درخواست‌ها تا روشن‌شدنش در صف می‌مانند.`
              : 'برنامهٔ سپیدار هنوز به هورمند وصل نشده است (راهنمای اتصال را ببینید).'}
        </span>
        {isAdmin && (
          <button
            type="button"
            onClick={async () => {
              try {
                setPair(await api.sepidarPair());
              } catch (e) {
                showToast(e instanceof Error ? e.message : 'خطا');
              }
            }}
            className="mr-auto underline font-black cursor-pointer"
          >
            ساخت کد اتصال
          </button>
        )}
        {can('view') && (
          <button type="button" onClick={() => ask({ kind: 'refresh' }, 'درخواست بروزرسانی فرستاده شد.')} className="mr-auto underline font-black cursor-pointer">
            بروزرسانی اطلاعات سپیدار
          </button>
        )}
      </div>

      <div data-subtabs className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {tabs.filter((t) => t[2]).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`px-3 sm:px-4 py-2 min-h-[40px] rounded-xl text-xs font-black whitespace-nowrap cursor-pointer border ${tab === k ? 'bg-rose-700 text-white border-rose-700' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>
              {t}
            </button>
          ))}
        </div>
        {tab !== 'jobs' && (
          <div className="relative mr-auto min-w-[180px] flex-1 max-w-xs">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C6F66]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در همهٔ اطلاعات: نام، شماره، کالا، مبلغ، تاریخ…" className={field + ' pr-9'} />
          </div>
        )}
      </div>

      {tab === 'deals' && (
        <List empty="فرصت فروشی با پیش‌فاکتور شماره‌دار نیست.">
          {dealRows.map((d: any) => {
            const qt = linkMap.get('quotation:' + d.id);
            const inv = linkMap.get('invoice:' + d.id);
            const receipts = st.links.filter((l) => l.kind === 'receipt' && l.ref.startsWith(d.id + '#'));
            const paid = receipts.reduce((s, r) => s + Number(r.data?.amount || 0), 0);
            const wait = (k: string) => busy.has(k + ':' + d.id);
            return (
              <Card
                key={d.id}
                icon={<FileText className="w-5 h-5" />}
                tone="rose"
                title={
                  <button type="button" onClick={() => setFinanceFor({ id: d.customerId, name: d.customerName })} className="font-black underline decoration-dotted underline-offset-4 hover:text-rose-800 cursor-pointer text-right" title="وضعیت مالی مشتری در سپیدار">
                    {d.customerName}
                  </button>
                }
                sub={`پیش‌فاکتور ${toPersianDigits(d.proformaNumber)}${d.title ? ' · ' + d.title : ''}`}
                badge={inv ? ['فاکتور شد', 'bg-emerald-50 text-emerald-800 border-emerald-200'] : qt ? ['در سپیدار', 'bg-sky-50 text-sky-800 border-sky-200'] : ['هنوز در سپیدار نیست', 'bg-amber-50 text-amber-800 border-amber-200']}
                facts={[
                  ['مبلغ', d.amount ? fmt(d.amount) : '—'],
                  ['پیش‌فاکتور سپیدار', qt ? toPersianDigits(qt.number ?? qt.sepidarId) : '—'],
                  ['فاکتور', inv ? toPersianDigits(inv.number ?? inv.sepidarId) : '—'],
                  ['دریافتی', paid ? fmt(paid) : '—'],
                ]}
              >
                {!qt && can('quotation') && <button type="button" disabled={wait('quotation.send')} onClick={() => ask({ kind: 'quotation.send', dealId: d.id }, 'پیش‌فاکتور برای سپیدار در صف قرار گرفت.')} className={`${BtnS} bg-rose-700 text-white border-rose-700`}><Send className="w-3.5 h-3.5 inline ml-1" />ارسال به سپیدار</button>}
                {qt && !inv && can('invoice') && <button type="button" disabled={wait('invoice.fromProforma')} onClick={async () => (await askConfirm('فاکتور فروش در سپیدار صادر شود؟', { tone: 'info', title: 'صدور فاکتور', confirmText: 'بله، صادر شود' })) && ask({ kind: 'invoice.fromProforma', dealId: d.id }, 'صدور فاکتور در صف قرار گرفت.')} className={`${BtnS} bg-emerald-700 text-white border-emerald-700`}><FileCheck2 className="w-3.5 h-3.5 inline ml-1" />صدور فاکتور</button>}
                {inv && can('receipt') && <button type="button" onClick={() => setReceiptFor(d)} className={`${BtnS} bg-sky-700 text-white border-sky-700`}><Banknote className="w-3.5 h-3.5 inline ml-1" />ثبت دریافتی</button>}
                {qt && !inv && can('quotation') && (
                  <>
                    <button type="button" disabled={wait('quotation.close')} onClick={() => ask({ kind: 'quotation.close', dealId: d.id }, 'بستن پیش‌فاکتور در صف قرار گرفت.')} className={`${BtnS} bg-white border-[#EBDBCE]`}>بستن پیش‌فاکتور</button>
                    <button type="button" disabled={wait('quotation.unclose')} onClick={() => ask({ kind: 'quotation.unclose', dealId: d.id }, 'بازکردن پیش‌فاکتور در صف قرار گرفت.')} className={`${BtnS} bg-white border-[#EBDBCE]`}>بازکردن</button>
                    <button type="button" disabled={wait('quotation.delete')} onClick={async () => (await askConfirm('پیش‌فاکتور از سپیدار حذف شود؟')) && ask({ kind: 'quotation.delete', dealId: d.id }, 'حذف پیش‌فاکتور در صف قرار گرفت.')} className={`${BtnS} bg-white border-rose-200 text-rose-700`}>حذف از سپیدار</button>
                  </>
                )}
              </Card>
            );
          })}
        </List>
      )}

      {tab === 'customers' && (
        <List empty="مشتری‌ای پیدا نشد.">
          {custRows.slice(0, 300).map((c) => {
            const l = linkMap.get('customer:' + c.id);
            const bal = l ? balances.get(l.sepidarId) : undefined;
            return (
              <Card
                key={c.id}
                icon={<Users className="w-5 h-5" />}
                tone="rose"
                title={
                  <button type="button" onClick={() => setFinanceFor({ id: c.id, name: c.name })} className="font-black underline decoration-dotted underline-offset-4 hover:text-rose-800 cursor-pointer text-right" title="وضعیت مالی مشتری در سپیدار">
                    {c.name}
                  </button>
                }
                sub={[c.company, c.phones?.[0] ? toPersianDigits(c.phones[0]) : ''].filter(Boolean).join(' · ')}
                badge={l ? ['در سپیدار', 'bg-emerald-50 text-emerald-800 border-emerald-200'] : ['هنوز در سپیدار نیست', 'bg-amber-50 text-amber-800 border-amber-200']}
                facts={[
                  ['شناسه سپیدار', l ? toPersianDigits(l.sepidarId) : '—'],
                  ['مانده حساب', bal ? fmt(bal.Remainder) : '—'],
                ]}
              >
                {can('customer') && (
                  <button type="button" disabled={busy.has('customer.send:' + c.id)} onClick={() => ask({ kind: 'customer.send', customerId: c.id }, 'درخواست برای سپیدار در صف قرار گرفت.')} className={`${BtnS} bg-white border-[#EBDBCE]`}>
                    {l ? 'بروزرسانی در سپیدار' : 'ثبت در سپیدار'}
                  </button>
                )}
              </Card>
            );
          })}
        </List>
      )}

      {tab === 'invoices' && (
        <>
          <InvoicesSummary rows={invoiceRows} />
          <List empty="فاکتوری دریافت نشده است. «بروزرسانی اطلاعات سپیدار» را بزنید.">
            {invoiceRows.slice(0, 300).map((i: any) => {
              const cname = customerOfSepidar.get(i.CustomerRef) || balances.get(i.CustomerRef)?.Title || 'مشتری سپیدار ' + toPersianDigits(i.CustomerRef);
              const hoormandCustomerId = [...st.links].find((l) => l.kind === 'customer' && l.sepidarId === i.CustomerRef)?.ref;
              const proforma = st.links.find((l) => l.kind === 'invoice' && l.sepidarId === (i.InvoiceID ?? i.ID));
              return (
                <Card
                  key={i.InvoiceID ?? i.ID}
                  icon={<FileCheck2 className="w-5 h-5" />}
                  tone="emerald"
                  title={
                    hoormandCustomerId ? (
                      <button type="button" onClick={() => setFinanceFor({ id: hoormandCustomerId, name: cname })} className="font-black underline decoration-dotted underline-offset-4 hover:text-emerald-800 cursor-pointer text-right" title="وضعیت مالی مشتری در سپیدار">
                        {cname}
                      </button>
                    ) : (
                      cname
                    )
                  }
                  sub={`فاکتور فروش ${toPersianDigits(i.Number)}${i.Date ? ' · ' + formatTaskDate(String(i.Date).slice(0, 10)) : ''}`}
                  badge={proforma ? ['از پیش‌فاکتور هورمند', 'bg-sky-50 text-sky-800 border-sky-200'] : null}
                  facts={[
                    ['مبلغ', i.Price != null ? fmt(i.Price) : '—'],
                    ['تخفیف', i.Discount ? fmt(i.Discount) : '—'],
                    ['مالیات', i.Tax ? fmt(i.Tax) : '—'],
                    ['خالص', fmt(i.NetPrice ?? i.Price)],
                  ]}
                />
              );
            })}
          </List>
        </>
      )}

      {tab === 'prices' && (
        <List empty="لیست قیمتی دریافت نشده است. «بروزرسانی اطلاعات سپیدار» را بزنید.">
          {(st.cache?.priceNotes?.items || []).filter((p: any) => matchesAll(p, q)).slice(0, 300).map((p: any, i: number) => (
            <Card
              key={i}
              icon={<Banknote className="w-5 h-5" />}
              tone="amber"
              title={p.title || 'کالا ' + toPersianDigits(p.itemRef)}
              sub={p.code ? `کد ${toPersianDigits(p.code)}` : ''}
              badge={null}
              facts={[
                ['قیمت', fmt(p.fee)],
                ['نوع فروش', toPersianDigits(p.saleTypeRef)],
              ]}
            />
          ))}
        </List>
      )}

      {tab === 'jobs' && (
        <List empty="درخواستی ثبت نشده است.">
          {st.jobs.map((j) => (
            <Card
              key={j.id}
              icon={<Send className="w-5 h-5" />}
              tone="sky"
              title={`${st.jobKinds[j.kind]?.Title || j.kind}${j.data.title ? ` · ${j.data.title}` : ''}`}
              sub={`${j.by} · ${timeOf(j.createdAt)}`}
              badge={[STATUS[j.status][0], STATUS[j.status][1]]}
              facts={j.result?.message ? [['نتیجه', j.result.message]] : []}
            >
              {j.status === 'pending' && (
                <button type="button" onClick={async () => (await askConfirm('این درخواست از صف برداشته شود؟', { tone: 'warning', title: 'لغو درخواست', confirmText: 'بله، لغو شود' })) && api.sepidarCancel(j.id).then(load).catch((e) => showToast(e.message))} className={`${BtnS} bg-white border-rose-200 text-rose-700`}>
                  <X className="w-3.5 h-3.5 inline ml-1" />
                  لغو درخواست
                </button>
              )}
            </Card>
          ))}
        </List>
      )}

      {pair && (
        <Modal title="کد اتصال برنامهٔ سپیدار" onClose={() => setPair(null)} onTop footer={<button type="button" onClick={() => setPair(null)} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">بستن</button>}>
          <div className="text-center space-y-3">
            <div dir="ltr" data-keep-digits className="inline-block px-6 py-3 rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] text-3xl font-black tracking-widest text-[#3A241F] select-all">{pair.code}</div>
            <p className="text-xs font-bold text-[#3A241F] leading-7">این کد را روی کامپیوتر سپیدار، وقتی فایل «۰-راه‌اندازی-خودکار» می‌پرسد، بنویسید. فقط ۱۵ دقیقه و فقط یک‌بار معتبر است.</p>
          </div>
        </Modal>
      )}

      {financeFor && (
        <Modal
          title={`وضعیت مالی: ${financeFor.name}`}
          onClose={() => setFinanceFor(null)}
          footer={
            <button type="button" onClick={() => setFinanceFor(null)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
              بستن
            </button>
          }
        >
          <CustomerFinance customerId={financeFor.id} />
        </Modal>
      )}
      {receiptFor && <ReceiptModal deal={receiptFor} accounts={st.cache?.bankAccounts?.items || []} onClose={() => setReceiptFor(null)} onAsk={async (b) => { await ask({ kind: 'receipt.add', dealId: receiptFor.id, ...b }, 'ثبت دریافتی در صف قرار گرفت.'); setReceiptFor(null); }} />}
    </div>
  );
};

const List: React.FC<{ empty: string; children: React.ReactNode }> = ({ empty, children }) => {
  const items = React.Children.toArray(children).flat();
  return items.length === 0 ? (
    <div className="bg-white rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">{empty}</div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{items}</div>
  );
};

const TONES: Record<string, string> = { rose: 'bg-rose-100 text-rose-700', emerald: 'bg-emerald-100 text-emerald-700', amber: 'bg-amber-100 text-amber-700', sky: 'bg-sky-100 text-sky-700' };

/** One box of the Sepidar page: the same look as the customer boxes of the CRM (icon, title, small line, numbers, actions at the bottom). */
const Card: React.FC<{
  icon: React.ReactNode;
  tone: keyof typeof TONES | string;
  title: React.ReactNode;
  sub?: string;
  badge?: [string, string] | null;
  facts?: [string, React.ReactNode][];
  children?: React.ReactNode;
}> = ({ icon, tone, title, sub, badge, facts = [], children }) => (
  <div className="rounded-2xl border border-[#EBDBCE] bg-white p-4 flex flex-col gap-3 shadow-2xs hover:shadow-md transition-shadow" data-sepidar-card>
    <div className="flex items-start gap-3">
      <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TONES[tone] || TONES.rose}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-black text-[#3A241F] leading-6 break-words">{title}</div>
        {sub ? <div className="text-[11px] font-bold text-[#8C6F66] leading-5 break-words">{sub}</div> : null}
      </div>
      {badge ? <span className={`text-[10px] font-black px-2 py-1 rounded-lg border whitespace-nowrap shrink-0 ${badge[1]}`}>{badge[0]}</span> : null}
    </div>
    {facts.length > 0 && (
      <div className="grid grid-cols-2 gap-2">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE]/70 px-3 py-1.5 min-w-0">
            <div className="text-[10px] font-bold text-[#8C6F66]">{k}</div>
            <div className="text-xs font-black text-[#3A241F] break-words">{v}</div>
          </div>
        ))}
      </div>
    )}
    {children ? <div className="flex flex-wrap gap-1.5 mt-auto pt-1">{children}</div> : null}
  </div>
);

/** The sales invoices that Sepidar issued: how many and their total (of what is shown). */
const InvoicesSummary: React.FC<{ rows: any[] }> = ({ rows }) => {
  const total = rows.reduce((s, i) => s + Number(i.NetPrice ?? i.Price ?? 0), 0);
  const tax = rows.reduce((s, i) => s + Number(i.Tax || 0), 0);
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {[
        ['تعداد فاکتور فروش', toPersianDigits(rows.length)],
        ['جمع خالص', fmt(total)],
        ['جمع مالیات', fmt(tax)],
      ].map(([t, v]) => (
        <div key={t} className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <div className="text-[10px] font-bold text-emerald-800">{t}</div>
          <div className="text-sm font-black text-emerald-900">{v}</div>
        </div>
      ))}
    </div>
  );
};

const ReceiptModal: React.FC<{ deal: any; accounts: any[]; onClose: () => void; onAsk: (b: Record<string, unknown>) => Promise<void> }> = ({ deal, accounts, onClose, onAsk }) => {
  const [acc, setAcc] = useState(accounts[0] ? String(accounts[0].BankAccountID) : '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string | undefined>(todayIso());
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await onAsk({ bankAccountId: acc, amount: amount.trim(), date, description: desc.trim() });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`ثبت دریافتی: ${deal.customerName}`} onClose={onClose} onTop footer={
      <>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
        <button type="button" disabled={busy || !acc || !amount.trim()} onClick={submit} className="px-5 py-2.5 rounded-xl bg-sky-700 text-white text-xs font-black cursor-pointer disabled:opacity-50">ثبت در سپیدار</button>
      </>
    }>
      {accounts.length === 0 ? (
        <div className="text-xs font-bold text-rose-700">فهرست حساب‌های بانکی هنوز از سپیدار نیامده است؛ «بروزرسانی اطلاعات سپیدار» را بزنید.</div>
      ) : (
        <>
          <div><span className={label}>حساب بانکی</span>
            <select value={acc} onChange={(e) => setAcc(e.target.value)} className={field}>
              {accounts.map((a) => <option key={a.BankAccountID} value={a.BankAccountID}>{a.DlTitle}</option>)}
            </select>
          </div>
          <div><span className={label}>مبلغ</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} /></div>
          <div><span className={label}>تاریخ دریافت</span><JalaliDateField value={date} onChange={setDate} /></div>
          <div><span className={label}>توضیح (اختیاری)</span><input value={desc} onChange={(e) => setDesc(e.target.value)} className={field} /></div>
        </>
      )}
    </Modal>
  );
};
