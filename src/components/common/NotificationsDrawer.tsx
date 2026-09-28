import React from 'react';
import { Bell, Check, Trash2, X, Send, DownloadCloud, AlertCircle } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAsRead: (id: string) => void;
  onClearAll: () => void;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-2xs flex justify-start animate-in fade-in duration-150 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-80 sm:w-96 bg-white h-full shadow-2xl border-r border-[#EBDBCE] flex flex-col justify-between animate-in slide-in-from-left duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE] bg-[#FAF5F1]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#6E1B1B]" />
            <h3 className="font-bold text-sm text-[#3A241F]">اعلان‌های سامانه</h3>
            <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {notifications.filter((n) => !n.isRead).length} جدید
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#8C6F66] hover:text-[#3A241F] p-1.5 rounded-full hover:bg-[#EBDBCE]/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications list */}
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1 text-xs">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-[#B8A39C]">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#6E1B1B]" />
              <p className="font-bold">هیچ اعلانی وجود ندارد</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => onMarkAsRead(n.id)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                  n.isRead
                    ? 'bg-[#FAF5F1]/70 border-[#EBDBCE] text-[#8C6F66]'
                    : 'bg-[#F6D9CD]/50 border-[#C98B6A]/50 text-[#3A241F] font-medium shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-xs text-[#3A241F]">{n.title}</span>
                  <span className="text-[10px] text-[#8C6F66] shrink-0 font-mono">{n.timestamp}</span>
                </div>
                <p className="text-[11px] text-[#503730] mt-1">{n.message}</p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#FAF5F1] border-t border-[#EBDBCE] flex items-center justify-between">
          <button
            onClick={onClearAll}
            className="text-xs text-[#8C6F66] hover:text-[#6E1B1B] font-bold transition-colors"
          >
            پاک کردن همه
          </button>
          <button
            onClick={() => {
              notifications.forEach((n) => onMarkAsRead(n.id));
            }}
            className="text-xs text-[#6E1B1B] hover:text-[#D34A32] font-bold transition-colors"
          >
            خواندن همه اعلان‌ها
          </button>
        </div>
      </div>
    </div>
  );
};
