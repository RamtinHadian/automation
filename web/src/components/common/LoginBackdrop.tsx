import React from 'react';
import { useLoginImage } from '../../lib/loginStyle';

/** The whole-screen picture behind a sign-in page, with a soft dark veil so the glass card stays readable. */
export const LoginBackdrop: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const img = useLoginImage();
  return (
    <div className={`relative min-h-screen min-h-dvh flex items-center justify-center overflow-hidden ${className}`} dir="rtl">
      <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url("${img}")` }} aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/45" aria-hidden />
      <div className="relative z-10 w-full flex items-center justify-center">{children}</div>
    </div>
  );
};

/** Class names of the frosted-glass card and of its fields (shared by the sign-in pages). */
export const GLASS_CARD =
  'w-full bg-white/15 backdrop-blur-xl border border-white/40 rounded-[28px] shadow-2xl shadow-black/30 text-white';
export const GLASS_FIELD =
  'flex items-center gap-3 px-4 py-3 bg-white/10 border border-white/55 rounded-2xl transition-all focus-within:bg-white/20 focus-within:border-white focus-within:ring-2 focus-within:ring-white/25';
