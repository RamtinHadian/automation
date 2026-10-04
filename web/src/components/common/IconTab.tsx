import React from 'react';

/**
 * A menu tab with its icon and its title always visible, so every menu can be found and reached at a glance
 * (no hovering needed). The active tab is filled; a badge shows a count or an unread notification.
 */
export const IconTab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number | string;
  /** unread notifications: a red badge */
  alert?: boolean;
}> = ({ icon, label, active, onClick, count, alert }) => (
  <div className="relative shrink-0">
    <button
      type="button"
      onClick={(e) => {
        onClick();
        e.currentTarget.blur();
      }}
      aria-current={active ? 'page' : undefined}
      className={`h-10 px-3.5 flex items-center justify-center gap-2 rounded-2xl border text-xs font-black whitespace-nowrap transition-colors duration-150 cursor-pointer ${
        active ? 'bg-[#6E1B1B] text-white border-[#6E1B1B] shadow-md' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#F6D9CD]/50 hover:border-[#C98B6A]'
      }`}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span>{label}</span>
    </button>

    {count !== undefined && count !== '' && (
      <span className={`pointer-events-none absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center border-2 border-[#FAF5F1] z-10 ${alert ? 'bg-rose-600 text-white shadow-sm' : active ? 'bg-[#D34A32] text-white' : 'bg-[#EBDBCE] text-[#3A241F]'}`}>
        {count}
      </span>
    )}
  </div>
);
