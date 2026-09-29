import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DEFAULT_SIGNATURE_HEIGHT, resolveSignatureHeight } from '../../lib/letterDefaults';
import { useAttachment } from '../../lib/useAttachment';
import {
  X,
  Stamp,
  Award,
  Clock,
  CheckCheck,
  XCircle,
  Printer,
  Forward,
  Trash2,
  FileText,
  Building2,
  CheckCircle2,
  History,
  Send,
  Eye,
  Download,
  User as UserIcon,
  MessageSquareQuote,
  ShieldCheck,
  AlertTriangle,
  Move,
  RotateCcw,
  Edit3,
  Sliders,
  ZoomIn,
  ZoomOut,
  Lock,
  Paperclip,
  AlertCircle,
  Type,
  Bold,
  Italic,
  Underline,
  AlignRight,
  AlignCenter,
  AlignLeft,
  AlignJustify,
  List,
  ListOrdered,
  Table,
  PenTool,
  Check,
  Menu,
  Settings2
} from 'lucide-react';
import { FileTransfer, SystemSettings, User } from '../../types';
import { toPersianDigits,
  convertNumbersInHtmlToPersian, formatCurrentJalaliDateTime } from '../../lib/jalali';
import { DEFAULT_FONTS } from '../../lib/fonts';
import { openAndDownloadPdfLetter } from '../../lib/pdfLetterGenerator';

/* =========================================================================
   WORD-LIKE POPUP EDITOR — opens as a full-screen popup with Word ribbon
   ========================================================================= */
interface WordEditorPopupProps {
  initialBody: string;
  initialSubject: string;
  initialCenterTitle: string;
  initialFooterNote: string;
  bodyFontFamily: string;
  availableFonts: { id: string; name: string; fontFamily: string }[];
  onSave: (body: string, subject: string, centerTitle: string, footerNote: string, fontFamily: string) => void;
  onClose: () => void;
}

const WordEditorPopup: React.FC<WordEditorPopupProps> = ({
  initialBody,
  initialSubject,
  initialCenterTitle,
  initialFooterNote,
  bodyFontFamily,
  availableFonts,
  onSave,
  onClose,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [subject, setSubject] = useState(initialSubject);
  const [centerTitle, setCenterTitle] = useState(initialCenterTitle);
  const [footerNote, setFooterNote] = useState(initialFooterNote);
  const [fontFamily, setFontFamily] = useState(bodyFontFamily);
  const [fontSize, setFontSize] = useState('14px');

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || initialBody;
    onSave(html, subject, centerTitle, footerNote, fontFamily);
  };

  const insertTable = () => {
    exec('insertHTML', `
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:12px;text-align:right;">
        <thead><tr style="background:#FAF5F1;border:1px solid #EBDBCE;">
          <th style="border:1px solid #EBDBCE;padding:6px 10px;">ردیف</th>
          <th style="border:1px solid #EBDBCE;padding:6px 10px;">شرح</th>
          <th style="border:1px solid #EBDBCE;padding:6px 10px;">واحد</th>
          <th style="border:1px solid #EBDBCE;padding:6px 10px;">مهلت</th>
        </tr></thead>
        <tbody>
          <tr><td style="border:1px solid #EBDBCE;padding:6px 10px;">۱</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td></tr>
          <tr><td style="border:1px solid #EBDBCE;padding:6px 10px;">۲</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td><td style="border:1px solid #EBDBCE;padding:6px 10px;">&nbsp;</td></tr>
        </tbody>
      </table>
    `);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[#2B2B2B] animate-in fade-in font-sans"
      dir="rtl"
    >
      {/* ─── Title Bar (like Word's window chrome) ─── */}
      <div className="bg-[#1e1e1e] px-5 py-2 flex items-center justify-between shrink-0 border-b border-[#3a3a3a]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#6E1B1B] flex items-center justify-center shadow">
            <PenTool className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-white font-black text-sm">ویرایشگر محتوای نامه رسمی</div>
            <div className="text-gray-400 text-[10px]">محیط شبیه ورد — ویرایش متن، موضوع، سربرگ و پاورقی</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-black rounded-lg transition-all cursor-pointer shadow active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            <span>ذخیره و بازگشت به پیش‌نمایش</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
            title="بستن بدون ذخیره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ─── Ribbon Toolbar Row 1: Document metadata ─── */}
      <div className="bg-[#F3F3F3] border-b border-gray-300 px-4 py-1.5 flex items-center gap-3 shrink-0 overflow-x-auto no-scrollbar text-xs whitespace-nowrap">
        {/* Subject */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-gray-500 font-bold">موضوع:</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs font-bold text-gray-800 focus:outline-none focus:border-[#6E1B1B] w-48 sm:w-64"
            placeholder="موضوع نامه..."
          />
        </div>
        <div className="w-px h-5 bg-gray-300 shrink-0" />
        {/* Center Title */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-gray-500 font-bold">سربرگ وسط:</span>
          <input
            type="text"
            value={centerTitle}
            onChange={(e) => setCenterTitle(e.target.value)}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs font-bold text-gray-800 focus:outline-none focus:border-[#6E1B1B] w-36"
          />
        </div>
        <div className="w-px h-5 bg-gray-300 shrink-0" />
        {/* Footer */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-gray-500 font-bold">پاورقی:</span>
          <input
            type="text"
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            className="px-2.5 py-1 bg-white border border-gray-300 rounded-md text-xs text-gray-800 focus:outline-none focus:border-[#6E1B1B] w-44"
          />
        </div>
      </div>

      {/* ─── Ribbon Toolbar Row 2: Rich text formatting (like Word ribbon) ─── */}
      <div className="bg-[#F9F9F9] border-b border-gray-300 px-4 py-1.5 flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap">

        {/* Font Family */}
        <div className="flex items-center gap-1 bg-white border border-gray-300 rounded px-1.5 py-0.5 mr-1">
          <select
            value={fontFamily}
            onChange={(e) => {
              setFontFamily(e.target.value);
              exec('fontName', e.target.value);
            }}
            className="bg-transparent text-xs font-bold text-gray-800 focus:outline-none cursor-pointer max-w-[130px]"
          >
            {availableFonts.map((f) => (
              <option key={f.id} value={f.fontFamily} style={{ fontFamily: f.fontFamily }}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size */}
        <div className="flex items-center bg-white border border-gray-300 rounded px-1 py-0.5 mr-1">
          <select
            value={fontSize}
            onChange={(e) => { setFontSize(e.target.value); exec('fontSize', e.target.value === '11px' ? '1' : e.target.value === '12px' ? '2' : e.target.value === '13px' ? '3' : e.target.value === '14px' ? '3' : e.target.value === '16px' ? '4' : '5'); }}
            className="bg-transparent text-xs font-bold text-gray-800 focus:outline-none cursor-pointer"
          >
            <option value="11px">۱۱</option>
            <option value="12px">۱۲</option>
            <option value="13px">۱۳</option>
            <option value="14px">۱۴</option>
            <option value="16px">۱۶</option>
            <option value="18px">۱۸</option>
            <option value="20px">۲۰</option>
            <option value="24px">۲۴</option>
          </select>
        </div>

        <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

        {/* Bold / Italic / Underline */}
        {[
          { cmd: 'bold',      title: 'ضخیم (Ctrl+B)',    icon: <Bold className="w-3.5 h-3.5" /> },
          { cmd: 'italic',    title: 'مورب (Ctrl+I)',    icon: <Italic className="w-3.5 h-3.5" /> },
          { cmd: 'underline', title: 'خط زیر (Ctrl+U)', icon: <Underline className="w-3.5 h-3.5" /> },
        ].map((b) => (
          <button
            key={b.cmd}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); exec(b.cmd); }}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-700 cursor-pointer transition-colors"
            title={b.title}
          >
            {b.icon}
          </button>
        ))}

        <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

        {/* Alignment */}
        {[
          { cmd: 'justifyRight',  title: 'راست‌چین',    icon: <AlignRight className="w-3.5 h-3.5" /> },
          { cmd: 'justifyCenter', title: 'وسط‌چین',    icon: <AlignCenter className="w-3.5 h-3.5" /> },
          { cmd: 'justifyLeft',   title: 'چپ‌چین',     icon: <AlignJustify className="w-3.5 h-3.5" /> },
          { cmd: 'justifyFull',   title: 'هم‌تراز',    icon: <AlignJustify className="w-3.5 h-3.5 opacity-50" /> },
        ].map((b) => (
          <button
            key={b.cmd}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); exec(b.cmd); }}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-700 cursor-pointer transition-colors"
            title={b.title}
          >
            {b.icon}
          </button>
        ))}

        <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

        {/* Lists */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}
          className="p-1.5 hover:bg-gray-200 rounded text-gray-700 cursor-pointer"
          title="لیست بالت‌دار"
        >
          <List className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

        {/* Table insert */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); insertTable(); }}
          className="flex items-center gap-1 px-2 py-1 hover:bg-gray-200 rounded text-gray-700 text-xs font-bold cursor-pointer"
          title="درج جدول ۴ستونه"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          <span>جدول</span>
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1 shrink-0" />

        {/* Text color */}
        <label className="flex items-center gap-1 px-2 py-1 hover:bg-gray-200 rounded text-gray-700 text-xs font-bold cursor-pointer" title="رنگ متن">
          <span className="text-xs font-bold">A</span>
          <input
            type="color"
            defaultValue="#3A241F"
            className="w-4 h-4 rounded cursor-pointer border-0 p-0 appearance-none"
            onChange={(e) => exec('foreColor', e.target.value)}
          />
        </label>

        {/* Highlight */}
        <label className="flex items-center gap-1 px-2 py-1 hover:bg-gray-200 rounded text-gray-700 text-xs font-bold cursor-pointer" title="هایلایت متن">
          <span className="text-xs font-bold" style={{ background: '#FFF176', padding: '0 2px' }}>A</span>
          <input
            type="color"
            defaultValue="#FFFF00"
            className="w-4 h-4 rounded cursor-pointer border-0 p-0 appearance-none"
            onChange={(e) => exec('hiliteColor', e.target.value)}
          />
        </label>
      </div>

      {/* ─── Document Canvas (white paper on dark background) ─── */}
      <div className="flex-1 overflow-y-auto bg-[#404040] flex justify-center py-8 px-4">
        <div
          className="bg-white shadow-2xl w-full max-w-3xl min-h-[600px] rounded-sm"
          style={{ minHeight: '842px' }}
        >
          {/* A4-like paper with proper margins */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: initialBody }}
            dir="rtl"
            className="w-full min-h-full outline-none text-[#1a1a1a] leading-[2.2] selection:bg-blue-200"
            style={{
              fontFamily,
              fontSize,
              padding: '64px 72px',
              minHeight: '842px',
            }}
            onKeyDown={(e) => {
              if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>
      </div>

      {/* ─── Status Bar (like Word's bottom bar) ─── */}
      <div className="bg-[#1e1e1e] px-5 py-1.5 flex items-center justify-between shrink-0 border-t border-[#3a3a3a]">
        <div className="text-gray-500 text-[10px] flex items-center gap-4">
          <span>📄 ویرایشگر نامه رسمی اداری</span>
          <span className="text-gray-600">•</span>
          <span>فونت: {availableFonts.find(f => f.fontFamily === fontFamily)?.name || fontFamily}</span>
          <span className="text-gray-600">•</span>
          <span>Ctrl+S برای ذخیره</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer transition-colors"
          >
            انصراف و بستن
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1 px-3 py-1 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-[10px] font-black rounded cursor-pointer transition-colors"
          >
            <Check className="w-3 h-3" />
            ذخیره
          </button>
        </div>
      </div>
    </div>
  );
};

