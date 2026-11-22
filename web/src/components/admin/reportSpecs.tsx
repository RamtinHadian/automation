import React from 'react';
import { CalendarCheck, ClipboardCheck, FileSignature, Mail, PieChart, Phone, Send, UserPlus, Banknote, Users } from 'lucide-react';
import { Customer, Deal, FileTransfer, Task, User } from '../../types';
import { VoipStatRow } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { Stats, STAGE_LABEL, shortDay } from '../../lib/adminStats';
import { toDisplay, unitName } from '../../lib/money';
import { C, compact, Columns, Donut, HBars, TrendChart } from './charts';
import { DetailPerson, DetailRecord, DetailSpec } from './ReportDetail';

const DAY = 86400000;
const money = (n: number) => compact(toDisplay(n));
const fa = (n: number) => toPersianDigits(n);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayFa = (iso?: string) => (iso ? shortDay(isoDay(new Date(iso))) : '');

export interface SpecContext {
  staff: User[];
  transfers: FileTransfer[];
  tasks: Task[];
  customers: Customer[];
  deals: Deal[];
  s: Stats;
  range: number;
  rangeLabel: string;
  callDays: VoipStatRow[];
  seesTotals: boolean;
}

export type DetailId = 'letters' | 'files' | 'tasksDone' | 'overdue' | 'pipeline' | 'newCustomers' | 'missedCalls' | 'taskStatus' | 'workload' | 'sources' | 'letterStatus' | 'trend' | 'calls';

const people = (m: Map<string, number>, extra?: Map<string, string>): DetailPerson[] =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, valueText: extra?.get(name) }));
const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) || 0) + by);

