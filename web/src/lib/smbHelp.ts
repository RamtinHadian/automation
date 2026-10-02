/** Plain-Persian explanation of the usual network-folder errors (the raw text can stay visible after it). */
export const smbHelp = (t?: string): string => {
  const x = t || '';
  if (x.includes('PASSWORD_MUST_CHANGE') || x.includes('PASSWORD_EXPIRED')) return 'رمز این کاربر در ویندوز/NAS منقضی شده یا تیک «کاربر باید در ورود بعدی رمز را عوض کند» دارد. یک‌بار با همین کاربر وارد آن کامپیوتر شوید و رمز تازه بگذارید (یا تیک را بردارید و «رمز هرگز منقضی نشود» را بزنید)، سپس رمز تازه را اینجا بنویسید.';
  if (x.includes('LOGON_FAILURE')) return 'نام کاربری یا رمز اشتباه است.';
  if (x.includes('ACCOUNT_DISABLED') || x.includes('ACCOUNT_LOCKED')) return 'این کاربر در ویندوز/NAS غیرفعال یا قفل شده است.';
  if (x.includes('BAD_NETWORK_NAME')) return 'نام پوشهٔ اشتراکی (Share) روی آن سرور پیدا نشد؛ نامش را دقیق بنویسید.';
  if (x.includes('ACCESS_DENIED')) return 'این کاربر اجازهٔ دسترسی به این پوشه را ندارد؛ در تنظیمات اشتراک، دسترسی «تغییر / Write» به او بدهید.';
  if (x.includes('UNREACHABLE') || x.includes('CONNECTION_REFUSED') || x.includes('Connection to') || x.includes('timed out')) return 'به آن سرور دسترسی نیست؛ آدرس را بررسی کنید و مطمئن شوید روشن است و فایروال پورت ۴۴۵ را نبسته است.';
  return '';
};
