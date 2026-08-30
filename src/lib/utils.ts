import { FileCategory } from '../types';

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '۰ بایت';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  return val + ' ' + sizes[i];
}

export function getFileCategory(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['gdoc', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) {
    return ext === 'gdoc' ? 'doc' : 'word';
  }
  if (['xls', 'xlsx', 'csv', 'ods', 'gsheet'].includes(ext)) return 'sheet';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'json', 'html', 'css', 'sql'].includes(ext)) return 'code';
  return 'doc';
}

export function getInitials(name: string): string {
  if (!name) return 'ک';
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2);
  return parts[0][0] + '‌' + parts[parts.length - 1][0];
}
