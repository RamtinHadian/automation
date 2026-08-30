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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900">انتقال درون‌سازمانی فایل</h3>
              <p className="text-[11px] text-gray-500">ارسال مستقیم، امن و دارای ردیابی ممیزی برای همکاران</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* File Selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              انتخاب سند جهت ارسال
            </label>
            <select
              value={currentFile?.id || ''}
              onChange={(e) => setSelectedFileId(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none"
            >
              {allFiles.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.name} ({file.size})
                </option>
              ))}
            </select>
          </div>

          {/* Employee Directory Recipient Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                انتخاب گیرندگان ({toPersianDigits(recipientIds.length)} نفر انتخاب شده)
              </label>
              <span className="text-[11px] text-blue-600 font-bold">
                قابلیت انتخاب چندگانه
              </span>
            </div>

            {/* Department Filter & Search */}
            <div className="flex gap-2 mb-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchStaff}
                  onChange={(e) => setSearchStaff(e.target.value)}
                  placeholder="جستجو با نام، ایمیل یا واحد..."
                  className="w-full pr-8 pl-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-100 focus:outline-none"
              >
                <option value="ALL">همه واحدها</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Staff List Checklist */}
            <div className="border border-gray-200 rounded-2xl p-2 max-h-40 overflow-y-auto divide-y divide-gray-100">
              {availableStaff.map((staff) => {
                const isSelected = recipientIds.includes(staff.id);
                return (
                  <div
                    key={staff.id}
                    onClick={() => toggleRecipient(staff.id)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50/80 font-bold text-blue-900' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={staff.avatarUrl}
                        alt={staff.fullName}
                        className="w-6 h-6 rounded-full object-cover ring-1 ring-gray-200"
                      />
                      <div>
                        <div className="text-xs font-bold">{staff.fullName}</div>
                        <div className="text-[10px] text-gray-400">
                          {staff.departmentName} • {staff.email}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-300 bg-white'
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
            <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              یادداشت یا توضیحات ضمیمه
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: لطفاً تا قبل از جلسه هیئت مدیره بخش‌های مالی را بررسی فرمایید..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Security & Expiration Options */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                مدت اعتبار لینک
              </label>
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium"
              >
                <option value="1">۱ روز</option>
                <option value="3">۳ روز</option>
                <option value="7">۷ روز (پیش‌فرض)</option>
                <option value="14">۱۴ روز</option>
                <option value="30">۳۰ روز</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1">
                سقف مجاز تعداد دانلود
              </label>
              <select
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium"
              >
                <option value="1">فقط ۱ بار دانلود</option>
                <option value="5">حداکثر ۵ بار</option>
                <option value="10">حداکثر ۱۰ بار</option>
                <option value="999">نامحدود</option>
              </select>
            </div>
          </div>

          {/* Encryption Toggle */}
          <div className="flex items-center justify-between p-3 bg-blue-50/50 rounded-xl border border-blue-100">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              <div>
                <div className="font-bold text-gray-800">رمزنگاری سرتاسری (E2EE)</div>
                <div className="text-[10px] text-gray-500">رمزگذاری با کلیدهای اختصاصی سازمانی بر پایه AES-256</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isEncrypted}
              onChange={(e) => setIsEncrypted(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-200/60 transition-colors"
          >
            انصراف
          </button>
          <button
            onClick={handleSend}
            disabled={recipientIds.length === 0 || !currentFile}
            className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm ${
              recipientIds.length > 0 && currentFile
                ? 'bg-[#1967d2] text-white hover:bg-blue-700 shadow-blue-500/20'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
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
