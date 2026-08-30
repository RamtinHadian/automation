import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  File,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Loader2,
  Trash2
} from 'lucide-react';
import { FileItem, FileCategory } from '../../types';
import { formatBytes, getFileCategory } from '../../lib/utils';
import { formatCurrentJalaliDateTime } from '../../lib/jalali';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete: (newFiles: FileItem[]) => void;
  currentUserId: string;
}

interface UploadQueueItem {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
  category: FileCategory;
  extension: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
  currentUserId,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesAdded = (rawFiles: FileList | File[]) => {
    const newItems: UploadQueueItem[] = Array.from(rawFiles).map((f) => {
      const ext = f.name.split('.').pop() || '';
      return {
        id: 'up-' + Math.random().toString(36).substring(2, 9),
        name: f.name,
        sizeBytes: f.size,
        sizeFormatted: formatBytes(f.size),
        progress: 0,
        status: 'uploading',
        category: getFileCategory(f.name),
        extension: ext,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    setIsProcessing(true);

    // Simulate chunked upload progress
    newItems.forEach((item) => {
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += Math.floor(Math.random() * 25) + 15;
        if (currentProgress >= 100) {
          currentProgress = 100;
          clearInterval(interval);
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: 100, status: 'completed' } : q))
          );
        } else {
          setQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: currentProgress } : q))
          );
        }
      }, 200);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleFinish = () => {
    const completedItems: FileItem[] = queue
      .filter((q) => q.status === 'completed')
      .map((q) => ({
        id: 'file-' + Math.random().toString(36).substring(2, 9),
        name: q.name,
        extension: q.extension,
        size: q.sizeFormatted,
        sizeBytes: q.sizeBytes,
        category: q.category,
        lastModified: formatCurrentJalaliDateTime(),
        owners: [
          {
            name: 'جسیکا',
            avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
            initials: 'ج',
          },
        ],
      }));

    if (completedItems.length > 0) {
      onUploadComplete(completedItems);
    }
    setQueue([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900">بارگذاری فایل در گودل درایو</h3>
              <p className="text-[11px] text-gray-500">پشتیبانی از اسناد اداری، فایل‌های فشرده، تصاویر و کدها</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-3 ${
              dragOver
                ? 'border-blue-500 bg-blue-50/60 scale-[0.99]'
                : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50/60'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesAdded(e.target.files);
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-blue-100/70 text-blue-600 flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-700">
                <span className="text-blue-600 font-bold">برای انتخاب کلیک کنید</span> یا فایل‌ها را به این قسمت بکشید
              </p>
              <p className="text-[11px] text-gray-400">
                حداکثر حجم فایل ۵ گیگابایت • مجهز به پویش آنتی‌ویروس سازمانی
              </p>
            </div>
          </div>

          {/* Upload Queue List */}
          {queue.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                پیشرفت بارگذاری ({queue.filter((q) => q.status === 'completed').length}/{queue.length})
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pl-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate pl-2">
                        <File className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className="font-bold text-gray-800 truncate">{item.name}</span>
                        <span className="text-[10px] text-gray-400">({item.sizeFormatted})</span>
                      </div>
                      {item.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : item.status === 'uploading' ? (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          item.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-200/60 transition-colors"
          >
            انصراف
          </button>
          <button
            onClick={handleFinish}
            disabled={queue.length === 0 || queue.some((q) => q.status === 'uploading')}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm ${
              queue.length > 0 && queue.every((q) => q.status === 'completed')
                ? 'bg-[#1967d2] text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            ذخیره در درایو ({queue.filter((q) => q.status === 'completed').length})
          </button>
        </div>
      </div>
    </div>
  );
};
