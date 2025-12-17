export const DB_NAME = 'dc_history';
export const DB_VERSION = 1;

export const STORE_SESSIONS = 'sessions';
export const STORE_STEPS = 'steps';
export const STORE_REVISIONS = 'revisions';

export const requestToPromise = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

let dbPromise: Promise<IDBDatabase> | null = null;

export const openHistoryDb = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      sessions.createIndex('byCreatedAt', 'createdAt');

      const steps = db.createObjectStore(STORE_STEPS, { keyPath: 'id' });
      steps.createIndex('bySessionId', 'sessionId');
      steps.createIndex('bySessionIndex', ['sessionId', 'index'], { unique: true });
      steps.createIndex('bySessionCreatedAt', ['sessionId', 'createdAt']);

      const revisions = db.createObjectStore(STORE_REVISIONS, { keyPath: 'id' });
      revisions.createIndex('bySessionId', 'sessionId');
      revisions.createIndex('byCreatedByStepId', 'createdByStepId', { unique: true });
      revisions.createIndex('bySessionCreatedAt', ['sessionId', 'createdAt']);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
};

export const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });

export const withTx = async <T>(
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T
): Promise<T> => {
  const db = await openHistoryDb();
  const tx = db.transaction(stores, mode);
  const result = await fn(tx);
  await txDone(tx);
  return result;
};

