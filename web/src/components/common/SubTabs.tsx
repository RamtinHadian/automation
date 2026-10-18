import React from 'react';

const ACTIVE: Record<string, string> = {
  violet: 'text-violet-700',
  rose: 'text-rose-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
  sky: 'text-sky-700',
  teal: 'text-teal-700',
  maroon: 'text-[#6E1B1B]',
};

export interface SubTab {
  id: string;
  label: string;
  Icon?: React.ElementType;
  /** a small red number on the tab */
  badge?: number;
  /** a small quiet number after the name (how many there are) */
  count?: number;
}

/**
 * The sub-menu of a page, drawn like the one of the customers menu: one rounded bar, the open tab is a white pill with the menu's colour.
 * On a computer it stays under the header (data-subtabs, see index.css); on a phone it scrolls away with the page.
 */
export const SubTabs: React.FC<{ tabs: SubTab[]; value: string; onChange: (id: string) => void; tone?: keyof typeof ACTIVE | string; className?: string }> = ({ tabs, value, onChange, tone = 'violet', className = '' }) => (
  <div data-subtabs className={`flex flex-wrap lg:flex-nowrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 ${className}`}>
    {tabs.map(({ id, label, Icon, badge, count }) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        title={label}
        className={`flex-1 basis-[45%] sm:basis-auto lg:basis-0 min-h-[44px] lg:min-h-0 min-w-0 whitespace-nowrap flex items-center justify-center gap-1 lg:gap-1.5 px-3 lg:px-2 xl:px-3 py-2 rounded-xl text-xs lg:text-[11.5px] xl:text-xs font-black transition-all cursor-pointer ${
          value === id ? `bg-white ${ACTIVE[tone] || ACTIVE.violet} shadow-2xs` : 'text-[#8C6F66] hover:text-[#3A241F]'
        }`}
      >
        {Icon ? <Icon className="w-4 h-4 lg:w-3.5 lg:h-3.5 xl:w-4 xl:h-4 shrink-0" /> : null}
        <span className="truncate">{label}</span>
        {count !== undefined ? <span className="text-[10px] font-bold opacity-60 shrink-0" data-count>{count.toLocaleString('fa-IR')}</span> : null}
        {badge ? <span className="bg-rose-500 text-white text-[10px] rounded-full px-1.5">{badge.toLocaleString('fa-IR')}</span> : null}
      </button>
    ))}
  </div>
);
