import React from 'react';

// The look of every public page of Hoormand that is used outside the program (the marketer's page, the company's registration form, the web-site form):
// a white paper sheet with a wavy, layered paper-cut edge that opens onto dark tropical leaves, on a soft blurred leaf background. On a phone the form is
// a frosted-glass card floating over the same picture.

const GREENS = ['#17301f', '#1f3d2b', '#264a34', '#2e5740', '#385f49'];

/** One palm frond: a curved stem with narrow leaflets on both sides. */
const Frond: React.FC<{ x: number; y: number; rot: number; len: number; n?: number; w?: number; shade?: number; opacity?: number }> = ({ x, y, rot, len, n = 15, w = 9, shade = 0, opacity = 1 }) => {
  const leaflets: React.ReactNode[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const px = t * len;
    const py = -(t * t) * len * 0.22;
    const l = len * 0.34 * (1 - 0.55 * t) + 6;
    const ww = w * (1 - 0.4 * t);
    const slope = Math.atan(-2 * t * len * 0.22 / len) * (180 / Math.PI);
    for (const side of [-1, 1]) {
      const a = slope + side * (58 - 14 * t);
      leaflets.push(
        <path
          key={`${i}${side}`}
          d={`M0 0 Q ${l * 0.5} ${-ww} ${l} 0 Q ${l * 0.5} ${ww} 0 0 Z`}
          transform={`translate(${px} ${py}) rotate(${a})`}
          fill={GREENS[(i + (side > 0 ? 1 : 0) + shade) % GREENS.length]}
        />,
      );
    }
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} opacity={opacity}>
      <path d={`M0 0 Q ${len * 0.5} ${-len * 0.06} ${len} ${-len * 0.22}`} stroke="#12281a" strokeWidth="2.2" fill="none" />
      {leaflets}
    </g>
  );
};

/** The dark opening: leaves in layers with soft shadows. */
const Leaves: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <filter id="ps-leaf-shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#07140b" floodOpacity="0.55" /></filter>
      <radialGradient id="ps-hole" cx="60%" cy="45%" r="80%"><stop offset="0" stopColor="#3c6350" /><stop offset="0.6" stopColor="#24432f" /><stop offset="1" stopColor="#10241a" /></radialGradient>
    </defs>
    <rect width="400" height="600" fill="url(#ps-hole)" />
    <g filter="url(#ps-leaf-shadow)">
      <Frond x={420} y={80} rot={150} len={330} shade={0} />
      <Frond x={430} y={250} rot={175} len={380} shade={2} n={17} />
      <Frond x={-10} y={440} rot={-40} len={330} shade={1} />
      <Frond x={60} y={610} rot={-72} len={420} shade={3} n={17} w={10} />
      <Frond x={430} y={520} rot={-160} len={330} shade={1} />
      <Frond x={200} y={620} rot={-98} len={330} shade={4} />
      <Frond x={-20} y={170} rot={20} len={250} shade={2} opacity={0.9} />
    </g>
  </svg>
);

/** The layered paper sheets: the farthest and greyest first, the white front sheet last. They cover the left of the card and end in wavy edges. */
const Waves: React.FC<{ className?: string; edge?: number; uid: string }> = ({ className, edge = 58, uid }) => {
  const sheet = (dx: number, k: number) => {
    const e = edge + dx;
    return `M0 0 H${e} C${e + 9 + k} 10 ${e - 8} 21 ${e + 2} 33 S${e + 14 - k} 50 ${e + 1} 61 S${e - 9} 78 ${e + 2} 89 S${e + 4} 98 ${e + 1} 100 H0 Z`;
  };
  const layers: [number, number, string][] = [[10, 4, '#cfd3d1'], [7, 2, '#dde0df'], [4, 0, '#eaeceb'], [0, 1, '#ffffff']];
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id={`ps-paper-shadow-${uid}`} x="-10%" y="-5%" width="125%" height="110%"><feDropShadow dx="0.8" dy="0.4" stdDeviation="0.9" floodColor="#0a1a10" floodOpacity="0.45" /></filter>
      </defs>
      {layers.map(([dx, k, fill]) => <path key={dx} d={sheet(dx, k)} fill={fill} filter={`url(#ps-paper-shadow-${uid})`} />)}
    </svg>
  );
};

