import React from 'react';
import { toPersianDigits } from '../../lib/jalali';

/** The phone number of the company that makes Hoormand (the only contact shown in the app). */
export const CONTACT_PHONE = '03133920';

/** A small, quiet line at the bottom of a page: who makes Hoormand and how to reach them. */
export const CompanyFooter: React.FC<{ className?: string; tone?: 'light' | 'dark' }> = ({ className = '', tone = 'light' }) => (
  <div
    dir="rtl"
    data-company-footer
    className={`mt-auto pt-6 pb-4 flex items-center justify-center gap-2 text-[10px] font-medium select-none ${tone === 'dark' ? 'text-white/55' : 'text-[#8C6F66]/80'} ${className}`}
  >
    <span className="font-black tracking-wide">شرکت داده‌پرداز هورمند</span>
    <span className={`w-1 h-1 rounded-full ${tone === 'dark' ? 'bg-white/40' : 'bg-[#C98B6A]'}`} />
    <span>تماس با ما:</span>
    <a href={`tel:${CONTACT_PHONE}`} dir="ltr" className="font-black hover:underline">{toPersianDigits(CONTACT_PHONE)}</a>
  </div>
);
