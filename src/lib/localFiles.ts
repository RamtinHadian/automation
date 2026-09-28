// Files live on the user's own computer (browser IndexedDB), never on the server.
const DB_NAME = 'automation-files';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const putLocalFile = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key)).then(() => undefined);

export const getLocalFile = async (key: string): Promise<Blob | null> =>
  ((await run<Blob | undefined>('readonly', (s) => s.get(key))) as Blob | undefined) ?? null;

export const deleteLocalFile = (key: string) => run('readwrite', (s) => s.delete(key)).then(() => undefined);

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();
