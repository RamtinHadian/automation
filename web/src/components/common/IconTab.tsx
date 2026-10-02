import React from 'react';

/** A minimal icon-only tab. On hover (or keyboard focus) a small dark label appears above it saying what it is. */
export const IconTab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number | string;
}> = ({ icon, label, active, onClick, count }) => (
  <div className="relative group">
    <button
      type="button"
      onClick={(e) => {
        onClick();
        e.currentTarget.blur(); // the label belongs to the mouse hover; it must not stay on a button that was clicked
      }}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={`relative w-10 h-10 flex items-center justify-center rounded-2xl transition-all cursor-pointer ${
        active ? 'bg-[#6E1B1B] text-white shadow-md' : 'bg-white text-[#3A241F] border border-[#EBDBCE] hover:bg-[#F6D9CD]/40 hover:-translate-y-0.5'
      }`}
    >
      {icon}
      {count !== undefined && count !== '' && (
        <span className={`absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center border-2 border-[#FAF5F1] ${active ? 'bg-[#D34A32] text-white' : 'bg-[#EBDBCE] text-[#3A241F]'}`}>
          {count}
        </span>
      )}
    </button>
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 rounded-lg bg-[#3A241F] text-white text-[11px] font-bold whitespace-nowrap shadow-lg opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-has-focus-visible:opacity-100 group-has-focus-visible:translate-y-0 z-30"
    >
      {label}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#3A241F]" />
    </span>
  </div>
);
