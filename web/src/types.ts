export type UserRole = 'SUPER_ADMIN' | 'DEPT_ADMIN' | 'STAFF';

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string;
  defaultQuotaGB: number;
  /** The manager of the unit: what the unit's people do in the automation comes to this person. */
  managerId?: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  password?: string;
  avatarUrl: string;
  avatarInitials: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  storageQuotaGB: number;
  storageUsedGB: number;
  isActive: boolean;
  lastLogin: string;
  canSendOfficialLetters?: boolean;
  canSignOfficialLetters?: boolean;
  /** Access to the task-management menu (super/department admins always have it). */
  canUseTasks?: boolean;
  /** Access to the customer (CRM) menu; admins always have it. */
  canUseCrm?: boolean;
  /** Warranty menu (also open to everybody who works with customers). */
  canUseWarranty?: boolean;
  /** The admin allowed this person to send SMS to customers (admins always may). */
  canSendSms?: boolean;
  /** the warehouse module (admins always have it) */
  canUseWarehouse?: boolean;
  /** Sees every customer, opportunity and follow-up of the team (otherwise only their own). Administrators always do. */
  canSeeTeamCrm?: boolean;
  /** with «مشتریان همکاران»: only the customers of these colleagues are added to the person's own (empty = every colleague) */
  crmTeamIds?: string[];
  /** customers (ids) this person may work with in addition to his own, picked by an administrator */
  crmCustomerIds?: string[];
  /** warehouses (ids) this person works with (none = every warehouse) */
  whWarehouseIds?: string[];
  /** single products picked for this person, each with what may be seen of it: the stock (qty) and the price */
  whProducts?: { id: string; qty: boolean; price: boolean }[];
  /** a sales representative («نماینده فروش»): works on his own with his own customers and only with the people named in agentContactIds (and the managing director); his only correspondence is an internal letter to the managing director */
  isAgent?: boolean;
  agentContactIds?: string[];
  /** an employee (subordinate) of a sales representative: the id of that representative; he sees only his agent, the agent's other employees and the managing director */
  agentOwnerId?: string;
  /** sees a pop-up for every incoming call of the company, not only the calls of the own extension */
  canSeeAllCalls?: boolean;
  /** what the person may ask of the accounting program (Sepidar): view, customer, quotation, invoice, receipt */
  sepidarPerms?: string[];
  /** sub-menus the administrator switched off for this person (see lib/permissions.ts); everything else of the menus they may enter is open */
  hiddenSub?: string[];
  /** the warehouse product groups the person may see (none = every group) */
  whGroups?: string[];
  /** Access to the management statistics page (admins always have it). */
  canViewStats?: boolean;
  /** May publish on the bulletin board (admins always may). */
  canPostAnnouncements?: boolean;
  /** Phone extension on the company phone system (for incoming-call pop-ups and click-to-call). */
  extension?: string;
  /** more extensions of the same person (a desk phone and a softphone…), besides the main one */
  extensions?: string[];
  /** Mobile number for SMS notifications (optional). */
  mobile?: string;
  /** more phone numbers of the same person, besides the main mobile */
  mobiles?: string[];
  /** The user's own letter-editor settings (fonts, sizes, positions...), restored every time the editor opens. */
  letterPrefs?: Record<string, unknown>;
  themeId?: string;
}

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TaskComment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export type ReportItemStatus = 'DONE' | 'IN_PROGRESS' | 'BLOCKED';

export interface DailyReportItem {
  id: string;
  text: string;
  taskId?: string;
  /** Time spent, in hours. */
  hours?: number;
  status: ReportItemStatus;
}

