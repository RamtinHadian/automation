import React from 'react';
import { CheckCircle2, Eye } from 'lucide-react';
import { InternalLetterEvent } from '../../lib/api';
import { formatCurrentJalaliDateTime } from '../../lib/jalali';

const WAY: Record<string, { t: string; c: string }> = {
  CREATED: { t: 'نویسنده', c: '#6E1B1B' },
  SENT: { t: 'ارسال', c: '#B45309' },
  FORWARDED: { t: 'ارسال به بالا', c: '#B45309' },
  DELIVERED: { t: 'به مقصد رسید', c: '#059669' },
  RETURNED: { t: 'برگشت', c: '#E11D48' },
  REFERRED: { t: 'ارجاع', c: '#7C3AED' },
};
const MARK: Record<string, string> = { READ: 'خواند', NOTE: 'یادداشت گذاشت', REPLY: 'پاسخ داد', ACTED: 'اقدام را انجام‌شده اعلام کرد', EDITED: 'اصلاح کرد', ARCHIVED: 'بایگانی کرد', UNARCHIVED: 'از بایگانی درآورد' };

interface TreeNode {
  key: number;
  personId: string;
  name: string;
  via: string;
  note?: string;
  paraph?: string;
  at: string;
  marks: InternalLetterEvent[];
  kids: TreeNode[];
}

/** The history as a tree: the writer is the root, every sending, forwarding, referral or return is a branch to the next person, and what each person did (read, note, answer, done) hangs under them. */
export function buildTree(history: InternalLetterEvent[]): TreeNode | null {
  let root: TreeNode | null = null;
  const last = new Map<string, TreeNode>();
  let k = 0;
  const rootOf = (e: InternalLetterEvent): TreeNode => ({ key: k++, personId: e.byId, name: e.byName, via: 'CREATED', at: e.at, marks: [], kids: [] });
  for (const e of history) {
    if (e.action === 'CREATED') {
      root = rootOf(e);
      last.set(e.byId, root);
      continue;
    }
    if (!root) {
      root = rootOf(e);
      last.set(e.byId, root);
    }
    if (e.toId && WAY[e.action]) {
      const parent = last.get(e.byId) || root;
      const child: TreeNode = { key: k++, personId: e.toId, name: e.toName || '', via: e.action, note: e.note, paraph: e.paraph, at: e.at, marks: [], kids: [] };
      parent.kids.push(child);
      last.set(e.toId, child);
    } else {
      (last.get(e.byId) || root).marks.push(e);
    }
  }
  return root;
}

const LINE = '#D9C3B5';

const Branch: React.FC<{ n: TreeNode }> = ({ n }) => {
  const w = WAY[n.via] || WAY.CREATED;
  return (
    <li className="relative">
      <div className="rounded-2xl border bg-white p-2.5 shadow-sm" style={{ borderColor: w.c + '66' }}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-black rounded-full px-2 py-0.5 text-white" style={{ background: w.c }}>{w.t}</span>
          <span className="text-[12px] font-black text-[#3A241F]">{n.name}</span>
          {n.via === 'DELIVERED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
        </div>
        {n.note && <div className="mt-1 text-[11px] leading-6 text-[#6B4F47] bg-[#FAF5F1] rounded-xl px-2 py-1 whitespace-pre-wrap">{n.note}</div>}
        {n.paraph && <img src={n.paraph} alt="پاراف" className="mt-1 max-h-16 max-w-full object-contain mix-blend-multiply" />}
        <div className="text-[10px] font-bold text-[#A8928B] mt-0.5">{formatCurrentJalaliDateTime(new Date(n.at))}</div>
        {n.marks.length > 0 && (
          <ul className="mt-1.5 space-y-1 border-t border-dashed border-[#EBDBCE] pt-1.5">
            {n.marks.map((m, i) => (
              <li key={i} className="text-[10.5px] font-bold text-[#6B4F47] leading-5">
                {m.action === 'READ' && <Eye className="inline w-3 h-3 ml-1 text-[#8C6F66]" />}
                {MARK[m.action] || m.action} <span className="text-[#A8928B]">· {formatCurrentJalaliDateTime(new Date(m.at))}</span>
                {m.note && <div className="mt-0.5 bg-[#FAF5F1] rounded-lg px-2 py-1 whitespace-pre-wrap font-medium">{m.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
      {n.kids.length > 0 && (
        <ul className="mt-2 mr-3 space-y-2 border-r-2 pr-3" style={{ borderColor: LINE }}>
          {n.kids.map((c) => (
            <div key={c.key} className="relative">
              <span className="absolute -right-3 top-5 w-3 border-t-2" style={{ borderColor: LINE }} />
              <Branch n={c} />
            </div>
          ))}
        </ul>
      )}
    </li>
  );
};

export const InternalHistoryTree: React.FC<{ history: InternalLetterEvent[] }> = ({ history }) => {
  const root = buildTree(history);
  if (!root) return <div className="text-[11px] font-bold text-[#8C6F66]">هنوز تاریخچه‌ای نیست.</div>;
  return (
    <ul className="space-y-2" data-ic-tree>
      <Branch n={root} />
    </ul>
  );
};
