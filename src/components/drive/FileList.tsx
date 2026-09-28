import React, { useState } from 'react';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Link as LinkIcon,
  MoreHorizontal,
  Download,
  Send,
  Trash2,
  Star,
  Info,
  Check,
  File
} from 'lucide-react';
import { FileItem, FileCategory } from '../../types';

interface FileListProps {
  files: FileItem[];
  selectedFileId: string | null;
  onSelectFile: (file: FileItem) => void;
  onTransferFile: (file: FileItem) => void;
  onDeleteFile: (fileId: string) => void;
  onToggleStar: (fileId: string) => void;
  onViewDetails: (file: FileItem) => void;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  selectedFileId,
  onSelectFile,
  onTransferFile,
  onDeleteFile,
  onToggleStar,
  onViewDetails,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleCopyLink = (e: React.MouseEvent, file: FileItem) => {
    e.stopPropagation();
    const dummyUrl = `${window.location.origin}/share/${file.id}`;
    navigator.clipboard?.writeText(dummyUrl);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderFileIcon = (category: FileCategory) => {
    switch (category) {
      case 'doc':
        return (
          <div className="w-6 h-6 rounded bg-[#6E1B1B] flex items-center justify-center text-white shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
        );
      case 'sheet':
        return (
          <div className="w-6 h-6 rounded bg-[#D34A32] flex items-center justify-center text-white shadow-xs">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
        );
      case 'pdf':
        return (
          <div className="w-6 h-6 rounded bg-[#992E1B] flex items-center justify-center text-white shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
        );
      case 'word':
        return (
          <div className="w-6 h-6 rounded bg-[#6E1B1B] flex items-center justify-center text-white shadow-xs">
            <FileText className="w-4 h-4" />
          </div>
        );
      case 'image':
        return (
          <div className="w-6 h-6 rounded bg-[#C98B6A] flex items-center justify-center text-white shadow-xs">
            <ImageIcon className="w-4 h-4" />
          </div>
        );
      case 'zip':
        return (
          <div className="w-6 h-6 rounded bg-[#8C6F66] flex items-center justify-center text-white shadow-xs">
            <FileArchive className="w-4 h-4" />
          </div>
        );
      case 'code':
        return (
          <div className="w-6 h-6 rounded bg-[#503730] flex items-center justify-center text-white shadow-xs">
            <FileCode className="w-4 h-4" />
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 rounded bg-[#8C6F66] flex items-center justify-center text-white shadow-xs">
            <File className="w-4 h-4" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-3 pt-2 select-none font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black tracking-wider text-[#3A241F] uppercase font-sans">
          همه فایل‌ها
        </h2>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-right">
          <thead>
            <tr className="text-[11px] font-bold text-[#8C6F66] uppercase tracking-wider border-b border-[#EBDBCE] pb-2">
              <th className="pb-3 pr-2 font-bold">نام فایل</th>
              <th className="pb-3 px-4 font-bold">مالکان و دسترسی‌ها</th>
              <th className="pb-3 px-4 font-bold">آخرین تغییرات</th>
              <th className="pb-3 px-4 font-bold">حجم فایل</th>
              <th className="pb-3 pl-2 text-left font-bold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBDBCE]/60 text-xs text-[#3A241F]">
            {files.map((file) => {
              const isSelected = selectedFileId === file.id;
              const isMenuOpen = openMenuId === file.id;

              return (
                <tr
                  key={file.id}
                  onClick={() => onSelectFile(file)}
                  className={`group transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-[#F6D9CD]/50 font-bold'
                      : 'hover:bg-[#FAF5F1]'
                  }`}
                >
                  {/* File Name & Icon */}
                  <td className="py-3.5 pr-2 pl-4">
                    <div className="flex items-center gap-3">
                      {renderFileIcon(file.category)}
                      <span className="font-bold text-[#3A241F] group-hover:text-[#6E1B1B] transition-colors truncate max-w-xs md:max-w-md">
                        {file.name}
                      </span>
                    </div>
                  </td>

                  {/* Owners Avatar Stack */}
                  <td className="py-3.5 px-4">
                    <div className="avatar-stack flex items-center">
                      {file.owners.map((owner, i) => (
                        <img
                          key={i}
                          src={owner.avatarUrl}
                          alt={owner.name}
                          title={owner.name}
                          className="w-6 h-6 rounded-full object-cover border-2 border-white shadow-2xs"
                        />
                      ))}
                    </div>
                  </td>

                  {/* Last Modified */}
                  <td className="py-3.5 px-4 text-[#8C6F66] whitespace-nowrap font-medium">
                    {file.lastModified}
                  </td>

                  {/* File Size */}
                  <td className="py-3.5 px-4 font-bold text-[#3A241F] whitespace-nowrap">
                    {file.size}
                  </td>

                  {/* Actions (Link icon + Three dots menu) */}
                  <td className="py-3.5 pl-2 pr-4 text-left">
                    <div className="flex items-center justify-end gap-3 text-[#8C6F66] relative">
                      {/* Copy Link Button */}
                      <button
                        onClick={(e) => handleCopyLink(e, file)}
                        className={`p-1.5 rounded-full hover:bg-[#FAF5F1] hover:text-[#6E1B1B] transition-all ${
                          copiedId === file.id ? 'text-[#6E1B1B] bg-[#F6D9CD]' : ''
                        }`}
                        title="کپی لینک اشتراک‌گذاری"
                      >
                        {copiedId === file.id ? (
                          <Check className="w-4 h-4 text-[#6E1B1B]" />
                        ) : (
                          <LinkIcon className="w-4 h-4" />
                        )}
                      </button>

                      {/* Three Dots Menu Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(isMenuOpen ? null : file.id);
                        }}
                        className="p-1.5 rounded-full hover:bg-[#FAF5F1] hover:text-[#6E1B1B] transition-all"
                        title="عملیات بیشتر"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      {/* Context Menu Dropdown */}
                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 top-8 z-30 w-52 bg-white rounded-xl shadow-xl border border-[#EBDBCE] py-1.5 text-right text-xs font-semibold text-[#3A241F] animate-in fade-in zoom-in-95 duration-150"
                        >
                          <button
                            onClick={() => {
                              onViewDetails(file);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#FAF5F1] hover:text-[#6E1B1B] flex items-center gap-2.5 transition-colors"
                          >
                            <Info className="w-3.5 h-3.5" />
                            <span>مشاهده جزئیات و مشخصات</span>
                          </button>
                          <button
                            onClick={() => {
                              onTransferFile(file);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#FAF5F1] hover:text-[#6E1B1B] flex items-center gap-2.5 transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>ارسال به همکاران</span>
                          </button>
                          <button
                            onClick={() => {
                              alert(`در حال شبیه‌سازی دانلود فایل: ${file.name}`);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#FAF5F1] hover:text-[#6E1B1B] flex items-center gap-2.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>دانلود فایل</span>
                          </button>
                          <button
                            onClick={() => {
                              onToggleStar(file.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#FAF5F1] hover:text-[#D34A32] flex items-center gap-2.5 transition-colors"
                          >
                            <Star className={`w-3.5 h-3.5 ${file.isStarred ? 'fill-[#D34A32] text-[#D34A32]' : ''}`} />
                            <span>{file.isStarred ? 'حذف از نشان‌دارها' : 'افزودن به نشان‌دارها'}</span>
                          </button>
                          <div className="h-px bg-[#EBDBCE] my-1" />
                          <button
                            onClick={() => {
                              onDeleteFile(file.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3.5 py-2 hover:bg-[#F6D9CD]/50 text-[#6E1B1B] flex items-center gap-2.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>انتقال به سطل زباله</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
