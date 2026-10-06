import React, { useState, useRef, useEffect } from 'react';
import { ProformaIssuersCard } from './ProformaIssuersCard';
import { DEFAULT_SIGNATURE_HEIGHT, MIN_SIGNATURE_HEIGHT, MAX_SIGNATURE_HEIGHT } from '../../lib/letterDefaults';
import {
  Save,
  Shield,
  FileCheck,
  Clock,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Stamp,
  Award,
  Upload,
  Trash2,
  Building,
  Building2,
  Image as ImageIcon,
  Check,
  Eye,
  Hash,
  FileText,
  Sliders,
  Sparkles,
  Type,
  Palette,
  PhoneCall,
  MessageSquare,
  Send,
  Bell,
  DatabaseBackup,
  KeyRound,
} from 'lucide-react';
import { SystemSettings, LetterNumberingSettings } from '../../types';
import { FontManagementModal } from './FontManagementModal';
import { ThemeManagementModal } from './ThemeManagementModal';
import { COLOR_THEMES } from '../../lib/theme';
import { buildProformaHtml, sampleProforma } from '../../lib/proformaPdf';
import { toPersianDigits, formatCurrentJalaliDateTime } from '../../lib/jalali';
import { formatLetterNumber, DEFAULT_LETTER_NUMBERING } from '../../lib/letterNumbering';
import { useAppContext } from '../../context/AppContext';
import { ProformaDesigner } from './ProformaDesigner';
import { VoipStatusCard } from './VoipStatusCard';
import { SmsSettingsCard } from './SmsSettingsCard';
import { MessengerSettingsCard } from './MessengerSettingsCard';
import { NotificationSettingsCard } from './NotificationSettingsCard';
import { IconTab } from '../common/IconTab';
import { BackupSettingsCard } from './BackupSettingsCard';
import { LicenseCard } from './LicenseCard';

interface SettingsViewProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
}

function parsePersianOrEnglishInt(str: string, fallback: number = 0): number {
  const farsiToEnglish: Record<string, string> = {
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };
  const normalized = str.replace(/[۰-۹٠-٩]/g, (w) => farsiToEnglish[w] || w).replace(/[^0-9]/g, '');
  const val = parseInt(normalized, 10);
  return isNaN(val) ? fallback : val;
}

/**
 * Whole-number input that lets you clear and retype freely. The value is committed as you type
 * (when it is valid); an empty/too-small entry is only reset to the last good value on blur.
 */
