import React from 'react';
import { useLoginDesign, useLoginImage } from '../../lib/loginStyle';

/** The whole-screen picture behind a sign-in page, with a soft dark veil so the glass card stays readable. */
export const LoginBackdrop: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const img = useLoginImage();
  const design = useLoginDesign();
  return (
    <div className={`relative min-h-screen min-h-dvh flex items-center justify-center overflow-hidden ${className}`} dir="rtl" data-login-design={design}>
      {design === 'glass' ? (
        <>
          <div className="absolute inset-0 bg-cover bg-center scale-105" style={{ backgroundImage: `url("${img}")` }} aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/45" aria-hidden />
        </>
      ) : (
        <div className="login-plain absolute inset-0" aria-hidden />
      )}
      <div className="relative z-10 w-full flex items-center justify-center">{children}</div>
    </div>
  );
};

/** Class names of the frosted-glass card and of its fields (shared by the sign-in pages). */
export const GLASS_CARD =
  'login-card w-full bg-gradient-to-br from-white/25 to-white/5 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 rounded-[28px] shadow-[0_20px_60px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.15)] text-white';
export const GLASS_FIELD =
  'login-field flex items-center gap-3 px-4 py-3 bg-white/10 backdrop-blur-md border border-white/45 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] transition-all focus-within:bg-white/20 focus-within:border-white focus-within:ring-2 focus-within:ring-white/25';
