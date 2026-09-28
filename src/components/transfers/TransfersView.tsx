import React, { useState } from 'react';
import {
  Inbox,
  Send,
  Download,
  Clock,
  CheckCircle2,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  FileCode
} from 'lucide-react';
import { FileTransfer, User, FileCategory } from '../../types';

interface TransfersViewProps {
  transfers: FileTransfer[];
  currentUser: User;
  onNewTransfer: () => void;
  onDownloadTransfer: (transfer: FileTransfer) => void;
}

export const TransfersView: React.FC<TransfersViewProps> = ({
  transfers,
  currentUser,
  onNewTransfer,
  onDownloadTransfer,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'inbox' | 'sent'>('inbox');

  const inboxTransfers = transfers.filter((t) =>
    t.recipients.some((r) => r.id === currentUser.id)
  );
  const sentTransfers = transfers.filter((t) => t.sender.id === currentUser.id);

  const currentList = activeSubTab === 'inbox' ? inboxTransfers : sentTransfers;

  const renderCategoryIcon = (category: FileCategory) => {
    switch (category) {
      case 'sheet':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
      case 'zip':
        return <FileArchive className="w-5 h-5 text-purple-500" />;
      case 'image':
        return <ImageIcon className="w-5 h-5 text-amber-500" />;
      case 'code':
        return <FileCode className="w-5 h-5 text-indigo-500" />;
      default:
        return <FileText className="w-5 h-5 text-[#6E1B1B]" />;
    }
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Top Banner / Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
            انتقالات درون‌سازمانی فایل
          </h1>
          <p className="text-xs text-[#8C6F66]">
            انتقال مستقیم، نظیر به نظیر و رمزگذاری شده اسناد در بستر شبکه شرکت
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sub-tab pills */}
          <div className="bg-[#FAF5F1] border border-[#EBDBCE] p-1 rounded-2xl flex items-center gap-1">
            <button
              onClick={() => setActiveSubTab('inbox')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'inbox'
                  ? 'bg-[#6E1B1B] text-white shadow-xs'
                  : 'text-[#8C6F66] hover:text-[#3A241F]'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>صندوق ورودی ({inboxTransfers.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('sent')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeSubTab === 'sent'
                  ? 'bg-[#6E1B1B] text-white shadow-xs'
                  : 'text-[#8C6F66] hover:text-[#3A241F]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>ارسالی‌ها ({sentTransfers.length})</span>
            </button>
          </div>

          <button
            onClick={onNewTransfer}
            className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>ارسال انتقال جدید</span>
          </button>
        </div>
      </div>

      {/* Transfers Cards */}
      {currentList.length === 0 ? (
        <div className="text-center py-16 bg-[#FAF5F1]/50 rounded-3xl border border-dashed border-[#EBDBCE]">
          <div className="w-12 h-12 rounded-full bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center mx-auto mb-3">
            {activeSubTab === 'inbox' ? <Inbox className="w-6 h-6" /> : <Send className="w-6 h-6" />}
          </div>
          <h3 className="text-sm font-bold text-[#3A241F]">
            {activeSubTab === 'inbox' ? 'صندوق ورودی شما خالی است' : 'هنوز فایلی ارسال نکرده‌اید'}
          </h3>
          <p className="text-xs text-[#8C6F66] max-w-sm mx-auto mt-1">
            {activeSubTab === 'inbox'
              ? 'هنگامی که همکاران فایلی برای شما ارسال کنند، در این قسمت نمایش داده خواهد شد.'
              : 'اسناد را مستقیماً به اعضای تیم با قوانین امنیتی سفارشی ارسال فرمایید.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentList.map((transfer) => (
            <div
              key={transfer.id}
              className="bg-white rounded-2xl p-5 border border-[#EBDBCE] hover:border-[#C98B6A] hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-[#FAF5F1] rounded-xl border border-[#EBDBCE] shrink-0">
                    {renderCategoryIcon(transfer.category)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#3A241F] group-hover:text-[#6E1B1B] transition-colors line-clamp-1">
                      {transfer.fileName}
                    </h3>
                    <div className="text-[11px] text-[#8C6F66] flex items-center gap-2 mt-0.5">
                      <span className="font-bold text-[#3A241F]">{transfer.fileSize}</span>
                      <span>•</span>
                      <span>{transfer.sentAt}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="shrink-0">
                  {transfer.status === 'DOWNLOADED' ? (
                    <span className="inline-flex items-center gap-1 bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-[#C98B6A]/30">
                      <CheckCircle2 className="w-3 h-3" /> دانلود شده
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-[#FAF5F1] text-[#D34A32] text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-[#D34A32]/30">
                      <Clock className="w-3 h-3" /> تحویل شده
                    </span>
                  )}
                </div>
              </div>

              {/* Note */}
              {transfer.note && (
                <div className="p-3 bg-[#FAF5F1] rounded-xl text-xs text-[#503730] border border-[#EBDBCE] italic">
                  "{transfer.note}"
                </div>
              )}

              {/* Sender / Recipients details */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#EBDBCE]">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-[#8C6F66]">
                    {activeSubTab === 'inbox' ? 'از طرف' : 'به'}:
                  </span>
                  {activeSubTab === 'inbox' ? (
                    <div className="flex items-center gap-1.5 font-bold text-[#3A241F]">
                      <img
                        src={transfer.sender.avatarUrl}
                        alt={transfer.sender.fullName}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span>{transfer.sender.fullName}</span>
                      <span className="text-[10px] text-[#8C6F66] font-normal">
                        ({transfer.sender.departmentName})
                      </span>
                    </div>
                  ) : (
                    <div className="avatar-stack flex items-center">
                      {transfer.recipients.map((r, idx) => (
                        <img
                          key={idx}
                          src={r.avatarUrl}
                          alt={r.fullName}
                          title={`${r.fullName} (${r.departmentName})`}
                          className="w-5 h-5 rounded-full object-cover border-2 border-white"
                        />
                      ))}
                      <span className="text-[11px] text-[#8C6F66] font-medium mr-2">
                        {transfer.recipients.length} گیرنده
                      </span>
                    </div>
                  )}
                </div>

                {/* Expiration & Security tags */}
                <div className="flex items-center gap-2">
                  {transfer.isEncrypted && (
                    <span title="رمزنگاری شده با استاندارد AES-256">
                      <Lock className="w-3.5 h-3.5 text-[#6E1B1B]" />
                    </span>
                  )}
                  <span className="text-[11px] text-[#8C6F66] font-medium">
                    انقضا: {transfer.expiresAt}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {activeSubTab === 'inbox' && (
                  <button
                    onClick={() => onDownloadTransfer(transfer)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-[#F6D9CD] hover:bg-[#EEBFAC] text-[#6E1B1B] font-bold text-xs rounded-xl transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>دانلود مستقیم فایل ({transfer.fileSize})</span>
                  </button>
                )}
                {activeSubTab === 'sent' && (
                  <div className="text-[11px] text-[#8C6F66] flex items-center justify-between w-full">
                    <span>
                      تعداد دانلود: <b className="text-[#3A241F]">{transfer.downloadsCount}</b> از {transfer.maxDownloads || '∞'}
                    </span>
                    <button
                      onClick={() => alert(`شناسه انتقال: ${transfer.id}\nتحویل داده شده به: ${transfer.recipients.map(r => r.fullName).join('، ')}`)}
                      className="text-[#D34A32] hover:text-[#6E1B1B] font-bold hover:underline"
                    >
                      گزارش ممیزی ↗
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
