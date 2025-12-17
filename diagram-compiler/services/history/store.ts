import type { MermaidState, Message } from '../../types';
import { requestToPromise, STORE_REVISIONS, STORE_SESSIONS, STORE_STEPS, withTx } from './db';
import type { DiagramRevision, HistorySession, StepMeta, TimeStep, TimeStepType } from './types';

export const ACTIVE_SESSION_KEY = 'dc_active_session_id';

const now = () => Date.now();

const newId = () => {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id_${now()}_${Math.random().toString(36).slice(2)}`;
};

const getActiveSessionId = () => {
  try {
    return localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
};

const setActiveSessionId = (id: string) => {
  try {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
  } catch {
    // ignore
  }
};

export const createSession = async (): Promise<HistorySession> => {
  const session: HistorySession = {
    id: newId(),
    createdAt: now(),
    nextStepIndex: 0,
    currentRevisionId: null,
  };

  await withTx([STORE_SESSIONS], 'readwrite', async (tx) => {
    await requestToPromise(tx.objectStore(STORE_SESSIONS).put(session));
  });

  setActiveSessionId(session.id);
  return session;
};

export const getSession = async (sessionId: string): Promise<HistorySession | null> => {
  return withTx([STORE_SESSIONS], 'readonly', async (tx) => {
    const res = await requestToPromise(tx.objectStore(STORE_SESSIONS).get(sessionId));
    return (res as HistorySession | undefined) ?? null;
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

    await requestToPromise(steps.put(step));
    if (revision) await requestToPromise(revisions.put(revision));
    await requestToPromise(sessions.put(session));

    return { step, revision, session };
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

