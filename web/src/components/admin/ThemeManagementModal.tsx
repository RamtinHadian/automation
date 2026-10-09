import { createPortal } from 'react-dom';
import React from 'react';
import {
  X,
  Check,
  Palette,
  Sparkles,
  Sliders,
  Paintbrush
} from 'lucide-react';
import { COLOR_THEMES } from '../../lib/theme';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';

interface ThemeManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeManagementModal: React.FC<ThemeManagementModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentTheme, setTheme, showToast } = useAppContext();

  if (!isOpen) return null;

  const handleSelectTheme = (themeId: string) => {
    setTheme(themeId);
    const chosen = COLOR_THEMES.find((t) => t.id === themeId);
    showToast(`پالت رنگی سامانه به "${chosen?.name || themeId}" تغییر یافت.`);
  };

  const activeThemeObj = COLOR_THEMES.find((t) => t.id === currentTheme) || COLOR_THEMES[0];

  // Rendered on the page itself, not inside the settings form: a button inside it would submit that form.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in select-none font-sans">
      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 bg-[#FAF5F1] border-b border-[#EBDBCE] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-xs">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-[#3A241F]">
                  مدیریت و انتخاب پالت‌های رنگی سامانه
                </h2>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-300">
                  تم فعال: {activeThemeObj.name}
                </span>
              </div>
              <p className="text-xs text-[#8C6F66] mt-0.5">
                تغییر هویت بصری، دکمه‌ها، سربرگ‌ها و پوسته‌های رسمی سازمانی با یک کلیک
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#8C6F66] hover:text-[#3A241F] hover:bg-white rounded-xl transition-colors cursor-pointer border border-transparent hover:border-[#EBDBCE]"
            title="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-white">
          <div className="flex items-center justify-between pb-2 border-b border-[#EBDBCE]/60">
            <span className="text-xs font-black text-[#3A241F]">
              تعداد پالت‌های آماده: {toPersianDigits(COLOR_THEMES.length)} تم سازمانی
            </span>
            <span className="text-[11px] text-[#8C6F66]">
              تم انتخاب‌شده به صورت خودکار برای حساب شما ذخیره می‌شود
            </span>
          </div>

          {/* Theme Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {COLOR_THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer text-right flex flex-col justify-between space-y-3.5 ${
                    isSelected
                      ? 'border-[#6E1B1B] bg-[#FAF5F1] shadow-md ring-2 ring-[#6E1B1B]/20 scale-[1.01]'
                      : 'border-[#EBDBCE] bg-white hover:border-[#C98B6A] hover:bg-[#FAF5F1]/50 shadow-2xs'
                  }`}
                >
                  {/* Theme Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-xs text-[#3A241F]">{theme.name}</span>
                        {isSelected && (
                          <span className="bg-[#6E1B1B] text-white p-0.5 rounded-full shadow-2xs">
                            <Check className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#8C6F66] mt-1 leading-relaxed">
                        {theme.description}
                      </p>
                    </div>
                  </div>

                  {/* Swatch Colors Bar */}
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white border border-[#EBDBCE]/80 shadow-inner">
                    {theme.swatchColors.map((col, idx) => (
                      <div
                        key={idx}
                        className="flex-1 h-5 rounded-lg shadow-2xs border border-black/10 flex items-center justify-center text-[9px] font-mono text-white"
                        style={{ backgroundColor: col }}
                        title={col}
                      />
                    ))}
                  </div>

                  {/* Action Preview */}
                  <div className="flex items-center justify-between pt-1 border-t border-[#EBDBCE]/60 text-[10px] font-bold">
                    <span className="text-[#8C6F66]">
                      {isSelected ? 'تم فعال سامانه' : 'پیش‌نمایش دکمه:'}
                    </span>
                    <span
                      className={`px-3 py-1 rounded-lg text-white font-black text-[10px] shadow-2xs transition-all ${
                        isSelected ? 'ring-2 ring-white ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: theme.primary }}
                    >
                      {isSelected ? '✓ تم فعال' : 'انتخاب این تم'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 bg-[#FAF5F1] border-t border-[#EBDBCE] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#6E1B1B]/20 cursor-pointer"
          >
            تایید و بازگشت
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
