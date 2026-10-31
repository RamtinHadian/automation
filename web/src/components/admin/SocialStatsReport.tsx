import React, { useMemo, useState } from 'react';
import { Download, Globe2, Printer, Search, Users, X } from 'lucide-react';
import { Customer } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { downloadBlob } from '../../lib/proformaFile';
import { Modal } from '../crm/crmUi';
import { NETWORKS, SocialLogo, showAccount } from '../crm/SocialNetworks';

interface Person {
  id: string;
  name: string;
  owner: string;
  kind: string;
  accounts: string[];
  count: number;
}
type Row = { network: string; id: string; p: Person };

const kindOf = (c: Customer) => (c.contactType ? 'مخاطب (دفترتلفن)' : c.kind === 'COMPANY' ? 'شرکت' : c.kind === 'SHOP' ? 'فروشگاه' : 'شخص');
// only what was registered as a network counts (the web address that stands on the customer form is not a registration)
const entryOf = (c: Customer, id: string) => ({ on: false, accounts: [] as string[], count: 0, ...(c.social?.[id] || {}) });
const isMember = (c: Customer, id: string) => {
  const e = entryOf(c, id);
  return e.on || e.accounts.length > 0 || e.count > 0;
};
const personOf = (c: Customer, id: string): Person => {
  const e = entryOf(c, id);
  return { id: c.id, name: c.name, owner: c.ownerName || '', kind: kindOf(c), accounts: e.accounts, count: e.count };
};

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
// a mobile number is written as ="0912…" so a spreadsheet keeps its leading zero
const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
const csvAccount = (id: string, a: string) => (id !== 'website' && /^[0-9۰-۹+\s-]{9,}$/.test(a) ? `="${latin(a)}"` : csvCell(a));

