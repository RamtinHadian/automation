import { getToken } from './api';
import { getLocalFile } from './localFiles';

/**
 * Browser-to-browser file transfer over WebRTC. The server only relays the connection setup
 * messages (see /api/signal/* in server/index.js); file bytes never pass through it.
 * The sender's browser must be online (signed in) while the recipient downloads.
 */

type SignalMsg = {
  type: 'offer' | 'answer' | 'ice' | 'reject';
  session: string;
  from?: string; // set by the server: the authenticated sender of this message
  fromTab?: string;
  toTab?: string;
  key?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
};

/** Decides whether `requesterId` may receive the local file stored under `key`. */
export type ServeGuard = (requesterId: string, key: string) => boolean;

const TAB_ID = Math.random().toString(36).slice(2);
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const READ_SLICE = 1024 * 1024;
const MAX_CHUNK = 64 * 1024;
const MAX_BUFFERED = 4 * 1024 * 1024;

let controller: AbortController | null = null;
let guard: ServeGuard = () => false;
const sessions = new Map<string, (m: SignalMsg) => void>();

let iceServersPromise: Promise<RTCIceServer[]> | null = null;
const getIceServers = () => {
  if (!iceServersPromise) {
    iceServersPromise = fetch('/api/config')
      .then((r) => r.json())
      .then((j) => j.iceServers as RTCIceServer[])
      .catch(() => {
        iceServersPromise = null;
        return [{ urls: 'stun:stun.l.google.com:19302' }];
      });
  }
  return iceServersPromise;
};

async function sendSignal(to: string, msg: Omit<SignalMsg, 'from'>): Promise<number> {
  const token = getToken();
  const res = await fetch('/api/signal/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ to, msg }),
  });
  if (!res.ok) throw new Error('سرور در دسترس نیست');
  return (await res.json()).delivered as number;
}

// ---------- listening (every signed-in browser can serve the files it holds) ----------

export function startP2P(serveGuard: ServeGuard) {
  stopP2P();
  guard = serveGuard;
  controller = new AbortController();
  void listen(controller.signal);
}

export function stopP2P() {
  controller?.abort();
  controller = null;
  guard = () => false;
}

async function listen(signal: AbortSignal) {
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch('/api/signal/stream', { headers: { Authorization: `Bearer ${token}` }, signal });
      if (res.status === 401) return;
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      backoff = 1000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (line) {
            try {
              handleSignal(JSON.parse(line.slice(6)));
            } catch (e) {
              console.warn('Bad signal message', e);
            }
          }
        }
      }
    } catch {
      if (signal.aborted) return;
    }
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 15000);
  }
}

function handleSignal(msg: SignalMsg) {
  if (msg.toTab && msg.toTab !== TAB_ID) return;
  if (msg.type === 'offer') void serveOffer(msg);
  else sessions.get(msg.session)?.(msg);
}

async function serveOffer(msg: SignalMsg) {
  const requester = msg.from as string;
  const reject = (reason: string) =>
    sendSignal(requester, { type: 'reject', session: msg.session, fromTab: TAB_ID, toTab: msg.fromTab, reason }).catch(() => {});

  if (!msg.key || !msg.sdp || !guard(requester, msg.key)) return void reject('forbidden');
  const blob = await getLocalFile(msg.key).catch(() => null);
  if (!blob) return void reject('not-found');

  const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
  const pendingIce: RTCIceCandidateInit[] = [];
  let remoteSet = false;
  const cleanup = () => {
    sessions.delete(msg.session);
    pc.close();
  };
  const timeout = setTimeout(cleanup, 30 * 60 * 1000);
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
      clearTimeout(timeout);
      cleanup();
    }
  };
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal(requester, {
        type: 'ice',
        session: msg.session,
        fromTab: TAB_ID,
        toTab: msg.fromTab,
        candidate: e.candidate.toJSON(),
      }).catch(() => {});
    }
  };
  pc.ondatachannel = (e) => {
    const ch = e.channel;
    const start = () => void pushBlob(ch, blob, msg.key as string, Math.min(MAX_CHUNK, pc.sctp?.maxMessageSize || 16 * 1024));
    if (ch.readyState === 'open') start();
    else ch.onopen = start;
  };
  sessions.set(msg.session, (m) => {
    if (m.type !== 'ice' || !m.candidate) return;
    if (remoteSet) pc.addIceCandidate(m.candidate).catch(() => {});
    else pendingIce.push(m.candidate);
  });

  await pc.setRemoteDescription(msg.sdp);
  remoteSet = true;
  for (const c of pendingIce.splice(0)) pc.addIceCandidate(c).catch(() => {});
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendSignal(requester, {
    type: 'answer',
    session: msg.session,
    fromTab: TAB_ID,
    toTab: msg.fromTab,
    sdp: pc.localDescription as RTCSessionDescriptionInit,
  });
}

