import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'app_night_mode';

/** Whether night mode is on (kept per device; the page applies it before it is drawn, see index.html). */
export const isNight = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const applyNight = (on: boolean) => {
  document.documentElement.classList.toggle('night', on);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', on ? '#0f0f10' : '#6E1B1B');
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('night-mode'));
};

/** Day / night switch for the whole system. */
export const DayNightToggle: React.FC<{ className?: string; label?: boolean }> = ({ className = '', label }) => {
  const [night, setNight] = useState(() => document.documentElement.classList.contains('night') || isNight());
  useEffect(() => {
    const on = () => setNight(document.documentElement.classList.contains('night'));
    window.addEventListener('night-mode', on);
    return () => window.removeEventListener('night-mode', on);
  }, []);
  return (
    <button
      type="button"
      onClick={() => applyNight(!night)}
      title={night ? 'حالت روز' : 'حالت شب'}
      aria-label={night ? 'حالت روز' : 'حالت شب'}
      className={`flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-105 active:scale-95 ${className}`}
    >
      {night ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      {label && <span className="hidden sm:inline">{night ? 'روز' : 'شب'}</span>}
    </button>
  );
};
