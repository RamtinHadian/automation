import { useCallback, useEffect, useState } from 'react';
import { FileTransfer } from '../types';
import { getLocalFile, putLocalFile } from './localFiles';
import { requestFile } from './p2p';
import { getServerFile } from './serverFiles';

export interface AttachmentState {
  /** The letter has an attachment (its bytes live on the sender's computer). */
  exists: boolean;
  url: string | null;
  isImage: boolean;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Resolves a letter's attachment to a blob URL: from this computer if present, otherwise directly from the sender's. */
export function useAttachment(letter: FileTransfer | null | undefined, currentUserId: string | undefined): AttachmentState {
  const exists = !!letter?.attachmentFileName;
  const letterId = letter?.id;
  const senderId = letter?.sender.id;
  const [url, setUrl] = useState<string | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!exists || !letterId || !senderId) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    const key = `att:${letterId}`;

    const show = (blob: Blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setIsImage(blob.type.startsWith('image/'));
      setLoading(false);
    };

    (async () => {
      setLoading(true);
      setError(null);
      setUrl(null);
      const local = await getLocalFile(key).catch(() => null);
      if (local) return show(local);
      const stored = await getServerFile(letterId, 'att');
      if (stored) {
        putLocalFile(key, stored).catch(() => {});
        return show(stored);
      }
      if (senderId === currentUserId) throw new Error('فایل پیوست روی این سیستم پیدا نشد.');
      const blob = await requestFile(senderId, key);
      if (!blob) throw new Error('دریافت پیوست ناموفق بود.');
      putLocalFile(key, blob).catch(() => {}); // keep a copy on this computer for next time
      show(blob);
    })().catch((e) => {
      if (cancelled) return;
      setLoading(false);
      setError(e instanceof Error ? e.message : 'دریافت پیوست ناموفق بود.');
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [exists, letterId, senderId, currentUserId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { exists, url, isImage, loading, error, retry };
}
