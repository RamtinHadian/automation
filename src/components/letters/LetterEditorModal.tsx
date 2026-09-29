import React, { useState, useRef, useEffect } from 'react';
import { DEFAULT_SIGNATURE_HEIGHT } from '../../lib/letterDefaults';
import {
  X,
  FileText,
  Stamp,
  Download,
  Send,
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
  CheckCheck,
  Building2,
  Calendar,
  Hash,
  Paperclip,
  Sparkles,
  Printer,
  FileDown,
  Move,
  GripHorizontal,
  CheckCircle2,
  AlertCircle,
  Award,
  Type
} from 'lucide-react';
import { User, LetterNumberingSettings } from '../../types';
import { formatCurrentJalaliDateTime, toPersianDigits, convertNumbersInHtmlToPersian } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { formatLetterNumber } from '../../lib/letterNumbering';

interface LetterEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffList: User[];
  currentUser: User;
  letterNumbering?: LetterNumberingSettings;
  onSendLetter: (letterData: {
    title: string;
    contentHtml: string;
    pageSize: 'A4' | 'A5' | 'Letter' | 'Letterhead';
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
    signerFontFamily?: string;
    signerFontSize?: number;
    customSignerName?: string;
    customSignerTitle?: string;
    headerCenterFontFamily?: string;
    subjectFontFamily?: string;
    metaFontFamily?: string;
    signatureOffsetX?: number;
    signatureOffsetY?: number;
    signatureHeight?: number;
    customFooterNote?: string;
    bodyOffsetX?: number;
    bodyPaddingX?: number;
    attachmentFileName?: string;
    attachmentFileSize?: string;
    attachmentFileDataUrl?: string;
  }) => void;
}

export type PaperSize = 'A4' | 'A5' | 'Letter' | 'Letterhead';

interface LetterTemplate {
  id: string;
  title: string;
  description: string;
  defaultSubject: string;
  content: string;
}

const TEMPLATES: LetterTemplate[] = [
  {
    id: 'general',
    title: 'نامه اداری عمومی',
    description: 'قالب استاندارد مکاتبات رسمی بین واحدهای سازمان',
    defaultSubject: 'درخواست بررسی و تایید مدارک',
    content: `<p><b>جناب آقای / سرکار خانم [نام گیرنده]</b><br><b>[سمت سازمانی گیرنده]</b></p>
<p>با سلام و احترام،</p>
<p>بدین‌وسیله به استحضار می‌رساند پیرو مصوبات و هماهنگی‌های به‌عمل آمده، مقتضی است دستور فرمایید نسبت به بررسی و اقدام لازم در خصوص موضوع یادشده اقدام فرمایند.</p>
<p>پیشاپیش از بذل توجه و همکاری صمیمانه جنابعالی کمال امتنان را دارم.</p>`,
  },
  {
    id: 'contract',
    title: 'تاییدیه قرارداد و امور مالی',
    description: 'جهت ارسال پیش‌نویس قرارداد و دستور پرداخت',
    defaultSubject: 'درخواست تایید پیش‌نویس قرارداد و تخصیص بودجه',
    content: `<p><b>مدیریت محترم امور مالی و قراردادها</b></p>
<p>با سلام و احترام،</p>
<p>احتراماً به پیوست پیش‌نویس قرارداد شماره [شماره قرارداد] مربوط به پروژه [نام پروژه] جهت بررسی، تایید نهایی و اخذ امضای مدیریت محترم عامل ارسال می‌گردد.</p>
<p>خواهشمند است پس از کنترل ضوابط و ردیف اعتباری، دستور اقدام مقتضی صادر فرمایید.</p>`,
  },
  {
    id: 'leave',
    title: 'درخواست مرخصی / ماموریت',
    description: 'فرم استاندارد استحقاقی، استعلاجی و ماموریت اداری',
    defaultSubject: 'درخواست مرخصی استحقاقی',
    content: `<p><b>مدیر محترم واحد [نام واحد]</b></p>
<p>با سلام و احترام،</p>
<p>اینجانب [نام متقاضی] شاغل در واحد [نام واحد]، درخواست استفاده از [تعداد] روز مرخصی استحقاقی از تاریخ [تاریخ شروع] لغایت [تاریخ پایان] را دارم.</p>
<p>شایان ذکر است هماهنگی‌های لازم با همکار جانشین (جناب آقای/سرکار خانم [نام جانشین]) به‌عمل آمده است.</p>`,
  },
  {
    id: 'directive',
    title: 'ابلاغیه و بخشنامه داخلی',
    description: 'ابلاغ دستورالعمل‌ها و مصوبات جدید سازمانی',
    defaultSubject: 'ابلاغیه دستورالعمل اجرایی فرآیندهای اداری',
    content: `<p style="text-align: center;"><b>« بخشنامه داخلی شماره [شماره] »</b></p>
<p><b>به: کلیه مدیران و روسای محترم واحدهای سازمانی</b><br><b>موضوع: ابلاغ فرآیند جدید گردش اسناد و نامه‌نگاری الکترونیک</b></p>
<p>با سلام،</p>
<p>در راستای ارتقای امنیت و تسریع در تبادل مکاتبات، از تاریخ ابلاغ این بخشنامه کلیه نامه‌های رسمی سازمان صرفاً از طریق سامانه مدیریت اسناد و با امضای الکترونیک معتبر ارسال خواهند شد.</p>
<p>رعایت دقیق مفاد این دستورالعمل برای تمامی کارکنان الزامی است.</p>`,
  },
];