export interface DailyReport {
  id: string;
  userId: string;
  authorName: string;
  /** Report day as yyyy-mm-dd. */
  date: string;
  summary: string;
  items: DailyReportItem[];
  blockers: string;
  tomorrow: string;
  recipientIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';
export type DealStage = 'NEW' | 'CONTACTED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type ActivityType = 'NOTE' | 'CALL' | 'MEETING' | 'FOLLOWUP' | 'MISSING' | 'QUOTE';

/** A file kept on a customer's page (contract, payment slip, photo). The bytes are on the server; this is its entry in the list. */
export interface CustomerFile {
  id: string;
  name: string;
  size: number;
  type: string;
  at: string;
  byId: string;
  byName: string;
}

export interface Customer {
  id: string;
  name: string;
  /** phone-book entries that are NOT customers (supplier, colleague, agent, other); empty = a customer of the CRM */
  contactType?: 'SUPPLIER' | 'COLLEAGUE' | 'AGENT' | 'OTHER';
  /** sales representatives (user ids) the administrator showed this customer to: they see the name only, no number or address, and can press «call» */
  agentViewerIds?: string[];
  /** the page got this customer without numbers and address (shown to a representative): only the call button works */
  hiddenContact?: boolean;
  /** What Sepidar keeps about the customer (credit ceiling, discount rate, groups, black list…): only used where Hoormand is connected to Sepidar. */
  sepidarInfo?: Record<string, string>;
  /** Files kept on the customer's page. */
  attachments?: CustomerFile[];
  /** Set when the customer opened the company bot (Telegram / Bale) with his link. */
  telegramChatId?: string;
  baleChatId?: string;
  company?: string;
  /** Real person (default) or legal entity. */
  kind?: 'PERSON' | 'COMPANY' | 'SHOP';
  // --- shop («SHOP»): the shop's name is name / company; the owner is firstName / lastName
  /** What the shop sells or does (guild / line of business). */
  shopType?: string;
  /** Business licence (پروانهٔ کسب) or guild number. */
  licenseNumber?: string;
  // --- real person
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  nationalCode?: string;
  idNumber?: string;
  /** ISO date (Gregorian), shown in the Persian calendar. */
  birthDate?: string;
  gender?: 'M' | 'F';
  // --- legal entity
  companyType?: string;
  /** شناسه ملی (11 digits) */
  nationalId?: string;
  economicCode?: string;
  registrationNumber?: string;
  registrationDate?: string;
  repName?: string;
  repPosition?: string;
  repMobile?: string;
  /** more representatives / contact people of the company, besides the first one above */
  reps?: { name: string; position?: string; mobile?: string }[];
  // --- address
  province?: string;
  city?: string;
  postalCode?: string;
  website?: string;
  /** Who introduced this customer (for marketing figures). */
  referrer?: { kind: 'CUSTOMER' | 'STAFF' | 'OTHER'; id?: string; name: string; phone?: string };
  /** Every mobile and landline number, unlimited (mobiles start with 09). The main number comes first. */
  phones: string[];
  /** The one landline that is a fax machine. */
  faxNumber?: string;
  /** What the customer is looking for (product, kind, budget…). */
  interest?: string;
  email?: string;
  address?: string;
  status: CustomerStatus;
  source?: string;
  tags: string[];
  ownerId: string;
  ownerName: string;
  notes?: string;
  /** the notes paragraph by paragraph, each with its time and writer (`notes` keeps the same text joined by new lines) */
  noteLog?: NoteEntry[];
  /** virtual interactions per network (bale, eitaa, rubika, instagram, whatsapp, whatsappBusiness, telegram) */
  social?: Record<string, SocialEntry>;
  createdAt: string;
  updatedAt: string;
}

/** A ready-made message for customers: a text ({name} = the customer's name), a link and a file kept on the server (sent as a public download link). */
export interface CustomerMsgTemplate {
  id: string;
  title: string;
  text: string;
  link?: string;
  fileId?: string;
  fileName?: string;
}

/** What a customer has on one social network: switched on, his accounts there, and how many times we were in touch. */
export interface SocialEntry {
  on: boolean;
  accounts: string[];
  count: number;
}

/** What a customer has on one social network: switched on, his accounts there, and how many times we were in touch. */
export interface SocialEntry {
  on: boolean;
  accounts: string[];
  count: number;
}

/** One paragraph of a record's notes: when it was written (date, hour, minute) and by whom. */
export interface NoteEntry {
  text: string;
  at: string;
  byId: string;
  byName: string;
  editedAt?: string;
  editedByName?: string;
  /** only while it is being typed (not locked with Enter yet) */
  draft?: boolean;
}

export interface Deal {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  /** کد کالا: the code of the product / service this opportunity is about. */
  productCode?: string;
  /** Amount in Toman. */
  amount: number;
  stage: DealStage;
  ownerId: string;
  ownerName: string;
  /** More people in charge of the same deal (besides the main owner). */
  coOwnerIds?: string[];
  coOwnerNames?: string[];
  /** Who created the opportunity (set by the server once; older opportunities have none). */
  createdById?: string;
  createdByName?: string;
  /** True when the creator was filled in later from the main owner (the real creator was not recorded). */
  createdByGuess?: boolean;
  /** opportunities that were written together share this id (they are shown as linked) */
  groupId?: string;
  /** the place of the opportunity inside its group (1, 2, 3... in the order they were written) */
  groupSeq?: number;
  /** Expected closing day, yyyy-mm-dd. */
  expectedClose?: string;
  /** The hour and minute of the expected closing, «HH:MM» (empty = the time the opportunity was created at); a reminder comes at that moment. */
  expectedCloseTime?: string;
  notes?: string;
  /** the notes paragraph by paragraph, each with its time and writer (`notes` keeps the same text joined by new lines) */
  noteLog?: NoteEntry[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  /** Why the opportunity was lost (required when the stage is «از دست رفت»). */
  lostReason?: string;
  lostNote?: string;
  /** Proforma invoice (created when the deal reaches «پیشنهاد ارسال شد»). */
  items?: ProformaItem[];
  discountPercent?: number;
  taxPercent?: number;
  proformaNumber?: string;
  /** Which company issues the proforma («main» = the organisation itself, else the id of a ProformaIssuer). */
  proformaIssuerId?: string;
  /** CEO approval of the proforma (kept by the server when the approval setting is on). */
  proformaApproval?: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedBy?: string;
    requestedByName?: string;
    requestedAt?: string;
    decidedBy?: string;
    decidedByName?: string;
    decidedAt?: string;
    note?: string;
  };
  /** Issue day and last valid day, yyyy-mm-dd. */
  proformaAt?: string;
  /** Texts typed in by hand when the proforma was made (override the defaults from settings and the customer). */
  proformaFields?: ProformaFields;
  validUntil?: string;
  terms?: string;
}

export interface NotifyRule {
  /** Off = this event (or kind) never shows or sounds. */
  enabled?: boolean;
  /** A built-in sound id, «custom:<id>» for an uploaded one, «none» for silence, or «inherit» (events only). */
  sound?: string;
  popup?: boolean;
  /** System (OS) notification while the window is behind others. */
  os?: boolean;
  /** Push to phones when the app is closed. */
  push?: boolean;
}

/** How notifications look and sound in the whole organisation (set by an admin). */
export interface NotifySettings {
  enabled?: boolean;
  volume?: number;
  popupSeconds?: number;
  /** show the pop-ups one at a time, each with a countdown, the next one starts when the one before is closed or opened (default on) */
  popupQueue?: boolean;
  /** the pop-ups of the other notifications stay until they are closed (no timer) */
  popupFixed?: boolean;
  /** an incoming-call pop-up stays until the call ends but at most this many seconds (0 = until the call ends, no limit; default 120) */
  callPopupSeconds?: number;
  quiet?: { enabled: boolean; from: string; to: string };
  kinds?: Partial<Record<'file' | 'letter' | 'task' | 'alert' | 'call' | 'chat', NotifyRule>>;
  events?: Record<string, NotifyRule>;
}

export interface ProformaFields {
  title?: string;
  subject?: string;
  sellerName?: string;
  sellerAddress?: string;
  sellerPhone?: string;
  sellerEconomicCode?: string;
  buyerName?: string;
  buyerCompany?: string;
  buyerPhones?: string;
  buyerAddress?: string;
  buyerEmail?: string;
  bankInfo?: string;
  footerText?: string;
  /** Official (tax) details; printed on proformas of an official issuer. */
  sellerNationalId?: string;
  sellerRegistrationNumber?: string;
  sellerPostalCode?: string;
  buyerNationalId?: string;
  buyerEconomicCode?: string;
  buyerPostalCode?: string;
  sellerProvince?: string;
  sellerCounty?: string;
  sellerCity?: string;
  buyerProvince?: string;
  buyerCounty?: string;
  buyerCity?: string;
  /** نقدی / غیرنقدی on the official form (default cash). */
  paymentType?: 'CASH' | 'CREDIT';
  /** Untick to leave the company stamp / the signature scan off this proforma (default: shown). */
  showStamp?: boolean;
  showSignature?: boolean;
}

export interface ProformaItem {
  title: string;
  /** شناسه کالا / خدمت (required on an official proforma) */
  code?: string;
  description?: string;
  qty: number;
  unit?: string;
  /** Toman. */
  unitPrice: number;
  /** Fixed discount on this row, Toman. */
  discount?: number;
}

export type ProformaSectionId = 'meta' | 'parties' | 'items' | 'totals' | 'terms' | 'signatures';
export type ProformaHeaderItem = 'logo' | 'company' | 'title';

/** How proforma invoices look; designed by an admin with drag and drop. */
export interface ProformaTemplate {
  presetId: string;
  colors: { primary: string; accent: string; tableHead: string; tableHeadText: string; paper: string; soft: string; text: string };
  headerStyle: 'band' | 'plain' | 'boxed';
  /** Left-to-right order in the RTL header: the first item is at the right edge. */
  headerOrder: ProformaHeaderItem[];
  /** Logo for proformas only; empty = the organisation logo. */
  logoUrl?: string;
  /** Logo height in mm. */
  logoSize: number;
  showLogo: boolean;
  contact: { address: boolean; phone: boolean; economicCode: boolean; website: boolean };
  title: string;
  titleEn: string;
  sections: { id: ProformaSectionId; visible: boolean }[];
  tableStyle: 'striped' | 'lined' | 'grid';
  radius: number;
  fontSize: number;
  totalsAlign: 'start' | 'end';
  footerText: string;
  showFooterContact: boolean;
  /** Invoice number pattern: {YYYY} Jalali year, {YY} two digits, {NNNN} running number (as many N as digits). */
  numberFormat: string;
  /** The running number of the first invoice. */
  numberStart: number;
}

export interface CrmActivity {
  id: string;
  customerId: string;
  dealId?: string;
  type: ActivityType;
  text: string;
  /** «MISSING»: the product the customer asked for and the shop did not have (feeds the missing-products report). */
  itemName?: string;
  qty?: number;
  /** «QUOTE»: a price given to the customer without a proforma. productId / productCode tie it to the warehouse's product. */
  productId?: string;
  productCode?: string;
  spec?: string;
  /** The price the company gave (Toman, per unit) and the price the customer wished for. */
  price?: number;
  askedPrice?: number;
  unit?: string;
  /** Follow-ups: the day it is due, yyyy-mm-dd. */
  dueDate?: string;
  done?: boolean;
  doneAt?: string;
  /** Whose follow-up it is. */
  ownerId: string;
  ownerName: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface OrgLetterTemplate {
  /** Fonts, sizes, page size, header title, margins and the positions of signature / stamp. */
  layout: Record<string, unknown>;
  /** Standard opening text of a new letter (optional). */
  bodyHtml?: string;
  /** When true every letter starts from this template and personal editor settings are ignored. */
  locked?: boolean;
  savedBy?: string;
  savedAt?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  creatorId: string;
  creatorName: string;
  assigneeIds: string[];
  /** more people told when the task is sent for review («در انتظار بررسی»), besides its creator */
  reviewerIds?: string[];
  /** Due date as yyyy-mm-dd. */
  dueDate?: string;
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** finished work put away: seen only by the top admin and the people who had a part in it */
  archived?: boolean;
  /** files kept on the task (PDF, pictures…); the bytes are on the server */
  attachments?: CustomerFile[];
}

export interface LetterReferral {
  id: string;
  fromUser: User;
  toUser: User;
  date: string;
  comment: string;
}

export type FileCategory = 'doc' | 'sheet' | 'pdf' | 'word' | 'image' | 'video' | 'zip' | 'code';

export interface FileItem {
  id: string;
  name: string;
  extension: string;
  size: string;
  sizeBytes: number;
  category: FileCategory;
  lastModified: string;
  owners: {
    name: string;
    avatarUrl: string;
    initials: string;
  }[];
  isStarred?: boolean;
  isTrashed?: boolean;
  folderId?: string;
  downloadUrl?: string;
  sharedWithCount?: number;
}

export interface QuickAccessFolder {
  id: string;
  title: string;
  categoryLabel?: string;
  sharedWith: {
    name: string;
    avatarUrl: string;
    initials: string;
  }[];
  isActiveFolder?: boolean;
  lastModified?: string;
  isProjectDoc?: boolean;
}

export type TransferStatus = 'PENDING' | 'DELIVERED' | 'DOWNLOADED' | 'EXPIRED';

export interface FileTransfer {
  id: string;
  /** The system administrator removed the file from the server (the history stays). */
  fileDeletedAt?: string;
  fileDeletedByName?: string;
  fileDeletedReason?: string;
  /** The administrator marked this file «keep» (the retention period does not delete it). */
  keepForever?: boolean;
  fileId: string;
  fileName: string;
  fileSize: string;
  category: FileCategory;
  sender: User;
  recipients: User[];
  note?: string;
  letterContentHtml?: string;
  letterNumber?: string;
  pageSize?: string;
  status: TransferStatus;
  sentAt: string;
  expiresAt: string;
  downloadsCount: number;
  maxDownloads?: number;
  isEncrypted?: boolean;
  fileDataUrl?: string;
  isOfficialLetter?: boolean;
  signatureStatus?: 'PENDING_SIGNATURE' | 'SIGNED' | 'REJECTED';
  signedBy?: string;
  signedAt?: string;
  signatureComment?: string;
  signatureImageUrl?: string;
  companyStampImageUrl?: string;
  referrals?: LetterReferral[];
  isArchived?: boolean;
  /** received files: the people who put it in their own archive (each person's archive is theirs only) */
  archivedBy?: string[];
  archivedAt?: string;
  /** Set when the author edited the letter before it was signed. */
  editedAt?: string;
  signatureHeight?: number;
  signatureOffsetX?: number;
  signatureOffsetY?: number;
  // Signature image and stamp can each be moved independently of the name/title block (px)
  signatureImgOffsetX?: number;
  signatureImgOffsetY?: number;
  stampHeight?: number; // اندازهٔ مهر (اگر خالی باشد متناسب با امضا)
  logoSize?: number; // اندازهٔ لوگو در سربرگ نامه (پیکسل)
  logoOffsetX?: number;
  logoOffsetY?: number;
  orgTextOffsetX?: number;
  orgTextOffsetY?: number;
  orgTextScale?: number; // ضریب اندازهٔ نام و عنوان سازمان در سربرگ نامه
  stampOffsetX?: number;
  stampOffsetY?: number;
  /** Untick to leave the signature scan / the stamp off this letter (default: shown). */
  showSignatureImage?: boolean;
  showStampImage?: boolean;
  /** Untick to leave the title («شماره:», «تاریخ:», «پیوست:») out of the letter header while its value stays, e.g. on letterhead paper that already has the titles printed (default: shown). */
  showLetterNumber?: boolean;
  showLetterDate?: boolean;
  showLetterAttachment?: boolean;
  /** the company logo in the letterhead (false = hidden) */
  showLogo?: boolean;
  /** the organisation name and subtitle beside the logo (false = hidden) */
  showOrgName?: boolean;
  /** the subject line of the letter (false = hidden) */
  showSubject?: boolean;
  headerCenterOffsetX?: number;
  headerCenterOffsetY?: number;
  subjectOffsetX?: number;
  subjectOffsetY?: number;
  metaOffsetX?: number;
  footerNoteOffsetX?: number;
  metaOffsetY?: number;
  footerNoteOffsetY?: number;
  headerCenterFontFamily?: string;
  subjectFontFamily?: string;
  metaFontFamily?: string;
  letterFontFamily?: string;
  signerFontFamily?: string;
  signerFontSize?: number;
  customSignerName?: string;
  customSignerTitle?: string;
  bodyOffsetX?: number;
  bodyOffsetY?: number;
  /** Where the logo + organisation name box sits (px from its own place). */
  orgOffsetX?: number;
  orgOffsetY?: number;
  bodyPaddingX?: number;
  /** small layout settings of the letter: the gap between the lines of «شماره / تاریخ / پیوست» and the name under the stamp and signature */
  fx?: LetterFx;
  customHeaderNumber?: string;
  customHeaderDate?: string;
  customHeaderAttachment?: string;
  customHeaderSubject?: string;
  customHeaderCompanyTitle?: string;
  customHeaderCompanySubtitle?: string;
  customHeaderCenterTitle?: string;
  customFooterNote?: string;
  /** names the letter is copied to («رونوشت»); printed at the bottom above the address line */
  copyTo?: string[];
  /** The ready-made letterhead (decoration, address and phone in the footer) chosen for an official letter on the «سربرگ رسمی با آرم» paper. */
  letterhead?: import('./lib/letterheads').LetterheadChoice;
  showFooterNote?: boolean;
  attachmentFileName?: string;
  attachmentFileSize?: string;
  attachmentFileDataUrl?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  message?: string;
  timestamp: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS' | 'TRANSFER_RECEIVED' | 'TRANSFER_DOWNLOADED' | 'QUOTA_ALERT' | 'SYSTEM';
  isRead: boolean;
  link?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userName: string;
  userEmail: string;
  action: string | 'LOGIN' | 'LOGOUT' | 'FILE_UPLOAD' | 'FILE_DOWNLOAD' | 'FILE_TRANSFER' | 'FILE_DELETE' | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE' | 'DEPARTMENT_CHANGE' | 'QUOTA_UPDATE' | 'QUOTA_CHANGE' | 'PERMISSION_CHANGE' | 'ADMIN_SETTING_CHANGE' | 'SETTINGS_UPDATE' | 'SECURITY_EVENT' | 'CEO_CHANGE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  ipAddress: string;
  /** what the server itself saw as the sender (the router's address when it rewrites the sender) */
  ipSeen?: string;
  /** 'browser' = ipAddress is the public address the person's browser reported */
  ipVia?: string;
  details: string;
}

export interface LetterNumberingSettings {
  prefix: string; // پیشوند سازمانی (مثال: "۱۰" یا "ات")
  nextNumber: number; // شماره بعدی اندیکاتور (مثال: 1001)
  incrementStep?: number; // گام افزایش خودکار پلکانی (مثال: 1 یا 5)
  year: string; // سال صدور (مثال: "1404" یا "1405")
  formatPattern: string; // a token list such as 'P_Y_N' (see lib/letterNumbering.ts); the older names like 'PREFIX_YEAR_NUM' still work
  requireAttachmentForFinancial?: boolean;
  allowUniversalReferral?: boolean;
  defaultFooterNote?: string;
  showFooterNote?: boolean;
  /** put the Persian month number (۰۱ … ۱۲) after the year; it changes by itself every month */
  includeMonth?: boolean;
  /** what stands between the parts of the number: «/» (default) or «-» */
  separator?: '/' | '-';
}

export interface CustomFont {
  id: string;
  name: string;
  fontFamily: string;
  fileName?: string;
  format?: 'truetype' | 'woff' | 'woff2' | 'opentype';
  dataUrl?: string;
  isDefault?: boolean;
  uploadedAt?: string;
  sizeBytes?: number;
}

export interface SystemSettings {
  companyName?: string; // نام رسمی شرکت / سازمان
  companySubtitle?: string; // عنوان فرعی سربرگ اداری
  /** Name printed on proforma invoices (falls back to companyName). */
  proformaCompanyName?: string;
  notifySettings?: NotifySettings;
  proformaTemplate?: ProformaTemplate;
  /** numbering, printed look and the sorts of meeting minutes */
  minutesConfig?: MinutesConfig;
  companyAddress?: string;
  companyPhone?: string;
  companyEconomicCode?: string;
  companyWebsite?: string;
  /** A proforma may be sent only after the CEO approved it (the CEO's stamp and signature are then put on it automatically). */
  proformaApprovalRequired?: boolean;
  /** Sent files older than this many days are removed from the server (0 = keep). Files marked «keep» stay. */
  fileRetentionDays?: number;
  /** Who approves (and so stamps and signs) the official company's proformas; empty = anyone who may sign letters. */
  proformaApproverId?: string;
  /** Official identity of the main company (tax invoices). */
  companyNationalId?: string;
  companyRegistrationNumber?: string;
  companyPostalCode?: string;
  companyProvince?: string;
  companyCounty?: string;
  companyCity?: string;
  /** More companies / offices a proforma can be issued under (besides the main company). */
  proformaIssuers?: ProformaIssuer[];
  /** Money unit shown and typed everywhere (amounts are stored in Toman). */
  currencyUnit?: 'TOMAN' | 'RIAL';
  /** Proforma defaults. */
  proformaTerms?: string;
  proformaBankInfo?: string;
  proformaTaxPercent?: number;
  proformaValidDays?: number;
  /** The organisation's standard letter layout, set once by an admin in the letter editor. */
  letterTemplate?: OrgLetterTemplate;
  /** Ready-made letter texts written by an admin; users pick one in the letter editor. */
  letterTextTemplates?: LetterTextTemplate[];
  /** Ready-made messages (text, link, file) the staff send to customers on the social networks. */
  customerMsgTemplates?: CustomerMsgTemplate[];
  companyLogoUrl?: string; // لوگو و آرم رسمی سازمان
  /** The floating logo bubble takes the colour of the theme (for the Hoormand logo). */
  companyLogoThemed?: boolean;
  systemTitle?: string; // نام و عنوان سامانه
  maxUploadSizeBytes: number;
  allowedFileTypes: string[];
  sessionTimeoutMinutes: number;
  enableExternalSharing: boolean;
  requireTransferPasswordByDefault: boolean;
  autoPurgeDays: number;
  defaultUserQuotaGB: number;
  ceoSignatureUrl?: string;
  ceoSignatureHeight?: number; // اندازهٔ پیش‌فرض امضای مدیرعامل روی نامه‌ها (پیکسل)
  companyStampUrl?: string;
  /** Real height of the stamp on paper, in centimetres (set in the admin console; the default size of the stamp on every letter). */
  /** Pictures behind the sign-in pages (data URLs, up to 6; one is picked at random each visit). Empty = the built-in pictures. */
  loginImages?: string[];
  /** how the sign-in pages look: «glass» (picture + frosted card, the default), «simple» (clean light page), «elegant» (soft cream page with a thin gold line), «dark» */
  loginDesign?: 'glass' | 'simple' | 'elegant' | 'dark';
  companyStampSizeCm?: number;
  /** Real width of the stamp in centimetres (for the true-size preview; letters are sized by the height). */
  companyStampWidthCm?: number;
  /** When true the stamp is always that size and cannot be resized on a letter. */
  companyStampSizeLocked?: boolean;
  ceoName?: string;
  ceoTitle?: string;
  themeId?: string;
  letterNumbering?: LetterNumberingSettings;
  customFonts?: CustomFont[];
  defaultLetterFontId?: string;
  companyLogoWidth?: number;
  defaultFooterNote?: string;
  showFooterNote?: boolean;
}

export type AuditAction =
  | 'FILE_UPLOAD'
  | 'FILE_TRANSFER'
  | 'FILE_DOWNLOAD'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'QUOTA_CHANGE'
  | 'SETTINGS_UPDATE'
  | 'DEPT_CREATE'
  | 'DEPT_UPDATE'
  | 'DEPT_DELETE';

/** A ready-made letter text (subject + body) chosen in the letter editor. */
export interface LetterTextTemplate {
  id: string;
  title: string;
  subject: string;
  bodyHtml: string;
}

/** A company or office a proforma can be issued under. */
export interface ProformaIssuer {
  id: string;
  /** Name in the lists, e.g. «دفتر دوم». */
  label: string;
  /** OFFICIAL: a tax-style proforma with all identity codes; UNOFFICIAL: a plain proforma under another name. */
  kind: 'OFFICIAL' | 'UNOFFICIAL';
  name: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  website?: string;
  economicCode?: string;
  nationalId?: string;
  registrationNumber?: string;
  postalCode?: string;
  province?: string;
  county?: string;
  city?: string;
  bankInfo?: string;
  taxPercent?: number;
  /** Put in front of the number of this company's proformas, e.g. «B-». */
  numberPrefix?: string;
  logoUrl?: string;
  stampUrl?: string;
  signatureUrl?: string;
  ceoName?: string;
  ceoTitle?: string;
  /** This company's proformas go to the CEO for approval (stamp and signature) before they can be sent. */
  approvalRequired?: boolean;
  /** The person who approves this company's proformas; empty = anyone who may sign letters. */
  approverId?: string;
  /** شمارهٔ مجوز کسب‌وکار (for an individual with a business licence). */
  licenseNumber?: string;
}

// ---------- warranty («گارانتی») ----------

export type WarrantyStatus = 'ACTIVE' | 'VOID';
export type ClaimStatus = 'RECEIVED' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'RESOLVED' | 'CLOSED';
export type ClaimResolution = 'REPLACE' | 'REPAIR' | 'CREDIT' | 'OTHER';

/** One sold product with its warranty period. Never deleted, only made void. */
export interface Warranty {
  id: string;
  /** G-1405-0007, made by the server */
  warrantyNo: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  productName: string;
  productCode?: string;
  serial?: string;
  invoiceNumber?: string;
  /** Gregorian yyyy-mm-dd, shown in the Persian calendar */
  saleDate: string;
  startDate: string;
  endDate: string;
  months: number;
  /** 0 = no limit */
  maxKm?: number;
  notes?: string;
  status: WarrantyStatus;
  voidReason?: string;
  voidedAt?: string;
  voidedByName?: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
}

export interface ClaimLogEntry {
  at: string;
  kind: 'create' | 'status' | 'note' | 'assign';
  byId: string;
  byName: string;
  from?: ClaimStatus;
  to?: ClaimStatus;
  note?: string;
  resolution?: ClaimResolution;
}

/** A customer's report that a warranted product failed, and what was done about it. */
export interface WarrantyClaim {
  id: string;
  /** C-1405-0003, made by the server */
  claimNo: string;
  warrantyId: string;
  warrantyNo: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  productName: string;
  productCode?: string;
  serial?: string;
  description: string;
  reportedAt: string;
  vehicle?: { model?: string; plate?: string; km?: number };
  /** IN = inside the warranty, EXPIRED = after its end date, KM = over the kilometre limit */
  coverage: 'IN' | 'EXPIRED' | 'KM';
  status: ClaimStatus;
  handlerId?: string;
  handlerName?: string;
  photos?: string[];
  resolution?: ClaimResolution;
  replacementSerial?: string;
  cost?: number;
  closedAt?: string;
  log: ClaimLogEntry[];
  createdAt: string;
  createdById: string;
  createdByName: string;
}

export interface WarrantySettings {
  defaultMonths: number;
  terms: string;
  signerName?: string;
  signerTitle?: string;
  stampImage?: string;
  signatureImage?: string;
}

// ---------- support plans («پشتیبانی») ----------
export type PlanColor = 'slate' | 'teal' | 'amber' | 'rose' | 'indigo' | 'emerald';

export interface SupportPlan {
  id: string;
  name: string;
  price: number;
  months: number;
  /** hours until the first answer, and until the problem is solved */
  responseHours: number;
  resolveHours: number;
  /** site visits included in the period (0 = none) */
  visits: number;
  features: string;
  color: PlanColor;
  active: boolean;
}

/** One customer on one plan for a period. Never deleted, only cancelled. */
export interface SupportSub {
  id: string;
  subNo: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  planId: string;
  planName: string;
  planColor: PlanColor;
  responseHours: number;
  resolveHours: number;
  visits: number;
  startDate: string;
  endDate: string;
  months: number;
  price: number;
  notes?: string;
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason?: string;
  createdAt: string;
  createdById: string;
  createdByName: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TicketChannel = 'PHONE' | 'CHAT' | 'EMAIL' | 'VISIT' | 'OTHER' | 'PORTAL';

export interface TicketLogEntry {
  at: string;
  kind: 'create' | 'status' | 'note' | 'assign' | 'customer' | 'ai';
  /** a note the customer can read on the customer page */
  public?: boolean;
  byId: string;
  byName: string;
  from?: TicketStatus;
  to?: TicketStatus;
  note?: string;
}

export interface SupportTicket {
  id: string;
  ticketNo: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  subId?: string;
  subNo?: string;
  planName?: string;
  /** IN = covered by a running plan, EXPIRED = the chosen plan had ended, NONE = no plan */
  coverage: 'IN' | 'EXPIRED' | 'NONE';
  subject: string;
  description: string;
  priority: TicketPriority;
  channel: TicketChannel;
  status: TicketStatus;
  handlerId?: string;
  handlerName?: string;
  responseDue: string;
  resolveDue: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  resolution?: string;
  minutes?: number;
  visit?: boolean;
  createdAt: string;
  createdById: string;
  createdByName: string;
  log?: TicketLogEntry[];
}

export interface SupportSettings {
  portalEnabled: boolean;
  aiEnabled: boolean;
  aiModel: string;
  aiSttModel: string;
  /** why the AI service failed the last time (nothing when it works) */
  aiLastError?: { kind: string; message: string; at: string } | null;
  aiPrompt: string;
  /** the key itself never comes back from the server */
  aiKeySet: boolean;
  aiBaseUrl: string;
}

/** One person at a meeting: a colleague (userId set) or an outsider (name only). */
export interface MinutesAttendee {
  userId?: string;
  name: string;
  position?: string;
  status: 'PRESENT' | 'ABSENT' | 'EXCUSED';
}

/** A decision of a meeting, with who carries it out and by when. */
export interface MinutesDecision {
  text: string;
  owner?: string;
  ownerUserId?: string;
  /** YYYY-MM-DD */
  due?: string;
}

/** Meeting minutes («صورتجلسه»). */
export interface Minutes {
  id: string;
  number: string;
  title: string;
  /** the sort of meeting: board, staff, committee … (free text) */
  kind?: string;
  /** YYYY-MM-DD */
  date: string;
  startTime?: string;
  endTime?: string;
  place?: string;
  chair?: string;
  secretary?: string;
  attendees: MinutesAttendee[];
  agenda: string[];
  discussion?: string;
  decisions: MinutesDecision[];
  /** YYYY-MM-DD and HH:MM of the next meeting */
  nextDate?: string;
  nextTime?: string;
  nextPlace?: string;
  copies?: string;
  /** the sort of minutes (see MinutesConfig.types); empty = the general one */
  typeId?: string;
  /** the two sides of a handover (e.g. who delivers and who receives) */
  parties?: { first: MinutesParty; second: MinutesParty };
  /** the goods handed over (minutes of a delivery) */
  goods?: MinutesGoodsLine[];
  /** the values of the extra fields of the type (invoice number, order number …), by field id */
  fields?: Record<string, string>;
  /** the conditions / remarks written under the goods */
  conditions?: string;
  /** the customer and the opportunity the minutes were made from (delivery after a proforma) */
  customerId?: string;
  dealId?: string;
  /** the proforma these goods come from */
  proformaNumber?: string;
  /** FINAL = finalised: it is in the archive, locked, and cannot be deleted */
  status: 'DRAFT' | 'FINAL';
  authorId?: string;
  /** who made it (set by the server from the person who first saved it) */
  authorName?: string;
  finalizedAt?: string;
  finalizedById?: string;
  finalizedByName?: string;
  /** a correction of a finalised sheet: the number of the sheet it corrects */
  correctsNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MinutesParty {
  name: string;
  position?: string;
  phone?: string;
}

export interface MinutesGoodsLine {
  title: string;
  code?: string;
  qty: number;
  unit?: string;
  note?: string;
  /** months of warranty the product carries (from the warehouse); 0 or missing = none */
  warrantyMonths?: number;
  /** serial / batch number written for the warranty certificate */
  serial?: string;
}

/** How the number of a minutes sheet is made: tokens {PREFIX} {TYPE} {YYYY} {YY} and {NNN} (as many N as digits). */
export interface MinutesNumbering {
  pattern: string;
  prefix: string;
  start: number;
  /** each sort of minutes counts on its own */
  perType: boolean;
}

/** How the printed sheet of the minutes looks (set in the admin console). */
export interface MinutesDesign {
  presetId: string;
  primary: string;
  accent: string;
  headFill: string;
  text: string;
  headerStyle: 'classic' | 'boxed' | 'band' | 'plain';
  logoPosition: 'right' | 'left' | 'center';
  /** height of the logo in mm */
  logoSize: number;
  showLogo: boolean;
  showOrgName: boolean;
  showSubtitle: boolean;
  showNumberBox: boolean;
  fontSize: number;
  tableStyle: 'lined' | 'striped' | 'bordered';
  radius: number;
  pageBorder: boolean;
  showStatusColumn: boolean;
  showSignColumn: boolean;
  /** height of each signature box in mm */
  signHeight: number;
  footerText: string;
  showFooterContact: boolean;
}

/** One sort of minutes (general meeting, delivery of goods …): which parts it has and what it says. */
export interface MinutesType {
  id: string;
  title: string;
  /** the big title printed on the sheet */
  printTitle: string;
  /** used for {PREFIX}/{TYPE} in the number */
  prefix: string;
  /** the opening sentence; {{title}} {{date}} {{time}} {{place}} {{count}} are filled in */
  intro: string;
  closing: string;
  sections: {
    attendees: boolean;
    agenda: boolean;
    discussion: boolean;
    decisions: boolean;
    nextMeeting: boolean;
    copies: boolean;
    parties: boolean;
    goods: boolean;
  };
  partyLabels: [string, string];
  goodsColumns: { code: boolean; unit: boolean; note: boolean };
  goodsNoteLabel: string;
  conditionsLabel: string;
  /** extra fields to fill in for this sort (invoice number, order number …) */
  fields: { id: string; label: string; kind: 'text' | 'date' }[];
  defaultAgenda: string[];
  defaultConditions: string;
  /** the labels of the boxes at the foot where people sign */
  signs: string[];
  builtin?: boolean;
  active: boolean;
}

export interface MinutesConfig {
  numbering: MinutesNumbering;
  design: MinutesDesign;
  types: MinutesType[];
}

/** Extra layout settings kept with a letter (absent on older letters: they keep their old look). */
export interface LetterFx {
  /** px between the lines of the number / date / attachment block */
  metaRowGap?: number;
  /** the name and title of the signer under the signature and the stamp (instead of above them) */
  signerBelow?: boolean;
  /** the date line above the number line (the two swap places) */
  dateFirst?: boolean;
}
