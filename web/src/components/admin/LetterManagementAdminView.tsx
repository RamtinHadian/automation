import React, { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  FolderArchive,
  FileText,
  Stamp,
  Award,
  Hash,
  Save,
  CheckCircle2,
  Sliders,
  Settings2,
  Calendar,
  Layers,
  FileCheck,
  Clock,
  CheckCheck,
  XCircle,
  Download,
  Search,
  BookOpen,
  ArrowLeftRight,
  ShieldCheck,
  Eye,
  History,
  Tag,
} from 'lucide-react';
import { SystemSettings, LetterNumberingSettings, FileTransfer } from '../../types';
import { toPersianDigits, formatCurrentJalaliDateTime } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { LetterThumbnail } from '../letters/LetterThumbnail';
import { LetterPreviewModal } from '../letters/LetterPreviewModal';

interface LetterManagementAdminViewProps {
  settings: SystemSettings;
  onSaveSettings: (settings: SystemSettings) => void;
  transfers: FileTransfer[];
  onDownload: (t: FileTransfer) => void;
}

export const LetterManagementAdminView: React.FC<LetterManagementAdminViewProps> = ({
  settings,
  onSaveSettings,
  transfers,
  onDownload,
}) => {
  const { currentUser, staffList, handleSignLetter, handleRejectLetter, handleReferLetter, handleArchiveTransfer, handleUnarchiveTransfer } = useAppContext();
  const [previewingLetter, setPreviewingLetter] = useState<FileTransfer | null>(null);

  const defaultNumbering: LetterNumberingSettings = settings.letterNumbering || {
    prefix: 'ات',
    nextNumber: 1001,
    year: '1405',
    formatPattern: 'YEAR_NUM_PREFIX',
    requireAttachmentForFinancial: true,
    allowUniversalReferral: true,
    defaultFooterNote: 'سامانه اتوماسیون سازمانی • دارای اعتبار اداری و تاییدیه دیجیتال',
  };

  const [numbering, setNumbering] = useState<LetterNumberingSettings>(defaultNumbering);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SIGNED' | 'REJECTED' | 'ARCHIVED'>('ALL');

  // Compute live sample letter number based on pattern
  const generatePreviewNumber = () => {
    const num = toPersianDigits(String(numbering.nextNumber));
    const yr = toPersianDigits(numbering.year);
    const pfx = numbering.prefix || 'ات';

    switch (numbering.formatPattern) {
      case 'PREFIX_YEAR_NUM':
        return `${pfx}-${yr}-${num}`;
      case 'NUM_PREFIX_YEAR':
        return `${num}/${pfx}/${yr}`;
      case 'YEAR_NUM_PREFIX':
      default:
        return `${yr}/${num}/${pfx}`;
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      ...settings,
      letterNumbering: numbering,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Filter only official letters
  const officialLetters = transfers.filter((t) => t.isOfficialLetter);
  const filteredLetters = officialLetters.filter((t) => {
    const matchesSearch =
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sender.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.note && t.note.toLowerCase().includes(searchQuery.toLowerCase()));

    let matchesStatus = false;
    if (statusFilter === 'ARCHIVED') {
      matchesStatus = !!t.isArchived;
    } else {
      if (t.isArchived) return false;
      if (statusFilter === 'ALL') matchesStatus = true;
      else if (statusFilter === 'PENDING') matchesStatus = t.signatureStatus === 'PENDING_SIGNATURE';
      else if (statusFilter === 'SIGNED') matchesStatus = t.signatureStatus === 'SIGNED';
      else if (statusFilter === 'REJECTED') matchesStatus = t.signatureStatus === 'REJECTED';
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-7 select-none font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
              مدیریت نامه‌نگاری، الگوی شماره‌گذاری و دفتر اندیکاتور
            </h1>
            <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-300 uppercase">
              گردش اسناد رسمی
            </span>
          </div>
          <p className="text-xs text-[#8C6F66]">
            تنظیم ساختار شماره نامه‌ها، قواعد گردش مکاتبات اداری و نظارت بر کلیه نامه‌های رسمی سازمان
          </p>
        </div>

        <button
          onClick={handleSave}
          type="button"
          className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <Save className="w-4 h-4" />
          <span>ذخیره تنظیمات نامه‌نگاری</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-3.5 bg-[#FAF5F1] border border-[#C98B6A]/40 text-[#6E1B1B] rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#6E1B1B] shrink-0" />
          <span>الگو و ضوابط شماره‌گذاری نامه‌های اداری با موفقیت ذخیره شد.</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: LETTER NUMBERING FORMAT & RULES CONFIGURATION */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-amber-300 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#3A241F]">ساختار و فرمت شماره‌گذاری نامه‌ها (اندیکاتور)</h2>
              <p className="text-[11px] text-[#8C6F66]">
                فرمت تولید خودکار شماره نامه، پیشوند واحدها و شماره شروع ترتیبی
              </p>
            </div>
          </div>
          <span className="bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] px-3 py-1 rounded-xl text-xs font-mono font-bold">
            فرمت فعال: {generatePreviewNumber()}
          </span>
        </div>

        {/* Numbering Config Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Prefix */}
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              پیشوند نامه‌ها (شناسه سازمان/واحد):
            </label>
            <input
              type="text"
              value={numbering.prefix}
              onChange={(e) => setNumbering({ ...numbering, prefix: e.target.value })}
              placeholder="مثال: ات، ص، م، ف"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Next Number */}
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              شماره شروع اندیکاتور:
            </label>
            <input
              type="number"
              min="1"
              value={numbering.nextNumber}
              onChange={(e) => setNumbering({ ...numbering, nextNumber: parseInt(e.target.value) || 1 })}
              placeholder="1001"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-mono font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Year */}
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              سال صدور نامه (شمسی):
            </label>
            <input
              type="text"
              value={numbering.year}
              onChange={(e) => setNumbering({ ...numbering, year: e.target.value })}
              placeholder="1405"
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-mono font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Pattern Style */}
          <div>
            <label className="block font-bold text-[#3A241F] mb-1.5">
              الگوی چینش اجزای شماره:
            </label>
            <select
              value={numbering.formatPattern}
              onChange={(e) => setNumbering({ ...numbering, formatPattern: e.target.value as any })}
              className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none cursor-pointer"
            >
              <option value="YEAR_NUM_PREFIX">سال / شماره / پیشوند (پیش‌فرض استاندارد)</option>
              <option value="NUM_PREFIX_YEAR">شماره / پیشوند / سال</option>
              <option value="PREFIX_YEAR_NUM">پیشوند - سال - شماره</option>
            </select>
          </div>
        </div>

        {/* Live Stamped Example Box */}
        <div className="p-4 bg-gradient-to-r from-amber-50/80 via-[#FAF5F1] to-amber-50/50 rounded-2xl border border-amber-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-right">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-[#3A241F]">نمونه شماره نامه صادرشده با این ساختار:</span>
              <span className="bg-amber-600 text-white font-mono font-black text-sm px-3.5 py-1 rounded-xl shadow-xs" dir="ltr">
                {generatePreviewNumber()}
              </span>
            </div>
            <p className="text-[11px] text-[#8C6F66]">
              با ثبت هر نامه رسمی جدید، شماره نامه به‌صورت خودکار بر اساس این الگو تولید شده و در هدر نامه درج می‌گردد.
            </p>
          </div>

          <div className="text-[11px] text-amber-900 font-bold bg-white px-3.5 py-2 rounded-xl border border-amber-200 shrink-0">
            ✓ متصل به ماژول Word و سربرگ رسمی
          </div>
        </div>

        {/* Lettering Workflow Checkboxes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          
          <div className="p-3.5 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-black text-xs text-[#3A241F] block">ارجاع سراسری نامه‌ها میان پرسنل</span>
              <p className="text-[10px] text-[#8C6F66]">
                امکان ارجاع و فوروارد نامه رسمی همراه با درج دستور و پاراف به هر شخص در سازمان
              </p>
            </div>
            <input
              type="checkbox"
              checked={numbering.allowUniversalReferral ?? true}
              onChange={(e) => setNumbering({ ...numbering, allowUniversalReferral: e.target.checked })}
              className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
            />
          </div>

          <div className="p-3.5 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-black text-xs text-[#3A241F] block">الزام درج پیوست برای نامه‌های مالی</span>
              <p className="text-[10px] text-[#8C6F66]">
                درخواست‌های قرارداد و مالی بدون ضمیمه الکترونیک اجازه ارسال به مدیرعامل نخواهند داشت
              </p>
            </div>
            <input
              type="checkbox"
              checked={numbering.requireAttachmentForFinancial ?? true}
              onChange={(e) => setNumbering({ ...numbering, requireAttachmentForFinancial: e.target.checked })}
              className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
            />
          </div>

          <div className="md:col-span-2 p-3.5 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-black text-xs text-[#3A241F] block">نمایش متن پاورقی (فوتر) در انتهای نامه‌ها</span>
              <p className="text-[10px] text-[#8C6F66]">
                با غیرفعال کردن این گزینه، متن پاورقی سازمانی از انتهای نامه‌ها و خروجی چاپ حذف می‌گردد.
              </p>
            </div>
            <input
              type="checkbox"
              checked={numbering.showFooterNote ?? true}
              onChange={(e) => setNumbering({ ...numbering, showFooterNote: e.target.checked })}
              className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: OFFICIAL LETTERS REGISTRY & MONITORING (دفتر اندیکاتور) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EBDBCE] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#3A241F]">دفتر اندیکاتور و بایگانی مکاتبات اداری</h2>
              <p className="text-[11px] text-[#8C6F66]">
                فهرست کامل کلیه نامه‌های رسمی، گردش امضاها و وضعیت تاییدیه مدیرعامل
              </p>
            </div>
          </div>

          {/* Search + Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#B8A39C] absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو بر اساس موضوع، فرستنده..."
                className="w-full pr-8 pl-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:outline-none focus:border-amber-600"
              />
            </div>

            <div className="flex items-center gap-1 bg-[#FAF5F1] p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'ALL' ? 'bg-amber-600 text-white shadow-2xs' : 'text-[#8C6F66]'
                }`}
              >
                همه ({toPersianDigits(officialLetters.length)})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PENDING')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'PENDING' ? 'bg-amber-600 text-white shadow-2xs' : 'text-[#8C6F66]'
                }`}
              >
                در انتظار
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('SIGNED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'SIGNED' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-[#8C6F66]'
                }`}
              >
                امضا شده
              </button>
            </div>
          </div>
        </div>

        {/* Letters Table */}
        {filteredLetters.length === 0 ? (
          <div className="text-center py-12 bg-[#FAF5F1]/50 rounded-2xl border border-dashed border-[#EBDBCE] space-y-2">
            <Stamp className="w-8 h-8 text-[#B8A39C] mx-auto" />
            <h3 className="text-xs font-bold text-[#3A241F]">هیچ نامه رسمی ثبت نشده است</h3>
            <p className="text-[11px] text-[#8C6F66]">
              نامه‌هایی که توسط پرسنل دارای مجوز نگارش و ارسال شوند در این دفتر ثبت می‌گردند.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF5F1] text-[11px] font-bold text-[#8C6F66] uppercase border-b border-[#EBDBCE]">
                  <th className="py-3 px-4">عنوان و موضوع نامه</th>
                  <th className="py-3 px-4">فرستنده و واحد</th>
                  <th className="py-3 px-4">صاحب امضا / گیرنده</th>
                  <th className="py-3 px-4">وضعیت امضای مدیرعامل</th>
                  <th className="py-3 px-4">گردش و ارجاعات</th>
                  <th className="py-3 px-4">تاریخ ثبت</th>
                  <th className="py-3 px-4 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBDBCE]/60 font-medium text-[#3A241F]">
                {filteredLetters.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FAF5F1] transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <LetterThumbnail
                          letter={t}
                          size="sm"
                          onClick={() => setPreviewingLetter(t)}
                        />
                        <div>
                          <div
                            onClick={() => setPreviewingLetter(t)}
                            className="font-bold text-[#3A241F] hover:text-[#6E1B1B] transition-colors cursor-pointer"
                          >
                            {t.fileName}
                          </div>
                          {t.note && <div className="text-[10px] text-[#8C6F66] truncate max-w-xs">{t.note}</div>}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#3A241F]">{t.sender.fullName}</div>
                      <div className="text-[10px] text-[#8C6F66]">{t.sender.departmentName}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-amber-900">{t.recipients.map((r) => r.fullName).join(', ')}</div>
                      <div className="text-[10px] text-[#8C6F66]">کارتابل امضا</div>
                    </td>

                    <td className="py-3.5 px-4">
                      {t.signatureStatus === 'PENDING_SIGNATURE' && (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                          <Clock className="w-3 h-3 text-amber-700" /> در انتظار امضای مدیرعامل
                        </span>
                      )}
                      {t.signatureStatus === 'SIGNED' && (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                          <CheckCheck className="w-3 h-3 text-emerald-600" /> امضا شده ({t.signedBy})
                        </span>
                      )}
                      {t.signatureStatus === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-900 border border-rose-300 px-2.5 py-0.5 rounded-lg text-[10px] font-bold">
                          <XCircle className="w-3 h-3 text-rose-600" /> رد شده
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {t.referrals && t.referrals.length > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-[#FAF5F1] text-[#6E1B1B] border border-[#EBDBCE] px-2 py-0.5 rounded-lg text-[10px] font-bold">
                          <ArrowLeftRight className="w-3 h-3" />
                          <span>{toPersianDigits(t.referrals.length)} ارجاع ثبت شده</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">مستقیم</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-[#8C6F66]">
                      {toPersianDigits(t.sentAt)}
                    </td>

                    <td className="py-3.5 px-4 text-left">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPreviewingLetter(t)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#FAF5F1] hover:bg-[#6E1B1B] text-[#3A241F] hover:text-white border border-[#EBDBCE] font-bold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
                          title="مشاهده کامل و بررسی نامه"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#C98B6A]" />
                          <span>مشاهده و بررسی</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onDownload(t)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
                          title="دانلود و چاپ سند نامه"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>دانلود</span>
                        </button>

                        {t.signatureStatus === 'SIGNED' && (
                          t.isArchived ? (
                            <button
                              type="button"
                              onClick={() => handleUnarchiveTransfer(t.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FAF5F1] hover:bg-white text-[#3A241F] border border-[#EBDBCE] font-bold text-xs rounded-xl transition-all cursor-pointer"
                              title="خروج از بایگانی"
                            >
                              <ArchiveRestore className="w-3.5 h-3.5 text-[#C98B6A]" />
                              <span>خروج بایگانی</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleArchiveTransfer(t.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#FAF5F1] hover:bg-[#3A241F] text-[#3A241F] hover:text-white border border-[#EBDBCE] font-bold text-xs rounded-xl transition-all cursor-pointer"
                              title="بایگانی نامه رسمی"
                            >
                              <Archive className="w-3.5 h-3.5 text-amber-700" />
                              <span>بایگانی</span>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Letter Preview & Inspection Modal in Admin Console */}
      {previewingLetter && (
        <LetterPreviewModal
          letter={transfers.find((t) => t.id === previewingLetter.id) || previewingLetter}
          isOpen={!!previewingLetter}
          onClose={() => setPreviewingLetter(null)}
          currentUser={currentUser}
          settings={settings}
          staffList={staffList}
          onSign={handleSignLetter}
          onReject={handleRejectLetter}
          onRefer={handleReferLetter}
          onDownload={onDownload}
        />
      )}
    </div>
  );
};
