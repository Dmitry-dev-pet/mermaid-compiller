import type { DiagramRevision, HistorySession, TimeStep } from './types';
import { STORE_REVISIONS, STORE_SESSIONS, STORE_STEPS, requestToPromise, withTx } from './db';
import { generateHistoryId, getSession, listRevisions, listSteps, setActiveSessionId } from './store';

export type SessionBundle = {
  session: HistorySession;
  steps: TimeStep[];
  revisions: DiagramRevision[];
};

export type ProjectBundleFile = {
  schema: 'mermaid-langgraph.project';
  version: 1;
  exportedAt: number;
  bundle: SessionBundle;
};

export type ImportSessionBundleOptions = {
  mode?: 'replace' | 'new';
  setActive?: boolean;
  keepTimestamps?: boolean;
};

const normalizeSessionForSave = (session: HistorySession, steps: TimeStep[], revisions: DiagramRevision[]) => {
  const nextStepIndex = steps.length;
  const hasRevision = session.currentRevisionId
    ? revisions.some((rev) => rev.id === session.currentRevisionId)
    : false;
  return {
    ...session,
    nextStepIndex,
    currentRevisionId: hasRevision ? session.currentRevisionId : null,
    updatedAt: session.updatedAt ?? session.createdAt,
  };
};

const purgeSessionData = async (tx: IDBTransaction, sessionId: string) => {
  const sessions = tx.objectStore(STORE_SESSIONS);
  const steps = tx.objectStore(STORE_STEPS);
  const revisions = tx.objectStore(STORE_REVISIONS);

  const stepsIndex = steps.index('bySessionId');
  const revisionsIndex = revisions.index('bySessionId');

  await new Promise<void>((resolve, reject) => {
    const req = stepsIndex.openCursor(IDBKeyRange.only(sessionId));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
  });

  await new Promise<void>((resolve, reject) => {
    const req = revisionsIndex.openCursor(IDBKeyRange.only(sessionId));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
  });

  await requestToPromise(sessions.delete(sessionId));
};

export const exportSessionBundle = async (sessionId: string): Promise<SessionBundle | null> => {
  const session = await getSession(sessionId);
  if (!session) return null;
  const [steps, revisions] = await Promise.all([listSteps(sessionId), listRevisions(sessionId)]);
  return {
    session,
    steps,
    revisions,
  };
};

export const importSessionBundle = async (
  bundle: SessionBundle,
  options: ImportSessionBundleOptions = {}
): Promise<HistorySession> => {
  const mode = options.mode ?? 'new';
  const keepTimestamps = options.keepTimestamps ?? true;
  const now = Date.now();

  if (mode === 'replace') {
    const sessionToSave = normalizeSessionForSave(
      {
        ...bundle.session,
        createdAt: keepTimestamps ? bundle.session.createdAt : now,
        updatedAt: keepTimestamps ? bundle.session.updatedAt ?? bundle.session.createdAt : now,
      },
      bundle.steps,
      bundle.revisions
    );

    await withTx([STORE_SESSIONS, STORE_STEPS, STORE_REVISIONS], 'readwrite', async (tx) => {
      await purgeSessionData(tx, bundle.session.id);
      await requestToPromise(tx.objectStore(STORE_SESSIONS).put(sessionToSave));
      const stepsStore = tx.objectStore(STORE_STEPS);
      const revisionsStore = tx.objectStore(STORE_REVISIONS);
      for (const step of bundle.steps) {
        await requestToPromise(stepsStore.put(step));
      }
      for (const revision of bundle.revisions) {
        await requestToPromise(revisionsStore.put(revision));
      }
    });

    if (options.setActive) {
      setActiveSessionId(sessionToSave.id);
    }

    return sessionToSave;
  }

  const sessionId = generateHistoryId();
  const stepIdMap = new Map<string, string>();
  const revisionIdMap = new Map<string, string>();

  for (const step of bundle.steps) {
    stepIdMap.set(step.id, generateHistoryId());
  }
  for (const revision of bundle.revisions) {
    revisionIdMap.set(revision.id, generateHistoryId());
  }

  const steps = bundle.steps.map((step) => ({
    ...step,
    id: stepIdMap.get(step.id) ?? step.id,
    sessionId,
    currentRevisionId: step.currentRevisionId ? revisionIdMap.get(step.currentRevisionId) ?? null : null,
    createdAt: keepTimestamps ? step.createdAt : now,
  }));

  const revisions = bundle.revisions.map((revision) => ({
    ...revision,
    id: revisionIdMap.get(revision.id) ?? revision.id,
    sessionId,
    createdByStepId: stepIdMap.get(revision.createdByStepId) ?? revision.createdByStepId,
    parentRevisionId: revision.parentRevisionId ? revisionIdMap.get(revision.parentRevisionId) ?? null : null,
    createdAt: keepTimestamps ? revision.createdAt : now,
  }));

  const sessionToSave = normalizeSessionForSave(
    {
      ...bundle.session,
      id: sessionId,
      createdAt: keepTimestamps ? bundle.session.createdAt : now,
      updatedAt: keepTimestamps ? bundle.session.updatedAt ?? bundle.session.createdAt : now,
      currentRevisionId: bundle.session.currentRevisionId
        ? revisionIdMap.get(bundle.session.currentRevisionId) ?? null
        : null,
    },
    steps,
    revisions
  );

  await withTx([STORE_SESSIONS, STORE_STEPS, STORE_REVISIONS], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_SESSIONS).put(sessionToSave));
    const stepsStore = tx.objectStore(STORE_STEPS);
    const revisionsStore = tx.objectStore(STORE_REVISIONS);
    for (const step of steps) {
      await requestToPromise(stepsStore.put(step));
    }
    for (const revision of revisions) {
      await requestToPromise(revisionsStore.put(revision));
    }
  });

  if (options.setActive) {
    setActiveSessionId(sessionToSave.id);
  }

  return sessionToSave;
};