export const LetterEditorModal: React.FC<LetterEditorModalProps> = ({
  isOpen,
  onClose,
  staffList,
  currentUser,
  letterNumbering,
  onSendLetter,
}) => {
  const { fonts, settings } = useAppContext();
  const defaultFont = fonts.find((f) => f.id === settings.defaultLetterFontId) || fonts[0] || { fontFamily: 'Vazirmatn', name: 'وزیرمتن' };
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>(defaultFont.fontFamily);
  const [headerCenterFontFamily, setHeaderCenterFontFamily] = useState<string>(defaultFont.fontFamily);
  const [subjectFontFamily, setSubjectFontFamily] = useState<string>(defaultFont.fontFamily);
  const [metaFontFamily, setMetaFontFamily] = useState<string>(defaultFont.fontFamily);
  const [signerFontFamily, setSignerFontFamily] = useState<string>(defaultFont.fontFamily);
  const [signerFontSize, setSignerFontSize] = useState<number>(18);
  const [signerName, setSignerName] = useState<string>(() => settings.ceoName || 'مدیریت سازمان');
  const [signerTitle, setSignerTitle] = useState<string>(() => settings.ceoTitle || 'مدیرعامل');
  const [selectedFontSize, setSelectedFontSize] = useState<string>('13px');
  const [headerCenterTitle, setHeaderCenterTitle] = useState('« به نام خدا »');
  const [bodyPaddingX, setBodyPaddingX] = useState<number>(32);
  const [bodyOffsetX, setBodyOffsetX] = useState<number>(0);
  const [signatureHeight, setSignatureHeight] = useState<number>(settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT);

  const [pageSize, setPageSize] = useState<PaperSize>('A4');
  const [subject, setSubject] = useState('درخواست بررسی و تایید رسمی');
  const [customDate, setCustomDate] = useState(() => formatCurrentJalaliDateTime().split(' - ')[0]);
  const [letterNumber, setLetterNumber] = useState(() => {
    return formatLetterNumber(settings.letterNumbering || letterNumbering);
  });
  const [attachment, setAttachment] = useState('دارد (پیوست الکترونیک)');
  // Official letters can only be sent for signature to the CEO / authorised signatories.
  const signers = staffList.filter((u) => u.canSignOfficialLetters);
  const [recipientId, setRecipientId] = useState(signers[0]?.id || '');
  const [extraNote, setExtraNote] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; dataUrl: string } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Draggable Elements State (Signature, Center Title, Subject)
  const [signatureAlign, setSignatureAlign] = useState<'left' | 'center' | 'right'>('left');
  const [signatureOffset, setSignatureOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [headerCenterOffset, setHeaderCenterOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [subjectOffset, setSubjectOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [metaOffset, setMetaOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [activeDragItem, setActiveDragItem] = useState<'NONE' | 'SIGNATURE' | 'CENTER_TITLE' | 'SUBJECT' | 'BODY' | 'META'>('NONE');
  const dragStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const editorRef = useRef<HTMLDivElement>(null);
  const paperSheetRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleFontChange = (fontFamily: string) => {
    setSelectedFontFamily(fontFamily);
    if (editorRef.current) {
      editorRef.current.style.fontFamily = fontFamily;
    }
    if (paperSheetRef.current) {
      paperSheetRef.current.style.fontFamily = fontFamily;
    }
    executeCommand('fontName', fontFamily);
  };

  const handleFontSizeChange = (size: string) => {
    setSelectedFontSize(size);
    if (editorRef.current) {
      editorRef.current.style.fontSize = size;
    }
  };

  const handleApplyTemplate = (template: LetterTemplate) => {
    setSubject(template.defaultSubject);
    if (editorRef.current) {
      editorRef.current.innerHTML = template.content
        .replace('[نام و سمت فرستنده]', `${currentUser.fullName} - ${currentUser.departmentName}`)
        .replace('[نام متقاضی]', currentUser.fullName)
        .replace('[نام واحد]', currentUser.departmentName);
    }
  };

  const executeCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleAttachmentUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setAttachedFile({
          name: file.name,
          size: (file.size / 1024 > 1024 ? (file.size / (1024 * 1024)).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'),
          dataUrl: e.target.result as string,
        });
        setAttachment('دارد (پیوست فایل/اسکن)');
      }
    };
    reader.readAsDataURL(file);
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

  // Unified Drag handlers for all draggable elements
  const handleSignatureMouseDown = (e: React.MouseEvent) => {
    setActiveDragItem('SIGNATURE');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...signatureOffset };
  };

  const handleCenterTitleMouseDown = (e: React.MouseEvent) => {
    setActiveDragItem('CENTER_TITLE');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...headerCenterOffset };
  };

  const handleSubjectMouseDown = (e: React.MouseEvent) => {
    setActiveDragItem('SUBJECT');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...subjectOffset };
  };

  const handleBodyMouseDown = (e: React.MouseEvent) => {
    setActiveDragItem('BODY');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { x: bodyOffsetX, y: 0 };
  };

  const handleMetaMouseDown = (e: React.MouseEvent) => {
    setActiveDragItem('META');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...metaOffset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeDragItem === 'NONE') return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;

    if (activeDragItem === 'SIGNATURE') {
      setSignatureOffset({
        x: Math.max(-250, Math.min(250, dragStartOffset.current.x + dx)),
        y: Math.max(-120, Math.min(120, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'CENTER_TITLE') {
      setHeaderCenterOffset({
        x: 0,
        y: Math.max(-30, Math.min(80, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'SUBJECT') {
      setSubjectOffset({
        x: Math.max(-150, Math.min(150, dragStartOffset.current.x + dx)),
        y: Math.max(-50, Math.min(100, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'BODY') {
      const newX = Math.max(-180, Math.min(180, dragStartOffset.current.x + dx));
      setBodyOffsetX(newX);
    } else if (activeDragItem === 'META') {
      setMetaOffset({
        x: Math.max(-150, Math.min(150, dragStartOffset.current.x + dx)),
        y: Math.max(-50, Math.min(80, dragStartOffset.current.y + dy)),
      });
    }
  };

  const handleMouseUp = () => {
    if (activeDragItem !== 'NONE') setActiveDragItem('NONE');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawHtml = editorRef.current?.innerHTML || '';
    const convertedHtml = convertNumbersInHtmlToPersian(rawHtml);
    if (!rawHtml.trim() || !subject.trim()) {
      alert('لطفاً عنوان و متن نامه را تکمیل کنید.');
      return;
    }

    const contentHtml = `<div style="font-family: '${selectedFontFamily}', 'Vazirmatn', 'B Nazanin', Tahoma, sans-serif; font-size: ${selectedFontSize}; line-height: 2.2; padding-left: ${bodyPaddingX}px; padding-right: ${bodyPaddingX}px; transform: translateX(${bodyOffsetX}px);">${convertedHtml}</div>`;

    onSendLetter({
      title: subject,
      contentHtml,
      pageSize,
      letterNumber,
      recipientId,
      note: extraNote,
      headerCenterTitle,
      headerCenterOffsetX: headerCenterOffset.x,
      headerCenterOffsetY: headerCenterOffset.y,
      subjectOffsetX: subjectOffset.x,
      subjectOffsetY: subjectOffset.y,
      metaOffsetX: metaOffset.x,
      metaOffsetY: metaOffset.y,
      signerFontFamily,
      signerFontSize,
      customSignerName: signerName,
      customSignerTitle: signerTitle,
      headerCenterFontFamily,
      subjectFontFamily,
      metaFontFamily,
      signatureOffsetX: signatureOffset.x,
      signatureOffsetY: signatureOffset.y,
      // Only store a size the author actually changed; otherwise the letter follows the admin default.
      signatureHeight: signatureHeight === (settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT) ? undefined : signatureHeight,
      customFooterNote: settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote,
      bodyOffsetX,
      bodyPaddingX,
      attachmentFileName: attachedFile?.name,
      attachmentFileSize: attachedFile?.size,
      attachmentFileDataUrl: attachedFile?.dataUrl,
    });
    onClose();
  };

  const getPageDimensions = () => {
    switch (pageSize) {
      case 'A5':
        return 'max-w-[580px] min-h-[600px] p-4 sm:p-7';
      case 'Letter':
        return 'max-w-[700px] min-h-[720px] p-5 sm:p-9';
      case 'Letterhead':
        return 'max-w-[740px] min-h-[780px] p-6 sm:p-10';
      case 'A4':
      default:
        return 'max-w-[720px] min-h-[760px] p-6 sm:p-10';
    }
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-1.5 sm:p-4 overflow-y-auto animate-in fade-in select-none font-sans"
    >
      <div className="bg-[#EFE8E1] rounded-2xl sm:rounded-[28px] shadow-2xl w-full max-w-6xl border border-[#C98B6A]/40 flex flex-col h-[96vh] sm:h-[94vh] overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="bg-[#3A241F] text-white px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between shrink-0 border-b border-[#563D34]">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shadow-md shrink-0">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-black text-xs sm:text-sm text-white truncate">ویرایشگر و نگارش نامه‌های رسمی اداری</h2>
              </div>
              <p className="text-[10px] sm:text-[11px] text-[#EBDBCE] truncate">
                تایپ متن نامه، تنظیم فونت و سایز نام مدیر، و ارسال به کارتابل مدیرعامل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-[#EBDBCE] hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action / Settings Toolbar Bar */}
        <div className="bg-white px-3 sm:px-6 py-2 border-b border-[#EBDBCE] flex items-center justify-between gap-2 shrink-0 overflow-x-auto no-scrollbar text-xs whitespace-nowrap">
          
          {/* Format / Paper Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#3A241F]">قطع کاغذ:</span>
            <div className="flex items-center gap-1 bg-[#FAF5F1] p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => setPageSize('A4')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  pageSize === 'A4' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                📄 قطع A4
              </button>
              <button
                type="button"
                onClick={() => setPageSize('A5')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  pageSize === 'A5' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                📄 قطع A5
              </button>
              <button
                type="button"
                onClick={() => setPageSize('Letter')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  pageSize === 'Letter' ? 'bg-[#6E1B1B] text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                📄 قطع Letter
              </button>
              <button
                type="button"
                onClick={() => setPageSize('Letterhead')}
                className={`px-3 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                  pageSize === 'Letterhead' ? 'bg-amber-600 text-white shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                🏛️ سربرگ رسمی با آرم
              </button>
            </div>
          </div>

          {/* Quick Pre-built Templates */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#8C6F66]">قالب آماده:</span>
            <select
              onChange={(e) => {
                const t = TEMPLATES.find((item) => item.id === e.target.value);
                if (t) handleApplyTemplate(t);
              }}
              defaultValue=""
              className="px-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none cursor-pointer"
            >
              <option value="" disabled>
                انتخاب قالب نامه‌نگاری...
              </option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Word Styling Toolbar (Hidden on Mobile) */}
        <div className="hidden sm:flex bg-[#FAF5F1] px-6 py-2 border-b border-[#EBDBCE] flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Font Family Selector */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE] shadow-2xs">
              <Type className="w-3.5 h-3.5 text-[#6E1B1B] mr-1 ml-0.5 shrink-0" />
              <select
                value={selectedFontFamily}
                onChange={(e) => handleFontChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#3A241F] focus:outline-none cursor-pointer py-0.5 px-1 max-w-[160px]"
                title="انتخاب قلم و فونت نامه"
              >
                {fonts.map((f) => (
                  <option key={f.id} value={f.fontFamily} style={{ fontFamily: f.fontFamily }}>
                    {f.name} {f.isDefault ? '' : '(آپلودی)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size Selector */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE] shadow-2xs">
              <select
                value={selectedFontSize}
                onChange={(e) => handleFontSizeChange(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#3A241F] focus:outline-none cursor-pointer py-0.5 px-1"
                title="اندازه قلم متن"
              >
                <option value="11px">۱۱ (ریز)</option>
                <option value="12px">۱۲ (متوسط)</option>
                <option value="13px">۱۳ (استاندارد)</option>
                <option value="14px">۱۴ (خوانا)</option>
                <option value="16px">۱۶ (بزرگ)</option>
                <option value="18px">۱۸ (تیتر)</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => executeCommand('bold')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F] font-bold"
                title="ضخیم (Bold)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('italic')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="مورب (Italic)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('underline')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="خط زیر (Underline)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => executeCommand('justifyRight')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="راست‌چین"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyCenter')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="وسط‌چین"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyLeft')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="چپ‌چین"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('justifyFull')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="هم‌تراز (Justify)"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => executeCommand('insertUnorderedList')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="لیست بالت"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => executeCommand('insertOrderedList')}
                className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F]"
                title="لیست شماره‌دار"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-[#EBDBCE] shadow-2xs">
              <span className="text-[11px] font-bold text-[#8C6F66]">جابه‌جایی کل متن (چپ/راست):</span>
              <input
                type="range"
                min="-120"
                max="120"
                value={bodyOffsetX}
                onChange={(e) => setBodyOffsetX(Number(e.target.value))}
                className="w-20 accent-[#6E1B1B] cursor-pointer"
                title="جابه‌جایی کل بدنه متن نامه به چپ یا راست"
              />
              <span className="font-mono text-[10px] font-bold text-[#6E1B1B] w-8 text-center">{toPersianDigits(bodyOffsetX)}px</span>
            </div>

            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-[#EBDBCE] shadow-2xs">
              <span className="text-[11px] font-bold text-[#8C6F66]">حاشیه متن:</span>
              <input
                type="range"
                min="0"
                max="80"
                value={bodyPaddingX}
                onChange={(e) => setBodyPaddingX(Number(e.target.value))}
                className="w-16 accent-[#6E1B1B] cursor-pointer"
                title="تغییر فاصله و حاشیه متن از سمت چپ و راست"
              />
              <span className="font-mono text-[10px] font-bold text-[#6E1B1B] w-7 text-center">{toPersianDigits(bodyPaddingX)}px</span>
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE]">
              <button
                type="button"
                onClick={handleInsertTable}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#3A241F] hover:bg-[#FAF5F1] rounded-lg cursor-pointer"
                title="افزودن جدول"
              >
                <Table className="w-3.5 h-3.5 text-[#C98B6A]" />
                <span>درج جدول</span>
              </button>
            </div>

            {/* Attachment Upload Button in Editor Toolbar */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#EBDBCE]">
              <input
                type="file"
                ref={attachmentInputRef}
                accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleAttachmentUpload(e.target.files[0]);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-50 rounded-lg cursor-pointer"
                title="افزودن فایل پیوست یا اسکن سند"
              >
                <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                <span>{attachedFile ? 'تغییر فایل پیوست' : 'افزودن پیوست / اسکن'}</span>
              </button>
            </div>
          </div>

          {/* Quick Position & Size Controls for Signature Block */}
          <div className="flex items-center gap-2 bg-amber-50/80 px-3 py-1 rounded-xl border border-amber-200">
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
              <Move className="w-3.5 h-3.5 text-amber-700" />
              <span>محل امضای مدیر:</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setSignatureAlign('left'); setSignatureOffset({ x: 0, y: 0 }); }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  signatureAlign === 'left' ? 'bg-amber-600 text-white' : 'text-[#8C6F66] hover:bg-white'
                }`}
              >
                چپ‌چین اداری
              </button>
              <button
                type="button"
                onClick={() => { setSignatureAlign('center'); setSignatureOffset({ x: 0, y: 0 }); }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  signatureAlign === 'center' ? 'bg-amber-600 text-white' : 'text-[#8C6F66] hover:bg-white'
                }`}
              >
                وسط
              </button>
              <button
                type="button"
                onClick={() => { setSignatureAlign('right'); setSignatureOffset({ x: 0, y: 0 }); }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  signatureAlign === 'right' ? 'bg-amber-600 text-white' : 'text-[#8C6F66] hover:bg-white'
                }`}
              >
                راست
              </button>
            </div>

            <div className="flex items-center gap-1.5 border-r border-amber-300/80 pr-2 mr-1">
              <span className="text-[10px] font-bold text-amber-950">سایز امضا:</span>
              <input
                type="range"
                min="20"
                max="600"
                value={signatureHeight}
                onChange={(e) => setSignatureHeight(Number(e.target.value))}
                className="w-20 accent-amber-700 cursor-pointer"
                title="تنظیم اندازه و ارتفاع امضای مدیرعامل"
              />
              <span className="font-mono text-[10px] font-bold text-amber-800 w-8">{toPersianDigits(signatureHeight)}px</span>
            </div>
          </div>
        </div>

        {/* Main Document Workspace Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center bg-[#E5DCD2]/60">
          
          {/* Virtual Paper Sheet */}
          <div
            ref={paperSheetRef}
            style={{ fontFamily: selectedFontFamily }}
            className={`bg-white official-letter-sheet rounded-xl shadow-2xl border border-[#C98B6A]/30 w-full transition-all text-[#3A241F] flex flex-col justify-between relative ${getPageDimensions()}`}
          >
            {/* Header Component */}
            <div className="pb-2 mb-4 space-y-3 shrink-0">
              <div className="relative flex items-start justify-between">
                {/* Right: Company Info & Dynamic Logo */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    {settings.companyLogoUrl ? (
                      <div
                        style={{
                          width: `${settings.companyLogoWidth || 70}px`,
                          height: `${settings.companyLogoWidth || 70}px`,
                          maxHeight: `${settings.companyLogoWidth || 70}px`,
                        }}
                        className="flex items-center justify-center shrink-0 p-0"
                      >
                        <img
                          src={settings.companyLogoUrl}
                          alt="لوگو"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : null}
                    {(settings.companyName || settings.companySubtitle) && (
                      <div>
                        {settings.companyName && (
                          <h1 className="font-black text-sm text-[#3A241F]">
                            {settings.companyName}
                          </h1>
                        )}
                        {settings.companySubtitle && (
                          <div className="text-[10px] text-[#8C6F66]">
                            {settings.companySubtitle}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Center: Official Title (Strictly Centered & Vertically Draggable Only) */}
                <div
                  className="absolute left-1/2 flex items-center justify-center z-10"
                  style={{
                    top: '8px',
                    transform: `translate(-50%, ${headerCenterOffset.y}px)`,
                  }}
                >
                  <div
                    className={`group/title relative flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all ${
                      activeDragItem === 'CENTER_TITLE' ? 'ring-2 ring-amber-500/50 bg-amber-50/50 shadow-xs' : 'hover:bg-amber-50/30'
                    }`}
                  >
                    <div
                      onMouseDown={handleCenterTitleMouseDown}
                      className="cursor-ns-resize active:cursor-ns-resize p-1 text-[#8C6F66] hover:text-[#6E1B1B] transition-colors shrink-0 select-none"
                      title="برای جابه‌جایی عمودی «به نام خدا»، با ماوس به بالا یا پایین بکشید (Drag Up/Down)"
                    >
                      <Move className="w-3 h-3" />
                    </div>
                    <input
                      type="text"
                      value={headerCenterTitle}
                      onChange={(e) => setHeaderCenterTitle(toPersianDigits(e.target.value))}
                      placeholder="« به نام خدا »"
                      style={{ fontFamily: headerCenterFontFamily }}
                      className="font-black text-sm text-[#3A241F] text-center bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none px-1 py-0.5 max-w-[180px]"
                      title="متن بالای سربرگ (همیشه دقیقاً وسط صفحه، قابل حرکت عمودی)"
                    />

                    {/* Independent Font Picker for Center Title */}
                    <div className="relative opacity-0 group-hover/title:opacity-100 transition-opacity">
                      <select
                        value={headerCenterFontFamily}
                        onChange={(e) => setHeaderCenterFontFamily(e.target.value)}
                        className="bg-white/90 border border-amber-300 text-[10px] text-amber-900 rounded-md px-1 py-0.5 focus:outline-none cursor-pointer shadow-2xs font-sans"
                        title="انتخاب فونت اختصاصی «به نام خدا»"
                      >
                        {fonts.map((f) => (
                          <option key={f.id} value={f.fontFamily}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Left: Metadata (Date, Number, Attachment) - Exactly Stacked Vertically & Aligned */}
                <div
                  style={{
                    transform: `translate(${metaOffset.x}px, ${metaOffset.y}px)`,
                    fontFamily: metaFontFamily,
                  }}
                  className="text-[11px] font-medium text-[#3A241F] relative group/meta select-none shrink-0"
                  dir="rtl"
                >
                  <div className="flex items-center gap-1 absolute -top-5 left-0 opacity-0 group-hover/meta:opacity-100 transition-opacity z-10">
                    <div
                      onMouseDown={handleMetaMouseDown}
                      className="bg-[#FAF5F1] hover:bg-amber-100 text-[#8C6F66] hover:text-[#6E1B1B] border border-[#EBDBCE] px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 cursor-grab active:cursor-grabbing shadow-2xs"
                      title="برای جابه‌جایی کادر شماره، تاریخ و پیوست با ماوس بکشید (Drag)"
                    >
                      <Move className="w-2.5 h-2.5 text-[#C98B6A]" />
                      <span>جابه‌جایی</span>
                    </div>
                    {/* Independent Font Picker for Metadata */}
                    <select
                      value={metaFontFamily}
                      onChange={(e) => setMetaFontFamily(e.target.value)}
                      className="bg-white border border-amber-300 text-[10px] text-amber-900 rounded-md px-1 py-0.5 focus:outline-none cursor-pointer shadow-2xs font-sans"
                      title="انتخاب فونت اختصاصی شماره، تاریخ و پیوست"
                    >
                      {fonts.map((f) => (
                        <option key={f.id} value={f.fontFamily}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Perfectly Stacked Under Each Other with Fixed Column Alignment */}
                  <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-right items-center">
                    <span className="text-[#8C6F66] font-bold text-right shrink-0">شماره:</span>
                    <input
                      type="text"
                      value={letterNumber}
                      onChange={(e) => setLetterNumber(toPersianDigits(e.target.value))}
                      placeholder="شماره نامه"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />

                    <span className="text-[#8C6F66] font-bold text-right shrink-0">تاریخ:</span>
                    <input
                      type="text"
                      value={customDate}
                      onChange={(e) => setCustomDate(toPersianDigits(e.target.value))}
                      placeholder="تاریخ نامه"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />

                    <span className="text-[#8C6F66] font-bold text-right shrink-0">پیوست:</span>
                    <input
                      type="text"
                      value={attachment}
                      onChange={(e) => setAttachment(e.target.value)}
                      placeholder="پیوست"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Attached File Indicator in Editor (if uploaded) */}
              {attachedFile && (
                <div className="flex items-center justify-between p-2 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-950 font-bold">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-amber-600" />
                    <span>فایل پیوست / اسکن ضمیمه: <b>{attachedFile.name}</b> ({toPersianDigits(attachedFile.size)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedFile(null);
                      setAttachment('ندارد');
                    }}
                    className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                  >
                    حذف پیوست
                  </button>
                </div>
              )}

              {/* Draggable & Editable Subject Field with Independent Font */}
              <div
                className="pt-2 flex items-center gap-2 text-xs font-bold relative group/subj"
                style={{
                  transform: `translate(${subjectOffset.x}px, ${subjectOffset.y}px)`,
                  fontFamily: subjectFontFamily,
                }}
              >
                <div
                  onMouseDown={handleSubjectMouseDown}
                  className="cursor-grab active:cursor-grabbing p-1 text-[#8C6F66] hover:text-[#6E1B1B] transition-colors shrink-0 select-none flex items-center gap-1"
                  title="برای جابه‌جایی خط موضوع نامه، با ماوس بکشید (Drag)"
                >
                  <Move className="w-3 h-3 text-[#C98B6A] group-hover/subj:text-[#6E1B1B]" />
                  <span className="text-[#6E1B1B] shrink-0 font-black">موضوع نامه:</span>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="موضوع نامه رسمی را تایپ کنید..."
                  style={{ fontFamily: subjectFontFamily }}
                  className="flex-1 bg-transparent border-b border-transparent hover:border-[#C98B6A] pb-1 font-bold text-[#3A241F] focus:outline-none focus:border-[#6E1B1B]"
                />

                {/* Independent Font Picker for Subject */}
                <div className="opacity-0 group-hover/subj:opacity-100 transition-opacity">
                  <select
                    value={subjectFontFamily}
                    onChange={(e) => setSubjectFontFamily(e.target.value)}
                    className="bg-white border border-amber-300 text-[10px] text-amber-900 rounded-md px-1.5 py-0.5 focus:outline-none cursor-pointer shadow-2xs font-sans"
                    title="انتخاب فونت اختصاصی موضوع نامه"
                  >
                    {fonts.map((f) => (
                      <option key={f.id} value={f.fontFamily}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Editable Letter Body (Word contentEditable) with Drag & Margin */}
            <div className="relative flex flex-col group/body">
              <div
                onMouseDown={handleBodyMouseDown}
                className="opacity-0 group-hover/body:opacity-100 transition-opacity absolute -top-3 left-2 bg-[#FAF5F1] hover:bg-amber-100 text-[#8C6F66] hover:text-[#6E1B1B] border border-[#EBDBCE] px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 cursor-grab active:cursor-grabbing select-none z-10 shadow-xs"
                title="برای جابه‌جایی کل متن نامه به چپ یا راست، بکشید (Drag)"
              >
                <Move className="w-3 h-3 text-[#C98B6A]" />
                <span>جابه‌جایی کل متن</span>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                style={{
                  fontFamily: selectedFontFamily,
                  fontSize: selectedFontSize,
                  lineHeight: 2.2,
                  paddingLeft: `${bodyPaddingX}px`,
                  paddingRight: `${bodyPaddingX}px`,
                  transform: `translateX(${bodyOffsetX}px)`,
                }}
                className="focus:outline-none min-h-[160px] leading-relaxed space-y-3 transition-transform"
                dangerouslySetInnerHTML={{ __html: TEMPLATES[0].content }}
              />
            </div>

            {/* DRAGGABLE CEO SIGNATURE BLOCK & EDITABLE NAME / TITLE */}
            <div className={`${pageSize === 'A5' ? 'mt-4 pt-1 min-h-[90px]' : 'mt-8 pt-2 min-h-[140px]'} flex justify-end items-end relative`}>
              <div
                style={{
                  transform: `translate(${signatureOffset.x}px, ${signatureOffset.y}px)`,
                }}
                className={`text-center ${pageSize === 'A5' ? 'w-[170px] min-w-[170px]' : 'w-[220px] min-w-[220px]'} space-y-0.5 flex flex-col items-center relative select-none transition-all`}
              >
                {/* Draft Staging Box with Drag Handle & Font Customization (Compact, Square-Shaped) */}
                <div
                  className={`group relative p-2 rounded-2xl border-2 border-dashed transition-all select-none flex flex-col justify-between items-center text-center w-full ${
                    activeDragItem === 'SIGNATURE'
                      ? 'border-amber-600 bg-amber-50/90 shadow-md scale-102 ring-2 ring-amber-500/30'
                      : 'border-amber-400/80 bg-[#FAF5F1]/80 hover:border-amber-600 hover:bg-amber-50/50'
                  }`}
                  style={{ minHeight: '140px' }}
                >
                  {/* Top Drag & Typography Toolbar: Font + Size + Drag in compact header (Hidden on mobile) */}
                  <div className="hidden sm:flex w-full items-center justify-between text-[9px] font-bold text-amber-800 pb-1 border-b border-dashed border-amber-200/80 gap-1">
                    <div
                      onMouseDown={handleSignatureMouseDown}
                      className="flex items-center gap-0.5 cursor-grab active:cursor-grabbing hover:text-[#6E1B1B] text-[9px]"
                      title="برای جابه‌جایی، با ماوس بکشید (Drag)"
                    >
                      <Move className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>حرکت</span>
                    </div>

                    {/* Font & Size Controls for Signer Block */}
                    <div className="flex items-center gap-0.5">
                      <select
                        value={signerFontFamily}
                        onChange={(e) => setSignerFontFamily(e.target.value)}
                        className="bg-white border border-amber-300 text-[9px] text-amber-900 rounded px-1 py-0.2 focus:outline-none cursor-pointer shadow-2xs font-sans max-w-[65px] truncate"
                        title="انتخاب فونت"
                      >
                        {fonts.map((f) => (
                          <option key={f.id} value={f.fontFamily}>
                            {f.name}
                          </option>
                        ))}
                      </select>

                      <div className="flex items-center bg-white border border-amber-300 rounded px-0.5 py-0.2" title="سایز فونت">
                        <button
                          type="button"
                          onClick={() => setSignerFontSize(Math.max(10, signerFontSize - 1))}
                          className="text-amber-800 hover:text-black px-0.5 font-bold cursor-pointer text-[10px] leading-none"
                          title="کوچک‌تر"
                        >
                          -
                        </button>
                        <span className="text-[9px] font-bold text-amber-900 min-w-[12px] text-center font-mono">
                          {toPersianDigits(signerFontSize)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSignerFontSize(Math.min(36, signerFontSize + 1))}
                          className="text-amber-800 hover:text-black px-0.5 font-bold cursor-pointer text-[10px] leading-none"
                          title="بزرگ‌تر"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Clean Editable Signer Name & Title Centered in Square */}
                  <div className="flex-1 flex flex-col justify-center items-center w-full px-0.5 py-1 space-y-1">
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="نام مدیرعامل"
                      style={{ fontFamily: signerFontFamily, fontSize: `${signerFontSize}px` }}
                      className="font-black text-center text-[#3A241F] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-0.5 leading-tight"
                      title="نام مدیرعامل / امضاکننده (قابل ویرایش مستقیم)"
                    />
                    <input
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      placeholder="سمت سازمانی"
                      style={{ fontFamily: signerFontFamily, fontSize: `${Math.max(12, signerFontSize - 3)}px` }}
                      className="text-center text-[#8C6F66] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-full px-0.5 font-medium leading-tight"
                      title="سمت سازمانی امضاکننده (قابل ویرایش مستقیم)"
                    />
                  </div>

                  {/* Signature & Stamp Preview inside Square / Block */}
                  <div className="w-full flex items-center justify-center gap-2 py-1 min-h-[50px] relative">
                    {settings.ceoSignatureUrl ? (
                      <img
                        src={settings.ceoSignatureUrl}
                        alt="امضا"
                        style={{ height: `${pageSize === 'A5' ? Math.min(signatureHeight, 100) : Math.min(signatureHeight, 130)}px` }}
                        className="object-contain mix-blend-multiply pointer-events-none opacity-90"
                      />
                    ) : null}
                    {settings.companyStampUrl ? (
                      <img
                        src={settings.companyStampUrl}
                        alt="مهر"
                        style={{ height: `${pageSize === 'A5' ? Math.min(Math.round(signatureHeight * 0.7), 60) : Math.min(Math.round(signatureHeight * 0.75), 80)}px` }}
                        className="object-contain mix-blend-multiply pointer-events-none opacity-85"
                      />
                    ) : null}
                    {!settings.ceoSignatureUrl && !settings.companyStampUrl && (
                      <div className="text-[8px] text-amber-700/60 font-bold border-t border-dashed border-amber-200/60 pt-0.5 w-full text-center">
                        محل درج امضا و مهر رسمی
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Official Letter Footer */}
            {(settings.showFooterNote !== false && settings.letterNumbering?.showFooterNote !== false) && (
              <div className="mt-auto pt-4 border-t border-[#EBDBCE] text-[10px] text-[#8C6F66] flex items-center justify-between shrink-0">
                <div>
                  تنظیم‌کننده: <b>{currentUser.fullName}</b> ({currentUser.departmentName}) • شماره: <span className="font-mono text-[#3A241F]">{letterNumber}</span>
                </div>
                <div className="text-[#8C6F66]">
                  {settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Submission Bar */}
        <form
          onSubmit={handleSubmit}
          className="bg-white px-6 py-3 border-t border-[#EBDBCE] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0"
        >
          <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#3A241F] shrink-0">ارسال جهت امضا به:</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="px-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none cursor-pointer"
              >
                {signers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} (★ مدیرعامل / صاحب امضا)
                  </option>
                ))}
              </select>
              {signers.length === 0 && (
                <span className="text-[11px] font-bold text-rose-600">صاحب امضایی تعریف نشده است.</span>
              )}
            </div>

            <input
              type="text"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="توضیحات اختیاری ضمیمه جهت استحضار مدیر..."
              className="px-3 py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:outline-none flex-1 min-w-[260px]"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl transition-all cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!signers.some((u) => u.id === recipientId)}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer shrink-0"
            >
              <Stamp className="w-4 h-4" />
              <span>ثبت و ارسال نامه رسمی جهت امضای مدیر</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
