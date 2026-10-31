import React from 'react';
import { Link2 } from 'lucide-react';
import { Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';

/** Opportunities written together (Enter in the title of the form) share a group: every one of them wears the same colour. */
const COLORS = [
  { bar: '#7C3AED', chip: 'bg-violet-100 text-violet-800 border-violet-300' },
  { bar: '#0E9AC7', chip: 'bg-sky-100 text-sky-800 border-sky-300' },
  { bar: '#059669', chip: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { bar: '#D97706', chip: 'bg-amber-100 text-amber-800 border-amber-300' },
  { bar: '#DB2777', chip: 'bg-pink-100 text-pink-800 border-pink-300' },
  { bar: '#4F46E5', chip: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
];
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** inside a group: by the written order (groupSeq), then by creation */
export const bySeq = (a: Deal, b: Deal) => (a.groupSeq ?? 1e9) - (b.groupSeq ?? 1e9) || (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id);

export interface DealGroup { size: number; index: number; color: (typeof COLORS)[number]; members: Deal[] }

/** The group of a deal (null when it stands alone or the others are no longer there). */
export const dealGroup = (all: Deal[], d: Deal): DealGroup | null => {
  if (!d.groupId) return null;
  const members = all.filter((x) => x.groupId === d.groupId).sort(bySeq);
  if (members.length < 2) return null;
  return { size: members.length, index: members.findIndex((x) => x.id === d.id) + 1, color: COLORS[hash(d.groupId) % COLORS.length], members };
};

/** «پیوسته ۲ از ۳» chip. */
export const LinkedChip: React.FC<{ group: DealGroup }> = ({ group }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-black rounded-full border px-2 py-0.5 w-fit ${group.color.chip}`} title="این فرصت همراه فرصت‌های دیگری ثبت شده است" data-deal-linked>
    <Link2 className="w-3 h-3" />
    پیوسته {toPersianDigits(group.index)} از {toPersianDigits(group.size)}
  </span>
);

/** An amount on one line with its own small label of the money («تومان» / «ریال»): the number reads left to right and never breaks. */
export const MoneyTag: React.FC<{ amount: number; tone?: 'violet' | 'plain'; className?: string }> = ({ amount, tone = 'violet', className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`} data-money>
    <b dir="ltr" className={`text-[12px] font-black tracking-wide ${tone === 'violet' ? 'text-violet-800' : 'text-[#3A241F]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{formatMoney(amount)}</b>
    <i className={`not-italic text-[9px] font-black rounded-md px-1.5 py-0.5 border ${tone === 'violet' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-[#FAF5F1] text-[#8C6F66] border-[#EBDBCE]'}`}>{unitName()}</i>
  </span>
);
