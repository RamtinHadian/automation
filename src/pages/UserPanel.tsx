import React, { useState, useEffect, useRef } from 'react';
import { DEFAULT_SIGNATURE_HEIGHT } from '../lib/letterDefaults';
import {
  Archive,
  Hash,
  ArchiveRestore,
  FolderArchive,
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
  Palette,
  X,
  SendHorizonal,
  Eye,
  Clock,
  FileCheck,
  CheckCheck,
  XCircle,
  Award,
  Stamp,
  Lock,
  Mail,
  ShieldCheck,
  FolderOpen,
  PenTool,
  Sparkles,
  Printer,
  Forward,
  Share2,
  History,
  CornerDownLeft,
  UserCheck2,
  Check,
  KeyRound,
  User as UserIcon
} from 'lucide-react';
import { FileCategory, FileTransfer, LetterReferral } from '../types';
import { formatBytes, getFileCategory } from '../lib/utils';
import { toPersianDigits, formatCurrentJalaliDateTime } from '../lib/jalali';
import { useAppContext } from '../context/AppContext';
import { api } from '../lib/api';
import { ThemeSelector } from '../components/common/ThemeSelector';
import { LetterEditorModal } from '../components/letters/LetterEditorModal';
import { LetterThumbnail } from '../components/letters/LetterThumbnail';
import { LetterPreviewModal } from '../components/letters/LetterPreviewModal';

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
      return <FileText className="w-5 h-5 text-[#6E1B1B]" />;
  }
};

