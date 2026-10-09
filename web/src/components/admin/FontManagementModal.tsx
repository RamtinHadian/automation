import { createPortal } from 'react-dom';
import React, { useState, useRef } from 'react';
import { Type, Upload, Trash2, Check, Sparkles, AlertCircle, FileText, CheckCircle2, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { CustomFont } from '../../types';
import { formatBytes } from '../../lib/utils';
import { toPersianDigits } from '../../lib/jalali';

interface FontManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FontManagementModal: React.FC<FontManagementModalProps> = ({ isOpen, onClose }) => {
  const {
    fonts,
    settings,
    handleAddCustomFont,
    handleDeleteCustomFont,
    handleSetDefaultLetterFont,
    showToast,
  } = useAppContext();

  const [fontName, setFontName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [fontFamilyName, setFontFamilyName] = useState('');
  const [testText, setTestText] = useState('به نام خدا - شرکت مهندسی و اتوماسیون سازمانی (سند رسمی اداری ۱۲۳۴۵)');
  const [previewFontFamily, setPreviewFontFamily] = useState<string>('Vazirmatn');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const defaultFontId = settings.defaultLetterFontId || 'vazirmatn';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['ttf', 'woff', 'woff2', 'otf'].includes(ext || '')) {
      setUploadError('فرمت فایل نامعتبر است. لطفاً یکی از فرمت‌های TTF, WOFF, WOFF2 یا OTF را انتخاب کنید.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('حجم فایل فونت نمی‌تواند بیشتر از ۵ مگابایت باشد.');
      return;
    }

    setSelectedFile(file);

    // Default friendly font name
    const rawName = file.name.replace(/\.[^/.]+$/, '');
    if (!fontName) {
      setFontName(rawName);
    }
    const cleanFamily = 'CustomFont_' + rawName.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Math.floor(Math.random() * 1000);
    setFontFamilyName(cleanFamily);

    // Read as Data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFileDataUrl(result);

      // Create a temporary font-face rule to preview right away
      try {
        const tempFormat = ext === 'woff2' ? 'woff2' : ext === 'woff' ? 'woff' : ext === 'otf' ? 'opentype' : 'truetype';
        const fontFace = new FontFace(cleanFamily, `url(${result})`, { style: 'normal', weight: 'normal' });
        fontFace.load().then((loaded) => {
          document.fonts.add(loaded);
          setPreviewFontFamily(cleanFamily);
        });
      } catch (err) {
        console.warn('FontFace preview load error:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // the dialog is inside the settings form (React events cross portals): do not also save that form
    if (!selectedFile || !fileDataUrl) {
      setUploadError('لطفاً یک فایل فونت معتبر انتخاب کنید.');
      return;
    }

    const trimmedName = fontName.trim();
    if (!trimmedName) {
      setUploadError('لطفاً نام نمایشی فونت را وارد کنید.');
      return;
    }

    setIsUploading(true);

    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    let format: CustomFont['format'] = 'truetype';
    if (ext === 'woff2') format = 'woff2';
    else if (ext === 'woff') format = 'woff';
    else if (ext === 'otf') format = 'opentype';

    try {
      handleAddCustomFont({
        name: trimmedName,
        fontFamily: fontFamilyName,
        fileName: selectedFile.name,
        format,
        dataUrl: fileDataUrl,
        sizeBytes: selectedFile.size,
      });

      // Reset form
      setSelectedFile(null);
      setFileDataUrl(null);
      setFontName('');
      setFontFamilyName('');
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError('خطا در ذخیره‌سازی فونت.');
    } finally {
      setIsUploading(false);
    }
  };

  // Rendered on the page itself, not inside the settings form: a button inside it would submit that form.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto animate-in fade-in select-none font-sans">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-[#EBDBCE] flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="bg-[#3A241F] text-white px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#563D34]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-md">
              <Type className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-white">مشاهده، انتخاب و مدیریت انواع فونت‌های سازمانی</h2>
              <p className="text-[11px] text-[#C98B6A] mt-0.5">
                انتخاب قلم پیش‌فرض نامه‌ها، بررسی پیش‌نمایش زنده نگارش و بارگذاری فونت‌های دلخواه (TTF, WOFF2, OTF)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#C98B6A] hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#FAF5F1]/40">
          {/* Live Text Preview Box */}
          <div className="p-4 bg-white rounded-2xl border border-[#EBDBCE] shadow-xs space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[#3A241F]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#6E1B1B]" />
                <span>متن آزمایشی جهت مشاهده نحوه نگارش قلم:</span>
              </span>
              <span className="text-[10px] text-[#8C6F66] font-mono">
                قلم در حال مشاهده: <b className="text-[#6E1B1B]">{previewFontFamily}</b>
              </span>
            </div>
            <input
              type="text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              style={{ fontFamily: previewFontFamily }}
              className="w-full p-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-sm font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none transition-all"
              placeholder="یک جمله برای تست فونت تایپ کنید..."
            />
          </div>

          {/* Available Fonts Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-xs text-[#3A241F]">
                فهرست فونت‌های موجود در سامانه ({toPersianDigits(fonts.length)} قلم):
              </h3>
              <span className="text-[10px] text-[#8C6F66]">
                برای تنظیم به عنوان فونت پیش‌فرض روی دکمه «انتخاب به عنوان پیش‌فرض» کلیک کنید
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {fonts.map((f) => {
                const isDefault = f.id === defaultFontId;
                const isSelectedForPreview = previewFontFamily === f.fontFamily;

                return (
                  <div
                    key={f.id}
                    onClick={() => setPreviewFontFamily(f.fontFamily)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
                      isDefault
                        ? 'bg-emerald-50/60 border-emerald-400 shadow-sm'
                        : isSelectedForPreview
                        ? 'bg-white border-[#6E1B1B] shadow-md scale-[1.01]'
                        : 'bg-white border-[#EBDBCE] hover:border-[#C98B6A] hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="font-black text-xs text-[#3A241F] truncate" title={f.name}>
                          {f.name}
                        </div>
                        {isDefault ? (
                          <span className="bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 flex items-center gap-0.5">
                            <Check className="w-2.5 h-2.5" />
                            <span>پیش‌فرض نامه‌ها</span>
                          </span>
                        ) : f.dataUrl ? (
                          <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                            سفارشی
                          </span>
                        ) : (
                          <span className="bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0">
                            سیستمی
                          </span>
                        )}
                      </div>

                      {/* Font Sample Render */}
                      <div
                        style={{ fontFamily: f.fontFamily }}
                        className="text-base font-bold text-[#222] py-2 px-1 text-center bg-[#FAF5F1] rounded-xl border border-[#EBDBCE]/60 truncate"
                      >
                        نامه رسمی اداری ۱۲۳۴۵
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#EBDBCE]/60 text-[10px]">
                      {!isDefault ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefaultLetterFont(f.id);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-emerald-600 text-[#3A241F] hover:text-white border border-[#EBDBCE] hover:border-emerald-600 rounded-lg font-bold transition-all cursor-pointer"
                        >
                          تنظیم پیش‌فرض
                        </button>
                      ) : (
                        <span className="text-emerald-700 font-bold">فونت فعال اسناد</span>
                      )}

                      {f.dataUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`آیا از حذف فونت "${f.name}" اطمینان دارید؟`)) {
                              handleDeleteCustomFont(f.id);
                            }
                          }}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف فونت سفارشی"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload Custom Font Section */}
          <div className="p-5 bg-white rounded-2xl border border-dashed border-[#C98B6A] space-y-4">
            <div className="flex items-center gap-2 text-[#3A241F]">
              <Upload className="w-4 h-4 text-[#6E1B1B]" />
              <h4 className="font-black text-xs text-[#3A241F]">بارگذاری و نصب قلم سازمانی جدید</h4>
            </div>

            <form onSubmit={handleUploadSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5 space-y-1">
                <label className="block text-[11px] font-bold text-[#3A241F]">
                  نام نمایشی قلم:
                </label>
                <input
                  type="text"
                  value={fontName}
                  onChange={(e) => setFontName(e.target.value)}
                  placeholder="مثال: ایران سنس، بی زر، شکسته و..."
                  className="w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="block text-[11px] font-bold text-[#3A241F]">
                  فایل فونت (TTF, WOFF, WOFF2):
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".ttf,.woff,.woff2,.otf"
                  onChange={handleFileChange}
                  className="w-full text-[11px] file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-[#6E1B1B] file:text-white hover:file:bg-[#D34A32] cursor-pointer"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={!selectedFile || isUploading}
                  className="w-full py-2 bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {isUploading ? 'در حال نصب...' : 'نصب و افزودن قلم'}
                </button>
              </div>
            </form>

            {uploadError && (
              <div className="text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-lg border border-rose-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-white px-6 py-3 border-t border-[#EBDBCE] flex items-center justify-between shrink-0">
          <div className="text-xs text-[#8C6F66]">
            قلم انتخاب‌شده برای پیش‌نمایش: <span className="font-bold text-[#3A241F]">{previewFontFamily}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
          >
            تایید و بستن
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
