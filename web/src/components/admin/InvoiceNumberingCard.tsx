import React from 'react';
import { Hash } from 'lucide-react';
import { SystemSettings } from '../../types';
import { useSepidarConnected } from '../../lib/sepidarCustomerFields';

/**
 * «شماره‌گذاری فاکتور»: with Sepidar connected, the number of every invoice made in Hoormand is the number Sepidar gives it (the same number in both).
 * The invoice waits until the accounting program has issued it in Sepidar and brought the number back; switched off, Hoormand numbers its own (FA-… / NF-…).
 */
export const InvoiceNumberingCard: React.FC<{ settings: SystemSettings; setSettings: (s: SystemSettings) => void }> = ({ settings, setSettings }) => {
  const connected = useSepidarConnected();
  const on = settings.invoiceNumberFromSepidar !== false;
  return (
    <div className="bg-white p-5 rounded-3xl border border-[#EBDBCE] shadow-sm text-xs space-y-3" data-invoice-numbering>
      <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><Hash className="w-4 h-4 text-[#D34A32]" />شماره‌گذاری فاکتور</div>
      <label className="flex items-start gap-2.5 rounded-xl border border-[#EBDBCE] bg-[#FDFAF7] px-3 py-2.5 cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-[#6E1B1B] cursor-pointer" checked={on} onChange={(e) => setSettings({ ...settings, invoiceNumberFromSepidar: e.target.checked })} data-invoice-from-sepidar />
        <span className="text-[12px] font-black text-[#3A241F]">
          شمارهٔ فاکتورها را سپیدار بدهد (شمارهٔ هورمند و سپیدار یکی باشد)
          <span className="block text-[10.5px] font-medium text-[#8C6F66] leading-5">
            وقتی روشن است و سپیدار وصل است، فاکتور هورمند اول در سپیدار صادر می‌شود و همان شمارهٔ سپیدار شمارهٔ فاکتور هورمند می‌شود. تا برنامهٔ حسابداری شمارهٔ سپیدار را برنگرداند، فاکتور «در انتظار سپیدار» است و چاپ نمی‌شود. اگر برنامهٔ سپیدار روشن نباشد، صدور فاکتور انجام نمی‌شود. خاموش باشد، هورمند خودش شماره می‌دهد (FA-… رسمی و NF-… غیررسمی).
            {!connected && <span className="block text-amber-800 font-bold mt-1">الان سپیدار وصل نیست؛ این تنظیم تا وقتی سپیدار وصل نشود اثری ندارد.</span>}
          </span>
        </span>
      </label>
      {on && (
        <div>
          <label className="block text-[11px] font-black text-[#503730] mb-1">کدام فاکتورها از سپیدار شماره بگیرند؟</label>
          <select className="w-full sm:w-80 px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold" value={settings.invoiceSepidarKinds || 'both'} onChange={(e) => setSettings({ ...settings, invoiceSepidarKinds: e.target.value as 'both' | 'official' })} data-invoice-sepidar-kinds>
            <option value="both">رسمی و غیررسمی</option>
            <option value="official">فقط رسمی (غیررسمی شمارهٔ خودش را دارد)</option>
          </select>
        </div>
      )}
    </div>
  );
};
