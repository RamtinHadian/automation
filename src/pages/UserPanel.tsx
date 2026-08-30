import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Send,
  Download,
  CheckCircle2,
  Inbox,
  Search,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  FileCode,
  ArrowLeftRight,
} from 'lucide-react';
import { FileCategory } from '../types';
import { formatBytes, getFileCategory } from '../lib/utils';
import { toPersianDigits } from '../lib/jalali';
import { useAppContext } from '../context/AppContext';

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
      return <FileText className="w-5 h-5 text-blue-500" />;
  }
};

export default function UserPanel() {
  const {
    staffList,
    currentUser,
    setCurrentUser,
    transfers,
    toastMessage,
    showToast,
    handleSendTransfer,
    handleDownload,
    handleDeleteTransfer,
  } = useAppContext();

  const [selectedFile, setSelectedFile] = useState<{
    file: globalThis.File;
    name: string;
    size: number;
    formattedSize: string;
    category: FileCategory;
  } | null>(null);

  const [recipientId, setRecipientId] = useState<string>(
    staffList.find((u) => u.id !== currentUser.id)?.id || ''
  );
  const [note, setNote] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [searchReceived, setSearchReceived] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFilePicked = (rawFile: globalThis.File) => {
    setSelectedFile({
      file: rawFile,
      name: rawFile.name,
      size: rawFile.size,
      formattedSize: formatBytes(rawFile.size),
      category: getFileCategory(rawFile.name),
    });
  };

  const onSend = () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);
    setUploadProgress(0);

    handleSendTransfer({
      rawFile: selectedFile.file,
      recipientId,
      note,
      onProgress: (p) => setUploadProgress(p),
      onDone: () => {
        setIsUploading(false);
        setSelectedFile(null);
        setNote('');
      },
    });
  };

  const receivedFiles = transfers.filter((t) => {
    const isRecipient = t.recipients.some((r) => r.id === currentUser.id);
    const matchesSearch =
      t.fileName.toLowerCase().includes(searchReceived.toLowerCase()) ||
      t.sender.fullName.toLowerCase().includes(searchReceived.toLowerCase());
    return isRecipient && matchesSearch;
  });

  return (
    <div
      className="min-h-screen bg-[#195de6] p-3 sm:p-6 lg:p-8 flex items-center justify-center font-sans antialiased text-gray-900"
      dir="rtl"
    >
      <div className="w-full max-w-6xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-blue-400/30 flex flex-col min-h-[780px]">

        {/* Header */}
        <header className="px-6 sm:px-8 py-4 bg-white border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#1967d2] text-white flex items-center justify-center shadow-md">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-black text-lg text-gray-900 leading-tight">
                سامانه انتقال فایل سازمانی
              </h1>
              <p className="text-[11px] text-gray-500 font-medium">
                ارسال و دریافت مستقیم فایل میان همکاران
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* User quick-switch */}
            <div className="flex items-center gap-2 bg-blue-50/80 p-1.5 pr-3 rounded-2xl border border-blue-100">
              <div className="text-right">
                <div className="text-xs font-black text-blue-950">{currentUser.fullName}</div>
                <div className="text-[10px] text-blue-600 font-bold">{currentUser.departmentName}</div>
              </div>
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const u = staffList.find((user) => user.id === e.target.value);
                  if (u) {
                    setCurrentUser(u);
                    setRecipientId(staffList.find((usr) => usr.id !== u.id)?.id || '');
                    showToast(`حساب کاربری فعال: ${u.fullName}`);
                  }
                }}
                className="bg-white text-xs font-bold text-gray-700 py-1.5 px-2 rounded-xl border border-blue-200 focus:outline-none cursor-pointer"
              >
                {staffList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role === 'SUPER_ADMIN' ? 'مدیر ارشد' : u.departmentName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Main Content: Split screen */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-gray-100">

          {/* Send Panel */}
          <section className="lg:col-span-5 p-6 sm:p-8 bg-gray-50/40 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-gray-900">ارسال فایل به همکار</h2>
                  <p className="text-[11px] text-gray-500">فایل را انتخاب و گیرنده را مشخص کنید</p>
                </div>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFilePicked(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${selectedFile
                    ? 'border-blue-500 bg-blue-50/50'
                    : dragActive
                      ? 'border-blue-600 bg-blue-100/40 scale-[0.99]'
                      : 'border-gray-200 hover:border-blue-400 hover:bg-white bg-white/60'
                  }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleFilePicked(e.target.files[0]);
                  }}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
                      {renderCategoryIcon(selectedFile.category)}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-gray-900 truncate max-w-xs">{selectedFile.name}</div>
                      <div className="text-[11px] text-blue-600 font-black mt-0.5">حجم: {selectedFile.formattedSize}</div>
                    </div>
                    <span className="text-[10px] text-gray-400 hover:text-red-500 font-bold mt-1">کلیک برای تغییر فایل</span>
                  </div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-800">
                        <span className="text-blue-600 underline">انتخاب فایل</span> یا کشیدن به این بخش
                      </p>
                      <p className="text-[10px] text-gray-400 font-medium">
                        پشتیبانی از کلیه فرمت‌ها (PDF، Office، تصاویر، ZIP، کد)
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Recipient */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-700">انتخاب گیرنده (همکار / واحد):</label>
                <select
                  value={recipientId}
                  onChange={(e) => setRecipientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none shadow-xs cursor-pointer"
                >
                  {staffList.filter((u) => u.id !== currentUser.id).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName} — {user.departmentName} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-700">پیام یا توضیحات ضمیمه:</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="توضیح اختیاری درباره فایل ارسالی..."
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none placeholder:text-gray-400 shadow-xs"
                />
              </div>

              {/* Progress */}
              {isUploading && (
                <div className="space-y-1.5 bg-white p-3.5 rounded-2xl border border-blue-100 shadow-xs">
                  <div className="flex justify-between text-[10px] font-black text-blue-900">
                    <span>در حال بارگذاری و ارسال امن...</span>
                    <span>{toPersianDigits(uploadProgress)}٪</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#1967d2] h-full rounded-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Send Button */}
            <button
              onClick={onSend}
              disabled={!selectedFile || isUploading}
              className={`w-full py-3.5 px-5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${selectedFile && !isUploading
                  ? 'bg-[#1967d2] hover:bg-blue-700 text-white shadow-blue-500/25'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
            >
              <Send className="w-4 h-4" />
              <span>ارسال فایل به گیرنده</span>
            </button>
          </section>

          {/* Inbox Panel */}
          <section className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-5 bg-white">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Inbox className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-gray-900">فایل‌های دریافتی شما</h2>
                    <p className="text-[11px] text-gray-500">
                      {toPersianDigits(receivedFiles.length)} فایل تحویل داده شده
                    </p>
                  </div>
                </div>
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    value={searchReceived}
                    onChange={(e) => setSearchReceived(e.target.value)}
                    placeholder="جستجو در دریافتی‌ها..."
                    className="w-full pr-8 pl-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:outline-none"
                  />
                </div>
              </div>

              {receivedFiles.length === 0 ? (
                <div className="text-center py-16 bg-gray-50/60 rounded-3xl border border-dashed border-gray-200">
                  <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-2.5">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-800">صندوق فایل‌های دریافتی خالی است</h3>
                  <p className="text-[11px] text-gray-400 max-w-xs mx-auto mt-1">
                    فایل‌هایی که سایر همکاران برای حساب شما ارسال کنند در این بخش قرار می‌گیرند.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pl-1">
                  {receivedFiles.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 bg-white rounded-2xl border border-gray-200/90 hover:border-blue-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    >
                      <div className="flex items-start gap-3.5 truncate">
                        <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 shrink-0">
                          {renderCategoryIcon(t.category)}
                        </div>
                        <div className="space-y-1 truncate">
                          <h3 className="font-bold text-xs text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                            {t.fileName}
                          </h3>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">{t.fileSize}</span>
                            <span>•</span>
                            <span>فرستنده: <b>{t.sender.fullName}</b> ({t.sender.departmentName})</span>
                            <span>•</span>
                            <span className="font-mono">{t.sentAt}</span>
                          </div>
                          {t.note && (
                            <p className="text-[11px] text-gray-600 bg-gray-50/80 p-1.5 rounded-lg border border-gray-100 italic">
                              "{t.note}"
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleDownload(t)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-[#1967d2] hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95"
                          title="دانلود فایل"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>دانلود</span>
                        </button>
                        <button
                          onClick={() => handleDeleteTransfer(t.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1.5 font-bold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> اتصال شبکه سازمانی فعال و امن
              </span>
              <span>رمزنگاری فعال • تقویم هجری شمسی</span>
            </div>
          </section>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-6 z-50 bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
