import type { Message, MermaidState, OperationKind } from '../../types';
import type { TimeStepType } from '../../services/history/types';
import type { StudioContext } from './actionsContext';

type FinalizeArgs = {
  meta?: Record<string, unknown>;
  nextMermaid?: Pick<MermaidState, 'code' | 'isValid' | 'errorMessage' | 'errorLine'> | null;
  setCurrentRevisionId?: string | null;
};

export type StudioOperationHelpers = {
  opId: string;
  stepMessages: Message[];
  addStepMessage: (role: Message['role'], content: string, mode?: Message['mode']) => Message;
  logEvent: (args: Parameters<StudioContext['addOperationEvent']>[1]) => void;
  finalizeStep: (status: 'done' | 'error', args?: FinalizeArgs) => Promise<void>;
};

export const runStudioOperation = async <T>(
  ctx: StudioContext,
  args: {
    title: string;
    stepType: TimeStepType;
    notebookBlockIndex?: number | null;
    operationKind?: OperationKind;
    run: (helpers: StudioOperationHelpers) => Promise<T>;
  }
): Promise<T> => {
  const stepMessages: Message[] = [];
  const notebookBlockIndex = args.notebookBlockIndex;
  const opContextId = typeof notebookBlockIndex === 'number' ? `block:${notebookBlockIndex}` : undefined;
  const operationKind = args.operationKind ?? (() => {
    switch (args.stepType) {
      case 'chat':
        return 'chat';
      case 'build':
        return 'build';
      case 'analyze':
        return 'analyze';
      case 'fix':
        return 'fix';
      case 'recompile':
        return 'compile';
      default:
        return undefined;
    }
  })();
  const opId = ctx.startOperation(args.title, opContextId, operationKind);

  const logEvent: StudioOperationHelpers['logEvent'] = (eventArgs) => {
    ctx.addOperationEvent(opId, {
      ...eventArgs,
      blockIndex: typeof notebookBlockIndex === 'number' ? notebookBlockIndex : eventArgs.blockIndex,
    });
  };

  const addStepMessage: StudioOperationHelpers['addStepMessage'] = (role, content, mode) => {
    const msg = ctx.addMessage(role, content, mode);
    stepMessages.push(msg);
    return msg;
  };

  const finalizeStep: StudioOperationHelpers['finalizeStep'] = async (status, finalizeArgs) => {
    ctx.finishOperation(opId, status);
    await ctx.safeRecordTimeStep({
      type: args.stepType,
      messages: stepMessages,
      nextMermaid: finalizeArgs?.nextMermaid ?? null,
      setCurrentRevisionId: finalizeArgs?.setCurrentRevisionId,
      meta: {
        ...(finalizeArgs?.meta ?? {}),
        operationLog: ctx.getOperationLog(opId),
      },
    });
  };

  return args.run({ opId, stepMessages, addStepMessage, logEvent, finalizeStep });
};
