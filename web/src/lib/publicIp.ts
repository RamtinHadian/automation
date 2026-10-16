/**
 * The public (internet) address of this device. A router in front of the office server often rewrites the sender of every request to its own
 * address, so the server cannot tell people apart; the browser asks a small public service for the address it is really on and tells the
 * server in a header (X-Client-Public-IP). The server keeps both what it saw and what the browser said (see the audit log).
 */
const KEY = 'public_ip_v1';
const TTL = 30 * 60 * 1000;
let current = '';

const valid = (s: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(s) || /^[0-9a-f:]{3,45}$/i.test(s);

const SOURCES: [string, (r: Response) => Promise<string>][] = [
  ['https://api.ipify.org?format=json', async (r) => (await r.json()).ip],
  ['https://icanhazip.com', async (r) => (await r.text()).trim()],
];

async function lookup(orig: typeof fetch): Promise<string> {
  for (const [url, read] of SOURCES) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const res = await orig(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!res.ok) continue;
      const ip = String(await read(res)).trim();
      if (valid(ip)) return ip;
    } catch {
      /* try the next one */
    }
  }
  return '';
}

/** Call once at start-up: remembers the address for half an hour and adds it to every request to this server. */
export function installPublicIp() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as { ip: string; at: number } | null;
    if (saved && Date.now() - saved.at < TTL && valid(saved.ip)) current = saved.ip;
  } catch {
    /* storage unavailable */
  }
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const ours = url.startsWith('/') || url.startsWith(location.origin);
      if (current && ours) {
        const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        h.set('X-Client-Public-IP', current);
        return orig(input, { ...init, headers: h });
      }
    } catch {
      /* fall through to the plain call */
    }
    return orig(input, init);
  };
  if (!current) {
    lookup(orig).then((ip) => {
      if (!ip) return;
      current = ip;
      try {
        localStorage.setItem(KEY, JSON.stringify({ ip, at: Date.now() }));
      } catch {
        /* storage unavailable */
      }
    });
  }
}
