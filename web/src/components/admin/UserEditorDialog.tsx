import React, { useEffect, useState } from 'react';
import { PersonPickerMulti, staffItems } from '../common/PersonPicker';
import { api } from '../../lib/api';
import { Award, BarChart3, Megaphone, ClipboardList, FileCheck, HardDrive, KeyRound, Lock, Phone, MessageSquare, Warehouse, ShieldCheck, Smartphone, UserPlus, Users, X } from 'lucide-react';
import { Department, UserRole } from '../../types';
import { toPersianDigits } from '../../lib/jalali';

export interface UserForm {
  fullName: string;
  email: string;
  password?: string;
  departmentId: string;
  role: UserRole;
  canUseCrm?: boolean;
  /** sales representative: independent user (see types.ts) */
  isAgent?: boolean;
  agentContactIds?: string[];
  hiddenSub?: string[];
  canSeeTeamCrm?: boolean;
  canViewStats?: boolean;
  canPostAnnouncements?: boolean;
  canUseWarranty?: boolean;
  canSendSms?: boolean;
  canUseWarehouse?: boolean;
  sepidarPerms?: string[];
  /** the warehouse product groups this person may see (none = every group) */
  whGroups?: string[];
  canUseTasks?: boolean;
  canSignOfficialLetters?: boolean;
  canSendOfficialLetters?: boolean;
  extension?: string;
  /** more extensions of the same person, besides the main one */
  extensions?: string[];
  mobile?: string;
  /** more phone numbers of the same person (a second mobile, a home line…), besides the main one */
  mobiles?: string[];
  storageQuotaGB: number;
}

interface Props {
  mode: 'add' | 'edit';
  form: UserForm;
  set: (patch: Partial<UserForm>) => void;
  departments: Department[];
  onClose: () => void;
  onSubmit: () => void;
  /** Turning the CEO tick on goes through the parent (it asks when someone else already holds it). */
  onToggleCeo: (on: boolean) => void;
  quotaMax: number;
  /** everybody (for choosing the people a representative works with) */
  people?: { id: string; fullName: string; departmentName?: string; isActive?: boolean }[];
}

const field = 'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-semibold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none';
const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

const Switch: React.FC<{ on: boolean; color: string; onChange: (v: boolean) => void; name: string }> = ({ on, color, onChange, name }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={name}
    onClick={() => onChange(!on)}
    className="relative w-11 h-6 rounded-full shrink-0 cursor-pointer transition-colors"
    style={{ background: on ? color : '#D6CBC4' }}
  >
    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ right: on ? 'calc(100% - 22px)' : 2 }} />
  </button>
);

const Tile: React.FC<{ icon: React.ReactNode; title: string; hint: string; on: boolean; color: string; tint: string; border: string; onChange: (v: boolean) => void; wide?: boolean }> = ({ icon, title, hint, on, color, tint, border, onChange, wide }) => (
  <div className={`rounded-2xl border p-3 flex items-center gap-3 transition-colors ${wide ? 'sm:col-span-2' : ''}`} style={{ background: on ? tint : '#FFFFFF', borderColor: on ? border : '#EBDBCE' }}>
    <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: on ? color : '#B9A9A2' }}>
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <div className="font-black text-[12px] text-[#3A241F] leading-5">{title}</div>
      <div className="text-[10px] text-[#8C6F66] leading-4">{hint}</div>
    </div>
    <Switch on={on} color={color} onChange={onChange} name={title} />
  </div>
);

