import React, { useState, useRef, useEffect } from 'react';
import { DraggableImage } from './DraggableImage';
import { MoveBox } from './MoveBox';
import { hwheel } from '../../lib/hscroll';
import { ZoomBar } from './ZoomBar';
import { ScaledPaper } from './ScaledPaper';
import { useFitZoom } from '../../lib/useFitZoom';
import { SIGNATURE_ANCHOR_LEFT, STAMP_ANCHOR_LEFT, signatureAreaHeight } from '../../lib/letterDefaults';
import { DEFAULT_SIGNATURE_HEIGHT } from '../../lib/letterDefaults';
import {
  X,
  FileText,
  Stamp,
  Lock,
  Unlock,
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
import { FileTransfer, User, LetterNumberingSettings } from '../../types';
import { formatCurrentJalaliDateTime, toPersianDigits, convertNumbersInHtmlToPersian } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { formatLetterNumber } from '../../lib/letterNumbering';

interface LetterEditorModalProps {
  /** Edit mode: the author's own unsigned letter to change. */
  editTransfer?: FileTransfer | null;
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
    signatureImgOffsetX?: number;
    signatureImgOffsetY?: number;
    stampHeight?: number;
    stampOffsetX?: number;
    stampOffsetY?: number;
    showSignatureImage?: boolean;
    showStampImage?: boolean;
    showLetterNumber?: boolean;
    showLetterDate?: boolean;
    showLetterAttachment?: boolean;
    customFooterNote?: string;
    bodyOffsetX?: number;
    bodyOffsetY?: number;
    orgOffsetX?: number;
    orgOffsetY?: number;
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

/**
 * Reads a stored letter back into editor values: the body (without the wrapper the editor adds when sending),
 * its font/size/margins, the subject and the layout positions that were saved with the letter.
 */
function parseLetterForEdit(t: FileTransfer) {
  const layout: Record<string, unknown> = {};
  let bodyHtml = t.letterContentHtml || '';
  try {
    const doc = new DOMParser().parseFromString(`<div id="r">${bodyHtml}</div>`, 'text/html');
    const root = doc.getElementById('r');
    const wrap = root && root.children.length === 1 ? (root.children[0] as HTMLElement) : null;
    if (wrap && wrap.tagName === 'DIV' && /line-height/.test(wrap.getAttribute('style') || '')) {
      const first = (wrap.style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      if (first) layout.selectedFontFamily = first;
      if (wrap.style.fontSize) layout.selectedFontSize = wrap.style.fontSize;
      const pad = parseInt(wrap.style.paddingLeft || '', 10);
      if (!isNaN(pad)) layout.bodyPaddingX = pad;
      const tx = /translateX\((-?[0-9.]+)px\)/.exec(wrap.style.transform || '');
      if (tx) layout.bodyOffsetX = parseFloat(tx[1]);
      bodyHtml = wrap.innerHTML;
    }
  } catch {
    /* keep the stored html as it is */
  }
  const pt = (x?: number, y?: number) => ({ x: x || 0, y: y || 0 });
  if (t.pageSize) layout.pageSize = t.pageSize;
  if (t.customHeaderCenterTitle !== undefined) layout.headerCenterTitle = t.customHeaderCenterTitle;
  layout.headerCenterOffset = pt(t.headerCenterOffsetX, t.headerCenterOffsetY);
  layout.subjectOffset = pt(t.subjectOffsetX, t.subjectOffsetY);
  layout.metaOffset = pt(t.metaOffsetX, t.metaOffsetY);
  if (t.headerCenterFontFamily) layout.headerCenterFontFamily = t.headerCenterFontFamily;
  if (t.subjectFontFamily) layout.subjectFontFamily = t.subjectFontFamily;
  if (t.metaFontFamily) layout.metaFontFamily = t.metaFontFamily;
  if (t.signerFontFamily) layout.signerFontFamily = t.signerFontFamily;
  if (t.signerFontSize) layout.signerFontSize = t.signerFontSize;
  layout.signatureOffset = pt(t.signatureOffsetX, t.signatureOffsetY);
  if (t.signatureHeight) layout.signatureHeight = t.signatureHeight;
  layout.sigImgOffset = pt(t.signatureImgOffsetX, t.signatureImgOffsetY);
  if (t.stampHeight) layout.stampHeightOverride = t.stampHeight;
  layout.stampOffset = pt(t.stampOffsetX, t.stampOffsetY);
  layout.orgOffset = pt(t.orgOffsetX, t.orgOffsetY);
  if (t.bodyOffsetY) layout.bodyOffsetY = t.bodyOffsetY;
  if (t.showSignatureImage === false) layout.showSignatureImage = false;
  if (t.showStampImage === false) layout.showStampImage = false;
  if (t.showLetterNumber === false) layout.showLetterNumber = false;
  if (t.showLetterDate === false) layout.showLetterDate = false;
  if (t.showLetterAttachment === false) layout.showLetterAttachment = false;
  const subject = (t.fileName || '').replace(/^نامه_/, '').replace(/_(A4|A5|Letter|Letterhead)\.html$/, '').replace(/_/g, ' ');
  return { bodyHtml, layout, subject, signerName: t.customSignerName, signerTitle: t.customSignerTitle };
}

export const LetterEditorModal: React.FC<LetterEditorModalProps> = ({
  editTransfer,
  isOpen,
  onClose,
  staffList,
  currentUser,
  letterNumbering,
  onSendLetter,
}) => {
  const { fonts, settings, setSettings, setStaffList, setCurrentUser, showToast } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const orgTpl = settings.letterTemplate;
  const defaultFont = fonts.find((f) => f.id === settings.defaultLetterFontId) || fonts[0] || { fontFamily: 'Vazirmatn', name: 'وزیرمتن' };
  // The user's saved letter settings (restored every time the editor opens).
  // Edit mode: rebuild the editor state from the stored letter.
  const [editInit] = useState(() => (editTransfer ? parseLetterForEdit(editTransfer) : null));
  const isEditing = !!editTransfer;
  // Priority: the organisation template when it is locked (or when the person has no settings of their own yet), else the person's own settings.
  const personalPrefs = (currentUser.letterPrefs || {}) as Record<string, any>;
  const hasPersonal = Object.keys(personalPrefs).length > 0;
  const basePrefs = (orgTpl?.layout && (orgTpl.locked || !hasPersonal) ? orgTpl.layout : personalPrefs) as Record<string, any>;
  const prefs = (editInit ? { ...basePrefs, ...editInit.layout } : basePrefs) as Record<string, any>;
  const [initialBody] = useState<string>(() => editInit?.bodyHtml || orgTpl?.bodyHtml || TEMPLATES[0].content);
  const fontPref = (v: unknown) => (typeof v === 'string' && fonts.some((f) => f.fontFamily === v) ? v : defaultFont.fontFamily);
  const numPref = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
  const ptPref = (v: any) => ({ x: numPref(v?.x, 0), y: numPref(v?.y, 0) });
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>(() => fontPref(prefs.selectedFontFamily));
  const [headerCenterFontFamily, setHeaderCenterFontFamily] = useState<string>(() => fontPref(prefs.headerCenterFontFamily));
  const [subjectFontFamily, setSubjectFontFamily] = useState<string>(() => fontPref(prefs.subjectFontFamily));
  const [metaFontFamily, setMetaFontFamily] = useState<string>(() => fontPref(prefs.metaFontFamily));
  const [signerFontFamily, setSignerFontFamily] = useState<string>(() => fontPref(prefs.signerFontFamily));
  const [signerFontSize, setSignerFontSize] = useState<number>(() => numPref(prefs.signerFontSize, 18));
  const [signerName, setSignerName] = useState<string>(() => editInit?.signerName || settings.ceoName || 'مدیریت سازمان');
  const [signerTitle, setSignerTitle] = useState<string>(() => editInit?.signerTitle || settings.ceoTitle || 'مدیرعامل');
  const [selectedFontSize, setSelectedFontSize] = useState<string>(() => (typeof prefs.selectedFontSize === 'string' ? prefs.selectedFontSize : '13px'));
  const [headerCenterTitle, setHeaderCenterTitle] = useState<string>(() => (typeof prefs.headerCenterTitle === 'string' ? prefs.headerCenterTitle : '« به نام خدا »'));
  const [bodyPaddingX, setBodyPaddingX] = useState<number>(() => numPref(prefs.bodyPaddingX, 32));
  const [bodyOffsetX, setBodyOffsetX] = useState<number>(() => numPref(prefs.bodyOffsetX, 0));
  const [signatureHeight, setSignatureHeight] = useState<number>(() => numPref(prefs.signatureHeight, settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT));

  const [pageSize, setPageSize] = useState<PaperSize>(() => (['A4', 'A5', 'Letter', 'Letterhead'].includes(prefs.pageSize) ? prefs.pageSize : 'A4'));
  const fitZ = useFitZoom(({ A4: 720, A5: 580, Letter: 700, Letterhead: 740 } as Record<string, number>)[pageSize] ?? 720);
  const zoom = fitZ.zoom;
  const [showNote, setShowNote] = useState(false);
  // On phones the paper is narrow, so the centre title flows above the header instead of overlapping the company name.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [subject, setSubject] = useState(() => editInit?.subject || 'درخواست بررسی و تایید رسمی');
  const [customDate, setCustomDate] = useState(() => formatCurrentJalaliDateTime().split(' - ')[0]);
  const [letterNumber, setLetterNumber] = useState(() => {
    if (editTransfer?.letterNumber) return editTransfer.letterNumber;
    return formatLetterNumber(settings.letterNumbering || letterNumbering);
  });
  const [attachment, setAttachment] = useState('دارد (پیوست الکترونیک)');
  // Official letters can only be sent for signature to the CEO / authorised signatories.
  const signers = staffList.filter((u) => u.canSignOfficialLetters);
  const [recipientId, setRecipientId] = useState(editTransfer?.recipients[0]?.id || signers[0]?.id || '');
  const [extraNote, setExtraNote] = useState('');
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; dataUrl: string } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Draggable Elements State (Signature, Center Title, Subject)
  const [signatureAlign, setSignatureAlign] = useState<'left' | 'center' | 'right'>(() => (['left', 'center', 'right'].includes(prefs.signatureAlign) ? prefs.signatureAlign : 'left'));
  const [signatureOffset, setSignatureOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.signatureOffset));
  // Signature image and stamp are positioned and sized independently (drag / corner handle)
  const [sigImgOffset, setSigImgOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.sigImgOffset));
  const [stampOffset, setStampOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.stampOffset));
  const [showSigImg, setShowSigImg] = useState<boolean>(() => prefs.showSignatureImage !== false);
  const [showStampImg, setShowStampImg] = useState<boolean>(() => prefs.showStampImage !== false);
  const [showNo, setShowNo] = useState<boolean>(() => prefs.showLetterNumber !== false);
  const [showDate, setShowDate] = useState<boolean>(() => prefs.showLetterDate !== false);
  const [showAtt, setShowAtt] = useState<boolean>(() => prefs.showLetterAttachment !== false);
  const [stampHeightOverride, setStampHeightOverride] = useState<number | null>(() => (typeof prefs.stampHeightOverride === 'number' ? prefs.stampHeightOverride : null));
  const effectiveStampHeight =
    stampHeightOverride ?? (pageSize === 'A5' ? Math.min(Math.round(signatureHeight * 0.95), 100) : Math.round(signatureHeight * 1.05));
  const [headerCenterOffset, setHeaderCenterOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.headerCenterOffset));
  const [subjectOffset, setSubjectOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.subjectOffset));
  const [metaOffset, setMetaOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.metaOffset));
  const [orgOffset, setOrgOffset] = useState<{ x: number; y: number }>(() => ptPref(prefs.orgOffset));
  const [bodyOffsetY, setBodyOffsetY] = useState<number>(() => numPref(prefs.bodyOffsetY, 0));
  // Once everything is where it should be, the layout can be locked so a stray touch moves nothing.
  const [layoutLocked, setLayoutLocked] = useState<boolean>(() => prefs.layoutLocked === true);

  const collectLayout = () => ({
    selectedFontFamily, headerCenterFontFamily, subjectFontFamily, metaFontFamily, signerFontFamily, signerFontSize,
    selectedFontSize, headerCenterTitle, bodyPaddingX, bodyOffsetX, signatureHeight, pageSize, signatureAlign,
    signatureOffset, sigImgOffset, stampOffset, stampHeightOverride, headerCenterOffset, subjectOffset, metaOffset,
    orgOffset, bodyOffsetY, layoutLocked,
    showSignatureImage: showSigImg, showStampImage: showStampImg, showLetterNumber: showNo, showLetterDate: showDate, showLetterAttachment: showAtt,
  });

  // The person's own letter settings are saved only when they press «ذخیره تنظیمات»; until then every change belongs to
  // this letter alone. The next new letter opens exactly from the last saved settings (nothing else changes them).
  const savedPrefs = useRef<string | null>(null);
  const [, bumpSaved] = useState(0);
  const layoutJson = JSON.stringify(collectLayout());
  if (savedPrefs.current === null) savedPrefs.current = layoutJson;
  const layoutDirty = layoutJson !== savedPrefs.current;
  const canSaveLayout = !isEditing && !orgTpl?.locked;
  const saveLayout = () => {
    if (!canSaveLayout) return;
    const next = collectLayout();
    savedPrefs.current = JSON.stringify(next);
    setStaffList((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, letterPrefs: next } : u)));
    setCurrentUser((u) => (u.id === currentUser.id ? { ...u, letterPrefs: next } : u));
    bumpSaved((n) => n + 1);
    showToast('تنظیمات نامه ذخیره شد؛ نامهٔ بعدی دقیقاً از همین وضعیت شروع می‌شود.');
  };

  // Back to the standard layout (organisation template when there is one, else the built-in defaults) and forget the
  // person's own saved settings, for when earlier adjustments left the letter out of shape.
  const resetLayout = () => {
    const base = (orgTpl?.layout || {}) as Record<string, any>;
    const fam = (v: unknown) => fontPref(v);
    const pt = (v: any) => ptPref(v);
    setSelectedFontFamily(fam(base.selectedFontFamily));
    setHeaderCenterFontFamily(fam(base.headerCenterFontFamily));
    setSubjectFontFamily(fam(base.subjectFontFamily));
    setMetaFontFamily(fam(base.metaFontFamily));
    setSignerFontFamily(fam(base.signerFontFamily));
    setSignerFontSize(numPref(base.signerFontSize, 18));
    setSelectedFontSize(typeof base.selectedFontSize === 'string' ? base.selectedFontSize : '13px');
    setHeaderCenterTitle(typeof base.headerCenterTitle === 'string' ? base.headerCenterTitle : '« به نام خدا »');
    setBodyPaddingX(numPref(base.bodyPaddingX, 32));
    setBodyOffsetX(numPref(base.bodyOffsetX, 0));
    setSignatureHeight(numPref(base.signatureHeight, settings.ceoSignatureHeight || DEFAULT_SIGNATURE_HEIGHT));
    setSignatureAlign('left');
    setSignatureOffset(pt(base.signatureOffset));
    setSigImgOffset(pt(base.sigImgOffset));
    setStampOffset(pt(base.stampOffset));
    setStampHeightOverride(typeof base.stampHeightOverride === 'number' ? base.stampHeightOverride : null);
    setHeaderCenterOffset(pt(base.headerCenterOffset));
    setSubjectOffset(pt(base.subjectOffset));
    setMetaOffset(pt(base.metaOffset));
    setOrgOffset(pt(base.orgOffset));
    setBodyOffsetY(numPref(base.bodyOffsetY, 0));
    setLayoutLocked(false);
    setShowSigImg(base.showSignatureImage !== false);
    setShowStampImg(base.showStampImage !== false);
    setShowNo(base.showLetterNumber !== false);
    setShowDate(base.showLetterDate !== false);
    setShowAtt(base.showLetterAttachment !== false);
    // null (not undefined) so that the server forgets the saved settings too
    setStaffList((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, letterPrefs: null as unknown as undefined } : u)));
    setCurrentUser((u) => (u.id === currentUser.id ? { ...u, letterPrefs: null as unknown as undefined } : u));
    savedPrefs.current = JSON.stringify(collectLayout());
    showToast('چیدمان نامه به حالت استاندارد برگشت.');
  };

  // Admin: make the current layout (and opening text) the organisation's standard letter template.
  const saveOrgTemplate = (locked: boolean) => {
    // the admin's own saved settings follow the template, otherwise an older personal copy would win over it on the next letter
    const own = collectLayout();
    savedPrefs.current = JSON.stringify(own);
    setStaffList((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, letterPrefs: own } : u)));
    setCurrentUser((u) => (u.id === currentUser.id ? { ...u, letterPrefs: own } : u));
    setSettings({
      ...settings,
      letterTemplate: {
        layout: collectLayout(),
        bodyHtml: editorRef.current?.innerHTML || undefined,
        locked,
        savedBy: currentUser.fullName,
        savedAt: new Date().toISOString(),
      },
    });
    showToast(locked ? 'قالب کلی ثبت شد و برای همهٔ نامه‌ها اجباری است.' : 'قالب کلی سازمان ثبت شد؛ هر نامهٔ جدید از روی آن شروع می‌شود.');
  };
  const removeOrgTemplate = () => {
    const { letterTemplate: _removed, ...rest } = settings;
    setSettings(rest as typeof settings);
    showToast('قالب کلی سازمان برداشته شد.');
  };


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

  // Unified Drag handlers for all draggable elements.
  // A box can be grabbed anywhere on it (not only by its small handle); typing fields and buttons keep working as usual.
  const grab = (handler: (e: React.PointerEvent) => void) => (e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (el.closest('input, textarea, select, button, option, [contenteditable="true"], [data-no-drag]')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    handler(e);
  };

  const handleSignatureMouseDown = (e: React.PointerEvent) => {
    setActiveDragItem('SIGNATURE');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...signatureOffset };
  };

  const handleCenterTitleMouseDown = (e: React.PointerEvent) => {
    setActiveDragItem('CENTER_TITLE');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...headerCenterOffset };
  };

  const handleSubjectMouseDown = (e: React.PointerEvent) => {
    setActiveDragItem('SUBJECT');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...subjectOffset };
  };

  const handleBodyMouseDown = (e: React.PointerEvent) => {
    setActiveDragItem('BODY');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { x: bodyOffsetX, y: 0 };
  };

  const handleMetaMouseDown = (e: React.PointerEvent) => {
    setActiveDragItem('META');
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { ...metaOffset };
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    if (activeDragItem === 'NONE') return;
    const dx = (e.clientX - dragStartPos.current.x) / zoom;
    const dy = (e.clientY - dragStartPos.current.y) / zoom;

    if (activeDragItem === 'SIGNATURE') {
      setSignatureOffset({
        x: Math.max(-250, Math.min(250, dragStartOffset.current.x + dx)),
        y: Math.max(-120, Math.min(120, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'CENTER_TITLE') {
      setHeaderCenterOffset({
        x: Math.max(-260, Math.min(260, dragStartOffset.current.x + dx)),
        y: Math.max(-40, Math.min(140, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'SUBJECT') {
      setSubjectOffset({
        x: Math.max(-300, Math.min(300, dragStartOffset.current.x + dx)),
        y: Math.max(-80, Math.min(180, dragStartOffset.current.y + dy)),
      });
    } else if (activeDragItem === 'BODY') {
      const newX = Math.max(-180, Math.min(180, dragStartOffset.current.x + dx));
      setBodyOffsetX(newX);
    } else if (activeDragItem === 'META') {
      setMetaOffset({
        x: Math.max(-300, Math.min(300, dragStartOffset.current.x + dx)),
        y: Math.max(-80, Math.min(160, dragStartOffset.current.y + dy)),
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
      signatureImgOffsetX: sigImgOffset.x,
      signatureImgOffsetY: sigImgOffset.y,
      stampHeight: stampHeightOverride ?? undefined,
      stampOffsetX: stampOffset.x,
      stampOffsetY: stampOffset.y,
      showSignatureImage: showSigImg ? undefined : false,
      showStampImage: showStampImg ? undefined : false,
      showLetterNumber: showNo ? undefined : false,
      showLetterDate: showDate ? undefined : false,
      showLetterAttachment: showAtt ? undefined : false,
      customFooterNote: settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote,
      bodyOffsetX,
      bodyOffsetY,
      orgOffsetX: orgOffset.x,
      orgOffsetY: orgOffset.y,
      bodyPaddingX,
      attachmentFileName: attachedFile?.name,
      attachmentFileSize: attachedFile?.size,
      attachmentFileDataUrl: attachedFile?.dataUrl,
    });
    onClose();
  };

  const getPageDimensions = () => {
    // Phones: fixed design width (set in style) and the computer paddings; the whole sheet is zoomed to fit.
    if (fitZ.isPhone) return pageSize === 'A5' ? 'min-h-[600px] p-7' : pageSize === 'Letter' ? 'min-h-[720px] p-9' : 'min-h-[760px] p-10';
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
      onPointerMove={handleMouseMove}
      onPointerUp={handleMouseUp}
      onPointerCancel={handleMouseUp}
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
                <h2 className="font-black text-xs sm:text-sm text-white truncate">{isEditing ? 'ویرایش نامه (قبل از امضا)' : 'ویرایشگر و نگارش نامه‌های رسمی اداری'}</h2>
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
        <div onWheel={hwheel} className="bg-white px-3 sm:px-6 py-2 border-b border-[#EBDBCE] flex items-center justify-between gap-2 shrink-0 hscroll text-xs whitespace-nowrap">
          
          {/* Reset the layout to the standard one */}
          <button type="button" onClick={resetLayout} className="px-2.5 py-1.5 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black text-[#3A241F] hover:bg-[#FAF5F1] cursor-pointer shrink-0" title="برگرداندن قلم، اندازه و جای همه‌چیز به حالت استاندارد">
            بازنشانی چیدمان
          </button>
          {/* Save the layout for the next letters */}
          <button
            type="button"
            onClick={saveLayout}
            disabled={!canSaveLayout || !layoutDirty}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black shrink-0 ${
              canSaveLayout && layoutDirty ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer' : 'border-[#EBDBCE] bg-[#FAF5F1] text-[#8C6F66] cursor-default'
            }`}
            title={
              !canSaveLayout
                ? isEditing
                  ? 'در ویرایش نامه، تنظیمات برای نامه‌های بعدی ذخیره نمی‌شود'
                  : 'قالب سازمان قفل است و تنظیمات شخصی ذخیره نمی‌شود'
                : layoutDirty
                  ? 'ذخیرهٔ موقعیت و اندازه‌ها (قلم، سربرگ، امضا، مهر و ...) برای همهٔ نامه‌های بعدی شما'
                  : 'تنظیمات شما ذخیره است و تغییر جدیدی نیست'
            }
          >
            {canSaveLayout && layoutDirty ? 'ذخیرهٔ تنظیمات' : 'تنظیمات ذخیره است'}
          </button>
          <button
            type="button"
            onClick={() => setLayoutLocked((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black shrink-0 flex items-center gap-1 cursor-pointer ${
              layoutLocked ? 'border-amber-600 bg-amber-600 text-white hover:bg-amber-700' : 'border-[#EBDBCE] bg-white text-[#3A241F] hover:bg-[#FAF5F1]'
            }`}
            title={layoutLocked ? 'چیدمان قفل است؛ برای جابه‌جایی دوباره باز کنید' : 'وقتی همه‌چیز سر جایش بود، قفل کنید تا با یک لمس اشتباهی جابه‌جا نشود'}
          >
            {layoutLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            {layoutLocked ? 'چیدمان قفل است' : 'قفل کردن چیدمان'}
          </button>

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

          {/* Organisation letter template: set once by an admin, used by everyone afterwards */}
          {isAdmin ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1 shrink-0">
              <span className="text-[11px] font-black text-emerald-900">
                قالب کلی سازمان: {orgTpl ? (orgTpl.locked ? 'فعال (اجباری)' : 'فعال') : 'ندارد'}
              </span>
              <button type="button" onClick={() => saveOrgTemplate(!!orgTpl?.locked)} className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black cursor-pointer" title="چیدمان و متن فعلی به‌عنوان قالب همهٔ نامه‌ها ذخیره شود">
                ثبت وضعیت فعلی به‌عنوان قالب
              </button>
              <label className="flex items-center gap-1 text-[11px] font-bold text-emerald-900 cursor-pointer" title="اگر فعال باشد، هر نامه همیشه از روی قالب شروع می‌شود و تنظیمات شخصی کاربران نادیده گرفته می‌شود">
                <input type="checkbox" checked={!!orgTpl?.locked} disabled={!orgTpl} onChange={(e) => saveOrgTemplate(e.target.checked)} className="accent-emerald-600" />
                اجباری
              </label>
              {orgTpl && (
                <button type="button" onClick={removeOrgTemplate} className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">
                  برداشتن
                </button>
              )}
            </div>
          ) : orgTpl ? (
            <span className="text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1 shrink-0">
              قالب سازمان اعمال شده است{orgTpl.locked ? ' (اجباری)' : ''}
            </span>
          ) : null}
        </div>

        {/* Word Styling Toolbar: one horizontally scrollable row on phones */}
        <div onWheel={hwheel} className="flex bg-[#FAF5F1] px-3 sm:px-6 py-1.5 sm:py-2 border-b border-[#EBDBCE] flex-nowrap hscroll whitespace-nowrap items-center justify-between gap-2 shrink-0 text-xs [&>*]:shrink-0">
          
          <div className="flex items-center gap-1.5 flex-nowrap sm:flex-wrap">
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

            <div className="flex items-center gap-3 border-r border-amber-300/80 pr-2 mr-1 text-[10px] font-bold text-amber-950">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showSigImg} onChange={(e) => setShowSigImg(e.target.checked)} className="accent-amber-700" />
                درج امضا
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showStampImg} onChange={(e) => setShowStampImg(e.target.checked)} className="accent-amber-700" />
                درج مهر
              </label>
            </div>

            <div className="flex items-center gap-3 border-r border-amber-300/80 pr-2 mr-1 text-[10px] font-bold text-amber-950">
              <span>نمایش عنوان در سربرگ:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showNo} onChange={(e) => setShowNo(e.target.checked)} className="accent-amber-700" />
                شماره
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} className="accent-amber-700" />
                تاریخ
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={showAtt} onChange={(e) => setShowAtt(e.target.checked)} className="accent-amber-700" />
                پیوست
              </label>
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

            <div className="flex items-center gap-1.5 border-r border-amber-300/80 pr-2 mr-1">
              <span className="text-[10px] font-bold text-amber-950">سایز مهر:</span>
              <input
                type="range"
                min="20"
                max="600"
                value={effectiveStampHeight}
                onChange={(e) => setStampHeightOverride(Number(e.target.value))}
                className="w-20 accent-amber-700 cursor-pointer"
                title="تنظیم اندازهٔ مهر"
              />
              <span className="font-mono text-[10px] font-bold text-amber-800 w-8">{toPersianDigits(effectiveStampHeight)}px</span>
              <button
                type="button"
                onClick={() => {
                  setSigImgOffset({ x: 0, y: 0 });
                  setStampOffset({ x: 0, y: 0 });
                  setStampHeightOverride(null);
                }}
                className="text-[10px] font-bold text-amber-800 hover:underline cursor-pointer"
                title="بازگرداندن جای امضا و مهر به حالت اولیه"
              >
                بازنشانی
              </button>
            </div>
          </div>
        </div>

        {/* Main Document Workspace Canvas */}
        {fitZ.isPhone && <ZoomBar zoom={zoom} onIn={fitZ.zoomIn} onOut={fitZ.zoomOut} onFit={fitZ.reset} />}
        <div className={`flex-1 overflow-auto ${fitZ.isPhone ? 'p-2 block' : 'p-4 sm:p-8 flex justify-center'} bg-[#E5DCD2]/60`}>
          
          {/* Virtual Paper Sheet */}
          <ScaledPaper enabled={fitZ.isPhone} width={(({ A4: 720, A5: 580, Letter: 700, Letterhead: 740 } as Record<string, number>)[pageSize] ?? 720)} zoom={zoom}>
          <div
            ref={paperSheetRef}
            style={{ fontFamily: selectedFontFamily }}
            className={`bg-white official-letter-sheet rounded-xl shadow-2xl border border-[#C98B6A]/30 w-full transition-all text-[#3A241F] flex flex-col justify-between relative ${getPageDimensions()}`}
          >
            {/* Header Component */}
            <div className="pb-2 mb-4 space-y-3 shrink-0">
              <div className="relative flex items-start justify-between">
                {/* Right: Company Info & Dynamic Logo */}
                <MoveBox offset={orgOffset} onChange={setOrgOffset} locked={layoutLocked} scale={zoom} className={`space-y-1 min-w-0 ${pageSize === 'A5' ? 'max-w-[36%]' : 'max-w-[38%]'}`}>
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
                </MoveBox>

                {/* Center: Official Title (Strictly Centered & Vertically Draggable Only) */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10"
                  style={{ top: '8px' }}
                >
                  <MoveBox offset={headerCenterOffset} onChange={setHeaderCenterOffset} locked={layoutLocked} scale={zoom} className="group/title relative flex items-center gap-1.5 px-2.5 py-1">
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
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-20 opacity-0 group-hover/title:opacity-100 transition-opacity">
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
                  </MoveBox>
                </div>

                {/* Left: Metadata (Date, Number, Attachment) - Exactly Stacked Vertically & Aligned */}
                <MoveBox
                  offset={metaOffset}
                  onChange={setMetaOffset}
                  locked={layoutLocked}
                  scale={zoom}
                  dir="rtl"
                  style={{ fontFamily: metaFontFamily }}
                  className="text-[11px] font-medium text-[#3A241F] relative group/meta select-none shrink-0 p-2 -m-2"
                >
                  <div className="flex items-center gap-1 absolute -top-5 left-0 opacity-60 group-hover/meta:opacity-100 transition-opacity z-10">
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
                    <span className="text-[#8C6F66] font-bold text-right shrink-0">{showNo ? 'شماره:' : ''}</span>
                    <input
                      type="text"
                      value={letterNumber}
                      onChange={(e) => setLetterNumber(toPersianDigits(e.target.value))}
                      placeholder="شماره نامه"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />

                    <span className="text-[#8C6F66] font-bold text-right shrink-0">{showDate ? 'تاریخ:' : ''}</span>
                    <input
                      type="text"
                      value={customDate}
                      onChange={(e) => setCustomDate(toPersianDigits(e.target.value))}
                      placeholder="تاریخ نامه"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />

                    <span className="text-[#8C6F66] font-bold text-right shrink-0">{showAtt ? 'پیوست:' : ''}</span>
                    <input
                      type="text"
                      value={attachment}
                      onChange={(e) => setAttachment(e.target.value)}
                      placeholder="پیوست"
                      style={{ fontFamily: metaFontFamily }}
                      className="font-bold text-[#3A241F] bg-transparent border-b border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none w-28 text-right text-[11px] px-0.5"
                    />

                  </div>
                </MoveBox>
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
              <MoveBox
                offset={subjectOffset}
                onChange={setSubjectOffset}
                locked={layoutLocked}
                scale={zoom}
                style={{ fontFamily: subjectFontFamily }}
                className="pt-2 flex items-center gap-2 text-xs font-bold relative group/subj"
              >
                <span className="text-[#6E1B1B] shrink-0 font-black">موضوع نامه:</span>
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
              </MoveBox>
            </div>

            {/* Editable Letter Body (Word contentEditable) with Drag & Margin */}
            <MoveBox
              offset={{ x: bodyOffsetX, y: bodyOffsetY }}
              onChange={(o) => {
                setBodyOffsetX(o.x);
                setBodyOffsetY(o.y);
              }}
              locked={layoutLocked}
              scale={zoom}
              className="relative flex flex-col group/body p-3 -m-3"
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                style={{
                  fontFamily: selectedFontFamily,
                  fontSize: selectedFontSize,
                  lineHeight: 2.2,
                  textAlign: 'justify',
                  paddingLeft: `${bodyPaddingX}px`,
                  paddingRight: `${bodyPaddingX}px`,
                }}
                className="focus:outline-none min-h-[160px] leading-relaxed space-y-3 transition-transform"
                dangerouslySetInnerHTML={{ __html: initialBody }}
              />
            </MoveBox>

            {/* CEO NAME / TITLE (font + size beside the text). Signature image and stamp are independent objects. */}
            <div className={`${pageSize === 'A5' ? 'mt-4 pt-1 min-h-[90px]' : 'mt-8 pt-2 min-h-[140px]'} flex justify-end items-end relative`}>
              <div
                className={`text-center ${pageSize === 'A5' ? 'w-[170px] min-w-[170px]' : 'w-[220px] min-w-[220px]'} flex flex-col items-center relative select-none`}
              >
                {/* Name & title with only font and size controls */}
                <MoveBox offset={signatureOffset} onChange={setSignatureOffset} locked={layoutLocked} scale={zoom} className="relative w-fit max-w-full p-2">
                  <div className="min-w-0 space-y-0.5 flex flex-col items-center">
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="نام مدیرعامل"
                      style={{ fontFamily: signerFontFamily, fontSize: `${signerFontSize}px`, lineHeight: pageSize === 'A5' ? 1.5 : 1.6, fieldSizing: 'content', minWidth: '4ch' } as React.CSSProperties}
                      className="font-black text-center text-[#1a1a1a] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none max-w-full px-1"
                      title="نام مدیرعامل / امضاکننده (قابل ویرایش مستقیم)"
                    />
                    <input
                      type="text"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      placeholder="سمت سازمانی"
                      style={{ fontFamily: signerFontFamily, fontSize: `${Math.max(14, signerFontSize - 2)}px`, lineHeight: pageSize === 'A5' ? 1.5 : 1.6, fieldSizing: 'content', minWidth: '4ch' } as React.CSSProperties}
                      className="text-center text-[#71554C] bg-transparent border-b border-dashed border-transparent hover:border-[#C98B6A] focus:border-[#6E1B1B] focus:outline-none max-w-full px-1 font-medium"
                      title="سمت سازمانی امضاکننده (قابل ویرایش مستقیم)"
                    />
                  </div>

                  <div className="absolute top-0 left-full ml-1.5 flex flex-col items-stretch gap-0.5">
                    <select
                      value={signerFontFamily}
                      onChange={(e) => setSignerFontFamily(e.target.value)}
                      className="bg-white border border-amber-300 text-[9px] text-amber-900 rounded px-1 py-0.5 focus:outline-none cursor-pointer font-sans max-w-[70px] truncate"
                      title="انتخاب فونت"
                    >
                      {fonts.map((f) => (
                        <option key={f.id} value={f.fontFamily}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-between bg-white border border-amber-300 rounded px-1 py-0.5" title="سایز فونت">
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
                </MoveBox>

                {/* Signature image & stamp: free objects, independent of the name/title and of each other */}
                <div
                  className="w-full relative my-1"
                  style={{ height: `${signatureAreaHeight(pageSize === 'A5', pageSize === 'A5' ? Math.min(signatureHeight, 300) : signatureHeight, effectiveStampHeight)}px` }}
                >
                  {settings.ceoSignatureUrl && showSigImg ? (
                    <DraggableImage
                      src={settings.ceoSignatureUrl}
                      alt="امضا"
                      height={pageSize === 'A5' ? Math.min(signatureHeight, 300) : signatureHeight}
                      offset={sigImgOffset}
                      editable={!layoutLocked}
                      onOffsetChange={setSigImgOffset}
                      onHeightChange={setSignatureHeight}
                      anchorLeft={SIGNATURE_ANCHOR_LEFT}
                      scale={zoom}
                      opacityClass="opacity-90"
                    />
                  ) : null}
                  {settings.companyStampUrl && showStampImg ? (
                    <DraggableImage
                      src={settings.companyStampUrl}
                      alt="مهر"
                      height={effectiveStampHeight}
                      offset={stampOffset}
                      editable={!layoutLocked}
                      onOffsetChange={setStampOffset}
                      onHeightChange={setStampHeightOverride}
                      anchorLeft={STAMP_ANCHOR_LEFT}
                      scale={zoom}
                      opacityClass="opacity-85"
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

            {/* Official Letter Footer */}
            {(settings.showFooterNote !== false && settings.letterNumbering?.showFooterNote !== false) && (
              <div className="mt-auto pt-4 text-[10px] text-[#8C6F66] flex items-center justify-between shrink-0">
                <div>
                  تنظیم‌کننده: <b>{currentUser.fullName}</b> ({currentUser.departmentName}) • شماره: <span className="font-mono text-[#3A241F]">{letterNumber}</span>
                </div>
                <div className="text-[#8C6F66]">
                  {settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری'}
                </div>
              </div>
            )}
          </div>
          </ScaledPaper>
        </div>

        {/* Bottom Submission Bar */}
        <form
          onSubmit={handleSubmit}
          className="bg-white px-3 sm:px-6 py-2.5 sm:py-3 border-t border-[#EBDBCE] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0"
        >
          <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto flex-wrap min-w-0">
            <div className="flex items-center gap-2 w-full sm:w-auto min-w-0">
              <label className="text-xs font-bold text-[#3A241F] shrink-0">ارسال به:</label>
              <select
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="flex-1 sm:flex-initial min-w-0 px-3 py-2 sm:py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none cursor-pointer"
              >
                {signers.map((u) => (
                  <option key={u.id} value={u.id}>
                    ★ {u.fullName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNote((v) => !v)}
                className="sm:hidden shrink-0 px-2.5 py-2 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black text-[#3A241F] cursor-pointer"
              >
                {showNote ? 'بستن توضیح' : '+ توضیح'}
              </button>
              {signers.length === 0 && (
                <span className="text-[11px] font-bold text-rose-600">صاحب امضایی تعریف نشده است.</span>
              )}
            </div>

            <input
              type="text"
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              placeholder="توضیحات اختیاری ضمیمه جهت استحضار مدیر..."
              className={`${showNote ? 'block' : 'hidden'} sm:block px-3 py-2 sm:py-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:outline-none flex-1 min-w-0 sm:min-w-[260px] w-full sm:w-auto`}
            />
          </div>

          <div className="flex items-center gap-2 sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 sm:px-4 py-2.5 sm:py-2 text-xs font-bold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl transition-all cursor-pointer shrink-0"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!signers.some((u) => u.id === recipientId)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black sm:font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              <Stamp className="w-4 h-4" />
              <span className="sm:hidden">{isEditing ? 'ذخیرهٔ ویرایش' : 'ثبت و ارسال جهت امضا'}</span>
              <span className="hidden sm:inline">{isEditing ? 'ذخیرهٔ ویرایش نامه (قبل از امضا)' : 'ثبت و ارسال نامه رسمی جهت امضای مدیر'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
