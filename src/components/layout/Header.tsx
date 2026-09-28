import React from 'react';
import {
  Search,
  Bell,
  HelpCircle,
  Settings,
  SlidersHorizontal,
  LogOut,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { User, NotificationItem } from '../../types';

interface HeaderProps {
  user: User;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  notifications: NotificationItem[];
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onSwitchUser: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  searchQuery,
  onSearchChange,
  notifications,
  onOpenNotifications,
  onOpenSettings,
  onSwitchUser,
}) => {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-[#EBDBCE] select-none font-sans">
      {/* Centered Search Bar */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-[#B8A39C]">
            <Search className="w-4 h-4 text-[#B8A39C]" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="جستجو در درایو و فایل‌های سازمانی..."
            className="w-full pr-11 pl-4 py-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD]/30 focus:bg-white text-xs text-[#3A241F] rounded-full border border-transparent focus:border-[#D34A32] focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none transition-all placeholder:text-[#B8A39C]"
          />
        </div>
      </div>

      {/* Right Utility Cluster */}
      <div className="flex items-center gap-4 mr-6">
        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#FAF5F1] rounded-full transition-colors"
          title="اعلان‌ها"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-[#D34A32] rounded-full ring-2 ring-white" />
          )}
        </button>

        {/* Help Circle */}
        <button
          onClick={() => alert("مرکز راهنمایی سامانه انتقال و ذخیره‌سازی فایل سازمانی\n\n- برای آپلود فایل‌ها، کافیست آن‌ها را به صفحه بکشید و رها کنید.\n- برای انتقال مستقیم به پرسنل، روی دکمه 'ارسال فایل به همکاران' کلیک کنید.\n- مدیران ارشد می‌توانند سهمیه‌ها و دسترسی‌ها را از پنل مدیریت پیکربندی نمایند.")}
          className="p-2 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#FAF5F1] rounded-full transition-colors"
          title="مرکز راهنمایی"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Settings Cog */}
        <button
          onClick={onOpenSettings}
          className="p-2 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#FAF5F1] rounded-full transition-colors"
          title="تنظیمات سیستم"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 pr-2 border-r border-[#EBDBCE]">
          <span className="text-xs font-bold text-[#3A241F] hidden sm:inline-block">
            {user.fullName}
          </span>
          <button
            onClick={onSwitchUser}
            className="w-9 h-9 rounded-full bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-sm ring-2 ring-[#EBDBCE] hover:ring-[#C98B6A] transition-all group relative cursor-pointer"
            title={`ورود به عنوان ${user.fullName} (${user.role}) - کلیک برای تغییر نقش آزمایشی`}
          >
            <UserIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Sliders Icon */}
        <button
          className="p-2 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#FAF5F1] rounded-full transition-colors mr-1"
          title="فیلترهای پیشرفته"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
