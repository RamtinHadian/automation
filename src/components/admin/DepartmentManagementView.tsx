import React, { useState } from 'react';
import {
    Building2,
    Plus,
    Edit2,
    Trash2,
    X,
    Save,
    Users,
    HardDrive,
    Hash,
    Palette,
    AlertTriangle,
    CheckCircle2,
} from 'lucide-react';
import { Department, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

interface DepartmentManagementViewProps {
    departments: Department[];
    staffList: User[];
    onCreateDepartment: (data: Omit<Department, 'id'>) => void;
    onUpdateDepartment: (deptId: string, updates: Partial<Department>) => void;
    onDeleteDepartment: (deptId: string) => void;
}

const PRESET_COLORS = [
    '#6E1B1B', '#D34A32', '#C98B6A', '#A8583B', '#563D34',
    '#8C6F66', '#3A241F', '#B8A39C', '#2E1A16', '#F6D9CD',
    '#1a6e3a', '#1a4a6e', '#6e1a5a', '#4a6e1a', '#6e6e1a',
];

const emptyForm = {
    name: '',
    code: '',
    color: '#6E1B1B',
    defaultQuotaGB: 50,
};

export const DepartmentManagementView: React.FC<DepartmentManagementViewProps> = ({
    departments,
    staffList,
    onCreateDepartment,
    onUpdateDepartment,
    onDeleteDepartment,
}) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [deletingDeptId, setDeletingDeptId] = useState<string | null>(null);
    const [form, setForm] = useState(emptyForm);

    const getUsersInDept = (deptId: string) =>
        staffList.filter((u) => u.departmentId === deptId);

    const getTotalUsedGB = (deptId: string) =>
        staffList
            .filter((u) => u.departmentId === deptId)
            .reduce((acc, u) => acc + u.storageUsedGB, 0);

    const getTotalQuotaGB = (deptId: string) =>
        staffList
            .filter((u) => u.departmentId === deptId)
            .reduce((acc, u) => acc + u.storageQuotaGB, 0);

    const openAddModal = () => {
        setForm(emptyForm);
        setIsAddModalOpen(true);
    };

    const openEditModal = (dept: Department) => {
        setEditingDept({ ...dept });
    };

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.code.trim()) return;
        onCreateDepartment({
            name: form.name.trim(),
            code: form.code.trim().toUpperCase(),
            color: form.color,
            defaultQuotaGB: form.defaultQuotaGB,
        });
        setIsAddModalOpen(false);
        setForm(emptyForm);
    };

    const handleUpdate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingDept) return;
        onUpdateDepartment(editingDept.id, {
            name: editingDept.name,
            code: editingDept.code.toUpperCase(),
            color: editingDept.color,
            defaultQuotaGB: editingDept.defaultQuotaGB,
        });
        setEditingDept(null);
    };

    const handleDelete = (deptId: string) => {
        onDeleteDepartment(deptId);
        setDeletingDeptId(null);
    };

    return (
        <div className="space-y-6 select-none font-sans">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#EBDBCE]">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl font-black text-[#3A241F] tracking-tight">
                            مدیریت واحدهای سازمانی
                        </h1>
                        <span className="bg-[#F6D9CD] text-[#6E1B1B] text-[10px] font-black px-2.5 py-0.5 rounded-full border border-[#C98B6A]/30 uppercase">
                            ساختار سازمان
                        </span>
                    </div>
                    <p className="text-xs text-[#8C6F66]">
                        تعریف، ویرایش و حذف واحدهای سازمانی، تنظیم سهمیه پیش‌فرض و رنگ‌بندی هر واحد
                    </p>
                </div>

                <button
                    onClick={openAddModal}
                    className="flex items-center gap-2 bg-[#6E1B1B] hover:bg-[#D34A32] text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-[#6E1B1B]/20 transition-all active:scale-95 self-start sm:self-auto"
                >
                    <Plus className="w-4 h-4" />
                    <span>تعریف واحد جدید</span>
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#EBDBCE] shadow-xs">
                    <div className="text-[11px] font-bold text-[#8C6F66] uppercase mb-1">تعداد واحدها</div>
                    <div className="text-2xl font-black text-[#3A241F]">{toPersianDigits(departments.length)}</div>
                    <div className="text-[11px] text-[#C98B6A] font-medium mt-0.5">واحد سازمانی فعال</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-[#EBDBCE] shadow-xs">
                    <div className="text-[11px] font-bold text-[#8C6F66] uppercase mb-1">کل کارمندان</div>
                    <div className="text-2xl font-black text-[#3A241F]">{toPersianDigits(staffList.length)}</div>
                    <div className="text-[11px] text-[#C98B6A] font-medium mt-0.5">نفر در سازمان</div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-[#EBDBCE] shadow-xs col-span-2 sm:col-span-1">
                    <div className="text-[11px] font-bold text-[#8C6F66] uppercase mb-1">میانگین سهمیه</div>
                    <div className="text-2xl font-black text-[#3A241F]">
                        {toPersianDigits(Math.round(departments.reduce((a, d) => a + d.defaultQuotaGB, 0) / (departments.length || 1)))} گیگابایت
                    </div>
                    <div className="text-[11px] text-[#C98B6A] font-medium mt-0.5">سهمیه پیش‌فرض هر واحد</div>
                </div>
            </div>

            {/* Departments Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {departments.map((dept) => {
                    const members = getUsersInDept(dept.id);
                    const usedGB = getTotalUsedGB(dept.id);
                    const quotaGB = getTotalQuotaGB(dept.id);
                    const percent = quotaGB > 0 ? Math.min(100, Math.round((usedGB / quotaGB) * 100)) : 0;

                    return (
                        <div
                            key={dept.id}
                            className="bg-white rounded-2xl border border-[#EBDBCE] shadow-xs overflow-hidden hover:shadow-md transition-shadow"
                        >
                            {/* Color Bar */}
                            <div
                                className="h-1.5 w-full"
                                style={{ backgroundColor: dept.color }}
                            />

                            <div className="p-5 space-y-4">
                                {/* Dept Header */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0"
                                            style={{ backgroundColor: dept.color }}
                                        >
                                            {dept.code.substring(0, 3)}
                                        </div>
                                        <div>
                                            <div className="font-black text-sm text-[#3A241F] leading-tight">{dept.name}</div>
                                            <div className="text-[11px] text-[#8C6F66] font-mono font-bold mt-0.5">
                                                کد: {dept.code}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => openEditModal(dept)}
                                            className="p-1.5 text-[#8C6F66] hover:text-[#6E1B1B] hover:bg-[#F6D9CD]/40 rounded-lg transition-colors"
                                            title="ویرایش واحد"
                                        >
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => setDeletingDeptId(dept.id)}
                                            className="p-1.5 text-[#8C6F66] hover:text-[#D34A32] hover:bg-[#F6D9CD]/40 rounded-lg transition-colors"
                                            title="حذف واحد"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Stats Row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-[#FAF5F1] rounded-xl p-3 text-center">
                                        <div className="flex items-center justify-center gap-1 text-[#8C6F66] mb-1">
                                            <Users className="w-3 h-3" />
                                            <span className="text-[10px] font-bold uppercase">کارمندان</span>
                                        </div>
                                        <div className="text-lg font-black text-[#3A241F]">{toPersianDigits(members.length)}</div>
                                        <div className="text-[10px] text-[#8C6F66]">نفر</div>
                                    </div>
                                    <div className="bg-[#FAF5F1] rounded-xl p-3 text-center">
                                        <div className="flex items-center justify-center gap-1 text-[#8C6F66] mb-1">
                                            <HardDrive className="w-3 h-3" />
                                            <span className="text-[10px] font-bold uppercase">سهمیه پیش‌فرض</span>
                                        </div>
                                        <div className="text-lg font-black text-[#3A241F]">{toPersianDigits(dept.defaultQuotaGB)}</div>
                                        <div className="text-[10px] text-[#8C6F66]">گیگابایت</div>
                                    </div>
                                </div>

                                {/* Storage Usage */}
                                {members.length > 0 && (
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold text-[#8C6F66]">
                                            <span>مصرف کل فضا</span>
                                            <span>
                                                <b className="text-[#3A241F]">{toPersianDigits(usedGB.toFixed(1))} گیگابایت</b> از {toPersianDigits(quotaGB)} گیگابایت ({toPersianDigits(percent)}٪)
                                            </span>
                                        </div>
                                        <div className="w-full bg-[#FAF5F1] rounded-full h-2 overflow-hidden border border-[#EBDBCE]">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{
                                                    width: `${percent}%`,
                                                    backgroundColor: dept.color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {members.length === 0 && (
                                    <div className="text-center py-1">
                                        <span className="text-[11px] text-[#B8A39C] font-medium">هیچ کارمندی در این واحد نیست</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ─── Add Department Modal ─── */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <form
                        onSubmit={handleCreate}
                        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-[#EBDBCE] space-y-5"
                    >
                        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
                            <div className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-[#6E1B1B]" />
                                <h3 className="font-bold text-sm text-[#3A241F]">تعریف واحد سازمانی جدید</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-1 text-[#8C6F66] hover:text-[#3A241F]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            {/* Name */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    نام واحد سازمانی <span className="text-[#D34A32]">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="مثال: فناوری اطلاعات"
                                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                                />
                            </div>

                            {/* Code */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    کد اختصاری (Code) <span className="text-[#D34A32]">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    maxLength={8}
                                    value={form.code}
                                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                                    placeholder="مثال: IT"
                                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] font-mono focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                                />
                            </div>

                            {/* Default Quota */}
                            <div>
                                <div className="flex justify-between text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    <span>سهمیه پیش‌فرض فضای ذخیره‌سازی</span>
                                    <span className="text-[#6E1B1B] font-black">{toPersianDigits(form.defaultQuotaGB)} گیگابایت</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="500"
                                    step="5"
                                    value={form.defaultQuotaGB}
                                    onChange={(e) => setForm({ ...form, defaultQuotaGB: parseInt(e.target.value) })}
                                    className="w-full accent-[#6E1B1B] cursor-pointer"
                                />
                                <div className="flex justify-between text-[10px] text-[#B8A39C] mt-1">
                                    <span>۵ GB</span>
                                    <span>۵۰۰ GB</span>
                                </div>
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    رنگ شناسه واحد
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setForm({ ...form, color: c })}
                                            className="w-7 h-7 rounded-lg border-2 transition-all"
                                            style={{
                                                backgroundColor: c,
                                                borderColor: form.color === c ? '#3A241F' : 'transparent',
                                                transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                                            }}
                                        />
                                    ))}
                                    <input
                                        type="color"
                                        value={form.color}
                                        onChange={(e) => setForm({ ...form, color: e.target.value })}
                                        className="w-7 h-7 rounded-lg cursor-pointer border border-[#EBDBCE]"
                                        title="رنگ دلخواه"
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="w-5 h-5 rounded-md" style={{ backgroundColor: form.color }} />
                                    <span className="text-[11px] font-mono text-[#8C6F66]">{form.color}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-[#EBDBCE]">
                            <button
                                type="button"
                                onClick={() => setIsAddModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl"
                            >
                                انصراف
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-sm transition-colors"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                ایجاد واحد سازمانی
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ─── Edit Department Modal ─── */}
            {editingDept && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                    <form
                        onSubmit={handleUpdate}
                        className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-[#EBDBCE] space-y-5"
                    >
                        <div className="flex items-center justify-between border-b border-[#EBDBCE] pb-3">
                            <div className="flex items-center gap-2">
                                <Edit2 className="w-5 h-5 text-[#6E1B1B]" />
                                <h3 className="font-bold text-sm text-[#3A241F]">ویرایش واحد: {editingDept.name}</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingDept(null)}
                                className="p-1 text-[#8C6F66] hover:text-[#3A241F]"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4 text-xs">
                            {/* Name */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    نام واحد سازمانی
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editingDept.name}
                                    onChange={(e) => setEditingDept({ ...editingDept, name: e.target.value })}
                                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                                />
                            </div>

                            {/* Code */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    کد اختصاری
                                </label>
                                <input
                                    type="text"
                                    required
                                    maxLength={8}
                                    value={editingDept.code}
                                    onChange={(e) => setEditingDept({ ...editingDept, code: e.target.value.toUpperCase() })}
                                    className="w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-[#3A241F] font-mono focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none"
                                />
                            </div>

                            {/* Default Quota */}
                            <div>
                                <div className="flex justify-between text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    <span>سهمیه پیش‌فرض</span>
                                    <span className="text-[#6E1B1B] font-black">{toPersianDigits(editingDept.defaultQuotaGB)} گیگابایت</span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="500"
                                    step="5"
                                    value={editingDept.defaultQuotaGB}
                                    onChange={(e) =>
                                        setEditingDept({ ...editingDept, defaultQuotaGB: parseInt(e.target.value) })
                                    }
                                    className="w-full accent-[#6E1B1B] cursor-pointer"
                                />
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-[11px] font-bold text-[#3A241F] uppercase mb-1.5">
                                    رنگ شناسه واحد
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setEditingDept({ ...editingDept, color: c })}
                                            className="w-7 h-7 rounded-lg border-2 transition-all"
                                            style={{
                                                backgroundColor: c,
                                                borderColor: editingDept.color === c ? '#3A241F' : 'transparent',
                                                transform: editingDept.color === c ? 'scale(1.2)' : 'scale(1)',
                                            }}
                                        />
                                    ))}
                                    <input
                                        type="color"
                                        value={editingDept.color}
                                        onChange={(e) => setEditingDept({ ...editingDept, color: e.target.value })}
                                        className="w-7 h-7 rounded-lg cursor-pointer border border-[#EBDBCE]"
                                        title="رنگ دلخواه"
                                    />
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <div className="w-5 h-5 rounded-md" style={{ backgroundColor: editingDept.color }} />
                                    <span className="text-[11px] font-mono text-[#8C6F66]">{editingDept.color}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-[#EBDBCE]">
                            <button
                                type="button"
                                onClick={() => setEditingDept(null)}
                                className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl"
                            >
                                انصراف
                            </button>
                            <button
                                type="submit"
                                className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-sm transition-colors"
                            >
                                <Save className="w-4 h-4" />
                                ذخیره تغییرات
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* ─── Delete Confirmation Modal ─── */}
            {deletingDeptId && (() => {
                const dept = departments.find((d) => d.id === deletingDeptId);
                const membersCount = getUsersInDept(deletingDeptId).length;
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 border border-[#EBDBCE] space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-[#D34A32]/10 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-[#D34A32]" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-[#3A241F]">حذف واحد سازمانی</h3>
                                    <p className="text-[11px] text-[#8C6F66]">این عملیات قابل بازگشت نیست</p>
                                </div>
                            </div>

                            <div className="bg-[#FAF5F1] rounded-xl p-3 text-xs text-[#3A241F] space-y-1">
                                <div className="font-bold">{dept?.name}</div>
                                <div className="text-[#8C6F66]">کد: {dept?.code}</div>
                                {membersCount > 0 ? (
                                    <div className="flex items-center gap-1.5 text-[#D34A32] font-bold mt-2">
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        <span>{toPersianDigits(membersCount)} کارمند در این واحد وجود دارد. ابتدا آن‌ها را منتقل کنید.</span>
                                    </div>
                                ) : (
                                    <div className="text-[#8C6F66] mt-1">هیچ کارمندی در این واحد نیست.</div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    onClick={() => setDeletingDeptId(null)}
                                    className="px-4 py-2 text-xs font-semibold text-[#8C6F66] hover:bg-[#FAF5F1] rounded-xl"
                                >
                                    انصراف
                                </button>
                                <button
                                    onClick={() => handleDelete(deletingDeptId)}
                                    disabled={membersCount > 0}
                                    className="px-5 py-2 text-xs font-bold bg-[#D34A32] hover:bg-[#6E1B1B] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-colors"
                                >
                                    حذف واحد
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
