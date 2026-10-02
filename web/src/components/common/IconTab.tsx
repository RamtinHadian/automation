import React from 'react';

/**
 * A minimal icon tab. Every tab keeps its own fixed little square, so nothing ever moves. While the mouse (or keyboard focus)
 * is on a tab, a pill grows out of its icon towards the left and shows the name; it cannot be clicked itself, so the tabs next
 * to it stay easy to reach, and it shrinks back as soon as the mouse leaves the icon.
 */
export const IconTab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number | string;
}> = ({ icon, label, active, onClick, count }) => (
  <div className="relative w-10 h-10 shrink-0 group hover:z-30 focus-within:z-30">
    <button
      type="button"
      onClick={(e) => {
        onClick();
        e.currentTarget.blur();
      }}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`absolute inset-0 flex items-center justify-center rounded-2xl border transition-colors duration-150 cursor-pointer ${
        active ? 'bg-[#6E1B1B] text-white border-[#6E1B1B] shadow-md' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#F6D9CD]/50'
      }`}
    >
      {icon}
    </button>

    {/* the name: grows out of the icon, leftwards */}
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute top-0 right-0 h-10 flex items-center justify-start gap-2 pr-[11px] pl-3 rounded-2xl border text-xs font-black whitespace-nowrap overflow-hidden shadow-lg
        w-10 opacity-0 transition-[width,opacity] duration-200 ease-out
        group-hover:w-[var(--w)] group-hover:opacity-100 group-has-focus-visible:w-[var(--w)] group-has-focus-visible:opacity-100
        ${active ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-[#FFF7F2] text-[#3A241F] border-[#C98B6A]'}`}
      style={{ ['--w' as string]: `${Math.max(120, 52 + label.length * 7.4)}px` }}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span>{label}</span>
    </span>

    {count !== undefined && count !== '' && (
      <span className={`pointer-events-none absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center border-2 border-[#FAF5F1] z-10 ${active ? 'bg-[#D34A32] text-white' : 'bg-[#EBDBCE] text-[#3A241F]'}`}>
        {count}
      </span>
    )}
  </div>
);
