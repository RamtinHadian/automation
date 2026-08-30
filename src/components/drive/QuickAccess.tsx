import React from 'react';
import { FileText } from 'lucide-react';
import { QuickAccessFolder } from '../../types';

interface QuickAccessProps {
  folders: QuickAccessFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string) => void;
}

export const QuickAccess: React.FC<QuickAccessProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
}) => {
  return (
    <div className="space-y-4 select-none font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black tracking-wider text-gray-800 uppercase font-sans">
          دسترسی سریع
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {folders.map((item) => {
          const isActive = item.isActiveFolder || selectedFolderId === item.id;
          const isDoc = item.isProjectDoc;

          if (isDoc) {
            return (
              <div
                key={item.id}
                onClick={() => onSelectFolder(item.id)}
                className="bg-[#f1f3f4] hover:bg-[#e8eaed] transition-all duration-200 rounded-2xl p-4.5 flex flex-col justify-between h-36 border border-gray-200/50 shadow-xs cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-xs font-bold text-blue-800 group-hover:text-blue-900 line-clamp-2 pl-2">
                      {item.title}
                    </div>
                  </div>
                  {item.sharedWith[0] && (
                    <img
                      src={item.sharedWith[0].avatarUrl}
                      alt={item.sharedWith[0].name}
                      className="w-7 h-7 rounded-full object-cover ring-2 ring-white shrink-0"
                    />
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200/60">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-800">
                    آخرین ویرایش
                  </div>
                  <div className="text-[11px] font-medium text-gray-600">
                    {item.lastModified || '۹ سپتامبر ۲۰۱۹ - ۴:۳۰ ق.ظ'}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={item.id}
              onClick={() => onSelectFolder(item.id)}
              className={`relative rounded-2xl p-5 flex flex-col justify-between h-36 transition-all duration-200 cursor-pointer shadow-xs group ${
                isActive
                  ? 'bg-[#1a73e8] text-white shadow-md shadow-blue-500/20'
                  : 'bg-[#f1f3f4] hover:bg-[#e8eaed] text-gray-800 border border-gray-200/50'
              }`}
            >
              {/* Folder tab notch indicator */}
              <div
                className={`absolute -top-1 right-4 w-12 h-2 rounded-t-md transition-colors ${
                  isActive ? 'bg-[#1557b0]' : 'bg-[#e0e3e7]'
                }`}
              />

              {/* Shared with section & avatar stack */}
              <div className="space-y-2">
                <div
                  className={`text-[10px] font-extrabold uppercase tracking-wider ${
                    isActive ? 'text-blue-100' : 'text-gray-900 font-bold'
                  }`}
                >
                  اشتراک‌گذاری شده با
                </div>
                <div className="avatar-stack flex items-center">
                  {item.sharedWith.map((person, idx) => (
                    <img
                      key={idx}
                      src={person.avatarUrl}
                      alt={person.name}
                      title={person.name}
                      className={`w-7 h-7 rounded-full object-cover border-2 shadow-xs transition-transform ${
                        isActive ? 'border-[#1a73e8]' : 'border-[#f1f3f4]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Folder metadata footer */}
              <div className="pt-1">
                <div
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    isActive ? 'text-blue-200' : 'text-gray-800'
                  }`}
                >
                  {item.categoryLabel || 'پوشه'}
                </div>
                <div
                  className={`text-xs font-bold tracking-tight truncate ${
                    isActive ? 'text-white' : 'text-blue-600 group-hover:text-blue-700'
                  }`}
                >
                  {item.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
