import React from 'react';
import { Check, Palette, Sparkles } from 'lucide-react';
import { COLOR_THEMES } from '../../lib/theme';
import { useAppContext } from '../../context/AppContext';

export const ThemeSelector: React.FC = () => {
  const { currentTheme, setTheme, showToast } = useAppContext();

  const handleSelectTheme = (themeId: string) => {
    setTheme(themeId);
    const chosen = COLOR_THEMES.find((t) => t.id === themeId);
    showToast(`پالت رنگی حساب کاربری شما به "${chosen?.name}" تغییر یافت.`);
  };

  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center justify-between pb-2 border-b border-[#EBDBCE]/60">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-xs">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-sm text-[#3A241F]">پالت رنگی اختصاصی شما</h3>
            <p className="text-[11px] text-[#8C6F66]">
              مدل رنگبندی دلخواه خود را انتخاب کنید (این تم منحصراً برای حساب کاربری شما ذخیره و اعمال می‌شود):
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
        {COLOR_THEMES.map((theme) => {
          const isSelected = currentTheme === theme.id;
          return (
            <div
              key={theme.id}
              onClick={() => handleSelectTheme(theme.id)}
              className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer text-right flex flex-col justify-between space-y-3 ${
                isSelected
                  ? 'border-[#6E1B1B] bg-[#FAF5F1] shadow-md scale-[1.02]'
                  : 'border-[#EBDBCE] bg-white hover:border-[#C98B6A] hover:bg-[#FAF5F1]/50'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-[#3A241F]">{theme.name}</span>
                    {isSelected && (
                      <span className="bg-[#6E1B1B] text-white p-0.5 rounded-full">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-[#8C6F66] mt-0.5 leading-relaxed">
                    {theme.description}
                  </p>
                </div>
              </div>

              {/* Color Swatch Bar */}
              <div className="flex items-center gap-1.5 p-2 rounded-xl bg-white border border-[#EBDBCE]/60 shadow-2xs">
                {theme.swatchColors.map((col, idx) => (
                  <div
                    key={idx}
                    className="flex-1 h-5 rounded-lg shadow-inner border border-black/10 flex items-center justify-center text-[9px] font-mono text-white"
                    style={{ backgroundColor: col }}
                    title={col}
                  />
                ))}
              </div>

              {/* Sample Button Preview */}
              <div className="flex items-center justify-between pt-1 text-[10px] font-bold">
                <span className="text-[#8C6F66]">پیش‌نمایش دکمه:</span>
                <span
                  className="px-2.5 py-1 rounded-lg text-white font-bold text-[10px] shadow-2xs"
                  style={{ backgroundColor: theme.primary }}
                >
                  {isSelected ? 'تم فعال' : 'انتخاب تم'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
