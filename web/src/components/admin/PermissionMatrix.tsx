import React, { useMemo, useState } from 'react';
import { Check, Lock, Search, ShieldCheck } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { Department, User } from '../../types';
import { PERMISSIONS, PERM_GROUPS, hasPerm, isAdminUser, permPatch, permPatchMany } from '../../lib/permissions';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'مدیر ارشد', DEPT_ADMIN: 'مدیر واحد', STAFF: 'کارمند' };

/** One row per employee, one column per permission, a tick to give it: every change is saved at once. */
export const PermissionMatrix: React.FC<{ users: User[]; departments: Department[]; onUpdateUser: (id: string, updates: Partial<User>) => void }> = ({ users, departments, onUpdateUser }) => {
  const { showToast } = useAppContext();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [onlyStaff, setOnlyStaff] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => !dept || u.departmentId === dept)
      .filter((u) => !onlyStaff || !isAdminUser(u))
      .filter((u) => !needle || `${u.fullName} ${u.email} ${u.departmentName}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(isAdminUser(a)) - Number(isAdminUser(b)) || a.fullName.localeCompare(b.fullName, 'fa'));
  }, [users, q, dept, onlyStaff]);

  const people = rows.filter((u) => !isAdminUser(u));
  const toggle = (u: User, id: string) => {
    const p = PERMISSIONS.find((x) => x.id === id)!;
    const on = !hasPerm(u, p);
    onUpdateUser(u.id, permPatch(u, p, on));
    showToast(`«${p.label}» برای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  const rowAll = (u: User, on: boolean) => {
    onUpdateUser(u.id, permPatchMany(u, PERMISSIONS, on));
    showToast(`همهٔ مجوزهای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  const colAll = async (id: string) => {
    const p = PERMISSIONS.find((x) => x.id === id)!;
    const every = people.length > 0 && people.every((u) => hasPerm(u, p));
    if (people.length === 0) return;
    if (!(await askConfirm(`«${p.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شود؟`, { tone: 'warning', title: 'تغییر مجوز برای همه؟', confirmText: 'بله، اعمال شود' }))) return;
    people.forEach((u) => onUpdateUser(u.id, permPatch(u, p, !every)));
    showToast(`«${p.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شد.`);
  };

  const groupCols = PERM_GROUPS.map((g) => ({ g, cols: PERMISSIONS.filter((p) => p.group === g.id) })).filter((x) => x.cols.length > 0);

  return (
    <div className="space-y-4" data-permission-matrix>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی کارمند…" className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs focus:ring-2 focus:ring-[#D34A32]/20 focus:outline-none" />
        </div>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none">
          <option value="">همهٔ واحدها</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-3 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-black text-[#3A241F] cursor-pointer">
          <input type="checkbox" checked={onlyStaff} onChange={(e) => setOnlyStaff(e.target.checked)} className="accent-[#6E1B1B]" />
          فقط کارمندان عادی
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-[#8C6F66]">
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-[#6E1B1B] inline-flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>مجوز داده شده</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md border-2 border-[#D9C7BC] inline-block" />ندارد</span>
        <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" />مدیران همهٔ مجوزها را دارند</span>
        <span>برای دیدن توضیح هر ستون، نشانگر را روی نامش ببرید؛ با کلیک روی نام ستون برای همه تیک زده یا برداشته می‌شود.</span>
      </div>

      <div className="bg-white rounded-2xl border border-[#EBDBCE] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th rowSpan={2} className="sticky right-0 z-20 bg-[#FAF5F1] border-b border-l border-[#EBDBCE] py-3 px-4 text-[11px] font-black text-[#8C6F66] min-w-[190px]">کارمند</th>
                {groupCols.map(({ g, cols }) => (
                  <th key={g.id} colSpan={cols.length} className="border-b border-l border-[#EBDBCE] py-2 px-2 text-center text-[11px] font-black text-white" style={{ background: g.tone }}>
                    {g.title}
                  </th>
                ))}
                <th rowSpan={2} className="bg-[#FAF5F1] border-b border-[#EBDBCE] py-3 px-3 text-[11px] font-black text-[#8C6F66] whitespace-nowrap">همه / هیچ</th>
              </tr>
              <tr className="bg-[#FAF5F1]">
                {groupCols.flatMap(({ g, cols }) =>
                  cols.map((p) => (
                    <th key={p.id} className="border-b border-l border-[#EBDBCE] px-1.5 py-2 text-center align-bottom w-[84px]">
                      <button type="button" title={p.hint} onClick={() => colAll(p.id)} className="text-[10.5px] font-black leading-4 cursor-pointer hover:underline" style={{ color: g.tone }}>
                        {p.label}
                      </button>
                      <div className="text-[9px] font-bold text-[#B8A39C] mt-0.5">{toPersianDigits(people.filter((u) => hasPerm(u, p)).length)} از {toPersianDigits(people.length)}</div>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const admin = isAdminUser(u);
                const given = PERMISSIONS.filter((p) => hasPerm(u, p)).length;
                return (
                  <tr key={u.id} className="border-b border-[#F3E8DF] last:border-0 hover:bg-[#FFFBF8]">
                    <td className="sticky right-0 z-10 bg-white border-l border-[#EBDBCE] py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-[11px] font-black text-white shrink-0 ${admin ? 'bg-[#6E1B1B]' : 'bg-[#8C6F66]'}`}>{(u.fullName || '؟').trim().slice(0, 1)}</span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-[#3A241F] truncate max-w-[140px]">{u.fullName}</span>
                          <span className="block text-[10px] font-bold text-[#8C6F66] truncate max-w-[140px]">{ROLE_LABEL[u.role] || u.role} · {u.departmentName}</span>
                        </span>
                      </div>
                    </td>
                    {PERMISSIONS.map((p) => {
                      const on = admin || hasPerm(u, p);
                      const tone = PERM_GROUPS.find((g) => g.id === p.group)!.tone;
                      return (
                        <td key={p.id} className="border-l border-[#F3E8DF] text-center py-2">
                          {admin ? (
                            <span title="مدیران همهٔ مجوزها را دارند" className="inline-flex w-6 h-6 rounded-lg items-center justify-center opacity-40" style={{ background: tone }}>
                              <Check className="w-4 h-4 text-white" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={on}
                              aria-label={`${p.label} برای ${u.fullName}`}
                              onClick={() => toggle(u, p.id)}
                              className="inline-flex w-7 h-7 rounded-lg items-center justify-center cursor-pointer transition-all active:scale-90 border-2"
                              style={on ? { background: tone, borderColor: tone } : { background: '#fff', borderColor: '#D9C7BC' }}
                              data-perm={p.id}
                              data-user={u.id}
                            >
                              {on && <Check className="w-4 h-4 text-white" />}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-center whitespace-nowrap">
                      {admin ? (
                        <ShieldCheck className="w-4 h-4 text-[#6E1B1B] inline" />
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => rowAll(u, true)} className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">همه</button>
                          <button type="button" onClick={() => rowAll(u, false)} className="px-2 py-1 rounded-lg text-[10px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer">هیچ</button>
                          <span className="text-[10px] font-bold text-[#B8A39C] w-9 text-left">{toPersianDigits(given)}/{toPersianDigits(PERMISSIONS.length)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12">کارمندی پیدا نشد.</div>}
      </div>
      <p className="text-[11px] leading-6 text-[#8C6F66]">
        «مدیرعامل / صاحب امضای مجاز» فقط یک نفر است و از «ویرایش کاربر» تعیین می‌شود. هر تیک همان لحظه ذخیره می‌شود و کارمند از تغییر مجوزهایش با یک اعلان باخبر می‌شود. هر منو یا ابزار تازه‌ای که به سامانه اضافه شود، خودکار یک ستون در همین جدول می‌گیرد.
      </p>
    </div>
  );
};