const NumberField: React.FC<{
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  placeholder?: string;
  className?: string;
}> = ({ value, onCommit, min = 1, placeholder, className }) => {
  const [text, setText] = React.useState(toPersianDigits(value));
  const [focused, setFocused] = React.useState(false);

  React.useEffect(() => {
    if (!focused) setText(toPersianDigits(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="numeric"
      dir="rtl"
      value={text}
      placeholder={placeholder}
      className={className}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(toPersianDigits(value));
      }}
      onChange={(e) => {
        const n = parsePersianOrEnglishInt(e.target.value, NaN);
        setText(isNaN(n) ? '' : toPersianDigits(n));
        if (!isNaN(n) && n >= min) onCommit(n);
      }}
    />
  );
};

const sanitizeSettingsWithPersianDigits = (s: SystemSettings): SystemSettings => {
  return {
    ...s,
    companyName: s.companyName ? toPersianDigits(s.companyName) : s.companyName,
    companySubtitle: s.companySubtitle ? toPersianDigits(s.companySubtitle) : s.companySubtitle,
    systemTitle: s.systemTitle ? toPersianDigits(s.systemTitle) : s.systemTitle,
    ceoName: s.ceoName ? toPersianDigits(s.ceoName) : s.ceoName,
    ceoTitle: s.ceoTitle ? toPersianDigits(s.ceoTitle) : s.ceoTitle,
    letterNumbering: {
      ...DEFAULT_LETTER_NUMBERING,
      ...(s.letterNumbering || {}),
      prefix: s.letterNumbering?.prefix ? toPersianDigits(s.letterNumbering.prefix) : DEFAULT_LETTER_NUMBERING.prefix,
      year: s.letterNumbering?.year ? toPersianDigits(s.letterNumbering.year) : DEFAULT_LETTER_NUMBERING.year,
      defaultFooterNote: s.letterNumbering?.defaultFooterNote ? toPersianDigits(s.letterNumbering.defaultFooterNote) : DEFAULT_LETTER_NUMBERING.defaultFooterNote,
    },
  };
};

type SettingsSection = 'identity' | 'phone' | 'sms' | 'msgr' | 'notify' | 'proforma' | 'letters' | 'signature' | 'look' | 'policies' | 'backup' | 'license';

/** Each group of settings has its own tab under the page title. */
const SETTINGS_SECTIONS: { id: SettingsSection; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'identity', label: 'نام و هویت سازمان', Icon: Building2 },
  { id: 'letters', label: 'نامه‌نگاری و شماره‌گذاری', Icon: Hash },
  { id: 'signature', label: 'مهر و امضا', Icon: Stamp },
  { id: 'proforma', label: 'پیش‌فاکتور', Icon: FileText },
  { id: 'look', label: 'فونت و رنگ', Icon: Palette },
  { id: 'policies', label: 'فایل‌ها و محدودیت‌ها', Icon: HardDrive },
  { id: 'notify', label: 'ناتیفیکیشن و صدا', Icon: Bell },
  { id: 'phone', label: 'تلفن شرکت (ویپ)', Icon: PhoneCall },
  { id: 'sms', label: 'پیامک', Icon: MessageSquare },
  { id: 'msgr', label: 'تلگرام و بله', Icon: Send },
  { id: 'backup', label: 'پشتیبان‌گیری', Icon: DatabaseBackup },
  { id: 'license', label: 'مجوز و فعال‌سازی', Icon: KeyRound },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings: initialSettings,
  onSaveSettings,
}) => {
  const { fonts, currentTheme, staffList } = useAppContext();
  const [settings, setSettings] = useState<SystemSettings>(() =>
    sanitizeSettingsWithPersianDigits(initialSettings)
  );
  const [designerOpen, setDesignerOpen] = useState(false);
  /** Opens the designed (unofficial) proforma, filled with sample goods and the unofficial business's details. */
  const previewUnofficialForm = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const saved = (settings.proformaIssuers || []).find((i) => i.kind === 'UNOFFICIAL');
    const other = saved || { id: 'personal', label: 'کسب‌وکار غیررسمی', kind: 'UNOFFICIAL' as const, name: '', taxPercent: 0 };
    const withIssuer = { ...settings, proformaIssuers: saved ? settings.proformaIssuers : [...(settings.proformaIssuers || []), other] };
    const sample = sampleProforma(withIssuer);
    w.document.open();
    w.document.write(buildProformaHtml({ ...sample, deal: { ...sample.deal, proformaIssuerId: other.id, taxPercent: other.taxPercent ?? 0 } }, 'preview'));
    w.document.close();
  };
  /** Opens the official tax-authority form filled with sample goods and the main company's details. */
  const previewOfficialForm = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const sample = sampleProforma(settings);
    w.document.open();
    w.document.write(buildProformaHtml({ ...sample, deal: { ...sample.deal, proformaIssuerId: 'main' } }, 'preview'));
    w.document.close();
  };
  const [logoWidth, setLogoWidth] = useState<number>(initialSettings.companyLogoWidth || 70);
  const [isResizingLogo, setIsResizingLogo] = useState(false);
  const logoResizeStart = useRef<{ startX: number; startWidth: number }>({ startX: 0, startWidth: 70 });

  useEffect(() => {
    setLogoWidth(initialSettings.companyLogoWidth || 70);
  }, [initialSettings.companyLogoWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingLogo) return;
      const diff = e.clientX - logoResizeStart.current.startX;
      const newWidth = Math.max(35, Math.min(220, logoResizeStart.current.startWidth + diff));
      setLogoWidth(newWidth);
      setSettings((prev) => ({ ...prev, companyLogoWidth: newWidth }));
    };

    const handleMouseUp = () => {
      if (isResizingLogo) setIsResizingLogo(false);
    };

    if (isResizingLogo) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLogo]);

  const [newExt, setNewExt] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [section, setSectionState] = useState<SettingsSection>(() => {
    try {
      const v = localStorage.getItem('admin_settings_section_v1') as SettingsSection | null;
      return v && SETTINGS_SECTIONS.some((x) => x.id === v) ? v : 'identity';
    } catch {
      return 'identity';
    }
  });
  const setSection = (id: SettingsSection) => {
    setSectionState(id);
    try {
      localStorage.setItem('admin_settings_section_v1', id);
    } catch {
      /* remembering the tab is optional */
    }
  };
  const [showFontModal, setShowFontModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const sigInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Sync internal form state whenever initialSettings changes
  const initialSettingsKey = JSON.stringify(initialSettings);
  useEffect(() => {
    setSettings(sanitizeSettingsWithPersianDigits(initialSettings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSettingsKey]);

  const handleLogoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSettings((prev) => ({
          ...prev,
          companyLogoUrl: e.target?.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddExtension = () => {
    const clean = newExt.trim().toLowerCase().replace('.', '');
    if (clean && !settings.allowedFileTypes.includes(clean)) {
      setSettings((prev) => ({
        ...prev,
        allowedFileTypes: [...prev.allowedFileTypes, clean],
      }));
      setNewExt('');
    }
  };

  const handleRemoveExtension = (ext: string) => {
    setSettings((prev) => ({
      ...prev,
      allowedFileTypes: prev.allowedFileTypes.filter((e) => e !== ext),
    }));
  };

  // Signature/stamp changes are saved immediately, so they reach every user without pressing the main save button.
  const applyImage = (key: 'ceoSignatureUrl' | 'companyStampUrl', value: string | undefined) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    onSaveSettings({ ...initialSettings, [key]: value });
  };

  const handleSignatureUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        applyImage('ceoSignatureUrl', e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleStampUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        applyImage('companyStampUrl', e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleNumberingChange = (updates: Partial<LetterNumberingSettings>) => {
    setSettings((prev) => ({
      ...prev,
      letterNumbering: {
        ...DEFAULT_LETTER_NUMBERING,
        ...(prev.letterNumbering || {}),
        ...updates,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({ ...settings, companyLogoWidth: logoWidth });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const currentNumbering = settings.letterNumbering || DEFAULT_LETTER_NUMBERING;
  const sampleFormattedNumber = formatLetterNumber(currentNumbering);

  // Active default font display name
  const activeDefaultFont = fonts.find((f) => f.id === settings.defaultLetterFontId) || fonts[0] || { name: 'وزیرمتن' };
  
  // Active theme display name
  const activeThemeObj = COLOR_THEMES.find((t) => t.id === currentTheme) || COLOR_THEMES[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-6 select-none max-w-4xl font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
              تنظیمات سیستم، هویت سازمانی و سربرگ نامه‌ها
            </h1>
            <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#C98B6A]/30 uppercase">
              پیکربندی کل سیستم
            </span>
          </div>
          <p className="text-xs text-[#8C6F66]">
            تنظیم نام سامانه، نام شرکت و لوگو، شماره‌گذاری پلکانی، امضای مدیرعامل، مهر سازمان و خط‌مشی‌ها
          </p>
        </div>

        <button
          type="submit"
          className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-95 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>ذخیره کلیه تنظیمات</span>
        </button>
      </div>

      {/* Success Alert */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-emerald-800 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>تنظیمات با موفقیت ذخیره شد و در سرتاسر سامانه و نامه‌های رسمی اعمال گردید.</span>
        </div>
      )}

      {/* Tabs: every group of settings is under its own menu */}
      <nav className="flex items-center gap-2 -mt-2 flex-wrap">
        {SETTINGS_SECTIONS.map(({ id, label, Icon }) => (
          <IconTab key={id} active={section === id} onClick={() => setSection(id)} label={label} icon={<Icon className="w-[18px] h-[18px]" />} />
        ))}
      </nav>

      {section === 'identity' && (
      <>
      {/* ========================================================================= */}
      {/* SECTION 1: SYSTEM TITLE & COMPANY IDENTITY (نام سامانه و هویت سازمان) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3.5">
          <div className="flex items-center gap-2.5 text-[#3A241F]">
            <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#3A241F]">نام سامانه، هویت و آرم رسمی شرکت / سازمان</h2>
              <p className="text-[11px] text-[#8C6F66]">
                نام شرکت و لوگو یکبار در اینجا تنظیم شده و در تمامی نامه‌ها، سربرگ‌ها و صفحات به صورت خودکار قرار می‌گیرد
              </p>
            </div>
          </div>
        </div>

        {/* System Title Input */}
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5 text-xs">
            نام و عنوان سامانه (نمایش در بالای هدر و نوار عنوان مرورگر):
          </label>
          <input
            type="text"
            dir="rtl"
            value={settings.systemTitle ? toPersianDigits(settings.systemTitle) : ''}
            onChange={(e) => setSettings({ ...settings, systemTitle: toPersianDigits(e.target.value) })}
            placeholder="مثال: سامانه جامع مدیریت اسناد و اتوماسیون اداری"
            className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center pt-2 border-t border-[#EBDBCE]/60">
          {/* Logo Box with Drag & Drop Resizing */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-4 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] space-y-3">
            <input
              type="file"
              ref={logoInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleLogoUpload(e.target.files[0]);
              }}
            />
            <div className="relative group/logo flex items-center justify-center p-2 min-h-[100px] min-w-[100px]">
              {settings.companyLogoUrl ? (
                <div
                  style={{ width: `${logoWidth}px`, height: `${logoWidth}px` }}
                  className="relative flex items-center justify-center transition-all"
                >
                  <img
                    src={settings.companyLogoUrl}
                    alt="آرم شرکت"
                    className="max-w-full max-h-full object-contain pointer-events-none"
                  />
                  {/* Drag Resize Handle at Bottom-Left */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsResizingLogo(true);
                      logoResizeStart.current = { startX: e.clientX, startWidth: logoWidth };
                    }}
                    className="absolute -bottom-2 -left-2 w-5 h-5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-full flex items-center justify-center shadow-md cursor-ew-resize active:scale-125 transition-transform"
                    title="برای کوچک یا بزرگ کردن لوگو، این دستگیره را با ماوس بکشید (Drag)"
                  >
                    <Sliders className="w-2.5 h-2.5" />
                  </div>
                </div>
              ) : (
                <Building2 className="w-12 h-12 text-[#C98B6A]" />
              )}
            </div>

            {settings.companyLogoUrl && (
              <div className="w-full space-y-1.5 pt-1 text-center">
                <div className="flex items-center justify-between text-[10px] font-bold text-[#8C6F66]">
                  <span>سایز / عرض آرم:</span>
                  <span className="font-mono text-[#6E1B1B] font-black">{toPersianDigits(logoWidth)}px</span>
                </div>
                <input
                  type="range"
                  min="35"
                  max="220"
                  value={logoWidth}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    setLogoWidth(w);
                    setSettings((prev) => ({ ...prev, companyLogoWidth: w }));
                  }}
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                  title="تغییر سایز آرم با اسلایدر"
                />
                <div className="text-[9px] text-[#8C6F66] flex items-center justify-center gap-1">
                  <span>🖐️ یا دستگیره گوشه لوگو را با ماوس بکشید</span>
                </div>
              </div>
            )}

            <div className="text-center space-y-1">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="px-3.5 py-1.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                {settings.companyLogoUrl ? 'تغییر آرم / لوگو' : 'بارگذاری لوگوی شرکت'}
              </button>
              {settings.companyLogoUrl && (
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, companyLogoUrl: undefined })}
                  className="block text-[10px] text-rose-600 hover:underline mx-auto font-bold cursor-pointer"
                >
                  حذف لوگو
                </button>
              )}
            </div>
          </div>

          {/* Company Name & Subtitle */}
          <div className="md:col-span-8 space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#3A241F] mb-1.5">
                نام رسمی شرکت / سازمان (درج خودکار در سربرگ کلیه نامه‌ها):
              </label>
              <input
                type="text"
                dir="rtl"
                value={settings.companyName ? toPersianDigits(settings.companyName) : ''}
                onChange={(e) => setSettings({ ...settings, companyName: toPersianDigits(e.target.value) })}
                placeholder="مثال: هورمند"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-[#3A241F] mb-1.5">
                عنوان فرعی سربرگ اداری (مانند شماره ثبت یا واحد صادرکننده):
              </label>
              <input
                type="text"
                dir="rtl"
                value={settings.companySubtitle ? toPersianDigits(settings.companySubtitle) : ''}
                onChange={(e) => setSettings({ ...settings, companySubtitle: toPersianDigits(e.target.value) })}
                placeholder="مثال: سامانه یکپارچه مکاتبات اداری و اسناد رسمی (شماره ثبت: ۱۲۳۴۵)"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      </>
      )}

      {designerOpen && (
        <ProformaDesigner
          settings={settings}
          onClose={() => setDesignerOpen(false)}
          onSave={(patch) => {
            setSettings((prev) => ({ ...prev, ...patch }));
            onSaveSettings({ ...initialSettings, ...patch });
          }}
        />
      )}

      {section === 'phone' && (
      <>
      <VoipStatusCard />
      </>
      )}

      {section === 'notify' && (
        <NotificationSettingsCard
          settings={settings}
          onSave={(notifySettings) => {
            setSettings((prev) => ({ ...prev, notifySettings }));
            onSaveSettings({ ...initialSettings, notifySettings });
          }}
        />
      )}

      {section === 'sms' && <SmsSettingsCard />}

      {section === 'msgr' && <MessengerSettingsCard />}

      {section === 'backup' && <BackupSettingsCard />}

      {section === 'license' && <LicenseCard />}


      {section === 'proforma' && (
      <>
      <ProformaIssuersCard
        staff={staffList.map((u) => ({ id: u.id, name: u.fullName }))}
        settings={settings}
        setSettings={setSettings}
        unofficialChildren={
          <button type="button" onClick={previewUnofficialForm} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#6E1B1B] bg-[#FAF5F1] border border-[#EBDBCE] hover:bg-[#F3E9E2] cursor-pointer">
            <FileText className="w-4 h-4" />
            پیش‌نمایش پیش‌فاکتور غیررسمی (با قالب طراحی‌شده)
          </button>
        }
      >
        <button type="button" onClick={previewOfficialForm} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
          <FileText className="w-4 h-4" />
          دیدن نمونهٔ فرم رسمی
        </button>
      </ProformaIssuersCard>

      <details className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs">
        <summary className="cursor-pointer font-black text-sm text-[#3A241F]">تنظیمات عمومی (طراحی قالب غیررسمی، شرایط، واحد پول، مدت اعتبار)</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="md:col-span-2">
            <button type="button" onClick={() => setDesignerOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] cursor-pointer">
              <Palette className="w-4 h-4" />
              طراحی قالب پیش‌فاکتور غیررسمی (کشیدن و رها کردن)
            </button>
          </div>
          <div className="md:col-span-2">
            <label className="block font-bold text-[#3A241F] mb-1.5">شرایط پیش‌فرض پیش‌فاکتور غیررسمی (هر خط یک مورد؛ خالی = متن استاندارد):</label>
            <textarea dir="rtl" value={settings.proformaTerms || ''} onChange={(e) => setSettings({ ...settings, proformaTerms: e.target.value })} className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none min-h-[80px]" />
          </div>
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">واحد پول سامانه (فرم رسمی همیشه ریال است):</label>
            <select value={settings.currencyUnit || 'TOMAN'} onChange={(e) => setSettings({ ...settings, currencyUnit: e.target.value as 'TOMAN' | 'RIAL' })} className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none">
              <option value="TOMAN">تومان</option>
              <option value="RIAL">ریال</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">مدت اعتبار پیش‌فاکتور (روز):</label>
            <input type="number" min={1} value={settings.proformaValidDays ?? 7} onChange={(e) => setSettings({ ...settings, proformaValidDays: Math.max(1, Number(e.target.value) || 7) })} className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none" />
          </div>
        </div>
      </details>
      </>
      )}

      {section === 'letters' && (
      <>
      {/* ========================================================================= */}
      {/* SECTION 2: LETTER NUMBERING & STEP INCREMENT (تنظیمات شماره‌گذاری پلکانی نامه‌ها) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3.5">
          <div className="flex items-center gap-2.5 text-[#3A241F]">
            <div className="w-9 h-9 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#3A241F]">تنظیمات شماره‌گذاری پلکانی و اندیکاتور نامه‌ها</h2>
              <p className="text-[11px] text-[#8C6F66]">
                تعیین فرمت، پیشوند، شماره شروع و گام افزایش خودکار شماره نامه هنگام صدور هر نامه جدید
              </p>
            </div>
          </div>

          <div className="bg-[#FAF5F1] px-3.5 py-1.5 rounded-xl border border-[#EBDBCE] text-right" dir="rtl">
            <span className="text-[10px] text-[#8C6F66] block">نمونه شماره نامه بعدی:</span>
            <span className="font-bold text-xs text-[#6E1B1B]">{toPersianDigits(sampleFormattedNumber)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              پیشوند شماره نامه:
            </label>
            <input
              type="text"
              dir="rtl"
              value={currentNumbering.prefix ? toPersianDigits(currentNumbering.prefix) : ''}
              onChange={(e) => handleNumberingChange({ prefix: toPersianDigits(e.target.value) })}
              placeholder="مثال: ۱۰ یا ات یا الف"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              شماره بعدی / شروع:
            </label>
            <NumberField
              value={currentNumbering.nextNumber || 1001}
              onCommit={(val) => handleNumberingChange({ nextNumber: val })}
              placeholder="۱۰۰۱"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              گام افزایش پلکانی:
            </label>
            <select
              value={currentNumbering.incrementStep || 1}
              onChange={(e) => handleNumberingChange({ incrementStep: parseInt(e.target.value) || 1 })}
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            >
              <option value={1}>+۱ (یک رقم افزایش در هر نامه)</option>
              <option value={2}>+۲ (دو رقم افزایش)</option>
              <option value={5}>+۵ (پنج رقم افزایش)</option>
              <option value={10}>+۱۰ (ده رقم افزایش)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              سال صدور:
            </label>
            <input
              type="text"
              dir="rtl"
              value={toPersianDigits(currentNumbering.year || '1405')}
              onChange={(e) => handleNumberingChange({ year: toPersianDigits(e.target.value) })}
              placeholder="۱۴۰۵"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-[#EBDBCE]/60">
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              الگوی ساخت ساختار شماره نامه:
            </label>
            <select
              value={currentNumbering.formatPattern}
              onChange={(e) =>
                handleNumberingChange({
                  formatPattern: e.target.value as LetterNumberingSettings['formatPattern'],
                })
              }
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            >
              <option value="PREFIX_YEAR_NUM">پیشوند / سال / شماره (مثال: ۱۰/۱۴۰۵/۱۰۰۱)</option>
              <option value="YEAR_NUM_PREFIX">سال / شماره / پیشوند (مثال: ۱۴۰۵/۱۰۰۱/۱۰)</option>
              <option value="NUM_PREFIX_YEAR">شماره / پیشوند / سال (مثال: ۱۰۰۱/۱۰/۱۴۰۵)</option>
              <option value="PREFIX_NUM">پیشوند / شماره (مثال: ۱۰/۱۰۰۱)</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              متن پیش‌فرض پاورقی نامه‌ها:
            </label>
            <input
              type="text"
              dir="rtl"
              value={
                currentNumbering.defaultFooterNote
                  ? toPersianDigits(currentNumbering.defaultFooterNote)
                  : settings.defaultFooterNote
                  ? toPersianDigits(settings.defaultFooterNote)
                  : ''
              }
              onChange={(e) => {
                const val = toPersianDigits(e.target.value);
                setSettings((prev) => ({
                  ...prev,
                  defaultFooterNote: val,
                  letterNumbering: {
                    ...DEFAULT_LETTER_NUMBERING,
                    ...(prev.letterNumbering || {}),
                    defaultFooterNote: val,
                  },
                }));
              }}
              placeholder="مثال: سامانه مکاتبات و اسناد رسمی اداری"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Show / Hide Footer Note Toggle */}
          <div className="md:col-span-2 pt-2 border-t border-[#EBDBCE]/60">
            <label className="flex items-center gap-3 cursor-pointer select-none bg-[#FAF5F1] p-3 rounded-2xl border border-[#EBDBCE] hover:border-amber-400 transition-colors">
              <input
                type="checkbox"
                checked={
                  currentNumbering.showFooterNote !== undefined
                    ? currentNumbering.showFooterNote
                    : settings.showFooterNote !== false
                }
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSettings((prev) => ({
                    ...prev,
                    showFooterNote: checked,
                    letterNumbering: {
                      ...DEFAULT_LETTER_NUMBERING,
                      ...(prev.letterNumbering || {}),
                      showFooterNote: checked,
                    },
                  }));
                }}
                className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
              />
              <div className="text-right">
                <span className="text-xs font-bold text-[#3A241F] block">
                  نمایش متن پاورقی (فوتر) در انتهای نامه‌ها
                </span>
                <span className="text-[11px] text-[#8C6F66] block mt-0.5">
                  با غیرفعال کردن این تیک، متن پاورقی سازمانی از انتهای برگه و خروجی چاپ حذف می‌گردد.
                </span>
              </div>
            </label>
          </div>
        </div>
      </div>

      </>
      )}

      {section === 'signature' && (
      <>
      {/* ========================================================================= */}
      {/* SECTION 3: CEO SIGNATURE & COMPANY STAMP UPLOAD SECTION */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-amber-300 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3.5">
          <div className="flex items-center gap-2.5 text-[#3A241F]">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
              <Stamp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#3A241F]">اسکن امضای مدیرعامل و مهر رسمی سازمان</h2>
              <p className="text-[11px] text-[#8C6F66]">
                این امضا و مهر پس از تایید مدیرعامل به‌صورت خودکار روی نامه‌های رسمی درج می‌گردد
              </p>
            </div>
          </div>
          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1">
            <Award className="w-3 h-3 text-amber-700" />
            <span>صاحب امضای مجاز</span>
          </span>
        </div>

        {/* Info Fields: CEO Name & Title */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              نام و نام خانوادگی مدیرعامل / صاحب امضا:
            </label>
            <input
              type="text"
              dir="rtl"
              value={settings.ceoName ? toPersianDigits(settings.ceoName) : ''}
              readOnly
              title="این نام خودکار از کاربری گرفته می‌شود که تیک مدیرعامل دارد"
              placeholder="هنوز مدیرعاملی تعیین نشده"
              className="w-full p-2.5 bg-[#F3EAE3] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] cursor-not-allowed focus:outline-none"
            />
            <p className="text-[10px] text-[#8C6F66] mt-1">خودکار از «مدیریت کاربران» می‌آید: همان کسی که تیک مدیرعامل دارد.</p>
          </div>

          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              سمت سازمانی:
            </label>
            <input
              type="text"
              dir="rtl"
              value={settings.ceoTitle ? toPersianDigits(settings.ceoTitle) : ''}
              onChange={(e) => setSettings({ ...settings, ceoTitle: toPersianDigits(e.target.value) })}
              placeholder="مثال: مدیرعامل و عضو هیئت مدیره"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Signature & Stamp Upload Containers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#EBDBCE]/60">
          {/* 1. CEO Signature Box */}
          <div className="space-y-3 bg-[#FAF5F1] p-4 rounded-2xl border border-dashed border-[#C98B6A] flex flex-col items-center justify-between text-center">
            <input
              type="file"
              ref={sigInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleSignatureUpload(e.target.files[0]);
              }}
            />
            <div className="space-y-1">
              <span className="font-black text-xs text-[#3A241F] block">تصویر اسکن امضای مدیرعامل (PNG شفاف)</span>
              <p className="text-[10px] text-[#8C6F66]">
                برای جلوه طبیعی، تصویر امضا با زمینه شفاف (Transparent PNG) بارگذاری شود
              </p>
            </div>

            <div className="h-28 w-full bg-white rounded-xl border border-[#EBDBCE] flex items-center justify-center p-2 relative overflow-hidden shadow-2xs">
              {settings.ceoSignatureUrl ? (
                <img
                  src={settings.ceoSignatureUrl}
                  alt="امضای مدیرعامل"
                  className="max-h-full max-w-full object-contain mix-blend-multiply"
                />
              ) : (
                <span className="text-[11px] text-gray-400 font-bold">هنوز امضایی بارگذاری نشده است</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full justify-center">
              <button
                type="button"
                onClick={() => sigInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{settings.ceoSignatureUrl ? 'تغییر اسکن امضا' : 'بارگذاری اسکن امضا'}</span>
              </button>
              {settings.ceoSignatureUrl && (
                <button
                  type="button"
                  onClick={() => applyImage('ceoSignatureUrl', undefined)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="حذف امضا"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* 2. Company Stamp Box */}
          <div className="space-y-3 bg-[#FAF5F1] p-4 rounded-2xl border border-dashed border-[#C98B6A] flex flex-col items-center justify-between text-center">
            <input
              type="file"
              ref={stampInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleStampUpload(e.target.files[0]);
              }}
            />
            <div className="space-y-1">
              <span className="font-black text-xs text-[#3A241F] block">تصویر مهر رسمی سازمان (PNG شفاف)</span>
              <p className="text-[10px] text-[#8C6F66]">
                مهر دایره‌ای یا بیضی با رنگ قرمز یا سرمه‌ای در کنار امضا درج خواهد شد
              </p>
            </div>

            <div className="h-28 w-full bg-white rounded-xl border border-[#EBDBCE] flex items-center justify-center p-2 relative overflow-hidden shadow-2xs">
              {settings.companyStampUrl ? (
                <img
                  src={settings.companyStampUrl}
                  alt="مهر رسمی شرکت"
                  className="max-h-full max-w-full object-contain mix-blend-multiply opacity-90"
                />
              ) : (
                <span className="text-[11px] text-gray-400 font-bold">هنوز مهری بارگذاری نشده است</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full justify-center">
              <button
                type="button"
                onClick={() => stampInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <Stamp className="w-3.5 h-3.5" />
                <span>{settings.companyStampUrl ? 'تغییر اسکن مهر' : 'بارگذاری اسکن مهر'}</span>
              </button>
              {settings.companyStampUrl && (
                <button
                  type="button"
                  onClick={() => applyImage('companyStampUrl', undefined)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                  title="حذف مهر"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Default signature size on letters */}
        <div className="pt-4 border-t border-[#EBDBCE]/60 space-y-2 text-xs">
          <label className="block font-bold text-[#3A241F]">
            اندازهٔ پیش‌فرض امضای مدیرعامل روی نامه‌ها (پیکسل)
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <NumberField
              value={settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT}
              min={MIN_SIGNATURE_HEIGHT}
              onCommit={(n) => setSettings({ ...settings, ceoSignatureHeight: Math.min(n, MAX_SIGNATURE_HEIGHT) })}
              placeholder="۱۰۰"
              className="w-28 p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
            />
            <input
              type="range"
              min={MIN_SIGNATURE_HEIGHT}
              max={MAX_SIGNATURE_HEIGHT}
              value={settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT}
              onChange={(e) => setSettings({ ...settings, ceoSignatureHeight: Number(e.target.value) })}
              className="flex-1 min-w-[160px] accent-[#6E1B1B] cursor-pointer"
            />
            <button
              type="button"
              onClick={() => setSettings({ ...settings, ceoSignatureHeight: undefined })}
              className="px-3 py-2 text-[11px] font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
            >
              بازگشت به پیش‌فرض
            </button>
          </div>
          <p className="text-[11px] text-[#8C6F66]">
            مهر خودکار کمی بزرگ‌تر از امضا نمایش داده می‌شود. مدیرعامل هنگام امضا هم می‌تواند اندازه را برای همان نامه تغییر دهد.
          </p>
        </div>
      </div>

      </>
      )}

      {section === 'look' && (
      <>
      {/* ========================================================================= */}
      {/* SECTION 4: COMPACT FONT SELECTION & MODAL TRIGGER (فونت‌های سازمانی) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-right">
          <div className="w-10 h-10 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shadow-xs shrink-0">
            <Type className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-[#3A241F]">فونت‌ها و قلم‌های سازمانی مکاتبات</h3>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                فعال: {activeDefaultFont.name}
              </span>
            </div>
            <p className="text-[11px] text-[#8C6F66] mt-0.5">
              مدیریت قلم‌های نگارش اداری، تنظیم قلم پیش‌فرض نامه‌ها و بارگذاری فونت‌های سفارشی
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowFontModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#FAF5F1] hover:bg-[#6E1B1B] text-[#3A241F] hover:text-white border border-[#EBDBCE] hover:border-[#6E1B1B] font-black text-xs rounded-2xl shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95"
        >
          <Sliders className="w-4 h-4 text-[#C98B6A]" />
          <span>مشاهده و مدیریت انواع فونت‌ها</span>
        </button>
      </div>

      {/* Font Management Modal Dialog */}
      <FontManagementModal
        isOpen={showFontModal}
        onClose={() => setShowFontModal(false)}
      />

      {/* ========================================================================= */}
      {/* SECTION 5: COMPACT THEME SELECTION & MODAL TRIGGER (پالت‌های رنگی سامانه) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-right">
          <div className="w-10 h-10 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-xs shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-[#3A241F]">پالت‌های رنگی و تم سامانه</h3>
              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                فعال: {activeThemeObj.name}
              </span>
            </div>
            <p className="text-[11px] text-[#8C6F66] mt-0.5">
              تغییر مدل رنگ‌بندی، دکمه‌ها، سربرگ‌ها و پوسته‌های رسمی سیستم
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowThemeModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#FAF5F1] hover:bg-[#6E1B1B] text-[#3A241F] hover:text-white border border-[#EBDBCE] hover:border-[#6E1B1B] font-black text-xs rounded-2xl shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95"
        >
          <Palette className="w-4 h-4 text-[#C98B6A]" />
          <span>مشاهده و مدیریت پالت‌های رنگی</span>
        </button>
      </div>

      {/* Theme Management Modal Dialog */}
      <ThemeManagementModal
        isOpen={showThemeModal}
        onClose={() => setShowThemeModal(false)}
      />

      </>
      )}

      {section === 'policies' && (
      <>
      {/* ========================================================================= */}
      {/* SECTION 6: SYSTEM POLICIES & UPLOAD LIMITS */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-3 text-xs">
        <div className="flex items-center gap-2.5 text-[#3A241F]">
          <HardDrive className="w-5 h-5 text-[#6E1B1B]" />
          <h3 className="font-bold text-sm">نگهداری فایل‌های ارسالی روی سرور</h3>
        </div>
        <p className="text-[#8C6F66] leading-6">
          هر فایلی که ارسال می‌شود روی سرور ذخیره می‌شود. اینجا تعیین کنید چه مدت بماند. فایلی که پاک شود، سابقه‌اش (چه کسی، چه ساعتی، چند بار دانلود شد) می‌ماند و برای کاربران نوشته می‌شود «توسط مدیر کل سیستم حذف شد».
          در «مانیتورینگ انتقالات» هر فایل را می‌شود دستی حذف کرد یا با «همیشه بماند» از حذف خودکار نجات داد.
        </p>
        <select
          value={settings.fileRetentionDays ?? 0}
          onChange={(e) => setSettings({ ...settings, fileRetentionDays: Number(e.target.value) })}
          className="w-full sm:max-w-sm p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none"
        >
          <option value={0}>همیشه نگه‌داری شود (هیچ‌وقت خودکار پاک نشود)</option>
          <option value={7}>بعد از ۷ روز پاک شود</option>
          <option value={30}>بعد از ۳۰ روز پاک شود</option>
          <option value={90}>بعد از ۹۰ روز پاک شود</option>
          <option value={180}>بعد از ۱۸۰ روز پاک شود</option>
          <option value={365}>بعد از یک سال پاک شود</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Limits */}
        <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-[#3A241F]">
            <HardDrive className="w-5 h-5 text-[#6E1B1B]" />
            <h3 className="font-bold text-sm">سقف حجم و سهمیه‌های فضا</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#3A241F] mb-1">
                حداکثر سقف مجاز برای هر فایل بارگذاری
              </label>
              <NumberField
                value={Math.max(1, Math.round((settings.maxUploadSizeBytes || 5368709120) / 1073741824))}
                onCommit={(n) => setSettings({ ...settings, maxUploadSizeBytes: n * 1073741824 })}
                placeholder="۵"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
              />
              <p className="mt-1 text-[11px] text-[#8C6F66]">حجم به گیگابایت؛ ارسال فایل بزرگ‌تر از این سقف رد می‌شود.</p>
            </div>

            <div>
              <label className="block font-bold text-[#3A241F] mb-1">
                سهمیه پیش‌فرض فضای هر کاربر (گیگابایت)
              </label>
              <NumberField
                value={settings.defaultUserQuotaGB || 25}
                onCommit={(n) => setSettings({ ...settings, defaultUserQuotaGB: n })}
                placeholder="۲۵"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
              />
            </div>
          </div>
        </div>

        {/* Security & Sessions */}
        <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-[#3A241F]">
            <Shield className="w-5 h-5 text-[#6E1B1B]" />
            <h3 className="font-bold text-sm">خط‌مشی‌های امنیتی و انقضای نشست</h3>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[#3A241F] mb-1">
                مدت زمان انقضای خودکار نشست کاربری (دقیقه عدم فعالیت)
              </label>
              <input
                type="text"
                dir="rtl"
                value={toPersianDigits(settings.sessionTimeoutMinutes || 60)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sessionTimeoutMinutes: parsePersianOrEnglishInt(e.target.value, 60),
                  })
                }
                placeholder="۶۰"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
              />
            </div>

            <div>
              <label className="block font-bold text-[#3A241F] mb-1">
                پاکسازی خودکار فایل‌های منقضی‌شده پس از (روز)
              </label>
              <input
                type="text"
                dir="rtl"
                value={toPersianDigits(settings.autoPurgeDays || 14)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autoPurgeDays: parsePersianOrEnglishInt(e.target.value, 14),
                  })
                }
                placeholder="۱۴"
                className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Allowed File Types */}
      <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 text-[#3A241F]">
          <FileCheck className="w-5 h-5 text-[#6E1B1B]" />
          <div>
            <h3 className="font-bold text-sm">فرمت‌ها و پسوندهای مجاز تبادل فایل</h3>
            <p className="text-[11px] text-[#8C6F66]">
              کاربران تنها قادر به ارسال فایل‌هایی با این پسوندها خواهند بود
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {settings.allowedFileTypes.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] rounded-xl text-xs font-mono font-bold"
            >
              <span>.{ext}</span>
              <button
                type="button"
                onClick={() => handleRemoveExtension(ext)}
                className="text-[#8C6F66] hover:text-[#D34A32] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 pt-2 max-w-sm">
          <input
            type="text"
            value={newExt}
            onChange={(e) => setNewExt(e.target.value)}
            placeholder="افزودن پسوند جدید (مثال: dwg)"
            className="flex-1 p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-mono font-bold text-[#3A241F] focus:outline-none focus:border-[#D34A32]"
          />
          <button
            type="button"
            onClick={handleAddExtension}
            className="flex items-center gap-1 px-4 py-2.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>افزودن</span>
          </button>
        </div>
      </div>

      </>
      )}

      {/* Bottom Save Button */}
      <div className="flex justify-end pt-4">
        <button
          type="submit"
          className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-6 py-3 rounded-2xl shadow-lg shadow-[#6E1B1B]/20 transition-all active:scale-95 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>ذخیره و اعمال کلیه تغییرات</span>
        </button>
      </div>
    </form>
  );
};
