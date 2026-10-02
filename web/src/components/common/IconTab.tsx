import React from 'react';

/** A minimal icon tab. When the mouse (or keyboard focus) is on it, the tab itself widens and shows its name next to the icon; it shrinks back to the icon afterwards. */
export const IconTab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number | string;
}> = ({ icon, label, active, onClick, count }) => (
  <button
    type="button"
    onClick={(e) => {
      onClick();
      e.currentTarget.blur(); // the name belongs to the mouse hover; it must not stay open on a clicked tab
    }}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`group relative h-10 min-w-10 px-[11px] flex items-center justify-center rounded-2xl transition-colors duration-200 cursor-pointer ${
      active ? 'bg-[#6E1B1B] text-white shadow-md border border-[#6E1B1B]' : 'bg-white text-[#3A241F] border border-[#EBDBCE] hover:bg-[#F6D9CD]/40'
    }`}
  >
    <span className="shrink-0 flex items-center">{icon}</span>
    <span className="overflow-hidden whitespace-nowrap text-xs font-black max-w-0 opacity-0 transition-all duration-200 ease-out group-hover:max-w-[220px] group-hover:opacity-100 group-hover:mr-2 group-focus-visible:max-w-[220px] group-focus-visible:opacity-100 group-focus-visible:mr-2">
      {label}
    </span>
    {count !== undefined && count !== '' && (
      <span className={`absolute -top-1.5 -left-1.5 min-w-[17px] h-[17px] px-1 rounded-full text-[9px] font-black flex items-center justify-center border-2 border-[#FAF5F1] ${active ? 'bg-[#D34A32] text-white' : 'bg-[#EBDBCE] text-[#3A241F]'}`}>
        {count}
      </span>
    )}
  </button>
);
