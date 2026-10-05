import React from 'react';
import { X } from 'lucide-react';

export const field =
  'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-500/20 disabled:opacity-70';
export const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

export const SOURCES = ['معرفی دوستان', 'وب‌سایت', 'تماس ورودی', 'نمایشگاه', 'شبکه‌های اجتماعی', 'مشتری قبلی'];

export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean; onTop?: boolean | 'max' }> = ({ title, onClose, children, footer, wide, onTop }) => (
  <div className={`fixed inset-0 ${onTop === 'max' ? 'z-[300]' : onTop ? 'z-[70]' : 'z-50'} flex items-center justify-center bg-black/50 backdrop-blur-xs p-3`} onMouseDown={onClose}>
    <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
        <h3 className="font-black text-sm text-[#3A241F] truncate">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">{footer}</div>
    </div>
  </div>
);

