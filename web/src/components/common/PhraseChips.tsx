import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

const DEFAULTS = [
  'تماس گرفتیم؛ در دسترس نبود.',
  'قیمت اعلام شد؛ منتظر تصمیم مشتری.',
  'درخواست پیش‌فاکتور دارد.',
  'بعداً دوباره تماس بگیریم.',
  'نیاز به مشاورهٔ فنی دارد.',
  'کالا موجود نبود؛ در صورت ورود اطلاع بدهیم.',
  'با معرفی یکی از مشتریان آشنا شده است.',
  'مبلغ پرداخت شد.',
];

/** The sentences people typed most often before (at least twice), most frequent first; the common ones fill the gaps. */
export function commonPhrases(sources: string[], limit = 12): string[] {
  const count = new Map<string, number>();
  for (const text of sources) {
    for (const raw of String(text || '').split(/[\n.!؟?]+/)) {
      const s = raw.replace(/\s+/g, ' ').trim();
      if (s.length < 6 || s.length > 90) continue;
      count.set(s, (count.get(s) || 0) + 1);
    }
  }
  const learned = [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const out = [...learned];
  for (const d of DEFAULTS) if (out.length < limit && !out.includes(d)) out.push(d);
  return out.slice(0, limit);
}

/** Ready-made sentences under a text box: one tap adds a sentence, so people type less. */
export const PhraseChips: React.FC<{ sources: string[]; onPick: (text: string) => void }> = ({ sources, onPick }) => {
  const phrases = useMemo(() => commonPhrases(sources), [sources]);
  const [all, setAll] = useState(false);
  const shown = all ? phrases : phrases.slice(0, 5);
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {shown.map((p) => (
        <button key={p} type="button" onClick={() => onPick(p)} className="flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full border border-violet-200 bg-violet-50 text-[11px] font-bold text-violet-900 hover:bg-violet-100 cursor-pointer text-right">
          <Plus className="w-3 h-3 shrink-0" />
          <span className="truncate">{p}</span>
        </button>
      ))}
      {phrases.length > 5 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="px-2.5 py-1 text-[11px] font-black text-[#8C6F66] underline cursor-pointer">
          {all ? 'کمتر' : 'بیشتر'}
        </button>
      )}
    </div>
  );
};
