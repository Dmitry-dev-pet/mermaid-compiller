import type { MermaidState, Message } from '../../types';
import { requestToPromise, STORE_REVISIONS, STORE_SESSIONS, STORE_STEPS, withTx } from './db';
import type { DiagramRevision, HistorySession, SessionPreview, SessionSettings, SessionSnapshot, StepMeta, TimeStep, TimeStepType } from './types';

export const ACTIVE_SESSION_KEY = 'dc_active_session_id';

const now = () => Date.now();

const newId = () => {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id_${now()}_${Math.random().toString(36).slice(2)}`;
};

export const getActiveSessionId = () => {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
};

export const setActiveSessionId = (id: string) => {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } catch {
    // ignore
  }
};

export const clearActiveSessionId = () => {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // ignore
  }
};

const formatSessionTitle = (createdAt: number) => {
  const iso = new Date(createdAt).toISOString().slice(0, 19).replace('T', ' ');
  return `Project ${iso}`;
};

const normalizeSession = (session: HistorySession): HistorySession => ({
  ...session,
  title: session.title ?? formatSessionTitle(session.createdAt),
  updatedAt: session.updatedAt ?? session.createdAt,
});

export type CreateSessionArgs = {
  title?: string;
  settings?: SessionSettings;
};

export const createSession = async (args: CreateSessionArgs = {}): Promise<HistorySession> => {
  const createdAt = now();
  const session: HistorySession = {
    id: newId(),
    createdAt,
    updatedAt: createdAt,
    title: args.title ?? formatSessionTitle(createdAt),
    nextStepIndex: 0,
    currentRevisionId: null,
    settings: args.settings,
  };

  await withTx([STORE_SESSIONS], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_SESSIONS).put(session));
  });

  setActiveSessionId(session.id);
  return normalizeSession(session);
};

export const getSession = async (sessionId: string): Promise<HistorySession | null> => {
  return withTx([STORE_SESSIONS], 'readonly', async (tx) => {
    const res = await requestToPromise(tx.objectStore(STORE_SESSIONS).get(sessionId));
    const session = (res as HistorySession | undefined) ?? null;
    return session ? normalizeSession(session) : null;
  });
};

export const listSessions = async (): Promise<HistorySession[]> => {
  return withTx([STORE_SESSIONS], 'readonly', async (tx) => {
    const store = tx.objectStore(STORE_SESSIONS);
    const res = await requestToPromise(store.getAll());
    const list = (res as HistorySession[]).map(normalizeSession);
    list.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
    return list;
  });
};

export const renameSession = async (sessionId: string, title: string): Promise<HistorySession | null> => {
  return withTx([STORE_SESSIONS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_SESSIONS);
    const existing = (await requestToPromise(store.get(sessionId))) as HistorySession | undefined;
    if (!existing) return null;
    const updated: HistorySession = {
      ...existing,
      title: title.trim() || existing.title,
      updatedAt: now(),
    };
    await requestToPromise(store.put(updated));
    return normalizeSession(updated);
  });
};

export const updateSessionSettings = async (
  sessionId: string,
  settings: SessionSettings
): Promise<HistorySession | null> => {
  return withTx([STORE_SESSIONS], 'readwrite', async (tx) => {
    const store = tx.objectStore(STORE_SESSIONS);
    const existing = (await requestToPromise(store.get(sessionId))) as HistorySession | undefined;
    if (!existing) return null;
    const updated: HistorySession = {
      ...existing,
      settings,
      updatedAt: now(),
    };
    await requestToPromise(store.put(updated));
    return normalizeSession(updated);
  });
};

export const ensureActiveSession = async (): Promise<HistorySession> => {
  const existing = getActiveSessionId();
  if (existing) {
    const s = await getSession(existing);
    if (s) return s;
  }
  return createSession();
};

export type RecordStepArgs = {
  sessionId: string;
  type: TimeStepType;
  messages: Message[];
  meta?: StepMeta;
  nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
  setCurrentRevisionId?: string | null;
};

export const recordStep = async (
  args: RecordStepArgs
): Promise<{ step: TimeStep; revision: DiagramRevision | null; session: HistorySession }> => {
  return withTx([STORE_SESSIONS, STORE_STEPS, STORE_REVISIONS], 'readwrite', async (tx) => {
    const sessions = tx.objectStore(STORE_SESSIONS);
    const steps = tx.objectStore(STORE_STEPS);
    const revisions = tx.objectStore(STORE_REVISIONS);

    const session = (await requestToPromise(sessions.get(args.sessionId))) as HistorySession | undefined;
    if (!session) throw new Error('History session not found');

    const stepId = newId();
    const createdAt = now();

    const step: TimeStep = {
      id: stepId,
      sessionId: session.id,
      index: session.nextStepIndex,
      type: args.type,
      createdAt,
      messages: args.messages,
      currentRevisionId: session.currentRevisionId,
      meta: args.meta,
    };

    let revision: DiagramRevision | null = null;

    const nextMermaid = args.nextMermaid?.code?.trim() ? args.nextMermaid : null;
    if (nextMermaid) {
      const revisionId = newId();
      revision = {
        id: revisionId,
        sessionId: session.id,
        createdAt,
        createdByStepId: step.id,
        parentRevisionId: session.currentRevisionId,
        mermaid: nextMermaid.code,
        diagnostics: {
          isValid: !!nextMermaid.isValid,
          errorMessage: nextMermaid.errorMessage,
          errorLine: nextMermaid.errorLine,
        },
      };

      step.currentRevisionId = revision.id;
      session.currentRevisionId = revision.id;
    } else if (args.setCurrentRevisionId !== undefined) {
      step.currentRevisionId = args.setCurrentRevisionId;
      session.currentRevisionId = args.setCurrentRevisionId;
    }

    session.nextStepIndex += 1;
    session.updatedAt = createdAt;

    await requestToPromise(steps.put(step));
    if (revision) await requestToPromise(revisions.put(revision));
    await requestToPromise(sessions.put(session));

    return { step, revision, session: normalizeSession(session) };
  });
};

export const updateRevision = async (
  revisionId: string,
  nextMermaid: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'>
): Promise<DiagramRevision | null> => {
  return withTx([STORE_REVISIONS, STORE_SESSIONS], 'readwrite', async (tx) => {
    const revisions = tx.objectStore(STORE_REVISIONS);
    const sessions = tx.objectStore(STORE_SESSIONS);
    const existing = (await requestToPromise(revisions.get(revisionId))) as DiagramRevision | undefined;
    if (!existing) return null;

    const updated: DiagramRevision = {
      ...existing,
      mermaid: nextMermaid.code,
      diagnostics: {
        isValid: !!nextMermaid.isValid,
        errorMessage: nextMermaid.errorMessage,
        errorLine: nextMermaid.errorLine,
      },
    };

    await requestToPromise(revisions.put(updated));
    const session = (await requestToPromise(sessions.get(existing.sessionId))) as HistorySession | undefined;
    if (session) {
      await requestToPromise(sessions.put({ ...session, updatedAt: now() }));
    }
    return updated;
  });
};

export const listSteps = async (sessionId: string): Promise<TimeStep[]> => {
  return withTx([STORE_STEPS], 'readonly', async (tx) => {
    const index = tx.objectStore(STORE_STEPS).index('bySessionIndex');
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);

    return new Promise<TimeStep[]>((resolve, reject) => {
      const out: TimeStep[] = [];
      const req = index.openCursor(range);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out.push(cursor.value as TimeStep);
        cursor.continue();
      };
    });
  });
};

export const getSessionPreview = async (sessionId: string): Promise<SessionPreview | null> => {
  const session = await getSession(sessionId);
  if (!session) return null;
  let lastStep: TimeStep | null = null;
  await withTx([STORE_STEPS], 'readonly', async (tx) => {
    const index = tx.objectStore(STORE_STEPS).index('bySessionIndex');
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    await new Promise<void>((resolve, reject) => {
      const req = index.openCursor(range, 'prev');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        lastStep = cursor.value as TimeStep;
        resolve();
      };
    });
  });

  const lastMessage =
    lastStep?.messages
      ?.slice()
      .reverse()
      .find((msg) => msg.content.trim().length > 0)?.content ?? '';

  return {
    sessionId,
    stepCount: session.nextStepIndex,
    lastStepType: lastStep?.type,
    lastStepAt: lastStep?.createdAt,
    lastMessage: lastMessage || undefined,
  };
};

export const getSessionSnapshot = async (sessionId: string): Promise<SessionSnapshot | null> => {
  const session = await getSession(sessionId);
  if (!session) return null;
  if (!session.currentRevisionId) {
    return { sessionId, code: '', diagnostics: null };
  }
  const revision = await getRevision(session.currentRevisionId);
  return {
    sessionId,
    code: revision?.mermaid ?? '',
    diagnostics: revision?.diagnostics ?? null,
  };
};

export const getRevision = async (revisionId: string): Promise<DiagramRevision | null> => {
  return withTx([STORE_REVISIONS], 'readonly', async (tx) => {
    const res = await requestToPromise(tx.objectStore(STORE_REVISIONS).get(revisionId));
    return (res as DiagramRevision | undefined) ?? null;
  });
};

export const loadActiveSessionState = async () => {
  const session = await ensureActiveSession();
  const steps = await listSteps(session.id);
  const currentRevision = session.currentRevisionId ? await getRevision(session.currentRevisionId) : null;
  return { session, steps, currentRevision };
};

export const loadSessionState = async (sessionId: string) => {
  const session = await getSession(sessionId);
  if (!session) return null;
  setActiveSessionId(session.id);
  const steps = await listSteps(session.id);
  const currentRevision = session.currentRevisionId ? await getRevision(session.currentRevisionId) : null;
  return { session, steps, currentRevision };
};

export const deleteSession = async (sessionId: string): Promise<void> => {
  await withTx([STORE_SESSIONS, STORE_STEPS, STORE_REVISIONS], 'readwrite', async (tx) => {
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
  });
  if (getActiveSessionId() === sessionId) {
    clearActiveSessionId();
  }

  const remaining = await getSession(sessionId);
  if (remaining) {
    await withTx([STORE_SESSIONS], 'readwrite', async (tx) => {
      await requestToPromise(tx.objectStore(STORE_SESSIONS).delete(sessionId));
    });
  }
};
