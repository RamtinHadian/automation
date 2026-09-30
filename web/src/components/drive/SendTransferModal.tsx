import React, { useState } from 'react';
import {
  X,
  Send,
  UserCheck,
  Search,
  Check,
  Lock,
  Calendar,
  FileText,
  Building,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { User, FileItem, FileTransfer } from '../../types';
import { STAFF_USERS, DEPARTMENTS } from '../../lib/mock-data';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';

interface SendTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileToTransfer: FileItem | null;
  allFiles: FileItem[];
  currentUser: User;
  onSendTransfer: (transfer: FileTransfer) => void;
}

export const SendTransferModal: React.FC<SendTransferModalProps> = ({
  isOpen,
  onClose,
  fileToTransfer,
  allFiles,
  currentUser,
  onSendTransfer,
}) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(fileToTransfer?.id || (allFiles[0]?.id ?? ''));
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [searchStaff, setSearchStaff] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [maxDownloads, setMaxDownloads] = useState('5');
  const [isEncrypted, setIsEncrypted] = useState(false);

  if (!isOpen) return null;

  const currentFile = allFiles.find((f) => f.id === (fileToTransfer?.id || selectedFileId)) || allFiles[0];

  const availableStaff = STAFF_USERS.filter((user) => {
    if (user.id === currentUser.id) return false;
    const matchesSearch =
      user.fullName.toLowerCase().includes(searchStaff.toLowerCase()) ||
      user.email.toLowerCase().includes(searchStaff.toLowerCase()) ||
      user.departmentName.toLowerCase().includes(searchStaff.toLowerCase());
    const matchesDept = selectedDept === 'ALL' || user.departmentId === selectedDept;
    return matchesSearch && matchesDept;
  });

  const toggleRecipient = (userId: string) => {
    setRecipientIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSend = () => {
    if (!currentFile || recipientIds.length === 0) return;

    const chosenRecipients = STAFF_USERS.filter((u) => recipientIds.includes(u.id));

    const newTransfer: FileTransfer = {
      id: 'tr-' + Math.random().toString(36).substring(2, 9),
      fileId: currentFile.id,
      fileName: currentFile.name,
      fileSize: currentFile.size,
      category: currentFile.category,
      sender: currentUser,
      recipients: chosenRecipients,
      note: note.trim() || 'انتقال سند درون‌سازمانی',
      status: 'DELIVERED',
      sentAt: formatCurrentJalaliDateTime(),
      expiresAt: `تا ${toPersianDigits(expiresInDays)} روز دیگر`,
      downloadsCount: 0,
      maxDownloads: parseInt(maxDownloads) || 5,
      isEncrypted,
    };

    onSendTransfer(newTransfer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EBDBCE] bg-[#FAF5F1]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#3A241F]">انتقال درون‌سازمانی فایل</h3>
              <p className="text-[11px] text-[#8C6F66]">ارسال مستقیم، امن و دارای ردیابی ممیزی برای همکاران</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8C6F66] hover:text-[#3A241F] p-1.5 rounded-full hover:bg-[#EBDBCE]/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* File Selector */}
          <div>
            <label className="block text-[11px] font-bold text-[#3A241F] uppercase tracking-wider mb-1.5">
              انتخاب سند جهت ارسال
            </label>
            <select
              value={selectedFileId}
              onChange={(e) => setSelectedFileId(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none cursor-pointer"
            >
              {allFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name} ({file.size})
                </option>
              ))}
            </select>
          </div>

          {/* Recipients Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-[#3A241F] uppercase tracking-wider">
                انتخاب همکاران گیرنده ({toPersianDigits(recipientIds.length)} نفر انتخاب شده)
              </label>
              <div className="text-[10px] text-[#8C6F66]">چندانتخابی مجاز است</div>
            </div>

            {/* Department Filter & Search */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-[#B8A39C] absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchStaff}
                  onChange={(e) => setSearchStaff(e.target.value)}
                  placeholder="جستجو در همکاران..."
                  className="w-full pr-8 pl-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                />
              </div>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-2.5 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] focus:outline-none"
              >
                <option value="ALL">همه واحدها</option>
                {DEPARTMENTS.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Staff list cards */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-1 bg-[#FAF5F1]/50 rounded-2xl border border-[#EBDBCE]">
              {availableStaff.map((staff) => {
                const isSelected = recipientIds.includes(staff.id);
                return (
                  <div
                    key={staff.id}
                    onClick={() => toggleRecipient(staff.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-[#F6D9CD] border border-[#C98B6A]/50 text-[#3A241F]'
                        : 'bg-white hover:bg-[#FAF5F1] border border-transparent text-[#3A241F]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={staff.avatarUrl}
                        alt={staff.fullName}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <div>
                        <div className="font-bold text-[11px]">{staff.fullName}</div>
                        <div className="text-[10px] text-[#8C6F66]">{staff.departmentName}</div>
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-[#6E1B1B] text-white'
                          : 'border border-[#EBDBCE]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Message / Note */}
          <div>
            <label className="block text-[11px] font-bold text-[#3A241F] uppercase tracking-wider mb-1.5">
              یادداشت یا توضیحات ضمیمه
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: لطفاً تا قبل از جلسه هیئت مدیره بخش‌های مالی را بررسی فرمایید..."
              className="w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none placeholder:text-[#B8A39C]"
            />
          </div>

          {/* Security & Expiration Options */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-[#3A241F] uppercase mb-1">
                مدت اعتبار لینک
              </label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg text-xs font-medium text-[#3A241F]"
              >
                <option value="1">۱ روز</option>
                <option value="3">۳ روز</option>
                <option value="7">۷ روز (پیش‌فرض)</option>
                <option value="14">۱۴ روز</option>
                <option value="30">۳۰ روز</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#3A241F] uppercase mb-1">
                سقف مجاز تعداد دانلود
              </label>
              <select
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg text-xs font-medium text-[#3A241F]"
              >
                <option value="1">فقط ۱ بار دانلود</option>
                <option value="5">حداکثر ۵ بار</option>
                <option value="10">حداکثر ۱۰ بار</option>
                <option value="999">نامحدود</option>
              </select>
            </div>
          </div>

          {/* Encryption Toggle */}
          <div className="flex items-center justify-between p-3 bg-[#FAF5F1] rounded-xl border border-[#EBDBCE]">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#6E1B1B]" />
              <div>
                <div className="font-bold text-[#3A241F]">رمزنگاری سرتاسری (E2EE)</div>
                <div className="text-[10px] text-[#8C6F66]">رمزگذاری با کلیدهای اختصاصی سازمانی بر پایه AES-256</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isEncrypted}
              onChange={(e) => setIsEncrypted(e.target.checked)}
              className="w-4 h-4 accent-[#6E1B1B] rounded"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#FAF5F1] border-t border-[#EBDBCE]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:text-[#3A241F] rounded-xl hover:bg-[#EBDBCE]/60 transition-colors"
          >
            انصراف
          </button>
          <button
            onClick={handleSend}
            disabled={recipientIds.length === 0 || !currentFile}
            className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm ${
              recipientIds.length > 0 && currentFile
                ? 'bg-[#6E1B1B] text-white hover:bg-[#D34A32] shadow-[#6E1B1B]/20'
                : 'bg-[#EAE5E3] text-[#B8A39C] cursor-not-allowed'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>ارسال برای {toPersianDigits(recipientIds.length)} نفر از همکاران</span>
          </button>
        </div>
      </div>
    </div>
  );
};
