import React, { useState } from 'react';
import {
  UserPlus,
  Search,
  Shield,
  HardDrive,
  Check,
  X,
  Edit2,
  Trash2,
  Lock,
  Building,
  UserCheck,
  UserX,
  FileCheck,
  Award,
  Stamp,
  ClipboardList,
  Users
} from 'lucide-react';
import { User, UserRole, Department } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

interface UserManagementViewProps {
  users: User[];
  departments: Department[];
  onAddUser: (user: {
    fullName: string;
    email: string;
    password?: string;
    role: UserRole;
    departmentId: string;
    quotaGB: number;
    canSendOfficialLetters?: boolean;
    canSignOfficialLetters?: boolean;
    canUseTasks?: boolean;
    canUseCrm?: boolean;
    extension?: string;
  }) => void;
  onUpdateUser: (userId: string, updates: Partial<User>) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  departments,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Add User Form State
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('123456');
  const [newRole, setNewRole] = useState<UserRole>('STAFF');
  const [newDeptId, setNewDeptId] = useState(departments[0]?.id || '');
  const [newQuotaGB, setNewQuotaGB] = useState(50);
  const [newCanSendOfficialLetters, setNewCanSendOfficialLetters] = useState(false);
  const [newCanSignOfficialLetters, setNewCanSignOfficialLetters] = useState(false);
  const [newCanUseTasks, setNewCanUseTasks] = useState(false);
  const [newCanUseCrm, setNewCanUseCrm] = useState(false);
  const [newExtension, setNewExtension] = useState('');

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.departmentName.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newEmail) return;

    const dept = departments.find((d) => d.id === newDeptId) || departments[0];
    onAddUser({
      fullName: newFullName,
      email: newEmail,
      password: newPassword || '123456',
      role: newRole,
      departmentId: dept.id,
      quotaGB: newQuotaGB,
      canSendOfficialLetters: newCanSendOfficialLetters,
      canSignOfficialLetters: newCanSignOfficialLetters,
      canUseTasks: newCanUseTasks,
      canUseCrm: newCanUseCrm,
      extension: newExtension.trim(),
    });

    setIsAddModalOpen(false);
    setNewFullName('');
    setNewEmail('');
    setNewPassword('123456');
    setNewCanSendOfficialLetters(false);
    setNewCanSignOfficialLetters(false);
    setNewCanUseTasks(false);
    setNewCanUseCrm(false);
    setNewExtension('');
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
              مدیریت کاربران، صاحبان امضا و دسترسی‌ها
            </h1>
            <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#C98B6A]/30 uppercase">
              مدیر ارشد
            </span>
          </div>
          <p className="text-xs text-[#8C6F66]">
            تعیین صاحب امضای مجاز (مدیرعامل)، مجوز ارسال نامه‌ها و سقف فضای ذخیره‌سازی
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-95 self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>افزودن کارمند جدید</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام، ایمیل سازمانی یا واحد..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none cursor-pointer"
        >
          <option value="ALL">همه نقش‌ها</option>
          <option value="SUPER_ADMIN">مدیران ارشد (Super Admin)</option>
          <option value="DEPT_ADMIN">مدیران واحدها</option>
          <option value="STAFF">پرسنل عادی</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-[#EBDBCE] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAF5F1] text-[11px] font-bold text-[#8C6F66] uppercase tracking-wider border-b border-[#EBDBCE]">
                <th className="py-3 px-4">کارمند</th>
                <th className="py-3 px-4">واحد سازمانی</th>
                <th className="py-3 px-4">سطح دسترسی (نقش)</th>
                <th className="py-3 px-4">حق امضا / مجوز نامه</th>
                <th className="py-3 px-4">رمز عبور ورود</th>
                <th className="py-3 px-4">مصرف / سهمیه فضا</th>
                <th className="py-3 px-4">وضعیت</th>
                <th className="py-3 px-4 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBDBCE]/60 font-medium text-[#3A241F]">
              {filteredUsers.map((user) => {
                const percent = Math.min(100, Math.round((user.storageUsedGB / user.storageQuotaGB) * 100));
                return (
                  <tr key={user.id} className="hover:bg-[#FAF5F1] transition-colors">
                    {/* User Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="font-bold text-[#3A241F]">{user.fullName}</div>
                          <div className="text-[11px] text-[#8C6F66]">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE] px-2.5 py-1 rounded-lg text-[11px] font-bold">
                        <Building className="w-3 h-3 text-[#C98B6A]" />
                        {user.departmentName}
                      </span>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-4">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="bg-[#6E1B1B]/15 text-[#6E1B1B] border border-[#6E1B1B]/30 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          مدیر ارشد
                        </span>
                      ) : user.role === 'DEPT_ADMIN' ? (
                        <span className="bg-[#D34A32]/15 text-[#D34A32] border border-[#D34A32]/30 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          مدیر واحد
                        </span>
                      ) : (
                        <span className="bg-[#F6D9CD] text-[#3A241F] border border-[#C98B6A]/40 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          کارمند
                        </span>
                      )}
                    </td>

                    {/* Signature & Official Letters Permission Badges */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        {user.canSignOfficialLetters ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-lg text-[10px] font-black shadow-2xs">
                            <Award className="w-3 h-3 text-amber-600" />
                            <span>صاحب امضای مجاز (مدیرعامل)</span>
                          </span>
                        ) : null}

                        {user.canSendOfficialLetters ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                            <FileCheck className="w-3 h-3 text-emerald-600" />
                            <span>مجوز ارسال نامه</span>
                          </span>
                        ) : null}

                        {user.canUseTasks ? (
                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-300 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                            <ClipboardList className="w-3 h-3 text-sky-600" />
                            <span>مدیریت وظایف</span>
                          </span>
                        ) : null}

                        {!user.canSignOfficialLetters && !user.canSendOfficialLetters && !user.canUseTasks && (
                          <span className="text-[10px] text-gray-400">عادی</span>
                        )}
                      </div>
                    </td>

                    {/* Password */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-1.5 bg-[#FAF5F1] px-2.5 py-1 rounded-lg border border-[#EBDBCE] font-mono text-[11px] font-bold text-[#3A241F]">
                        <Lock className="w-3 h-3 text-[#C98B6A]" />
                        <span>••••••••</span>
                      </div>
                    </td>

                    {/* Storage Progress */}
                    <td className="py-3.5 px-4 min-w-44">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-[#8C6F66]">
                          <span>{toPersianDigits(user.storageUsedGB.toFixed(1))} گیگابایت مصرفی</span>
                          <span>{user.storageQuotaGB >= 1000 ? `${toPersianDigits(user.storageQuotaGB / 1000)} ترابایت` : `${toPersianDigits(user.storageQuotaGB)} گیگابایت`} سهمیه</span>
                        </div>
                        <div className="w-full bg-[#FAF5F1] rounded-full h-2 overflow-hidden border border-[#EBDBCE]">
                          <div
                            className={`h-full rounded-full transition-all ${percent > 85 ? 'bg-[#D34A32]' : percent > 60 ? 'bg-[#C98B6A]' : 'bg-[#6E1B1B]'
                              }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-[#6E1B1B] font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#6E1B1B] animate-pulse" /> فعال
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#B8A39C] font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#B8A39C]" /> مسدود / معلق
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#F6D9CD]/40 rounded-lg transition-colors cursor-pointer"
                          title="ویرایش مشخصات، صاحب امضا و مجوزها"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onUpdateUser(user.id, { isActive: !user.isActive })}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${user.isActive
                            ? 'text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/40'
                            : 'text-[#6E1B1B] hover:bg-[#F6D9CD]/40'
                            }`}
                          title={user.isActive ? 'مسدود کردن' : 'فعال‌سازی'}
                        >
                          {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => onDeleteUser(user.id)}
                          className="p-1.5 text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/40 rounded-lg transition-colors cursor-pointer"
                          title="حذف حساب کارمند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-[#EBDBCE] space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <h3 className="font-bold text-sm text-[#3A241F]">
                ویرایش مشخصات و دسترسی‌ها: {editingUser.fullName}
              </h3>
              <button onClick={() => setEditingUser(null)} className="p-1 text-[#8C6F66] hover:text-[#3A241F] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] mb-1">نام و نام خانوادگی</label>
                <input
                  type="text"
                  value={editingUser.fullName}
                  onChange={(e) => setEditingUser({ ...editingUser, fullName: e.target.value })}
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-semibold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] mb-1">نام کاربری (برای ورود)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value.trim() })}
                  placeholder="مثلاً ali@company.ir"
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-mono text-[#3A241F] text-right focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                />
                <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">کاربر با همین نام (یا نام کامل) وارد می‌شود. بعد از تغییر، نام کاربری جدید را به او اطلاع دهید.</p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  واحد سازمانی
                </label>
                <select
                  value={editingUser.departmentId}
                  onChange={(e) => {
                    const d = departments.find((dept) => dept.id === e.target.value);
                    if (d) {
                      setEditingUser({ ...editingUser, departmentId: d.id, departmentName: d.name });
                    }
                  }}
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-semibold text-[#3A241F]"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  سطح دسترسی و نقش
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-semibold text-[#3A241F]"
                >
                  <option value="STAFF">پرسنل عادی (Staff)</option>
                  <option value="DEPT_ADMIN">مدیر واحد (Dept Admin)</option>
                  <option value="SUPER_ADMIN">مدیر ارشد سامانه (Super Admin)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  رمز عبور جدید (خالی بگذارید تا تغییر نکند)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editingUser.password || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                    placeholder="برای تغییر رمز، رمز جدید را بنویسید"
                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-mono text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                  />
                  <Lock className="w-3.5 h-3.5 text-[#8C6F66] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Permission: customers (CRM) */}
              <div className="p-3 bg-violet-50/70 rounded-2xl border border-violet-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-violet-900">
                    <Users className="w-4 h-4 text-violet-600" />
                    <span>دسترسی به مشتریان و فروش (CRM)</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">منوی «مشتریان» برای این کاربر فعال می‌شود: مشتری، فرصت فروش و پیگیری.</p>
                </div>
                <input type="checkbox" checked={!!editingUser.canUseCrm} onChange={(e) => setEditingUser({ ...editingUser, canUseCrm: e.target.checked })} className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0" />
              </div>

              {/* Permission Checkbox: Task management */}
              <div className="p-3 bg-sky-50/70 rounded-2xl border border-sky-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-sky-900">
                    <ClipboardList className="w-4 h-4 text-sky-600" />
                    <span>دسترسی به سیستم مدیریت وظایف</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    منوی «وظایف» برای این کاربر فعال می‌شود تا وظیفه تعریف کند، به همکاران واگذار کند و پیگیری کند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={!!editingUser.canUseTasks}
                  onChange={(e) => setEditingUser({ ...editingUser, canUseTasks: e.target.checked })}
                  className="w-5 h-5 accent-sky-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* CEO / Authorized Signatory Permission Checkbox */}
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-amber-900">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span>صاحب امضای مجاز / مدیرعامل (حق امضای رسمی)</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    فقط کاربرانی که این تیک را دارند می‌توانند نامه‌های رسمی را بررسی و امضای دیجیتال نهایی نمایند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={!!editingUser.canSignOfficialLetters}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, canSignOfficialLetters: e.target.checked })
                  }
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Permission Checkbox: Send Official Letters */}
              <div className="p-3 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-[#3A241F]">
                    <FileCheck className="w-4 h-4 text-[#6E1B1B]" />
                    <span>مجوز ارسال و نگارش نامه رسمی</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    به کاربر امکان می‌دهد نامه‌های رسمی را تایپ یا بارگذاری کرده و جهت امضا به مدیریت ارسال کند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={!!editingUser.canSendOfficialLetters}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, canSendOfficialLetters: e.target.checked })
                  }
                  className="w-5 h-5 accent-[#6E1B1B] rounded cursor-pointer shrink-0"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#3A241F] mb-1">شمارهٔ داخلی تلفن (اختیاری)</label>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  value={editingUser.extension || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, extension: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="مثلاً ۵۰۱"
                  className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-mono text-[#3A241F] outline-hidden text-right"
                />
                <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">برای نمایش پاپ‌آپ تماس ورودی و تماس با یک کلیک از تلفن سازمان.</p>
              </div>

              <div>
                <label className="block text-[11px] font-black text-[#3A241F] mb-1">شمارهٔ داخلی تلفن (اختیاری)</label>
                <input
                  dir="ltr"
                  inputMode="numeric"
                  value={newExtension}
                  onChange={(e) => setNewExtension(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="مثلاً ۵۰۱"
                  className="w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-mono text-[#3A241F] outline-hidden text-right"
                />
                <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">برای نمایش پاپ‌آپ تماس ورودی و تماس با یک کلیک از تلفن سازمان.</p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  <span>سقف سهمیه فضای ابری</span>
                  <span className="text-[#6E1B1B] font-black">{editingUser.storageQuotaGB} گیگابایت</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="2000"
                  step="10"
                  value={editingUser.storageQuotaGB}
                  onChange={(e) =>
                    setEditingUser({ ...editingUser, storageQuotaGB: parseInt(e.target.value) })
                  }
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#EBDBCE]">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  const name = editingUser.fullName.trim();
                  const login = editingUser.email.trim();
                  if (!name || !login) {
                    window.alert('نام و نام کاربری نمی‌تواند خالی باشد.');
                    return;
                  }
                  if (users.some((u) => u.id !== editingUser.id && u.email.trim().toLowerCase() === login.toLowerCase())) {
                    window.alert('این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.');
                    return;
                  }
                  if (editingUser.password && editingUser.password.length < 6) {
                    window.alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');
                    return;
                  }
                  onUpdateUser(editingUser.id, { ...editingUser, fullName: name, email: login });
                  setEditingUser(null);
                }}
                className="px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-xs cursor-pointer"
              >
                ذخیره تغییرات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <form
            onSubmit={handleCreateUser}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-[#EBDBCE] space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
              <h3 className="font-bold text-sm text-[#3A241F]">تعریف کارمند جدید در سامانه</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-[#8C6F66] hover:text-[#3A241F] cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="مثال: علی رضایی"
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  ایمیل سازمانی (شناسه کاربری)
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="مثال: ali.r@company.internal"
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  رمز عبور اولیه
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="رمز عبور برای ورود کاربر"
                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-mono text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                  />
                  <Lock className="w-3.5 h-3.5 text-[#8C6F66] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  واحد سازمانی
                </label>
                <select
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-semibold text-[#3A241F]"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  نقش سازمانی
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl font-semibold text-[#3A241F]"
                >
                  <option value="STAFF">پرسنل عادی (Staff)</option>
                  <option value="DEPT_ADMIN">مدیر واحد (Dept Admin)</option>
                  <option value="SUPER_ADMIN">مدیر ارشد سامانه (Super Admin)</option>
                </select>
              </div>

              {/* Permission: customers (CRM) */}
              <div className="p-3 bg-violet-50/70 rounded-2xl border border-violet-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-violet-900">
                    <Users className="w-4 h-4 text-violet-600" />
                    <span>دسترسی به مشتریان و فروش (CRM)</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">منوی «مشتریان» برای این کاربر فعال می‌شود: مشتری، فرصت فروش و پیگیری.</p>
                </div>
                <input type="checkbox" checked={newCanUseCrm} onChange={(e) => setNewCanUseCrm(e.target.checked)} className="w-5 h-5 accent-violet-600 rounded cursor-pointer shrink-0" />
              </div>

              {/* Permission Checkbox: Task management */}
              <div className="p-3 bg-sky-50/70 rounded-2xl border border-sky-200 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-sky-900">
                    <ClipboardList className="w-4 h-4 text-sky-600" />
                    <span>دسترسی به سیستم مدیریت وظایف</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    منوی «وظایف» برای این کاربر فعال می‌شود تا وظیفه تعریف کند، به همکاران واگذار کند و پیگیری کند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={newCanUseTasks}
                  onChange={(e) => setNewCanUseTasks(e.target.checked)}
                  className="w-5 h-5 accent-sky-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* CEO / Authorized Signatory Permission Checkbox */}
              <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 shadow-2xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-amber-900">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span>صاحب امضای مجاز / مدیرعامل (حق امضای رسمی)</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    فقط کاربرانی که این تیک را دارند می‌توانند نامه‌های رسمی را بررسی و امضای دیجیتال نهایی نمایند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={newCanSignOfficialLetters}
                  onChange={(e) => setNewCanSignOfficialLetters(e.target.checked)}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer shrink-0"
                />
              </div>

              {/* Permission Checkbox: Send Official Letters */}
              <div className="p-3.5 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE] flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-black text-xs text-[#3A241F]">
                    <FileCheck className="w-4 h-4 text-[#6E1B1B]" />
                    <span>مجوز ارسال و نگارش نامه رسمی</span>
                  </div>
                  <p className="text-[10px] text-[#8C6F66] leading-relaxed">
                    به کاربر امکان می‌دهد نامه‌های رسمی را تایپ یا بارگذاری کرده و جهت امضا به مدیریت ارسال کند.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={newCanSendOfficialLetters}
                  onChange={(e) => setNewCanSendOfficialLetters(e.target.checked)}
                  className="w-5 h-5 accent-[#6E1B1B] rounded cursor-pointer shrink-0"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-[#3A241F] uppercase mb-1">
                  <span>سهمیه اولیه فضای ذخیره‌سازی</span>
                  <span className="text-[#6E1B1B] font-black">{newQuotaGB} گیگابایت</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="5"
                  value={newQuotaGB}
                  onChange={(e) => setNewQuotaGB(parseInt(e.target.value))}
                  className="w-full accent-[#6E1B1B] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#EBDBCE]">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-xs cursor-pointer"
              >
                ایجاد حساب کاربری
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