interface LetterPreviewModalProps {
  letter: FileTransfer | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  settings: SystemSettings;
  staffList: User[];
  onSign?: (
    transferId: string,
    comment?: string,
    signatureOptions?: {
      signatureHeight?: number;
      signatureOffsetX?: number;
      signatureOffsetY?: number;
      pageSize?: string;
      customBody?: string;
      customHeaderNumber?: string;
      customHeaderDate?: string;
      customHeaderAttachment?: string;
      customHeaderSubject?: string;
      customHeaderCompanyTitle?: string;
      customHeaderCompanySubtitle?: string;
      customHeaderCenterTitle?: string;
      customFooterNote?: string;
      metaOffsetX?: number;
      metaOffsetY?: number;
      headerCenterFontFamily?: string;
      subjectFontFamily?: string;
      metaFontFamily?: string;
      bodyOffsetX?: number;
      bodyPaddingX?: number;
      signerFontFamily?: string;
      signerFontSize?: number;
      customSignerName?: string;
      customSignerTitle?: string;
    }
  ) => void;
  onReject?: (transferId: string, reason?: string) => void;
  onRefer?: (transferId: string, toUserId: string, referralComment: string) => void;
  onDownload?: (transfer: FileTransfer) => void;
  onOpenEditor?: (letter: FileTransfer) => void;
}

