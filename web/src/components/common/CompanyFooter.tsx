import React from 'react';
import { toPersianDigits } from '../../lib/jalali';

/** The phone number of the company that makes Hoormand (the only contact shown in the app). */
export const CONTACT_PHONE = '03133920';

/** A small, quiet line at the bottom of a page: who makes Hoormand and how to reach them. */
export const CompanyFooter: React.FC<{ className?: string; tone?: 'light' | 'dark'; floating?: boolean }> = ({ className = '', tone = 'light', floating = false }) => (
  <div
    dir="rtl"
    data-company-footer
    className={`${floating ? 'fixed inset-x-0 bottom-[4.25rem] sm:bottom-3 z-[5] pointer-events-none' : 'mt-auto pt-6 pb-4'} flex items-center justify-center gap-2 text-[10px] font-medium select-none ${tone === 'dark' ? 'text-white/55' : 'text-[#8C6F66]/80'} ${className}`}
  >
    <span className="font-black tracking-wide">شرکت داده‌پرداز هورمند</span>
    <span className={`w-1 h-1 rounded-full ${tone === 'dark' ? 'bg-white/40' : 'bg-[#C98B6A]'}`} />
    <span>تماس با ما:</span>
    <a href={`tel:${CONTACT_PHONE}`} dir="ltr" className="font-black hover:underline pointer-events-auto">{toPersianDigits(CONTACT_PHONE)}</a>
  </div>
);
