import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export const field =
  'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-500/20 disabled:opacity-70';
export const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

export const SOURCES = ['معرفی دوستان', 'وب‌سایت', 'تماس ورودی', 'نمایشگاه', 'شبکه‌های اجتماعی', 'مشتری قبلی'];

export const Modal: React.FC<{ title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean; onTop?: boolean | 'max' }> = ({ title, onClose, children, footer, wide, onTop }) => {
  const node = (
  <div className={`fixed inset-0 ${onTop === 'max' ? 'z-[2147483100]' : onTop ? 'z-[70]' : 'z-50'} flex items-center justify-center bg-black/50 backdrop-blur-xs p-3`} onMouseDown={onClose} data-keep-anim>
    <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[92dvh] flex flex-col border border-[#EBDBCE] text-right`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
        <h3 className="font-black text-sm text-[#3A241F] truncate">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      <div data-modal-footer className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">{footer}</div>
    </div>
  </div>
  );
  // a window that must be above everything (onTop = 'max') is drawn straight into <body>: inside another full-screen window (the letter editor, which scales and fades its paper on a phone) it was drawn see-through and mixed with the page behind
  return onTop === 'max' && typeof document !== 'undefined' ? createPortal(node, document.body) : node;
};

