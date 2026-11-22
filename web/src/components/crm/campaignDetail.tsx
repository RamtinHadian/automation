import React from 'react';
import { Megaphone } from 'lucide-react';
import { Campaign, Customer } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { shortDay } from '../../lib/adminStats';
import { C, Columns } from '../admin/charts';
import { DetailPerson, DetailRecord, DetailSpec } from '../admin/ReportDetail';

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (iso?: string) => (iso ? isoDay(new Date(iso)) : '');
const dayFa = (iso?: string) => (iso ? shortDay(dayOf(iso)) : '');

/**
 * The page of one campaign, in the style of the management reports: how many customers it brought, a chart of the people added day by day,
 * how many customers each person brought, and the list of the customers themselves.
 */
export function campaignSpec(c: Campaign, customers: Customer[]): DetailSpec {
  const ids = new Set(c.customerIds || []);
  const list = customers.filter((x) => ids.has(x.id)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  // customers added per day (the days that have any, newest 30)
  const perDay = new Map<string, number>();
  list.forEach((x) => { const d = dayOf(x.createdAt); if (d) perDay.set(d, (perDay.get(d) || 0) + 1); });
  const days = [...perDay.keys()].sort().slice(-30);

  // who brought how many
  const by = new Map<string, number>();
  list.forEach((x) => by.set(x.ownerName || '—', (by.get(x.ownerName || '—') || 0) + 1));
  const people: DetailPerson[] = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  const records: DetailRecord[] = list.map((x) => ({
    id: x.id,
    title: x.name,
    sub: [x.company && x.company !== x.name ? x.company : '', x.phones?.[0] ? toPersianDigits(x.phones[0]) : '', x.source].filter(Boolean).join(' · '),
    person: x.ownerName,
    date: dayFa(x.createdAt),
  }));

  return {
    title: c.name,
    subtitle: [c.type, c.startDate ? `از ${shortDay(c.startDate.slice(0, 10))}` : '', c.endDate ? `تا ${shortDay(c.endDate.slice(0, 10))}` : ''].filter(Boolean).join(' · '),
    accent: '#7C3AED',
    icon: <Megaphone />,
    big: toPersianDigits(list.length),
    bigLabel: 'مشتری در این کمپین',
    chips: [
      { label: 'تعداد افراد آورنده', value: toPersianDigits(people.length) },
      { label: 'بیشترین در یک روز', value: toPersianDigits(Math.max(0, ...perDay.values())) },
    ],
    chart: days.length
      ? (h: number) => <Columns labels={days.map((d) => shortDay(d))} series={[{ name: 'مشتری جدید', color: C.violet, values: days.map((d) => perDay.get(d) || 0) }]} height={h} />
      : undefined,
    chartTitle: 'مشتریانی که به کمپین اضافه شدند، روز به روز',
    chartSub: days.length ? `${toPersianDigits(days.length)} روز` : undefined,
    people,
    peopleTitle: 'هر نفر چند مشتری آورده',
    countLabel: 'مشتری',
    records,
    recordsTitle: 'مشتریان این کمپین',
  };
}
