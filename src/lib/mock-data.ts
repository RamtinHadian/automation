import { Department, User, FileItem, QuickAccessFolder, FileTransfer, NotificationItem, AuditLog, SystemSettings } from '../types';

export const DEPARTMENTS: Department[] = [
  { id: 'dept-1', name: 'فنی و مهندسی', code: 'ENG', color: '#1a73e8', defaultQuotaGB: 50 },
  { id: 'dept-2', name: 'طراحی رابط کاربری (UI/UX)', code: 'DESIGN', color: '#ea4335', defaultQuotaGB: 100 },
  { id: 'dept-3', name: 'مارکتینگ و فروش', code: 'MKTG', color: '#fbbc04', defaultQuotaGB: 25 },
  { id: 'dept-4', name: 'منابع انسانی (HR)', code: 'HR', color: '#34a853', defaultQuotaGB: 20 },
  { id: 'dept-5', name: 'مالی و حقوقی', code: 'FIN', color: '#9333ea', defaultQuotaGB: 30 },
];

export const CURRENT_USER: User = {
  id: 'usr-jessica',
  fullName: 'جسیکا محمدی',
  email: 'jessica.m@company.internal',
  avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  avatarInitials: 'ج',
  role: 'SUPER_ADMIN',
  departmentId: 'dept-2',
  departmentName: 'طراحی رابط کاربری (UI/UX)',
  storageQuotaGB: 1000, // 1 TB
  storageUsedGB: 60.7,
  isActive: true,
  lastLogin: '۶ شهریور ۱۴۰۵ - ۲۲:۵۰',
};

export const STAFF_USERS: User[] = [
  CURRENT_USER,
  {
    id: 'usr-bert',
    fullName: 'برترام گیلفویل',
    email: 'bert.g@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'ب‌گ',
    role: 'STAFF',
    departmentId: 'dept-1',
    departmentName: 'فنی و مهندسی',
    storageQuotaGB: 50,
    storageUsedGB: 18.4,
    isActive: true,
    lastLogin: '۶ شهریور ۱۴۰۵ - ۲۱:۱۵',
  },
  {
    id: 'usr-jb',
    fullName: 'ژان باتیست (JB)',
    email: 'jb.lemoine@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'ژب',
    role: 'STAFF',
    departmentId: 'dept-2',
    departmentName: 'طراحی رابط کاربری (UI/UX)',
    storageQuotaGB: 100,
    storageUsedGB: 45.2,
    isActive: true,
    lastLogin: '۶ شهریور ۱۴۰۵ - ۱۹:۴۰',
  },
  {
    id: 'usr-sarah',
    fullName: 'سارا جنکینز',
    email: 'sarah.j@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'س‌ج',
    role: 'DEPT_ADMIN',
    departmentId: 'dept-3',
    departmentName: 'مارکتینگ و فروش',
    storageQuotaGB: 40,
    storageUsedGB: 12.1,
    isActive: true,
    lastLogin: '۶ شهریور ۱۴۰۵ - ۱۷:۰۵',
  },
  {
    id: 'usr-marcus',
    fullName: 'مارکوس ونس',
    email: 'marcus.v@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'م‌و',
    role: 'STAFF',
    departmentId: 'dept-1',
    departmentName: 'فنی و مهندسی',
    storageQuotaGB: 60,
    storageUsedGB: 34.0,
    isActive: true,
    lastLogin: '۶ شهریور ۱۴۰۵ - ۱۴:۲۲',
  },
  {
    id: 'usr-elena',
    fullName: 'النا رستوا',
    email: 'elena.r@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'ا‌ر',
    role: 'STAFF',
    departmentId: 'dept-4',
    departmentName: 'منابع انسانی (HR)',
    storageQuotaGB: 20,
    storageUsedGB: 4.8,
    isActive: true,
    lastLogin: '۵ شهریور ۱۴۰۵ - ۱۱:۳۰',
  },
  {
    id: 'usr-priya',
    fullName: 'پریا شارما',
    email: 'priya.s@company.internal',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    avatarInitials: 'پ‌ش',
    role: 'STAFF',
    departmentId: 'dept-5',
    departmentName: 'مالی و حقوقی',
    storageQuotaGB: 30,
    storageUsedGB: 9.5,
    isActive: true,
    lastLogin: '۶ شهریور ۱۴۰۵ - ۱۶:۵۰',
  }
];

