import React from 'react';
import { Eye, FileText, Stamp, CheckCheck, Clock } from 'lucide-react';
import { FileTransfer } from '../../types';

interface LetterThumbnailProps {
  letter: FileTransfer;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const LetterThumbnail: React.FC<LetterThumbnailProps> = ({
  letter,
  onClick,
  size = 'md',
}) => {
  const isSigned = letter.signatureStatus === 'SIGNED';
  const hasImageScan = letter.fileDataUrl && letter.category === 'image';

  const sizeClasses = {
    sm: 'w-14 h-18 text-[7px]',
    md: 'w-18 h-24 text-[8px]',
    lg: 'w-24 h-32 text-[9px]',
    xl: 'w-28 h-36 text-[10px]',
  }[size];

  return (
    <div
      onClick={onClick}
      className={`relative ${sizeClasses} bg-white rounded-xl border border-[#EBDBCE] shadow-sm hover:shadow-md hover:border-[#6E1B1B] transition-all cursor-pointer overflow-hidden flex flex-col justify-between shrink-0 group select-none`}
      title="کلیک برای مشاهده پیش‌نمایش کامل و پاراف/امضای نامه"
    >
      {/* Real Scan Preview if available */}
      {hasImageScan ? (
        <div className="w-full h-full relative overflow-hidden bg-gray-50 flex items-center justify-center">
          <img
            src={letter.fileDataUrl}
            alt="اسکن نامه"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        </div>
      ) : (
        /* Miniature Document Sheet Graphics */
        <div className="p-1.5 flex flex-col justify-between h-full bg-gradient-to-b from-white to-[#FAF5F1]">
          {/* Top Miniature Header Bar */}
          <div className="space-y-0.5 border-b border-[#EBDBCE]/70 pb-1">
            <div className="flex items-center justify-between">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#6E1B1B] text-white flex items-center justify-center text-[5px] font-black">
                گ
              </div>
              <div className="text-[6px] font-black text-[#6E1B1B] scale-90 origin-right">
                نامه اداری
              </div>
            </div>
            <div className="w-full h-0.5 bg-[#6E1B1B]/40 rounded-full"></div>
          </div>

          {/* Skeleton Body Lines */}
          <div className="space-y-1 py-1">
            <div className="w-full h-1 bg-gray-200 rounded-full"></div>
            <div className="w-5/6 h-1 bg-gray-200 rounded-full"></div>
            <div className="w-4/6 h-1 bg-gray-150 rounded-full"></div>
            <div className="w-full h-1 bg-gray-150 rounded-full"></div>
            <div className="w-3/6 h-1 bg-gray-100 rounded-full"></div>
          </div>

          {/* Miniature Signature / Stamp indicator */}
          <div className="pt-1 border-t border-dashed border-[#EBDBCE]/60 flex items-center justify-between">
            <div className="w-4 h-1 bg-gray-300 rounded-full"></div>
            {isSigned ? (
              <div className="w-3 h-3 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <CheckCheck className="w-2 h-2" />
              </div>
            ) : (
              <div className="w-3 h-3 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <Stamp className="w-2 h-2" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hover Overlay with Eye Icon */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1 p-1 backdrop-blur-2xs">
        <Eye className="w-4 h-4 text-amber-300 drop-shadow-xs" />
        <span className="text-[7px] font-black text-center leading-tight drop-shadow-xs">
          مشاهده نامه
        </span>
      </div>

      {/* Verified Stamp Ribbon if Signed */}
      {isSigned && (
        <div className="absolute top-1 left-1 bg-emerald-600 text-white p-0.5 rounded-full shadow-xs">
          <CheckCheck className="w-2 h-2" />
        </div>
      )}
    </div>
  );
};
