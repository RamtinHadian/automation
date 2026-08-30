import React, { useState } from 'react';
import {
  Save,
  Shield,
  FileCheck,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Plus,
  X
} from 'lucide-react';
import { SystemSettings } from '../../types';

interface SettingsViewProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings: initialSettings,
  onSaveSettings,
}) => {
  const [settings, setSettings] = useState<SystemSettings>(initialSettings);
  const [newExt, setNewExt] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleAddExtension = () => {
    const clean = newExt.trim().toLowerCase().replace('.', '');
    if (clean && !settings.allowedFileTypes.includes(clean)) {
      setSettings({
        ...settings,
        allowedFileTypes: [...settings.allowedFileTypes, clean],
      });
      setNewExt('');
    }
  };

  const handleRemoveExtension = (ext: string) => {
    setSettings({
      ...settings,
      allowedFileTypes: settings.allowedFileTypes.filter((e) => e !== ext),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(settings);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 select-none max-w-4xl font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">
              تنظیمات امنیتی و خط‌مشی‌های انتقال فایل
            </h1>
            <span className="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              خط‌مشی سراسری
            </span>
          </div>
          <p className="text-xs text-gray-500">
            تعیین لیست پسوندهای مجاز، سقف حجم بارگذاری فایل و زمان انقضای نشست‌های کاری
          </p>
        </div>

        <button
          type="submit"
          className="flex items-center gap-2 bg-[#1967d2] hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95"
        >
          <Save className="w-4 h-4" />
          <span>ذخیره خط‌مشی‌های سیستم</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>خط‌مشی‌های امنیتی با موفقیت ذخیره و در کلیه گره‌های شبکه اعمال گردید.</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Limits */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-gray-900">
            <HardDrive className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-sm">سقف حجم و سهمیه‌های فضا</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                حداکثر سقف مجاز برای هر فایل بارگذاری
              </label>
              <select
                value={settings.maxUploadSizeBytes}
                onChange={(e) =>
                  setSettings({ ...settings, maxUploadSizeBytes: parseInt(e.target.value) })
                }
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800"
              >
                <option value={1073741824}>۱ گیگابایت (استاندارد)</option>
                <option value={2147483648}>۲ گیگابایت (متوسط)</option>
                <option value={5368709120}>۵ گیگابایت (پیش‌فرض پیشنهادی)</option>
                <option value={10737418240}>۱۰ گیگابایت (مخصوص داده‌های حجیم)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                سهمیه پیش‌فرض فضای ابری هر کارمند جدید
              </label>
              <select
                value={settings.defaultUserQuotaGB}
                onChange={(e) =>
                  setSettings({ ...settings, defaultUserQuotaGB: parseInt(e.target.value) })
                }
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800"
              >
                <option value={10}>۱۰ گیگابایت به ازای هر کارمند</option>
                <option value={25}>۲۵ گیگابایت به ازای هر کارمند</option>
                <option value={50}>۵۰ گیگابایت به ازای هر کارمند</option>
                <option value={100}>۱۰۰ گیگابایت به ازای هر کارمند</option>
              </select>
            </div>
          </div>
        </div>

        {/* Authentication & Security */}
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-gray-900">
            <Clock className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-sm">مدت نشست کاری و نگهداری فایل‌ها</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-gray-700 mb-1">
                مدت زمان انقضای نشست ورود (Session Timeout)
              </label>
              <select
                value={settings.sessionTimeoutMinutes}
                onChange={(e) =>
                  setSettings({ ...settings, sessionTimeoutMinutes: parseInt(e.target.value) })
                }
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800"
              >
                <option value={15}>۱۵ دقیقه (امنیت بالا)</option>
                <option value={30}>۳۰ دقیقه</option>
                <option value={60}>۶۰ دقیقه (۱ ساعت - پیش‌فرض)</option>
                <option value={480}>۸ ساعت (شیفت کاری کامل)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">
                مدت پاکسازی خودکار فایل‌های سطل زباله و انتقالات منقضی
              </label>
              <select
                value={settings.autoPurgeDays}
                onChange={(e) =>
                  setSettings({ ...settings, autoPurgeDays: parseInt(e.target.value) })
                }
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800"
              >
                <option value={7}>پاکسازی پس از ۷ روز</option>
                <option value={14}>پاکسازی پس از ۱۴ روز</option>
                <option value={30}>پاکسازی پس از ۳۰ روز</option>
                <option value={90}>پاکسازی پس از ۹۰ روز</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Allowed File Extensions Whitelist */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-gray-900">
            <FileCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-sm">لیست سفید پسوندهای مجاز فایل</h3>
          </div>
          <span className="text-xs text-gray-500 font-bold">
            {settings.allowedFileTypes.length} پسوند مجاز
          </span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newExt}
            onChange={(e) => setNewExt(e.target.value)}
            placeholder="مثال: mp3, figma, sketch, sql..."
            className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddExtension}
            className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن پسوند</span>
          </button>
        </div>

        {/* Extension Chips */}
        <div className="flex flex-wrap gap-2 pt-2">
          {settings.allowedFileTypes.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors"
            >
              .{ext}
              <button
                type="button"
                onClick={() => handleRemoveExtension(ext)}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    </form>
  );
};
