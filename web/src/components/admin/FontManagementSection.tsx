import React, { useState, useRef } from 'react';
import { Type, Upload, Trash2, Check, Sparkles, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { CustomFont } from '../../types';
import { formatBytes } from '../../lib/utils';

export const FontManagementSection: React.FC = () => {
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
  const [testText, setTestText] = useState('به نام خدا - شرکت مهندسی و اتوماسیون داده‌ورزی (سند رسمی اداری ۱۲۳۴۵)');
  const [previewFontFamily, setPreviewFontFamily] = useState<string>('Vazirmatn');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EBDBCE]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-xs">
            <Type className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm text-[#3A241F]">مدیریت فونت‌های سازمانی و نامه‌نگاری</h3>
            <p className="text-[11px] text-[#8C6F66]">
              بارگذاری فونت‌های اختصاصی (TTF, WOFF, WOFF2, OTF) و انتخاب فونت پیش‌فرض نامه‌های اداری
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-[#FAF5F1] px-3.5 py-1.5 rounded-2xl border border-[#EBDBCE]">
          <span className="text-[11px] font-bold text-[#8C6F66]">تعداد کل فونت‌ها:</span>
          <span className="text-xs font-black text-[#6E1B1B]">{fonts.length} فونت</span>
        </div>
      </div>

      {/* Upload Box & Tester Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Upload Form (5 cols) */}
        <div className="lg:col-span-5 bg-[#FAF5F1]/70 p-5 rounded-2xl border border-[#EBDBCE] space-y-4">
          <div className="flex items-center gap-2 text-xs font-black text-[#3A241F]">
            <Upload className="w-4 h-4 text-[#D34A32]" />
            <span>بارگذاری فونت جدید در سامانه</span>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-[#3A241F] mb-1">
                نام نمایشی فونت (فارسی):
              </label>
              <input
                type="text"
                value={fontName}
                onChange={(e) => setFontName(e.target.value)}
                placeholder="مثلاً: بی نازنین سازمانی، ایران یکان، فونت اختصاصی"
                className="w-full p-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#3A241F] mb-1">
                فایل فونت (فرمت‌های مجاز: TTF, WOFF, WOFF2, OTF):
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.woff,.woff2,.otf"
                onChange={handleFileChange}
                className="hidden"
                id="custom-font-file-input"
              />
              <label
                htmlFor="custom-font-file-input"
                className={`w-full p-3.5 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900'
                    : 'border-[#C98B6A] bg-white hover:border-[#6E1B1B] hover:bg-[#FAF5F1]'
                }`}
              >
                {selectedFile ? (
                  <div className="text-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <div className="font-bold text-xs">{selectedFile.name}</div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">
                      حجم: {formatBytes(selectedFile.size)} • آماده افزودن
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-[#8C6F66]">
                    <Upload className="w-5 h-5 text-[#C98B6A] mx-auto mb-1" />
                    <div className="font-bold text-xs text-[#3A241F]">کلیک کنید یا فایل را اینجا رها کنید</div>
                    <div className="text-[10px] text-[#8C6F66] mt-0.5">حداکثر حجم: ۵ مگابایت</div>
                  </div>
                )}
              </label>
            </div>

            {uploadError && (
              <div className="flex items-center gap-1.5 p-2 bg-red-50 text-red-700 rounded-xl text-[11px] font-bold border border-red-200">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="w-full py-2.5 bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'در حال ثبت...' : 'بارگذاری و افزودن به لیست فونت‌ها'}</span>
            </button>
          </form>
        </div>

        {/* Live Font Tester Box (7 cols) */}
        <div className="lg:col-span-7 bg-[#FAF5F1]/40 p-5 rounded-2xl border border-[#EBDBCE] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-black text-[#3A241F]">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>جعبه تست زنده قلم (Live Font Tester)</span>
              </div>
              <span className="text-[10px] text-[#8C6F66] bg-white px-2 py-0.5 rounded-lg border border-[#EBDBCE]">
                قلم فعال پیش‌نمایش: <b className="text-[#6E1B1B]">{previewFontFamily}</b>
              </span>
            </div>

            <textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="متنی برای تست فونت تایپ کنید..."
              rows={3}
              style={{ fontFamily: previewFontFamily }}
              className="w-full p-4 bg-white border border-[#EBDBCE] rounded-2xl text-base text-[#3A241F] focus:outline-none focus:border-[#6E1B1B] shadow-inner leading-relaxed transition-all"
            />
          </div>

          <div className="bg-white p-3 rounded-xl border border-[#EBDBCE]/70 text-[11px] text-[#8C6F66] flex items-center justify-between">
            <span>💡 جهت مشاهده سریع، روی هر فونت در جدول زیر کلیک کنید تا در این کادر نمایش داده شود.</span>
          </div>
        </div>
      </div>

      {/* Available Fonts Table / Grid */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black text-[#3A241F]">لیست فونت‌های موجود در سامانه</h4>
          <span className="text-[10px] text-[#8C6F66]">
            فونت دارای تیک سبز رنگ به عنوان فونت پیش‌فرض نامه‌ها عمل می‌کند.
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {fonts.map((font) => {
            const isDefaultSelected = defaultFontId === font.id;
            const isPreviewing = previewFontFamily === font.fontFamily;

            return (
              <div
                key={font.id}
                onClick={() => setPreviewFontFamily(font.fontFamily)}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isPreviewing
                    ? 'border-[#6E1B1B] bg-[#FAF5F1] shadow-md scale-[1.01]'
                    : 'border-[#EBDBCE] bg-white hover:border-[#C98B6A] hover:bg-[#FAF5F1]/40'
                }`}
              >
                {/* Top Info */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-[#3A241F]">{font.name}</span>
                      {font.isDefault ? (
                        <span className="text-[9px] font-bold bg-[#EBDBCE]/60 text-[#71554C] px-1.5 py-0.5 rounded-md">
                          سیستمی
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md">
                          آپلود شده
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8C6F66] font-mono mt-0.5">
                      {font.fontFamily} {font.sizeBytes ? `(${formatBytes(font.sizeBytes)})` : ''}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {!font.isDefault && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`آیا از حذف فونت "${font.name}" اطمینان دارید؟`)) {
                            handleDeleteCustomFont(font.id);
                          }
                        }}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="حذف فونت"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sample Display in this specific font */}
                <div
                  style={{ fontFamily: font.fontFamily }}
                  className="p-2.5 bg-white rounded-xl border border-[#EBDBCE]/70 text-sm text-[#3A241F] text-center overflow-hidden text-ellipsis whitespace-nowrap shadow-2xs"
                >
                  به نام خدا • پیش‌نمایش قلم
                </div>

                {/* Default Font Selector Button */}
                <div className="flex items-center justify-between pt-1 border-t border-[#EBDBCE]/60">
                  <span className="text-[10px] text-[#8C6F66]">
                    {isDefaultSelected ? 'فونت پیش‌فرض مکاتبات' : 'انتخاب به عنوان پیش‌فرض:'}
                  </span>
                  {isDefaultSelected ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                      <Check className="w-3 h-3" />
                      <span>پیش‌فرض فعال</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefaultLetterFont(font.id);
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold text-[#6E1B1B] hover:bg-[#6E1B1B] hover:text-white bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg transition-all cursor-pointer"
                    >
                      تنظیم به عنوان پیش‌فرض
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