/** The soft, blurred leaves behind the card. */
const Backdrop: React.FC = () => (
  <div className="fixed inset-0 -z-0 overflow-hidden bg-[#e7e8e6]" aria-hidden="true">
    <svg className="absolute right-[-60px] top-[-40px] w-[520px] h-[520px] opacity-80" viewBox="0 0 400 400" style={{ filter: 'blur(7px)' }}>
      <Frond x={400} y={30} rot={150} len={360} n={16} w={11} />
      <Frond x={420} y={120} rot={172} len={300} n={14} shade={2} />
    </svg>
    <svg className="absolute left-[-90px] bottom-[-70px] w-[560px] h-[480px] opacity-80" viewBox="0 0 400 400" style={{ filter: 'blur(9px)' }}>
      <Frond x={0} y={380} rot={-30} len={380} n={16} w={12} shade={1} />
      <Frond x={30} y={410} rot={-62} len={320} n={14} shade={3} />
    </svg>
    <svg className="absolute left-[-30px] top-[-60px] w-[300px] h-[300px] opacity-40" viewBox="0 0 400 400" style={{ filter: 'blur(14px)' }}>
      <Frond x={0} y={10} rot={40} len={300} n={14} shade={2} />
    </svg>
  </div>
);

/**
 * The page. On a computer: the white sheet on the left holds the form, the paper-cut opening with the leaves is on the right. On a phone: the picture
 * is a band on top and the form sits in a frosted-glass card over it. The content is drawn ONCE (only the classes change with the screen).
 */
/** The company's logo («نام و هویت سازمان»), on a computer only; nothing is drawn when the company has none. */
const Logo: React.FC = () => {
  const [ok, setOk] = React.useState(true);
  if (!ok) return null;
  return <img src="/api/public/logo" alt="" onError={() => setOk(false)} className="hidden md:block max-h-[72px] max-w-[200px] w-auto object-contain mb-4 self-start" data-paper-logo />;
};

export const PaperShell: React.FC<{ title: string; subtitle?: string; brand?: string; children: React.ReactNode; wide?: boolean }> = ({ title, subtitle, brand, children, wide }) => (
  <div className="relative min-h-[100dvh] px-3 py-4 sm:px-6 sm:py-8 flex items-start md:items-center justify-center" data-paper-shell>
    <Backdrop />
    <div dir="ltr" className={`relative z-10 w-full max-w-[460px] ${wide ? 'md:max-w-[1120px]' : 'md:max-w-[1040px]'} md:bg-white md:rounded-[34px] md:overflow-hidden md:shadow-[0_30px_80px_rgba(30,50,40,0.28)]`}>
      {/* the picture: a band on a phone, the right side of the sheet on a computer */}
      <div className="absolute inset-x-0 top-0 h-[250px] rounded-[30px] overflow-hidden shadow-[0_18px_44px_rgba(30,50,40,0.25)] md:inset-0 md:h-auto md:rounded-none md:shadow-none" dir="ltr" aria-hidden="true">
        <div className="absolute inset-0 bg-[#1b3325] md:left-auto md:w-[52%]" />
        <Leaves className="absolute inset-0 w-full h-full md:left-auto md:right-0 md:w-[52%] md:max-h-[900px]" />
        <Waves uid="m" className="absolute inset-0 w-full h-full md:hidden" edge={34} />
        <Waves uid="d" className="absolute inset-0 w-full h-full hidden md:block" />
      </div>
      <div className="relative z-10 mt-[96px] mx-3 rounded-[30px] border border-white/70 bg-white/60 backdrop-blur-xl shadow-[0_20px_50px_rgba(25,45,35,0.22)] px-5 pt-6 pb-5 md:mt-0 md:mx-0 md:w-[50%] md:min-h-[560px] md:rounded-none md:border-0 md:bg-transparent md:backdrop-blur-none md:shadow-none md:flex md:flex-col md:justify-center md:px-[7%] md:py-12" dir="rtl">
        <Logo />
        {brand && <div className="text-[12px] md:text-[13px] font-bold text-[#55645c] mb-1">{brand}</div>}
        <h1 className="text-[22px] md:text-[26px] font-black text-[#1f2a24] mb-1">{title}</h1>
        {subtitle && <p className="text-[12.5px] md:text-[13px] font-bold text-[#55645c] leading-6 mb-4">{subtitle}</p>}
        {children}
      </div>
    </div>
  </div>
);
