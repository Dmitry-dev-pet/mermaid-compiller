import type { StudioActionsDeps } from './actionsContext';
import { createStudioContext } from './actionsContext';
import { createBuildHandler } from './build';
import { createChatHandler } from './chat';
import { createAnalyzeHandler, createFixSyntaxHandler, createRecompileHandler } from './compile';

export const createStudioActions = (deps: StudioActionsDeps) => {
  const ctx = createStudioContext(deps);

  return {
    handleChatMessage: createChatHandler(ctx),
    handleBuildFromPrompt: createBuildHandler(ctx),
    handleRecompile: createRecompileHandler(ctx),
    handleFixSyntax: createFixSyntaxHandler(ctx),
    handleAnalyze: createAnalyzeHandler(ctx),
  };
};
