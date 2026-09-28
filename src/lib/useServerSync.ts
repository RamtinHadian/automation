import { useEffect, useRef, useCallback } from 'react';
import { api, CollectionName, ServerState } from './api';
import { User, FileTransfer, AuditLog, SystemSettings, Department } from '../types';

// Writes are serialised so that e.g. a transfer is always stored before its audit log entry.
const queue: { chain: Promise<unknown>; pending: number } = { chain: Promise.resolve(), pending: 0 };

function enqueue(job: () => Promise<unknown>, onError: (e: unknown) => void) {
  queue.pending++;
  queue.chain = queue.chain
    .then(job)
    .catch(onError)
    .finally(() => {
      queue.pending--;
    });
}

export const hasPendingWrites = () => queue.pending > 0;

type Snapshot = Map<string, string>;

interface SyncInput {
  ready: boolean;
  staff: User[];
  departments: Department[];
  transfers: FileTransfer[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
  onError: (e: unknown) => void;
}

/**
 * Mirrors the in-memory app state to the server. Handlers keep mutating React state exactly as
 * before; this hook diffs each collection against what the server last acknowledged and sends the
 * upserts/deletes. `markSynced` records a freshly loaded server state so it is not echoed back.
 */
export function useServerSync({ ready, staff, departments, transfers, auditLogs, settings, onError }: SyncInput) {
  const snaps = useRef<Record<CollectionName, Snapshot>>({
    staff: new Map(),
    departments: new Map(),
    transfers: new Map(),
    audit: new Map(),
    settings: new Map(),
  });
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const fail = useCallback((e: unknown) => onErrorRef.current(e), []);

  const markSynced = useCallback((s: ServerState, mergedSettings: SystemSettings) => {
    const toMap = (items: { id: string }[]) => new Map(items.map((i) => [i.id, JSON.stringify(i)]));
    snaps.current = {
      staff: toMap(s.staff),
      departments: toMap(s.departments),
      transfers: toMap(s.transfers),
      audit: toMap(s.auditLogs),
      settings: new Map([['main', JSON.stringify(mergedSettings)]]),
    };
  }, []);

  const diff = useCallback(
    (name: CollectionName, items: { id: string }[], allowDelete: boolean) => {
      const snap = snaps.current[name];
      const seen = new Set<string>();
      for (const item of items) {
        seen.add(item.id);
        const json = JSON.stringify(item);
        if (snap.get(item.id) === json) continue;
        snap.set(item.id, json);
        enqueue(() => api.upsert(name, item.id, item), fail);
      }
      for (const id of [...snap.keys()]) {
        if (seen.has(id)) continue;
        snap.delete(id);
        if (allowDelete) enqueue(() => api.remove(name, id), fail);
      }
    },
    [fail]
  );

  useEffect(() => {
    if (ready) diff('staff', staff, true);
  }, [ready, staff, diff]);
  useEffect(() => {
    if (ready) diff('departments', departments, true);
  }, [ready, departments, diff]);
  useEffect(() => {
    if (ready) diff('transfers', transfers, true);
  }, [ready, transfers, diff]);
  useEffect(() => {
    // The audit trail is append-only: entries are never deleted server-side.
    if (ready) diff('audit', auditLogs, false);
  }, [ready, auditLogs, diff]);
  useEffect(() => {
    if (!ready) return;
    const json = JSON.stringify(settings);
    if (snaps.current.settings.get('main') === json) return;
    snaps.current.settings.set('main', json);
    enqueue(() => api.upsert('settings', 'main', settings), fail);
  }, [ready, settings, fail]);

  return { markSynced };
}
