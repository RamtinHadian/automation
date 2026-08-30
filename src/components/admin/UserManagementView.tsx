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
  UserX
} from 'lucide-react';
import { User, UserRole, Department } from '../../types';
import { DEPARTMENTS } from '../../lib/mock-data';

interface UserManagementViewProps {
  users: User[];
  onAddUser: (user: Partial<User>) => void;
  onUpdateUser: (userId: string, updates: Partial<User>) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
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
  const [newRole, setNewRole] = useState<UserRole>('STAFF');
  const [newDeptId, setNewDeptId] = useState(DEPARTMENTS[0].id);
  const [newQuotaGB, setNewQuotaGB] = useState(50);

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

    const dept = DEPARTMENTS.find((d) => d.id === newDeptId) || DEPARTMENTS[0];
    onAddUser({
      fullName: newFullName,
      email: newEmail,
      role: newRole,
      departmentId: dept.id,
      departmentName: dept.name,
      storageQuotaGB: newQuotaGB,
      storageUsedGB: 0,
      isActive: true,
      avatarUrl: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80`,
      avatarInitials: newFullName.split(' ').map((n) => n[0]).join('').substring(0, 2),
    });

    setIsAddModalOpen(false);
    setNewFullName('');
    setNewEmail('');
  };

  return (
    <div className="space-y-6 select-none font-sans">
      {/* Header & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900 tracking-tight">
              مدیریت کاربران و سهمیه‌های سازمانی
            </h1>
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              مدیر ارشد
            </span>
          </div>
          <p className="text-xs text-gray-500">
            تعریف نقش‌ها، تخصیص به واحدهای سازمانی و تنظیم سقف فضای ذخیره‌سازی کارکنان
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 bg-[#1967d2] hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all active:scale-95 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>افزودن کارمند جدید</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام، ایمیل سازمانی یا واحد..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-blue-100 focus:outline-none"
        >
          <option value="ALL">همه نقش‌ها</option>
          <option value="SUPER_ADMIN">مدیران ارشد (Super Admin)</option>
          <option value="DEPT_ADMIN">مدیران واحدها</option>
          <option value="STAFF">پرسنل عادی</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="py-3 px-4">کارمند</th>
                <th className="py-3 px-4">واحد سازمانی</th>
                <th className="py-3 px-4">سطح دسترسی (نقش)</th>
                <th className="py-3 px-4">مصرف / سهمیه فضا</th>
                <th className="py-3 px-4">وضعیت</th>
                <th className="py-3 px-4 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {filteredUsers.map((user) => {
                const percent = Math.min(100, Math.round((user.storageUsedGB / user.storageQuotaGB) * 100));
                return (
                  <tr key={user.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* User Info */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={user.avatarUrl}
                          alt={user.fullName}
                          className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-100"
                        />
                        <div>
                          <div className="font-bold text-gray-900">{user.fullName}</div>
                          <div className="text-[11px] text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Department */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                        <Building className="w-3 h-3 text-gray-400" />
                        {user.departmentName}
                      </span>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-4">
                      {user.role === 'SUPER_ADMIN' ? (
                        <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          مدیر ارشد
                        </span>
                      ) : user.role === 'DEPT_ADMIN' ? (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          مدیر واحد
                        </span>
                      ) : (
                        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide">
                          کارمند
                        </span>
                      )}
                    </td>

                    {/* Storage Progress */}
                    <td className="py-3.5 px-4 min-w-48">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-gray-500">
                          <span>{user.storageUsedGB.toFixed(1)} GB مصرفی</span>
                          <span>{user.storageQuotaGB >= 1000 ? `${user.storageQuotaGB / 1000} TB` : `${user.storageQuotaGB} GB`} سهمیه</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percent > 85 ? 'bg-red-500' : percent > 60 ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> فعال
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-gray-400 font-bold text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-gray-300" /> مسدود / معلق
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="ویرایش سهمیه و نقش"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onUpdateUser(user.id, { isActive: !user.isActive })}
                          className={`p-1.5 rounded-lg transition-colors ${
                            user.isActive
                              ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                              : 'text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={user.isActive ? 'مسدود کردن' : 'فعال‌سازی'}
                        >
                          {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => onDeleteUser(user.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900">
                ویرایش سهمیه و نقش: {editingUser.fullName}
              </h3>
              <button onClick={() => setEditingUser(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  واحد سازمانی
                </label>
                <select
                  value={editingUser.departmentId}
                  onChange={(e) => {
                    const d = DEPARTMENTS.find((dept) => dept.id === e.target.value);
                    if (d) {
                      setEditingUser({ ...editingUser, departmentId: d.id, departmentName: d.name });
                    }
                  }}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  سطح دسترسی و نقش
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as UserRole })}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  <option value="STAFF">پرسنل عادی (Staff)</option>
                  <option value="DEPT_ADMIN">مدیر واحد (Dept Admin)</option>
                  <option value="SUPER_ADMIN">مدیر ارشد سامانه (Super Admin)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-gray-600 uppercase mb-1">
                  <span>سقف سهمیه فضای ابری</span>
                  <span className="text-blue-600 font-black">{editingUser.storageQuotaGB} گیگابایت</span>
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
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                انصراف
              </button>
              <button
                onClick={() => {
                  onUpdateUser(editingUser.id, editingUser);
                  setEditingUser(null);
                }}
                className="px-5 py-2 text-xs font-bold bg-[#1967d2] hover:bg-blue-700 text-white rounded-xl shadow-xs"
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
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-sm text-gray-900">تعریف کارمند جدید در سامانه</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="مثال: علی رضایی"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  ایمیل سازمانی
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="مثال: ali.r@company.internal"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  واحد سازمانی
                </label>
                <select
                  value={newDeptId}
                  onChange={(e) => setNewDeptId(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                  نقش سازمانی
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-semibold"
                >
                  <option value="STAFF">پرسنل عادی (Staff)</option>
                  <option value="DEPT_ADMIN">مدیر واحد (Dept Admin)</option>
                  <option value="SUPER_ADMIN">مدیر ارشد سامانه (Super Admin)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-gray-600 uppercase mb-1">
                  <span>سهمیه اولیه فضای ذخیره‌سازی</span>
                  <span className="text-blue-600 font-black">{newQuotaGB} گیگابایت</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="500"
                  step="5"
                  value={newQuotaGB}
                  onChange={(e) => setNewQuotaGB(parseInt(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold bg-[#1967d2] hover:bg-blue-700 text-white rounded-xl shadow-xs"
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