/** What each number and chart of the reports opens into: the figure, a bigger chart, the same by employee, and the items behind it. */
export function buildDetail(id: DetailId, c: SpecContext): DetailSpec | null {
  const { s, k, from } = { s: c.s, k: c.s.kpi, from: Date.now() - c.range * DAY };
  const name = new Map(c.staff.map((u) => [u.id, u.fullName]));
  const inR = (iso?: string) => !!iso && new Date(iso).getTime() >= from;
  const letters = c.transfers.filter((t) => t.isOfficialLetter);
  const files = c.transfers.filter((t) => !t.isOfficialLetter);
  const labels = s.days.map(shortDay);
  const num = (t: FileTransfer) => (t.letterNumber ? `نامهٔ ${toPersianDigits(t.letterNumber)}` : 'نامه');
  const fileTitle = (t: FileTransfer) => (t.fileName || '').replace(/^نامه_/, '').replace(/_/g, ' ');
  const today = isoDay(new Date());

  switch (id) {
    case 'letters': {
      const signed = letters.filter((t) => t.signatureStatus === 'SIGNED' && inR(t.signedAt));
      const pending = letters.filter((t) => t.signatureStatus === 'PENDING_SIGNATURE');
      const by = new Map<string, number>();
      signed.forEach((t) => bump(by, t.sender.fullName));
      const recs: DetailRecord[] = [
        ...pending.map((t) => ({ id: 'p' + t.id, title: `${num(t)} · ${fileTitle(t)}`, person: t.sender.fullName, date: dayFa(t.sentAt), tag: 'در انتظار امضا', tone: 'warn' as const })),
        ...signed.map((t) => ({ id: 's' + t.id, title: `${num(t)} · ${fileTitle(t)}`, person: t.sender.fullName, date: dayFa(t.signedAt), tag: 'امضا شد', tone: 'good' as const })),
      ];
      return {
        title: 'نامه‌های امضاشده', subtitle: `نامه‌های رسمی که در ${c.rangeLabel} اخیر امضا شد و نامه‌های منتظر امضا`, accent: '#6D28D9', icon: <FileSignature />,
        big: fa(k.lettersSigned), bigLabel: `امضاشده (${c.rangeLabel})`,
        chips: [{ label: 'در انتظار امضا', value: fa(k.lettersPending) }, { label: 'ردشده', value: fa(k.lettersRejected) }, ...(k.avgSignHours !== null ? [{ label: 'میانگین زمان امضا', value: `${fa(Math.round(k.avgSignHours))} ساعت` }] : [])],
        chart: (h: number) => <TrendChart labels={labels} series={[{ name: 'نامهٔ رسمی', color: C.orange, values: s.transfersPerDay.letters }]} height={h} />, chartTitle: 'نامه در طول زمان', chartSub: `تعداد ارسال در هر روز (${c.rangeLabel} اخیر)`,
        people: people(by), peopleTitle: 'هر کارمند چند نامهٔ امضاشده داشته', countLabel: 'نامه', records: recs, recordsTitle: 'نامه‌ها',
      };
    }
    case 'files': {
      const list = files.filter((t) => inR(t.sentAt));
      const by = new Map<string, number>();
      list.forEach((t) => bump(by, t.sender.fullName));
      return {
        title: 'فایل‌های تبادل‌شده', subtitle: `فایل‌هایی که در ${c.rangeLabel} اخیر بین همکاران رد و بدل شد`, accent: '#2563EB', icon: <Send />,
        big: fa(k.filesSent), bigLabel: `فایل (${c.rangeLabel})`,
        chart: (h: number) => <TrendChart labels={labels} series={[{ name: 'فایل', color: C.blue, values: s.transfersPerDay.files }]} height={h} />, chartTitle: 'فایل در طول زمان', chartSub: 'تعداد ارسال در هر روز',
        people: people(by), peopleTitle: 'هر کارمند چند فایل فرستاده', countLabel: 'فایل',
        records: list.map((t) => ({ id: t.id, title: t.fileName, sub: `برای ${t.recipients.map((r) => r.fullName).join('، ') || '—'}${t.fileSize ? ' · ' + t.fileSize : ''}`, person: t.sender.fullName, date: dayFa(t.sentAt) })), recordsTitle: 'فایل‌ها',
      };
    }
    case 'tasksDone': {
      const done = c.tasks.filter((t) => t.status === 'DONE' && inR(t.completedAt || t.updatedAt));
      const by = new Map<string, number>();
      const recs: DetailRecord[] = [];
      done.forEach((t) => (t.assigneeIds.length ? t.assigneeIds : ['']).forEach((a) => {
        const n = name.get(a) || 'بدون مسئول';
        bump(by, n);
        recs.push({ id: `${t.id}-${a}`, title: t.title, sub: `ایجاد: ${t.creatorName}`, person: n, date: dayFa(t.completedAt || t.updatedAt), tag: 'انجام شد', tone: 'good' });
      }));
      return {
        title: 'وظیفه‌های انجام‌شده', subtitle: `وظیفه‌هایی که در ${c.rangeLabel} اخیر تمام شد`, accent: '#0891B2', icon: <ClipboardCheck />,
        big: fa(k.tasksDone), bigLabel: `انجام‌شده (${c.rangeLabel})`,
        chips: [{ label: 'وظیفهٔ تازه', value: fa(k.tasksCreated) }, ...(k.completionRate !== null ? [{ label: 'نسبت انجام', value: `${fa(k.completionRate)}٪` }] : [])],
        chart: <HBars rows={people(by).slice(0, 10).map((p) => ({ label: p.name, segments: [{ value: p.count, color: C.aqua }] }))} empty="وظیفهٔ انجام‌شده‌ای نیست." />, chartTitle: 'هر نفر چند وظیفه انجام داده',
        people: people(by), peopleTitle: 'انجام‌شده‌ها به تفکیک کارمند', countLabel: 'وظیفه', records: recs, recordsTitle: 'وظیفه‌ها',
      };
    }
    case 'overdue': {
      const late = c.tasks.filter((t) => t.status !== 'DONE' && t.dueDate && t.dueDate < today);
      const by = new Map<string, number>();
      const recs: DetailRecord[] = [];
      late.forEach((t) => (t.assigneeIds.length ? t.assigneeIds : ['']).forEach((a) => {
        const n = name.get(a) || 'بدون مسئول';
        const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(t.dueDate!)) / DAY));
        bump(by, n);
        recs.push({ id: `${t.id}-${a}`, title: t.title, sub: `موعد: ${dayFa(t.dueDate)}`, person: n, tag: `${toPersianDigits(days)} روز معوق`, tone: 'bad' });
      }));
      recs.sort((a, b) => parseInt(String(b.tag).replace(/\D/g, ''), 10) - parseInt(String(a.tag).replace(/\D/g, ''), 10));
      return {
        title: 'وظیفه‌های معوق', subtitle: 'وظیفه‌های بازی که موعدشان گذشته است', accent: '#DC2626', icon: <CalendarCheck />,
        big: fa(k.tasksOverdue), bigLabel: 'معوق (الان)', chips: [{ label: 'وظیفهٔ باز', value: fa(k.tasksOpen) }],
        chart: <HBars rows={people(by).slice(0, 10).map((p) => ({ label: p.name, segments: [{ value: p.count, color: C.red }] }))} empty="وظیفهٔ معوقی نیست." />, chartTitle: 'معوق‌ها پیش چه کسانی است',
        people: people(by), peopleTitle: 'معوق‌ها به تفکیک کارمند', countLabel: 'معوق', records: recs, recordsTitle: 'وظیفه‌های معوق',
      };
    }
    case 'pipeline': {
      if (!c.seesTotals) return null;
      const open = c.deals.filter((d) => ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'].includes(d.stage));
      const by = new Map<string, number>();
      const sum = new Map<string, number>();
      open.forEach((d) => { bump(by, d.ownerName || '—'); bump(sum, d.ownerName || '—', d.amount || 0); });
      const txt = new Map([...sum.entries()].map(([n, v]) => [n, `${money(v)} ${unitName()}`]));
      return {
        title: 'فرصت‌های باز فروش', subtitle: 'فرصت‌هایی که هنوز نه فروش شده‌اند و نه از دست رفته‌اند', accent: '#EA580C', icon: <Banknote />,
        big: money(k.pipelineValue), bigLabel: `ارزش فرصت‌های باز (${unitName()})`, chips: [{ label: 'تعداد', value: fa(k.openDeals) }],
        chart: <Donut centerLabel="فرصت" data={s.funnel.slice(0, 4).map((f, i) => ({ label: f.label, value: f.count, color: [C.blue, C.aqua, C.violet, C.orange][i] }))} />, chartTitle: 'فرصت‌های باز در هر مرحله',
        people: people(by, txt), peopleTitle: 'فرصت‌های باز هر فروشنده', countLabel: 'فرصت', valueLabel: unitName(),
        records: open.sort((a, b) => (b.amount || 0) - (a.amount || 0)).map((d) => ({ id: d.id, title: d.title, sub: d.customerName, person: d.ownerName, tag: STAGE_LABEL[d.stage], tone: 'info' as const, value: `${money(d.amount || 0)} ${unitName()}` })), recordsTitle: 'فرصت‌ها',
      };
    }
    case 'newCustomers': {
      const list = c.customers.filter((x) => !x.contactType && inR(x.createdAt));
      const by = new Map<string, number>();
      const src = new Map<string, number>();
      list.forEach((x) => { bump(by, x.ownerName || '—'); bump(src, x.source || 'نامشخص'); });
      return {
        title: 'مشتریان جدید', subtitle: `مشتریانی که در ${c.rangeLabel} اخیر ثبت شدند`, accent: '#DB2777', icon: <UserPlus />,
        big: fa(k.newCustomers), bigLabel: `مشتری جدید (${c.rangeLabel})`, chips: [{ label: 'پیش‌فاکتور', value: fa(k.proformas) }],
        chart: <Donut centerLabel="مشتری" data={[...src.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value], i) => ({ label, value, color: [C.blue, C.orange, C.aqua, C.violet, C.magenta, C.yellow][i] }))} />, chartTitle: 'از کجا آمده‌اند؟',
        people: people(by), peopleTitle: 'هر فروشنده چند مشتری آورده', countLabel: 'مشتری',
        records: list.map((x) => ({ id: x.id, title: x.name, sub: [x.company, x.source].filter(Boolean).join(' · '), person: x.ownerName, date: dayFa(x.createdAt) })), recordsTitle: 'مشتریان',
      };
    }
    case 'missedCalls':
    case 'calls': {
      const rows = c.callDays;
      const missed = rows.reduce((a, d) => a + Math.max(0, d.total - d.answered), 0);
      const total = rows.reduce((a, d) => a + d.total, 0);
      return {
        title: id === 'calls' ? 'تماس‌های تلفنی' : 'تماس‌های بی‌پاسخ', subtitle: '۷ روز اخیر، از تلفن شرکت', accent: '#CA8A04', icon: <Phone />,
        big: fa(missed), bigLabel: 'بی‌پاسخ', chips: [{ label: 'کل تماس', value: fa(total) }, { label: 'پاسخ داده شد', value: fa(total - missed) }, { label: 'درصد پاسخ', value: `${fa(total ? Math.round(((total - missed) / total) * 100) : 0)}٪` }],
        chart: (h: number) => rows.length ? <Columns stacked labels={[...rows].reverse().map((d) => shortDay(d.key))} series={[{ name: 'پاسخ داده شد', color: C.aqua, values: [...rows].reverse().map((d) => d.answered) }, { name: 'بی‌پاسخ', color: C.red, values: [...rows].reverse().map((d) => Math.max(0, d.total - d.answered)) }]} height={h} /> : <div className="py-10 text-center text-xs font-bold text-gray-400">هنوز تماسی ثبت نشده است.</div>, chartTitle: 'تماس‌ها در هر روز',
        records: rows.map((d) => ({ id: d.key, title: shortDay(d.key), sub: `${toPersianDigits(d.total)} تماس · ${toPersianDigits(d.answered)} پاسخ داده شد`, tag: `${toPersianDigits(Math.max(0, d.total - d.answered))} بی‌پاسخ`, tone: d.total - d.answered > 0 ? ('bad' as const) : ('good' as const) })), recordsTitle: 'روزها',
      };
    }
    case 'taskStatus':
    case 'workload': {
      const status = new Map(s.taskStatus.map((t) => [t.id, t.label]));
      const open = c.tasks.filter((t) => t.status !== 'DONE');
      const list = id === 'workload' ? open : c.tasks;
      const by = new Map<string, number>();
      const recs: DetailRecord[] = [];
      list.forEach((t) => (t.assigneeIds.length ? t.assigneeIds : ['']).forEach((a) => {
        const n = name.get(a) || 'بدون مسئول';
        const late = t.status !== 'DONE' && !!t.dueDate && t.dueDate < today;
        bump(by, n);
        recs.push({ id: `${t.id}-${a}`, title: t.title, sub: t.dueDate ? `موعد: ${dayFa(t.dueDate)}` : undefined, person: n, tag: late ? 'معوق' : status.get(t.status) || t.status, tone: late ? 'bad' : t.status === 'DONE' ? 'good' : 'info' });
      }));
      return {
        title: id === 'workload' ? 'بار کاری همکاران' : 'وضعیت وظایف', subtitle: id === 'workload' ? 'وظیفه‌های بازِ هر نفر' : 'همهٔ وظیفه‌های ثبت‌شده', accent: '#0284C7', icon: <ClipboardCheck />,
        big: fa(list.length), bigLabel: id === 'workload' ? 'وظیفهٔ باز' : 'وظیفه', chips: [{ label: 'معوق', value: fa(k.tasksOverdue) }, { label: 'انجام‌شده', value: fa(c.tasks.filter((t) => t.status === 'DONE').length) }],
        chart: <Donut centerLabel="وظیفه" data={s.taskStatus.map((t, i) => ({ label: t.label, value: t.value, color: [C.yellow, C.blue, C.violet, C.aqua][i] }))} />, chartTitle: 'وضعیت وظایف',
        people: people(by), peopleTitle: 'وظیفه‌ها به تفکیک کارمند', countLabel: 'وظیفه', records: recs, recordsTitle: 'وظیفه‌ها',
      };
    }
    case 'sources': {
      const list = c.customers.filter((x) => !x.contactType);
      const by = new Map<string, number>();
      list.forEach((x) => bump(by, x.ownerName || '—'));
      return {
        title: 'منبع آشنایی مشتریان', subtitle: 'مشتری‌ها از چه راهی با شرکت آشنا شده‌اند', accent: '#7C3AED', icon: <PieChart />,
        big: fa(list.length), bigLabel: 'مشتری',
        chart: <Donut centerLabel="مشتری" data={s.sources.map((x, i) => ({ label: x.label, value: x.value, color: [C.blue, C.orange, C.aqua, C.violet, C.magenta, C.yellow][i] }))} />, chartTitle: 'سهم هر منبع',
        people: people(by), peopleTitle: 'مشتریان هر فروشنده', countLabel: 'مشتری',
        records: list.map((x) => ({ id: x.id, title: x.name, sub: x.company, person: x.ownerName, tag: x.source || 'نامشخص', tone: 'info' as const, date: dayFa(x.createdAt) })), recordsTitle: 'مشتریان',
      };
    }
    case 'letterStatus': {
      const by = new Map<string, number>();
      letters.forEach((t) => bump(by, t.sender.fullName));
      const label = (t: FileTransfer) => (t.signatureStatus === 'SIGNED' ? 'امضا شد' : t.signatureStatus === 'REJECTED' ? 'رد شد' : 'در انتظار امضا');
      return {
        title: 'وضعیت نامه‌های رسمی', subtitle: 'همهٔ نامه‌های رسمی', accent: '#7C3AED', icon: <Mail />,
        big: fa(letters.length), bigLabel: 'نامه',
        chart: <Donut centerLabel="نامه" data={[{ ...s.letterStatus[0], color: C.aqua }, { ...s.letterStatus[1], color: C.yellow }, { ...s.letterStatus[2], color: C.red }]} />, chartTitle: 'نامه‌ها به تفکیک وضعیت',
        people: people(by), peopleTitle: 'نامه‌های هر کارمند', countLabel: 'نامه',
        records: letters.map((t) => ({ id: t.id, title: `${num(t)} · ${fileTitle(t)}`, person: t.sender.fullName, date: dayFa(t.signedAt || t.sentAt), tag: label(t), tone: t.signatureStatus === 'SIGNED' ? ('good' as const) : t.signatureStatus === 'REJECTED' ? ('bad' as const) : ('warn' as const) })), recordsTitle: 'نامه‌ها',
      };
    }
    case 'trend': {
      const list = c.transfers.filter((t) => inR(t.sentAt));
      const by = new Map<string, number>();
      list.forEach((t) => bump(by, t.sender.fullName));
      return {
        title: 'فایل و نامه در طول زمان', subtitle: `تعداد ارسال در هر روز (${c.rangeLabel} اخیر)`, accent: '#EA580C', icon: <Users />,
        big: fa(list.length), bigLabel: `ارسال (${c.rangeLabel})`, chips: [{ label: 'فایل', value: fa(k.filesSent) }, { label: 'نامه', value: fa(list.filter((t) => t.isOfficialLetter).length) }],
        chart: (h: number) => <TrendChart labels={labels} series={[{ name: 'فایل', color: C.blue, values: s.transfersPerDay.files }, { name: 'نامهٔ رسمی', color: C.orange, values: s.transfersPerDay.letters }]} height={h} />, chartTitle: 'ارسال در هر روز',
        people: people(by), peopleTitle: 'هر کارمند چند ارسال داشته', countLabel: 'ارسال',
        records: list.map((t) => ({ id: t.id, title: t.isOfficialLetter ? `${num(t)} · ${fileTitle(t)}` : t.fileName, person: t.sender.fullName, date: dayFa(t.sentAt), tag: t.isOfficialLetter ? 'نامه' : 'فایل', tone: t.isOfficialLetter ? ('warn' as const) : ('info' as const) })), recordsTitle: 'ارسال‌ها',
      };
    }
  }
  return null;
}