const toCsv = (rows: Row[]) => {
  const head = ['مشتری', 'نوع', 'مسئول', 'شبکه', 'شناسه یا شماره', 'تعداد تعامل'].map(csvCell).join(',');
  const lines = rows.flatMap(({ network, id, p }) =>
    (p.accounts.length ? p.accounts : ['']).map((a, i) => [csvCell(p.name), csvCell(p.kind), csvCell(p.owner), csvCell(network), a ? csvAccount(id, a) : '""', String(i === 0 ? p.count : 0)].join(',')),
  );
  return '﻿' + [head, ...lines].join('\r\n');
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const printRows = (title: string, rows: Row[]) => {
  const w = window.open('', '_blank');
  if (!w) return;
  const body = rows
    .flatMap(({ network, id, p }) =>
      (p.accounts.length ? p.accounts : ['—']).map(
        (a, i) => `<tr><td>${esc(p.name)}</td><td>${esc(p.kind)}</td><td>${esc(p.owner)}</td><td>${esc(network)}</td><td dir="ltr" style="text-align:left">${esc(a === '—' ? a : showAccount(a, id))}</td><td>${i === 0 ? toPersianDigits(p.count) : ''}</td></tr>`,
      ),
    )
    .join('');
  w.document.write(
    `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Tahoma,sans-serif;padding:24px;color:#3A241F}h1{font-size:16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #D9CCC4;padding:6px 8px;text-align:right}th{background:#FAF5F1}</style></head><body><h1>${esc(title)}</h1><p style="font-size:11px;color:#8C6F66">تعداد ردیف: ${toPersianDigits(rows.length)}</p><table><thead><tr><th>مشتری</th><th>نوع</th><th>مسئول</th><th>شبکه</th><th>شناسه یا شماره</th><th>تعداد تعامل</th></tr></thead><tbody>${body}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`,
  );
  w.document.close();
};

/** «شبکه‌های اجتماعی مشتریان» in the reports: a line per network with the numbers; a click opens the people of that network (and a report to download or print). */
export const SocialStatsReport: React.FC<{ customers: Customer[] }> = ({ customers }) => {
  const [open, setOpen] = useState<string | null>(null); // a network id, or 'all'
  const [q, setQ] = useState('');

  const stats = useMemo(() => {
    const perNet = NETWORKS.map((n) => {
      const people = customers.filter((c) => isMember(c, n.id)).map((c) => personOf(c, n.id));
      return { net: n, people, accounts: people.reduce((t, p) => t + p.accounts.length, 0), interactions: people.reduce((t, p) => t + p.count, 0) };
    });
    const any = customers.filter((c) => NETWORKS.some((n) => isMember(c, n.id)));
    const multi = any.filter((c) => NETWORKS.filter((n) => isMember(c, n.id)).length >= 2).length;
    return { perNet, any: any.length, multi, interactions: perNet.reduce((t, x) => t + x.interactions, 0) };
  }, [customers]);

  const max = Math.max(1, ...stats.perNet.map((x) => x.people.length));
  const shown = open === 'all' ? null : stats.perNet.find((x) => x.net.id === open) || null;
  const allRows = useMemo<Row[]>(() => stats.perNet.flatMap((x) => x.people.map((p) => ({ network: x.net.name, id: x.net.id, p }))), [stats]);
  const baseRows: Row[] = shown ? shown.people.map((p) => ({ network: shown.net.name, id: shown.net.id, p })) : allRows;
  const needle = q.trim().toLowerCase();
  const sortedRows = baseRows
    .filter(({ p, network }) => !needle || `${p.name} ${p.owner} ${network} ${p.accounts.join(' ')}`.toLowerCase().includes(needle))
    .sort((a, b) => b.p.count - a.p.count || a.p.name.localeCompare(b.p.name, 'fa'));
  const title = shown ? `مشتریان ${shown.net.name}` : 'همهٔ شبکه‌های اجتماعی مشتریان';
  const total = customers.length;
  const pct = (n: number) => (total ? toPersianDigits(Math.round((n / total) * 100)) + '٪' : '—');
  const cards: [string, string, string][] = [
    ['مشتری دارای شبکه', toPersianDigits(stats.any), `${pct(stats.any)} از ${toPersianDigits(total)} مشتری`],
    ['حداقل در دو شبکه', toPersianDigits(stats.multi), stats.any ? `${toPersianDigits(Math.round((stats.multi / stats.any) * 100))}٪ از دارندگان شبکه` : '—'],
    ['بدون هیچ شبکه', toPersianDigits(total - stats.any), `${pct(total - stats.any)} از مشتریان`],
    ['کل تعامل‌های ثبت‌شده', toPersianDigits(stats.interactions), 'مجموع شمارنده‌ها'],
  ];

  return (
    <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-4" data-social-stats>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center"><Globe2 className="w-5 h-5" /></span>
          <div>
            <h4 className="font-black text-[13px] text-[#3A241F]">شبکه‌های اجتماعی مشتریان</h4>
            <p className="text-[11px] text-[#8C6F66] mt-0.5">هر شبکه را بزنید تا فهرست افرادش را ببینید و گزارش بگیرید.</p>
          </div>
        </div>
        <button type="button" onClick={() => { setQ(''); setOpen('all'); }} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer" data-social-all>
          <Download className="w-3.5 h-3.5" />
          گزارش همهٔ شبکه‌ها
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map(([k, v, sub]) => (
          <div key={k} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] px-3.5 py-3">
            <div className="text-[11px] font-black text-[#8C6F66]">{k}</div>
            <div className="text-xl font-black text-[#3A241F] mt-0.5">{v}</div>
            <div className="text-[10px] font-bold text-[#8C6F66]">{sub}</div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5" data-social-list>
        {[...stats.perNet].sort((a, b) => b.people.length - a.people.length).map((x) => (
          <button key={x.net.id} type="button" onClick={() => { setQ(''); setOpen(x.net.id); }} className={`w-full flex items-center gap-3 rounded-2xl border border-[#EBDBCE] px-3.5 py-2.5 cursor-pointer text-right transition-colors ${x.people.length ? 'bg-white hover:bg-violet-50' : 'bg-[#FAF5F1] opacity-60 hover:opacity-100'}`} data-social-net={x.net.id}>
            <SocialLogo id={x.net.id} size={26} />
            <span className="w-24 shrink-0 text-xs font-black text-[#3A241F]">{x.net.name}</span>
            <span className="flex-1 min-w-0">
              <span className="block h-2.5 rounded-full bg-[#FAF5F1] overflow-hidden"><span className="block h-full rounded-full bg-gradient-to-l from-violet-600 to-violet-400" style={{ width: `${(x.people.length / max) * 100}%` }} /></span>
            </span>
            <span className="w-14 text-center text-sm font-black text-violet-800">{toPersianDigits(x.people.length)}</span>
            <span className="hidden sm:block w-40 text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(x.accounts)} شناسه · {toPersianDigits(x.interactions)} تعامل</span>
            <span className="text-[11px] font-black text-violet-700 whitespace-nowrap">فهرست افراد ←</span>
          </button>
        ))}
      </div>

      {open && (
        <Modal
          wide
          onTop="max"
          title={title}
          onClose={() => setOpen(null)}
          footer={
            <>
              <span className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(sortedRows.length)} ردیف</span>
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => printRows(title, sortedRows)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer" data-social-print>
                  <Printer className="w-4 h-4" />
                  چاپ
                </button>
                <button type="button" onClick={() => downloadBlob(new Blob([toCsv(sortedRows)], { type: 'text/csv;charset=utf-8' }), `${shown ? 'social-' + shown.net.id : 'social-all'}.csv`)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer" data-social-csv>
                  <Download className="w-4 h-4" />
                  دریافت گزارش (اکسل)
                </button>
              </span>
            </>
          }
        >
          <div className="space-y-3" data-social-people>
            <div className="relative">
              <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در نام، مسئول، شناسه…" className="w-full pr-9 pl-9 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-300" />
              {q && <button type="button" onClick={() => setQ('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C6F66] cursor-pointer" aria-label="پاک کردن"><X className="w-4 h-4" /></button>}
            </div>
            {sortedRows.length === 0 ? (
              <div className="text-center text-xs font-bold text-[#8C6F66] py-8">موردی نیست.</div>
            ) : (
              <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
                <div className="grid grid-cols-[1.4fr_0.9fr_1fr_1.6fr_0.6fr] gap-2 bg-[#FAF5F1] px-3.5 py-2 text-[10px] font-black text-[#8C6F66]">
                  <span>مشتری</span><span>{shown ? 'نوع' : 'شبکه'}</span><span>مسئول</span><span>شناسه یا شماره</span><span className="text-center">تعامل</span>
                </div>
                <div className="max-h-[52vh] overflow-y-auto divide-y divide-[#F3E8DF]">
                  {sortedRows.map(({ id, network, p }) => (
                    <div key={id + p.id} className="grid grid-cols-[1.4fr_0.9fr_1fr_1.6fr_0.6fr] gap-2 px-3.5 py-2.5 items-center text-[11px] font-bold text-[#3A241F]" data-social-person>
                      <span className="truncate flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-[#C98B6A] shrink-0" /><span className="truncate">{p.name}</span></span>
                      <span className="flex items-center gap-1.5 truncate">{shown ? p.kind : <><SocialLogo id={id} size={16} />{network}</>}</span>
                      <span className="truncate text-[#6b5048]">{p.owner || '—'}</span>
                      <span className="flex flex-col gap-0.5" dir="ltr">{p.accounts.length ? p.accounts.map((a) => <span key={a} className="text-left truncate">{showAccount(a, id)}</span>) : <span className="text-[#8C6F66]">—</span>}</span>
                      <span className="text-center font-black text-violet-800">{toPersianDigits(p.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
};
