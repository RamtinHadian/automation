import React, { useState, useRef, useEffect } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { User } from '../types';
import { DemoAccounts, useDemoInfo } from '../components/common/DemoBanner';

interface LoginPageProps {
  staffList: User[];
  /** Resolves to an error message, or null when the sign-in succeeded. */
  onLogin: (identifier: string, password: string) => Promise<string | null>;
  onAdminLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ staffList, onLogin, onAdminLogin }) => {
  const demo = useDemoInfo();
  const [usernameQuery, setUsernameQuery] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = staffList.filter((u) =>
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
    <div
      className="min-h-screen flex items-center justify-center p-4 font-sans bg-[#FAF7F2] text-[#3A241F] select-none"
      dir="rtl"
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6">

        {/* Heading */}
        <div className="text-center space-y-1.5">
          <h1>
            <img src="/logo-full.png" alt="هورمند - سامانه اتوماسیون اداری" className="w-44 sm:w-52 mx-auto" draggable={false} />
          </h1>
          <div className="text-sm font-black text-[#3A241F]">خوش آمدید</div>
          {!demo && (
          <p className="text-xs text-[#8C6F66] font-medium">
              برای ورود به حساب کاربری اطلاعات خود را وارد کنید
            </p>
          )}
        </div>

        <DemoAccounts
          busy={submitting}
          onPick={async (identifier, pass) => {
            setSubmitting(true);
            const failure = await onLogin(identifier, pass);
            setSubmitting(false);
            if (failure) setError(failure);
          }}
        />

        {/* Login Card (the demo has only the one-field sign-in above) */}
        <div hidden={!!demo} className="w-full bg-white rounded-3xl p-6 sm:p-8 border border-[#EBDBCE] shadow-lg shadow-[#3A241F]/5 space-y-4">

          {/* Username / User Select Field */}
          <div className="relative" ref={dropdownRef}>
            <div
              className="flex items-center gap-3 px-3.5 py-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl cursor-text transition-all focus-within:border-[#6E1B1B] focus-within:ring-2 focus-within:ring-[#6E1B1B]/15"
              onClick={() => setShowDropdown(true)}
            >
              <UserIcon className="w-5 h-5 text-[#8C6F66] shrink-0" />
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
                className="flex-1 bg-transparent text-sm font-bold text-[#3A241F] focus:outline-none"
              />
              {selectedUser && (
                <div className="w-7 h-7 rounded-xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shrink-0">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {/* Dropdown list */}
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full mt-2 w-full max-h-56 overflow-y-auto bg-white border border-[#EBDBCE] rounded-2xl shadow-xl z-50 divide-y divide-[#EBDBCE]/50">
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
                      <div className="text-xs font-bold text-[#3A241F] truncate">
                        {u.fullName}
                      </div>
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
          <div className="flex items-center gap-3 px-3.5 py-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl transition-all focus-within:border-[#6E1B1B] focus-within:ring-2 focus-within:ring-[#6E1B1B]/15">
            <Lock className="w-5 h-5 text-[#8C6F66] shrink-0" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="flex-1 bg-transparent text-sm font-bold text-[#3A241F] focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-[#8C6F66] hover:text-[#3A241F] transition-colors shrink-0 p-0.5"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-[#D34A32]/10 border border-[#D34A32]/30 text-[#D34A32] text-xs font-bold px-3 py-2 rounded-xl text-center">
              {error}
            </div>
          )}

          {/* Login Button */}
          <button
            type="button"
            onClick={handleLogin}
            disabled={submitting}
            className="w-full py-3.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-black text-sm rounded-2xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-[0.98] mt-2 cursor-pointer disabled:opacity-60"
          >
            ورود
          </button>

        </div>

      </div>
    </div>
  );
};