export const INITIAL_QUICK_ACCESS: QuickAccessFolder[] = [
  {
    id: 'qa-1',
    title: 'فایل‌های طراحی',
    categoryLabel: 'پوشه',
    isActiveFolder: true,
    sharedWith: [
      { name: 'سارا', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', initials: 'س' },
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' },
      { name: 'مارکوس', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80', initials: 'م' },
      { name: 'النا', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80', initials: 'ا' },
    ]
  },
  {
    id: 'qa-2',
    title: 'عکس‌های گوگل',
    categoryLabel: 'پوشه',
    isActiveFolder: false,
    sharedWith: [
      { name: 'سارا', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', initials: 'س' },
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' },
      { name: 'برت', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80', initials: 'ب' },
      { name: 'پریا', avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=100&auto=format&fit=crop&q=80', initials: 'پ' },
    ]
  },
  {
    id: 'qa-3',
    title: 'مطالب آموزشی',
    categoryLabel: 'پوشه',
    isActiveFolder: false,
    sharedWith: [
      { name: 'سارا', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', initials: 'س' },
      { name: 'مارکوس', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80', initials: 'م' },
      { name: 'JB', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80', initials: 'ژ' },
      { name: 'النا', avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80', initials: 'ا' },
    ]
  },
  {
    id: 'qa-4',
    title: 'خلاصه پروژه کلاس زبان انگلیسی',
    categoryLabel: 'سند پروژه',
    isProjectDoc: true,
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    sharedWith: [
      { name: 'مارکوس', avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&auto=format&fit=crop&q=80', initials: 'م' }
    ]
  }
];

export const INITIAL_FILES: FileItem[] = [
  {
    id: 'file-1',
    name: 'گزارش هفتگی داکس (Weekly Report Docs)',
    extension: 'gdoc',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'doc',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'سارا', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', initials: 'س' },
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
    isStarred: true,
  },
  {
    id: 'file-2',
    name: 'چک‌لیست طراحی (Design Checklist.xlsx)',
    extension: 'xlsx',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'sheet',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
  },
  {
    id: 'file-3',
    name: 'گزارش‌های هفتگی (Weekly reports.pdf)',
    extension: 'pdf',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'pdf',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
    isStarred: true,
  },
  {
    id: 'file-4',
    name: 'لیست برنامه‌ریزی (Wedding Planner List.Doc)',
    extension: 'doc',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'word',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
  },
  {
    id: 'file-5',
    name: 'عکس تیم JB (Team JB Picture.jpg)',
    extension: 'jpg',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'image',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
  },
  {
    id: 'file-6',
    name: 'عکس تیم برت (Team Bert Picture.jpg)',
    extension: 'jpg',
    size: '۲۰ مگابایت',
    sizeBytes: 20971520,
    category: 'image',
    lastModified: '۱۸ شهریور ۱۳۹۸ - ۰۴:۳۰ ق.ظ',
    owners: [
      { name: 'جسیکا', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80', initials: 'ج' }
    ],
  },
  {
    id: 'file-7',
    name: 'بسته انتشار معماری سرور (Architecture_v3_Release.zip)',
    extension: 'zip',
    size: '۱۴۲ مگابایت',
    sizeBytes: 148897792,
    category: 'zip',
    lastModified: '۲ شهریور ۱۴۰۵ - ۱۱:۱۵ ق.ظ',
    owners: [
      { name: 'برت', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80', initials: 'ب' }
    ],
  },
  {
    id: 'file-8',
    name: 'گزارش ممیزی امنیت شبکه (Security_Audit_Report.pdf)',
    extension: 'pdf',
    size: '۱۴.۵ مگابایت',
    sizeBytes: 15204352,
    category: 'pdf',
    lastModified: '۵ شهریور ۱۴۰۵ - ۰۲:۴۰ ب.ظ',
    owners: [
      { name: 'سارا', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80', initials: 'س' }
    ],
  }
];

export const INITIAL_TRANSFERS: FileTransfer[] = [
  {
    id: 'tr-101',
    fileId: 'file-1',
    fileName: 'گزارش هفتگی داکس',
    fileSize: '۲۰ مگابایت',
    category: 'doc',
    sender: CURRENT_USER,
    recipients: [STAFF_USERS[1], STAFF_USERS[3]],
    note: 'لطفاً متن بازاریابی سه ماهه سوم را بررسی و تا پایان هفته تایید کنید.',
    status: 'DELIVERED',
    sentAt: 'امروز، ۱۰:۳۰ ق.ظ',
    expiresAt: 'تا ۶ روز دیگر',
    downloadsCount: 1,
    maxDownloads: 5,
  },
  {
    id: 'tr-102',
    fileId: 'file-7',
    fileName: 'بسته انتشار معماری سرور (Architecture_v3_Release.zip)',
    fileSize: '۱۴۲ مگابایت',
    category: 'zip',
    sender: STAFF_USERS[1],
    recipients: [CURRENT_USER],
    note: 'بسته استقرار بک‌اند پروداکشن به همراه اسکریپت‌های مایگریشن دیتابیس.',
    status: 'DOWNLOADED',
    sentAt: 'دیروز، ۰۴:۱۵ ب.ظ',
    expiresAt: 'تا ۳ روز دیگر',
    downloadsCount: 2,
    isEncrypted: true,
  },
  {
    id: 'tr-103',
    fileId: 'file-8',
    fileName: 'گزارش ممیزی امنیت شبکه (Security_Audit_Report.pdf)',
    fileSize: '۱۴.۵ مگابایت',
    category: 'pdf',
    sender: STAFF_USERS[3],
    recipients: [CURRENT_USER, STAFF_USERS[4]],
    note: 'ارزیابی محرمانه امنیتی جهت تطابق با استانداردهای ISO.',
    status: 'DELIVERED',
    sentAt: '۴ شهریور، ۰۹:۲۰ ق.ظ',
    expiresAt: 'تا ۱۲ روز دیگر',
    downloadsCount: 0,
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'فایل جدید دریافت شد',
    message: 'برترام گیلفویل فایل Architecture_v3_Release.zip (۱۴۲ مگابایت) را برای شما ارسال کرد.',
    timestamp: '۱۵ دقیقه پیش',
    isRead: false,
    type: 'TRANSFER_RECEIVED',
    fileTransferId: 'tr-102',
  },
  {
    id: 'notif-2',
    title: 'فایل دانلود شد',
    message: 'سارا جنکینز فایل گزارش هفتگی را دانلود کرد.',
    timestamp: '۱ ساعت پیش',
    isRead: false,
    type: 'TRANSFER_DOWNLOADED',
  },
  {
    id: 'notif-3',
    title: 'به‌روزرسانی خط‌مشی فضای ابری',
    message: 'سهمیه‌های ذخیره‌سازی واحدها توسط مدیر ارشد به‌روزرسانی شد.',
    timestamp: 'دیروز',
    isRead: true,
    type: 'SYSTEM',
  }
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: '۱۴۰۵/۰۶/۰۶ - ۲۲:۴۵:۱۰',
    userEmail: 'jessica.m@company.internal',
    userName: 'جسیکا محمدی (مدیر ارشد)',
    action: 'SETTINGS_UPDATE',
    severity: 'INFO',
    ipAddress: '192.168.1.104',
    details: 'تغییر سقف حجم تک‌فایل آپلود به ۵ گیگابایت.',
  },
  {
    id: 'log-2',
    timestamp: '۱۴۰۵/۰۶/۰۶ - ۲۱:۱۲:۰۴',
    userEmail: 'bert.g@company.internal',
    userName: 'برترام گیلفویل',
    action: 'FILE_TRANSFER',
    severity: 'INFO',
    ipAddress: '10.0.4.55',
    details: 'ارسال انتقال رمزنگاری‌شده "Architecture_v3_Release.zip" به ۱ گیرنده.',
  },
  {
    id: 'log-3',
    timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۹:۳۰:۲۲',
    userEmail: 'sarah.j@company.internal',
    userName: 'سارا جنکینز',
    action: 'FILE_DOWNLOAD',
    severity: 'INFO',
    ipAddress: '192.168.1.88',
    details: 'دانلود "گزارش هفتگی" از طریق لینک مستقیم درون‌سازمانی.',
  },
  {
    id: 'log-4',
    timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۶:۱۵:۴۰',
    userEmail: 'jessica.m@company.internal',
    userName: 'جسیکا محمدی (مدیر ارشد)',
    action: 'QUOTA_CHANGE',
    severity: 'WARNING',
    ipAddress: '192.168.1.104',
    details: 'افزایش سهمیه ذخیره‌سازی واحد طراحی UI/UX از ۵۰ به ۱۰۰ گیگابایت.',
  },
  {
    id: 'log-5',
    timestamp: '۱۴۰۵/۰۶/۰۶ - ۱۴:۰۵:۱۹',
    userEmail: 'marcus.v@company.internal',
    userName: 'مارکوس ونس',
    action: 'FILE_UPLOAD',
    severity: 'INFO',
    ipAddress: '10.0.4.12',
    details: 'بارگذاری فایل "خلاصه پروژه کلاس زبان انگلیسی" (۲۰ مگابایت).',
  }
];

export const INITIAL_SETTINGS: SystemSettings = {
  maxUploadSizeBytes: 5368709120, // 5 GB
  allowedFileTypes: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'zip', 'tar.gz', 'png', 'jpg', 'jpeg', 'mp4', 'ts', 'py', 'json', 'csv'],
  sessionTimeoutMinutes: 60,
  enableExternalSharing: false,
  requireTransferPasswordByDefault: false,
  autoPurgeDays: 14,
  defaultUserQuotaGB: 25,
};