export default function UserPanel() {
  const {
    staffList,
    currentUser,
    logout,
    transfers,
    settings,
    toastMessage,
    showToast,
    handleSendTransfer,
    handleDownload,
    handleDeleteTransfer,
    handleArchiveTransfer,
    handleUnarchiveTransfer,
    handleSignLetter,
    handleRejectLetter,
    handleReferLetter,
    handleUpdateUser,
  } = useAppContext();

  // Top Main Menu: 'files' (ارسال فایل) vs 'letters' (نامه)
  const [mainMenuTab, setMainMenuTab] = useState<'files' | 'letters'>('files');

  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isLetterEditorOpen, setIsLetterEditorOpen] = useState(false);
  const [previewingLetter, setPreviewingLetter] = useState<FileTransfer | null>(null);

  const [activeBoxTab, setActiveBoxTab] = useState<'received' | 'sent'>('received');
  const [letterFilter, setLetterFilter] = useState<'ALL' | 'PENDING' | 'SIGNED' | 'REJECTED' | 'ARCHIVED'>('ALL');

  // File Transfer Form State
  const [selectedFile, setSelectedFile] = useState<{
    file: globalThis.File;
    name: string;
    size: number;
    formattedSize: string;
    category: FileCategory;
  } | null>(null);

  // Official Letter Upload State
  const [selectedLetterFile, setSelectedLetterFile] = useState<{
    file: globalThis.File;
    name: string;
    size: number;
    formattedSize: string;
    category: FileCategory;
  } | null>(null);

  const otherStaff = staffList.filter((u) => u.id !== currentUser.id);
  const signatoriesList = staffList.filter((u) => u.canSignOfficialLetters || u.role === 'SUPER_ADMIN');

  const [recipientId, setRecipientId] = useState<string>('');
  const [letterRecipientId, setLetterRecipientId] = useState<string>('');
  const [note, setNote] = useState('');
  const [letterSubject, setLetterSubject] = useState('');
  const [letterNote, setLetterNote] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [letterDragActive, setLetterDragActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Manager Signature modal state (Only for CEO / authorized signatories)
  const [signingTransfer, setSigningTransfer] = useState<FileTransfer | null>(null);
  const [signatureComment, setSignatureComment] = useState('تایید و امضا شد.');

  // Letter Referral Modal State (Can be referred to ANY person in organization)
  const [referringTransfer, setReferringTransfer] = useState<FileTransfer | null>(null);
  const [referralTargetUserId, setReferralTargetUserId] = useState<string>('');
  const [referralComment, setReferralComment] = useState('جهت بررسی و اقدام مقتضی');

  // Permissions Check: Strictly check canSendOfficialLetters or canSignOfficialLetters or SUPER_ADMIN
  const canSignOfficial = Boolean(currentUser.canSignOfficialLetters === true || currentUser.role === 'SUPER_ADMIN');
  const canSendOfficial = Boolean(currentUser.canSendOfficialLetters === true || canSignOfficial);
  const canAccessLettersMenu = canSendOfficial || canSignOfficial;

  // Ensure user cannot stay on letters tab if permission is revoked
  useEffect(() => {
    if (!canAccessLettersMenu && mainMenuTab === 'letters') {
      setMainMenuTab('files');
    }
  }, [canAccessLettersMenu, mainMenuTab]);
  const activeRecipientId = recipientId || otherStaff[0]?.id || staffList[0]?.id || '';
  const activeLetterRecipientId = letterRecipientId || signatoriesList[0]?.id || otherStaff[0]?.id || '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const letterFileInputRef = useRef<HTMLInputElement>(null);

  // Regular Files (non-official)
  const regularTransfers = transfers.filter((t) => !t.isOfficialLetter);
  const receivedFiles = regularTransfers.filter((t) => {
    const isRecipient = t.recipients.some((r) => r.id === currentUser.id);
    const matchesSearch =
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sender.fullName.toLowerCase().includes(searchQuery.toLowerCase());
    return isRecipient && matchesSearch;
  });

  const sentFiles = regularTransfers.filter((t) => {
    const isSender = t.sender.id === currentUser.id;
    const matchesSearch =
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.recipients.some((r) => r.fullName.toLowerCase().includes(searchQuery.toLowerCase()));
    return isSender && matchesSearch;
  });

  // Official Letters
  const officialLetters = transfers.filter((t) => t.isOfficialLetter);
  const activeLettersCount = officialLetters.filter((t) => !t.isArchived).length;
  const archivedLettersCount = officialLetters.filter((t) => t.isArchived).length;

  const userOfficialLetters = officialLetters.filter((t) => {
    const isRelated =
      t.sender.id === currentUser.id ||
      t.recipients.some((r) => r.id === currentUser.id) ||
      (t.referrals && t.referrals.some((ref) => ref.toUser.id === currentUser.id || ref.fromUser.id === currentUser.id)) ||
      canSignOfficial;

    const matchesSearch =
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.sender.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.note && t.note.toLowerCase().includes(searchQuery.toLowerCase()));

    let matchesFilter = false;
    if (letterFilter === 'ARCHIVED') {
      matchesFilter = !!t.isArchived;
    } else {
      if (t.isArchived) return false;
      if (letterFilter === 'ALL') matchesFilter = true;
      else if (letterFilter === 'PENDING') matchesFilter = t.signatureStatus === 'PENDING_SIGNATURE';
      else if (letterFilter === 'SIGNED') matchesFilter = t.signatureStatus === 'SIGNED';
      else if (letterFilter === 'REJECTED') matchesFilter = t.signatureStatus === 'REJECTED';
    }

    return isRelated && matchesSearch && matchesFilter;
  });

  const pendingLettersCount = officialLetters.filter(
    (t) => t.signatureStatus === 'PENDING_SIGNATURE' && (canSignOfficial || t.recipients.some((r) => r.id === currentUser.id))
  ).length;

  const handleFilePicked = (rawFile: globalThis.File) => {
    setSelectedFile({
      file: rawFile,
      name: rawFile.name,
      size: rawFile.size,
      formattedSize: formatBytes(rawFile.size),
      category: getFileCategory(rawFile.name),
    });
  };

  const handleLetterFilePicked = (rawFile: globalThis.File) => {
    setSelectedLetterFile({
      file: rawFile,
      name: rawFile.name,
      size: rawFile.size,
      formattedSize: formatBytes(rawFile.size),
      category: getFileCategory(rawFile.name),
    });
  };

  const onSendFile = () => {
    if (!selectedFile || isUploading) return;
    setIsUploading(true);
    setUploadProgress(0);

    handleSendTransfer({
      rawFile: selectedFile.file,
      recipientId: activeRecipientId,
      note,
      isOfficialLetter: false,
      onProgress: (p) => setUploadProgress(p),
      onDone: () => {
        setIsUploading(false);
        setSelectedFile(null);
        setNote('');
      },
    });
  };

  const onSendUploadedLetter = () => {
    if (!selectedLetterFile || isUploading) return;
    setIsUploading(true);
    setUploadProgress(0);

    const fullNote = letterSubject ? `موضوع: ${letterSubject} | ${letterNote}` : letterNote;

    handleSendTransfer({
      rawFile: selectedLetterFile.file,
      recipientId: activeLetterRecipientId,
      note: fullNote,
      isOfficialLetter: true,
      onProgress: (p) => setUploadProgress(p),
      onDone: () => {
        setIsUploading(false);
        setSelectedLetterFile(null);
        setLetterSubject('');
        setLetterNote('');
      },
    });
  };

  // Handler when a letter is drafted in the Word editor modal
  const handleSendDraftedLetter = (letterData: {
    title: string;
    contentHtml: string;
    pageSize: any;
    letterNumber: string;
    recipientId: string;
    note: string;
    headerCenterTitle?: string;
    headerCenterOffsetX?: number;
    headerCenterOffsetY?: number;
    subjectOffsetX?: number;
    subjectOffsetY?: number;
    metaOffsetX?: number;
    metaOffsetY?: number;
    headerCenterFontFamily?: string;
    subjectFontFamily?: string;
    metaFontFamily?: string;
    signerFontFamily?: string;
    signerFontSize?: number;
    customSignerName?: string;
    customSignerTitle?: string;
    signatureOffsetX?: number;
    signatureOffsetY?: number;
    signatureHeight?: number;
    customFooterNote?: string;
    bodyOffsetX?: number;
    bodyPaddingX?: number;
    attachmentFileName?: string;
    attachmentFileSize?: string;
    attachmentFileDataUrl?: string;
  }) => {
    setIsUploading(true);
    setUploadProgress(0);

    // Create styled HTML letter document
    const companyTitle = settings.companyName || '';
    const companySub = settings.companySubtitle || '';
    const footerNote = settings.letterNumbering?.defaultFooterNote || 'سامانه اتوماسیون سازمانی';

    const fullHtmlDoc = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${letterData.title}</title>
  <style>
    body { font-family: 'Vazirmatn', Tahoma, sans-serif; direction: rtl; padding: 40px; color: #3A241F; line-height: 1.8; }
    .header { border-bottom: 2px solid #3A241F; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; }
    .title { font-size: 16px; font-weight: bold; color: #6E1B1B; text-align: center; }
    .content { font-size: 13px; margin: 25px 0; min-height: 400px; }
    .footer { border-top: 1px solid #EBDBCE; padding-top: 15px; font-size: 11px; color: #8C6F66; display: flex; justify-content: space-between; align-items: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h2 style="margin: 0; color: #6E1B1B;">${companyTitle}</h2>
      <div style="font-size: 11px; color: #8C6F66;">${companySub}</div>
    </div>
    <div style="text-align: left; font-size: 11px; direction: ltr;">
      <div>No: ${letterData.letterNumber}</div>
      <div>Date: ${formatCurrentJalaliDateTime().split(' - ')[0]}</div>
      <div>Size: ${letterData.pageSize}</div>
    </div>
  </div>
  <div class="title">${letterData.title}</div>
  <div class="content">${letterData.contentHtml}</div>
  <div class="footer">
    <div>فرستنده: ${currentUser.fullName} (${currentUser.departmentName})</div>
    <div>${footerNote}</div>
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtmlDoc], { type: 'text/html;charset=utf-8' });
    const fileName = `نامه_${letterData.title.replace(/\s+/g, '_')}_${letterData.pageSize}.html`;
    const letterFile = new File([blob], fileName, { type: 'text/html' });

    handleSendTransfer({
      rawFile: letterFile,
      recipientId: letterData.recipientId,
      note: letterData.contentHtml,
      letterContentHtml: letterData.contentHtml,
      letterNumber: letterData.letterNumber,
      pageSize: letterData.pageSize,
      isOfficialLetter: true,
      headerCenterTitle: letterData.headerCenterTitle,
      headerCenterOffsetX: letterData.headerCenterOffsetX,
      headerCenterOffsetY: letterData.headerCenterOffsetY,
      subjectOffsetX: letterData.subjectOffsetX,
      subjectOffsetY: letterData.subjectOffsetY,
      metaOffsetX: letterData.metaOffsetX,
      metaOffsetY: letterData.metaOffsetY,
      headerCenterFontFamily: letterData.headerCenterFontFamily,
      subjectFontFamily: letterData.subjectFontFamily,
      metaFontFamily: letterData.metaFontFamily,
      signerFontFamily: letterData.signerFontFamily,
      signerFontSize: letterData.signerFontSize,
      customSignerName: letterData.customSignerName,
      customSignerTitle: letterData.customSignerTitle,
      signatureOffsetX: letterData.signatureOffsetX,
      signatureOffsetY: letterData.signatureOffsetY,
      signatureHeight: letterData.signatureHeight || DEFAULT_SIGNATURE_HEIGHT,
      customFooterNote: letterData.customFooterNote,
      bodyOffsetX: letterData.bodyOffsetX,
      bodyPaddingX: letterData.bodyPaddingX,
      attachmentFileName: letterData.attachmentFileName,
      attachmentFileSize: letterData.attachmentFileSize,
      attachmentFileDataUrl: letterData.attachmentFileDataUrl,
      onProgress: (p) => setUploadProgress(p),
      onDone: () => {
        setIsUploading(false);
        showToast(`نامه رسمی "${letterData.title}" با موفقیت ارسال گردید.`);
      },
    });
  };

  const handleReferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!referringTransfer) return;
    const targetId = referralTargetUserId || otherStaff[0]?.id;
    if (!targetId) return;

    handleReferLetter(referringTransfer.id, targetId, referralComment);
    setReferringTransfer(null);
    setReferralComment('جهت بررسی و اقدام مقتضی');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordError('لطفاً کلمه عبور فعلی را وارد نمایید.');
      return;
    }
    if (!newPassword) {
      setPasswordError('لطفاً کلمه عبور جدید را وارد نمایید.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('کلمه عبور جدید باید حداقل ۸ کاراکتر باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('تکرار کلمه عبور با کلمه عبور جدید مطابقت ندارد.');
      return;
    }
    try {
      await api.changePassword(currentPassword, newPassword);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'تغییر کلمه عبور ناموفق بود.');
      return;
    }
    showToast('کلمه عبور شما با موفقیت تغییر یافت.');
    setShowPasswordModal(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#3A241F] via-[#4A2620] to-[#2E1A16] p-2 sm:p-6 lg:p-8 pb-28 sm:pb-8 flex items-center justify-center font-sans antialiased text-[#3A241F]"
      dir="rtl"
    >
      <div className="w-full max-w-6xl bg-white rounded-2xl sm:rounded-[32px] shadow-2xl overflow-hidden border border-[#C98B6A]/30 flex flex-col min-h-0 sm:min-h-[820px]">

        {/* Top Header */}
        <header className="px-4 sm:px-8 py-3.5 sm:py-4 bg-[#FAF5F1] border-b border-[#EBDBCE] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-md shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-black text-base sm:text-lg text-[#3A241F] leading-tight truncate">
                  {settings.systemTitle || 'سامانه مدیریت اسناد و مکاتبات سازمانی'}
                </h1>
                {canSignOfficial && (
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full border border-amber-300 flex items-center gap-1 shadow-2xs shrink-0">
                    <Award className="w-3 h-3 text-amber-700" />
                    <span>صاحب امضای مجاز (مدیرعامل)</span>
                  </span>
                )}
                {!canSignOfficial && currentUser.canSendOfficialLetters && (
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300 shrink-0">
                    مجوز ارسال نامه رسمی
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#8C6F66] font-medium truncate sm:whitespace-normal">
                سامانه هوشمند تبادل فایل، نگارش اسناد Word، گردش ارجاعات و امضای اسکن‌شده مدیرعامل
              </p>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            {/* Quick Theme Switcher Button */}
            <button
              onClick={() => setShowThemeModal(true)}
              className="p-2 sm:p-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE] rounded-2xl transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold"
              title="تغییر رنگبندی و تم سامانه"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">رنگبندی</span>
            </button>

            {(currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN') && (
              <button
                onClick={() => { window.location.href = '/admin'; }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-2xl text-xs font-bold shadow-xs transition-all cursor-pointer"
                title="رفتن به کنسول مدیریت"
              >
                <span>پنل مدیریت</span>
              </button>
            )}

            {/* User info card + password change + logout */}
            <div className="flex items-center gap-1.5 bg-[#F6D9CD]/40 p-1.5 pr-2.5 sm:pr-3 rounded-2xl border border-[#C98B6A]/30">
              <div className="text-right">
                <div className="text-xs font-black text-[#3A241F] truncate max-w-[130px]">{currentUser.fullName}</div>
                <div className="text-[10px] text-[#D34A32] font-bold truncate max-w-[130px]">{currentUser.departmentName}</div>
              </div>
              
              {/* Change Password Button */}
              <button
                type="button"
                onClick={() => {
                  setPasswordError('');
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowPasswordModal(true);
                }}
                title="تغییر کلمه عبور حساب کاربری"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white hover:bg-amber-100 text-[#6E1B1B] border border-[#EBDBCE] flex items-center justify-center transition-colors cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>

              {/* Logout Button */}
              <button
                onClick={logout}
                title="خروج از حساب"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#F6D9CD] hover:bg-[#D34A32] text-[#6E1B1B] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {/* PRIMARY MENU NAVIGATION: 'ارسال فایل' vs 'نامه' */}
        <div className="bg-[#FAF5F1] px-4 sm:px-8 py-2.5 sm:py-3 border-b border-[#EBDBCE] flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            
            {/* Menu 1: ارسال فایل */}
            <button
              onClick={() => { setMainMenuTab('files'); setSearchQuery(''); }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                mainMenuTab === 'files'
                  ? 'bg-[#6E1B1B] text-white shadow-md shadow-[#6E1B1B]/25 scale-[1.02]'
                  : 'bg-white text-[#3A241F] hover:bg-[#F6D9CD]/40 border border-[#EBDBCE]'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>ارسال فایل</span>
            </button>

            {/* Menu 2: نامه (فقط برای کاربرانی که مجوز دارند) */}
            {canAccessLettersMenu && (
              <button
                onClick={() => { setMainMenuTab('letters'); setSearchQuery(''); }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-2xl text-xs font-black transition-all cursor-pointer ${
                  mainMenuTab === 'letters'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25 scale-[1.02]'
                    : 'bg-white text-[#3A241F] hover:bg-amber-50 border border-[#EBDBCE]'
                }`}
              >
                <Stamp className="w-4 h-4" />
                <span>نامه</span>
                {pendingLettersCount > 0 && canSignOfficial && (
                  <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                    {toPersianDigits(pendingLettersCount)}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-[#8C6F66]">
            {mainMenuTab === 'files' ? (
              <span className="flex items-center gap-1">
                <FolderOpen className="w-4 h-4 text-[#6E1B1B]" />
                تبادل سریع فایل میان همکاران و واحدهای سازمان
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-800">
                <Award className="w-4 h-4 text-amber-600" />
                کارتابل مکاتبات رسمی، ارجاع سازمانی و امضای اسکن‌شده مدیرعامل
              </span>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: FILE TRANSFER MODE (ارسال فایل) */}
        {/* ========================================================================= */}
        {mainMenuTab === 'files' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EBDBCE]/60">

            {/* Send File Panel */}
            <section className="lg:col-span-5 p-6 sm:p-8 bg-[#FAF5F1]/50 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#3A241F]">ارسال فایل به همکار</h2>
                    <p className="text-[11px] text-[#8C6F66]">فایل را انتخاب و گیرنده را مشخص کنید</p>
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
                      ? 'border-[#6E1B1B] bg-[#F6D9CD]/30'
                      : dragActive
                        ? 'border-[#D34A32] bg-[#F6D9CD]/50 scale-[0.99]'
                        : 'border-[#EBDBCE] hover:border-[#D34A32] hover:bg-white bg-white/70'
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
                      <div className="w-12 h-12 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shadow-md">
                        {renderCategoryIcon(selectedFile.category)}
                      </div>
                      <div>
                        <div className="font-bold text-xs text-[#3A241F] truncate max-w-xs">{selectedFile.name}</div>
                        <div className="text-[11px] text-[#D34A32] font-black mt-0.5">حجم: {selectedFile.formattedSize}</div>
                      </div>
                      <span className="text-[10px] text-[#8C6F66] hover:text-[#D34A32] font-bold mt-1">کلیک برای تغییر فایل</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center shadow-2xs">
                        <UploadCloud className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-[#3A241F]">
                          <span className="text-[#D34A32] underline font-black">انتخاب فایل</span> یا کشیدن به این بخش
                        </p>
                        <p className="text-[10px] text-[#8C6F66] font-medium">
                          پشتیبانی از کلیه فرمت‌ها (PDF، Office، تصاویر، ZIP، کد)
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Recipient */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-[#3A241F]">انتخاب گیرنده (همکار / واحد):</label>
                  <select
                    value={activeRecipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    disabled={otherStaff.length === 0}
                    className="w-full px-3.5 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none shadow-xs cursor-pointer disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    {otherStaff.length === 0 ? (
                      <option value="">همکار دیگری ثبت نشده (از پنل مدیریت کارمند جدید اضافه کنید)</option>
                    ) : (
                      otherStaff.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName} — {user.departmentName} ({user.email})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-[#3A241F]">پیام یا توضیحات ضمیمه فایل:</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="توضیح اختیاری درباره فایل ارسالی..."
                    className="w-full px-3.5 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs font-medium focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none placeholder:text-[#B8A39C] shadow-xs"
                  />
                </div>

                {/* Progress */}
                {isUploading && (
                  <div className="space-y-1.5 bg-white p-3.5 rounded-2xl border border-[#EBDBCE] shadow-xs">
                    <div className="flex justify-between text-[10px] font-black text-[#6E1B1B]">
                      <span>در حال بارگذاری و ارسال امن...</span>
                      <span>{toPersianDigits(uploadProgress)}٪</span>
                    </div>
                    <div className="w-full bg-[#F6D9CD] rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-[#6E1B1B] h-full rounded-full transition-all duration-150"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Send Button */}
              <button
                onClick={onSendFile}
                disabled={!selectedFile || isUploading || otherStaff.length === 0}
                className={`w-full py-3.5 px-5 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 ${selectedFile && !isUploading && otherStaff.length > 0
                    ? 'bg-[#6E1B1B] hover:bg-[#581717] text-white shadow-[#6E1B1B]/25 cursor-pointer'
                    : 'bg-[#EAE5E3] text-[#B8A39C] cursor-not-allowed'
                  }`}
              >
                <Send className="w-4 h-4" />
                <span>ارسال فایل به گیرنده</span>
              </button>
            </section>

            {/* Transfers Inbox & Outbox Panel */}
            <section className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-5 bg-white">
              <div className="space-y-4">
                
                {/* Header + Tabs + Search */}
                <div className="flex flex-col gap-3 pb-3 border-b border-[#EBDBCE]/60">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    {/* Switchable Tabs: Received vs Sent */}
                    <div className="flex items-center gap-2 bg-[#FAF5F1] p-1.5 rounded-2xl border border-[#EBDBCE]">
                      <button
                        onClick={() => setActiveBoxTab('received')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          activeBoxTab === 'received'
                            ? 'bg-[#6E1B1B] text-white shadow-xs'
                            : 'text-[#8C6F66] hover:text-[#3A241F]'
                        }`}
                      >
                        <Inbox className="w-3.5 h-3.5" />
                        <span>فایل‌های دریافتی</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          activeBoxTab === 'received' ? 'bg-white/20 text-white' : 'bg-[#EBDBCE] text-[#3A241F]'
                        }`}>
                          {toPersianDigits(receivedFiles.length)}
                        </span>
                      </button>

                      <button
                        onClick={() => setActiveBoxTab('sent')}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                          activeBoxTab === 'sent'
                            ? 'bg-[#6E1B1B] text-white shadow-xs'
                            : 'text-[#8C6F66] hover:text-[#3A241F]'
                        }`}
                      >
                        <SendHorizonal className="w-3.5 h-3.5" />
                        <span>فایل‌های ارسالی</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          activeBoxTab === 'sent' ? 'bg-white/20 text-white' : 'bg-[#EBDBCE] text-[#3A241F]'
                        }`}>
                          {toPersianDigits(sentFiles.length)}
                        </span>
                      </button>
                    </div>

                    {/* Search Box */}
                    <div className="relative w-full sm:w-52">
                      <Search className="w-3.5 h-3.5 text-[#B8A39C] absolute right-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={activeBoxTab === 'received' ? 'جستجو در دریافتی‌ها...' : 'جستجو در ارسالی‌ها...'}
                        className="w-full pr-8 pl-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* TAB 1: RECEIVED FILES */}
                {activeBoxTab === 'received' && (
                  <div>
                    {receivedFiles.length === 0 ? (
                      <div className="text-center py-16 bg-[#FAF5F1]/60 rounded-3xl border border-dashed border-[#EBDBCE]">
                        <div className="w-12 h-12 rounded-full bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center mx-auto mb-2.5">
                          <Inbox className="w-6 h-6" />
                        </div>
                        <h3 className="text-xs font-bold text-[#3A241F]">صندوق فایل‌های دریافتی خالی است</h3>
                        <p className="text-[11px] text-[#8C6F66] max-w-xs mx-auto mt-1">
                          فایل‌هایی که سایر همکاران برای حساب شما ارسال کنند در این بخش قرار می‌گیرند.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pl-1">
                        {receivedFiles.map((t) => (
                          <div
                            key={t.id}
                            className="p-4 bg-white rounded-2xl border border-[#EBDBCE] hover:border-[#C98B6A] hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                          >
                            <div className="flex items-start gap-3.5 truncate">
                              <div className="p-2.5 bg-[#FAF5F1] rounded-xl border border-[#EBDBCE] shrink-0">
                                {renderCategoryIcon(t.category)}
                              </div>
                              <div className="space-y-1 truncate">
                                <h3 className="font-bold text-xs text-[#3A241F] group-hover:text-[#6E1B1B] transition-colors truncate">
                                  {t.fileName}
                                </h3>
                                <div className="flex items-center gap-2 text-[10px] text-[#8C6F66]">
                                  <span className="font-bold text-[#6E1B1B] bg-[#F6D9CD]/60 px-2 py-0.5 rounded-md border border-[#C98B6A]/30">{t.fileSize}</span>
                                  <span>•</span>
                                  <span>فرستنده: <b>{t.sender.fullName}</b> ({t.sender.departmentName})</span>
                                  <span>•</span>
                                  <span className="font-mono">{toPersianDigits(t.sentAt)}</span>
                                </div>
                                {t.note && (
                                  <p className="text-[11px] text-[#503730] bg-[#FAF5F1] p-1.5 rounded-lg border border-[#EBDBCE] italic">
                                    "{t.note}"
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                onClick={() => handleDownload(t)}
                                className="flex items-center gap-1.5 px-4 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
                                title="دانلود فایل"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>دانلود</span>
                              </button>
                              <button
                                onClick={() => handleDeleteTransfer(t.id)}
                                className="p-2 text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/30 rounded-xl transition-colors cursor-pointer"
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
                )}

                {/* TAB 2: SENT FILES */}
                {activeBoxTab === 'sent' && (
                  <div>
                    {sentFiles.length === 0 ? (
                      <div className="text-center py-16 bg-[#FAF5F1]/60 rounded-3xl border border-dashed border-[#EBDBCE]">
                        <div className="w-12 h-12 rounded-full bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center mx-auto mb-2.5">
                          <SendHorizonal className="w-6 h-6" />
                        </div>
                        <h3 className="text-xs font-bold text-[#3A241F]">هنوز فایلی ارسال نکرده‌اید</h3>
                        <p className="text-[11px] text-[#8C6F66] max-w-xs mx-auto mt-1">
                          هر فایلی که از بخش سمت راست ارسال کنید، در این بخش قابل مشاهده و دانلود مجدد خواهد بود.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-[500px] overflow-y-auto pl-1">
                        {sentFiles.map((t) => (
                          <div
                            key={t.id}
                            className="p-4 bg-white rounded-2xl border border-[#EBDBCE] hover:border-[#C98B6A] hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                          >
                            <div className="flex items-start gap-3.5 truncate">
                              <div className="p-2.5 bg-[#FAF5F1] rounded-xl border border-[#EBDBCE] shrink-0">
                                {renderCategoryIcon(t.category)}
                              </div>
                              <div className="space-y-1 truncate">
                                <h3 className="font-bold text-xs text-[#3A241F] group-hover:text-[#6E1B1B] transition-colors truncate">
                                  {t.fileName}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#8C6F66]">
                                  <span className="font-bold text-[#6E1B1B] bg-[#F6D9CD]/60 px-2 py-0.5 rounded-md border border-[#C98B6A]/30">{t.fileSize}</span>
                                  <span>•</span>
                                  <span>گیرنده: <b>{t.recipients.map(r => r.fullName).join(', ')}</b></span>
                                  <span>•</span>
                                  <span className="font-mono">{toPersianDigits(t.sentAt)}</span>
                                  <span>•</span>
                                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                    {toPersianDigits(t.downloadsCount)} بار دانلود شده
                                  </span>
                                </div>
                                {t.note && (
                                  <p className="text-[11px] text-[#503730] bg-[#FAF5F1] p-1.5 rounded-lg border border-[#EBDBCE] italic">
                                    "{t.note}"
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                onClick={() => handleDownload(t)}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border border-[#EBDBCE] font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                title="دانلود فایل ارسالی"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>دانلود</span>
                              </button>
                              <button
                                onClick={() => handleDeleteTransfer(t.id)}
                                className="p-2 text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/30 rounded-xl transition-colors cursor-pointer"
                                title="حذف از تاریخچه"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: OFFICIAL LETTERS MODE (نامه) */}
        {/* ========================================================================= */}
        {mainMenuTab === 'letters' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[#EBDBCE]/60">

            {/* Submit / Type Official Letter Panel */}
            <section className="lg:col-span-5 p-6 sm:p-8 bg-amber-50/20 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <Stamp className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-[#3A241F]">نگارش و صدور نامه اداری</h2>
                    <p className="text-[11px] text-[#8C6F66]">تدوین آنلاین در ویرایشگر رسمی سازمانی</p>
                  </div>
                </div>

                {canSendOfficial ? (
                  <div className="space-y-4">
                    {/* PRIMARY ACTION: OPEN RICH WORD-LIKE LETTER EDITOR */}
                    <div className="p-5 bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-3xl shadow-lg shadow-amber-600/20 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 font-black text-sm">
                          <PenTool className="w-5 h-5" />
                          <span>نگارش آنلاین نامه رسمی (محیط Word)</span>
                        </div>
                        <span className="bg-white/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          A4 / A5 / Letter
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-100 leading-relaxed">
                        تایپ با فونت رسمی، قالب‌های آماده، سربرگ سازمانی، پیوست مدارک و اسکن، و ارسال مستقیم جهت امضای مدیر.
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsLetterEditorOpen(true)}
                        className="w-full py-3 bg-white text-amber-800 hover:bg-amber-50 font-black text-xs rounded-2xl shadow-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <PenTool className="w-4 h-4 text-amber-600" />
                        <span>باز کردن ویرایشگر و شروع تایپ نامه</span>
                      </button>
                    </div>

                    {/* Features Guide Card */}
                    <div className="p-4 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] space-y-2.5 text-xs text-[#503730]">
                      <div className="font-bold text-[#3A241F] flex items-center gap-1.5 text-[11px] pb-1 border-b border-[#EBDBCE]/60">
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>امکانات و قابلیت‌های نگارش نامه:</span>
                      </div>
                      <div className="space-y-2 text-[11px] text-[#8C6F66]">
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0"></span>
                          <span><b>پیوست و اسکن مدارک:</b> امکان الصاق تصویر اسکن‌شده یا فایل PDF ضمیمه درون ویرایشگر</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0"></span>
                          <span><b>تنظیمات سربرگ و قطع کاغذ:</b> انتخاب ابعاد A4 و A5 و هماهنگی لوگو و عناوین</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0"></span>
                          <span><b>شماره‌گذاری پلکانی هوشمند:</b> ثبت و رزرو خودکار شماره نامه رسمی</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0"></span>
                          <span><b>گردش کار و امضای مدیر:</b> ارجاع به کارتابل مدیریت جهت تایید، پاراف و امضای دیجیتال</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-white rounded-3xl border border-dashed border-amber-300 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                      <Lock className="w-6 h-6" />
                    </div>
                    <h3 className="text-xs font-black text-[#3A241F]">عدم دسترسی به ارسال نامه رسمی</h3>
                    <p className="text-[11px] text-[#8C6F66] leading-relaxed">
                      حساب کاربری شما هنوز مجوز ارسال نامه‌های رسمی جهت امضای مدیر را ندارد. برای فعال‌سازی این دسترسی، از مدیر سیستم درخواست نمایید.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Official Letters Workflow & Referral Registry Panel */}
            <section className="lg:col-span-7 p-4 sm:p-6 lg:p-8 flex flex-col justify-between space-y-5 bg-white">
              <div className="space-y-4">
                
                {/* Header + Filters (Row 1) + Search (Row 2) */}
                <div className="flex flex-col gap-2.5 pb-3 border-b border-[#EBDBCE]/60">
                  
                  {/* Row 1: Full-Width Status Filter Tabs with RED Vazirmatn Numbers */}
                  <div className="flex items-center gap-1.5 bg-[#FAF5F1] p-1.5 rounded-2xl border border-[#EBDBCE] overflow-x-auto no-scrollbar w-full text-[11px] font-sans scroll-smooth">
                    <button
                      onClick={() => setLetterFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        letterFilter === 'ALL' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-white/70'
                      }`}
                    >
                      <span>همه نامه‌ها</span>
                      <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100/90 text-rose-600 border border-rose-300">
                        {toPersianDigits(activeLettersCount)}
                      </span>
                    </button>

                    <button
                      onClick={() => setLetterFilter('PENDING')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        letterFilter === 'PENDING' ? 'bg-amber-600 text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-white/70'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>در انتظار امضا</span>
                      <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100/90 text-rose-600 border border-rose-300">
                        {toPersianDigits(transfers.filter((t) => t.isOfficialLetter && !t.isArchived && t.signatureStatus === 'PENDING_SIGNATURE' && (t.sender.id === currentUser.id || t.recipients.some(r => r.id === currentUser.id))).length)}
                      </span>
                    </button>

                    <button
                      onClick={() => setLetterFilter('SIGNED')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        letterFilter === 'SIGNED' ? 'bg-emerald-700 text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-white/70'
                      }`}
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>امضا شده</span>
                      <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100/90 text-rose-600 border border-rose-300">
                        {toPersianDigits(transfers.filter((t) => t.isOfficialLetter && !t.isArchived && t.signatureStatus === 'SIGNED' && (t.sender.id === currentUser.id || t.recipients.some(r => r.id === currentUser.id))).length)}
                      </span>
                    </button>

                    <button
                      onClick={() => setLetterFilter('REJECTED')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        letterFilter === 'REJECTED' ? 'bg-rose-700 text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-white/70'
                      }`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>رد شده</span>
                      <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100/90 text-rose-600 border border-rose-300">
                        {toPersianDigits(transfers.filter((t) => t.isOfficialLetter && !t.isArchived && t.signatureStatus === 'REJECTED' && (t.sender.id === currentUser.id || t.recipients.some(r => r.id === currentUser.id))).length)}
                      </span>
                    </button>

                    <button
                      onClick={() => setLetterFilter('ARCHIVED')}
                      className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                        letterFilter === 'ARCHIVED' ? 'bg-[#3A241F] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-white/70'
                      }`}
                    >
                      <Archive className="w-3.5 h-3.5 text-amber-500" />
                      <span>بایگانی نامه‌ها</span>
                      <span className="text-[11px] font-bold px-1.5 py-0.2 rounded-md bg-rose-100/90 text-rose-600 border border-rose-300">
                        {toPersianDigits(archivedLettersCount)}
                      </span>
                    </button>
                  </div>

                  {/* Row 2: Search Input Directly Below the Status Filter Bar */}
                  <div className="flex items-center justify-between gap-3 w-full">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-[#B8A39C] absolute right-3 top-2.5" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="جستجو در متن، شماره نامه، موضوع، گیرنده یا فرستنده..."
                        className="w-full pr-9 pl-4 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus:outline-none shadow-2xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Letters List */}
                {userOfficialLetters.length === 0 ? (
                  <div className="text-center py-16 bg-amber-50/30 rounded-3xl border border-dashed border-amber-200">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-2.5">
                      <Stamp className="w-6 h-6" />
                    </div>
                    <h3 className="text-xs font-bold text-[#3A241F]">هیچ نامه‌ای در این بخش یافت نشد</h3>
                    <p className="text-[11px] text-[#8C6F66] max-w-xs mx-auto mt-1">
                      نامه‌های اداری ارسال‌شده، ارجاع‌شده یا دریافتی جهت امضای مدیر در این کارتابل نمایش داده می‌شوند.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 max-h-[500px] overflow-y-auto pl-1">
                    {userOfficialLetters.map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 sm:p-5 bg-white rounded-2xl sm:rounded-3xl border border-amber-200/80 hover:border-amber-400 hover:shadow-md transition-all flex flex-col space-y-3.5 group"
                      >
                        {/* Top Info Section: Thumbnail on Right + Comprehensive Details */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                          {/* Large, Beautiful Letter Thumbnail on the Right */}
                          <div className="shrink-0 self-center sm:self-auto">
                            <LetterThumbnail
                              letter={t}
                              onClick={() => setPreviewingLetter(t)}
                              size="lg"
                            />
                          </div>

                          {/* Letter Details */}
                          <div className="flex-1 min-w-0 space-y-2 text-right w-full">
                            {/* Title & Status in one clean row */}
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h3
                                onClick={() => setPreviewingLetter(t)}
                                className="font-black text-sm text-[#3A241F] hover:text-[#6E1B1B] transition-colors cursor-pointer leading-snug"
                                title="کلیک برای مشاهده کامل نامه"
                              >
                                {t.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '').replace(/_/g, ' ')}
                              </h3>

                              {/* Status Badges */}
                              {t.signatureStatus === 'PENDING_SIGNATURE' && (
                                <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] sm:text-[11px] font-black px-2 sm:px-2.5 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>در انتظار امضای مدیریت</span>
                                </span>
                              )}
                              {t.signatureStatus === 'SIGNED' && (
                                <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] sm:text-[11px] font-black px-2 sm:px-2.5 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>امضا شده ({t.signedBy || settings.ceoName || 'مدیرعامل'})</span>
                                </span>
                              )}
                              {t.signatureStatus === 'REJECTED' && (
                                <span className="bg-rose-100 text-rose-900 border border-rose-300 text-[10px] sm:text-[11px] font-black px-2 sm:px-2.5 py-0.5 rounded-lg flex items-center gap-1 shrink-0">
                                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                  <span>رد شده</span>
                                </span>
                              )}
                            </div>

                            {/* Metadata Row */}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs text-[#8C6F66]">
                              {/* Official Letter Number Badge */}
                              <span className="font-bold text-amber-950 bg-amber-50 px-2 sm:px-2.5 py-0.5 rounded-lg border border-amber-200/90 flex items-center gap-1.5 shadow-2xs">
                                <Hash className="w-3.5 h-3.5 text-amber-700" />
                                <span>شماره نامه:</span>
                                <b className="text-[#6E1B1B] font-bold">{toPersianDigits(t.letterNumber || t.customHeaderNumber || '---')}</b>
                              </span>
                              <span>•</span>
                              <span className="font-bold text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md border border-amber-200">
                                {toPersianDigits(t.fileSize ? t.fileSize.replace(/KB|kb/i, 'کیلوبایت').replace(/MB|mb/i, 'مگابایت').replace(/GB|gb/i, 'گیگابایت').replace(/B/i, 'بایت') : '')}
                              </span>
                              <span>•</span>
                              <span>فرستنده: <b className="text-[#3A241F] font-bold">{t.sender.fullName}</b> ({t.sender.departmentName})</span>
                              <span>•</span>
                              <span>گیرنده: <b className="text-[#3A241F] font-bold">{t.recipients?.map(r => r.fullName).join(', ')}</b></span>
                              <span>•</span>
                              <span className="text-[#503730] font-bold">{toPersianDigits(t.sentAt)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Row: Actions in ONE distinct horizontal line */}
                        <div className="pt-3 border-t border-amber-100/80 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto">
                            <button
                              onClick={() => setPreviewingLetter(t)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FAF5F1] hover:bg-[#6E1B1B] text-[#3A241F] hover:text-white border border-[#EBDBCE] hover:border-[#6E1B1B] font-black text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="مشاهده پیش‌نمایش، متن، پیوست و بررسی نامه"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#C98B6A]" />
                              <span>مشاهده و بررسی نامه</span>
                            </button>

                            <button
                              onClick={() => setReferringTransfer(t)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 bg-[#FAF5F1] hover:bg-amber-100 text-[#3A241F] border border-amber-300 font-bold text-xs rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
                              title="ارجاع نامه به سایر پرسنل / واحدها"
                            >
                              <Forward className="w-3.5 h-3.5 text-amber-700" />
                              <span>ارجاع</span>
                            </button>

                            <button
                              onClick={() => handleDownload(t)}
                              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                              title="دریافت نسخه PDF و چاپ سند با امضا و مهر رسمی"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>چاپ / PDF</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            {t.signatureStatus === 'SIGNED' ? (
                              t.isArchived ? (
                                <button
                                  type="button"
                                  onClick={() => handleUnarchiveTransfer(t.id)}
                                  className="flex items-center gap-1 px-3 py-2 bg-[#FAF5F1] hover:bg-white text-[#3A241F] border border-[#EBDBCE] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                  title="خروج نامه از بایگانی"
                                >
                                  <ArchiveRestore className="w-3.5 h-3.5 text-[#C98B6A]" />
                                  <span>خروج از بایگانی</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleArchiveTransfer(t.id)}
                                  className="flex items-center gap-1 px-3 py-2 bg-[#FAF5F1] hover:bg-[#3A241F] text-[#3A241F] hover:text-white border border-[#EBDBCE] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                  title="بایگانی نامه رسمی"
                                >
                                  <Archive className="w-3.5 h-3.5 text-amber-700" />
                                  <span>بایگانی نامه</span>
                                </button>
                              )
                            ) : (
                              (t.sender.id === currentUser.id || canSignOfficial) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTransfer(t.id)}
                                  className="p-2 text-[#8C6F66] hover:text-[#D34A32] hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                  title="حذف پیش‌نویس"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )
                            )}
                          </div>
                        </div>

                        {/* OFFICIAL BORDERLESS STAMPED SIGNATURE ON SIGNED LETTER */}
                        {t.signatureStatus === 'SIGNED' && (
                          <div className="pt-3 border-t border-[#EBDBCE]/60 flex flex-col sm:flex-row items-center justify-between gap-4 select-none">
                            <div className="space-y-1 text-right">
                              <div className="flex items-center gap-2">
                                <span className="font-black text-xs text-[#3A241F]">
                                  {t.signedBy || settings.ceoName || 'دکتر علیرضا پارسا'}
                                </span>
                                <span className="text-[10px] text-[#8C6F66] font-medium">
                                  — {settings.ceoTitle || 'مدیرعامل و رئیس هیئت مدیره'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-emerald-800 font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>امضای دیجیتال معتبر و تایید شده ({t.signedAt})</span>
                              </div>
                              {t.signatureComment && (
                                <p className="text-[11px] text-[#503730] italic font-medium">
                                  دستور/پاراف: "{t.signatureComment}"
                                </p>
                              )}
                            </div>

                            {/* Stamped Visual Signatures & Official Seal without any surrounding box or border */}
                            <div className="flex items-center gap-3 shrink-0">
                              {(t.signatureImageUrl || settings.ceoSignatureUrl) && (
                                <img
                                  src={t.signatureImageUrl || settings.ceoSignatureUrl}
                                  alt="اسکن امضای مدیرعامل"
                                  className="h-14 object-contain mix-blend-multiply transition-transform hover:scale-105"
                                />
                              )}

                              {(t.companyStampImageUrl || settings.companyStampUrl) && (
                                <img
                                  src={t.companyStampImageUrl || settings.companyStampUrl}
                                  alt="مهر رسمی شرکت"
                                  className="h-14 object-contain mix-blend-multiply opacity-90 transition-transform hover:scale-105"
                                />
                              )}
                            </div>
                          </div>
                        )}

                        {/* Referral Chain & History Box */}
                        {t.referrals && t.referrals.length > 0 && (
                          <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/80 space-y-1.5 text-[10px]">
                            <div className="flex items-center gap-1 font-bold text-amber-900">
                              <History className="w-3 h-3 text-amber-700" />
                              <span>سوابق گردش و ارجاعات سازمانی این نامه:</span>
                            </div>
                            <div className="space-y-1 pr-2 border-r-2 border-amber-300">
                              {t.referrals.map((ref) => (
                                <div key={ref.id} className="text-[#3A241F]">
                                  <span className="font-bold text-[#6E1B1B]">{ref.fromUser.fullName}</span> ➔ به <span className="font-bold text-emerald-800">{ref.toUser.fullName} ({ref.toUser.departmentName})</span>
                                  <span className="text-[#8C6F66] mr-1 font-mono">[{ref.date}]:</span>
                                  <span className="italic mr-1 text-[#503730]">"{ref.comment}"</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5 font-bold text-amber-700">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> گردش رسمی مکاتبات سازمانی و ارجاع فعال
                </span>
                <span>امضای الکترونیک معتبر • تقویم هجری شمسی</span>
              </div>
            </section>
          </div>
        )}

      </div>

      {/* Letter Preview & Inspection Modal */}
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
          onDownload={handleDownload}
          onOpenEditor={(_letterToEdit) => {
            setPreviewingLetter(null);
            setIsLetterEditorOpen(true);
          }}
        />
      )}

      {/* Rich Word-Like Letter Editor Modal */}
      {isLetterEditorOpen && (
        <LetterEditorModal
          isOpen={isLetterEditorOpen}
          onClose={() => setIsLetterEditorOpen(false)}
          staffList={staffList}
          currentUser={currentUser}
          letterNumbering={settings.letterNumbering}
          onSendLetter={handleSendDraftedLetter}
        />
      )}

      {/* Manager Signature Review Modal (CEO Only) */}
      {signingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-amber-200 space-y-4">
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-sm text-[#3A241F]">تایید و امضای رسمی نامه (مدیرعامل)</h3>
              </div>
              <button
                onClick={() => setSigningTransfer(null)}
                className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200 space-y-2 text-xs">
              <div className="font-bold text-[#3A241F]">فایل نامه: {signingTransfer.fileName} ({signingTransfer.fileSize})</div>
              <div className="text-[11px] text-[#8C6F66]">
                فرستنده اولیه: {signingTransfer.sender.fullName} ({signingTransfer.sender.departmentName})
              </div>
              {signingTransfer.note && (
                <div className="text-[11px] text-[#503730] italic">
                  متن ضمیمه: "{signingTransfer.note}"
                </div>
              )}
            </div>

            {/* Signature Stamping Live Preview */}
            <div className="p-3 bg-[#FAF5F1] rounded-2xl border border-amber-200 space-y-2 text-xs">
              <span className="font-bold text-[#3A241F] text-[11px] block">اسکن امضا و مهر رسمی الصاقی:</span>
              <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-[#EBDBCE]">
                <div>
                  <div className="font-bold text-xs text-[#3A241F]">{settings.ceoName || currentUser.fullName}</div>
                  <div className="text-[10px] text-[#8C6F66]">{settings.ceoTitle || 'مدیرعامل و رئیس هیئت مدیره'}</div>
                </div>
                <div className="flex items-center gap-2">
                  {settings.ceoSignatureUrl && (
                    <img src={settings.ceoSignatureUrl} alt="امضا" className="h-10 object-contain mix-blend-multiply" />
                  )}
                  {settings.companyStampUrl && (
                    <img src={settings.companyStampUrl} alt="مهر" className="h-10 object-contain mix-blend-multiply" />
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#3A241F]">متن پاراف یا دستور مدیرعامل:</label>
              <textarea
                rows={2}
                value={signatureComment}
                onChange={(e) => setSignatureComment(e.target.value)}
                placeholder="دستور مقتضی جهت صدور، اقدام یا بایگانی..."
                className="w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#EBDBCE]">
              <button
                onClick={() => {
                  handleRejectLetter(signingTransfer.id, signatureComment || 'عدم تایید مدیر');
                  setSigningTransfer(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition-all cursor-pointer"
              >
                عدم تایید / رد
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSigningTransfer(null)}
                  className="px-3.5 py-2 text-xs font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  onClick={() => {
                    handleSignLetter(signingTransfer.id, signatureComment);
                    setSigningTransfer(null);
                  }}
                  className="px-5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Award className="w-4 h-4" />
                  <span>تایید و امضای رسمی</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LETTER REFERRAL MODAL (ارجاع نامه به تمام پرسنل سازمان) */}
      {referringTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <form
            onSubmit={handleReferSubmit}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-amber-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <div className="flex items-center gap-2">
                <Forward className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-sm text-[#3A241F]">ارجاع نامه اداری به همکار</h3>
              </div>
              <button
                type="button"
                onClick={() => setReferringTransfer(null)}
                className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200 text-xs space-y-1">
              <div className="font-bold text-[#3A241F] truncate">{referringTransfer.fileName}</div>
              <div className="text-[11px] text-[#8C6F66]">
                فرستنده اولیه: {referringTransfer.sender.fullName} ({referringTransfer.sender.departmentName})
              </div>
            </div>

            {/* Target Colleague / Unit (ANY PERSON IN SYSTEM) */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#3A241F]">ارجاع به کارمند / واحد:</label>
              <select
                value={referralTargetUserId}
                onChange={(e) => setReferralTargetUserId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none cursor-pointer"
              >
                {otherStaff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} — {u.departmentName} ({u.role === 'SUPER_ADMIN' ? 'مدیر ارشد' : u.role === 'DEPT_ADMIN' ? 'مدیر واحد' : 'پرسنل'})
                  </option>
                ))}
              </select>
            </div>

            {/* Referral Note / Paraph */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#3A241F]">دستور ارجاع یا پاراف:</label>
              <textarea
                rows={3}
                required
                value={referralComment}
                onChange={(e) => setReferralComment(e.target.value)}
                placeholder="دستور پیگیری، بررسی، اقدام مقتضی یا اعلام نظر..."
                className="w-full px-3.5 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => setReferringTransfer(null)}
                className="px-4 py-2 text-xs font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-5 py-2 text-xs font-black bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Forward className="w-4 h-4" />
                <span>ثبت ارجاع نامه</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Theme Switcher Modal */}
      {showThemeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full p-6 border border-[#EBDBCE] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <h3 className="font-black text-sm text-[#3A241F]">انتخاب تم و رنگبندی سامانه</h3>
              <button
                onClick={() => setShowThemeModal(false)}
                className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ThemeSelector />

            <div className="flex justify-end pt-3 border-t border-[#EBDBCE]">
              <button
                onClick={() => setShowThemeModal(false)}
                className="px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-xs transition-all cursor-pointer"
              >
                بستن و بازگشت
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-24 sm:bottom-6 left-6 z-50 bg-gray-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PERSISTENT MOBILE FLOATING BOTTOM DOCK NAVIGATION (Position: Fixed, 16px bottom) */}
      {/* ========================================================================= */}
      <nav
        aria-label="منوی شناور موبایل"
        className="fixed bottom-4 inset-x-3 sm:hidden z-40 max-w-md mx-auto bg-white/95 backdrop-blur-2xl border border-[#EBDBCE] shadow-[0_16px_48px_rgba(58,36,31,0.28)] rounded-[28px] p-1.5 flex items-center justify-between gap-1 transition-all select-none"
      >
        {/* Tab 1: ارسال فایل */}
        <button
          type="button"
          onClick={() => { setMainMenuTab('files'); setSearchQuery(''); }}
          className={`flex-1 min-h-[50px] min-w-[50px] flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-all active:scale-95 cursor-pointer relative ${
            mainMenuTab === 'files'
              ? 'bg-[#6E1B1B] text-white shadow-md'
              : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1]'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4" />
          <span className="text-[10px] font-black">تبادل فایل</span>
          {receivedFiles.length > 0 && mainMenuTab !== 'files' && (
            <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#D34A32]"></span>
          )}
        </button>

        {/* Tab 2: نامه‌ها */}
        {canAccessLettersMenu && (
          <button
            type="button"
            onClick={() => { setMainMenuTab('letters'); setSearchQuery(''); }}
            className={`flex-1 min-h-[50px] min-w-[50px] flex flex-col items-center justify-center gap-0.5 rounded-2xl transition-all active:scale-95 cursor-pointer relative ${
              mainMenuTab === 'letters'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1]'
            }`}
          >
            <Stamp className="w-4 h-4" />
            <span className="text-[10px] font-black">نامه‌ها</span>
            {pendingLettersCount > 0 && (
              <span className="absolute -top-1 right-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full animate-pulse border-2 border-white shadow-xs">
                {toPersianDigits(pendingLettersCount)}
              </span>
            )}
          </button>
        )}

        {/* Center Floating Action Button (FAB) for Draft / Quick Action */}
        {canSendOfficial && (
          <button
            type="button"
            onClick={() => setIsLetterEditorOpen(true)}
            className="w-12 h-12 -mt-5 rounded-full bg-gradient-to-tr from-[#6E1B1B] via-[#D34A32] to-amber-500 text-white shadow-xl shadow-[#6E1B1B]/40 flex items-center justify-center border-3 border-white active:scale-90 transition-transform cursor-pointer shrink-0"
            title="نگارش آنلاین نامه جدید"
          >
            <PenTool className="w-5 h-5" />
            <span className="sr-only">نگارش نامه</span>
          </button>
        )}

        {/* Tab 3: تغییر تم */}
        <button
          type="button"
          onClick={() => setShowThemeModal(true)}
          className="flex-1 min-h-[50px] min-w-[50px] flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1] transition-all active:scale-95 cursor-pointer"
          title="تغییر رنگبندی"
        >
          <Palette className="w-4 h-4 text-[#C98B6A]" />
          <span className="text-[10px] font-black">رنگبندی</span>
        </button>

        {/* Tab 4: منوی پروفایل و تنظیمات */}
        <button
          type="button"
          onClick={() => setShowMobileMenu(true)}
          className="flex-1 min-h-[50px] min-w-[50px] flex flex-col items-center justify-center gap-0.5 rounded-2xl text-[#8C6F66] hover:text-[#3A241F] hover:bg-[#FAF5F1] transition-all active:scale-95 cursor-pointer"
          title="منوی کاربری"
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#6E1B1B] to-[#D34A32] text-white flex items-center justify-center shadow-2xs">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] font-black">پروفایل</span>
        </button>
      </nav>

      {/* ========================================================================= */}
      {/* MOBILE PROFILE & QUICK ACTIONS BOTTOM SHEET DRAWER */}
      {/* ========================================================================= */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 sm:hidden flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setShowMobileMenu(false)}
          />

          {/* Drawer Panel */}
          <div className="relative bg-white rounded-t-[32px] p-5 shadow-2xl border-t border-[#EBDBCE] space-y-4 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
            {/* Top Drag Indicator */}
            <div className="w-12 h-1 bg-[#EBDBCE] rounded-full mx-auto -mt-1 mb-2"></div>

            {/* Profile Header */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#EBDBCE]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6E1B1B] to-[#D34A32] flex items-center justify-center text-white shadow-md">
                  <UserIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-black text-sm text-[#3A241F]">{currentUser.fullName}</div>
                  <div className="text-xs text-[#D34A32] font-bold">{currentUser.departmentName}</div>
                  <div className="text-[11px] text-[#8C6F66]">{currentUser.email}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileMenu(false)}
                className="p-2 text-[#8C6F66] hover:bg-[#FAF5F1] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Badges & Role */}
            <div className="flex flex-wrap gap-2">
              {canSignOfficial && (
                <span className="bg-amber-100 text-amber-900 text-xs font-black px-3 py-1 rounded-xl border border-amber-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-700" />
                  <span>صاحب امضای مجاز (مدیرعامل)</span>
                </span>
              )}
              {!canSignOfficial && currentUser.canSendOfficialLetters && (
                <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-3 py-1 rounded-xl border border-emerald-300 flex items-center gap-1.5">
                  <CheckCheck className="w-4 h-4 text-emerald-600" />
                  <span>مجوز ارسال نامه رسمی</span>
                </span>
              )}
            </div>

            {/* Storage Quota info */}
            <div className="bg-[#FAF5F1] p-3.5 rounded-2xl border border-[#EBDBCE] space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-[#3A241F]">
                <span>فضای ذخیره‌سازی ابری:</span>
                <span className="text-[#6E1B1B]">{toPersianDigits(currentUser.storageUsedGB || 0)} گیگابایت از {toPersianDigits(currentUser.storageQuotaGB || 10)} GB</span>
              </div>
              <div className="w-full h-2 bg-[#EBDBCE] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#6E1B1B] to-[#D34A32] rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((currentUser.storageUsedGB || 0) / (currentUser.storageQuotaGB || 10)) * 100)}%` }}
                />
              </div>
            </div>

            {/* Admin Console Link (if authorized) */}
            {(currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN') && (
              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); window.location.href = '/admin'; }}
                className="w-full min-h-[48px] py-3 px-4 bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-2xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
              >
                <span>ورود به کنسول مدیریت و ادمین</span>
              </button>
            )}

            {/* Quick Actions List */}
            <div className="space-y-2">
              {/* Change Password Button in Mobile Drawer */}
              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  setPasswordError('');
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setShowPasswordModal(true);
                }}
                className="w-full min-h-[48px] p-3 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#3A241F] rounded-2xl text-xs font-bold border border-[#EBDBCE] flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-[#6E1B1B]" />
                  <span>تغییر کلمه عبور حساب کاربری</span>
                </div>
                <span className="text-[11px] text-[#8C6F66]">رمز جدید</span>
              </button>

              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); setShowThemeModal(true); }}
                className="w-full min-h-[48px] p-3 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#3A241F] rounded-2xl text-xs font-bold border border-[#EBDBCE] flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[#6E1B1B]" />
                  <span>تغییر تم و رنگبندی سامانه</span>
                </div>
                <span className="text-[11px] text-[#8C6F66]">تنظیم رنگ</span>
              </button>

              <button
                type="button"
                onClick={() => { setShowMobileMenu(false); logout(); }}
                className="w-full min-h-[48px] p-3 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-2xl text-xs font-black border border-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>خروج از حساب کاربری</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHANGE PASSWORD MODAL DIALOG */}
      {/* ========================================================================= */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setShowPasswordModal(false)}
          />
          <div className="relative bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-[#EBDBCE] space-y-4 animate-in zoom-in-95 duration-200 z-10">
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <div className="flex items-center gap-2.5 text-[#3A241F]">
                <div className="w-9 h-9 rounded-2xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-[#3A241F]">تغییر کلمه عبور</h3>
                  <p className="text-[11px] text-[#8C6F66]">تعیین رمز جدید برای حساب «{currentUser.fullName}»</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="p-1 text-[#8C6F66] hover:bg-[#FAF5F1] rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              {passwordError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-2xl border border-rose-200 flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#3A241F]">
                  کلمه عبور فعلی:
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordError('');
                  }}
                  className="w-full p-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-sm font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#3A241F]">
                  کلمه عبور جدید:
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="حداقل ۸ کاراکتر..."
                  className="w-full p-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-sm font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[#3A241F]">
                  تکرار کلمه عبور جدید:
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setPasswordError('');
                  }}
                  placeholder="تکرار کلمه عبور جدید..."
                  className="w-full p-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-sm font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EBDBCE]">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-2xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-black text-xs rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>ثبت و ذخیره رمز</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE-FIRST FLOATING BOTTOM NAVIGATION BAR WITH PROMINENT FAB */}
      {/* ========================================================================= */}
      <nav className="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] bg-white/90 backdrop-blur-md rounded-full shadow-2xl border border-[#C98B6A]/30 z-40 px-3 py-1.5 flex items-center justify-around">
        {/* Tab 1: Files */}
        <button
          type="button"
          onClick={() => { setMainMenuTab('files'); setActiveBoxTab('received'); }}
          className={`flex flex-col items-center justify-center p-1.5 rounded-full transition-all cursor-pointer ${
            mainMenuTab === 'files' && activeBoxTab === 'received'
              ? 'text-[#6E1B1B] font-black scale-105'
              : 'text-[#8C6F66] hover:text-[#3A241F]'
          }`}
        >
          <FolderOpen className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-0.5">فایل‌ها</span>
        </button>

        {/* Tab 2: Letters */}
        {canAccessLettersMenu && (
          <button
            type="button"
            onClick={() => { setMainMenuTab('letters'); }}
            className={`flex flex-col items-center justify-center p-1.5 rounded-full transition-all cursor-pointer relative ${
              mainMenuTab === 'letters'
                ? 'text-amber-700 font-black scale-105'
                : 'text-[#8C6F66] hover:text-[#3A241F]'
            }`}
          >
            <Stamp className="w-5 h-5" />
            {pendingLettersCount > 0 && canSignOfficial && (
              <span className="absolute top-0 right-1 w-2 h-2 bg-rose-500 rounded-full animate-ping" />
            )}
            <span className="text-[10px] font-bold mt-0.5">نامه‌ها</span>
          </button>
        )}

        {/* Core Action: PROMINENT FLOATING ACTION BUTTON (FAB) */}
        <button
          type="button"
          onClick={() => {
            if (mainMenuTab === 'letters' && canSendOfficial) {
              setIsLetterEditorOpen(true);
            } else {
              fileInputRef.current?.click();
            }
          }}
          className="relative -top-5 w-14 h-14 rounded-full bg-gradient-to-tr from-[#6E1B1B] to-[#D34A32] text-white shadow-xl shadow-[#6E1B1B]/40 flex items-center justify-center border-4 border-white hover:scale-105 active:scale-95 transition-all cursor-pointer"
          title={mainMenuTab === 'letters' ? 'نگارش نامه اداری جدید' : 'ارسال فایل جدید به همکار'}
        >
          {mainMenuTab === 'letters' ? (
            <PenTool className="w-6 h-6" />
          ) : (
            <Send className="w-6 h-6" />
          )}
        </button>

        {/* Tab 3: Sent Box */}
        <button
          type="button"
          onClick={() => { setActiveBoxTab('sent'); }}
          className={`flex flex-col items-center justify-center p-1.5 rounded-full transition-all cursor-pointer ${
            activeBoxTab === 'sent'
              ? 'text-[#6E1B1B] font-black scale-105'
              : 'text-[#8C6F66] hover:text-[#3A241F]'
          }`}
        >
          <SendHorizonal className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-0.5">ارسالی</span>
        </button>

        {/* Tab 4: User Profile & Settings Modal */}
        <button
          type="button"
          onClick={() => setShowMobileMenu(true)}
          className="flex flex-col items-center justify-center p-1.5 rounded-full text-[#8C6F66] hover:text-[#3A241F] transition-all cursor-pointer"
          title="تنظیمات، تم و خروج"
        >
          <UserCheck2 className="w-5 h-5" />
          <span className="text-[10px] font-bold mt-0.5">پروفایل</span>
        </button>
      </nav>
    </div>
  );
}
