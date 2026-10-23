import React, { useState, useRef, useEffect } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { User } from '../types';
import { useDemoInfo } from '../components/common/DemoBanner';
import { useCompanyName } from '../lib/useCompanyName';
import { LoginBackdrop, GLASS_CARD, GLASS_FIELD } from '../components/common/LoginBackdrop';

interface LoginPageProps {
  staffList: User[];
  /** Resolves to an error message, or null when the sign-in succeeded. */
  onLogin: (identifier: string, password: string) => Promise<string | null>;
  onAdminLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ staffList, onLogin, onAdminLogin }) => {
  const companyName = useCompanyName();
  const demo = useDemoInfo();
  const [usernameQuery, setUsernameQuery] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // On the public demo the public account is filled in, the visitor only presses «ورود».
  const demoAccount = demo?.accounts?.[0];
  useEffect(() => {
    if (demoAccount) {
      setUsernameQuery(demoAccount.identifier);
      setPassword(demoAccount.password);
    }
  }, [demoAccount?.identifier, demoAccount?.password]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = staffList.filter((u) => u.isActive !== false).filter((u) =>
    u.fullName.toLowerCase().includes(usernameQuery.toLowerCase().trim()) ||
    u.email.toLowerCase().includes(usernameQuery.toLowerCase().trim())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setUsernameQuery(user.fullName);
    setShowDropdown(false);
    setError('');
  };

  const handleLogin = async () => {
    if (submitting) return;
    setError('');
    const query = usernameQuery.trim();
    if (!query) {
      setError('لطفاً نام کاربری یا ایمیل را وارد کنید.');
      return;
    }
    if (!password) {
      setError('لطفاً رمز عبور را وارد کنید.');
      return;
    }

    setSubmitting(true);
    const failure = await onLogin(selectedUser?.email || query, password);
    setSubmitting(false);
    if (failure) setError(failure);
  };

  return (
    <LoginBackdrop className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] font-sans select-none">
      <div className="w-full max-w-sm">
        {/* Login card: frosted glass over the picture */}
        <div className={`${GLASS_CARD} p-6 sm:p-8 space-y-5`}>
          <div className="text-center space-y-3">
            <img src="/images/logo-full.png" alt="هورمند - سامانه اتوماسیون اداری" className="brand-logo w-44 sm:w-48 mx-auto [filter:drop-shadow(0_0_14px_rgba(255,255,255,0.85))_drop-shadow(0_4px_10px_rgba(0,0,0,0.25))]" draggable={false} />
            {companyName && <div className="text-sm font-black text-white drop-shadow" data-company-name>{companyName}</div>}
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-black text-white leading-tight drop-shadow">ورود</h1>
            <p className="text-xs text-white/85 mt-1">خوش آمدید؛ برای ادامه وارد حساب خود شوید.</p>
          </div>

          {/* Username / User Select Field */}
          <div className="relative" ref={dropdownRef}>
            <div className={`${GLASS_FIELD} cursor-text`} onClick={() => setShowDropdown(true)}>
              <input
                type="text"
                value={usernameQuery}
                onChange={(e) => {
                  setUsernameQuery(e.target.value);
                  setSelectedUser(null);
                  setShowDropdown(true);
                  setError('');
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-label="نام کاربری"
                placeholder="نام کاربری"
                className="glass-input flex-1 bg-transparent text-center text-sm font-bold text-white placeholder:text-white/70 focus:outline-none min-w-0"
              />
              <UserIcon className="w-5 h-5 text-white/85 shrink-0" />
            </div>

            {/* Dropdown list */}
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full mt-2 w-full max-h-56 overflow-y-auto bg-white border border-[#EBDBCE] rounded-2xl shadow-xl z-50 divide-y divide-[#EBDBCE]/50 text-[#3A241F]">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUser(u)}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 text-right hover:bg-[#FAF5F1] transition-colors first:rounded-t-2xl last:rounded-b-2xl cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-xl bg-[#F6D9CD]/80 text-[#6E1B1B] flex items-center justify-center shrink-0">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <div className="text-xs font-bold text-[#3A241F] truncate">{u.fullName}</div>
                      <div className="text-[10px] text-[#8C6F66] truncate">
                        {u.departmentName} {u.role === 'SUPER_ADMIN' ? '(مدیر ارشد)' : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Password Field */}
          <div className={GLASS_FIELD}>
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'پنهان‌کردن رمز' : 'نمایش رمز'}
              className="text-white/85 hover:text-white transition-colors shrink-0 p-2.5 -m-2"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="رمز عبور"
              placeholder="رمز عبور"
              className="glass-input flex-1 bg-transparent text-center text-sm font-bold text-white placeholder:text-white/70 focus:outline-none font-mono min-w-0"
            />
            <Lock className="w-5 h-5 text-white/85 shrink-0" />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/25 border border-red-200/60 text-white text-xs font-bold px-3 py-2 rounded-xl text-center">{error}</div>
          )}

          {/* Login Button: a pane of glass */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={submitting}
            className="relative w-full py-3.5 overflow-hidden rounded-2xl text-white font-black text-sm tracking-wide login-btn bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/60 shadow-[0_8px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.7),inset_0_-8px_16px_rgba(255,255,255,0.08)] transition-all active:scale-[0.98] cursor-pointer disabled:opacity-60 [text-shadow:0_1px_6px_rgba(0,0,0,0.35)]"
          >
            <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" aria-hidden />
            <span className="relative">{submitting ? 'در حال ورود…' : 'ورود'}</span>
          </button>
        </div>
      </div>
    </LoginBackdrop>
  );
};