export const LetterPreviewModal: React.FC<LetterPreviewModalProps> = ({
  letter,
  isOpen,
  onClose,
  currentUser,
  settings,
  staffList,
  onSign,
  onReject,
  onRefer,
  onDownload,
  onOpenEditor,
}) => {
  const allFonts = [...DEFAULT_FONTS, ...(settings?.customFonts || [])];
  const chosenFont = allFonts.find((f) => f.id === settings?.defaultLetterFontId) || DEFAULT_FONTS[0] || { fontFamily: 'Vazirmatn', name: 'وزیرمتن' };
  const canSign = currentUser?.canSignOfficialLetters === true || currentUser?.role === 'SUPER_ADMIN';
  const ceoName = letter?.signedBy || settings?.ceoName || 'مدیریت محترم عامل';
  const ceoTitle = settings?.ceoTitle || 'مدیرعامل';
  const signatureImg = letter?.signatureImageUrl || settings?.ceoSignatureUrl;
  const stampImg = letter?.companyStampImageUrl || settings?.companyStampUrl;

  const attachment = useAttachment(isOpen ? letter : null, currentUser?.id);

  const [actionTab, setActionTab] = useState<'NONE' | 'SIGN' | 'REFER' | 'REJECT'>('NONE');
  const [signComment, setSignComment] = useState('تایید و امضا شد');
  const [rejectReason, setRejectReason] = useState('');
  const [referToUserId, setReferToUserId] = useState(
    staffList?.find((u) => u.id !== currentUser?.id)?.id || staffList?.[0]?.id || ''
  );
  const [referComment, setReferComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editable Header Fields (تنها قبل از امضا قابل تغییر است)
  const [pageSize, setPageSize] = useState<string>('A4');
  const [headerNumber, setHeaderNumber] = useState('');
  const [headerDate, setHeaderDate] = useState('');
  const [headerAttachment, setHeaderAttachment] = useState('دارد (الکترونیک)');
  const [headerSubject, setHeaderSubject] = useState('');
  const [headerCompanyTitle, setHeaderCompanyTitle] = useState('');
  const [headerCompanySubtitle, setHeaderCompanySubtitle] = useState('');
  const [headerCenterTitle, setHeaderCenterTitle] = useState('');
  const [footerNote, setFooterNote] = useState('');
  const [bodyOffsetX, setBodyOffsetX] = useState<number>(0);
  const [bodyPaddingX, setBodyPaddingX] = useState<number>(0);

  // Editable Letter Body
  const [isEditingBody, setIsEditingBody] = useState(false);
  const [showBodyEditorModal, setShowBodyEditorModal] = useState(false);
  const [customBody, setCustomBody] = useState('');

  // Signature Sizing & Drag/Drop Positioning (Default 200px, Up to 360px)
  const [signatureHeight, setSignatureHeight] = useState<number>(settings?.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT);
  const [signatureOffset, setSignatureOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [headerCenterOffset, setHeaderCenterOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [subjectOffset, setSubjectOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [headerCenterFontFamily, setHeaderCenterFontFamily] = useState<string>('');
  const [subjectFontFamily, setSubjectFontFamily] = useState<string>('');
  const [metaFontFamily, setMetaFontFamily] = useState<string>('');
  const [bodyFontFamily, setBodyFontFamily] = useState<string>('');
  const [signerFontFamily, setSignerFontFamily] = useState<string>('');
  const [signerFontSize, setSignerFontSize] = useState<number>(18);
  const [customSignerName, setCustomSignerName] = useState<string>('');
  const [customSignerTitle, setCustomSignerTitle] = useState<string>('');
  const [metaOffset, setMetaOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeDragItem, setActiveDragItem] = useState<'NONE' | 'SIGNATURE' | 'CENTER_TITLE' | 'SUBJECT' | 'META'>('NONE');
  const [isDraggingSig, setIsDraggingSig] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
  });

  // Sync initial values when letter or settings change
  useEffect(() => {
    if (letter) {
      setPageSize(letter.pageSize || 'A4');
      setHeaderNumber(toPersianDigits(letter.customHeaderNumber || letter.letterNumber || letter.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '')));
      setHeaderDate(toPersianDigits(letter.customHeaderDate || (letter.sentAt ? letter.sentAt.split(' - ')[0] : formatCurrentJalaliDateTime().split(' - ')[0])));
      setHeaderAttachment(letter.customHeaderAttachment || 'دارد (الکترونیک)');
      setHeaderSubject(letter.customHeaderSubject || letter.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '').replace(/_/g, ' '));
      setHeaderCompanyTitle(letter.customHeaderCompanyTitle !== undefined ? letter.customHeaderCompanyTitle : (settings.companyName || ''));
      setHeaderCompanySubtitle(letter.customHeaderCompanySubtitle !== undefined ? letter.customHeaderCompanySubtitle : (settings.companySubtitle || ''));
      setHeaderCenterTitle(letter.customHeaderCenterTitle !== undefined ? letter.customHeaderCenterTitle : '« به نام خدا »');
      setFooterNote(letter.customFooterNote || settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری');
      setCustomBody(
        convertNumbersInHtmlToPersian(
          letter.letterContentHtml ||
          letter.note ||
          'متن نامه رسمی جهت استحضار، بررسی و صدور دستور مقتضی ارسال گردیده است.'
        )
      );
      setSignatureOffset({ x: letter.signatureOffsetX || 0, y: letter.signatureOffsetY || 0 });
      setHeaderCenterOffset({ x: letter.headerCenterOffsetX || 0, y: letter.headerCenterOffsetY || 0 });
      setSubjectOffset({ x: letter.subjectOffsetX || 0, y: letter.subjectOffsetY || 0 });
      setMetaOffset({ x: letter.metaOffsetX || 0, y: letter.metaOffsetY || 0 });
      setHeaderCenterFontFamily(letter.headerCenterFontFamily || chosenFont.fontFamily);
      setSubjectFontFamily(letter.subjectFontFamily || chosenFont.fontFamily);
      setMetaFontFamily(letter.metaFontFamily || chosenFont.fontFamily);
      setBodyFontFamily(letter.letterFontFamily || chosenFont.fontFamily);
      setSignerFontFamily(letter.signerFontFamily || chosenFont.fontFamily);
      setSignerFontSize(letter.signerFontSize || 18);
      setCustomSignerName(letter.customSignerName || letter.signedBy || settings.ceoName || 'مدیریت سازمان');
      setCustomSignerTitle(letter.customSignerTitle || settings.ceoTitle || 'مدیرعامل');
      setSignatureHeight(resolveSignatureHeight(letter.signatureHeight, letter.pageSize === 'A5', settings?.ceoSignatureHeight));
      setBodyOffsetX(letter.bodyOffsetX || 0);
      setBodyPaddingX(letter.bodyPaddingX || 0);
      setIsEditingBody(false);
    }
  }, [letter, settings]);

  const editorBodyRef = useRef<HTMLDivElement>(null);
  const [selectedFontSize, setSelectedFontSize] = useState<string>('13px');
  const [showFormattingSidebar, setShowFormattingSidebar] = useState<boolean>(false);

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorBodyRef.current) {
      setCustomBody(editorBodyRef.current.innerHTML);
    }
  };

  const handleFontChange = (fontFamily: string) => {
    setBodyFontFamily(fontFamily);
    executeCommand('fontName', fontFamily);
  };

  const handleFontSizeChange = (size: string) => {
    setSelectedFontSize(size);
    if (editorBodyRef.current) {
      editorBodyRef.current.style.fontSize = size;
    }
  };

  const handleInsertTable = () => {
    const tableHtml = `
      <table style="width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 11px; text-align: right;">
        <thead>
          <tr style="background-color: #FAF5F1; border: 1px solid #EBDBCE;">
            <th style="border: 1px solid #EBDBCE; padding: 6px 10px;">ردیف</th>
            <th style="border: 1px solid #EBDBCE; padding: 6px 10px;">شرح اقدام / موضوع</th>
            <th style="border: 1px solid #EBDBCE; padding: 6px 10px;">واحد مسئول</th>
            <th style="border: 1px solid #EBDBCE; padding: 6px 10px;">مهلت</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #EBDBCE; padding: 6px 10px;">۱</td>
            <td style="border: 1px solid #EBDBCE; padding: 6px 10px;">بررسی و اعلام نظر کارشناسی</td>
            <td style="border: 1px solid #EBDBCE; padding: 6px 10px;">فناوری اطلاعات</td>
            <td style="border: 1px solid #EBDBCE; padding: 6px 10px;">۴۸ ساعت</td>
          </tr>
        </tbody>
      </table>
    `;
    executeCommand('insertHTML', tableHtml);
  };

  if (!isOpen || !letter) return null;

  const isSigned = letter.signatureStatus === 'SIGNED';
  const isRejected = letter.signatureStatus === 'REJECTED';
  const isPending = letter.signatureStatus === 'PENDING_SIGNATURE';
  const isEditable = !isSigned; // بعد از امضا، سند کاملاً قفل و غیرقابل تغییر است

  // Unified Drag listeners for signature, center title, and subject
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (activeDragItem === 'NONE' || !isEditable) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;

      if (activeDragItem === 'SIGNATURE') {
        const newX = Math.max(-250, Math.min(250, dragStartRef.current.initX + dx));
        const newY = Math.max(-120, Math.min(120, dragStartRef.current.initY + dy));
        setSignatureOffset({ x: newX, y: newY });
      } else if (activeDragItem === 'CENTER_TITLE') {
        const newY = Math.max(-30, Math.min(80, dragStartRef.current.initY + dy));
        setHeaderCenterOffset({ x: 0, y: newY });
      } else if (activeDragItem === 'SUBJECT') {
        const newX = Math.max(-150, Math.min(150, dragStartRef.current.initX + dx));
        const newY = Math.max(-50, Math.min(100, dragStartRef.current.initY + dy));
        setSubjectOffset({ x: newX, y: newY });
      } else if (activeDragItem === 'META') {
        const newX = Math.max(-150, Math.min(150, dragStartRef.current.initX + dx));
        const newY = Math.max(-50, Math.min(80, dragStartRef.current.initY + dy));
        setMetaOffset({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      if (activeDragItem !== 'NONE') {
        setActiveDragItem('NONE');
      }
    };

    if (activeDragItem !== 'NONE' && isEditable) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeDragItem, isEditable]);

  const handleMouseDownOnSignature = (e: React.MouseEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    setActiveDragItem('SIGNATURE');
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: signatureOffset.x,
      initY: signatureOffset.y,
    };
  };

  const handleMouseDownOnCenterTitle = (e: React.MouseEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    setActiveDragItem('CENTER_TITLE');
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: headerCenterOffset.x,
      initY: headerCenterOffset.y,
    };
  };

  const handleMouseDownOnSubject = (e: React.MouseEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    setActiveDragItem('SUBJECT');
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: subjectOffset.x,
      initY: subjectOffset.y,
    };
  };

  const handleMouseDownOnMeta = (e: React.MouseEvent) => {
    if (!isEditable) return;
    e.preventDefault();
    setActiveDragItem('META');
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: metaOffset.x,
      initY: metaOffset.y,
    };
  };

  const handleConfirmSign = () => {
    if (!onSign) return;
    setIsSubmitting(true);
    onSign(letter.id, signComment.trim() || 'تایید و امضا شد', {
      pageSize,
      signatureHeight,
      signatureOffsetX: signatureOffset.x,
      signatureOffsetY: signatureOffset.y,
      customBody: convertNumbersInHtmlToPersian(customBody),
      customHeaderNumber: headerNumber,
      customHeaderDate: headerDate,
      customHeaderAttachment: headerAttachment,
      customHeaderSubject: headerSubject,
      customHeaderCompanyTitle: headerCompanyTitle,
      customHeaderCompanySubtitle: headerCompanySubtitle,
      customHeaderCenterTitle: headerCenterTitle,
      customFooterNote: footerNote,
      metaOffsetX: metaOffset.x,
      metaOffsetY: metaOffset.y,
      bodyOffsetX,
      bodyPaddingX,
      signerFontFamily,
      signerFontSize,
      customSignerName: customSignerName || ceoName,
      customSignerTitle: customSignerTitle || ceoTitle,
    });
    setIsSubmitting(false);
    setActionTab('NONE');
    setIsEditingBody(false);
  };

  const handleConfirmReject = () => {
    if (!onReject) return;
    if (!rejectReason.trim()) {
      alert('لطفاً دلیل عدم تایید یا رد نامه را وارد کنید.');
      return;
    }
    setIsSubmitting(true);
    onReject(letter.id, rejectReason.trim());
    setIsSubmitting(false);
    setActionTab('NONE');
  };

  const handleConfirmRefer = () => {
    if (!onRefer) return;
    if (!referComment.trim()) {
      alert('لطفاً دستور یا پاراف ارجاع را وارد نمایید.');
      return;
    }
    setIsSubmitting(true);
    onRefer(letter.id, referToUserId, referComment.trim());
    setIsSubmitting(false);
    setReferComment('');
    setActionTab('NONE');
  };

  const handleDownloadCustomPdf = () => {
    openAndDownloadPdfLetter(letter, settings, currentUser, {
      pageSize: pageSize,
      customNumber: toPersianDigits(headerNumber),
      customDate: toPersianDigits(headerDate),
      customAttachment: headerAttachment,
      customSubject: headerSubject,
      customCompanyTitle: headerCompanyTitle,
      customCompanySubtitle: headerCompanySubtitle,
      customHeaderTitle: headerCenterTitle,
      customFooterNote: footerNote,
      customBody: customBody,
      headerCenterFontFamily: headerCenterFontFamily,
      subjectFontFamily: subjectFontFamily,
      metaFontFamily: metaFontFamily,
      letterFontFamily: bodyFontFamily,
      signerFontFamily: signerFontFamily,
      signerFontSize: signerFontSize,
      customSignerName: customSignerName || ceoName,
      customSignerTitle: customSignerTitle || ceoTitle,
      headerCenterOffsetX: headerCenterOffset.x,
      headerCenterOffsetY: headerCenterOffset.y,
      subjectOffsetX: subjectOffset.x,
      subjectOffsetY: subjectOffset.y,
      metaOffsetX: metaOffset.x,
      metaOffsetY: metaOffset.y,
      bodyOffsetX: bodyOffsetX,
      bodyPaddingX: bodyPaddingX,
      signatureHeight: signatureHeight,
      signatureOffsetX: signatureOffset.x,
      signatureOffsetY: signatureOffset.y,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-1.5 sm:p-4 overflow-y-auto animate-in fade-in select-none font-sans">
      <div className="bg-[#EFE8E1] rounded-2xl sm:rounded-[28px] shadow-2xl w-full max-w-5xl border border-[#C98B6A]/40 flex flex-col h-[96vh] sm:h-[94vh] overflow-hidden">
        
        {/* Top Modal Header */}
        <div className="bg-[#3A241F] text-white px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 border-b border-[#563D34]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-md shrink-0">
              <Stamp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-black text-xs sm:text-sm text-white truncate">مشاهده و چاپ سند رسمی اداری</h2>
                <span className="bg-[#563D34] text-[#F6D9CD] border border-[#C98B6A]/50 text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  📄 قطع: {pageSize === 'A5' ? 'A5' : pageSize === 'Letter' ? 'Letter' : 'A4'}
                </span>
                {isSigned && (
                  <span className="bg-emerald-500/25 text-emerald-200 border border-emerald-500/50 text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <Lock className="w-3 h-3 text-emerald-300" />
                    <span>تایید و امضا شده</span>
                  </span>
                )}
                {isPending && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>در انتظار امضا</span>
                  </span>
                )}
                {isRejected && (
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                    <XCircle className="w-3 h-3" />
                    <span>رد شده</span>
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#C98B6A] mt-0.5 truncate">
                {isSigned
                  ? 'این سند رسمی ممهور و امضا شده است و هرگونه تغییر در متن آن مسدود می‌باشد.'
                  : 'امکان تنظیم مشخصات سربرگ، قطع کاغذ و متن نامه قبل از امضای نهایی مدیریت'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCustomPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              title="چاپ یا دریافت فایل PDF رسمی"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">چاپ و دانلود PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#C98B6A] hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Tray for CEO / Recipient */}
        <div className="bg-[#FAF5F1] px-3 sm:px-6 py-2 border-b border-[#EBDBCE] flex items-center gap-2 shrink-0 text-xs overflow-x-auto no-scrollbar whitespace-nowrap">
          <div className="flex items-center gap-2 shrink-0">
            {/* CEO Sign Button */}
            {canSign && isPending && (
              <button
                type="button"
                onClick={() => setActionTab(actionTab === 'SIGN' ? 'NONE' : 'SIGN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black transition-all cursor-pointer shrink-0 ${
                  actionTab === 'SIGN'
                    ? 'bg-emerald-700 text-white shadow-md'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>امضای رسمی نامه</span>
              </button>
            )}

            {/* Refer Button */}
            <button
              type="button"
              onClick={() => setActionTab(actionTab === 'REFER' ? 'NONE' : 'REFER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 ${
                actionTab === 'REFER'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-white text-[#3A241F] hover:bg-amber-50 border border-amber-300'
              }`}
            >
              <Forward className="w-4 h-4 text-amber-700" />
              <span>ارجاع و پاراف</span>
            </button>

            {/* Reject Button (CEO) */}
            {canSign && isPending && (
              <button
                type="button"
                onClick={() => setActionTab(actionTab === 'REJECT' ? 'NONE' : 'REJECT')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 ${
                  actionTab === 'REJECT'
                    ? 'bg-rose-700 text-white shadow-md'
                    : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-300'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>رد پیش‌نویس</span>
              </button>
            )}

            {/* Edit Letter Text Button (Only when not signed!) */}
            {isEditable && (
              <button
                type="button"
                onClick={() => setShowBodyEditorModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 bg-white text-[#503730] hover:bg-[#FAF5F1] border border-[#C98B6A]/40 shadow-2xs hover:scale-105 active:scale-95"
                title="باز کردن پنجره پاپ‌آپ ویرایش متن نامه"
              >
                <Edit3 className="w-3.5 h-3.5 text-[#6E1B1B]" />
                <span>ویرایش متن نامه</span>
              </button>
            )}

            {/* Hamburger Typography & Document Settings Button (Hidden on Mobile) */}
            {isEditable && (
              <button
                type="button"
                onClick={() => setShowFormattingSidebar(!showFormattingSidebar)}
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shrink-0 shadow-2xs ${
                  showFormattingSidebar
                    ? 'bg-[#6E1B1B] text-white shadow-md'
                    : 'bg-white text-[#503730] hover:bg-[#FAF5F1] border border-[#C98B6A]/40'
                }`}
                title="منوی همبرگری تنظیمات نوشتاری، قلم و ابعاد"
              >
                <Menu className={`w-3.5 h-3.5 ${showFormattingSidebar ? 'text-white' : 'text-[#6E1B1B]'}`} />
                <span>تنظیمات نوشتاری</span>
              </button>
            )}

            {/* Locked Notice when signed */}
            {isSigned && (
              <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1.5 rounded-xl font-bold text-[11px] shrink-0">
                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                <span>سند رسمی امضا شده و قفل است</span>
              </div>
            )}
          </div>

          {/* Quick Paper Size & Signer Info in Top Bar (Hidden on Mobile) */}
          {isEditable ? (
            <div className="hidden sm:flex items-center gap-2 shrink-0 border-r border-[#EBDBCE] pr-2 mr-1">
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-[#EBDBCE] text-[11px] font-bold shrink-0">
                <span className="text-[#8C6F66]">قطع:</span>
                <button
                  type="button"
                  onClick={() => setPageSize('A4')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                    pageSize === 'A4' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                  }`}
                >
                  A4
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize('A5')}
                  className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                    pageSize === 'A5' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                  }`}
                >
                  A5
                </button>
              </div>

              <div className="text-[11px] text-[#8C6F66] font-bold">
                امضاکننده: <span className="font-black text-[#3A241F]">{customSignerName || ceoName}</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-[#8C6F66] font-bold shrink-0">
              امضا شده در: <span className="font-mono text-[#3A241F]">{toPersianDigits(letter.signedAt || letter.sentAt)}</span>
            </div>
          )}
        </div>

        {/* Floating Typography & Settings Hamburger Drawer (Hidden on Mobile) */}
        {showFormattingSidebar && isEditable && (
          <aside className="hidden sm:block absolute top-14 right-4 sm:right-6 w-80 max-w-[92vw] max-h-[82vh] overflow-y-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-[#C98B6A]/40 p-4 z-50 animate-in slide-in-from-right-4 space-y-3.5 text-xs">
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#EBDBCE]">
              <div className="flex items-center gap-1.5 font-black text-[#3A241F]">
                <Settings2 className="w-4 h-4 text-[#6E1B1B]" />
                <span>تنظیمات نوشتاری و قلم نامه</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFormattingSidebar(false)}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 cursor-pointer"
                title="بستن منو"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Paper Size Switcher */}
            <div className="space-y-1">
              <label className="font-bold text-[#8C6F66] block">قطع کاغذ:</label>
              <div className="grid grid-cols-3 gap-1 bg-[#FAF5F1] p-1 rounded-xl border border-[#EBDBCE]">
                <button
                  type="button"
                  onClick={() => setPageSize('A4')}
                  className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pageSize === 'A4' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                  }`}
                >
                  A4
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize('A5')}
                  className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pageSize === 'A5' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                  }`}
                >
                  A5
                </button>
                <button
                  type="button"
                  onClick={() => setPageSize('Letter')}
                  className={`py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pageSize === 'Letter' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                  }`}
                >
                  Letter
                </button>
              </div>
            </div>

            {/* Font Family & Size */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="font-bold text-[#8C6F66] block">فونت متن نامه:</label>
                <select
                  value={bodyFontFamily || chosenFont.fontFamily}
                  onChange={(e) => handleFontChange(e.target.value)}
                  className="w-full bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-2 font-bold text-[#3A241F] focus:outline-none cursor-pointer"
                >
                  {allFonts.map((f) => (
                    <option key={f.id} value={f.fontFamily} style={{ fontFamily: f.fontFamily }}>
                      {f.name} {f.isDefault ? '' : '(آپلودی)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#8C6F66] block">اندازه قلم متن:</label>
                <select
                  value={selectedFontSize}
                  onChange={(e) => handleFontSizeChange(e.target.value)}
                  className="w-full bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-2 font-bold text-[#3A241F] focus:outline-none cursor-pointer"
                >
                  <option value="11px">۱۱ (ریز)</option>
                  <option value="12px">۱۲ (متوسط)</option>
                  <option value="13px">۱۳ (استاندارد)</option>
                  <option value="14px">۱۴ (خوانا)</option>
                  <option value="16px">۱۶ (بزرگ)</option>
                  <option value="18px">۱۸ (تیتر)</option>
                </select>
              </div>
            </div>

            {/* Formatting & Alignment Buttons */}
            <div className="space-y-1">
              <label className="font-bold text-[#8C6F66] block">فرمت و چینش متن:</label>
              <div className="flex items-center justify-between gap-1 bg-[#FAF5F1] p-1.5 rounded-xl border border-[#EBDBCE]">
                <button
                  type="button"
                  onClick={() => executeCommand('bold')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] font-bold cursor-pointer"
                  title="ضخیم (Bold)"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('italic')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="مورب (Italic)"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('underline')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="خط زیر (Underline)"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <div className="h-4 w-px bg-gray-300" />
                <button
                  type="button"
                  onClick={() => executeCommand('justifyRight')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="راست‌چین"
                >
                  <AlignRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyCenter')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="وسط‌چین"
                >
                  <AlignCenter className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyLeft')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="چپ‌چین"
                >
                  <AlignLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('justifyFull')}
                  className="p-1.5 hover:bg-white rounded-lg text-[#3A241F] cursor-pointer"
                  title="هم‌تراز (Justify)"
                >
                  <AlignJustify className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lists & Insert Table */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => executeCommand('insertUnorderedList')}
                className="flex-1 py-1.5 px-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#3A241F] rounded-xl font-bold border border-[#EBDBCE] flex items-center justify-center gap-1 cursor-pointer"
                title="لیست بالت"
              >
                <List className="w-3.5 h-3.5" />
                <span>لیست بالت</span>
              </button>
              <button
                type="button"
                onClick={handleInsertTable}
                className="flex-1 py-1.5 px-2.5 bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#3A241F] rounded-xl font-bold border border-[#EBDBCE] flex items-center justify-center gap-1 cursor-pointer"
                title="درج جدول ۴ ستونه اداری"
              >
                <Table className="w-3.5 h-3.5 text-[#6E1B1B]" />
                <span>درج جدول</span>
              </button>
            </div>

            {/* Body Offset & Padding Sliders */}
            <div className="space-y-2.5 pt-2 border-t border-[#EBDBCE]">
              <div className="space-y-1">
                <div className="flex items-center justify-between font-bold text-[#8C6F66]">
                  <span>تراز افقی کل متن:</span>
                  <span className="font-mono text-[#6E1B1B]">{toPersianDigits(bodyOffsetX)}px</span>
                </div>
                <input
                  type="range"
                  min="-80"
                  max="80"
                  value={bodyOffsetX}
                  onChange={(e) => setBodyOffsetX(Number(e.target.value))}
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between font-bold text-[#8C6F66]">
                  <span>حاشیه متن (Padding):</span>
                  <span className="font-mono text-[#6E1B1B]">{toPersianDigits(bodyPaddingX)}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={bodyPaddingX}
                  onChange={(e) => setBodyPaddingX(Number(e.target.value))}
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                />
              </div>
            </div>

            {/* Signer Typography & Size */}
            <div className="space-y-2 pt-2 border-t border-[#EBDBCE]">
              <div className="flex items-center justify-between">
                <label className="font-bold text-[#8C6F66]">سایز و قلم مدیرعامل:</label>
                <div className="flex items-center gap-1 bg-[#FAF5F1] px-2 py-0.5 rounded-lg border border-[#EBDBCE]">
                  <button
                    type="button"
                    onClick={() => setSignerFontSize(Math.max(10, signerFontSize - 1))}
                    className="px-1 text-[#6E1B1B] font-bold cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold text-[#3A241F]">{toPersianDigits(signerFontSize)}</span>
                  <button
                    type="button"
                    onClick={() => setSignerFontSize(Math.min(36, signerFontSize + 1))}
                    className="px-1 text-[#6E1B1B] font-bold cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              <select
                value={signerFontFamily || chosenFont.fontFamily}
                onChange={(e) => setSignerFontFamily(e.target.value)}
                className="w-full bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-2 font-bold text-[#3A241F] focus:outline-none cursor-pointer"
              >
                {allFonts.map((f) => (
                  <option key={f.id} value={f.fontFamily}>
                    {f.name}
                  </option>
                ))}
              </select>

              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between font-bold text-[#8C6F66]">
                  <span>سایز امضا:</span>
                  <span className="font-mono text-[#6E1B1B]">{toPersianDigits(signatureHeight)}px</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="380"
                  value={signatureHeight}
                  onChange={(e) => setSignatureHeight(Number(e.target.value))}
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                />
              </div>
            </div>

            {/* Reset Button */}
            <button
              type="button"
              onClick={() => {
                setSignatureOffset({ x: 0, y: 0 });
                setSignatureHeight(pageSize === 'A5' ? 130 : 200);
                setBodyOffsetX(0);
                setBodyPaddingX(0);
              }}
              className="w-full py-1.5 bg-[#FAF5F1] hover:bg-rose-50 text-rose-700 rounded-xl font-bold border border-rose-200 flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-[11px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>بازنشانی تمام تنظیمات</span>
            </button>
          </aside>
        )}

        {/* Expandable Action Box for Sign / Refer / Reject */}
        {actionTab === 'SIGN' && (
          <div className="bg-emerald-50 p-4 border-b border-emerald-200 flex flex-col gap-3 animate-in slide-in-from-top-2">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 w-full lg:w-auto flex-1">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Award className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="block text-[11px] font-bold text-emerald-950">
                    دستور / پاراف مدیرعامل هنگام امضا (اختیاری):
                  </label>
                  <input
                    type="text"
                    dir="rtl"
                    value={signComment}
                    onChange={(e) => setSignComment(toPersianDigits(e.target.value))}
                    placeholder="مثلاً: تایید شد، جهت اقدام لازم به واحد مربوطه ارسال گردد."
                    className="w-full px-3 py-1.5 bg-white border border-emerald-300 rounded-xl text-xs text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>

              {/* Signature Size in Sign Banner */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 text-[11px] text-emerald-950 font-bold shrink-0 shadow-2xs">
                <Sliders className="w-3.5 h-3.5 text-emerald-700" />
                <span>سایز امضا:</span>
                <input
                  type="range"
                  min="50"
                  max="380"
                  value={signatureHeight}
                  onChange={(e) => setSignatureHeight(Number(e.target.value))}
                  className="w-24 accent-emerald-600 cursor-pointer"
                  title="تغییر ابعاد و سایز امضا قبل از ثبت"
                />
                <span className="font-mono text-[10px] text-emerald-700 w-10 text-center">{toPersianDigits(signatureHeight)}px</span>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto">
                <button
                  type="button"
                  onClick={() => setActionTab('NONE')}
                  className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmSign}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
                >
                  <Award className="w-4 h-4" />
                  <span>ثبت و قفل امضای نهایی</span>
                </button>
              </div>
            </div>

            {/* Drag & Placement Guide */}
            <div className="text-[11px] text-emerald-900 bg-emerald-100/70 px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Move className="w-3.5 h-3.5 text-emerald-700" />
                <span><b>راهنمای جانمایی:</b> تصویر امضا و مهر در کادر زیر نامه نمایش داده شده است. می‌توانید آن را با ماوس به هر نقطه از نامه بکشید و رها کنید (Drag & Drop).</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSignatureOffset({ x: 0, y: 0 });
                  setSignatureHeight(200);
                }}
                className="text-[10px] text-emerald-800 hover:underline font-bold cursor-pointer"
              >
                بازنشانی جایگاه پیش‌فرض
              </button>
            </div>
          </div>
        )}

        {actionTab === 'REFER' && (
          <div className="bg-amber-50 p-4 border-b border-amber-200 flex flex-col gap-3 animate-in slide-in-from-top-2">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-4 space-y-1">
                <label className="block text-[11px] font-bold text-amber-950">
                  ارجاع به کاربر / همکار:
                </label>
                <select
                  value={referToUserId}
                  onChange={(e) => setReferToUserId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-bold"
                >
                  {staffList.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.departmentName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-8 space-y-1">
                <label className="block text-[11px] font-bold text-amber-950">
                  دستور، پی‌نوشت یا علت ارجاع نامه:
                </label>
                <input
                  type="text"
                  value={referComment}
                  onChange={(e) => setReferComment(e.target.value)}
                  placeholder="مثال: جناب آقای حسینی، لطفاً بررسی و نتیجه اعلام فرمایید."
                  className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-xl text-xs text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionTab('NONE')}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded-xl"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmRefer}
                className="flex items-center gap-1.5 px-5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
                <span>ثبت ارجاع نامه</span>
              </button>
            </div>
          </div>
        )}

        {actionTab === 'REJECT' && (
          <div className="bg-rose-50 p-4 border-b border-rose-200 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 space-y-1">
                <label className="block text-[11px] font-bold text-rose-950">
                  دلیل عدم تایید / علت رد پیش‌نویس نامه:
                </label>
                <input
                  type="text"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="علت رد نامه (عدم تایید ردیف اعتباری، نیاز به اصلاح متن و...)"
                  className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-xl text-xs text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setActionTab('NONE')}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-white rounded-xl"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmReject}
                className="flex items-center gap-1.5 px-5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
              >
                <XCircle className="w-4 h-4" />
                <span>ثبت رد نامه</span>
              </button>
            </div>
          </div>
        )}

        {/* Prominent Attachment Banner for Reviewer / CEO before signing */}
        {attachment.exists && (
          <div className="bg-amber-50/90 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between gap-3 text-xs shrink-0 flex-wrap">
            <div className="flex items-center gap-2 text-amber-950 font-bold">
              <span className="w-6 h-6 rounded-lg bg-amber-200 text-amber-800 flex items-center justify-center">
                <Paperclip className="w-3.5 h-3.5" />
              </span>
              <span>این نامه دارای مدرک / اسکن پیوست می‌باشد:</span>
              <span className="font-mono text-[#6E1B1B] bg-white px-2 py-0.5 rounded-md border border-amber-200">
                {letter.attachmentFileName || 'سند_پیوست'} ({toPersianDigits(letter.attachmentFileSize || '')})
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!attachment.url && (
                <span className="text-[11px] font-bold text-amber-800">
                  {attachment.loading ? 'در حال دریافت مستقیم از سیستم فرستنده...' : attachment.error}
                  {attachment.error && (
                    <button type="button" onClick={attachment.retry} className="underline mr-2 cursor-pointer">
                      تلاش مجدد
                    </button>
                  )}
                </span>
              )}
              <a
                href={attachment.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>مشاهده فایل پیوست / اسکن قبل از امضا</span>
              </a>
              <a
                href={attachment.url ?? undefined}
                download={letter.attachmentFileName || 'پیوست_نامه'}
                className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود پیوست</span>
              </a>
            </div>
          </div>
        )}

        {/* Paper Document Canvas Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#E5DCD2]/60">
          
          {/* Virtual Official Paper Sheet */}
          <div
            style={{ fontFamily: bodyFontFamily || chosenFont.fontFamily }}
            className={`bg-white rounded-2xl shadow-2xl border border-[#C98B6A]/30 w-full text-[#3A241F] flex flex-col justify-between relative transition-all overflow-x-auto ${
              pageSize === 'A5'
                ? 'max-w-[580px] min-h-[600px] p-4 sm:p-7 text-xs'
                : pageSize === 'Letter'
                ? 'max-w-[700px] min-h-[720px] p-5 sm:p-9 text-xs'
                : 'max-w-[720px] min-h-[760px] p-6 sm:p-10 text-xs'
            }`}
          >
            {/* Header Component */}
            <div className={`pb-2 ${pageSize === 'A5' ? 'mb-2 space-y-2' : 'mb-4 space-y-3'} shrink-0`}>
              <div className="relative flex items-start justify-between min-h-[50px]">
                {/* Right: Company Info & Emblem */}
                <div className={`space-y-0.5 min-w-0 ${pageSize === 'A5' ? 'max-w-[36%]' : 'max-w-[38%]'}`}>
                  <div className="flex items-center gap-2">
                    {settings.companyLogoUrl ? (
                      <div
                        style={{
                          width: `${pageSize === 'A5' ? Math.min(settings.companyLogoWidth || 44, 44) : (settings.companyLogoWidth || 64)}px`,
                          height: `${pageSize === 'A5' ? Math.min(settings.companyLogoWidth || 44, 44) : (settings.companyLogoWidth || 64)}px`,
                          maxHeight: `${pageSize === 'A5' ? Math.min(settings.companyLogoWidth || 44, 44) : (settings.companyLogoWidth || 64)}px`,
                        }}
                        className="flex items-center justify-center shrink-0 p-0"
                      >
                        <img
                          src={settings.companyLogoUrl}
                          alt="لوگوی شرکت"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className={`${pageSize === 'A5' ? 'w-8 h-8 rounded-lg text-xs' : 'w-10 h-10 rounded-xl text-sm'} bg-[#6E1B1B] text-white flex items-center justify-center font-black shadow-xs shrink-0`}>
                        {(headerCompanyTitle || 'ش').charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {isEditable ? (
                        <>
                          <input
                            type="text"
                            value={headerCompanyTitle}
                            onChange={(e) => setHeaderCompanyTitle(e.target.value)}
                            placeholder="نام شرکت / سازمان"
                            title="نام سازمان در سربرگ (قابل ویرایش دستی قبل از امضا)"
                            className={`font-black text-[#3A241F] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-0.5 truncate ${
                              pageSize === 'A5' ? 'text-xs' : 'text-sm'
                            }`}
                          />
                          <input
                            type="text"
                            value={headerCompanySubtitle}
                            onChange={(e) => setHeaderCompanySubtitle(e.target.value)}
                            placeholder="عنوان زیرین سربرگ"
                            title="عنوان زیرین سربرگ (قابل ویرایش دستی قبل از امضا)"
                            className={`text-[#8C6F66] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-0.5 truncate ${
                              pageSize === 'A5' ? 'text-[9px]' : 'text-[10px]'
                            }`}
                          />
                        </>
                      ) : (
                        <>
                          <h1 className={`font-black text-[#3A241F] truncate ${pageSize === 'A5' ? 'text-xs' : 'text-sm'}`}>{headerCompanyTitle}</h1>
                          <div className={`text-[#8C6F66] truncate ${pageSize === 'A5' ? 'text-[9px]' : 'text-[10px]'}`}>{headerCompanySubtitle}</div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Center: Title Field («به نام خدا» - Always Mathematically Centered & Vertically Draggable) */}
                <div
                  className="absolute left-1/2 flex items-center justify-center z-10 select-none pointer-events-auto"
                  style={{
                    top: `${pageSize === 'A5' ? 2 : 6}px`,
                    transform: `translate(calc(-50% + ${headerCenterOffset.x}px), ${headerCenterOffset.y}px)`,
                  }}
                >
                  {isEditable && (
                    <div
                      onMouseDown={handleMouseDownOnCenterTitle}
                      className="cursor-grab active:cursor-grabbing p-1 text-[#8C6F66] hover:text-[#6E1B1B] select-none"
                      title="برای جابه‌جایی «به نام خدا»، با ماوس بکشید (Drag)"
                    >
                      <Move className="w-3 h-3" />
                    </div>
                  )}
                  {isEditable ? (
                    <input
                      type="text"
                      value={headerCenterTitle}
                      onChange={(e) => setHeaderCenterTitle(toPersianDigits(e.target.value))}
                      placeholder="« به نام خدا »"
                      title="عنوان بالای نامه در سربرگ (بدون حاشیه)"
                      style={{ fontFamily: headerCenterFontFamily }}
                      className={`font-black text-[#6E1B1B] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none text-center px-1 py-0.5 ${
                        pageSize === 'A5' ? 'text-[11px] max-w-[130px]' : 'text-xs max-w-[180px]'
                      }`}
                    />
                  ) : (
                    headerCenterTitle && (
                      <span style={{ fontFamily: headerCenterFontFamily }} className={`font-black text-[#6E1B1B] text-center ${pageSize === 'A5' ? 'text-[11px]' : 'text-xs'}`}>
                        {headerCenterTitle}
                      </span>
                    )
                  )}
                </div>

                {/* Left: Metadata Boxes (No, Date, Attach) - Draggable & Anchored to Left */}
                <div
                  style={{
                    transform: `translate(${metaOffset.x}px, ${metaOffset.y}px)`,
                  }}
                  className={`font-medium text-[#3A241F] text-right shrink-0 relative group/meta select-none ${
                    pageSize === 'A5' ? 'text-[9.5px] space-y-0.5' : 'text-[11px] space-y-1'
                  }`}
                  dir="rtl"
                >
                  {isEditable && (
                    <div
                      onMouseDown={handleMouseDownOnMeta}
                      className="opacity-0 group-hover/meta:opacity-100 transition-opacity absolute -top-5 left-0 bg-[#FAF5F1] hover:bg-amber-100 text-[#8C6F66] hover:text-[#6E1B1B] border border-[#EBDBCE] px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 cursor-grab active:cursor-grabbing z-10 shadow-2xs"
                      title="برای جابه‌جایی کادر شماره، تاریخ و پیوست با ماوس بکشید (Drag)"
                    >
                      <Move className="w-2.5 h-2.5 text-[#C98B6A]" />
                      <span>جابه‌جایی مشخصات</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[#8C6F66]">شماره:</span>
                    {isEditable ? (
                      <input
                        type="text"
                        value={headerNumber}
                        onChange={(e) => setHeaderNumber(toPersianDigits(e.target.value))}
                        placeholder="شماره نامه"
                        title="شماره نامه در سربرگ (قابل ویرایش قبل از امضا)"
                        className={`font-bold text-[#3A241F] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none text-right px-0.5 ${
                          pageSize === 'A5' ? 'w-16 text-[9.5px]' : 'w-24 text-[11px]'
                        }`}
                      />
                    ) : (
                      <b className="font-bold text-[#3A241F]">{toPersianDigits(headerNumber)}</b>
                    )}
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[#8C6F66]">تاریخ:</span>
                    {isEditable ? (
                      <input
                        type="text"
                        value={headerDate}
                        onChange={(e) => setHeaderDate(toPersianDigits(e.target.value))}
                        placeholder="تاریخ نامه"
                        title="تاریخ ثبت در سربرگ (قابل ویرایش قبل از امضا)"
                        className={`font-mono font-bold text-[#3A241F] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none text-right px-0.5 ${
                          pageSize === 'A5' ? 'w-16 text-[9.5px]' : 'w-24 text-[11px]'
                        }`}
                      />
                    ) : (
                      <b className="font-bold text-[#3A241F]">{toPersianDigits(headerDate)}</b>
                    )}
                  </div>
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-[#8C6F66]">پیوست:</span>
                    {isEditable ? (
                      <input
                        type="text"
                        value={headerAttachment}
                        onChange={(e) => setHeaderAttachment(e.target.value)}
                        placeholder="وضعیت پیوست"
                        title="وضعیت پیوست در سربرگ (قابل ویرایش قبل از امضا)"
                        className={`font-bold text-[#3A241F] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none text-right px-0.5 ${
                          pageSize === 'A5' ? 'w-16 text-[9.5px]' : 'w-24 text-[11px]'
                        }`}
                      />
                    ) : (
                      <b className="font-bold text-[#3A241F]">{headerAttachment}</b>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject Field (Draggable) */}
              <div
                className="pt-2 flex items-center gap-2 text-xs font-bold relative"
                style={{
                  transform: `translate(${subjectOffset.x}px, ${subjectOffset.y}px)`,
                }}
              >
                {isEditable && (
                  <div
                    onMouseDown={handleMouseDownOnSubject}
                    className="cursor-grab active:cursor-grabbing p-1 text-[#8C6F66] hover:text-[#6E1B1B] select-none flex items-center gap-1"
                    title="برای جابه‌جایی خط موضوع نامه، با ماوس بکشید (Drag)"
                  >
                    <Move className="w-3 h-3 text-[#C98B6A]" />
                  </div>
                )}
                <span className="text-[#6E1B1B] shrink-0 font-black">موضوع نامه:</span>
                {isEditable ? (
                  <input
                    type="text"
                    value={headerSubject}
                    onChange={(e) => setHeaderSubject(e.target.value)}
                    placeholder="موضوع نامه اداری"
                    title="موضوع نامه (قابل ویرایش قبل از امضا)"
                    className="text-[#3A241F] font-black bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-1 py-0.5"
                  />
                ) : (
                  <span className="text-[#3A241F] font-black">{headerSubject}</span>
                )}
              </div>
            </div>

            {/* Letter Content / Body */}
            <div
              style={{
                paddingLeft: `${bodyPaddingX}px`,
                paddingRight: `${bodyPaddingX}px`,
                transform: `translateX(${bodyOffsetX}px)`,
                fontFamily: bodyFontFamily || chosenFont.fontFamily,
                fontSize: selectedFontSize,
              }}
              className="py-4 text-xs leading-relaxed min-h-[160px] transition-transform relative group/body"
            >
              {isEditable ? (
                <div
                  ref={editorBodyRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setCustomBody(e.currentTarget.innerHTML)}
                  onBlur={(e) => setCustomBody(e.currentTarget.innerHTML)}
                  dangerouslySetInnerHTML={{ __html: customBody }}
                  className="w-full focus:outline-none min-h-[160px] text-[#222] border border-transparent hover:border-amber-200/60 focus:border-amber-400 rounded-xl p-2 transition-all"
                  style={{
                    fontFamily: bodyFontFamily || chosenFont.fontFamily,
                    fontSize: selectedFontSize,
                    lineHeight: 2.2,
                  }}
                  title="متن نامه (مستقیماً کلیک کرده و ویرایش کنید)"
                />
              ) : (
                <div
                  dangerouslySetInnerHTML={{ __html: customBody }}
                  className="w-full min-h-[160px] text-[#222] p-2 leading-relaxed"
                  style={{
                    fontFamily: bodyFontFamily || chosenFont.fontFamily,
                    fontSize: selectedFontSize,
                    lineHeight: 2.2,
                  }}
                />
              )}
            </div>

              {/* Attached Document / Scan View & Download */}
              {attachment.exists && (
                <div className="my-4 p-4 bg-[#FAF5F1] rounded-2xl border border-amber-200 text-right space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                        <Paperclip className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-black text-xs text-[#3A241F]">
                          پیوست ضمیمه: {letter.attachmentFileName || 'سند پیوست / اسکن نامه'}
                        </div>
                        {letter.attachmentFileSize && (
                          <div className="text-[10px] text-[#8C6F66] font-mono font-bold">
                            حجم: {toPersianDigits(letter.attachmentFileSize)}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!attachment.url && (
                <span className="text-[11px] font-bold text-amber-800">
                  {attachment.loading ? 'در حال دریافت مستقیم از سیستم فرستنده...' : attachment.error}
                  {attachment.error && (
                    <button type="button" onClick={attachment.retry} className="underline mr-2 cursor-pointer">
                      تلاش مجدد
                    </button>
                  )}
                </span>
              )}
              <a
                        href={attachment.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>مشاهده پیوست</span>
                      </a>
                      <a
                        href={attachment.url ?? undefined}
                        download={letter.attachmentFileName || 'پیوست_نامه'}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>دانلود پیوست</span>
                      </a>
                    </div>
                  </div>

                  {attachment.isImage && attachment.url && (
                    <div className="pt-2 border-t border-[#EBDBCE]/60 text-center">
                      <img
                        src={attachment.url ?? undefined}
                        alt="پیش‌نمایش پیوست"
                        className="max-h-[350px] mx-auto rounded-xl shadow-md border border-gray-200 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Uploaded Scan Attachment Preview if available */}
              {letter.fileDataUrl && letter.category === 'image' && (
                <div className="my-4 p-3 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] text-center">
                  <div className="text-[11px] font-bold text-[#8C6F66] mb-2">تصویر سند اسکن‌شده ضمیمه نامه:</div>
                  <img
                    src={letter.fileDataUrl}
                    alt="تصویر نامه"
                    className="max-h-[350px] mx-auto rounded-xl shadow-md border border-gray-200 object-contain"
                  />
                </div>
              )}

            {/* Referral Chain & History inside Document */}
            {letter.referrals && letter.referrals.length > 0 && (
              <div className="my-4 bg-[#FAF5F1] p-3 rounded-2xl border border-[#EBDBCE] space-y-2 text-[10px]">
                <div className="flex items-center gap-1.5 font-bold text-[#6E1B1B]">
                  <History className="w-3.5 h-3.5" />
                  <span>گردش نامه، ارجاعات و پاراف‌های اداری:</span>
                </div>
                <div className="space-y-1.5 pr-2 border-r-2 border-[#C98B6A]">
                  {letter.referrals.map((ref) => (
                    <div key={ref.id} className="text-[#3A241F] leading-relaxed">
                      <span className="font-black text-[#6E1B1B]">{ref.fromUser.fullName}</span> ➔ ارجاع به: <span className="font-black text-emerald-800">{ref.toUser.fullName} ({ref.toUser.departmentName})</span>
                      <span className="text-[#8C6F66] mr-1 font-mono">[{toPersianDigits(ref.date)}]</span>:
                      <div className="bg-white p-1.5 rounded-lg border border-[#EBDBCE] mt-0.5 text-[#503730] italic">
                        "{ref.comment}"
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Signature & Official Seal Section (Draggable before signing) */}
            <div className={`${pageSize === 'A5' ? 'mt-4 pt-1 min-h-[90px]' : 'mt-8 pt-2 min-h-[140px]'} flex justify-end items-end relative`}>
              {/* CEO Official Seal & Signature Staging — Whole box draggable */}
              <div
                onMouseDown={handleMouseDownOnSignature}
                style={{
                  transform: `translate(${signatureOffset.x}px, ${signatureOffset.y}px)`,
                  cursor: isEditable ? (isDraggingSig ? 'grabbing' : 'grab') : 'default',
                }}
                className={`text-center ${pageSize === 'A5' ? 'min-w-[170px]' : 'min-w-[220px]'} space-y-0.5 flex flex-col items-center relative select-none transition-all ${
                  isEditable
                    ? isDraggingSig
                      ? 'opacity-90 scale-102 z-30 ring-2 ring-amber-500 rounded-2xl p-2 bg-amber-50/60 shadow-lg'
                      : 'z-10 hover:ring-2 hover:ring-amber-400/60 rounded-2xl p-2 group/sig cursor-grab hover:bg-amber-50/30'
                    : 'z-10'
                }`}
                title={
                  isEditable
                    ? 'نام، سمت و امضای مدیرعامل (برای جابه‌جایی با ماوس درگ کنید)'
                    : 'امضای رسمی تایید شده'
                }
              >
                {/* Interactive Drag Badge for Pre-signing Mode */}
                {isEditable && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/sig:opacity-100 transition-opacity bg-[#3A241F] text-white text-[9px] font-bold px-2.5 py-0.5 rounded-md shadow-md whitespace-nowrap pointer-events-none flex items-center gap-1 z-40">
                    <Move className="w-2.5 h-2.5 text-amber-400" />
                    <span>کل کادر نام و امضا را بکشید و جابه‌جا کنید (Drag)</span>
                  </div>
                )}

                {isEditable ? (
                  <div className="w-full space-y-0.5">
                    <input
                      type="text"
                      value={customSignerName || ceoName}
                      onChange={(e) => setCustomSignerName(e.target.value)}
                      placeholder="نام مدیرعامل"
                      style={{
                        fontFamily: signerFontFamily || chosenFont.fontFamily,
                        fontSize: `${signerFontSize || 18}px`,
                      }}
                      className="font-black text-center text-[#1a1a1a] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-1 cursor-text"
                      title="نام مدیرعامل (قابل ویرایش قبل از امضا)"
                    />
                    <input
                      type="text"
                      value={customSignerTitle || ceoTitle}
                      onChange={(e) => setCustomSignerTitle(e.target.value)}
                      placeholder="سمت سازمانی"
                      style={{
                        fontFamily: signerFontFamily || chosenFont.fontFamily,
                        fontSize: `${Math.max(14, (signerFontSize || 18) - 2)}px`,
                      }}
                      className="text-center text-[#71554C] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-1 font-medium cursor-text"
                      title="سمت سازمانی (قابل ویرایش قبل از امضا)"
                    />
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontFamily: signerFontFamily || chosenFont.fontFamily,
                        fontSize: `${signerFontSize || 18}px`,
                      }}
                      className="font-black text-[#1a1a1a]"
                    >
                      {customSignerName || ceoName}
                    </div>
                    <div
                      style={{
                        fontFamily: signerFontFamily || chosenFont.fontFamily,
                        fontSize: `${Math.max(14, (signerFontSize || 18) - 2)}px`,
                      }}
                      className="text-[#71554C] font-medium"
                    >
                      {customSignerTitle || ceoTitle}
                    </div>
                  </>
                )}

                <div className={`${pageSize === 'A5' ? 'min-h-[60px] gap-2 my-0.5' : 'min-h-[85px] gap-3 my-1'} flex items-center justify-center relative w-full`}>
                  {/* Signature & Stamp Images */}
                  {(signatureImg || stampImg) && (
                    <div className="relative select-none flex items-center justify-center gap-3">
                      {signatureImg && (
                        <img
                          src={signatureImg}
                          alt="امضای مدیرعامل"
                          style={{ height: `${pageSize === 'A5' ? Math.min(signatureHeight, 140) : signatureHeight}px` }}
                          className={`object-contain mix-blend-multiply pointer-events-none transition-all ${
                            !isSigned ? 'opacity-90 drop-shadow-xs' : ''
                          }`}
                        />
                      )}

                      {stampImg && (
                        <img
                          src={stampImg}
                          alt="مهر رسمی سازمان"
                          style={{ height: `${pageSize === 'A5' ? Math.min(Math.round(signatureHeight * 0.95), 100) : Math.round(signatureHeight * 1.05)}px` }}
                          className={`object-contain mix-blend-multiply pointer-events-none transition-transform ${
                            !isSigned ? 'opacity-85' : 'opacity-95'
                          }`}
                        />
                      )}

                      {/* Prominent Overlay Label for Unsigned Draft Letters */}
                      {!isSigned && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                          <div className="bg-amber-600/95 backdrop-blur-xs text-white font-black text-xs px-3.5 py-1.5 rounded-xl shadow-lg border border-amber-400/80 flex items-center gap-1.5 whitespace-nowrap">
                            <AlertCircle className="w-4 h-4 text-amber-200 shrink-0" />
                            <span>این نامه هنوز امضا نشده است</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {!signatureImg && !stampImg && !isSigned && !isRejected && (
                    <div className="h-12 w-56 border border-amber-300 rounded-xl flex items-center justify-center text-xs text-amber-900 bg-amber-100/90 font-black shadow-2xs gap-1.5 select-none">
                      <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>این نامه هنوز امضا نشده است</span>
                    </div>
                  )}

                  {isRejected && (
                    <div className="h-12 w-48 border border-rose-300 rounded-xl flex items-center justify-center text-[10px] text-rose-800 bg-rose-50/80 font-bold">
                      (پیش‌نویس رد شده است)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Document Footer (Clean official note) */}
            {(isEditable
              ? (settings.showFooterNote !== false && settings.letterNumbering?.showFooterNote !== false)
              : (letter.showFooterNote !== undefined
                  ? letter.showFooterNote
                  : (settings.showFooterNote !== false && settings.letterNumbering?.showFooterNote !== false))
            ) && (
              <div className={`${pageSize === 'A5' ? 'mt-auto pt-2 text-[9px]' : 'mt-auto pt-3 text-[10px]'} border-t border-[#EBDBCE] text-[#8C6F66] flex items-center justify-between shrink-0`}>
                {isEditable ? (
                  <input
                    type="text"
                    value={footerNote}
                    onChange={(e) => setFooterNote(toPersianDigits(e.target.value))}
                    placeholder="متن پاورقی نامه"
                    className={`w-full bg-transparent border-b border-transparent hover:border-dashed hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none ${pageSize === 'A5' ? 'text-[9px]' : 'text-[10px]'} text-[#8C6F66]`}
                    title="متن پاورقی نامه (قابل ویرایش دستی قبل از امضا)"
                  />
                ) : (
                  <div>{footerNote || settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری'}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar Outside Canvas */}
        <div className="bg-white px-4 sm:px-6 py-2.5 border-t border-[#EBDBCE] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-[#8C6F66] truncate max-w-[180px] sm:max-w-none">
            <span className="shrink-0">گیرندگان:</span>
            <span className="font-bold text-[#3A241F] truncate">{letter.recipients?.map((r) => r.fullName).join(', ') || '---'}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadCustomPdf}
              className="px-3.5 py-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-[#3A241F] text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              بستن
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* POPUP LETTER TEXT & CONTENT EDITOR MODAL */}
      {/* ========================================================================= */}
      {showBodyEditorModal && (
        <WordEditorPopup
          initialBody={customBody}
          initialSubject={headerSubject}
          initialCenterTitle={headerCenterTitle}
          initialFooterNote={footerNote}
          bodyFontFamily={bodyFontFamily || chosenFont.fontFamily}
          availableFonts={allFonts}
          onSave={(body, subject, centerTitle, footerNoteVal, fontFamily) => {
            setCustomBody(body);
            setHeaderSubject(subject);
            setHeaderCenterTitle(centerTitle);
            setFooterNote(footerNoteVal);
            setBodyFontFamily(fontFamily);
            setShowBodyEditorModal(false);
          }}
          onClose={() => setShowBodyEditorModal(false)}
        />
      )}
    </div>
  );
};
