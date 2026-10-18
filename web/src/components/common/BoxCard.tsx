import React from 'react';

const TONES: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
};

/** The grid the boxes sit in: three columns on a computer, two on a tablet, one on a phone (the same as the customer boxes of the CRM). */
export const BoxGrid: React.FC<{ empty: string; children: React.ReactNode }> = ({ empty, children }) => {
  const items = React.Children.toArray(children).flat();
  return items.length === 0 ? (
    <div className="bg-white rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">{empty}</div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{items}</div>
  );
};

/** A row of small numbers above a list (how many, how much…). */
export const BoxStats: React.FC<{ items: [string, React.ReactNode, string?][] }> = ({ items }) => (
  <div className={`grid gap-2 text-center ${items.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
    {items.map(([t, v, tone]) => (
      <div key={t} className={`rounded-2xl border px-3 py-2 ${tone || 'border-[#EBDBCE] bg-[#FAF5F1] text-[#3A241F]'}`}>
        <div className="text-[10px] font-bold opacity-80">{t}</div>
        <div className="text-sm font-black">{v}</div>
      </div>
    ))}
  </div>
);

/**
 * One box: an icon, a title with a small line under it, a badge, a few labelled numbers and the actions at the bottom. When `onClick` is given the whole box
 * opens something (a product card, a document, an editing window). Used by the Sepidar menu and the warehouse menu.
 */
export const BoxCard: React.FC<{
  icon: React.ReactNode;
  tone?: string;
  title: React.ReactNode;
  sub?: string;
  badge?: [string, string] | null;
  facts?: [string, React.ReactNode][];
  onClick?: () => void;
  dim?: boolean;
  children?: React.ReactNode;
}> = ({ icon, tone = 'rose', title, sub, badge, facts = [], onClick, dim, children }) => (
  <div
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onClick={onClick}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    className={`rounded-2xl border border-[#EBDBCE] bg-white p-4 flex flex-col gap-3 shadow-2xs hover:shadow-md transition-shadow text-right ${onClick ? 'cursor-pointer hover:border-[#C98B6A]' : ''} ${dim ? 'opacity-55' : ''}`}
    data-sepidar-card
    data-box-card
  >
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
    {children ? <div className="flex flex-wrap gap-1.5 mt-auto pt-1" onClick={(e) => e.stopPropagation()}>{children}</div> : null}
  </div>
);