async function pushBlob(ch: RTCDataChannel, blob: Blob, key: string, chunk: number) {
  ch.bufferedAmountLowThreshold = 1024 * 1024;
  ch.send(JSON.stringify({ t: 'meta', size: blob.size, mime: blob.type, key }));
  for (let off = 0; off < blob.size; off += READ_SLICE) {
    const slice = new Uint8Array(await blob.slice(off, off + READ_SLICE).arrayBuffer());
    for (let i = 0; i < slice.length; i += chunk) {
      if (ch.readyState !== 'open') return;
      if (ch.bufferedAmount > MAX_BUFFERED) {
        await new Promise<void>((resolve) => {
          ch.onbufferedamountlow = () => {
            ch.onbufferedamountlow = null;
            resolve();
          };
        });
      }
      ch.send(slice.subarray(i, i + chunk));
    }
  }
  if (ch.readyState === 'open') ch.send(JSON.stringify({ t: 'done' }));
}

// ---------- requesting ----------

export interface Sink {
  write(chunk: Uint8Array): Promise<void> | void;
  close(): Promise<void> | void;
  abort(): Promise<void> | void;
}

export interface RequestOptions {
  /** Stream to disk (or anywhere) instead of collecting the file in memory. */
  sink?: Sink;
  onProgress?: (percent: number) => void;
}

const REASONS: Record<string, string> = {
  forbidden: 'دسترسی به این فایل مجاز نیست.',
  'not-found': 'فایل روی سیستم فرستنده پیدا نشد (ممکن است پاک شده یا در مرورگر دیگری باشد).',
};

/** Fetches the file stored under `key` on `ownerId`'s computer. Resolves with the Blob unless a sink is given. */
export function requestFile(ownerId: string, key: string, opts: RequestOptions = {}): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const session = newId();
    const chunks: Uint8Array[] = [];
    let pc: RTCPeerConnection | null = null;
    let peerTab: string | undefined;
    let remoteSet = false;
    let total = 0;
    let received = 0;
    let mime = '';
    let settled = false;
    let stallTimer: ReturnType<typeof setTimeout>;
    const pendingRemoteIce: RTCIceCandidateInit[] = [];
    const pendingLocalIce: RTCIceCandidateInit[] = [];
    let writeChain: Promise<unknown> = Promise.resolve();

    const finish = (err?: Error, result: Blob | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(stallTimer);
      sessions.delete(session);
      pc?.close();
      if (err) {
        Promise.resolve(opts.sink?.abort()).catch(() => {});
        reject(err);
      } else resolve(result);
    };
    const armStall = (ms: number, message: string) => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => finish(new Error(message)), ms);
    };

    sessions.set(session, (m) => {
      if (m.type === 'reject') return finish(new Error(REASONS[m.reason || ''] || 'فرستنده درخواست را رد کرد.'));
      if (m.type === 'answer' && m.sdp && !peerTab) {
        peerTab = m.fromTab;
        armStall(30000, 'اتصال مستقیم به فرستنده برقرار نشد.');
        pc?.setRemoteDescription(m.sdp).then(() => {
          remoteSet = true;
          for (const c of pendingRemoteIce.splice(0)) pc?.addIceCandidate(c).catch(() => {});
        }, (e) => finish(e));
        for (const c of pendingLocalIce.splice(0)) sendIce(c);
      } else if (m.type === 'ice' && m.candidate && (!peerTab || m.fromTab === peerTab)) {
        if (remoteSet) pc?.addIceCandidate(m.candidate).catch(() => {});
        else pendingRemoteIce.push(m.candidate);
      }
    });

    const sendIce = (candidate: RTCIceCandidateInit) =>
      sendSignal(ownerId, { type: 'ice', session, fromTab: TAB_ID, toTab: peerTab, candidate }).catch(() => {});

    (async () => {
      pc = new RTCPeerConnection({ iceServers: await getIceServers() });
      const ch = pc.createDataChannel('file');
      ch.binaryType = 'arraybuffer';
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const c = e.candidate.toJSON();
        if (peerTab) void sendIce(c);
        else pendingLocalIce.push(c);
      };
      pc.onconnectionstatechange = () => {
        if (pc && ['failed', 'closed'].includes(pc.connectionState)) finish(new Error('اتصال با فرستنده قطع شد.'));
      };
      ch.onmessage = (e) => {
        armStall(30000, 'دریافت فایل متوقف شد (فرستنده آفلاین شده است؟).');
        if (typeof e.data === 'string') {
          const m = JSON.parse(e.data);
          if (m.t === 'meta') {
            total = m.size;
            mime = m.mime || '';
          } else if (m.t === 'done') {
            writeChain
              .then(async () => {
                if (opts.sink) {
                  await opts.sink.close();
                  finish(undefined, null);
                } else finish(undefined, new Blob(chunks as BlobPart[], { type: mime }));
              })
              .catch((err) => finish(err));
          }
          return;
        }
        const chunk = new Uint8Array(e.data as ArrayBuffer);
        received += chunk.length;
        if (opts.sink) {
          const sink = opts.sink;
          writeChain = writeChain.then(() => sink.write(chunk));
        } else chunks.push(chunk);
        if (total) opts.onProgress?.(Math.min(100, Math.round((received / total) * 100)));
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      armStall(20000, 'فرستنده پاسخ نداد. مطمئن شوید فرستنده وارد سامانه است.');
      const delivered = await sendSignal(ownerId, {
        type: 'offer',
        session,
        fromTab: TAB_ID,
        key,
        sdp: pc.localDescription as RTCSessionDescriptionInit,
      });
      if (!delivered) finish(new Error('فرستنده اکنون آنلاین نیست. بعداً دوباره تلاش کنید.'));
    })().catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
  });
}
