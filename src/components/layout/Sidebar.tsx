import React from 'react';
import {
  HardDrive,
  Monitor,
  Users,
  Clock,
  Trash2,
  Star,
  RotateCcw,
  Plus,
  Cloud,
  Image as ImageIcon,
  ExternalLink,
  ShieldCheck,
  SendHorizontal,
  Activity,
  Settings2
} from 'lucide-react';
import { UserRole } from '../../types';

export type NavTab =
  | 'my-drive'
  | 'computers'
  | 'shared-with-me'
  | 'recents'
  | 'trash'
  | 'starred'
  | 'backups'
  | 'transfers'
  | 'admin-users'
  | 'admin-logs'
  | 'admin-settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenUpload: () => void;
  onOpenTransfer: () => void;
  userRole: UserRole;
  totalUsedGB?: number;
  totalQuotaGB?: number;
  photosUsedGB?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenUpload,
  onOpenTransfer,
  userRole,
  totalUsedGB = 60.7,
  totalQuotaGB = 1000,
  photosUsedGB = 10.7,
}) => {
  const mainNavItems = [
    { id: 'my-drive' as NavTab, label: 'درایو من', icon: HardDrive },
    { id: 'computers' as NavTab, label: 'کامپیوترها', icon: Monitor },
    { id: 'shared-with-me' as NavTab, label: 'اشتراک‌گذاری با من', icon: Users },
    { id: 'recents' as NavTab, label: 'فایل‌های اخیر', icon: Clock },
    { id: 'trash' as NavTab, label: 'سطل زباله', icon: Trash2 },
    { id: 'starred' as NavTab, label: 'نشان‌دار شده‌ها', icon: Star },
    { id: 'backups' as NavTab, label: 'پشتیبان‌گیری‌ها', icon: RotateCcw },
  ];

  const transferNavItems = [
    { id: 'transfers' as NavTab, label: 'انتقال فایل (ورودی / ارسالی)', icon: SendHorizontal, badge: 'زنده' },
  ];

  const adminNavItems = [
    { id: 'admin-users' as NavTab, label: 'مدیریت کاربران و سهمیه‌ها', icon: ShieldCheck },
    { id: 'admin-logs' as NavTab, label: 'گزارشات و تحلیل سیستم', icon: Activity },
    { id: 'admin-settings' as NavTab, label: 'محدودیت‌ها و امنیت', icon: Settings2 },
  ];

  const totalPercent = Math.min(100, Math.round((totalUsedGB / totalQuotaGB) * 100));
  const photosPercent = Math.min(100, Math.round((photosUsedGB / totalQuotaGB) * 100));

  return (
    <aside className="w-64 bg-gradient-to-b from-[#3A241F] via-[#2E1A16] to-[#1F0F0C] text-white flex flex-col justify-between p-6 select-none shrink-0 min-h-screen font-sans border-l border-[#563D34]">
      {/* Top Section: Logo, Upload Button, Nav Links */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="w-8 h-8 flex items-center justify-center">
            {/* Triangular Drive Icon */}
            <svg viewBox="0 0 40 40" className="w-8 h-8 drop-shadow-sm" fill="none">
              <path d="M14.5 4L2 25.5L7.5 35L20 13.5L14.5 4Z" fill="#F6D9CD" fillOpacity="0.9" />
              <path d="M25.5 4H14.5L20 13.5H38L32.5 4H25.5Z" fill="#D34A32" />
              <path d="M20 13.5L27 25.5H7.5L2 35H32.5L38 25.5L20 13.5Z" fill="#C98B6A" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white font-sans">
            سامانه فایل سازمانی
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {/* Upload New Files Button */}
          <button
            onClick={onOpenUpload}
            className="w-full bg-[#F6D9CD] text-[#6E1B1B] font-bold text-xs py-3 px-4 rounded-full shadow-md hover:bg-white hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 group active:scale-95"
          >
            <Plus className="w-4 h-4 text-[#6E1B1B] stroke-[2.5] group-hover:rotate-90 transition-transform duration-300" />
            <span>بارگذاری فایل‌های جدید</span>
          </button>

          {/* Quick Transfer Button */}
          <button
            onClick={onOpenTransfer}
            className="w-full bg-[#6E1B1B]/40 hover:bg-[#6E1B1B]/70 text-[#F6D9CD] border border-[#6E1B1B]/60 text-xs font-medium py-2 px-4 rounded-full transition-all duration-150 flex items-center justify-center gap-2"
          >
            <SendHorizontal className="w-3.5 h-3.5" />
            <span>ارسال فایل به همکاران</span>
          </button>
        </div>

        {/* Main Drive Navigation */}
        <nav className="space-y-1 pt-1">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors text-right ${
                  isActive
                    ? 'bg-[#6E1B1B] text-white font-bold shadow-inner'
                    : 'text-[#EBDBCE] hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-[#C98B6A]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Transfers Navigation */}
        <div className="pt-2 border-t border-[#563D34]">
          <div className="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#C98B6A]">
            انتقالات سازمانی
          </div>
          {transferNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-[#6E1B1B] text-white font-bold'
                    : 'text-[#EBDBCE] hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-[#C98B6A]" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-[#D34A32] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Admin Navigation (Role Gated) */}
        {userRole === 'SUPER_ADMIN' && (
          <div className="pt-2 border-t border-[#563D34]">
            <div className="px-3.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#F6D9CD] flex items-center gap-1.5">
              <span>مدیریت ارشد سامانه</span>
            </div>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors text-right ${
                    isActive
                      ? 'bg-[#D34A32]/40 text-[#F6D9CD] font-bold border border-[#D34A32]/50'
                      : 'text-[#EBDBCE] hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-[#C98B6A]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Section: Storage Details */}
      <div className="pt-6 border-t border-[#563D34] space-y-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#C98B6A]">
          جزئیات فضای ذخیره‌سازی
        </div>

        {/* Total Storage */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-[#EBDBCE] font-semibold">
            <Cloud className="w-3.5 h-3.5 text-[#C98B6A]" />
            <span>فضای ابری</span>
          </div>
          <div className="w-full bg-[#2E1A16] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#F6D9CD] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(6, totalPercent)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#EBDBCE]">
            {totalUsedGB.toFixed(2)} گیگابایت از {totalQuotaGB >= 1000 ? `${totalQuotaGB / 1000} ترابایت` : `${totalQuotaGB} گیگابایت`} مصرف شده
          </div>
        </div>

        {/* Photos / Category Storage */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-[#EBDBCE] font-semibold">
            <ImageIcon className="w-3.5 h-3.5 text-[#C98B6A]" />
            <span>تصاویر و اسناد گرافیکی</span>
          </div>
          <div className="w-full bg-[#2E1A16] rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-[#D34A32] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(4, photosPercent)}%` }}
            />
          </div>
          <div className="text-[11px] text-[#EBDBCE]">
            {photosUsedGB.toFixed(2)} گیگابایت از {totalQuotaGB >= 1000 ? `${totalQuotaGB / 1000} ترابایت` : `${totalQuotaGB} گیگابایت`} مصرف شده
          </div>
        </div>

        {/* Upgrade / Quota Link */}
        <button
          onClick={() => onSelectTab('admin-users')}
          className="flex items-center gap-1.5 text-xs text-[#F6D9CD] hover:text-white font-bold pt-1 transition-colors group"
        >
          <span>ارتقای ظرفیت فضا</span>
          <ExternalLink className="w-3 h-3 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      </div>
    </aside>
  );
};
