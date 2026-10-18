import React, { useMemo, useState } from 'react';
import { Check, Lock, Search, ShieldCheck } from 'lucide-react';
import { Department, User } from '../../types';
import { COLUMNS, Column, MENUS, colOn, colPatch, colPatchMany, isAdminUser } from '../../lib/permissions';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { matchesAll } from '../../lib/searchAll';

const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: 'مدیر ارشد', DEPT_ADMIN: 'مدیر واحد', STAFF: 'کارمند' };

/**
 * One row per employee; the columns are every menu of the application, each followed by its sub-menus (lib/permissions.ts).
 * A tick gives the right and is saved at once. A sub-menu is open by default and a person sees it only when the menu itself is open for them.
 */
export const PermissionMatrix: React.FC<{ users: User[]; departments: Department[]; onUpdateUser: (id: string, updates: Partial<User>) => void }> = ({ users, departments, onUpdateUser }) => {
  const { showToast } = useAppContext();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [onlyStaff, setOnlyStaff] = useState(false);

  const rows = useMemo(() => {
    return users
      .filter((u) => u.isActive !== false)
      .filter((u) => !dept || u.departmentId === dept)
      .filter((u) => !onlyStaff || !isAdminUser(u))
      .filter((u) => matchesAll(u, q))
      .sort((a, b) => Number(isAdminUser(a)) - Number(isAdminUser(b)) || a.fullName.localeCompare(b.fullName, 'fa'));
  }, [users, q, dept, onlyStaff]);

  const people = rows.filter((u) => !isAdminUser(u));
  const toneOf = (menuId: string) => MENUS.find((m) => m.id === menuId)!.tone;
  const menuOpen = (u: User, menuId: string) => {
    const m = MENUS.find((x) => x.id === menuId)!;
    if (m.main) return colOn(u, COLUMNS.find((c) => c.id === m.main!.id)!);
    if (m.id === 'sepidar') return m.subs.some((s) => colOn(u, COLUMNS.find((c) => c.id === s.id)!));
    return true;
  };

  const toggle = (u: User, c: Column) => {
    const on = !colOn(u, c);
    onUpdateUser(u.id, colPatch(u, c, on));
    showToast(`«${c.label}» برای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  const rowAll = (u: User, on: boolean) => {
    onUpdateUser(u.id, colPatchMany(u, COLUMNS, on));
    showToast(`همهٔ مجوزهای ${u.fullName} ${on ? 'داده شد' : 'گرفته شد'}.`);
  };
  const colAll = async (c: Column) => {
    if (people.length === 0) return;
    const every = people.every((u) => colOn(u, c));
    if (!(await askConfirm(`«${c.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شود؟`, { tone: 'warning', title: 'تغییر مجوز برای همه؟', confirmText: 'بله، اعمال شود' }))) return;
    people.forEach((u) => onUpdateUser(u.id, colPatch(u, c, !every)));
    showToast(`«${c.label}» برای ${toPersianDigits(people.length)} نفر ${every ? 'گرفته' : 'داده'} شد.`);
  };

  const menuCols = MENUS.map((m) => ({ m, cols: COLUMNS.filter((c) => c.menuId === m.id) })).filter((x) => x.cols.length > 0);

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-[#8C6F66]">
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-[#6E1B1B] inline-flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>باز است</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md border-2 border-[#D9C7BC] inline-block" />بسته است</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-md bg-[#6E1B1B]/30 inline-flex items-center justify-center"><Check className="w-3 h-3 text-white" /></span>خود منو بسته است؛ زیرمنو دیده نمی‌شود</span>
        <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" />مدیران همه‌چیز را دارند</span>
        <span>ستون‌ها: اول خود منو، بعد زیرمنوهایش (↳). با کلیک روی نام ستون برای همه تیک زده یا برداشته می‌شود.</span>
      </div>

      {/* wide screens: one table that fits the page (no sideways scrolling): the column titles stand upright */}
      <div className="hidden md:block bg-white rounded-2xl border border-[#EBDBCE] overflow-clip shadow-xs">
        <table className="w-full table-fixed text-right text-xs border-collapse">
          <colgroup>
            <col style={{ width: 168 }} />
            {COLUMNS.map((c) => (
              <col key={c.id} />
            ))}
            <col style={{ width: 92 }} />
          </colgroup>
          {/* the page area has padding (12 / 24 / 32px): the header sticks at minus that, flush with the top edge, so no row shows above it */}
          <thead className="sticky top-[-12px] sm:top-[-24px] lg:top-[-32px] z-20">
            <tr>
              <th rowSpan={2} className="bg-[#FAF5F1] border-b-2 border-b-[#EBDBCE] border-l border-[#EBDBCE] py-3 px-3 text-[11px] font-black text-[#8C6F66]">کارمند</th>
              {menuCols.map(({ m, cols }) =>
                cols.length === 1 ? (
                  // a menu with one column only (no sub-menus): its title stands upright over the whole header height, there is no room for it across
                  <th key={m.id} rowSpan={2} className="border-b border-l-2 border-white/60 px-0 py-2 text-center align-bottom text-white" style={{ background: m.tone }}>
                    <button type="button" title={cols[0].hint} onClick={() => colAll(cols[0])} className="mx-auto block h-[190px] text-[11px] font-black leading-4 cursor-pointer whitespace-nowrap text-white" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {m.title}
                    </button>
                    <div className="mt-2 mx-auto w-5 rounded-md bg-white/20 text-[9px] font-black text-white leading-[18px] mb-1.5" title="چند نفر دارند">{toPersianDigits(people.filter((u) => colOn(u, cols[0])).length)}</div>
                  </th>
                ) : (
                  <th key={m.id} colSpan={cols.length} className="border-b border-l-2 border-white/60 py-2 px-1 text-center text-[10px] font-black text-white leading-4" style={{ background: m.tone }}>
                    {m.title}
                  </th>
                ),
              )}
              <th rowSpan={2} className="bg-[#FAF5F1] border-b border-[#EBDBCE] py-3 px-1 text-[11px] font-black text-[#8C6F66]">همه / هیچ</th>
            </tr>
            <tr className="bg-[#FAF5F1]">
              {menuCols.filter(({ cols }) => cols.length > 1).flatMap(({ m, cols }) =>
                cols.map((c, i) => (
                  <th key={c.id} className={`border-b border-[#EBDBCE] px-0 pt-2 pb-1 text-center align-bottom ${i === 0 ? 'border-r-2 border-r-white' : 'border-l border-l-[#F3E8DF]'}`} style={{ background: c.isMain ? `linear-gradient(${m.tone}14, ${m.tone}14), #FAF5F1` : '#FAF5F1' }}>
                    <button type="button" title={c.hint} onClick={() => colAll(c)} className="mx-auto block h-[190px] text-[10.5px] font-black leading-4 cursor-pointer hover:underline whitespace-nowrap" style={{ color: m.tone, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                      {c.isMain ? '' : '↳ '}
                      {c.label}
                    </button>
                    <div className="mt-2 mx-auto w-5 rounded-md bg-[#F3E8DF] text-[9px] font-black text-[#8C6F66] leading-[18px] mb-1.5" title="چند نفر دارند">{toPersianDigits(people.filter((u) => colOn(u, c)).length)}</div>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const admin = isAdminUser(u);
              const given = COLUMNS.filter((c) => colOn(u, c)).length;
              return (
                <tr key={u.id} className="border-b border-[#F3E8DF] last:border-0">
                  <td className="bg-white border-l border-[#EBDBCE] py-2 px-3">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{u.fullName}</span>
                    <span className="block text-[10px] font-bold text-[#8C6F66] truncate">{ROLE_LABEL[u.role] || u.role} · {u.departmentName}</span>
                  </td>
                  {COLUMNS.map((c) => {
                    const tone = toneOf(c.menuId);
                    const on = admin || colOn(u, c);
                    const dim = !admin && !c.isMain && !menuOpen(u, c.menuId);
                    return (
                      <td key={c.id} className="border-l border-[#F3E8DF] text-center py-1.5 px-0">
                        {admin ? (
                          <span title="مدیران همه‌چیز را دارند" className="inline-flex w-5 h-5 rounded-md items-center justify-center opacity-40" style={{ background: tone }}>
                            <Check className="w-3.5 h-3.5 text-white" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`${c.label} برای ${u.fullName}`}
                            title={dim ? 'خود منو برای این کارمند بسته است' : `${c.label}: ${u.fullName}`}
                            onClick={() => toggle(u, c)}
                            className={`inline-flex w-5 h-5 rounded-md items-center justify-center cursor-pointer border-2 ${dim ? 'opacity-45' : ''}`}
                            style={on ? { background: tone, borderColor: tone } : { background: '#fff', borderColor: '#D9C7BC' }}
                            data-perm={c.id}
                            data-user={u.id}
                          >
                            {on && <Check className="w-3.5 h-3.5 text-white" />}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 px-1 text-center">
                    {admin ? (
                      <ShieldCheck className="w-4 h-4 text-[#6E1B1B] inline" />
                    ) : (
                      <span className="inline-flex flex-col items-center gap-0.5">
                        <span className="inline-flex gap-1">
                          <button type="button" onClick={() => rowAll(u, true)} className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">همه</button>
                          <button type="button" onClick={() => rowAll(u, false)} className="px-1.5 py-0.5 rounded-md text-[10px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer">هیچ</button>
                        </span>
                        <span className="text-[9px] font-bold text-[#B8A39C]">{toPersianDigits(given)}/{toPersianDigits(COLUMNS.length)}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12">کارمندی پیدا نشد.</div>}
      </div>

      {/* phones: a card per employee, the menus one under the other, no sideways scrolling either */}
      <div className="md:hidden space-y-3">
        {rows.length === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12 bg-white border border-[#EBDBCE] rounded-2xl">کارمندی پیدا نشد.</div>}
        {rows.map((u) => {
          const admin = isAdminUser(u);
          return (
            <div key={u.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center gap-2.5">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white shrink-0 ${admin ? 'bg-[#6E1B1B]' : 'bg-[#8C6F66]'}`}>{(u.fullName || '؟').trim().slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-[#3A241F] truncate">{u.fullName}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">{ROLE_LABEL[u.role] || u.role} · {u.departmentName}</div>
                </div>
                {admin ? (
                  <span className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B]"><ShieldCheck className="w-4 h-4" />همه‌چیز</span>
                ) : (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => rowAll(u, true)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer">همه</button>
                    <button type="button" onClick={() => rowAll(u, false)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-white text-[#8C6F66] border border-[#EBDBCE] cursor-pointer">هیچ</button>
                  </span>
                )}
              </div>
              {!admin &&
                menuCols.map(({ m, cols }) => (
                  <div key={m.id} className="space-y-1.5">
                    <div className="text-[11px] font-black" style={{ color: m.tone }}>{m.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {cols.map((c) => {
                        const on = colOn(u, c);
                        const dim = !c.isMain && !menuOpen(u, c.menuId);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggle(u, c)}
                            className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-xl border text-[11px] font-black cursor-pointer ${dim ? 'opacity-50' : ''}`}
                            style={on ? { background: m.tone, borderColor: m.tone, color: '#fff' } : { background: '#fff', borderColor: '#D9C7BC', color: '#6B5650' }}
                          >
                            {on && <Check className="w-3.5 h-3.5" />}
                            {c.isMain ? 'ورود به منو' : c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] leading-6 text-[#8C6F66]">
        «مدیرعامل / صاحب امضای مجاز» فقط یک نفر است و از «ویرایش کاربر» تعیین می‌شود. هر تیک همان لحظه ذخیره می‌شود و کارمند از تغییر مجوزهایش با یک اعلان باخبر می‌شود. هر منو یا زیرمنوی تازه‌ای که به سامانه اضافه شود، یک ستون در همین جدول می‌گیرد.
      </p>
    </div>
  );
};
