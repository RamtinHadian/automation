import React from 'react';
import {
  X,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileArchive,
  FileCode,
  Calendar,
  HardDrive,
  Users,
  Download,
  Share2,
  Clock,
  ShieldCheck,
  Tag,
  Eye
} from 'lucide-react';
import { FileItem } from '../../types';

interface FileDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileItem | null;
  onTransfer: (file: FileItem) => void;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  isOpen,
  onClose,
  file,
  onTransfer,
}) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-[#EBDBCE] flex flex-col">
        {/* Header Preview Banner */}
        <div className="bg-gradient-to-br from-[#6E1B1B] via-[#561515] to-[#3A241F] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 text-white/80 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <FileText className="w-6 h-6 text-[#F6D9CD]" />
            </div>
            <div className="truncate pl-4">
              <h3 className="font-bold text-base text-white truncate">{file.name}</h3>
              <p className="text-xs text-[#EBDBCE] uppercase tracking-wider font-semibold">
                سند {file.category} • {file.size}
              </p>
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-4 text-xs text-[#3A241F]">
          <div className="grid grid-cols-2 gap-4 bg-[#FAF5F1] p-4 rounded-2xl border border-[#EBDBCE]">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-1">
                حجم فایل
              </span>
              <span className="font-bold text-[#3A241F] text-sm">{file.size}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-1">
                آخرین تغییرات
              </span>
              <span className="font-bold text-[#3A241F]">{file.lastModified}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-1">
                وضعیت امنیت
              </span>
              <span className="inline-flex items-center gap-1 text-[#6E1B1B] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" /> همگام و محافظت‌شده
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-1">
                فرمت سند
              </span>
              <span className="font-bold text-[#3A241F] uppercase">.{file.extension}</span>
            </div>
          </div>

          {/* Collaborators & Owners */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-2">
              مالکان و افراد دارای دسترسی
            </span>
            <div className="flex items-center gap-2">
              {file.owners.map((owner, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#FAF5F1] px-3 py-1.5 rounded-full border border-[#EBDBCE]"
                >
                  <span className="font-semibold text-[#3A241F]">{owner.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Log */}
          <div className="pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C6F66] block mb-2">
              تاریخچه فعالیت‌های سند
            </span>
            <div className="space-y-2 border-r-2 border-[#C98B6A] pr-3 mr-1 text-[11px] text-[#8C6F66]">
              <div>
                <p className="font-bold text-[#3A241F]">نسخه ۲.۴ ثبت گردید</p>
                <p className="text-[10px]">امروز ساعت ۱۰:۳۰ توسط جسیکا</p>
              </div>
              <div>
                <p className="font-bold text-[#3A241F]">مجوز دسترسی به تیم اعطا شد</p>
                <p className="text-[10px]">۹ شهریور ۱۴۰۵ توسط برترام گیلفویل</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#FAF5F1] border-t border-[#EBDBCE]">
          <button
            onClick={() => {
              alert(`در حال دانلود فایل: ${file.name}`);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] rounded-xl font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>دانلود</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onTransfer(file);
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl font-bold transition-all shadow-sm shadow-[#6E1B1B]/20"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>ارسال فایل به همکاران</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
