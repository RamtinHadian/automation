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
  BarChart3,
  Megaphone,
  ShieldCheck,
  Users,
  MessageSquare,
  Warehouse,
} from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { User, UserRole, Department } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { UserEditorDialog, UserForm } from './UserEditorDialog';
import { PermissionMatrix } from './PermissionMatrix';
import { matchesAll } from '../../lib/searchAll';

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
    canViewStats?: boolean;
    canPostAnnouncements?: boolean;
    canUseWarranty?: boolean;
    canSendSms?: boolean;
    canUseWarehouse?: boolean;
    extension?: string;
    extensions?: string[];
  }) => void;
  onUpdateUser: (userId: string, updates: Partial<User>) => void;
  /** kept for compatibility: users are never deleted, only switched off */
  onDeleteUser?: (userId: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  departments,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const { reloadState } = useAppContext();
  const [search, setSearch] = useState('');
  // The CEO («مدیرعامل») is one person: before giving the tick to someone else, ask and warn.
  const [ceoAsk, setCeoAsk] = useState<{ holder: User; target: string; apply: () => void } | null>(null);
  const askCeo = (targetId: string, targetName: string, apply: () => void) => {
    const holder = users.find((u) => u.id !== targetId && u.canSignOfficialLetters);
    if (holder) setCeoAsk({ holder, target: targetName || 'این کاربر', apply });
    else apply();
  };
  const afterCeoChange = () => {
    window.setTimeout(reloadState, 1200);
    window.setTimeout(reloadState, 3000);
  };
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [view, setView] = useState<'list' | 'matrix' | 'inactive'>('list');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Add User Form State
  const emptyForm = (): UserForm => ({
    fullName: '',
    email: '',
    password: '123456',
    role: 'STAFF',
    departmentId: departments[0]?.id || '',
    storageQuotaGB: 50,
    canSendOfficialLetters: false,
    canSignOfficialLetters: false,
    canUseTasks: false,
    canUseCrm: false,
    canViewStats: false,
    canPostAnnouncements: false,
    canUseWarranty: false,
    canSendSms: false,
    canUseWarehouse: false,
    extension: '',
  });
  const [newForm, setNewForm] = useState<UserForm>(emptyForm);

  // nobody is ever deleted: a person who is switched off goes to the folder of the inactive ones, from where they come back with one click
  const inactiveUsers = users.filter((u) => u.isActive === false);
  const filteredUsers = users.filter((u) => {
    const matchesSearch = matchesAll(u, search);
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return u.isActive !== false && matchesSearch && matchesRole;
  });

  const handleCreateUser = () => {
    if (!newForm.fullName.trim() || !newForm.email.trim()) return;

    const dept = departments.find((d) => d.id === newForm.departmentId) || departments[0];
    onAddUser({
      fullName: newForm.fullName.trim(),
      email: newForm.email.trim(),
      password: newForm.password || '123456',
      role: newForm.role,
      departmentId: dept.id,
      quotaGB: newForm.storageQuotaGB,
      canSendOfficialLetters: newForm.canSendOfficialLetters,
      canSignOfficialLetters: newForm.canSignOfficialLetters,
      canUseTasks: newForm.canUseTasks,
      canUseCrm: newForm.canUseCrm,
      canViewStats: newForm.canViewStats,
      canPostAnnouncements: newForm.canPostAnnouncements,
      canUseWarranty: newForm.canUseWarranty,
      canSendSms: newForm.canSendSms,
      canUseWarehouse: newForm.canUseWarehouse,
      extension: (newForm.extension || '').trim(),
      extensions: (newForm.extensions || []).map((x) => x.trim()).filter(Boolean),
    });

    if (newForm.canSignOfficialLetters) afterCeoChange();
    setIsAddModalOpen(false);
    setNewForm(emptyForm());
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

      {/* two views of the same people: the list, and the table of permissions (a tick for each section of each employee) */}
      <div className="inline-flex gap-1 p-1 rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE]">
        {([['list', 'فهرست کاربران'], ['matrix', 'جدول مجوزها'], ['inactive', `پوشهٔ غیرفعال‌ها (${toPersianDigits(inactiveUsers.length)})`]] as const).map(([id, text]) => (
          <button key={id} type="button" onClick={() => setView(id)} data-users-view={id} className={`px-5 py-2 rounded-xl text-xs font-black cursor-pointer transition-all ${view === id ? 'bg-[#6E1B1B] text-white shadow-md' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>
            {text}
          </button>
        ))}
      </div>

      {view === 'inactive' && (
        <div className="space-y-3" data-inactive-folder>
          <p className="text-[11px] font-bold text-[#8C6F66]">کاربری که غیرفعال می‌شود از سامانه حذف نمی‌شود: نامه‌ها، فایل‌ها و سابقه‌اش می‌ماند و فقط نمی‌تواند وارد شود. با «بازگرداندن» دوباره فعال می‌شود.</p>
          {inactiveUsers.length === 0 ? (
            <div className="text-center text-xs font-bold text-gray-400 py-12 bg-white border border-dashed border-[#EBDBCE] rounded-2xl">کاربر غیرفعالی نیست.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {inactiveUsers.map((u) => (
                <div key={u.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-[#3A241F] truncate">{u.fullName}</div>
                    <div className="text-[11px] font-bold text-[#8C6F66] truncate">{u.departmentName} · {u.email}</div>
                  </div>
                  <button type="button" onClick={() => onUpdateUser(u.id, { isActive: true })} data-restore-user={u.id} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black cursor-pointer hover:bg-emerald-100">
                    <UserCheck className="w-4 h-4" />
                    بازگرداندن
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'matrix' && <PermissionMatrix users={users} departments={departments} onUpdateUser={onUpdateUser} />}

      {view === 'list' && (<>
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
                <th className="py-3 px-4">مجوزها</th>
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
                      {/* Compact: one small icon per permission (the name shows on hover), all in a single row */}
                      <div className="flex flex-wrap items-center gap-1 max-w-[132px]">
                        {([
                          [user.canSignOfficialLetters, Award, 'صاحب امضای مجاز (مدیرعامل)', 'bg-amber-100 text-amber-700 border-amber-300'],
                          [user.canSendOfficialLetters, FileCheck, 'مجوز ارسال نامه', 'bg-emerald-100 text-emerald-700 border-emerald-300'],
                          [user.canUseTasks, ClipboardList, 'مدیریت وظایف', 'bg-sky-100 text-sky-700 border-sky-300'],
                          [user.canUseCrm, Users, 'مشتریان (CRM)', 'bg-violet-100 text-violet-700 border-violet-300'],
                          [user.canViewStats, BarChart3, 'گزارشات آماری مدیریتی', 'bg-orange-100 text-orange-700 border-orange-300'],
                          [user.canPostAnnouncements, Megaphone, 'تابلو اعلانات', 'bg-amber-100 text-amber-800 border-amber-300'],
                          [user.canUseWarranty, ShieldCheck, 'گارانتی', 'bg-teal-100 text-teal-700 border-teal-300'],
                          [user.canSendSms, MessageSquare, 'ارسال پیامک', 'bg-sky-100 text-sky-700 border-sky-300'],
                          [user.canUseWarehouse, Warehouse, 'انبارداری', 'bg-amber-100 text-amber-700 border-amber-300'],
                        ] as const).map(([on, Icon, label, cls]) =>
                          on ? (
                            <span key={label} title={label} className={`w-6 h-6 inline-flex items-center justify-center rounded-lg border ${cls}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </span>
                          ) : null
                        )}
                        {!user.canSignOfficialLetters && !user.canSendOfficialLetters && !user.canUseTasks && !user.canUseCrm && !user.canViewStats && !user.canPostAnnouncements && !user.canUseWarranty && !user.canSendSms && !user.canUseWarehouse && (
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
                          onClick={async () => { if (await askConfirm(`«${user.fullName}» غیرفعال شود؟ دسترسی‌اش قطع می‌شود و به پوشهٔ «غیرفعال‌ها» می‌رود؛ هر زمان بخواهید از همان‌جا برمی‌گردانید. هیچ اطلاعاتی پاک نمی‌شود.`, { title: 'غیرفعال کردن کاربر؟', confirmText: 'بله، غیرفعال شود' })) onUpdateUser(user.id, { isActive: false }); }}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${user.isActive
                            ? 'text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/40'
                            : 'text-[#6E1B1B] hover:bg-[#F6D9CD]/40'
                            }`}
                          title="غیرفعال کردن (به پوشهٔ غیرفعال‌ها می‌رود)"
                        >
                          <UserX className="w-4 h-4" />
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
      </>)}

      {editingUser && (
        <UserEditorDialog
          mode="edit"
          form={editingUser}
          set={(patch) =>
            setEditingUser((cur) => {
              if (!cur) return cur;
              const d = patch.departmentId ? departments.find((x) => x.id === patch.departmentId) : undefined;
              return { ...cur, ...patch, ...(d ? { departmentName: d.name } : {}) };
            })
          }
          departments={departments}
          quotaMax={2000}
          onClose={() => setEditingUser(null)}
          onToggleCeo={(on) => {
            const apply = () => setEditingUser((cur) => (cur ? { ...cur, canSignOfficialLetters: on } : cur));
            if (on) askCeo(editingUser.id, editingUser.fullName, apply);
            else apply();
          }}
          onSubmit={() => {
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
            // an extension belongs to one person only
            const mine = [editingUser.extension || '', ...(editingUser.extensions || [])].map((x) => x.trim()).filter(Boolean);
            const clash = mine.find((x, i) => mine.indexOf(x) !== i) || mine.find((x) => users.some((u) => u.id !== editingUser.id && u.isActive !== false && [u.extension || '', ...(u.extensions || [])].includes(x)));
            if (clash) {
              window.alert(`داخلی ${clash} تکراری است؛ هر داخلی فقط برای یک نفر می‌تواند باشد.`);
              return;
            }
            const ceoBefore = !!users.find((u) => u.id === editingUser.id)?.canSignOfficialLetters;
            onUpdateUser(editingUser.id, { ...editingUser, fullName: name, email: login, extensions: (editingUser.extensions || []).map((x) => x.trim()).filter(Boolean), mobiles: (editingUser.mobiles || []).map((x) => x.trim()).filter(Boolean) });
            if (ceoBefore !== !!editingUser.canSignOfficialLetters) afterCeoChange();
            setEditingUser(null);
          }}
        />
      )}

      {isAddModalOpen && (
        <UserEditorDialog
          mode="add"
          form={newForm}
          set={(patch) => setNewForm((cur) => ({ ...cur, ...patch }))}
          departments={departments}
          quotaMax={500}
          onClose={() => setIsAddModalOpen(false)}
          onToggleCeo={(on) => {
            if (on) askCeo('', newForm.fullName, () => setNewForm((cur) => ({ ...cur, canSignOfficialLetters: true })));
            else setNewForm((cur) => ({ ...cur, canSignOfficialLetters: false }));
          }}
          onSubmit={handleCreateUser}
        />
      )}

      {ceoAsk && (
        <div className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl border border-purple-200 shadow-2xl w-full max-w-md p-6 space-y-4 text-right">
            <div className="flex items-center gap-2 font-black text-sm text-purple-900">
              <Award className="w-5 h-5 text-purple-600" />
              <span>تغییر مدیرعامل؟</span>
            </div>
            <p className="text-[13px] leading-7 text-[#3A241F]">
              «<b>{ceoAsk.holder.fullName}</b>» از قبل به‌عنوان مدیرعامل (صاحب امضای مجاز) ثبت شده است و این سمت فقط برای یک نفر ممکن است.
              <br />
              <b>آیا مدیرعامل عوض شده است؟</b> با تأیید، این سمت از «{ceoAsk.holder.fullName}» برداشته و به «{ceoAsk.target}» داده می‌شود.
            </p>
            <div className="rounded-2xl bg-purple-50 border border-purple-200 p-3 text-[11px] leading-6 text-purple-900 font-bold">
              نام مدیرعامل جدید خودکار روی نامه‌ها و همه‌جای سامانه می‌نشیند و «{ceoAsk.holder.fullName}» دیگر نمی‌تواند نامه امضا کند.
            </div>
            <div className="rounded-2xl bg-purple-50 border border-purple-200 p-3 text-[11px] leading-6 text-purple-900 font-bold">
              این تغییر با نام شما، زمان و نشانی شبکه در گزارش رویدادهای سامانه با رنگ ویژه ثبت می‌شود و به هیچ عنوان قابل حذف یا ویرایش نیست.
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCeoAsk(null)} className="px-4 py-2 text-xs font-bold text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] rounded-xl cursor-pointer">
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  const go = ceoAsk.apply;
                  setCeoAsk(null);
                  go();
                }}
                className="px-4 py-2 text-xs font-black text-white bg-purple-700 hover:bg-purple-800 rounded-xl cursor-pointer"
              >
                بله، مدیرعامل عوض شده
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
