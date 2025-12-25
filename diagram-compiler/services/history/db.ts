export const DB_NAME = 'dc_history';
export const DB_VERSION = 2;

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
      const tx = req.transaction;
      if (!tx) return;

      const sessions = db.objectStoreNames.contains(STORE_SESSIONS)
        ? tx.objectStore(STORE_SESSIONS)
        : db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      if (!sessions.indexNames.contains('byCreatedAt')) {
        sessions.createIndex('byCreatedAt', 'createdAt');
      }
      if (!sessions.indexNames.contains('byUpdatedAt')) {
        sessions.createIndex('byUpdatedAt', 'updatedAt');
      }

      const steps = db.objectStoreNames.contains(STORE_STEPS)
        ? tx.objectStore(STORE_STEPS)
        : db.createObjectStore(STORE_STEPS, { keyPath: 'id' });
      if (!steps.indexNames.contains('bySessionId')) {
        steps.createIndex('bySessionId', 'sessionId');
      }
      if (!steps.indexNames.contains('bySessionIndex')) {
        steps.createIndex('bySessionIndex', ['sessionId', 'index'], { unique: true });
      }
      if (!steps.indexNames.contains('bySessionCreatedAt')) {
        steps.createIndex('bySessionCreatedAt', ['sessionId', 'createdAt']);
      }

      const revisions = db.objectStoreNames.contains(STORE_REVISIONS)
        ? tx.objectStore(STORE_REVISIONS)
        : db.createObjectStore(STORE_REVISIONS, { keyPath: 'id' });
      if (!revisions.indexNames.contains('bySessionId')) {
        revisions.createIndex('bySessionId', 'sessionId');
      }
      if (!revisions.indexNames.contains('byCreatedByStepId')) {
        revisions.createIndex('byCreatedByStepId', 'createdByStepId', { unique: true });
      }
      if (!revisions.indexNames.contains('bySessionCreatedAt')) {
        revisions.createIndex('bySessionCreatedAt', ['sessionId', 'createdAt']);
      }
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
