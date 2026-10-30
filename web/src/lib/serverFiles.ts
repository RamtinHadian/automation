import { getToken } from './api';
// Every file that is sent is also kept on the server, so the receiver can fetch it even when the sender's computer is off.
const token = () => getToken() || '';
const auth = () => ({ Authorization: `Bearer ${token()}` });
const url = (id: string, kind: string) => `/api/files/${encodeURIComponent(id)}?kind=${kind}`;

/** Sends the file to the server. Throws with a readable message when it does not work. */
export async function uploadServerFile(id: string, kind: 'main' | 'att', blob: Blob): Promise<void> {
  const res = await fetch(url(id, kind), { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/octet-stream' }, body: blob });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `ذخیره روی سرور ناموفق بود (${res.status}).`);
  }
}

/** The file from the server, or null when the server does not hold it (or may not give it to this person). */
export async function getServerFile(id: string, kind: 'main' | 'att'): Promise<Blob | null> {
  try {
    const res = await fetch(url(id, kind), { headers: auth() });
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** Does the server already hold this file? */
export async function hasServerFile(id: string, kind: 'main' | 'att'): Promise<boolean> {
  try {
    return (await fetch(url(id, kind), { method: 'HEAD', headers: auth() })).ok;
  } catch {
    return true; // unknown: do not try to upload
  }
}

/** The file of a ready-made customer message (administrators only): kept on the server and given out by a public download address. */
export async function uploadMsgFile(id: string, blob: Blob): Promise<void> {
  const res = await fetch(`/api/msgtpl/files/${encodeURIComponent(id)}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/octet-stream' }, body: blob });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `ذخیرهٔ فایل روی سرور ناموفق بود (${res.status}).`);
  }
}

export async function deleteMsgFile(id: string): Promise<void> {
  try {
    await fetch(`/api/msgtpl/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth() });
  } catch { /* the file stays on the server until the next cleanup */ }
}

/** The address that is put into the message: opens without signing in, so the customer can download the file. */
export const msgFileUrl = (id: string, name: string) => `${window.location.origin}/api/pub/f/${encodeURIComponent(id)}/${encodeURIComponent(name || 'file')}`;

/** The PDF of a proforma that is being sent to a customer: kept on the server and opened by a public download address (CRM users). */
export async function uploadProformaFile(id: string, blob: Blob): Promise<void> {
  const res = await fetch(`/api/proforma-share/${encodeURIComponent(id)}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/octet-stream' }, body: blob });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `ذخیرهٔ پیش‌فاکتور روی سرور ناموفق بود (${res.status}).`);
  }
}