/** One large, two-column dialog for both «new employee» and «edit employee»: account on one side, access switches on the other. */
export const UserEditorDialog: React.FC<Props> = ({ mode, form, set, departments, onClose, onSubmit, onToggleCeo, quotaMax, people = [] }) => {
  const initials = (form.fullName || '').trim().slice(0, 2) || '؟';
  // the product groups of the warehouse (as Sepidar has them), to pick the ones this person may see
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api.warehouse().then((s) => {
      if (!alive) return;
      const g = new Set<string>();
      s.products.forEach((p) => g.add(p.group || 'بدون گروه'));
      setGroups([...g].sort((a, b) => a.localeCompare(b, 'fa')));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const picked = form.whGroups || [];
  const toggleGroup = (g: string) => set({ whGroups: picked.includes(g) ? picked.filter((x) => x !== g) : [...picked, g] });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6" dir="rtl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="bg-white rounded-[28px] shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-[#EBDBCE]"
      >
        <div className="bg-gradient-to-l from-[#6E1B1B] to-[#D34A32] text-white px-5 sm:px-7 py-4 flex items-center gap-3.5 shrink-0">
          <span className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center font-black text-lg shrink-0">
            {mode === 'add' ? <UserPlus className="w-6 h-6" /> : initials}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-base truncate">{mode === 'add' ? 'تعریف کارمند جدید' : `ویرایش ${form.fullName || 'کاربر'}`}</h3>
            <p className="text-[11px] text-white/80 mt-0.5">{mode === 'add' ? 'مشخصات ورود و دسترسی‌های او را تعیین کنید' : 'مشخصات حساب و دسترسی‌ها را تغییر دهید'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer shrink-0" aria-label="بستن">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-5 gap-6 text-xs">
          {/* account */}
          <section className="lg:col-span-2 space-y-3.5">
            <h4 className="font-black text-[12px] text-[#6E1B1B] flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" />
              مشخصات حساب
            </h4>
            <div>
              <label className={label}>نام و نام خانوادگی</label>
              <input type="text" required value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="مثال: علی رضایی" className={field} />
            </div>
            <div>
              <label className={label}>{mode === 'add' ? 'نام کاربری (برای ورود)' : 'نام کاربری (برای ورود)'}</label>
              <input type="text" required dir="ltr" value={form.email} onChange={(e) => set({ email: e.target.value.trim() })} placeholder="مثلاً ali@company.ir" className={`${field} font-mono text-right`} />
              {mode === 'edit' && <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">پس از تغییر، نام کاربری جدید را به او اطلاع دهید.</p>}
            </div>
            <div>
              <label className={label}>{mode === 'add' ? 'رمز عبور اولیه' : 'رمز عبور جدید (خالی = بدون تغییر)'}</label>
              <div className="relative">
                <input type="text" required={mode === 'add'} value={form.password || ''} onChange={(e) => set({ password: e.target.value })} placeholder={mode === 'add' ? 'رمز ورود کاربر' : 'برای تغییر، رمز جدید را بنویسید'} className={`${field} font-mono pl-9`} />
                <Lock className="w-3.5 h-3.5 text-[#8C6F66] absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>واحد سازمانی</label>
                <select value={form.departmentId} onChange={(e) => set({ departmentId: e.target.value })} className={field}>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>نقش</label>
                <select value={form.role} onChange={(e) => set({ role: e.target.value as UserRole })} className={field}>
                  <option value="STAFF">پرسنل عادی</option>
                  <option value="DEPT_ADMIN">مدیر واحد</option>
                  <option value="SUPER_ADMIN">مدیر ارشد سامانه</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`${label} flex items-center gap-1`}>
                  <Phone className="w-3 h-3 text-[#8C6F66]" />
                  شمارهٔ داخلی
                </label>
                <div className="flex items-center gap-2">
                  <input dir="ltr" inputMode="numeric" value={form.extension || ''} onChange={(e) => set({ extension: e.target.value.replace(/[^0-9]/g, '') })} placeholder="۵۰۱" className={`${field} font-mono text-right`} />
                  <button
                    type="button"
                    onClick={() => set({ extensions: [...(form.extensions || []), ''] })}
                    title="افزودن داخلی دیگر برای همین شخص"
                    aria-label="افزودن داخلی دیگر"
                    data-add-extension
                    className="w-10 h-10 shrink-0 rounded-xl bg-[#6E1B1B] text-white font-black text-lg leading-none cursor-pointer hover:bg-[#D34A32]"
                  >
                    +
                  </button>
                </div>
                {(form.extensions || []).length > 0 && (
                  <div className="mt-2 space-y-2" data-extra-extensions>
                    <div className="text-[10px] font-bold text-[#8C6F66]">داخلی‌های بیشتر این شخص (تماس‌هایشان هم برای او پاپ‌آپ و ثبت می‌شود)</div>
                    {(form.extensions || []).map((x, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          dir="ltr"
                          inputMode="numeric"
                          value={x}
                          onChange={(e) => set({ extensions: (form.extensions || []).map((y, j) => (j === i ? e.target.value.replace(/[^0-9]/g, '') : y)) })}
                          placeholder="۵۰۲"
                          className={`${field} font-mono text-right`}
                        />
                        <button type="button" onClick={() => set({ extensions: (form.extensions || []).filter((_, j) => j !== i) })} aria-label="حذف این داخلی" title="حذف این داخلی" className="w-10 h-10 shrink-0 rounded-xl border border-[#EBDBCE] text-[#8C6F66] hover:text-rose-600 cursor-pointer">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {mode === 'edit' && (
                <div>
                  <label className={`${label} flex items-center gap-1`}>
                    <Smartphone className="w-3 h-3 text-[#8C6F66]" />
                    موبایل (پیامک)
                  </label>
                  <div className="flex items-center gap-2">
                    <input dir="ltr" inputMode="tel" value={form.mobile || ''} onChange={(e) => set({ mobile: e.target.value.replace(/[^0-9+]/g, '') })} placeholder="09121234567" className={`${field} font-mono text-right`} />
                    <button
                      type="button"
                      onClick={() => set({ mobiles: [...(form.mobiles || []), ''] })}
                      title="افزودن شمارهٔ دیگر برای همین شخص"
                      aria-label="افزودن شمارهٔ دیگر"
                      data-add-mobile
                      className="w-10 h-10 shrink-0 rounded-xl bg-[#6E1B1B] text-white font-black text-lg leading-none cursor-pointer hover:bg-[#D34A32]"
                    >
                      +
                    </button>
                  </div>
                  {(form.mobiles || []).length > 0 && (
                    <div className="mt-2 space-y-2" data-extra-mobiles>
                      <div className="text-[10px] font-bold text-[#8C6F66]">شماره‌های بیشتر این شخص (وقتی با یکی از آن‌ها تماس بگیرد، در فهرست تماس‌ها با نام او نوشته می‌شود)</div>
                      {(form.mobiles || []).map((x, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            dir="ltr"
                            inputMode="tel"
                            value={x}
                            onChange={(e) => set({ mobiles: (form.mobiles || []).map((y, j) => (j === i ? e.target.value.replace(/[^0-9+]/g, '') : y)) })}
                            placeholder="09131234567"
                            className={`${field} font-mono text-right`}
                          />
                          <button type="button" onClick={() => set({ mobiles: (form.mobiles || []).filter((_, j) => j !== i) })} aria-label="حذف این شماره" title="حذف این شماره" className="w-10 h-10 shrink-0 rounded-xl border border-[#EBDBCE] text-[#8C6F66] hover:text-rose-600 cursor-pointer">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3">
              <div className="flex items-center justify-between text-[11px] font-black text-[#3A241F] mb-2">
                <span className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#6E1B1B]" />
                  سقف فضای ذخیره‌سازی
                </span>
                <span className="text-[#6E1B1B]">{toPersianDigits(form.storageQuotaGB)} گیگابایت</span>
              </div>
              <input type="range" min={10} max={quotaMax} step={mode === 'add' ? 5 : 10} value={form.storageQuotaGB} onChange={(e) => set({ storageQuotaGB: parseInt(e.target.value) })} className="w-full accent-[#6E1B1B] cursor-pointer" />
            </div>
          </section>

          {/* access */}
          <section className="lg:col-span-3 space-y-3">
            <h4 className="font-black text-[12px] text-[#6E1B1B] flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              مدیرعامل (صاحب امضای مجاز)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Tile wide icon={<Award className="w-[18px] h-[18px]" />} title="مدیرعامل / صاحب امضای مجاز" hint="فقط یک نفر؛ تنها او نامه رسمی را امضا می‌کند و نامش روی نامه‌ها می‌نشیند." on={!!form.canSignOfficialLetters} color="#B45309" tint="#FFF7E6" border="#F3D08A" onChange={onToggleCeo} />
            </div>
            <div className="pt-3 space-y-2" data-agent-block>
              <Tile
                wide
                icon={<Users className="w-[18px] h-[18px]" />}
                title="نماینده فروش (کاربر مستقل)"
                hint="فقط CRM و مشتریان خودش را دارد، فقط با مدیرعامل و افرادی که مشخص می‌کنید ارتباط دارد و فقط می‌تواند نامهٔ داخلی به مدیرعامل بزند. مدیر ارشد و مدیرعامل مشتریان و فروش او را می‌بینند."
                on={!!form.isAgent}
                color="#7C3AED"
                tint="#F5F0FF"
                border="#D9C8FA"
                onChange={(v) => set(v ? { isAgent: true, canUseCrm: true, canSeeTeamCrm: false, canSendOfficialLetters: false, canSignOfficialLetters: false, canUseTasks: false, canUseWarehouse: false, canUseWarranty: false, canPostAnnouncements: false, canViewStats: false, canSendSms: false, hiddenSub: ['files.transfer', 'files.leave', 'files.board', 'files.reminders', 'files.minutes'] } : { isAgent: false, agentContactIds: [], hiddenSub: [] })}
              />
              {form.isAgent && (
                <div data-agent-contacts>
                  <label className={label}>افرادی که نماینده با آن‌ها در ارتباط است (علاوه بر مدیرعامل)</label>
                  <PersonPickerMulti
                    title="ارتباط نماینده با چه کسانی باشد؟"
                    placeholder="انتخاب همکاران (با جست‌وجو)…"
                    items={staffItems(people.filter((x) => x.isActive !== false))}
                    values={form.agentContactIds || []}
                    onChange={(ids) => set({ agentContactIds: ids })}
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#8C6F66] leading-6 pt-1">همهٔ مجوزهای دیگر (منوها و زیرمنوها) از «جدول مجوزها» در بالای همین صفحه تعیین می‌شود. مدیران ارشد و مدیران واحد بدون نیاز به آن‌ها همه‌چیز را دارند؛ فقط «مدیرعامل» با سوئیچ بالا جدا انتخاب می‌شود.</p>
            {groups.length > 0 && (
              <div className="pt-3 space-y-2" data-wh-groups>
                <h4 className="font-black text-[12px] text-[#6E1B1B] flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4" />
                  گروه‌های کالای انبار که این شخص می‌بیند
                </h4>
                <p className="text-[11px] text-[#8C6F66] leading-6">اگر هیچ گروهی تیک نخورد، همهٔ گروه‌ها را می‌بیند. با تیک‌زدن، فقط کالاهای همان گروه‌ها (موجودی، اسناد و کارت کالا) برایش باز است.</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g) => (
                    <button key={g} type="button" role="checkbox" aria-checked={picked.includes(g)} onClick={() => toggleGroup(g)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${picked.includes(g) ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-amber-50'}`}>
                      {g}
                    </button>
                  ))}
                  {picked.length > 0 && (
                    <button type="button" onClick={() => set({ whGroups: [] })} className="px-3 py-1.5 rounded-full text-[11px] font-black text-[#8C6F66] cursor-pointer">همه (بدون محدودیت)</button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 sm:px-7 py-3.5 border-t border-[#EBDBCE] bg-[#FAF5F1] shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold text-[#8C6F66] hover:bg-white rounded-xl cursor-pointer">
            انصراف
          </button>
          <button type="submit" className="px-6 py-2.5 text-xs font-black bg-[#6E1B1B] hover:bg-[#D34A32] text-white rounded-xl shadow-sm cursor-pointer">
            {mode === 'add' ? 'ایجاد حساب کاربری' : 'ذخیره تغییرات'}
          </button>
        </div>
      </form>
    </div>
  );
};
