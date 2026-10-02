import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, Folder, HardDrive, Loader2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { smbHelp } from '../../lib/smbHelp';

interface Props {
  host: string;
  user: string;
  domain: string;
  password: string;
  onPick: (share: string, folder: string) => void;
  onClose: () => void;
}

/** A small «Explorer» for the network: the drives (shared folders) of the server, then the folders inside the chosen one. */
export const BackupFolderPicker: React.FC<Props> = ({ host, user, domain, password, onPick, onClose }) => {
  const [path, setPath] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setBusy(true);
    setError('');
    (async () => {
      try {
        const { id } = await api.backupBrowse({ host, path, user, domain, password });
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 700));
          if (mine !== seq.current) return;
          const r = await api.backupBrowseResult();
          if (r.pending || r.id !== id) continue;
          if (r.result === 'ok') {
            setItems(r.items || []);
            setBusy(false);
          } else {
            setError(smbHelp(r.text) || r.text || 'اتصال برقرار نشد.');
            setBusy(false);
          }
          return;
        }
        if (mine === seq.current) {
          setError('پاسخی از سرور شبکه نیامد؛ آدرس را بررسی کنید.');
          setBusy(false);
        }
      } catch (e) {
        if (mine === seq.current) {
          setError(e instanceof Error ? e.message : 'خطا');
          setBusy(false);
        }
      }
    })();
  }, [host, path, user, domain, password]);

  const parts = path ? path.split('/') : [];
  const atRoot = parts.length === 0;
  const enter = (name: string) => setPath(path ? `${path}/${name}` : name);
  const up = () => setPath(parts.slice(0, -1).join('/'));

  return (
    <div className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border border-[#EBDBCE]">
        <div className="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-l from-[#6E1B1B] to-[#D34A32] text-white shrink-0">
          <HardDrive className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <div className="font-black text-sm">انتخاب پوشه از روی شبکه</div>
            <div className="text-[11px] text-white/80 truncate" dir="ltr">\\{host}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#EBDBCE] bg-[#FAF5F1] text-[11px] font-bold flex-wrap">
          <button type="button" onClick={() => setPath('')} className={`px-2 py-1 rounded-lg cursor-pointer ${atRoot ? 'bg-[#6E1B1B] text-white' : 'text-[#6E1B1B] hover:bg-white'}`}>درایوها</button>
          {parts.map((p, i) => (
            <React.Fragment key={i}>
              <ChevronLeft className="w-3 h-3 text-[#8C6F66]" />
              <button type="button" onClick={() => setPath(parts.slice(0, i + 1).join('/'))} className={`px-2 py-1 rounded-lg cursor-pointer ${i === parts.length - 1 ? 'bg-[#6E1B1B] text-white' : 'text-[#6E1B1B] hover:bg-white'}`}>{p}</button>
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 min-h-[220px]">
          {busy ? (
            <div className="h-full flex items-center justify-center py-12 text-xs font-bold text-[#8C6F66] gap-2"><Loader2 className="w-4 h-4 animate-spin" />در حال خواندن از شبکه…</div>
          ) : error ? (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-[12px] leading-6 font-bold text-rose-800">{error}</div>
          ) : (
            <div className="space-y-1">
              {!atRoot && (
                <button type="button" onClick={up} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#FAF5F1] text-xs font-bold text-[#8C6F66] cursor-pointer">
                  <ArrowRight className="w-4 h-4" />
                  بازگشت به بالا
                </button>
              )}
              {items.length === 0 && <div className="py-10 text-center text-xs font-bold text-[#8C6F66]">{atRoot ? 'هیچ درایو اشتراکی پیدا نشد.' : 'این پوشه زیرپوشه‌ای ندارد؛ همین را می‌توانید انتخاب کنید.'}</div>}
              {items.map((n) => (
                <button key={n} type="button" onClick={() => enter(n)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[#FAF5F1] text-xs font-bold text-[#3A241F] cursor-pointer text-right">
                  {atRoot ? <HardDrive className="w-4 h-4 text-[#6E1B1B]" /> : <Folder className="w-4 h-4 text-amber-600" />}
                  <span className="flex-1 truncate">{n}</span>
                  <ChevronLeft className="w-3.5 h-3.5 text-[#8C6F66]" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-[#EBDBCE] bg-[#FAF5F1] shrink-0">
          <div className="text-[11px] font-bold text-[#8C6F66] truncate" dir="ltr">{atRoot ? '' : `\\\\${host}\\${parts.join('\\')}`}</div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-[#8C6F66] hover:bg-white rounded-xl cursor-pointer">انصراف</button>
            <button type="button" disabled={atRoot || busy || !!error} onClick={() => onPick(parts[0], parts.slice(1).join('/'))} className="px-5 py-2 text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl cursor-pointer">
              انتخاب این پوشه
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
